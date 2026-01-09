/**
 * Binance Alpha Service
 * 负责从币安API采集Alpha代币的市场数据
 *
 * 功能:
 * 1. 获取币安Alpha代币列表
 * 2. 检查代币是否有期货合约
 * 3. 获取持仓量(OI)数据
 * 4. 获取资金费率(FR)数据
 * 5. 获取K线数据
 * 6. 获取24小时行情统计
 *
 * 创建时间: 2025-10-22
 * Phase: 0 (MVP-Lite)
 */

const axios = require('axios');
const NodeCache = require('node-cache');

/**
 * 标准化代币符号:去掉交易对后缀
 * SOONUSDT → SOON
 * LABBTC → LAB
 * ETHUSDT → ETH
 */
function normalizeTokenSymbol(symbol) {
  if (!symbol) return symbol;
  // 去掉常见交易对后缀
  return symbol.replace(/(USDT|BTC|ETH|BNB|BUSD)$/, '');
}

class BinanceAlphaService {
  constructor() {
    // API基础URL (全部免费，无需认证)
    this.futuresBaseURL = 'https://fapi.binance.com';
    this.spotBaseURL = 'https://api.binance.com';
    this.alphaAPIURL = 'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list';

    // 缓存配置
    this.cache = new NodeCache({
      stdTTL: 30, // 默认30秒 (ExitMonitor需要更实时的价格)
      checkperiod: 10, // 每10秒检查过期
      useClones: false // 性能优化
    });

    // 速率限制配置
    this.rateLimiter = {
      futures: {
        maxRequests: 2400, // 每分钟最大请求数
        currentRequests: 0,
        resetTime: Date.now() + 60000
      },
      spot: {
        maxRequests: 1200,
        currentRequests: 0,
        resetTime: Date.now() + 60000
      },
      alpha: {
        maxRequests: 1200, // Alpha API 限流配置
        currentRequests: 0,
        resetTime: Date.now() + 60000
      }
    };

    console.log('✅ BinanceAlphaService initialized');
  }

  /**
   * 清理和验证符号格式
   * Binance API要求: 只能包含大写字母、数字、-_.，长度1-20
   */
  sanitizeSymbol(symbol) {
    if (!symbol) return null;

    // 转换为大写并移除空格
    const upper = symbol.toString().trim().toUpperCase();

    // 移除非法字符 (只保留 A-Z, 0-9, -, _, .)
    const sanitized = upper.replace(/[^A-Z0-9\-_.]/g, '');

    // 验证长度
    if (sanitized.length === 0 || sanitized.length > 20) {
      return null;
    }

    return sanitized;
  }

  /**
   * 验证符号是否有效
   */
  isValidSymbol(symbol) {
    if (!symbol) return false;
    // Binance API规则: ^[A-Z0-9-_.]{1,20}$
    return /^[A-Z0-9\-_.]{1,20}$/.test(symbol);
  }

  /**
   * 速率限制检查
   */
  async checkRateLimit(apiType = 'futures') {
    const limiter = this.rateLimiter[apiType];
    const now = Date.now();

    // 重置计数器
    if (now >= limiter.resetTime) {
      limiter.currentRequests = 0;
      limiter.resetTime = now + 60000;
    }

    // 检查是否超限
    if (limiter.currentRequests >= limiter.maxRequests) {
      const waitTime = limiter.resetTime - now;
      console.warn(`⚠️ Rate limit reached for ${apiType}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      limiter.currentRequests = 0;
      limiter.resetTime = Date.now() + 60000;
    }

    limiter.currentRequests++;
  }

  /**
   * HTTP请求封装
   */
  async makeRequest(url, params = {}, apiType = 'futures') {
    await this.checkRateLimit(apiType);

    try {
      const response = await axios.get(url, {
        params,
        timeout: 10000,
        headers: {
          'User-Agent': 'AlphaAutoAgent/1.0'
        }
      });
      return response.data;
    } catch (error) {
      // 对于400 -1121 (Invalid symbol)，这是预期的错误（Alpha代币不在Spot/Futures），不输出日志
      const isExpectedError = error.response?.status === 400 && error.response?.data?.code === -1121;

      if (!isExpectedError) {
        console.error(`❌ Request failed: ${url}`, error.message);
        if (error.response) {
          console.error(`   Status: ${error.response.status}`, error.response.data);
        }
      }
      throw error;
    }
  }

  /**
   * 获取真正的 Binance Alpha 代币列表
   * 从 Binance Alpha 官方 API 获取
   */
  async getRealAlphaTokenList() {
    const cacheKey = 'real_alpha_token_list';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('📦 Cache hit: real_alpha_token_list');
      return cached;
    }

    console.log('🔍 Fetching real Alpha token list from Binance...');

    try {
      const response = await axios.get(this.alphaAPIURL, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.data) {
        const tokens = response.data.data.map(token => token.symbol || token.assetCode);
        console.log(`   ✅ Found ${tokens.length} Alpha tokens`);
        this.cache.set(cacheKey, tokens, 3600); // 缓存1小时
        return tokens;
      }

      throw new Error('Invalid response from Alpha API');
    } catch (error) {
      console.error('❌ Failed to fetch Alpha tokens:', error.message);
      // 返回备用列表（一些已知的 Alpha 代币）
      const fallbackTokens = ['EDU', 'ACE', 'NFP', 'XAI', 'MANTA', 'ALT', 'JUP'];
      console.log(`   ⚠️ Using fallback token list (${fallbackTokens.length} tokens)`);
      return fallbackTokens;
    }
  }

  /**
   * 获取所有 Alpha 代币（CEX + DEX，共 431 个）
   * 返回: [{symbol, price, volume24h, marketCap, source: 'CEX'/'DEX', hasFutures}, ...]
   */
  async getAllAlphaTokensIncludingDEX() {
    const cacheKey = 'all_alpha_tokens_dex';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('📦 Cache hit: all_alpha_tokens_dex');
      return cached;
    }

    console.log('🔍 Fetching all Alpha tokens (CEX + DEX)...');

    try {
      // Step 1: 获取 Alpha API 的所有代币数据
      const response = await axios.get(this.alphaAPIURL, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!response.data || !response.data.data) {
        throw new Error('Invalid response from Alpha API');
      }

      const alphaTokens = response.data.data;
      console.log(`   ✅ Found ${alphaTokens.length} Alpha tokens from API`);

      // Step 2: 获取币安 CEX 的交易对
      const spotTickers = await this.makeRequest(
        `${this.spotBaseURL}/api/v3/ticker/24hr`,
        {},
        'spot'
      );

      const cexSymbols = new Set(
        spotTickers
          .filter(t => t.symbol.endsWith('USDT'))
          .map(t => t.symbol.replace('USDT', ''))
      );

      // Step 3: 获取期货合约列表
      const futuresExchange = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/exchangeInfo`,
        {},
        'futures'
      );

      const futuresSymbols = new Set(
        futuresExchange.symbols
          .filter(s => s.status === 'TRADING' && s.contractType === 'PERPETUAL')
          .map(s => s.symbol.replace('USDT', ''))
      );

      // Step 4: 整合所有代币数据
      const allTokens = alphaTokens.map(token => {
        const symbol = token.symbol || token.assetCode;
        const isOnSpot = cexSymbols.has(symbol);
        const hasFutures = futuresSymbols.has(symbol);
        // 修复: 只要有现货或期货，就是CEX token
        const isOnCEX = isOnSpot || hasFutures;

        return {
          symbol,
          name: token.name,
          price: parseFloat(token.price) || 0,
          volume24h: parseFloat(token.volume24h) || 0,
          priceChange24h: parseFloat(token.percentChange24h) || 0,
          marketCap: parseFloat(token.marketCap) || 0,
          holders: parseInt(token.holders) || 0,
          source: isOnCEX ? 'CEX' : 'DEX',
          chain: token.chainName || 'BSC',
          contractAddress: token.contractAddress,
          spotSymbol: isOnSpot ? `${symbol}USDT` : null,
          futuresSymbol: hasFutures ? `${symbol}USDT` : null,
          hasFutures,
          listingCex: token.listingCex || false,
          // 🆕 新增风险分析所需字段
          liquidity: parseFloat(token.liquidity) || 0,
          listingTime: parseInt(token.listingTime) || Date.now(),
          priceHigh24h: parseFloat(token.priceHigh24h) || 0,
          priceLow24h: parseFloat(token.priceLow24h) || 0,
          circulatingSupply: parseFloat(token.circulatingSupply) || 0,
          totalSupply: parseFloat(token.totalSupply) || 0
        };
      });

      // 🔧 过滤 DEX 代币：流动性低于 $300K 的不参与交易
      const MIN_DEX_LIQUIDITY = 300000; // $300K

      const filteredTokens = allTokens.filter(token => {
        // CEX 代币不过滤
        if (token.source === 'CEX') {
          return true;
        }
        // DEX 代币需要流动性 >= $300K
        if (token.liquidity < MIN_DEX_LIQUIDITY) {
          return false;
        }
        return true;
      });

      const cexCount = filteredTokens.filter(t => t.source === 'CEX').length;
      const dexCount = filteredTokens.filter(t => t.source === 'DEX').length;
      const withFutures = filteredTokens.filter(t => t.hasFutures).length;
      const filteredOutCount = allTokens.length - filteredTokens.length;

      console.log(`✅ Processed ${allTokens.length} Alpha tokens:`);
      console.log(`   - ${cexCount} on CEX (${withFutures} with futures)`);
      console.log(`   - ${dexCount} on DEX only (liquidity >= $${(MIN_DEX_LIQUIDITY/1000).toFixed(0)}K)`);
      if (filteredOutCount > 0) {
        console.log(`   - ${filteredOutCount} DEX tokens filtered out (liquidity < $${(MIN_DEX_LIQUIDITY/1000).toFixed(0)}K)`);
      }

      // 缓存1小时
      this.cache.set(cacheKey, filteredTokens, 3600);

      return filteredTokens;

    } catch (error) {
      console.error('❌ Error fetching all Alpha tokens:', error.message);
      return [];
    }
  }

  /**
   * 获取所有 Alpha 代币（现货，包括有无期货的）
   * 返回: [{symbol, spotSymbol, price, volume24h, hasFutures}, ...]
   */
  async getAllAlphaTokens() {
    const cacheKey = 'all_alpha_tokens';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('📦 Cache hit: all_alpha_tokens');
      return cached;
    }

    console.log('🔍 Fetching all Alpha tokens...');

    try {
      // Step 1: 获取真正的 Alpha 代币列表
      const alphaTokens = await this.getRealAlphaTokenList();

      // Step 2: 获取所有现货交易对
      const spotTickers = await this.makeRequest(
        `${this.spotBaseURL}/api/v3/ticker/24hr`,
        {},
        'spot'
      );

      // 筛选 Alpha 代币的 USDT 交易对
      const usdtPairs = spotTickers
        .filter(t => t.symbol.endsWith('USDT'))
        .filter(t => {
          const baseAsset = t.symbol.replace('USDT', '');
          return alphaTokens.includes(baseAsset);
        })
        .map(t => ({
          symbol: t.symbol.replace('USDT', ''),
          spotSymbol: t.symbol,
          price: parseFloat(t.lastPrice),
          volume24h: parseFloat(t.volume),
          priceChange24h: parseFloat(t.priceChangePercent),
          hasFutures: false // 默认没有期货
        }));

      console.log(`   Found ${usdtPairs.length} Alpha USDT pairs`);

      // Step 3: 获取所有期货合约，标记哪些有期货
      const futuresExchange = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/exchangeInfo`,
        {},
        'futures'
      );

      const futuresSymbols = new Set(
        futuresExchange.symbols
          .filter(s => s.status === 'TRADING' && s.contractType === 'PERPETUAL')
          .map(s => s.symbol)
      );

      // Step 4: 标记哪些有期货合约
      usdtPairs.forEach(token => {
        const futuresSymbol = `${token.symbol}USDT`;
        if (futuresSymbols.has(futuresSymbol)) {
          token.hasFutures = true;
          token.futuresSymbol = futuresSymbol;
        }
      });

      const withFutures = usdtPairs.filter(t => t.hasFutures).length;
      const spotOnly = usdtPairs.length - withFutures;

      console.log(`✅ Found ${usdtPairs.length} Alpha tokens (${withFutures} with futures, ${spotOnly} spot-only)`);

      // 缓存1小时
      this.cache.set(cacheKey, usdtPairs, 3600);

      return usdtPairs;

    } catch (error) {
      console.error('❌ Error fetching Alpha tokens:', error.message);
      return [];
    }
  }

  /**
   * 1. 获取所有Alpha代币列表 (有期货合约的)
   * 返回: [{symbol: 'BTC', futuresSymbol: 'BTCUSDT', price: 42500}, ...]
   */
  async getAlphaTokensWithFutures() {
    const cacheKey = 'alpha_tokens_with_futures';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('📦 Cache hit: alpha_tokens_with_futures');
      return cached;
    }

    console.log('🔍 Fetching Alpha tokens with futures...');

    try {
      // Step 1: 获取真正的 Alpha 代币列表
      const alphaTokens = await this.getRealAlphaTokenList();

      // Step 2: 获取所有现货交易对
      const spotTickers = await this.makeRequest(
        `${this.spotBaseURL}/api/v3/ticker/24hr`,
        {},
        'spot'
      );

      // 筛选 Alpha 代币的 USDT 交易对
      const usdtPairs = spotTickers
        .filter(t => t.symbol.endsWith('USDT'))
        .filter(t => {
          const baseAsset = t.symbol.replace('USDT', '');
          return alphaTokens.includes(baseAsset);
        })
        .map(t => ({
          symbol: t.symbol.replace('USDT', ''),
          spotSymbol: t.symbol,
          price: parseFloat(t.lastPrice),
          volume24h: parseFloat(t.volume),
          priceChange24h: parseFloat(t.priceChangePercent)
        }));

      console.log(`   Found ${usdtPairs.length} Alpha USDT pairs`);

      // Step 3: 获取所有期货合约
      const futuresExchange = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/exchangeInfo`,
        {},
        'futures'
      );

      const futuresSymbols = futuresExchange.symbols
        .filter(s => s.status === 'TRADING' && s.contractType === 'PERPETUAL')
        .map(s => s.symbol);

      console.log(`   Found ${futuresSymbols.length} active futures contracts`);

      // Step 4: 交叉匹配
      const alphaTokensWithFutures = usdtPairs
        .filter(token => {
          const futuresSymbol = `${token.symbol}USDT`;
          return futuresSymbols.includes(futuresSymbol);
        })
        .map(token => ({
          ...token,
          futuresSymbol: `${token.symbol}USDT`,
          hasFutures: true
        }));

      console.log(`✅ Found ${alphaTokensWithFutures.length} Alpha tokens with futures`);

      // 缓存1小时
      this.cache.set(cacheKey, alphaTokensWithFutures, 3600);

      return alphaTokensWithFutures;

    } catch (error) {
      console.error('❌ Error fetching Alpha tokens:', error.message);
      return [];
    }
  }

  /**
   * 2. 检查单个代币是否有期货合约
   */
  async checkHasFutures(tokenSymbol) {
    const futuresSymbol = `${tokenSymbol}USDT`;

    try {
      const futuresExchange = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/exchangeInfo`,
        {},
        'futures'
      );

      const exists = futuresExchange.symbols.some(
        s => s.symbol === futuresSymbol && s.status === 'TRADING'
      );

      return { hasFutures: exists, futuresSymbol: exists ? futuresSymbol : null };

    } catch (error) {
      console.error(`❌ Error checking futures for ${tokenSymbol}:`, error.message);
      return { hasFutures: false, futuresSymbol: null };
    }
  }

  /**
   * 3. 获取持仓量 (Open Interest)
   * 返回: { symbol, openInterest, time }
   */
  async getOpenInterest(futuresSymbol) {
    // 验证和清理符号
    const sanitized = this.sanitizeSymbol(futuresSymbol);
    if (!sanitized || !this.isValidSymbol(sanitized)) {
      console.warn(`⚠️ Invalid symbol format for OI: "${futuresSymbol}", skipping...`);
      return null;
    }

    const cacheKey = `oi_${sanitized}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const data = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/openInterest`,
        { symbol: sanitized },
        'futures'
      );

      // 缓存1分钟
      this.cache.set(cacheKey, data, 60);

      return data;

    } catch (error) {
      // 静默处理 -1121 和 -1100
      if (error.response?.status === 400 && (error.response?.data?.code === -1121 || error.response?.data?.code === -1100)) {
        return null;
      }
      console.error(`❌ Error fetching OI for ${sanitized}:`, error.message);
      return null;
    }
  }

  /**
   * 4. 获取持仓量历史数据 (用于计算24h变化)
   * 返回: [{ symbol, sumOpenInterest, sumOpenInterestValue, timestamp }, ...]
   */
  async getOpenInterestHistory(futuresSymbol, period = '1h', limit = 24) {
    // 验证和清理符号
    const sanitized = this.sanitizeSymbol(futuresSymbol);
    if (!sanitized || !this.isValidSymbol(sanitized)) {
      console.warn(`⚠️ Invalid symbol format for OI history: "${futuresSymbol}", skipping...`);
      return [];
    }

    const cacheKey = `oi_hist_${sanitized}_${period}_${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const data = await this.makeRequest(
        `${this.futuresBaseURL}/futures/data/openInterestHist`,
        {
          symbol: sanitized,
          period, // 1h, 4h, 1d
          limit
        },
        'futures'
      );

      // 缓存5分钟
      this.cache.set(cacheKey, data, 300);

      return data;

    } catch (error) {
      // 静默处理 -1121 和 -1100
      if (error.response?.status === 400 && (error.response?.data?.code === -1121 || error.response?.data?.code === -1100)) {
        return [];
      }
      console.error(`❌ Error fetching OI history for ${sanitized}:`, error.message);
      return [];
    }
  }

  /**
   * 5. 获取资金费率 (Funding Rate)
   * 返回: [{ symbol, fundingRate, fundingTime, markPrice }, ...]
   */
  async getFundingRate(futuresSymbol, limit = 10) {
    // 验证和清理符号
    const sanitized = this.sanitizeSymbol(futuresSymbol);
    if (!sanitized || !this.isValidSymbol(sanitized)) {
      console.warn(`⚠️ Invalid symbol format for FR: "${futuresSymbol}", skipping...`);
      return [];
    }

    const cacheKey = `fr_${sanitized}_${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const data = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/fundingRate`,
        {
          symbol: sanitized,
          limit
        },
        'futures'
      );

      // 缓存5分钟
      this.cache.set(cacheKey, data, 300);

      return data;

    } catch (error) {
      // 静默处理 -1121 和 -1100
      if (error.response?.status === 400 && (error.response?.data?.code === -1121 || error.response?.data?.code === -1100)) {
        return [];
      }
      console.error(`❌ Error fetching FR for ${sanitized}:`, error.message);
      return [];
    }
  }

  /**
   * 6. 获取K线数据
   * interval: 1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d, 1w
   * 返回: [[timestamp, open, high, low, close, volume, ...], ...]
   */
  async getKlines(futuresSymbol, interval = '1h', limit = 100) {
    // 验证和清理符号
    const sanitized = this.sanitizeSymbol(futuresSymbol);
    if (!sanitized || !this.isValidSymbol(sanitized)) {
      console.warn(`⚠️ Invalid symbol format for klines: "${futuresSymbol}", skipping...`);
      return [];
    }

    const cacheKey = `klines_${sanitized}_${interval}_${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const data = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/klines`,
        {
          symbol: sanitized,
          interval,
          limit
        },
        'futures'
      );

      // 缓存5分钟
      this.cache.set(cacheKey, data, 300);

      return data;

    } catch (error) {
      // Futures API失败是正常的（Alpha代币不在Futures），使用debug级别日志
      if (error.response?.status === 400 && (error.response?.data?.code === -1121 || error.response?.data?.code === -1100)) {
        // Invalid symbol or illegal characters - 正常情况，Alpha代币不在Futures
        return [];
      }
      console.error(`❌ Error fetching klines for ${sanitized}:`, error.message);
      return [];
    }
  }

  /**
   * 6b. 获取现货K线数据（用于审计）
   * @param {string} symbol - 交易对符号（如 BTCUSDT）
   * @param {string} interval - K线间隔（1m, 5m, 15m, 1h, 4h, 1d）
   * @param {number} limit - 获取数量（默认100）
   * @returns {Array} K线数据数组
   */
  async getSpotKlines(symbol, interval = '1h', limit = 100) {
    // 验证和清理符号
    const sanitized = this.sanitizeSymbol(symbol);
    if (!sanitized || !this.isValidSymbol(sanitized)) {
      console.warn(`⚠️ Invalid symbol format for spot klines: "${symbol}", skipping...`);
      return [];
    }

    const cacheKey = `spot_klines_${sanitized}_${interval}_${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const data = await this.makeRequest(
        `${this.spotBaseURL}/api/v3/klines`,
        {
          symbol: sanitized,
          interval,
          limit
        },
        'spot'
      );

      // 缓存5分钟
      this.cache.set(cacheKey, data, 300);

      return data;

    } catch (error) {
      // Spot API失败是正常的（Alpha代币可能只在Alpha市场），使用debug级别日志
      if (error.response?.status === 400 && (error.response?.data?.code === -1121 || error.response?.data?.code === -1100)) {
        // Invalid symbol or illegal characters - 正常情况，某些Alpha代币不在Spot
        return [];
      }
      console.error(`❌ Error fetching spot klines for ${sanitized}:`, error.message);
      return [];
    }
  }

  /**
   * 7. 获取24小时行情统计
   * 返回: { symbol, priceChange, priceChangePercent, volume, quoteVolume, ... }
   */
  async get24hrTicker(futuresSymbol) {
    // 验证和清理符号
    const sanitized = this.sanitizeSymbol(futuresSymbol);
    if (!sanitized || !this.isValidSymbol(sanitized)) {
      console.warn(`⚠️ Invalid symbol format for 24hr ticker: "${futuresSymbol}", skipping...`);
      return null;
    }

    const cacheKey = `ticker24h_${sanitized}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const data = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/ticker/24hr`,
        { symbol: sanitized },
        'futures'
      );

      // 缓存1分钟
      this.cache.set(cacheKey, data, 60);

      return data;

    } catch (error) {
      // 静默处理 -1121 (Invalid symbol) 和 -1100 (Illegal characters)
      if (error.response?.status === 400 && (error.response?.data?.code === -1121 || error.response?.data?.code === -1100)) {
        return null;
      }
      console.error(`❌ Error fetching 24hr ticker for ${sanitized}:`, error.message);
      return null;
    }
  }

  /**
   * 8. 获取当前价格
   * 返回: { symbol, price, time }
   */
  async getCurrentPrice(futuresSymbol) {
    // 验证和清理符号
    const sanitized = this.sanitizeSymbol(futuresSymbol);
    if (!sanitized || !this.isValidSymbol(sanitized)) {
      console.warn(`⚠️ Invalid symbol format for price: "${futuresSymbol}", skipping...`);
      return null;
    }

    try {
      const data = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/ticker/price`,
        { symbol: sanitized },
        'futures'
      );

      return data;

    } catch (error) {
      // 静默处理 -1121 (Invalid symbol) 和 -1100 (Illegal characters)
      if (error.response?.status === 400 && (error.response?.data?.code === -1121 || error.response?.data?.code === -1100)) {
        return null;
      }
      console.error(`❌ Error fetching price for ${sanitized}:`, error.message);
      return null;
    }
  }

  /**
   * 8.1 获取 BNB/USDT 价格
   * 用于流动性计算时将 WBNB 转换为 USD
   * @returns {number|null} BNB 价格 (USD)
   */
  async getBNBPrice() {
    // 优先从缓存获取
    const cacheKey = 'bnb_price';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(
        `${this.spotBaseURL}/api/v3/ticker/price`,
        { params: { symbol: 'BNBUSDT' }, timeout: 5000 }
      );

      if (response.data && response.data.price) {
        const price = parseFloat(response.data.price);
        // 缓存 60 秒
        this.cache.set(cacheKey, price, 60);
        return price;
      }
      return null;
    } catch (error) {
      console.error(`❌ Error fetching BNB price:`, error.message);
      return null;
    }
  }

  /**
   * 9. 获取市场深度 (Order Book)
   * 返回: { symbol, bids: [[price, qty], ...], asks: [[price, qty], ...] }
   */
  async getOrderBook(futuresSymbol, limit = 20) {
    try {
      const data = await this.makeRequest(
        `${this.futuresBaseURL}/fapi/v1/depth`,
        {
          symbol: futuresSymbol,
          limit
        },
        'futures'
      );

      return data;

    } catch (error) {
      console.error(`❌ Error fetching order book for ${futuresSymbol}:`, error.message);
      return null;
    }
  }

  /**
   * 10. 综合数据获取 (一次性获取所有分析所需数据)
   * 用于AlphaMarketAnalyzer调用
   */
  async getComprehensiveData(futuresSymbol) {
    console.log(`📊 Fetching comprehensive data for ${futuresSymbol}...`);

    try {
      // 🔧 Step 1: 检查是否为 Alpha 代币
      const baseSymbol = futuresSymbol.replace('USDT', '');
      const alphaId = await this.findAlphaIdBySymbol(baseSymbol);

      // 🔧 Step 2: 如果是 Alpha 代币,使用 Alpha API 获取价格
      if (alphaId) {
        console.log(`   ✅ ${baseSymbol} is an Alpha token (ID: ${alphaId}), using Alpha API...`);

        // 🔧 优先使用1分钟K线获取最新实时价格（减少延迟）
        const alphaKlines1m = await this.getAlphaKlines(baseSymbol, '1m', 1);
        const alphaKlines1h = await this.getAlphaKlines(baseSymbol, '1h', 100);
        const alphaKlines4h = await this.getAlphaKlines(baseSymbol, '4h', 50);

        // 获取最新价格（优先使用1分钟K线）
        const latestKline = alphaKlines1m && alphaKlines1m.length > 0
          ? alphaKlines1m[alphaKlines1m.length - 1]
          : (alphaKlines1h && alphaKlines1h.length > 0 ? alphaKlines1h[alphaKlines1h.length - 1] : null);

        // 🔧 修复: Alpha K线数据可能是数组格式 [time, open, high, low, close, volume]
        // 或者对象格式 { c: close, o: open, ... }
        let currentPrice = 0;

        if (latestKline) {
          if (Array.isArray(latestKline)) {
            // 数组格式: [time, open, high, low, close, volume, ...]
            currentPrice = parseFloat(latestKline[4]) || 0; // close price is at index 4
          } else if (typeof latestKline === 'object') {
            // 对象格式: 尝试多个可能的字段名
            currentPrice = parseFloat(latestKline.c || latestKline.close || latestKline.closePrice || 0);
          }

          // 打印K线时间，方便调试延迟问题
          const klineTime = Array.isArray(latestKline) ? latestKline[0] : latestKline.t;
          const klineDate = new Date(parseInt(klineTime));
          console.log(`   📊 [DEBUG] 使用${alphaKlines1m && alphaKlines1m.length > 0 ? '1分钟' : '1小时'}K线 | 时间: ${klineDate.toISOString()} | 收盘价: $${currentPrice}`);
        }

        console.log(`   ✅ Alpha token ${baseSymbol} current price: $${currentPrice}`);

        // 获取 Alpha 代币元数据
        const alphaTokenData = await this.getAllAlphaTokensIncludingDEX();
        const tokenData = alphaTokenData.find(t => t.symbol === baseSymbol);

        let marketCap = null;
        let contractAddress = null;
        let totalHolders = undefined;
        let circulatingSupply = undefined;
        let totalSupply = undefined;
        let circulationRatio = undefined;

        if (tokenData) {
          if (tokenData.marketCap) marketCap = parseFloat(tokenData.marketCap);
          if (tokenData.holders) totalHolders = parseInt(tokenData.holders);
          if (tokenData.circulatingSupply) circulatingSupply = parseFloat(tokenData.circulatingSupply);
          if (tokenData.totalSupply) totalSupply = parseFloat(tokenData.totalSupply);
          if (tokenData.contractAddress) contractAddress = tokenData.contractAddress;

          if (circulatingSupply && totalSupply && totalSupply > 0) {
            circulationRatio = (circulatingSupply / totalSupply) * 100;
          }
        }

        // 🔧 FIX: Alpha 代币也可能有期货合约，需要检查并获取 OI/FR 数据
        let openInterestData = { current: 0, change24h: 0, history: [] };
        let fundingRateData = { current: 0, history: [] };

        // 检查该 Alpha 代币是否有期货合约
        const hasFutures = tokenData?.hasFutures || false;

        if (hasFutures) {
          console.log(`   📊 ${baseSymbol} has futures contract, fetching OI/FR data...`);

          try {
            // 并行获取期货数据
            const [currentOI, oiHistory, fundingRates] = await Promise.all([
              this.getOpenInterest(futuresSymbol),
              this.getOpenInterestHistory(futuresSymbol, '1h', 24),
              this.getFundingRate(futuresSymbol, 10)
            ]);

            // 计算 OI 变化
            let oiChange24h = 0;
            if (oiHistory && oiHistory.length >= 2) {
              const latestOI = parseFloat(oiHistory[oiHistory.length - 1].sumOpenInterest);
              const oldestOI = parseFloat(oiHistory[0].sumOpenInterest);
              if (oldestOI > 0) {
                oiChange24h = ((latestOI - oldestOI) / oldestOI * 100);
              }
            }

            // 获取最新资金费率
            const latestFR = fundingRates && fundingRates.length > 0
              ? parseFloat(fundingRates[fundingRates.length - 1].fundingRate)
              : 0;

            openInterestData = {
              current: parseFloat(currentOI?.openInterest || 0),
              change24h: parseFloat(oiChange24h.toFixed(2)),
              history: oiHistory || []
            };

            fundingRateData = {
              current: latestFR,
              history: fundingRates || []
            };

            console.log(`   ✅ OI: ${openInterestData.current}, OI Change 24h: ${openInterestData.change24h}%, FR: ${(fundingRateData.current * 100).toFixed(4)}%`);

          } catch (error) {
            console.warn(`   ⚠️ Failed to fetch futures data for ${baseSymbol}: ${error.message}`);
          }
        } else {
          console.log(`   ℹ️ ${baseSymbol} is DEX-only, no OI/FR data available`);
        }

        return {
          symbol: futuresSymbol,
          currentPrice: currentPrice,

          // OI/FR 数据（如果有期货合约则获取真实数据）
          openInterest: openInterestData,
          fundingRate: fundingRateData,

          // K线数据
          klines: {
            '1h': alphaKlines1h || [],
            '4h': alphaKlines4h || []
          },

          // 24h统计 (从K线计算)
          ticker24h: latestKline ? {
            priceChange: parseFloat(latestKline.close) - parseFloat(latestKline.open),
            priceChangePercent: ((parseFloat(latestKline.close) - parseFloat(latestKline.open)) / parseFloat(latestKline.open) * 100).toFixed(2),
            volume: parseFloat(latestKline.volume)
          } : {},

          // 市值数据
          marketCap: marketCap,
          contractAddress: contractAddress,
          totalHolders: totalHolders,
          circulatingSupply: circulatingSupply,
          totalSupply: totalSupply,
          circulationRatio: circulationRatio,

          // 标记为 Alpha 代币
          isAlphaToken: true,
          alphaId: alphaId,
          hasFutures: hasFutures,

          timestamp: new Date().toISOString()
        };
      }

      // 🔧 Step 3: 非 Alpha 代币,使用原有的期货 API 逻辑
      console.log(`   📊 ${futuresSymbol} is a regular futures token, using Futures API...`);

      const [
        currentOI,
        oiHistory,
        fundingRates,
        klines1h,
        klines4h,
        ticker24h,
        currentPrice
      ] = await Promise.all([
        this.getOpenInterest(futuresSymbol),
        this.getOpenInterestHistory(futuresSymbol, '1h', 24),
        this.getFundingRate(futuresSymbol, 10),
        this.getKlines(futuresSymbol, '1h', 100),
        this.getKlines(futuresSymbol, '4h', 50),
        this.get24hrTicker(futuresSymbol),
        this.getCurrentPrice(futuresSymbol)
      ]);

      // 计算OI变化
      let oiChange24h = 0;
      if (oiHistory && oiHistory.length >= 2) {
        const latestOI = parseFloat(oiHistory[oiHistory.length - 1].sumOpenInterest);
        const oldestOI = parseFloat(oiHistory[0].sumOpenInterest);
        oiChange24h = ((latestOI - oldestOI) / oldestOI * 100).toFixed(2);
      }

      // 获取最新资金费率
      const latestFR = fundingRates && fundingRates.length > 0
        ? parseFloat(fundingRates[fundingRates.length - 1].fundingRate)
        : 0;

      // 尝试从Alpha API获取市值数据和持仓分布
      let marketCap = null;
      let top10HoldersPercent = undefined;
      let top10Change24h = undefined;
      let contractAddress = null;
      let totalHolders = undefined;
      let circulatingSupply = undefined;
      let totalSupply = undefined;
      let circulationRatio = undefined;

      try {
        const baseSymbol = futuresSymbol.replace('USDT', '');
        const alphaTokens = await this.getAllAlphaTokensIncludingDEX();
        const tokenData = alphaTokens.find(t => t.symbol === baseSymbol);

        if (tokenData) {
          // Extract all available token metrics
          if (tokenData.marketCap) {
            marketCap = parseFloat(tokenData.marketCap);
          }

          if (tokenData.holders) {
            totalHolders = parseInt(tokenData.holders);
          }

          if (tokenData.circulatingSupply) {
            circulatingSupply = parseFloat(tokenData.circulatingSupply);
          }

          if (tokenData.totalSupply) {
            totalSupply = parseFloat(tokenData.totalSupply);
          }

          // Calculate circulation ratio
          if (circulatingSupply && totalSupply && totalSupply > 0) {
            circulationRatio = (circulatingSupply / totalSupply) * 100;
          }

          // Get Top 10 holders data if contract address available
          if (tokenData.contractAddress) {
            contractAddress = tokenData.contractAddress;

            // Temporarily disable Moralis API due to data format issues
            // TODO: Fix Moralis API data parsing in future update

            // Use estimation based on circulation ratio and holder count
            if (top10HoldersPercent === undefined && circulationRatio !== undefined && totalHolders) {
              if (circulationRatio < 30 && totalHolders < 5000) {
                top10HoldersPercent = 80; // Estimate: highly centralized
              } else if (circulationRatio < 50 && totalHolders < 10000) {
                top10HoldersPercent = 65; // Estimate: moderately centralized
              } else {
                top10HoldersPercent = 45; // Estimate: relatively decentralized
              }

              console.log(`   📊 Estimated Top 10: ~${top10HoldersPercent}% (${totalHolders} holders, ${circulationRatio.toFixed(1)}% circulation)`);
            }
          }
        }
      } catch (error) {
        console.warn(`   ⚠️  Could not fetch additional data for ${futuresSymbol}:`, error.message);
      }

      return {
        symbol: futuresSymbol,
        currentPrice: parseFloat(currentPrice?.price || 0),

        // OI数据
        openInterest: {
          current: parseFloat(currentOI?.openInterest || 0),
          change24h: parseFloat(oiChange24h),
          history: oiHistory || []
        },

        // FR数据
        fundingRate: {
          current: latestFR,
          history: fundingRates || []
        },

        // K线数据
        klines: {
          '1h': klines1h || [],
          '4h': klines4h || []
        },

        // 24h统计
        ticker24h: ticker24h || {},

        // 市值数据
        marketCap: marketCap,

        // 持仓分布数据
        top10HoldersPercent: top10HoldersPercent,
        top10Change24h: top10Change24h,
        totalHolders: totalHolders,
        circulatingSupply: circulatingSupply,
        totalSupply: totalSupply,
        circulationRatio: circulationRatio,
        contractAddress: contractAddress,

        // 时间戳
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error fetching comprehensive data for ${futuresSymbol}:`, error.message);
      return null;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(pattern) {
    if (pattern) {
      const keys = this.cache.keys().filter(k => k.includes(pattern));
      keys.forEach(k => this.cache.del(k));
      console.log(`🗑️ Cleared ${keys.length} cache entries matching: ${pattern}`);
    } else {
      this.cache.flushAll();
      console.log('🗑️ Cleared all cache');
    }
  }

  /**
   * 获取Top 10持仓占比数据（使用Moralis API）
   * @param {string} contractAddress - Token contract address on BSC
   * @returns {Object} {top10Percent, top10Change24h, holderDistribution}
   */
  async getTop10HoldersData(contractAddress) {
    const cacheKey = `top10_holders_${contractAddress}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const moralisKey = process.env.MORALIS_KEY;
      if (!moralisKey) {
        console.warn('⚠️  MORALIS_KEY not configured, skipping Top 10 holders data');
        return null;
      }

      // Get token holders from Moralis (v2.2 API)
      const response = await axios.get(
        `https://deep-index.moralis.io/api/v2.2/erc20/${contractAddress}/owners`,
        {
          headers: {
            'X-API-Key': moralisKey,
            'accept': 'application/json'
          },
          params: {
            chain: 'bsc',
            order: 'DESC' // Descending order by balance
          },
          timeout: 15000
        }
      );

      if (!response.data || !response.data.result) {
        return null;
      }

      const holders = response.data.result;

      // Get decimals and total supply (already in raw format)
      const decimals = parseInt(response.data.decimals) || 18;
      const totalSupplyRaw = response.data.total_supply || 1;

      // Calculate top 10 percentage (balance is in raw format, need to normalize)
      let top10Total = 0;
      holders.forEach(holder => {
        const balanceRaw = parseFloat(holder.balance || 0);
        top10Total += balanceRaw;
      });

      // Both are in raw format, so direct division is correct
      const top10Percent = (top10Total / totalSupplyRaw) * 100;

      // Sanity check: if > 100%, something is wrong
      if (top10Percent > 100) {
        console.warn(`   ⚠️  Invalid Top 10 calculation: ${top10Percent.toFixed(2)}%, using estimation instead`);
        return null; // Fall back to estimation
      }

      // Try to get 24h change (compare with cached data from 24h ago)
      const cacheKey24h = `top10_holders_24h_${contractAddress}`;
      const cached24h = this.cache.get(cacheKey24h);

      let top10Change24h = 0;
      if (cached24h) {
        top10Change24h = top10Percent - cached24h.top10Percent;
      }

      // Save current data for 24h comparison (cache for 25 hours)
      const data = {
        top10Percent,
        top10Change24h,
        holderDistribution: holders.slice(0, 5).map(h => ({
          address: h.owner_address,
          percent: (parseFloat(h.balance) / totalSupplyRaw * 100).toFixed(2)
        })),
        timestamp: new Date().toISOString()
      };

      this.cache.set(cacheKey, data, 300); // 5 min cache
      this.cache.set(cacheKey24h, { top10Percent }, 90000); // 25 hour cache for comparison

      console.log(`   📊 Top 10 Holders: ${top10Percent.toFixed(2)}%${top10Change24h !== 0 ? `, 24h change: ${top10Change24h > 0 ? '+' : ''}${top10Change24h.toFixed(2)}%` : ''}`);

      return data;

    } catch (error) {
      console.warn(`⚠️  Moralis API failed for ${contractAddress}, trying BSCScan...`);

      // Fallback: Try BSCScan API
      try {
        const bscScanKey = process.env.BSCSCAN_API_KEY;
        if (!bscScanKey) {
          console.warn('⚠️  BSCSCAN_API_KEY not configured');
          return null;
        }

        // BSCScan doesn't provide top holders directly, return limited data
        console.log('   ℹ️  Using limited holder data (BSCScan fallback)');

        // Return null for now, can be enhanced with alternative data sources
        return null;

      } catch (fallbackError) {
        console.error(`❌ All APIs failed for ${contractAddress}`);
        return null;
      }
    }
  }

  /**
   * ============================================
   * Binance Alpha API Methods (新代币上市专区)
   * ============================================
   */

  /**
   * 获取 Binance Alpha 代币列表
   * 返回所有 Alpha 代币及其 alphaId 映射
   */
  async getAlphaTokenList() {
    const cacheKey = 'alpha_token_list';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(
        'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list',
        { timeout: 10000 }
      );

      const tokens = response.data?.data || [];

      // 缓存 30 分钟（token 列表不会频繁变化）
      this.cache.set(cacheKey, tokens, 1800);

      console.log(`✅ Fetched ${tokens.length} Alpha tokens`);
      return tokens;

    } catch (error) {
      console.error(`❌ Error fetching Alpha token list:`, error.message);
      return [];
    }
  }

  /**
   * 根据代币符号查找 Alpha ID
   * @param {string} symbol - 代币符号（如 GATA, WOD）
   * @returns {string|null} alphaId (如 ALPHA_175) 或 null
   */
  async findAlphaIdBySymbol(symbol) {
    try {
      const tokens = await this.getAlphaTokenList();

      if (!tokens || tokens.length === 0) {
        return null;
      }

      // 查找匹配的代币
      const token = tokens.find(t =>
        t.symbol?.toUpperCase() === symbol.toUpperCase()
      );

      if (token && token.alphaId) {
        console.log(`   ✅ Found Alpha ID for ${symbol}: ${token.alphaId}`);
        return token.alphaId;
      }

      return null;

    } catch (error) {
      console.error(`❌ Error finding Alpha ID for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * 获取 Binance Alpha K线数据
   * @param {string} symbol - 代币符号（如 GATA）
   * @param {string} interval - K线间隔（1m, 5m, 15m, 1h, 4h, 1d）
   * @param {number} limit - 获取数量（默认24，最大1500）
   * @returns {Array} K线数据数组（格式同 Spot/Futures API）
   */
  async getAlphaKlines(symbol, interval = '1h', limit = 24) {
    const cacheKey = `alpha_klines_${symbol}_${interval}_${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // 1. 查找 Alpha ID
      const alphaId = await this.findAlphaIdBySymbol(symbol);

      if (!alphaId) {
        console.warn(`   ⚠️  ${symbol} not found in Alpha token list`);
        return [];
      }

      // 2. 构造交易对符号（如 ALPHA_175USDT）
      const alphaSymbol = `${alphaId}USDT`;

      // 3. 请求 K线数据
      const response = await axios.get(
        'https://www.binance.com/bapi/defi/v1/public/alpha-trade/klines',
        {
          params: {
            symbol: alphaSymbol,
            interval: interval,
            limit: limit
          },
          timeout: 10000
        }
      );

      const klines = response.data?.data || [];

      if (!klines || klines.length === 0) {
        console.warn(`   ⚠️  No Alpha klines data for ${symbol} (${alphaSymbol})`);
        return [];
      }

      // 🔧 调试: 打印 API 响应结构
      console.log(`   ✅ Fetched ${klines.length} Alpha klines for ${symbol} (${alphaSymbol})`);
      console.log(`   📊 [DEBUG] Alpha K线 API 响应示例:`, JSON.stringify(klines[klines.length - 1]));

      // 缓存 5 分钟
      this.cache.set(cacheKey, klines, 300);

      return klines;

    } catch (error) {
      console.error(`❌ Error fetching Alpha klines for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * 批量获取实时价格（用于信号列表刷新）
   * @param {Array<string>} symbols - 代币符号数组 ['BTCUSDT', 'ETHUSDT', ...]
   * @returns {Object} - { BTCUSDT: 50000, ETHUSDT: 3000, ... }
   */
  async getBatchRealtimePrices(symbols) {
    if (!symbols || symbols.length === 0) {
      return {};
    }

    console.log(`💰 Fetching realtime prices for ${symbols.length} symbols...`);

    const results = {};
    const uncachedSymbols = [];

    // 检查缓存（使用1分钟缓存key）
    for (const symbol of symbols) {
      const cacheKey = `realtime_price_${symbol}`;
      const cachedPrice = this.cache.get(cacheKey);

      if (cachedPrice !== undefined) {
        results[symbol] = cachedPrice;
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    if (uncachedSymbols.length > 0) {
      console.log(`   📡 Fetching ${uncachedSymbols.length} uncached prices from Binance...`);

      // 🔧 FIX: 使用批处理代替p-limit（避免额外依赖）
      // 分批处理，每批10个并发
      const batchSize = 10;
      const batches = [];

      for (let i = 0; i < uncachedSymbols.length; i += batchSize) {
        batches.push(uncachedSymbols.slice(i, i + batchSize));
      }

      let fetchedCount = 0;

      for (const batch of batches) {
        const fetchPromises = batch.map(async (symbol) => {
          try {
            const priceData = await this.getCurrentPrice(symbol);
            if (priceData && priceData.price) {
              // 🔧 FIX: 提取price数值，getCurrentPrice返回的是对象{symbol, price, time}
              const priceValue = parseFloat(priceData.price);
              // 缓存1分钟
              this.cache.set(`realtime_price_${symbol}`, priceValue, 60);
              return { symbol, price: priceValue };
            }
            return { symbol, price: null };
          } catch (error) {
            console.error(`   ❌ Error fetching price for ${symbol}:`, error.message);
            return { symbol, price: null };
          }
        });

        const fetchedPrices = await Promise.all(fetchPromises);

        // 合并结果
        fetchedPrices.forEach(({ symbol, price }) => {
          if (price !== null) {
            results[symbol] = price;
            fetchedCount++;
          }
        });
      }

      console.log(`   ✅ Fetched ${fetchedCount} new prices`);
    } else {
      console.log(`   ✅ All prices from cache`);
    }

    return results;
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      keys: this.cache.keys().length,
      stats: this.cache.getStats()
    };
  }

  /**
   * 🆕 获取单个代币的实时价格
   * @param {string} tokenSymbol - 代币符号 (如 'BEAT', 'GAIN')
   * @param {string} chain - 链名称 (如 'BSC', 'Base')
   * @returns {number|null} 实时价格，如果获取失败返回 null
   */
  async getTokenRealtimePrice(tokenSymbol, chain = 'BSC') {
    try {
      // 🔧 标准化代币符号:去掉交易对后缀
      const baseSymbol = normalizeTokenSymbol(tokenSymbol);
      console.log(`\n🔍 查询实时价格: ${tokenSymbol} → ${baseSymbol} (${chain})`);

      // ✅ 优先方案: 优先尝试 Alpha K线 API (大部分代币都是Alpha代币)
      try {
        // 🔧 使用1分钟K线获取最新价格（已包含正确的API调用和缓存逻辑）
        const klines = await this.getAlphaKlines(baseSymbol, '1m', 1);

        if (klines && klines.length > 0) {
          const latestKline = klines[klines.length - 1];
          let currentPrice = 0;

          // 解析K线数据（数组或对象格式）
          if (Array.isArray(latestKline)) {
            currentPrice = parseFloat(latestKline[4]) || 0; // close price at index 4
          } else if (typeof latestKline === 'object') {
            currentPrice = parseFloat(latestKline.c || latestKline.close || latestKline.closePrice || 0);
          }

          if (currentPrice > 0) {
            const klineTime = Array.isArray(latestKline) ? latestKline[0] : latestKline.t;
            const klineDate = new Date(parseInt(klineTime));
            console.log(`   📊 [Alpha 1分钟K线] ${baseSymbol} | 时间: ${klineDate.toISOString()} | 价格: $${currentPrice.toFixed(8)}`);
            return currentPrice;
          }
        }

        // Alpha K线数据为空，说明不是Alpha代币，尝试CEX
        console.log(`   ℹ️ 不是Alpha代币，尝试CEX现货市场...`);
      } catch (error) {
        console.log(`   ⚠️ Alpha K线获取失败: ${error.message}，尝试CEX...`);
      }

      // ✅ 备用方案1: 从CEX现货市场获取价格（非Alpha代币）
      try {
        const spotSymbol = `${baseSymbol}USDT`;
        const ticker = await this.makeRequest(
          `${this.spotBaseURL}/api/v3/ticker/price`,
          { symbol: spotSymbol },
          'spot'
        );
        const price = parseFloat(ticker.price);
        console.log(`   📊 [CEX现货] ${spotSymbol} 价格: $${price.toFixed(8)}`);
        return price > 0 ? price : null;
      } catch (error) {
        console.log(`   ⚠️ CEX ticker 获取失败: ${error.message}`);
      }

      // ✅ 备用方案2: 从缓存的代币列表获取（仅当所有API都失败时）
      console.log(`   ⚠️ 所有实时API失败，使用缓存备用方案...`);
      const allTokens = await this.getAllAlphaTokensIncludingDEX();
      const token = allTokens.find(t =>
        t.symbol === baseSymbol &&
        (!chain || t.chain === chain)
      );

      if (token && token.price) {
        const price = parseFloat(token.price);
        console.log(`   📊 [缓存备用] ${tokenSymbol} 价格: $${price.toFixed(8)}`);
        return price > 0 ? price : null;
      }

      console.log(`   ❌ 未找到代币: ${baseSymbol} (${chain})`);
      return null;

    } catch (error) {
      console.error(`   ❌ 获取 ${tokenSymbol} 实时价格失败:`, error.message);
      return null;
    }
  }
}

module.exports = new BinanceAlphaService();

/**
 * DexScreener API Service
 * 用于获取 DEX 代币的价格数据
 *
 * API 文档: https://docs.dexscreener.com/api/reference
 * 免费使用，无需 API Key
 */

const axios = require('axios');

class DexScreenerService {
  constructor() {
    this.baseURL = 'https://api.dexscreener.com/latest';
    this.cache = new Map();
    this.cacheTTL = 300000; // 5分钟缓存
  }

  /**
   * 搜索代币信息
   * @param {string} query - 代币符号或地址
   * @returns {Array} 代币对信息数组
   */
  async searchToken(query) {
    const cacheKey = `search_${query}`;
    const cached = this.getCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.get(`${this.baseURL}/dex/search`, {
        params: { q: query },
        timeout: 10000
      });

      const pairs = response.data?.pairs || [];
      this.setCache(cacheKey, pairs);

      console.log(`   📊 DexScreener found ${pairs.length} pairs for ${query}`);
      return pairs;

    } catch (error) {
      console.error(`❌ DexScreener search failed for ${query}:`, error.message);
      return [];
    }
  }

  /**
   * 获取代币的完整池子信息（用于白名单更新）
   * @param {string} tokenSymbol - 代币符号
   * @param {string} contractAddress - 合约地址（可选，用于精确匹配）
   * @returns {Object|null} { pairAddress, dexId, chainId, liquidity, volume24h, txns, pairCreatedAt }
   */
  async getPoolInfo(tokenSymbol, contractAddress = null) {
    try {
      // 1. 搜索代币对 (优先使用合约地址)
      const pairs = await this.searchToken(contractAddress || tokenSymbol);

      if (!pairs || pairs.length === 0) {
        console.warn(`   ⚠️  DexScreener: No pairs found for ${tokenSymbol}`);
        return null;
      }

      // 2. 选择最佳交易对
      const bestPair = this.selectBestPair(pairs, tokenSymbol);

      if (!bestPair) {
        console.warn(`   ⚠️  DexScreener: No valid pair for ${tokenSymbol}`);
        return null;
      }

      // 3. 提取完整池子信息
      const result = {
        pairAddress: bestPair.pairAddress,
        dexId: bestPair.dexId,
        chainId: bestPair.chainId,
        liquidity: bestPair.liquidity?.usd || 0,
        volume24h: bestPair.volume?.h24 || 0,
        priceUsd: parseFloat(bestPair.priceUsd) || 0,
        // 交易次数数据
        txnBuys24h: bestPair.txns?.h24?.buys || 0,
        txnSells24h: bestPair.txns?.h24?.sells || 0,
        txnTotal24h: (bestPair.txns?.h24?.buys || 0) + (bestPair.txns?.h24?.sells || 0),
        // 池子创建时间
        pairCreatedAt: bestPair.pairCreatedAt || null
      };

      console.log(`   ✅ DexScreener pool info for ${tokenSymbol}:`);
      console.log(`      Pool: ${result.pairAddress?.slice(0, 10)}...`);
      console.log(`      DEX: ${result.dexId}, Chain: ${result.chainId}`);
      console.log(`      Liquidity: $${result.liquidity.toLocaleString()}`);
      console.log(`      Volume 24h: $${result.volume24h.toLocaleString()}`);
      console.log(`      Txns 24h: ${result.txnTotal24h} (Buy: ${result.txnBuys24h}, Sell: ${result.txnSells24h})`);

      return result;

    } catch (error) {
      console.error(`❌ DexScreener error for ${tokenSymbol}:`, error.message);
      return null;
    }
  }

  /**
   * 获取代币的历史价格数据（模拟24小时K线）
   * 注意: DexScreener 不提供历史K线，我们使用当前价格和24h变化估算
   *
   * @param {string} tokenSymbol - 代币符号（如 GATA, WOD）
   * @returns {Object|null} { highPrice, lowPrice, currentPrice, pairAddress, chainId }
   */
  async getTokenPriceData(tokenSymbol) {
    try {
      // 1. 搜索代币对
      const pairs = await this.searchToken(tokenSymbol);

      if (!pairs || pairs.length === 0) {
        console.warn(`   ⚠️  DexScreener: No pairs found for ${tokenSymbol}`);
        return null;
      }

      // 2. 选择最佳交易对（按流动性和交易量排序）
      const bestPair = this.selectBestPair(pairs, tokenSymbol);

      if (!bestPair) {
        console.warn(`   ⚠️  DexScreener: No valid pair for ${tokenSymbol}`);
        return null;
      }

      // 3. 提取价格数据
      const priceUsd = parseFloat(bestPair.priceUsd);
      const priceChange24h = parseFloat(bestPair.priceChange?.h24 || 0);

      if (!priceUsd || isNaN(priceUsd)) {
        console.warn(`   ⚠️  DexScreener: Invalid price for ${tokenSymbol}`);
        return null;
      }

      // 4. 估算24小时高低价
      // 使用当前价格和24h变化百分比计算
      const change24hMultiplier = 1 + (priceChange24h / 100);
      const estimatedLowPrice = priceUsd / change24hMultiplier; // 24小时前价格

      // 假设最高价在当前价格的基础上有一定波动
      const volatility = Math.abs(priceChange24h) * 0.3; // 30%的波动范围
      const estimatedHighPrice = priceUsd * (1 + (volatility / 100));

      const result = {
        highPrice: Math.max(priceUsd, estimatedHighPrice, estimatedLowPrice),
        lowPrice: Math.min(priceUsd, estimatedHighPrice, estimatedLowPrice),
        currentPrice: priceUsd,
        pairAddress: bestPair.pairAddress,
        chainId: bestPair.chainId,
        dexId: bestPair.dexId,
        liquidity: bestPair.liquidity?.usd || 0,
        volume24h: bestPair.volume?.h24 || 0,
        priceChange24h: priceChange24h
      };

      console.log(`   ✅ DexScreener price for ${tokenSymbol}:`);
      console.log(`      Chain: ${result.chainId}, DEX: ${result.dexId}`);
      console.log(`      Current: $${result.currentPrice.toFixed(6)}`);
      console.log(`      24h Range: $${result.lowPrice.toFixed(6)} - $${result.highPrice.toFixed(6)}`);
      console.log(`      24h Change: ${priceChange24h.toFixed(2)}%`);

      return result;

    } catch (error) {
      console.error(`❌ DexScreener error for ${tokenSymbol}:`, error.message);
      return null;
    }
  }

  /**
   * 选择最佳交易对
   * 优先级: 流动性 > 交易量 > 链类型
   */
  selectBestPair(pairs, tokenSymbol) {
    if (!pairs || pairs.length === 0) return null;

    // 过滤掉无效的交易对
    const validPairs = pairs.filter(pair => {
      // 确保 baseToken 或 quoteToken 匹配目标代币
      const symbolMatch =
        pair.baseToken?.symbol?.toLowerCase() === tokenSymbol.toLowerCase() ||
        pair.quoteToken?.symbol?.toLowerCase() === tokenSymbol.toLowerCase();

      // 必须有价格和流动性
      const hasValidData =
        pair.priceUsd &&
        parseFloat(pair.priceUsd) > 0 &&
        pair.liquidity?.usd > 0;

      return symbolMatch && hasValidData;
    });

    if (validPairs.length === 0) {
      // 如果严格匹配没有结果，放宽条件
      return pairs.find(pair => pair.priceUsd && parseFloat(pair.priceUsd) > 0);
    }

    // 按流动性排序（流动性越高越可靠）
    validPairs.sort((a, b) => {
      const liquidityA = parseFloat(a.liquidity?.usd || 0);
      const liquidityB = parseFloat(b.liquidity?.usd || 0);
      return liquidityB - liquidityA;
    });

    // 优先选择主流链（Ethereum, BSC, Solana）
    const preferredChains = ['ethereum', 'bsc', 'solana', 'arbitrum', 'polygon'];
    const preferredPair = validPairs.find(pair =>
      preferredChains.includes(pair.chainId?.toLowerCase())
    );

    return preferredPair || validPairs[0];
  }

  /**
   * 缓存管理
   */
  getCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.cacheTTL;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 清理过期缓存
   */
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.cache.delete(key);
      }
    }
  }
}

// 单例模式
const dexScreenerService = new DexScreenerService();

// 每10分钟清理一次缓存
setInterval(() => {
  dexScreenerService.cleanCache();
}, 600000);

module.exports = dexScreenerService;

/**
 * Twitter Token Extractor
 * Features:
 * 1. Extract token symbols from tweets (Cashtag + project name mapping)
 * 2. Detect buy/sell signal keywords
 * 3. Filter against Binance Alpha Token whitelist
 * 4. Calculate tweet engagement score
 */

const DatabaseService = require('../databaseService');

class TokenExtractor {
  constructor() {
    // Project name → Token symbol mapping
    this.PROJECT_MAP = {
      // Mainstream coins (with common abbreviations)
      'bitcoin': 'BTC',
      'btc': 'BTC',
      'ethereum': 'ETH',
      'eth': 'ETH',
      'binance coin': 'BNB',
      'bnb': 'BNB',
      'cardano': 'ADA',
      'ada': 'ADA',
      'solana': 'SOL',
      'sol': 'SOL',  // Added sol abbreviation
      'ripple': 'XRP',
      'xrp': 'XRP',
      'polkadot': 'DOT',
      'dot': 'DOT',
      'avalanche': 'AVAX',
      'avax': 'AVAX',
      'polygon': 'MATIC',
      'matic': 'MATIC',
      'chainlink': 'LINK',
      'link': 'LINK',
      'uniswap': 'UNI',
      'uni': 'UNI',

      // Layer 2
      'arbitrum': 'ARB',
      'optimism': 'OP',
      'base': 'BASE',

      // Meme coins
      'pepe': 'PEPE',
      'shiba': 'SHIB',
      'shiba inu': 'SHIB',
      'dogecoin': 'DOGE',
      'doge': 'DOGE',
      'floki': 'FLOKI',
      'wojak': 'WOJAK',
      'bonk': 'BONK',

      // DeFi
      'aave': 'AAVE',
      'curve': 'CRV',
      'maker': 'MKR',
      'compound': 'COMP',
      'sushiswap': 'SUSHI',
      'pancakeswap': 'CAKE',
      'cake': 'CAKE',

      // GameFi
      'axie': 'AXS',
      'axie infinity': 'AXS',
      'sandbox': 'SAND',
      'decentraland': 'MANA',
      'gala': 'GALA',

      // AI
      'fetch.ai': 'FET',
      'ocean protocol': 'OCEAN',
      'singularitynet': 'AGIX',
      'render': 'RNDR',

      // Other popular tokens
      'aptos': 'APT',
      'sui': 'SUI',
      'injective': 'INJ',
      'sei': 'SEI',
      'celestia': 'TIA',
      'starknet': 'STRK',
      'immutable': 'IMX',
      'blur': 'BLUR',
      'lido': 'LDO',
      'jito': 'JTO',
      'wormhole': 'W',
    };

    // Buy keywords (including Chinese and Turkish signals)
    this.BUY_KEYWORDS = [
      // English buy signals
      'buy', 'bought', 'buying',
      'aped', 'aping', 'ape in',
      'got', 'getting', 'grabbed',
      'add', 'added', 'adding', 'accumulate', 'accumulating',
      'long', 'longing', 'entered long',
      'entry', 'entering',
      'bullish', 'bull', 'moon', 'moonshot',
      'gem', 'hidden gem',
      'early', 'catching early',
      'position opened', 'opened position',
      // Additional bullish signals
      'go huge', 'will go', 'going to',
      'heating up', 'heating', 'hot',
      'next', 'next gainer',
      'ruling', 'pump', 'pumping',
      'rocket', 'mooning', 'flying',
      'breakout', 'breaking out',
      'explosion', 'explosive',
      'follow', 'recommend',
      // Chinese buy signals (takeoff, all-in, buy, bottom-fishing, position building, bullish, pump, moon, gem, surge, uptrend, etc.)
      '起飞', '要起飞', '会起飞', '准备起飞',
      '冲', '冲啊', '梭哈', '上车', '买入',
      '抄底', '加仓', '建仓', '埋伏',
      '看涨', '看好', '牛市', '暴涨',
      '爆发', '拉升', '飙升', '暴拉',
      '翻倍', '百倍', '千倍', '百倍币',
      '金狗', '潜力', '机会', '埋伏好',
      '涨幅', '上涨', '涨', '还会涨',
      '空间', '上涨空间', '涨幅空间',
      '还没结束', '没结束', '继续涨',
      // 土耳其语买入信号词 (Turkish BUY signals)
      'al', 'aldım', 'alıyorum', 'satın al',      // buy, bought, buying
      'yükseliş', 'yükselecek', 'yükseliyor',     // bullish, will rise, rising
      'uçuyor', 'uçacak', 'roket',                // flying, will fly, rocket
      'pompa', 'pompalıyor', 'patlama',           // pump, pumping, explosion
      'fırsat', 'giriş yap', 'girdim',            // opportunity, enter, entered
      'güçlü', 'aya gidiyor', 'ay',               // strong, to the moon, moon
      'boğa', 'boğa piyasası',                    // bull, bull market
      'erken', 'erken giriş',                     // early, early entry
      'potansiyel', 'mücevher', 'gem',            // potential, gem
      'kâr', 'kârlı', 'kazanç',                   // profit, profitable, gain
      'artış', 'artıyor', 'yükseldi'              // increase, increasing, rose
    ];

    // Sell keywords (including Chinese and Turkish signals)
    this.SELL_KEYWORDS = [
      // English sell signals
      'sell', 'sold', 'selling',
      'close position', 'closed position', 'closing position',
      'exit position', 'exited position', 'exiting position',
      'take profit', 'tp', 'taking profit', 'took profit',
      'short', 'shorting', 'entered short',
      'dump', 'dumped', 'dumping',
      'bearish', 'bear market',
      'got out', 'getting out',  // Use complete phrase instead of standalone 'out'
      'cut loss', 'stop loss', 'stoploss',
      // Chinese sell signals (sell, reduce position, exit, take profit, bearish, bear market, crash, cut loss, stop loss, etc.)
      '卖出', '卖', '减仓', '清仓', '止盈',
      '跑路', '撤退', '离场', '出货',
      '看跌', '看空', '熊市', '暴跌',
      '崩盘', '砸盘', '割肉', '止损',
      // 土耳其语卖出信号词 (Turkish SELL signals)
      'sat', 'sattım', 'satıyorum',               // sell, sold, selling
      'düşüş', 'düşecek', 'düşüyor',              // bearish, will fall, falling
      'kâr al', 'kâr aldım',                      // take profit, took profit
      'çıkış', 'çıktım', 'pozisyon kapat',        // exit, exited, close position
      'zarar kes', 'stop loss',                   // cut loss, stop loss
      'ayı', 'ayı piyasası',                      // bear, bear market
      'boşalt', 'boşaltıyor', 'dump',             // dump, dumping
      'dikkat', 'riskli', 'tehlike',              // caution, risky, danger
      'azalış', 'azalıyor', 'düştü',              // decrease, decreasing, dropped
      'kısa', 'short pozisyon'                    // short, short position
    ];

    // Contract address regex patterns
    this.CONTRACT_PATTERNS = {
      // EVM chains (Ethereum, BSC, Base, Arbitrum, etc.) - 0x + 40 hex chars
      evm: /\b0x[a-fA-F0-9]{40}\b/g,

      // Solana - Base58 encoded, 32-44 characters
      solana: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g
    };

    // Chain keyword mapping for context detection
    this.CHAIN_KEYWORDS = {
      'BSC': ['bsc', 'bnb chain', 'binance smart chain', 'pancakeswap', 'cake'],
      'Base': ['base', 'base chain', 'basechain'],
      'Ethereum': ['ethereum', 'eth', 'uniswap', 'mainnet'],
      'Solana': ['solana', 'sol', 'raydium', 'jupiter'],
      'Arbitrum': ['arbitrum', 'arb'],
      'Polygon': ['polygon', 'matic'],
      'Avalanche': ['avalanche', 'avax']
    };

    console.log('✅ TokenExtractor initialized with', Object.keys(this.PROJECT_MAP).length, 'project mappings');
  }

  /**
   * Extract all possible token symbols from tweet
   * @param {string} tweetContent - Tweet content
   * @returns {Array<string>} - Token symbol array (e.g. ['PEPEUSDT', 'BTCUSDT'])
   */
  extract(tweetContent) {
    if (!tweetContent) return [];

    const tokens = new Set(); // Auto deduplication with Set
    const lowerContent = tweetContent.toLowerCase();

    // 1. Extract Cashtag format ($PEPE, $BTC, $Tradoor)
    const cashtagRegex = /\$([A-Za-z]{2,10})/g;  // Support mixed case
    let match;
    while ((match = cashtagRegex.exec(tweetContent)) !== null) {
      const symbol = match[1].toUpperCase();  // Normalize to uppercase
      // Filter common non-token words
      if (!['USD', 'USDT', 'USDC', 'BUSD'].includes(symbol)) {
        tokens.add(symbol + 'USDT');
      }
    }

    // 1.5. Extract Hashtag format (#sol, #btc, #pepe)
    const hashtagRegex = /#([A-Za-z]{2,10})/g;
    while ((match = hashtagRegex.exec(tweetContent)) !== null) {
      const symbol = match[1].toUpperCase();
      // Filter common non-token hashtags
      if (!['USD', 'USDT', 'USDC', 'BUSD', 'CRYPTO', 'DEFI', 'NFT'].includes(symbol)) {
        tokens.add(symbol + 'USDT');
      }
    }

    // 2. Project name mapping (pepe → PEPE)
    for (const [projectName, symbol] of Object.entries(this.PROJECT_MAP)) {
      // Use word boundary to avoid false matches (e.g. "repepe" should not match "pepe")
      const regex = new RegExp(`\\b${projectName}\\b`, 'i');
      if (regex.test(lowerContent)) {
        tokens.add(symbol + 'USDT');
      }
    }

    // 3. Extract pure uppercase token symbols (without $, e.g. "PEPE is mooning")
    const upperSymbolRegex = /\b([A-Z]{3,10})\b/g;
    while ((match = upperSymbolRegex.exec(tweetContent)) !== null) {
      const symbol = match[1];
      // Filter common English words and non-token terms
      const excludeWords = ['THE', 'AND', 'FOR', 'NOT', 'BUT', 'USD', 'USDT', 'USDC', 'BUSD', 'ALL', 'NEW', 'NOW', 'GET', 'NFT'];
      if (!excludeWords.includes(symbol) && symbol.length <= 6) {
        tokens.add(symbol + 'USDT');
      }
    }

    // 4. Extract tokens based on signal keywords (smart recognition, no mapping required)
    // Match: buy/sell/long/short + token symbol
    const signalKeywords = ['buy', 'sell', 'long', 'short', 'bought', 'sold', 'longing', 'shorting', 'enter', 'exit'];
    for (const keyword of signalKeywords) {
      // Match "buy sol", "long btc", etc.
      const contextRegex = new RegExp(`\\b${keyword}\\s+([a-z]{2,10})\\b`, 'gi');
      while ((match = contextRegex.exec(tweetContent)) !== null) {
        const symbol = match[1].toUpperCase();
        // Exclude common English words
        const commonWords = ['THE', 'AND', 'FOR', 'YOU', 'NOW', 'ALL', 'OUT', 'LOW', 'HIGH', 'NEW', 'OLD'];
        if (!commonWords.includes(symbol)) {
          tokens.add(symbol + 'USDT');
          console.log(`   💡 [Smart Detection] ${keyword} ${symbol} → ${symbol}USDT`);
        }
      }
    }

    const result = Array.from(tokens);
    console.log(`   🔍 Extracted ${result.length} tokens:`, result.join(', '));

    return result;
  }

  /**
   * Detect buy/sell signals in tweet
   * @param {string} tweetContent - Tweet content
   * @returns {'BUY'|'SELL'|null} - Signal type
   */
  detectSignalType(tweetContent) {
    if (!tweetContent) return null;

    const lowerContent = tweetContent.toLowerCase();

    // Check for buy keywords
    const hasBuySignal = this.BUY_KEYWORDS.some(keyword =>
      lowerContent.includes(keyword)
    );

    // Check for sell keywords
    const hasSellSignal = this.SELL_KEYWORDS.some(keyword =>
      lowerContent.includes(keyword)
    );

    // Priority: If both buy and sell signals exist, determine by position
    if (hasBuySignal && hasSellSignal) {
      const firstBuyIndex = this.BUY_KEYWORDS
        .map(kw => lowerContent.indexOf(kw))
        .filter(idx => idx !== -1)
        .sort((a, b) => a - b)[0];

      const firstSellIndex = this.SELL_KEYWORDS
        .map(kw => lowerContent.indexOf(kw))
        .filter(idx => idx !== -1)
        .sort((a, b) => a - b)[0];

      console.log(`   ⚠️ Both buy and sell signals detected, buy position: ${firstBuyIndex}, sell position: ${firstSellIndex}`);

      // Return the signal that appears first
      return firstBuyIndex < firstSellIndex ? 'BUY' : 'SELL';
    }

    if (hasBuySignal) {
      console.log(`   ✅ Buy signal detected`);
      return 'BUY';
    }

    if (hasSellSignal) {
      console.log(`   ✅ Sell signal detected`);
      return 'SELL';
    }

    console.log(`   ℹ️ No clear buy/sell signal detected`);
    return null;
  }

  /**
   * Filter against Binance Alpha Token whitelist
   * @param {Array<string>} extractedTokens - Extracted token list
   * @returns {Promise<Array<string>>} - Filtered Alpha Token list
   */
  async filterAlphaTokens(extractedTokens) {
    if (!extractedTokens || extractedTokens.length === 0) {
      return [];
    }

    try {
      // Mainstream coin blacklist (don't trade these)
      const MAINSTREAM_BLACKLIST = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK'];

      // Query all Binance Alpha Tokens (including TRADOOR and all Alpha coins)
      const alphaTokens = await DatabaseService.query(`
        SELECT token_symbol FROM binance_alpha_tokens
        WHERE is_monitored = 1
      `);

      const alphaSet = new Set(alphaTokens.map(t => t.token_symbol));

      // Filter: Keep tokens in Alpha Token table, but exclude mainstream coins
      const filtered = extractedTokens.filter(token => {
        // Remove USDT suffix for matching
        const normalized = token.replace('USDT', '').replace('USDC', '');

        // Exclude mainstream coins
        if (MAINSTREAM_BLACKLIST.includes(normalized)) {
          console.log(`   ⚠️ Skip mainstream coin: ${normalized}`);
          return false;
        }

        return alphaSet.has(normalized) || alphaSet.has(token);
      });

      console.log(`   🔍 Alpha Token filtering: ${extractedTokens.length} → ${filtered.length}`);
      if (filtered.length > 0) {
        console.log(`   ✅ Matched Alpha Tokens:`, filtered.join(', '));
      }

      return filtered;

    } catch (error) {
      console.error(`   ❌ Alpha Token filtering failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate tweet engagement score (likes + retweets + replies)
   * @param {Object} tweet - Tweet object (contains likes, retweets, replies)
   * @returns {number} - Engagement score (0-100)
   */
  calculateEngagementScore(tweet) {
    const likes = parseInt(tweet.likes || 0);
    const retweets = parseInt(tweet.retweets || 0);
    const replies = parseInt(tweet.replies || 0);

    // Total engagement count
    const totalEngagement = likes + retweets * 2 + replies; // Retweets weighted x2

    // Map to 0-100 score tiers
    let score = 0;
    if (totalEngagement >= 10000) score = 100;
    else if (totalEngagement >= 5000) score = 90;
    else if (totalEngagement >= 2000) score = 80;
    else if (totalEngagement >= 1000) score = 70;
    else if (totalEngagement >= 500) score = 60;
    else if (totalEngagement >= 200) score = 50;
    else if (totalEngagement >= 100) score = 40;
    else if (totalEngagement >= 50) score = 30;
    else if (totalEngagement >= 20) score = 20;
    else if (totalEngagement >= 10) score = 10;
    else score = 5;

    return score;
  }

  /**
   * Complete tweet processing pipeline (extract + detect + filter)
   * @param {Object} tweet - Tweet object { content, likes, retweets, replies, url, timestamp }
   * @returns {Promise<Object>} - { tokens: [...], signalType: 'BUY'|'SELL', engagementScore: 85 }
   */
  async processTweet(tweet) {
    console.log(`\n📝 Processing tweet: ${tweet.url || 'N/A'}`);

    // 1. Extract tokens
    const extractedTokens = this.extract(tweet.content);

    // 2. Filter Alpha Tokens
    const alphaTokens = await this.filterAlphaTokens(extractedTokens);

    // 3. Detect signal type
    const signalType = this.detectSignalType(tweet.content);

    // 4. Calculate engagement score
    const engagementScore = this.calculateEngagementScore(tweet);

    const result = {
      tokens: alphaTokens,
      signalType: signalType,
      engagementScore: engagementScore,
      totalEngagement: (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0)
    };

    console.log(`   📊 Processing result:`, JSON.stringify(result, null, 2));

    return result;
  }

  /**
   * Batch process tweets (for scheduled tasks)
   * @param {Array<Object>} tweets - Tweet array
   * @returns {Promise<Array<Object>>} - Processing result array
   */
  async batchProcess(tweets) {
    const results = [];

    for (const tweet of tweets) {
      try {
        const result = await this.processTweet(tweet);
        if (result.tokens.length > 0 && result.signalType) {
          results.push({
            ...result,
            tweet: tweet
          });
        }
      } catch (error) {
        console.error(`   ❌ Tweet processing failed: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Extract contract addresses from text
   * @param {string} text - Tweet/message content
   * @returns {Array<Object>} - Contract address array [{ address, chain, type }]
   */
  extractContracts(text) {
    if (!text) return [];

    const contracts = [];
    const lowerText = text.toLowerCase();

    // 1. Extract EVM contract addresses (0x...)
    const evmMatches = text.match(this.CONTRACT_PATTERNS.evm);
    if (evmMatches) {
      for (const address of evmMatches) {
        const chain = this.detectChainFromContext(lowerText);
        contracts.push({
          address: address,
          chain: chain,
          type: 'EVM'
        });
        console.log(`   💎 Extracted EVM contract: ${address} (chain: ${chain})`);
      }
    }

    // 2. Extract Solana contract addresses
    const solMatches = text.match(this.CONTRACT_PATTERNS.solana);
    if (solMatches) {
      for (const address of solMatches) {
        // Filter out obviously non-contract strings
        if (this.isValidSolanaAddress(address, lowerText)) {
          contracts.push({
            address: address,
            chain: 'Solana',
            type: 'SOLANA'
          });
          console.log(`   💎 Extracted Solana contract: ${address}`);
        }
      }
    }

    return contracts;
  }

  /**
   * Detect blockchain from text context
   * @param {string} lowerText - Lowercase text content
   * @returns {string} - Chain name (BSC/Base/Ethereum/Solana, etc.)
   */
  detectChainFromContext(lowerText) {
    // Iterate through chain keyword mappings to find matching chain
    for (const [chain, keywords] of Object.entries(this.CHAIN_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          console.log(`   🔍 Chain detected: ${chain} (keyword: ${keyword})`);
          return chain;
        }
      }
    }

    // Default to BSC (most meme coins are on BSC)
    console.log(`   🔍 No chain keywords detected, defaulting to: BSC`);
    return 'BSC';
  }

  /**
   * Validate if Solana address is valid
   * @param {string} address - Address string
   * @param {string} context - Context text
   * @returns {boolean} - Whether it's a valid Solana address
   */
  isValidSolanaAddress(address, context) {
    // 1. Length check (Solana addresses are typically 32-44 characters)
    if (address.length < 32 || address.length > 44) {
      return false;
    }

    // 2. Exclude common false matches (URLs, English words, etc.)
    const blacklist = [
      'http', 'https', 'www', 'com', 'org', 'net',
      'tweet', 'status', 'twitter', 'telegram'
    ];

    for (const word of blacklist) {
      if (address.toLowerCase().includes(word)) {
        return false;
      }
    }

    // 3. If context contains Solana-related keywords, it's more likely a real address
    const solanaKeywords = ['solana', 'sol', 'raydium', 'jupiter', 'pump.fun'];
    const hasSolanaContext = solanaKeywords.some(kw => context.includes(kw));

    // 4. Consider valid if has Solana context OR address length is exactly 44 (standard length)
    return hasSolanaContext || address.length === 44;
  }

  /**
   * Extended: Complete tweet processing pipeline (including contract address extraction)
   * @param {Object} tweet - Tweet object { content, likes, retweets, replies, url, timestamp }
   * @returns {Promise<Object>} - { tokens: [...], contracts: [...], signalType: 'BUY'|'SELL', engagementScore: 85 }
   */
  async processTweetWithContracts(tweet) {
    console.log(`\n📝 Processing tweet (with contracts): ${tweet.url || 'N/A'}`);

    // 1. Extract token symbols
    const extractedTokens = this.extract(tweet.content);

    // 2. Filter Alpha Tokens
    const alphaTokens = await this.filterAlphaTokens(extractedTokens);

    // 3. Extract contract addresses
    const contracts = this.extractContracts(tweet.content);

    // 4. Detect signal type
    const signalType = this.detectSignalType(tweet.content);

    // 5. Calculate engagement score
    const engagementScore = this.calculateEngagementScore(tweet);

    const result = {
      tokens: alphaTokens,
      contracts: contracts,  // Includes contract addresses
      signalType: signalType,
      engagementScore: engagementScore,
      totalEngagement: (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0)
    };

    console.log(`   📊 Processing result:`, JSON.stringify(result, null, 2));

    return result;
  }
}

module.exports = new TokenExtractor();

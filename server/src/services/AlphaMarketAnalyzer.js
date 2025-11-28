/**
 * Alpha Market Analyzer
 * 7维度智能分析引擎 - 生成交易信号
 *
 * 分析维度:
 * 1. OI + FR (30%) - 持仓量变化 + 资金费率
 * 2. 趋势判断 (25%) - MA均线系统
 * 3. K线形态 (20%) - 反转/延续形态识别
 * 4. 成交量 (15%) - 量价配合
 * 5. 关键价位 (10%) - 支撑/阻力
 * 6. RSI (5%) - 超买超卖
 * 7. MACD (3%) - 趋势动量
 *
 * 创建时间: 2025-10-22
 * Phase: 0 (MVP-Lite)
 * 版本: v1.0 (固定权重)
 */

const BinanceAlphaService = require('./BinanceAlphaService');
const DatabaseService = require('./databaseService');
const UUID = require('uuid');
const DeepSeekService = require('./deepseekService');
const SignalAuditService = require('./SignalAuditService');
const AutoTradeService = require('./autoTrade/AutoTradeService');
const KnowledgeProviderFactory = require('./knowledge/KnowledgeProviderFactory');

class AlphaMarketAnalyzer {
  constructor() {
    // Phase 2: 动态权重 - 从数据库alpha_model_config读取
    // 初始化为默认值，启动时会从数据库加载
    // 🆕 v2.0: 新增 7 个风险维度，调整权重分配
    this.weights = {
      // 原有 7 维度 (调整权重)
      oiFundingScore: 0.16,    // 30% → 16%
      trendScore: 0.16,        // 25% → 16%
      patternScore: 0.12,      // 20% → 12%
      volumeScore: 0.08,       // 15% → 8%
      keyLevelsScore: 0.06,    // 10% → 6%
      rsiScore: 0.08,          // 5% → 8% ⬆️ (提高RSI权重)
      macdScore: 0.02,         // 3% → 2%

      // 🆕 新增 7 维度 (全部基于 Alpha API)
      pullbackRisk: 0.08,      // 回调风险 (解决涨多回调问题)
      liquidityRisk: 0.10,     // 流动性风险 (最重要!)
      volatilityRisk: 0.06,    // 波动率风险
      liquidationRisk: 0.04,   // 清算风险 (OI/MC)
      newTokenRisk: 0.03,      // 新代币风险
      whaleRisk: 0.02,         // 巨鲸风险 (估算)
      volumePriceDivergence: 0.02  // 量价背离
    };

    this.thresholds = {
      minConfidence: 50,
      minOIChange: 5,
      minFundingRateAbs: 0.0001
    };

    this.currentVersion = 'v2.0-deepseek-risk-enhanced';
    this.weightsLoaded = false;

    // AI增强功能开关
    this.enableAI = true;
    this.enableHistoricalLearning = true;
    this.enableDynamicWeights = true; // 启用动态权重学习

    console.log('✅ AlphaMarketAnalyzer initialized');
    console.log(`   🤖 AI Enhanced: ${this.enableAI ? 'ON' : 'OFF'}`);
    console.log(`   📚 Historical Learning: ${this.enableHistoricalLearning ? 'ON' : 'OFF'}`);
    console.log(`   🧠 Dynamic Weights: ${this.enableDynamicWeights ? 'ON' : 'OFF'}`);

    // 🆕 初始化知识检索提供者 (FLock 或 Local)
    if (this.enableHistoricalLearning) {
      try {
        this.knowledgeProvider = KnowledgeProviderFactory.createProvider();
      } catch (error) {
        console.warn('⚠️  Knowledge provider initialization failed:', error.message);
        console.warn('   Historical learning will be disabled');
        this.enableHistoricalLearning = false;
        this.knowledgeProvider = null;
      }
    } else {
      this.knowledgeProvider = null;
    }

    // 异步加载权重配置
    this.loadWeightsFromDatabase().catch(err => {
      console.warn('⚠️  Failed to load weights from database, using defaults:', err.message);
    });

    // 启动持仓代币价格更新任务
    this.startPositionPriceUpdater();
  }

  /**
   * Load weights and thresholds from database
   */
  async loadWeightsFromDatabase() {
    if (!this.enableDynamicWeights) {
      console.log('   ℹ️  Dynamic weights disabled, using fixed weights');
      return;
    }

    try {
      // Load active weights configuration
      const weightsQuery = `
        SELECT * FROM alpha_model_config
        WHERE config_type = 'WEIGHTS' AND is_active = 1
        LIMIT 1
      `;
      const weightsResults = await DatabaseService.query(weightsQuery);

      if (weightsResults.length > 0) {
        const config = weightsResults[0];
        this.weights = {
          oiFundingScore: parseFloat(config.oi_funding_weight),
          trendScore: parseFloat(config.trend_weight),
          patternScore: parseFloat(config.pattern_weight),
          volumeScore: parseFloat(config.volume_weight),
          keyLevelsScore: parseFloat(config.key_levels_weight),
          rsiScore: parseFloat(config.rsi_weight),
          macdScore: parseFloat(config.macd_weight)
        };
        this.currentVersion = config.version;
        this.weightsLoaded = true;

        console.log(`   ✅ Loaded weights from database: ${config.config_name} (${config.version})`);
        console.log(`      - OI/Funding: ${this.weights.oiFundingScore}`);
        console.log(`      - Trend: ${this.weights.trendScore}`);
        console.log(`      - Pattern: ${this.weights.patternScore}`);
        console.log(`      - Volume: ${this.weights.volumeScore}`);
      }

      // Load active thresholds configuration
      const thresholdsQuery = `
        SELECT * FROM alpha_model_config
        WHERE config_type = 'THRESHOLDS' AND is_active = 1
        LIMIT 1
      `;
      const thresholdsResults = await DatabaseService.query(thresholdsQuery);

      if (thresholdsResults.length > 0) {
        const config = thresholdsResults[0];
        this.thresholds = {
          minConfidence: parseFloat(config.min_confidence),
          minOIChange: parseFloat(config.min_oi_change),
          minFundingRateAbs: parseFloat(config.min_funding_rate)
        };

        console.log(`   ✅ Loaded thresholds from database: ${config.config_name}`);
      }

    } catch (error) {
      console.error('❌ Error loading weights from database:', error.message);
      console.log('   ℹ️  Using default weights');
    }
  }

  /**
   * Reload weights from database (called after learning)
   */
  async reloadWeights() {
    console.log('\n🔄 Reloading weights from database...');
    await this.loadWeightsFromDatabase();
  }

  /**
   * 启动持仓代币价格更新任务
   * 每3分钟更新一次持仓代币的价格到 alpha_signals 表
   */
  startPositionPriceUpdater() {
    console.log('🔄 持仓代币价格更新任务已启动 (每1分钟)');

    // 立即执行一次
    this.updatePositionPrices().catch(err => {
      console.error('❌ 价格更新失败:', err.message);
    });

    // 每1分钟执行一次
    this.priceUpdateInterval = setInterval(() => {
      this.updatePositionPrices().catch(err => {
        console.error('❌ 价格更新失败:', err.message);
      });
    }, 60 * 1000); // 1分钟
  }

  /**
   * 更新持仓代币价格
   * 从数据库获取所有持仓代币,查询最新价格,写入 alpha_signals
   */
  async updatePositionPrices() {
    try {
      console.log('\n🔄 [价格更新] 开始更新持仓代币价格...');

      // 1. 获取所有持仓中的代币
      const positions = await DatabaseService.query(`
        SELECT DISTINCT token_symbol, chain, contract_address
        FROM auto_trade_positions
        WHERE status = 'HOLDING'
      `);

      if (positions.length === 0) {
        console.log('   ℹ️  当前无持仓,跳过价格更新');
        return;
      }

      console.log(`   📊 找到 ${positions.length} 个持仓代币`);

      // 2. 逐个更新价格
      for (const position of positions) {
        await this.updateSingleTokenPrice(
          position.token_symbol,
          position.chain,
          position.contract_address
        );

        // 避免API限流
        await this.sleep(500);
      }

      console.log(`   ✅ 价格更新完成`);

    } catch (error) {
      console.error(`   ❌ 价格更新失败: ${error.message}`);
    }
  }

  /**
   * 更新单个代币价格
   * @param {string} tokenSymbol - 代币符号
   * @param {string} chain - 链名称
   * @param {string} contractAddress - 合约地址
   */
  async updateSingleTokenPrice(tokenSymbol, chain, contractAddress) {
    try {
      console.log(`   🔍 [${tokenSymbol}] 获取最新价格...`);

      let currentPrice = null;
      let priceSource = null;

      // ✅ 优先从 Binance Alpha API 获取价格 (现货价格)
      try {
        const binanceData = await BinanceAlphaService.getComprehensiveData(tokenSymbol);
        if (binanceData && binanceData.currentPrice) {
          currentPrice = binanceData.currentPrice;
          priceSource = 'BINANCE';
          console.log(`   ✅ [${tokenSymbol}] Binance Alpha价格: $${currentPrice}`);
        }
      } catch (e) {
        console.log(`   ⚠️  [${tokenSymbol}] Binance获取失败: ${e.message}`);
      }

      // ⚠️  备用方案: 从 DexScreener 获取 (不推荐,价格可能不准确)
      if (!currentPrice && contractAddress) {
        console.log(`   ⚠️  [${tokenSymbol}] Binance无数据,尝试DexScreener (价格可能不准确)...`);
        const dexData = await this.getDexScreenerData(tokenSymbol, chain);
        if (dexData && dexData.priceUsd) {
          currentPrice = parseFloat(dexData.priceUsd);
          priceSource = 'DEXSCREENER';
          console.log(`   ✅ [${tokenSymbol}] DexScreener价格: $${currentPrice}`);
        }
      }

      // 如果还是获取不到价格,跳过
      if (!currentPrice) {
        console.log(`   ⚠️  [${tokenSymbol}] 无法获取价格,跳过`);
        return;
      }

      // 3. 插入新的价格记录到 alpha_signals
      const signalId = `PRICE_UPDATE_${tokenSymbol}_${Date.now()}`;

      await DatabaseService.query(`
        INSERT INTO alpha_signals (
          signal_id, agent_id, token_symbol, chain, contract_address,
          signal_type, confidence_score, risk_level,
          current_price, entry_min, entry_max, stop_loss,
          take_profit_1, take_profit_2, take_profit_3,
          reasoning, status, price_source, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR))
      `, [
        signalId,
        999, // agent_id
        tokenSymbol,
        chain,
        contractAddress,
        'NEUTRAL', // 价格更新不是交易信号
        50, // confidence_score
        'MEDIUM', // risk_level
        currentPrice,
        currentPrice * 0.98,
        currentPrice * 1.02,
        currentPrice * 0.90,
        currentPrice * 1.10,
        currentPrice * 1.20,
        currentPrice * 1.30,
        'Price update for held position',
        'ACTIVE',
        priceSource || 'BINANCE', // 使用实际的价格来源
      ]);

      console.log(`   💾 [${tokenSymbol}] 价格已更新到数据库 (来源: ${priceSource})`);

    } catch (error) {
      console.error(`   ❌ [${tokenSymbol}] 价格更新失败: ${error.message}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 主分析入口 - 分析单个代币
   * @param {string} symbol - 交易对符号（BTCUSDT）
   * @param {boolean} spotOnly - 是否仅现货（true=只能买入卖出，false=可做多空）
   */
  async analyzeToken(symbol, spotOnly = false) {
    const mode = spotOnly ? '现货' : '期货';
    console.log(`\n🔍 Analyzing ${symbol} (${mode})...`);

    try {
      // 1. 获取综合数据
      const data = await BinanceAlphaService.getComprehensiveData(symbol);

      if (!data || !data.currentPrice) {
        console.warn(`⚠️ No data for ${symbol}`);
        return null;
      }

      // 🛡️ 严格检查：价格必须大于 0，否则会导致 NaN
      if (data.currentPrice <= 0) {
        console.error(`❌ Invalid price for ${symbol}: $${data.currentPrice} (must be > 0)`);
        console.error(`   This would cause NaN in calculations. Skipping analysis.`);
        return null;
      }

      // 2. 获取代币元数据 (用于风险分析)
      const baseSymbol = symbol.replace('USDT', '');
      const alphaTokens = await BinanceAlphaService.getAllAlphaTokensIncludingDEX();
      const tokenData = alphaTokens.find(t => t.symbol === baseSymbol) || {};

      // 3. 14维度分析（现货模式下跳过 OI/FR 分析）
      const rsiScore = await this.analyzeRSI(data);

      const scores = spotOnly ? {
        oiFundingScore: { score: 50, signal: 'NEUTRAL' }, // 现货无 OI/FR
        trendScore: await this.analyzeTrend(data),
        patternScore: await this.analyzePattern(data),
        volumeScore: await this.analyzeVolume(data),
        keyLevelsScore: await this.analyzeKeyLevels(data),
        rsiScore: rsiScore,
        macdScore: await this.analyzeMACD(data),

        // 🆕 新增风险维度
        pullbackRisk: await this.analyzePullbackRisk(tokenData.priceChange24h || 0, rsiScore, data),
        liquidityRisk: await this.analyzeLiquidityRisk(tokenData),
        volatilityRisk: await this.analyzeVolatilityRisk(data.klines?.['1h'], tokenData),
        liquidationRisk: await this.analyzeLiquidationRisk(data),
        newTokenRisk: await this.analyzeNewTokenRisk(tokenData),
        whaleRisk: await this.analyzeWhaleRisk(tokenData),
        volumePriceDivergence: await this.analyzeVolumePriceDivergence(data.klines?.['1h'])
      } : {
        oiFundingScore: await this.analyzeOIAndFR(data),
        trendScore: await this.analyzeTrend(data),
        patternScore: await this.analyzePattern(data),
        volumeScore: await this.analyzeVolume(data),
        keyLevelsScore: await this.analyzeKeyLevels(data),
        rsiScore: rsiScore,
        macdScore: await this.analyzeMACD(data),

        // 🆕 新增风险维度
        pullbackRisk: await this.analyzePullbackRisk(tokenData.priceChange24h || 0, rsiScore, data),
        liquidityRisk: await this.analyzeLiquidityRisk(tokenData),
        volatilityRisk: await this.analyzeVolatilityRisk(data.klines?.['1h'], tokenData),
        liquidationRisk: await this.analyzeLiquidationRisk(data),
        newTokenRisk: await this.analyzeNewTokenRisk(tokenData),
        whaleRisk: await this.analyzeWhaleRisk(tokenData),
        volumePriceDivergence: await this.analyzeVolumePriceDivergence(data.klines?.['1h'])
      };

      // 3. 计算综合置信度
      const confidence = this.calculateConfidence(scores);

      // 4. 确定信号类型（不再过滤 NEUTRAL）
      const signalType = this.determineSignalType(scores, data, spotOnly);

      // 5. 生成交易计划
      const tradingPlan = this.generateTradingPlan(signalType, data, confidence);

      // 6. 查询历史知识（FLock RAG 或 Local DB + DeepSeek）
      let knowledgeInsight = null;
      let confidenceAdjustment = 0;
      let knowledgeResult = null;

      if (this.enableHistoricalLearning && this.knowledgeProvider) {
        try {
          console.log(`   🔍 Querying knowledge provider for ${symbol} ${signalType}...`);

          // 构建当前市场条件
          const marketCondition = {
            price_change_24h: data.priceChange24h || 0,
            volume_mc_ratio: data.volume24h && data.marketCap ? (data.volume24h / data.marketCap) : 0,
            oi_mc_ratio: data.openInterest?.current && data.marketCap ? (data.openInterest.current / data.marketCap) : 0,
            day_of_week: new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(),
            hour_of_day: new Date().getUTCHours(),
            btc_trend: scores.trendScore?.signal || 'NEUTRAL',
            market_cap: data.marketCap || 0
          };

          // 查询历史相似案例
          knowledgeResult = await this.knowledgeProvider.queryHistoricalCases(
            symbol,
            signalType,
            marketCondition
          );

          if (knowledgeResult.success) {
            knowledgeInsight = knowledgeResult.answer;
            confidenceAdjustment = this.knowledgeProvider.parseConfidenceAdjustment(knowledgeResult.answer);

            console.log(`   ✅ Knowledge retrieved from ${knowledgeResult.source}`);
            console.log(`   📊 Similar cases: ${knowledgeResult.similar_cases_count || 0}`);
            if (confidenceAdjustment !== 0) {
              console.log(`   🎯 Confidence adjustment: ${confidenceAdjustment > 0 ? '+' : ''}${confidenceAdjustment}`);
            }
          }

        } catch (error) {
          console.warn(`   ⚠️  Knowledge query failed: ${error.message}`);
        }
      }

      // 7. 应用置信度调整
      let adjustedConfidence = confidence;
      if (confidenceAdjustment !== 0) {
        adjustedConfidence = Math.max(50, Math.min(95, confidence + confidenceAdjustment));
        console.log(`   📈 Confidence: ${confidence}% → ${adjustedConfidence}% (${confidenceAdjustment > 0 ? '+' : ''}${confidenceAdjustment})`);
      }

      // 8. 生成推理（AI增强或传统方式）- 包含知识见解
      const reasoning = await this.generateReasoningWithAI(scores, data, signalType, symbol, [], knowledgeInsight);

      // 9. Build signal object with FLock insights
      const signal = {
        signalId: this.generateSignalId(symbol),
        tokenSymbol: symbol,
        contractAddress: data.contractAddress || null,
        signalType,
        confidence: parseFloat(adjustedConfidence.toFixed(2)),
        originalConfidence: knowledgeResult ? parseFloat(confidence.toFixed(2)) : undefined,
        confidenceAdjustment: knowledgeResult ? confidenceAdjustment : undefined,
        riskLevel: this.calculateRiskLevel(adjustedConfidence, data),

        // FLock insight data for frontend display (save even if adjustment = 0 for hackathon demo)
        flockInsight: knowledgeResult ? {
          source: knowledgeResult.source || 'Unknown',
          similarCasesCount: knowledgeResult.similar_cases_count || 0,
          analysis: knowledgeInsight || 'No historical insights available for this token',
          adjustmentReason: confidenceAdjustment !== 0 ? this.getAdjustmentReason(confidenceAdjustment, knowledgeInsight) : 'NO_ADJUSTMENT'
        } : null,

        ...tradingPlan,

        // 分析数据（现货模式下 OI/FR 为 null）
        oiChange24h: spotOnly ? null : (data.openInterest?.change24h || null),
        fundingRate: spotOnly ? null : (data.fundingRate?.current || null),
        trendAnalysis: scores.trendScore.description || '',
        patternDetected: scores.patternScore.pattern || 'None',
        volumeAnalysis: scores.volumeScore.description || '',

        // 支撑位和压力位
        supportLevel: scores.keyLevelsScore.support || null,
        resistanceLevel: scores.keyLevelsScore.resistance || null,

        // OI 和 MC 数据（现货模式下 OI 为 null）
        oiValue: spotOnly ? null : (data.openInterest?.current || null),
        marketCap: data.marketCap || null,
        oiMcRatio: (spotOnly || !data.openInterest?.current || !data.marketCap)
          ? null
          : parseFloat((data.openInterest.current / data.marketCap).toFixed(4)),

        reasoning,

        // Phase 1+: 预测数据
        generationParams: JSON.stringify({
          version: this.currentVersion,
          weights: this.weights,
          thresholds: this.thresholds
        }),
        predictedDirection: (signalType === 'LONG' || signalType === 'BUY') ? 'UP' : (signalType === 'SHORT' || signalType === 'SELL') ? 'DOWN' : 'NEUTRAL',
        predictedPrice24h: tradingPlan.takeProfit1 || null,
        predictedReturnPercent: this.calculateExpectedReturn(
          data.currentPrice,
          tradingPlan.takeProfit1,
          signalType
        ) || null,

        // 状态
        status: 'ACTIVE',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24小时后过期
      };

      // 9. 保存到数据库
      await this.saveSignal(signal);

      // 显示信号信息（包括 NEUTRAL）
      const signalEmoji = signalType === 'LONG' ? '📈' : signalType === 'SHORT' ? '📉' :
                          signalType === 'BUY' ? '💰' : signalType === 'SELL' ? '💸' : '⚖️';
      console.log(`   ${signalEmoji} Signal: ${signalType} @ ${confidence.toFixed(2)}%`);

      return signal;

    } catch (error) {
      console.error(`❌ Error analyzing ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * 1. OI and FR Analysis (30%)
   */
  async analyzeOIAndFR(data) {
    let score = 0;
    let description = '';

    const oiChange = parseFloat(data.openInterest.change24h);
    const fr = data.fundingRate.current;

    // Scenario 1: OI rising + negative FR = whales longing (90 points)
    if (oiChange > 10 && fr < -0.0001) {
      score = 90;
      description = `OI↑${oiChange.toFixed(2)}% + Negative FR(${(fr * 100).toFixed(4)}%), whales longing`;
    }
    // Scenario 2: OI rising + high positive FR = whales shorting (85 points)
    else if (oiChange > 10 && fr > 0.001) {
      score = 85;
      description = `OI↑${oiChange.toFixed(2)}% + High FR(${(fr * 100).toFixed(4)}%), whales shorting`;
    }
    // Scenario 3: OI falling + extreme FR = liquidation event (75 points)
    else if (oiChange < -10 && Math.abs(fr) > 0.0005) {
      score = 75;
      description = `OI↓${oiChange.toFixed(2)}%, heavy liquidations`;
    }
    // Scenario 4: OI slightly rising (60 points)
    else if (oiChange > 5) {
      score = 60;
      description = `OI slightly up ${oiChange.toFixed(2)}%`;
    }
    // Scenario 5: No clear signal (40 points)
    else {
      score = 40;
      description = `OI/FR no clear signal`;
    }

    return {
      score,
      description,
      oiChange,
      fundingRate: fr,
      signal: score >= 75 ? (fr < 0 ? 'LONG' : 'SHORT') : 'NEUTRAL'
    };
  }

  /**
   * 2. Trend Analysis (25%)
   */
  async analyzeTrend(data) {
    const klines = data.klines['4h'];
    if (!klines || klines.length < 50) {
      return { score: 50, description: 'Insufficient data', signal: 'NEUTRAL' };
    }

    // 提取收盘价
    const closes = klines.map(k => parseFloat(k[4]));

    // 计算MA20, MA50
    const ma20 = this.calculateMA(closes, 20);
    const ma50 = this.calculateMA(closes, 50);

    const currentPrice = closes[closes.length - 1];

    let score = 0;
    let description = '';
    let signal = 'NEUTRAL';

    // Bullish alignment: Price > MA20 > MA50
    if (currentPrice > ma20 && ma20 > ma50) {
      score = 85;
      description = 'Bullish alignment';
      signal = 'LONG';
    }
    // Bearish alignment: Price < MA20 < MA50
    else if (currentPrice < ma20 && ma20 < ma50) {
      score = 80;
      description = 'Bearish alignment';
      signal = 'SHORT';
    }
    // Break above MA20
    else if (currentPrice > ma20 && currentPrice < ma50) {
      score = 70;
      description = 'Break above MA20';
      signal = 'LONG';
    }
    // Break below MA20
    else if (currentPrice < ma20 && currentPrice > ma50) {
      score = 65;
      description = 'Break below MA20';
      signal = 'SHORT';
    }
    // Sideways
    else {
      score = 50;
      description = 'Sideways';
    }

    return {
      score,
      description,
      signal,
      ma20,
      ma50,
      currentPrice
    };
  }

  /**
   * 3. Candlestick Pattern Analysis (20%)
   */
  async analyzePattern(data) {
    const klines = data.klines['1h'];
    if (!klines || klines.length < 5) {
      return { score: 50, description: 'Insufficient data', pattern: 'None', signal: 'NEUTRAL' };
    }

    // Get recent 3 candles
    const recent = klines.slice(-3).map(k => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));

    // Detect hammer pattern (bottom reversal)
    if (this.isHammerPattern(recent[recent.length - 1])) {
      return {
        score: 90,
        description: 'Hammer reversal pattern',
        pattern: 'Hammer',
        signal: 'LONG'
      };
    }

    // Detect inverted hammer (top reversal)
    if (this.isInvertedHammerPattern(recent[recent.length - 1])) {
      return {
        score: 85,
        description: 'Inverted hammer reversal pattern',
        pattern: 'Inverted Hammer',
        signal: 'SHORT'
      };
    }

    // 检测吞没形态
    const engulfing = this.isEngulfingPattern(recent[recent.length - 2], recent[recent.length - 1]);
    if (engulfing === 'BULLISH') {
      return {
        score: 88,
        description: 'Bullish Engulfing',
        pattern: 'Bullish Engulfing',
        signal: 'LONG'
      };
    } else if (engulfing === 'BEARISH') {
      return {
        score: 87,
        description: 'Bearish Engulfing',
        pattern: 'Bearish Engulfing',
        signal: 'SHORT'
      };
    }

    // 连续上涨/下跌
    const trend = this.detectContinuousTrend(recent);
    if (trend === 'UP') {
      return {
        score: 70,
        description: 'Uptrend',
        pattern: 'Consecutive Rise',
        signal: 'LONG'
      };
    } else if (trend === 'DOWN') {
      return {
        score: 70,
        description: 'Downtrend',
        pattern: 'Consecutive Fall',
        signal: 'SHORT'
      };
    }

    return {
      score: 50,
      description: 'No clear pattern',
      pattern: 'None',
      signal: 'NEUTRAL'
    };
  }

  /**
   * 4. Volume Analysis (15%)
   */
  async analyzeVolume(data) {
    const klines = data.klines['1h'];
    if (!klines || klines.length < 20) {
      return { score: 50, description: 'Insufficient data', signal: 'NEUTRAL' };
    }

    // 提取成交量
    const volumes = klines.map(k => parseFloat(k[5]));
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const latestVolume = volumes[volumes.length - 1];

    const volumeRatio = latestVolume / avgVolume;

    // 放量突破
    if (volumeRatio > 2) {
      return {
        score: 80,
        description: `Volume surge ${(volumeRatio * 100).toFixed(0)}%`,
        signal: 'LONG',
        volumeRatio
      };
    }
    // 温和放量
    else if (volumeRatio > 1.5) {
      return {
        score: 70,
        description: `Moderate volume increase ${(volumeRatio * 100).toFixed(0)}%`,
        signal: 'LONG',
        volumeRatio
      };
    }
    // 缩量
    else if (volumeRatio < 0.5) {
      return {
        score: 45,
        description: 'Volume decline',
        signal: 'NEUTRAL',
        volumeRatio
      };
    }
    // Normal
    else {
      return {
        score: 55,
        description: 'Normal volume',
        signal: 'NEUTRAL',
        volumeRatio
      };
    }
  }

  /**
   * 5. Key Price Levels Analysis (10%)
   */
  async analyzeKeyLevels(data) {
    const klines = data.klines['4h'];
    if (!klines || klines.length < 20) {
      return { score: 50, description: 'Insufficient data', signal: 'NEUTRAL' };
    }

    // Simplified: Find highest/lowest prices in recent 20 candles as resistance/support
    const highs = klines.slice(-20).map(k => parseFloat(k[2]));
    const lows = klines.slice(-20).map(k => parseFloat(k[3]));

    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    const currentPrice = data.currentPrice;

    // Near support level
    if (Math.abs(currentPrice - support) / support < 0.02) {
      return {
        score: 75,
        description: `Near support level $${support.toFixed(2)}`,
        signal: 'LONG',
        support,
        resistance
      };
    }
    // Near resistance level
    else if (Math.abs(currentPrice - resistance) / resistance < 0.02) {
      return {
        score: 70,
        description: `Near resistance level $${resistance.toFixed(2)}`,
        signal: 'SHORT',
        support,
        resistance
      };
    }
    // Breaking resistance
    else if (currentPrice > resistance) {
      return {
        score: 80,
        description: `Breaking resistance $${resistance.toFixed(2)}`,
        signal: 'LONG',
        support,
        resistance
      };
    }
    // Middle zone
    else {
      return {
        score: 55,
        description: 'Price between support and resistance',
        signal: 'NEUTRAL',
        support,
        resistance
      };
    }
  }

  /**
   * 6. RSI Analysis (5%)
   */
  async analyzeRSI(data) {
    const klines = data.klines['1h'];
    if (!klines || klines.length < 15) {
      return { score: 50, signal: 'NEUTRAL' };
    }

    const closes = klines.map(k => parseFloat(k[4]));
    const rsi = this.calculateRSI(closes, 14);

    if (rsi < 30) {
      return { score: 70, description: `RSI oversold (${rsi.toFixed(1)})`, signal: 'LONG', rsi };
    } else if (rsi > 70) {
      return { score: 65, description: `RSI overbought (${rsi.toFixed(1)})`, signal: 'SHORT', rsi };
    } else {
      return { score: 50, description: `RSI neutral (${rsi.toFixed(1)})`, signal: 'NEUTRAL', rsi };
    }
  }

  /**
   * 7. MACD Analysis (3%)
   */
  async analyzeMACD(data) {
    const klines = data.klines['1h'];
    if (!klines || klines.length < 30) {
      return { score: 50, signal: 'NEUTRAL' };
    }

    const closes = klines.map(k => parseFloat(k[4]));
    const macd = this.calculateMACD(closes);

    if (!macd) {
      return { score: 50, signal: 'NEUTRAL' };
    }

    // Golden cross
    if (macd.histogram > 0 && macd.prev_histogram <= 0) {
      return {
        score: 75,
        description: 'MACD golden cross',
        signal: 'LONG',
        macd: macd.macdLine
      };
    }
    // Death cross
    else if (macd.histogram < 0 && macd.prev_histogram >= 0) {
      return {
        score: 70,
        description: 'MACD death cross',
        signal: 'SHORT',
        macd: macd.macdLine
      };
    }
    // Positive
    else if (macd.histogram > 0) {
      return {
        score: 60,
        description: 'MACD positive',
        signal: 'LONG',
        macd: macd.macdLine
      };
    }
    // Negative
    else {
      return {
        score: 55,
        description: 'MACD negative',
        signal: 'SHORT',
        macd: macd.macdLine
      };
    }
  }

  /**
   * ==================== 🆕 新增风险分析维度 ====================
   */

  /**
   * 8. 回调风险分析 (8%)
   * 评估价格是否涨幅过大，存在回调风险
   */
  async analyzePullbackRisk(priceChange24h, rsiScore, data) {
    const change = parseFloat(priceChange24h) || 0;
    const rsi = rsiScore?.rsi || 50;

    // 🔴 超大涨幅 > 30%: 回调风险极高
    if (change > 30) {
      // 如果 RSI 也超买 (>70)，风险更高
      if (rsi > 70) {
        return {
          score: 15,
          signal: 'SELL',
          risk: 'EXTREME',
          description: `Overbought: +${change.toFixed(1)}%, RSI ${rsi.toFixed(0)}, pullback imminent`
        };
      }
      return {
        score: 25,
        signal: 'NEUTRAL',
        risk: 'HIGH',
        description: `Overbought: +${change.toFixed(1)}%, high pullback risk`
      };
    }

    // 🟠 大涨幅 20-30%: 回调风险中等
    else if (change > 20) {
      return {
        score: 40,
        signal: 'NEUTRAL',
        risk: 'MEDIUM',
        description: `Strong rally +${change.toFixed(1)}%, watch for pullback`
      };
    }

    // 🟡 中等涨幅 10-20%: 健康上涨
    else if (change > 10) {
      return {
        score: 70,
        signal: 'BUY',
        risk: 'LOW',
        description: `Healthy rally +${change.toFixed(1)}%`
      };
    }

    // 🟢 正常涨幅 < 10%: 无回调风险
    return {
      score: 75,
      signal: 'NEUTRAL',
      risk: 'LOW',
      description: `Normal price movement ${change > 0 ? '+' : ''}${change.toFixed(1)}%`
    };
  }

  /**
   * 9. 流动性风险分析 (10%)
   * 使用 Alpha API 的 liquidity 字段
   */
  async analyzeLiquidityRisk(tokenData) {
    const liquidity = parseFloat(tokenData.liquidity) || 0;
    const marketCap = parseFloat(tokenData.marketCap) || 1;
    const volume24h = parseFloat(tokenData.volume24h) || 0;

    // 计算流动性/市值比例
    const liquidityRatio = liquidity / marketCap;

    // 计算成交量/流动性比例 (turnover rate)
    const turnoverRate = liquidity > 0 ? volume24h / liquidity : 0;

    // 🔴 极低流动性 < $10K
    if (liquidity < 10000) {
      return {
        score: 10,
        signal: 'SELL',
        risk: 'EXTREME',
        description: `Liquidity trap: only $${(liquidity/1000).toFixed(1)}K, extremely hard to exit`
      };
    }

    // 🟠 低流动性 $10K-$100K
    else if (liquidity < 100000) {
      return {
        score: 30,
        signal: 'NEUTRAL',
        risk: 'HIGH',
        description: `Low liquidity $${(liquidity/1000).toFixed(1)}K, high slippage risk`
      };
    }

    // 🟡 中等流动性 $100K-$1M
    else if (liquidity < 1000000) {
      // 检查成交量是否健康 (turnover rate 应该 > 1)
      if (turnoverRate < 0.5) {
        return {
          score: 45,
          signal: 'NEUTRAL',
          risk: 'MEDIUM',
          description: `Medium liquidity $${(liquidity/1000).toFixed(0)}K, but low trading activity`
        };
      }

      return {
        score: 65,
        signal: 'NEUTRAL',
        risk: 'MEDIUM',
        description: `Medium liquidity $${(liquidity/1000).toFixed(0)}K`
      };
    }

    // 🟢 高流动性 > $1M
    else {
      return {
        score: 85,
        signal: 'NEUTRAL',
        risk: 'LOW',
        description: `High liquidity $${(liquidity/1000000).toFixed(2)}M, safe to trade`
      };
    }
  }

  /**
   * 10. 波动率风险分析 (6%)
   * 评估价格波动剧烈程度
   */
  async analyzeVolatilityRisk(klines, tokenData) {
    // 优先使用 Alpha API 的 priceHigh24h 和 priceLow24h
    if (tokenData && tokenData.priceHigh24h && tokenData.priceLow24h && tokenData.price) {
      const high24h = parseFloat(tokenData.priceHigh24h);
      const low24h = parseFloat(tokenData.priceLow24h);
      const currentPrice = parseFloat(tokenData.price);

      // 计算 24h 振幅
      const range24h = (high24h - low24h) / low24h * 100;

      // 🔴 极高波动 > 50%
      if (range24h > 50) {
        return {
          score: 15,
          risk: 'EXTREME',
          description: `Extreme volatility ${range24h.toFixed(1)}% range, SL may trigger easily`
        };
      }

      // 🟠 高波动 20-50%
      else if (range24h > 20) {
        return {
          score: 35,
          risk: 'HIGH',
          description: `High volatility ${range24h.toFixed(1)}% range`
        };
      }

      // 🟡 中等波动 10-20%
      else if (range24h > 10) {
        return {
          score: 60,
          risk: 'MEDIUM',
          description: `Medium volatility ${range24h.toFixed(1)}% range`
        };
      }

      // 🟢 正常波动 < 10%
      return {
        score: 75,
        risk: 'LOW',
        description: `Normal volatility ${range24h.toFixed(1)}% range`
      };
    }

    // Fallback: 使用 K线数据
    if (!klines || klines.length < 20) {
      return { score: 50, risk: 'UNKNOWN', description: 'Insufficient data' };
    }

    // 计算过去24小时的价格波动范围
    const recent24 = klines.slice(-24);
    let totalRange = 0;

    for (const k of recent24) {
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const range = (high - low) / low * 100;
      totalRange += range;
    }

    const avgVolatility = totalRange / recent24.length;

    // 🔴 极高波动 > 15%/小时
    if (avgVolatility > 15) {
      return {
        score: 20,
        risk: 'EXTREME',
        description: `Extreme volatility ${avgVolatility.toFixed(1)}%/h`
      };
    }

    // 🟠 高波动 5-15%
    else if (avgVolatility > 5) {
      return {
        score: 40,
        risk: 'HIGH',
        description: `High volatility ${avgVolatility.toFixed(1)}%/h`
      };
    }

    // 🟢 正常波动
    return {
      score: 70,
      risk: 'LOW',
      description: `Normal volatility ${avgVolatility.toFixed(1)}%/h`
    };
  }

  /**
   * 11. 清算风险分析 (4%)
   * 基于 OI/MC 比例评估双向爆仓风险
   */
  async analyzeLiquidationRisk(data) {
    const oiValue = data.openInterest?.current || 0;
    const mcValue = data.marketCap || 1;
    const oiMcRatio = oiValue / mcValue;
    const fundingRate = data.fundingRate?.current || 0;
    const oiChange = data.openInterest?.change24h || 0;

    // 如果没有 OI 数据 (DEX代币或现货)，返回低风险
    if (oiValue === 0) {
      return {
        score: 75,
        risk: 'LOW',
        description: 'No futures contract, no liquidation risk'
      };
    }

    // 🔴 OI/MC ≥ 1.0: 极高杠杆,双向爆仓风险
    if (oiMcRatio >= 1.0) {
      // 多头过热: FR正 + OI增加 → 多头挤压风险
      if (fundingRate > 0.01 && oiChange > 10) {
        return {
          score: 10,
          signal: 'SHORT',
          risk: 'EXTREME',
          description: `Long squeeze risk (OI/MC=${oiMcRatio.toFixed(2)}, FR=${(fundingRate*100).toFixed(2)}%)`
        };
      }

      // 空头过热: FR负 + OI增加 → 空头挤压风险
      else if (fundingRate < -0.01 && oiChange > 10) {
        return {
          score: 10,
          signal: 'LONG',
          risk: 'EXTREME',
          description: `Short squeeze risk (OI/MC=${oiMcRatio.toFixed(2)}, FR=${(fundingRate*100).toFixed(2)}%)`
        };
      }

      // 不明朗: 双向爆仓风险
      return {
        score: 20,
        signal: 'NEUTRAL',
        risk: 'EXTREME',
        description: `Both-way liquidation risk (OI/MC=${oiMcRatio.toFixed(2)})`
      };
    }

    // 🟠 OI/MC 0.5-1.0: 高杠杆市场
    else if (oiMcRatio >= 0.5) {
      return {
        score: 40,
        risk: 'HIGH',
        description: `High leverage market (OI/MC=${oiMcRatio.toFixed(2)})`
      };
    }

    // 🟡 OI/MC 0.2-0.5: 中等杠杆
    else if (oiMcRatio >= 0.2) {
      return {
        score: 60,
        risk: 'MEDIUM',
        description: `Medium leverage (OI/MC=${oiMcRatio.toFixed(2)})`
      };
    }

    // 🟢 OI/MC < 0.2: 相对安全
    return {
      score: 75,
      risk: 'LOW',
      description: `Safe leverage level (OI/MC=${oiMcRatio.toFixed(2)})`
    };
  }

  /**
   * 12. 新代币风险分析 (3%)
   * 使用 Alpha API 的 listingTime 字段
   */
  async analyzeNewTokenRisk(tokenData) {
    const listingTime = parseInt(tokenData.listingTime) || Date.now();
    const currentTime = Date.now();

    // 计算上市天数
    const ageInDays = (currentTime - listingTime) / (1000 * 60 * 60 * 24);

    // 🔴 极新代币 < 1天
    if (ageInDays < 1) {
      return {
        score: 20,
        risk: 'EXTREME',
        description: `Just listed ${ageInDays.toFixed(1)}d ago, extreme volatility expected`
      };
    }

    // 🟠 新代币 1-3天
    else if (ageInDays < 3) {
      return {
        score: 40,
        risk: 'HIGH',
        description: `New listing ${ageInDays.toFixed(1)}d ago, high volatility`
      };
    }

    // 🟡 较新代币 3-7天
    else if (ageInDays < 7) {
      return {
        score: 60,
        risk: 'MEDIUM',
        description: `Recent listing ${ageInDays.toFixed(1)}d ago`
      };
    }

    // 🟢 成熟代币 > 7天
    return {
      score: 75,
      risk: 'LOW',
      description: `Mature token (${ageInDays.toFixed(0)}d)`
    };
  }

  /**
   * 13. 巨鲸风险分析 (2%)
   * 估算持仓集中度
   */
  async analyzeWhaleRisk(tokenData) {
    const holders = parseInt(tokenData.holders) || 0;
    const circulatingSupply = parseFloat(tokenData.circulatingSupply) || 0;
    const totalSupply = parseFloat(tokenData.totalSupply) || 1;
    const circulationRatio = (circulatingSupply / totalSupply) * 100;

    // 使用持有人数和流通比例估算集中度
    let estimatedTop10Percent = 50; // 默认估算值

    // 🔴 高集中度估算: 流通率低 + 持有人少
    if (circulationRatio < 30 && holders < 5000) {
      estimatedTop10Percent = 75;
      return {
        score: 25,
        risk: 'HIGH',
        description: `Estimated high concentration: ~${estimatedTop10Percent}% (${holders} holders, ${circulationRatio.toFixed(1)}% circulation)`
      };
    }

    // 🟠 中等集中度
    else if (circulationRatio < 50 && holders < 10000) {
      estimatedTop10Percent = 60;
      return {
        score: 50,
        risk: 'MEDIUM',
        description: `Estimated medium concentration: ~${estimatedTop10Percent}% (${holders} holders)`
      };
    }

    // 🟢 分散持仓
    else if (holders > 10000) {
      estimatedTop10Percent = 40;
      return {
        score: 70,
        risk: 'LOW',
        description: `Decentralized: ~${estimatedTop10Percent}% (${holders.toLocaleString()} holders)`
      };
    }

    // 🟡 正常
    return {
      score: 60,
      risk: 'MEDIUM',
      description: `${holders.toLocaleString()} holders, ${circulationRatio.toFixed(1)}% circulation`
    };
  }

  /**
   * 14. 量价背离风险 (2%)
   */
  async analyzeVolumePriceDivergence(klines) {
    if (!klines || klines.length < 5) {
      return { score: 60, risk: 'LOW', description: 'Insufficient data' };
    }

    const recent = klines.slice(-5);

    // 检查最近5根K线的价格和成交量趋势
    let priceUp = true;
    let priceDown = true;
    let volumeUp = true;
    let volumeDown = true;

    for (let i = 1; i < recent.length; i++) {
      const prevClose = parseFloat(recent[i-1][4]);
      const currClose = parseFloat(recent[i][4]);
      const prevVolume = parseFloat(recent[i-1][5]);
      const currVolume = parseFloat(recent[i][5]);

      if (currClose <= prevClose) priceUp = false;
      if (currClose >= prevClose) priceDown = false;
      if (currVolume <= prevVolume) volumeUp = false;
      if (currVolume >= prevVolume) volumeDown = false;
    }

    // 🔴 价涨量缩 → 假突破
    if (priceUp && volumeDown) {
      return {
        score: 30,
        signal: 'SELL',
        risk: 'HIGH',
        description: 'Volume-price divergence: fake breakout (price up, volume down)'
      };
    }

    // 🟠 价跌量增 → 恐慌抛售
    if (priceDown && volumeUp) {
      return {
        score: 35,
        signal: 'SELL',
        risk: 'HIGH',
        description: 'Panic selling detected (price down, volume up)'
      };
    }

    // 🟢 正常
    return {
      score: 65,
      risk: 'LOW',
      description: 'No volume-price divergence'
    };
  }

  /**
   * 计算综合置信度 (v2.0 - 14维度)
   */
  calculateConfidence(scores) {
    // 🛡️ 安全获取分数，避免 undefined 导致 NaN
    const getScore = (scoreObj, dimensionName) => {
      if (!scoreObj || typeof scoreObj.score !== 'number' || isNaN(scoreObj.score)) {
        if (dimensionName && (!scoreObj || typeof scoreObj.score !== 'number' || isNaN(scoreObj.score))) {
          console.warn(`⚠️ Invalid score for ${dimensionName}: ${scoreObj?.score}`);
        }
        return 0;
      }
      return scoreObj.score;
    };

    // 检查权重是否有效
    const checkWeight = (weight, name) => {
      if (typeof weight !== 'number' || isNaN(weight)) {
        console.error(`⚠️ Invalid weight for ${name}: ${weight}`);
        return 0;
      }
      return weight;
    };

    let confidence =
      getScore(scores.oiFundingScore, 'oiFundingScore') * checkWeight(this.weights.oiFundingScore, 'oiFundingScore') +
      getScore(scores.trendScore, 'trendScore') * checkWeight(this.weights.trendScore, 'trendScore') +
      getScore(scores.patternScore, 'patternScore') * checkWeight(this.weights.patternScore, 'patternScore') +
      getScore(scores.volumeScore, 'volumeScore') * checkWeight(this.weights.volumeScore, 'volumeScore') +
      getScore(scores.keyLevelsScore, 'keyLevelsScore') * checkWeight(this.weights.keyLevelsScore, 'keyLevelsScore') +
      getScore(scores.rsiScore, 'rsiScore') * checkWeight(this.weights.rsiScore, 'rsiScore') +
      getScore(scores.macdScore, 'macdScore') * checkWeight(this.weights.macdScore, 'macdScore');

    // 🆕 新增风险维度
    if (scores.pullbackRisk) {
      confidence += getScore(scores.pullbackRisk, 'pullbackRisk') * checkWeight(this.weights.pullbackRisk, 'pullbackRisk');
    }
    if (scores.liquidityRisk) {
      confidence += getScore(scores.liquidityRisk, 'liquidityRisk') * checkWeight(this.weights.liquidityRisk, 'liquidityRisk');
    }
    if (scores.volatilityRisk) {
      confidence += getScore(scores.volatilityRisk, 'volatilityRisk') * checkWeight(this.weights.volatilityRisk, 'volatilityRisk');
    }
    if (scores.liquidationRisk) {
      confidence += getScore(scores.liquidationRisk, 'liquidationRisk') * checkWeight(this.weights.liquidationRisk, 'liquidationRisk');
    }
    if (scores.newTokenRisk) {
      confidence += getScore(scores.newTokenRisk, 'newTokenRisk') * checkWeight(this.weights.newTokenRisk, 'newTokenRisk');
    }
    if (scores.whaleRisk) {
      confidence += getScore(scores.whaleRisk, 'whaleRisk') * checkWeight(this.weights.whaleRisk, 'whaleRisk');
    }
    if (scores.volumePriceDivergence) {
      confidence += getScore(scores.volumePriceDivergence, 'volumePriceDivergence') * checkWeight(this.weights.volumePriceDivergence, 'volumePriceDivergence');
    }

    // 🛡️ 最终检查：确保结果不是 NaN
    if (isNaN(confidence)) {
      console.error('⚠️ Confidence calculation resulted in NaN, using default 50');
      console.error('   Debug - scores:', JSON.stringify(scores, null, 2));
      console.error('   Debug - weights:', JSON.stringify(this.weights, null, 2));
      return 50;
    }

    return Math.min(100, Math.max(0, confidence));
  }

  /**
   * 确定信号类型
   * @param {object} scores - 7维度分析结果
   * @param {object} data - 市场数据
   * @param {boolean} spotOnly - 是否仅现货模式
   */
  determineSignalType(scores, data, spotOnly = false) {
    // 统计各维度的信号倾向
    const signals = [
      scores.oiFundingScore.signal,
      scores.trendScore.signal,
      scores.patternScore.signal,
      scores.volumeScore.signal,
      scores.keyLevelsScore.signal,
      scores.rsiScore.signal,
      scores.macdScore.signal
    ];

    const longCount = signals.filter(s => s === 'LONG').length;
    const shortCount = signals.filter(s => s === 'SHORT').length;

    // 现货模式：降低阈值到2个维度
    if (spotOnly) {
      if (longCount >= 2) return 'BUY';
      if (shortCount >= 2) return 'SELL';
      return 'NEUTRAL';
    }

    // 期货模式：保持原来的严格阈值（>= 3），确保信号质量
    if (longCount >= 3) return 'LONG';
    if (shortCount >= 3) return 'SHORT';

    return 'NEUTRAL';
  }

  /**
   * 生成交易计划
   */
  generateTradingPlan(signalType, data, confidence) {
    const currentPrice = data.currentPrice;

    // LONG和BUY都是做多：买入后等待上涨
    if (signalType === 'LONG' || signalType === 'BUY') {
      return {
        currentPrice,
        entryMin: currentPrice * 0.98, // -2%入场下限
        entryMax: currentPrice * 1.01, // +1%入场上限
        stopLoss: currentPrice * 0.95, // -5%止损（价格下跌）
        takeProfit1: currentPrice * 1.05, // +5%止盈1（价格上涨）
        takeProfit2: currentPrice * 1.10, // +10%止盈2
        takeProfit3: currentPrice * 1.15 // +15%止盈3
      };
    }
    // SHORT和SELL都是做空：卖出后等待下跌
    else if (signalType === 'SHORT' || signalType === 'SELL') {
      return {
        currentPrice,
        entryMin: currentPrice * 0.99,
        entryMax: currentPrice * 1.02,
        stopLoss: currentPrice * 1.05, // +5%止损（价格上涨）
        takeProfit1: currentPrice * 0.95, // -5%止盈1（价格下跌）
        takeProfit2: currentPrice * 0.90, // -10%止盈2
        takeProfit3: currentPrice * 0.85 // -15%止盈3
      };
    }
    // NEUTRAL：不建议操作，使用做空的TP/SL作为默认
    else {
      return {
        currentPrice,
        entryMin: currentPrice * 0.98,
        entryMax: currentPrice * 1.02,
        stopLoss: currentPrice * 1.05,
        takeProfit1: currentPrice * 0.95,
        takeProfit2: currentPrice * 0.90,
        takeProfit3: currentPrice * 0.85
      };
    }
  }

  /**
   * 生成推理文本
   */
  generateReasoning(scores, data, signalType) {
    const parts = [];

    if (scores.oiFundingScore.score >= 75) {
      parts.push(scores.oiFundingScore.description);
    }

    if (scores.trendScore.score >= 70) {
      parts.push(scores.trendScore.description);
    }

    if (scores.patternScore.score >= 70) {
      parts.push(`Detected ${scores.patternScore.pattern} pattern`);
    }

    if (scores.volumeScore.score >= 70) {
      parts.push(scores.volumeScore.description);
    }

    const action = signalType === 'LONG' ? 'Buy on dips recommended' : 'Sell on rallies recommended';
    parts.push(action);

    return parts.join(', ');
  }

  /**
   * 计算风险等级
   */
  calculateRiskLevel(confidence, data) {
    if (confidence >= 85) return 'LOW';
    if (confidence >= 75) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Get adjustment reason label based on confidence change and insight
   */
  getAdjustmentReason(adjustment, insight) {
    if (!insight) return 'UNKNOWN';

    const insightLower = insight.toLowerCase();

    // Detect reason from insight text
    if (insightLower.includes('weekend') || insightLower.includes('saturday') || insightLower.includes('sunday')) {
      return 'WEEKEND_HIGH_RISK';
    }
    if (insightLower.includes('liquidity') || insightLower.includes('volume')) {
      return adjustment < 0 ? 'LOW_LIQUIDITY_RISK' : 'HIGH_LIQUIDITY_OPPORTUNITY';
    }
    if (insightLower.includes('pullback') || insightLower.includes('correction')) {
      return 'PULLBACK_RISK';
    }
    if (insightLower.includes('win rate') || insightLower.includes('success rate')) {
      return adjustment < 0 ? 'LOW_HISTORICAL_WIN_RATE' : 'HIGH_HISTORICAL_WIN_RATE';
    }
    if (insightLower.includes('time') || insightLower.includes('hour')) {
      return adjustment < 0 ? 'UNFAVORABLE_TIME' : 'FAVORABLE_TIME';
    }

    return adjustment < 0 ? 'HISTORICAL_UNDERPERFORMANCE' : 'HISTORICAL_OUTPERFORMANCE';
  }

  /**
   * Calculate expected return
   */
  calculateExpectedReturn(entryPrice, targetPrice, signalType) {
    if (!entryPrice || !targetPrice || entryPrice <= 0) return null;

    if (signalType === 'LONG' || signalType === 'BUY') {
      return parseFloat(((targetPrice - entryPrice) / entryPrice * 100).toFixed(2));
    } else if (signalType === 'SHORT' || signalType === 'SELL') {
      return parseFloat(((entryPrice - targetPrice) / entryPrice * 100).toFixed(2));
    } else {
      // NEUTRAL 信号返回 0
      return 0;
    }
  }

  /**
   * 生成信号ID
   */
  generateSignalId(symbol) {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `SIG-${date}-${symbol}-${random}`;
  }

  /**
   * 根据代币推断所在链
   * 优先级: Base > BSC (因为 Base 生态较新)
   */
  getChainForToken(tokenSymbol) {
    // Base 生态代币列表
    const baseTokens = ['RECALL', 'DEGEN', 'BRETT', 'TOSHI', 'MOCHI', 'VIRTUAL'];

    // 检查是否是 Base 代币
    if (baseTokens.includes(tokenSymbol.toUpperCase())) {
      return 'Base';
    }

    // 默认 BSC (Binance Smart Chain)
    return 'BSC';
  }

  /**
   * 保存信号到数据库
   */
  async saveSignal(signal) {
    // 🔗 识别代币所属链
    const chain = this.getChainForToken(signal.tokenSymbol);

    // 🛡️ Helper function to convert NaN to null with detailed logging
    const sanitizeValue = (value, fieldName) => {
      if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
        console.warn(`   ⚠️ Found NaN/Infinity in field "${fieldName}", converting to null`);
        console.warn(`      Original value:`, value);
        return null;
      }
      return value;
    };

    // 🔍 Debug: Check for NaN values in signal object
    const nanFields = [];
    for (const [key, value] of Object.entries(signal)) {
      if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
        nanFields.push(key);
      }
    }
    if (nanFields.length > 0) {
      console.error(`   ❌ NaN fields detected in signal:`, nanFields.join(', '));
      console.error(`      Signal object:`, JSON.stringify(signal, null, 2));
    }

    const query = `
      INSERT INTO alpha_signals (
        signal_id, agent_id, token_symbol, chain, contract_address, signal_type, confidence_score, risk_level,
        current_price, entry_min, entry_max, stop_loss,
        take_profit_1, take_profit_2, take_profit_3,
        oi_change_24h, funding_rate, trend_analysis, pattern_detected, volume_analysis,
        support_level, resistance_level, oi_value, market_cap, oi_mc_ratio,
        reasoning, generation_params, predicted_direction, predicted_price_24h, predicted_return_percent,
        liquidity_usd, liquidity_checked_at, dex, price_source,
        original_confidence, confidence_adjustment, flock_source, flock_similar_cases, flock_analysis, flock_adjustment_reason,
        status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const results = await DatabaseService.query(query, [
        signal.signalId, 999, signal.tokenSymbol, chain, signal.contractAddress, signal.signalType, sanitizeValue(signal.confidence, 'confidence'), signal.riskLevel,
        sanitizeValue(signal.currentPrice, 'currentPrice'), sanitizeValue(signal.entryMin, 'entryMin'), sanitizeValue(signal.entryMax, 'entryMax'), sanitizeValue(signal.stopLoss, 'stopLoss'),
        sanitizeValue(signal.takeProfit1, 'takeProfit1'), sanitizeValue(signal.takeProfit2, 'takeProfit2'), sanitizeValue(signal.takeProfit3, 'takeProfit3'),
        sanitizeValue(signal.oiChange24h, 'oiChange24h'), sanitizeValue(signal.fundingRate, 'fundingRate'), signal.trendAnalysis, signal.patternDetected, signal.volumeAnalysis,
        sanitizeValue(signal.supportLevel, 'supportLevel'), sanitizeValue(signal.resistanceLevel, 'resistanceLevel'), sanitizeValue(signal.oiValue, 'oiValue'), sanitizeValue(signal.marketCap, 'marketCap'), sanitizeValue(signal.oiMcRatio, 'oiMcRatio'),
        signal.reasoning, signal.generationParams, signal.predictedDirection, sanitizeValue(signal.predictedPrice24h, 'predictedPrice24h'), sanitizeValue(signal.predictedReturnPercent, 'predictedReturnPercent'),
        sanitizeValue(signal.liquidityUsd, 'liquidityUsd') || null, signal.liquidityCheckedAt || null, signal.dex || null, signal.priceSource || 'BINANCE',
        // FLock enhancement fields (for hackathon demo)
        signal.originalConfidence !== undefined ? sanitizeValue(signal.originalConfidence, 'originalConfidence') : null,
        signal.confidenceAdjustment !== undefined ? sanitizeValue(signal.confidenceAdjustment, 'confidenceAdjustment') : null,
        signal.flockInsight?.source || null,
        signal.flockInsight?.similarCasesCount !== undefined ? signal.flockInsight.similarCasesCount : null,
        signal.flockInsight?.analysis || null,
        signal.flockInsight?.adjustmentReason || null,
        signal.status, signal.createdAt, signal.expiresAt
      ]);

      console.log(`   💾 Signal saved: ${signal.signalId}`);

      // 🚀 触发自动交易系统 - 通知所有启用自动跟单的用户
      try {
        // 构建符合 AutoTradeService 期望的信号格式
        const autoTradeSignal = {
          signal_id: signal.signalId,
          token_symbol: signal.tokenSymbol,
          chain: this.getChainForToken(signal.tokenSymbol), // 根据代币推断链
          contract_address: signal.contractAddress, // ✅ 传递合约地址
          confidence_score: signal.confidence, // ✅ 传递置信度
          entry_min: signal.entryMin,
          entry_max: signal.entryMax,
          stop_loss_price: signal.stopLoss,
          take_profit_price: signal.takeProfit1, // 使用第一个止盈位
          current_price: signal.currentPrice,
          signal_type: signal.signalType,
          created_at: signal.createdAt
        };

        console.log(`   🔔 Triggering auto-trade for ${signal.signalId} (${signal.signalType}, ${signal.tokenSymbol})...`);

        // 异步触发自动交易，不阻塞信号保存
        setImmediate(() => {
          console.log(`   📞 setImmediate callback executing for ${signal.signalId}...`);
          AutoTradeService.handleNewSignal(autoTradeSignal)
            .then(() => {
              console.log(`   🤖 Auto-trade triggered for signal: ${signal.signalId}`);
            })
            .catch(err => {
              console.error(`   ⚠️ Auto-trade failed for ${signal.signalId}:`, err.message);
            });
        });
      } catch (autoTradeError) {
        // 自动交易失败不影响信号保存
        console.error(`   ⚠️ Auto-trade trigger error:`, autoTradeError.message);
      }

      return results;
    } catch (error) {
      console.error('❌ Error saving signal:', error.message);
      throw error;
    }
  }

  // ==================== 技术指标计算工具函数 ====================

  calculateMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateMACD(prices) {
    if (prices.length < 26) return null;

    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;

    // 简化: signal line = macd的9日EMA
    const signalLine = macdLine * 0.9; // 简化

    const histogram = macdLine - signalLine;
    const prev_histogram = prices.length > 27 ? histogram * 0.95 : 0; // 简化

    return { macdLine, signalLine, histogram, prev_histogram };
  }

  calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  isHammerPattern(candle) {
    const body = Math.abs(candle.close - candle.open);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);

    return lowerShadow > body * 2 && upperShadow < body * 0.5 && candle.close > candle.open;
  }

  isInvertedHammerPattern(candle) {
    const body = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;

    return upperShadow > body * 2 && lowerShadow < body * 0.5 && candle.close < candle.open;
  }

  isEngulfingPattern(prev, current) {
    // 看涨吞没: 前阴后阳，且阳线实体完全吞没阴线
    if (prev.close < prev.open && current.close > current.open) {
      if (current.close > prev.open && current.open < prev.close) {
        return 'BULLISH';
      }
    }

    // 看跌吞没
    if (prev.close > prev.open && current.close < current.open) {
      if (current.open > prev.close && current.close < prev.open) {
        return 'BEARISH';
      }
    }

    return null;
  }

  detectContinuousTrend(candles) {
    if (candles.length < 3) return null;

    const allUp = candles.every((c, i) => i === 0 || c.close > candles[i - 1].close);
    const allDown = candles.every((c, i) => i === 0 || c.close < candles[i - 1].close);

    if (allUp) return 'UP';
    if (allDown) return 'DOWN';
    return null;
  }

  // ==================== DEX代币简化分析 ====================

  /**
   * DEX代币简化分析（无K线数据）
   * 只使用基础数据: 价格、涨跌幅、交易量、市值、持有人数
   * @param {Object} tokenData - DEX代币数据
   */
  async analyzeDEXToken(tokenData) {
    console.log(`\n🔍 Analyzing DEX token ${tokenData.symbol}...`);

    try {
      const {
        symbol,
        price,
        priceChange24h,
        volume24h,
        marketCap,
        holders,
        chain
      } = tokenData;

      // 🔧 优化: 合约地址直接从 Alpha API 获取,不再调用 DexScreener
      let contractAddress = tokenData.contractAddress;

      // 如果 Alpha API 没有提供合约地址,跳过该代币
      if (!contractAddress || contractAddress === 'null' || contractAddress === '') {
        console.log(`   ⚠️ No contract address from Alpha API, skipping...`);
        return null;
      }

      // 验证数据完整性
      if (!price || price <= 0) {
        console.warn(`   ⚠️ Invalid price for ${symbol}`);
        return null;
      }

      // 🆕 12维度分析 (DEX代币: 5个原有维度 + 7个新风险维度)
      const scores = {
        // 原有 5 维度
        priceChangeScore: this.analyzePriceChange(priceChange24h),
        volumeScore: this.analyzeDEXVolume(volume24h, marketCap),
        marketCapScore: this.analyzeMarketCap(marketCap),
        holdersScore: this.analyzeHolders(holders),
        momentumScore: this.analyzeMomentum(priceChange24h, volume24h),

        // 🆕 新增 7 个风险维度
        pullbackRisk: await this.analyzePullbackRisk(priceChange24h, { rsi: 50 }, tokenData),
        liquidityRisk: await this.analyzeLiquidityRisk(tokenData),
        volatilityRisk: await this.analyzeVolatilityRisk(null, tokenData),
        liquidationRisk: { score: 75, risk: 'LOW', description: 'No futures contract' }, // DEX无期货
        newTokenRisk: await this.analyzeNewTokenRisk(tokenData),
        whaleRisk: await this.analyzeWhaleRisk(tokenData),
        volumePriceDivergence: { score: 60, risk: 'LOW', description: 'No K-line data' } // DEX无K线
      };

      // 计算置信度 (使用新的权重)
      const confidence = this.calculateDEXConfidenceV2(scores);

      // 确定信号类型
      const signalType = this.determineDEXSignalType(scores, priceChange24h);

      // 生成交易计划（DEX代币只用现货逻辑）
      const tradingPlan = {
        currentPrice: parseFloat(price),
        entryMin: parseFloat(price) * 0.98,
        entryMax: parseFloat(price) * 1.02,
        stopLoss: parseFloat(price) * 0.90,
        takeProfit1: parseFloat(price) * 1.15,
        takeProfit2: parseFloat(price) * 1.30,
        takeProfit3: parseFloat(price) * 1.50
      };

      // 生成推理
      const reasoning = this.generateDEXReasoning(scores, tokenData, signalType);

      // FLock Query for DEX tokens
      let knowledgeInsight = null;
      let confidenceAdjustment = 0;
      let knowledgeResult = null;

      if (this.enableHistoricalLearning && this.knowledgeProvider) {
        try {
          console.log(`   🔍 Querying knowledge provider for DEX ${symbol} ${signalType}...`);

          // Build market condition for DEX tokens
          const marketCondition = {
            price_change_24h: priceChange24h || 0,
            volume_mc_ratio: volume24h && marketCap ? (volume24h / marketCap) : 0,
            oi_mc_ratio: 0, // DEX tokens have no OI
            day_of_week: new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(),
            hour_of_day: new Date().getUTCHours(),
            btc_trend: 'NEUTRAL', // DEX tokens don't have BTC correlation
            market_cap: marketCap || 0
          };

          // Query historical cases
          knowledgeResult = await this.knowledgeProvider.queryHistoricalCases(
            symbol,
            signalType,
            marketCondition
          );

          if (knowledgeResult.success) {
            knowledgeInsight = knowledgeResult.answer;
            confidenceAdjustment = this.knowledgeProvider.parseConfidenceAdjustment(knowledgeResult.answer);

            console.log(`   ✅ Knowledge retrieved from ${knowledgeResult.source}`);
            console.log(`   📊 Similar cases: ${knowledgeResult.similar_cases_count || 0}`);
            if (confidenceAdjustment !== 0) {
              console.log(`   🎯 Confidence adjustment: ${confidenceAdjustment > 0 ? '+' : ''}${confidenceAdjustment}`);
            }
          }
        } catch (error) {
          console.error(`   ❌ Knowledge query failed: ${error.message}`);
        }
      }

      // Apply confidence adjustment
      const adjustedConfidence = Math.max(0, Math.min(100, confidence + confidenceAdjustment));

      // 构建信号对象
      const signal = {
        signalId: this.generateSignalId(symbol),
        tokenSymbol: symbol,
        contractAddress: contractAddress, // ✅ DEX代币合约地址 (已验证存在)
        chain: chain || 'BSC', // 🔧 添加链信息
        signalType,
        confidence: parseFloat(adjustedConfidence.toFixed(2)),
        originalConfidence: knowledgeResult ? parseFloat(confidence.toFixed(2)) : undefined,
        confidenceAdjustment: knowledgeResult ? confidenceAdjustment : undefined,
        riskLevel: this.calculateRiskLevel(adjustedConfidence, { volume24h, marketCap }),

        flockInsight: knowledgeResult ? {
          source: knowledgeResult.source || 'Unknown',
          similarCasesCount: knowledgeResult.similar_cases_count || 0,
          analysis: knowledgeInsight || 'No historical insights available',
          adjustmentReason: confidenceAdjustment !== 0 ? this.getAdjustmentReason(confidenceAdjustment, knowledgeInsight) : 'NO_ADJUSTMENT'
        } : null,

        ...tradingPlan,

        // DEX特有数据
        oiChange24h: null,
        fundingRate: null,
        trendAnalysis: scores.priceChangeScore.description || '',
        patternDetected: 'N/A (DEX token - basic analysis)',
        volumeAnalysis: scores.volumeScore.description || '',

        supportLevel: null,
        resistanceLevel: null,
        oiValue: null,
        marketCap: marketCap || null,
        oiMcRatio: null,

        reasoning,

        generationParams: JSON.stringify({
          version: 'v1.0-DEX',
          analysisType: 'simplified',
          dimensions: 5
        }),

        predictedDirection: (signalType === 'BUY' || signalType === 'LONG') ? 'UP' :
                            (signalType === 'SELL' || signalType === 'SHORT') ? 'DOWN' : 'NEUTRAL',
        predictedPrice24h: signalType === 'BUY' || signalType === 'LONG' ?
                           parseFloat(price) * 1.10 :
                           parseFloat(price) * 0.90,
        predictedReturnPercent: signalType === 'BUY' || signalType === 'LONG' ? 10 : -10,

        status: 'ACTIVE',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24小时后过期
      };

      const signalEmoji = signalType === 'LONG' ? '📈' :
                          signalType === 'SHORT' ? '📉' :
                          signalType === 'BUY' ? '💰' :
                          signalType === 'SELL' ? '💸' : '⚖️';
      console.log(`   ${signalEmoji} DEX Signal: ${signalType} @ ${confidence.toFixed(2)}%`);

      // 🔧 DEX 代币直接保存信号，流动性检查由 AutoTradeService 在交易前进行
      // 不在信号生成阶段调用 DexScreener API，避免 API 限流和延迟
      signal.priceSource = 'ALPHA_API';
      signal.dex = null;
      signal.liquidityUsd = null;
      signal.liquidityCheckedAt = null;

      console.log(`   ✅ Saving DEX signal (liquidity will be checked before trade execution)...`);

      // 保存信号
      await this.saveSignal(signal);

      return signal;

    } catch (error) {
      console.error(`❌ Error analyzing DEX token ${tokenData.symbol}:`, error.message);
      return null;
    }
  }

  /**
   * 1. 价格涨跌幅分析 (30%)
   */
  analyzePriceChange(priceChange24h) {
    const change = parseFloat(priceChange24h) || 0;

    if (change > 50) {
      return { score: 85, description: `Surge +${change.toFixed(2)}%`, signal: 'BUY' };
    } else if (change > 20) {
      return { score: 75, description: `Strong rally +${change.toFixed(2)}%`, signal: 'BUY' };
    } else if (change > 10) {
      return { score: 65, description: `Rally +${change.toFixed(2)}%`, signal: 'BUY' };
    } else if (change > 5) {
      return { score: 60, description: `Slight up +${change.toFixed(2)}%`, signal: 'NEUTRAL' };
    } else if (change > -5) {
      return { score: 50, description: `Sideways ${change.toFixed(2)}%`, signal: 'NEUTRAL' };
    } else if (change > -10) {
      return { score: 45, description: `Slight down ${change.toFixed(2)}%`, signal: 'NEUTRAL' };
    } else if (change > -20) {
      return { score: 35, description: `Decline ${change.toFixed(2)}%`, signal: 'SELL' };
    } else {
      return { score: 25, description: `Sharp drop ${change.toFixed(2)}%`, signal: 'SELL' };
    }
  }

  /**
   * 2. DEX交易量分析 (25%)
   */
  analyzeDEXVolume(volume24h, marketCap) {
    const vol = parseFloat(volume24h) || 0;
    const mc = parseFloat(marketCap) || 1;
    const volumeRatio = vol / mc; // 交易量/市值比率

    if (volumeRatio > 1.0) {
      return { score: 85, description: `Very high volume (${volumeRatio.toFixed(2)}x)`, signal: 'BUY' };
    } else if (volumeRatio > 0.5) {
      return { score: 75, description: `High volume (${volumeRatio.toFixed(2)}x)`, signal: 'BUY' };
    } else if (volumeRatio > 0.2) {
      return { score: 65, description: `Active trading (${volumeRatio.toFixed(2)}x)`, signal: 'NEUTRAL' };
    } else if (volumeRatio > 0.1) {
      return { score: 55, description: `Moderate volume (${volumeRatio.toFixed(2)}x)`, signal: 'NEUTRAL' };
    } else {
      return { score: 40, description: `Low volume (${volumeRatio.toFixed(2)}x)`, signal: 'NEUTRAL' };
    }
  }

  /**
   * 3. 市值分析 (20%)
   */
  analyzeMarketCap(marketCap) {
    const mc = parseFloat(marketCap) || 0;

    if (mc > 100000000) { // >$100M
      return { score: 70, description: `Large cap $${(mc / 1000000).toFixed(1)}M`, signal: 'NEUTRAL' };
    } else if (mc > 50000000) { // >$50M
      return { score: 65, description: `Mid-large cap $${(mc / 1000000).toFixed(1)}M`, signal: 'NEUTRAL' };
    } else if (mc > 10000000) { // >$10M
      return { score: 60, description: `Mid cap $${(mc / 1000000).toFixed(1)}M`, signal: 'NEUTRAL' };
    } else if (mc > 1000000) { // >$1M
      return { score: 50, description: `Small cap $${(mc / 1000000).toFixed(1)}M`, signal: 'NEUTRAL' };
    } else {
      return { score: 40, description: `Micro cap $${(mc / 1000).toFixed(1)}K`, signal: 'NEUTRAL' };
    }
  }

  /**
   * 4. 持有人数分析 (15%)
   */
  analyzeHolders(holders) {
    const h = parseInt(holders) || 0;

    if (h > 50000) {
      return { score: 80, description: `${h.toLocaleString()} holders`, signal: 'BUY' };
    } else if (h > 20000) {
      return { score: 70, description: `${h.toLocaleString()} holders`, signal: 'NEUTRAL' };
    } else if (h > 10000) {
      return { score: 60, description: `${h.toLocaleString()} holders`, signal: 'NEUTRAL' };
    } else if (h > 5000) {
      return { score: 55, description: `${h.toLocaleString()} holders`, signal: 'NEUTRAL' };
    } else {
      return { score: 45, description: `${h.toLocaleString()} holders`, signal: 'NEUTRAL' };
    }
  }

  /**
   * 5. Momentum Analysis (10%) - Combines price change and volume
   */
  analyzeMomentum(priceChange24h, volume24h) {
    const change = parseFloat(priceChange24h) || 0;
    const vol = parseFloat(volume24h) || 0;

    // Strong upward momentum + high volume
    if (change > 20 && vol > 10000000) {
      return { score: 85, description: 'Strong upward momentum', signal: 'BUY' };
    }
    // Strong downward momentum + high volume
    else if (change < -20 && vol > 10000000) {
      return { score: 30, description: 'Strong downward momentum', signal: 'SELL' };
    }
    // Rising but low volume
    else if (change > 10 && vol < 1000000) {
      return { score: 55, description: 'Rising with insufficient volume', signal: 'NEUTRAL' };
    }
    // Falling but low volume
    else if (change < -10 && vol < 1000000) {
      return { score: 50, description: 'Falling with insufficient volume', signal: 'NEUTRAL' };
    }
    // Sideways
    else {
      return { score: 50, description: 'Sideways movement', signal: 'NEUTRAL' };
    }
  }

  /**
   * 计算DEX代币置信度 (保留旧版本兼容)
   */
  calculateDEXConfidence(scores) {
    const weights = {
      priceChangeScore: 0.30,
      volumeScore: 0.25,
      marketCapScore: 0.20,
      holdersScore: 0.15,
      momentumScore: 0.10
    };

    let confidence = 0;
    for (const [key, weight] of Object.entries(weights)) {
      confidence += (scores[key]?.score || 50) * weight;
    }

    return confidence;
  }

  /**
   * 🆕 计算DEX代币置信度 v2.0 (包含风险维度)
   */
  calculateDEXConfidenceV2(scores) {
    const weights = {
      // 原有 5 维度 (调整权重)
      priceChangeScore: 0.18,    // 30% → 18%
      volumeScore: 0.15,         // 25% → 15%
      marketCapScore: 0.12,      // 20% → 12%
      holdersScore: 0.10,        // 15% → 10%
      momentumScore: 0.07,       // 10% → 7%

      // 🆕 新增 7 个风险维度
      pullbackRisk: 0.10,        // 回调风险
      liquidityRisk: 0.12,       // 流动性风险 (最重要!)
      volatilityRisk: 0.08,      // 波动率风险
      liquidationRisk: 0.02,     // 清算风险 (DEX很少有)
      newTokenRisk: 0.04,        // 新代币风险
      whaleRisk: 0.03,           // 巨鲸风险
      volumePriceDivergence: 0.01 // 量价背离 (DEX无K线，权重低)
    };

    let confidence = 0;
    for (const [key, weight] of Object.entries(weights)) {
      confidence += (scores[key]?.score || 50) * weight;
    }

    return confidence;
  }

  /**
   * 确定DEX信号类型
   */
  determineDEXSignalType(scores, priceChange24h) {
    const signals = Object.values(scores).map(s => s.signal);
    const buyCount = signals.filter(s => s === 'BUY').length;
    const sellCount = signals.filter(s => s === 'SELL').length;

    // DEX代币使用BUY/SELL信号
    if (buyCount >= 3) return 'BUY';
    if (sellCount >= 3) return 'SELL';

    // 如果维度不够，看价格涨跌
    const change = parseFloat(priceChange24h) || 0;
    if (change > 10) return 'BUY';
    if (change < -10) return 'SELL';

    return 'NEUTRAL';
  }

  /**
   * 生成DEX推理
   */
  generateDEXReasoning(scores, tokenData, signalType) {
    const parts = [];

    parts.push(`[DEX Token Simplified Analysis]`);
    parts.push(`Token: ${tokenData.name} (${tokenData.symbol})`);
    parts.push(`Chain: ${tokenData.chain}`);
    parts.push(`Price: $${tokenData.price}`);
    parts.push(`24h Change: ${tokenData.priceChange24h}%`);
    parts.push(`Market Cap: $${(tokenData.marketCap / 1000000).toFixed(2)}M`);
    parts.push(`Holders: ${tokenData.holders.toLocaleString()}`);
    parts.push('');
    parts.push('[5-Dimension Analysis]');
    parts.push(`1. ${scores.priceChangeScore.description}`);
    parts.push(`2. ${scores.volumeScore.description}`);
    parts.push(`3. ${scores.marketCapScore.description}`);
    parts.push(`4. ${scores.holdersScore.description}`);
    parts.push(`5. ${scores.momentumScore.description}`);
    parts.push('');
    parts.push(`[Signal Type] ${signalType}`);

    return parts.join('\n');
  }

  // ==================== AI增强分析 ====================

  /**
   * AI增强推理生成
   * 结合技术分析 + 历史知识 + DeepSeek AI
   */
  async generateReasoningWithAI(scores, data, signalType, symbol, historicalCases = [], knowledgeInsight = null) {
    // 如果AI未启用，使用传统方式
    if (!this.enableAI || !DeepSeekService.isAvailable) {
      // 即使不使用AI，也可以附加知识见解
      let reasoning = this.generateReasoning(scores, data, signalType);
      if (knowledgeInsight) {
        reasoning += `\n\n[Historical Knowledge]\n${knowledgeInsight}`;
      }
      return reasoning;
    }

    try {
      console.log(`   🤖 Generating AI-enhanced reasoning for ${symbol}...`);

      // 1. 构建技术分析摘要
      const technicalSummary = this.buildTechnicalSummary(scores, data, signalType);

      // 2. 构建历史案例摘要（兼容旧方式）
      const historicalSummary = this.buildHistoricalSummary(historicalCases);

      // 3. 构建AI提示词（包含新的知识见解）
      const prompt = this.buildAIPrompt(symbol, signalType, technicalSummary, historicalSummary, knowledgeInsight);

      // 4. 调用DeepSeek AI
      const aiReasoning = await DeepSeekService.createChatCompletion(
        [
          {
            role: 'system',
            content: 'You are a professional cryptocurrency trading analyst specializing in technical analysis and market forecasting. Based on the provided technical indicators and historical data, provide concise and professional trading analysis. IMPORTANT: Always respond in English only, never use Chinese or other languages.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        'deepseek-chat',
        500 // 限制500 tokens，保持简洁
      );

      console.log(`   ✅ AI reasoning generated (${aiReasoning.length} chars)`);

      return aiReasoning;

    } catch (error) {
      console.error(`   ❌ Error in AI reasoning:`, error.message);
      // 失败时回退到传统方式
      return this.generateReasoning(scores, data, signalType);
    }
  }

  /**
   * 构建技术分析摘要
   */
  buildTechnicalSummary(scores, data, signalType) {
    const parts = [];

    parts.push(`Signal Type: ${signalType}`);
    parts.push(`Current Price: $${data.currentPrice}`);

    if (scores.oiFundingScore && scores.oiFundingScore.score >= 60) {
      parts.push(`OI Change 24h: ${data.openInterest?.change24h}%`);
      parts.push(`Funding Rate: ${(data.fundingRate?.current * 100).toFixed(4)}%`);

      // 添加OI/MC比例（关键杠杆指标）
      if (data.openInterest?.current && data.marketCap) {
        const oiValue = data.openInterest.current;
        const mcValue = data.marketCap;
        const oiMcRatio = (oiValue / mcValue).toFixed(4);
        const ratioDisplay = `1:${(mcValue / oiValue).toFixed(2)}`;
        const oiChange = data.openInterest?.change24h || 0;
        const fundingRate = data.fundingRate?.current || 0;

        parts.push(`OI: $${(oiValue / 1000000).toFixed(2)}M`);
        parts.push(`Market Cap: $${(mcValue / 1000000).toFixed(2)}M`);
        parts.push(`OI/MC Ratio: ${oiMcRatio} (${ratioDisplay})`);

        // Data provided to AI for dynamic analysis (no fixed rules here)
      }
    }

    if (scores.trendScore && scores.trendScore.description) {
      parts.push(`Trend: ${scores.trendScore.description}`);
    }

    if (scores.patternScore && scores.patternScore.pattern && scores.patternScore.pattern !== 'None') {
      parts.push(`Pattern: ${scores.patternScore.pattern}`);
    }

    if (scores.volumeScore && scores.volumeScore.description) {
      parts.push(`Volume: ${scores.volumeScore.description}`);
    }

    if (scores.rsiScore && scores.rsiScore.rsi) {
      parts.push(`RSI: ${scores.rsiScore.rsi.toFixed(1)}`);
    }

    // Add K-line data summary for AI analysis
    if (data.klines) {
      const klines1h = data.klines['1h'];
      const klines4h = data.klines['4h'];

      if (klines1h && klines1h.length >= 5) {
        const recent5 = klines1h.slice(-5);
        const klinesText = recent5.map((k, i) => {
          const open = parseFloat(k[1]);
          const high = parseFloat(k[2]);
          const low = parseFloat(k[3]);
          const close = parseFloat(k[4]);
          const volume = parseFloat(k[5]);
          const change = ((close - open) / open * 100).toFixed(2);
          const candle = close > open ? '🟢' : '🔴';
          return `  ${candle} ${i+1}h ago: O:${open.toFixed(4)} H:${high.toFixed(4)} L:${low.toFixed(4)} C:${close.toFixed(4)} (${change}%) Vol:${(volume/1000).toFixed(1)}K`;
        }).join('\n');
        parts.push(`\nRecent 5 Candles (1H):\n${klinesText}`);
      }

      if (klines4h && klines4h.length >= 3) {
        const recent3 = klines4h.slice(-3);
        const klinesText = recent3.map((k, i) => {
          const open = parseFloat(k[1]);
          const high = parseFloat(k[2]);
          const low = parseFloat(k[3]);
          const close = parseFloat(k[4]);
          const volume = parseFloat(k[5]);
          const change = ((close - open) / open * 100).toFixed(2);
          const candle = close > open ? '🟢' : '🔴';
          return `  ${candle} ${(i+1)*4}h ago: O:${open.toFixed(4)} H:${high.toFixed(4)} L:${low.toFixed(4)} C:${close.toFixed(4)} (${change}%) Vol:${(volume/1000).toFixed(1)}K`;
        }).join('\n');
        parts.push(`\nRecent 3 Candles (4H):\n${klinesText}`);
      }
    }

    // Add holder distribution metrics
    if (data.totalHolders !== undefined) {
      parts.push(`Total Holders: ${data.totalHolders.toLocaleString()}`);
    }

    if (data.circulationRatio !== undefined) {
      parts.push(`Circulation Ratio: ${data.circulationRatio.toFixed(2)}% (${(data.circulatingSupply / 1000000).toFixed(2)}M / ${(data.totalSupply / 1000000).toFixed(2)}M)`);
    }

    if (data.top10HoldersPercent !== undefined) {
      parts.push(`Top 10 Holders: ${data.top10HoldersPercent.toFixed(2)}%`);

      if (data.top10Change24h !== undefined && data.top10Change24h !== 0) {
        parts.push(`Top 10 Change 24h: ${data.top10Change24h > 0 ? '+' : ''}${data.top10Change24h.toFixed(2)}%`);

        // Whale selling alert
        if (data.top10Change24h < -5) {
          parts.push(`⚠️ WHALE ALERT: Top holders reduced by ${Math.abs(data.top10Change24h).toFixed(2)}%`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * 构建历史案例摘要
   */
  buildHistoricalSummary(historicalCases) {
    if (!historicalCases || historicalCases.length === 0) {
      return 'No historical cases available';
    }

    const parts = [];
    parts.push(`Historical Cases (${historicalCases.length}):`);

    historicalCases.forEach((case_, index) => {
      const accuracy = case_.prediction_accuracy || 0;
      const returnPercent = parseFloat(case_.actual_return_percent) || 0;
      parts.push(`${index + 1}. ${case_.token_symbol} ${case_.signal_type}: Accuracy ${accuracy}%, Return ${returnPercent.toFixed(2)}%`);
    });

    return parts.join('\n');
  }

  /**
   * 构建AI提示词（包含OI/MC分析规则和历史知识）
   */
  buildAIPrompt(symbol, signalType, technicalSummary, historicalSummary, knowledgeInsight = null) {
    let prompt = `Analyze ${symbol} trading signal based on technical indicators and historical data.

【Technical Indicators】
${technicalSummary}

【Historical Reference】
${historicalSummary}`;

    // 🆕 添加知识库见解（来自 FLock RAG 或 Local DB）
    if (knowledgeInsight) {
      prompt += `

【Historical Knowledge from Knowledge Base】
${knowledgeInsight}`;
    }

    prompt += `

【OI/MC Analysis Rules (Reference Knowledge)】
- OI/MC ≥ 1.0: Extremely high leverage.
  * If FR > +1% && OI change > +10%: Long squeeze risk (bulls overcrowded), expect pullback
  * If FR < -1% && OI change > +10%: Short squeeze risk (bears overcrowded), expect bounce
  * Otherwise: Both-way liquidation risk

- OI/MC 0.5-1.0: High leverage market
  * If FR > +0.5% && OI change > +5%: Bulls dominating but overheating
  * If FR < -0.5% && OI change > +5%: Bears dominating but oversold
  * Otherwise: High volatility risk

- OI/MC 0.2-0.5: Medium leverage
  * If FR > 0 && OI change > 0: Bulls leading
  * If FR < 0 && OI change > 0: Bears leading

- OI/MC < 0.2: Low leverage, relatively safe

【Top 10 Holders Analysis Rules (if available)】
- Top10 > 70%: Highly centralized, whale manipulation risk
- Top10 50-70%: Moderate centralization
- Top10 < 50%: Decentralized, healthier distribution
- Whale selling alert: If top holders reduce > 5%, dump risk

【K-line Analysis Guide】
If K-line data is provided (1H/4H candles):
- 🟢 Green candle = Bullish (Close > Open)
- 🔴 Red candle = Bearish (Close < Open)
- Look for patterns: consecutive greens (bullish momentum), consecutive reds (bearish momentum)
- Check volume: increasing volume confirms trend strength
- Wick analysis: long upper wick = rejection at high, long lower wick = support at low
- Recent candle changes indicate short-term momentum
- Use 1H for short-term trends, 4H for medium-term direction

Please provide (in English):
1. Core Logic (1-2 sentences explaining why ${signalType} signal, reference K-line patterns if available)
2. Key Risk (1 sentence)
3. Trading Suggestion (1 sentence)

Keep it professional and concise (max 200 words).`;

    return prompt;
  }

  /**
   * 🆕 从 DexScreener 获取代币数据
   * @param {string} symbol - 代币符号
   * @param {string} chain - 链名称 (BSC, Base 等)
   * @returns {Promise<Object|null>} DexScreener 数据
   */
  async getDexScreenerData(symbol, chain = 'BSC') {
    try {
      const axios = require('axios');
      const chainMap = {
        'BSC': 'bsc',
        'Base': 'base',
        'Ethereum': 'ethereum',
        'Arbitrum': 'arbitrum'
      };

      const chainId = chainMap[chain] || 'bsc';
      const url = `https://api.dexscreener.com/latest/dex/search?q=${symbol}`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: 10000
      });

      if (response.data && response.data.pairs && response.data.pairs.length > 0) {
        // 优先找指定链上的交易对
        let pair = response.data.pairs.find(p =>
          p.chainId === chainId &&
          p.baseToken &&
          p.baseToken.symbol.toLowerCase() === symbol.toLowerCase()
        );

        // 如果找不到,返回第一个匹配的
        if (!pair) {
          pair = response.data.pairs.find(p =>
            p.baseToken &&
            p.baseToken.symbol.toLowerCase() === symbol.toLowerCase()
          );
        }

        return pair || null;
      }

      return null;
    } catch (error) {
      console.error(`   ❌ DexScreener error for ${symbol}:`, error.message);
      return null;
    }
  }
}

module.exports = new AlphaMarketAnalyzer();

/**
 * Twitter Polling Monitor Service
 * Monitor long-tail KOLs not covered by Webhook
 */

const DatabaseService = require('../databaseService');
const TwitterAPIService = require('./TwitterAPIService');
const TokenExtractor = require('./TokenExtractor');
const AutoTradeService = require('../autoTrade/AutoTradeService');

class PollingMonitorService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.checkIntervalMs = 1800000; // Check every 30 minutes
  }

  /**
   * Start polling monitor
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Twitter Polling Monitor 已经在运行');
      return;
    }

    this.isRunning = true;

    // Execute immediately (handle async properly) - Fix: await completion, avoid race with AutoTradeService initialization
    try {
      await this.checkKOLs();
    } catch (err) {
      console.error('❌ [Polling] Initial check failed:', err.message);
    }

    // Scheduled execution
    this.interval = setInterval(() => {
      this.checkKOLs().catch(err => {
        console.error('❌ [Polling] Scheduled check failed:', err.message);
      });
    }, this.checkIntervalMs);

    console.log('✅ Twitter Polling Monitor 已启动 (间隔: 30 分钟)');
  }

  /**
   * Stop polling monitor
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      console.log('⏹️ Twitter Polling Monitor 已停止');
    }
  }

  /**
   * Check all KOLs that need polling
   */
  async checkKOLs() {
    try {
      const kolsToCheck = await this.getKOLsNeedingCheck();

      if (kolsToCheck.length === 0) {
        return;
      }

      console.log(`\n🔄 [轮询] 检查 ${kolsToCheck.length} 个 KOL...`);

      for (const kol of kolsToCheck) {
        await this.processKOL(kol);
        // Avoid requests too fast
        await this.sleep(1000);
      }

    } catch (error) {
      console.error('❌ [Polling] Check failed:', error.message);
    }
  }

  /**
   * Get list of KOLs needing check
   */
  async getKOLsNeedingCheck() {
    try {
      const result = await DatabaseService.query(`
        SELECT DISTINCT
          kol_handle,
          last_tweet_id,
          check_interval,
          last_check_time
        FROM twitter_kol_config
        WHERE enabled = TRUE
          AND (
            last_check_time IS NULL OR
            TIMESTAMPDIFF(SECOND, last_check_time, NOW()) >= COALESCE(check_interval, 1800)
          )
        ORDER BY last_check_time ASC
        LIMIT 3
      `);

      return result || [];

    } catch (error) {
      // If column doesn't exist, database hasn't been migrated yet
      if (error.message.includes('Unknown column')) {
        console.log('⚠️ [Polling] Database not migrated yet, skipping polling monitor');
        console.log('   Please run migration script to add necessary fields');
        return [];
      }
      throw error;
    }
  }

  /**
   * Process single KOL
   */
  async processKOL(kol) {
    try {
      console.log(`   🔍 检查 @${kol.kol_handle}...`);

      // Get latest tweet (only 1 tweet to save cost)
      const tweets = await TwitterAPIService.getUserTweets(
        kol.kol_handle,
        1  // Only get latest 1 tweet
      );

      if (tweets.length === 0) {
        console.log(`      ℹ️ No tweets`);
        await this.updateCheckTime(kol.kol_handle);
        return;
      }

      const latestTweet = tweets[0];

      // Check if it's a new tweet
      if (kol.last_tweet_id && latestTweet.id === kol.last_tweet_id) {
        console.log(`      ✓ No new tweets`);
        await this.updateCheckTime(kol.kol_handle);
        return;
      }

      console.log(`      🆕 New tweet found!`);
      console.log(`         📝 ${latestTweet.text?.substring(0, 50)}...`);

      // Process new tweet
      await this.processTweet(latestTweet, kol.kol_handle);

      // Update last checked tweet ID
      await DatabaseService.query(`
        UPDATE twitter_kol_config
        SET last_tweet_id = ?,
            last_check_time = NOW()
        WHERE kol_handle = ?
      `, [latestTweet.id, kol.kol_handle]);

      console.log(`      ✅ Processed`);

    } catch (error) {
      console.error(`      ❌ Processing failed: ${error.message}`);
      // Update check time even if failed, to avoid getting stuck
      await this.updateCheckTime(kol.kol_handle);
    }
  }

  /**
   * Process tweet (consistent with webhook processing logic)
   */
  async processTweet(tweet, kolHandle) {
    try {
      // 1. Query all strategies monitoring this KOL
      const strategies = await DatabaseService.query(`
        SELECT
          atc.strategy_id,
          atc.user_id,
          atc.follow_strategy,
          tkc.user_address,
          tkc.kol_handle,
          tkc.kol_weight,
          tkc.trust_mode
        FROM auto_trade_config atc
        INNER JOIN twitter_kol_config tkc ON tkc.strategy_id = atc.strategy_id
        WHERE atc.enabled = TRUE
          AND tkc.enabled = TRUE
          AND tkc.kol_handle = ?
          AND (atc.follow_strategy = 'TWITTER_KOL' OR atc.follow_strategy = 'FUSION')
      `, [kolHandle]);

      if (strategies.length === 0) {
        console.log(`         ℹ️ 没有策略监控该 KOL`);
        return;
      }

      console.log(`         📊 找到 ${strategies.length} 个策略`);

      // 2. Extract tokens and signals (including contract addresses)
      const normalized = TwitterAPIService.normalizeTweet(tweet);
      const extracted = await TokenExtractor.processTweetWithContracts(normalized);

      console.log(`         🪙 提取到 ${extracted.tokens.length} 个代币`);
      console.log(`         💎 提取到 ${extracted.contracts?.length || 0} 个合约地址`);
      console.log(`         📊 信号类型: ${extracted.signalType || '无'}`);

      if ((extracted.tokens.length === 0 && (!extracted.contracts || extracted.contracts.length === 0)) || !extracted.signalType) {
        console.log(`         ℹ️ No valid signals extracted (no token symbols and no contract addresses)`);
        return;
      }

      // 3. Process signals for each strategy
      let processedCount = 0;

      // 3.1 Process token symbol signals
      for (const strategy of strategies) {
        for (const tokenSymbol of extracted.tokens) {
          try {
            await this.processTokenSignal(strategy, tweet, tokenSymbol, extracted);
            processedCount++;
          } catch (error) {
            console.error(`         ❌ Token signal processing failed (strategy ${strategy.strategy_id}, token ${tokenSymbol}):`, error.message);
          }
        }
      }

      // 3.2 Process contract address signals
      if (extracted.contracts && extracted.contracts.length > 0) {
        for (const strategy of strategies) {
          for (const contract of extracted.contracts) {
            try {
              await this.processContractSignal(strategy, tweet, contract, extracted);
              processedCount++;
            } catch (error) {
              console.error(`         ❌ Contract signal processing failed (strategy ${strategy.strategy_id}, contract ${contract.address}):`, error.message);
            }
          }
        }
      }

      console.log(`         ✅ Successfully processed ${processedCount} signals`);

    } catch (error) {
      console.error(`         ❌ Tweet processing failed:`, error.message);
      throw error;
    }
  }

  /**
   * Process single token signal
   * TWITTER_KOL strategy: Use Twitter signal directly to trigger trades (no longer through AlphaMarketAnalyzer)
   */
  async processTokenSignal(strategy, tweet, tokenSymbol, extracted) {
    try {
      // Remove USDT suffix
      const baseSymbol = tokenSymbol.replace('USDT', '').replace('USDC', '');

      // 1. Determine if should execute trade (based on trust mode)
      const shouldTrade = this.shouldExecuteTrade(strategy.trust_mode);

      if (!shouldTrade) {
        console.log(`         ⏭️ Skip trade (trust mode ${strategy.trust_mode} does not allow trading)`);
        return;
      }

      console.log(`         🎯 Trust mode: ${strategy.trust_mode} - Trading allowed`);

      // 2. Generate Twitter signal ID
      const signalId = `TWSIG-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${baseSymbol}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // 3. Get current price and contract address
      const BinanceAlphaService = require('../BinanceAlphaService');
      const data = await BinanceAlphaService.getComprehensiveData(baseSymbol + 'USDT');

      if (!data || !data.currentPrice || data.currentPrice <= 0) {
        console.log(`         ⚠️ Cannot get ${baseSymbol} price, skipping`);
        return;
      }

      const currentPrice = data.currentPrice;
      console.log(`         💰 Current price: $${currentPrice}`);

      // 3.1 Get contract address and chain info
      const alphaTokens = await BinanceAlphaService.getAllAlphaTokensIncludingDEX();
      const tokenInfo = alphaTokens.find(t => t.symbol === baseSymbol);

      if (!tokenInfo || !tokenInfo.contractAddress) {
        console.log(`         ⚠️ Cannot get ${baseSymbol} contract address, skipping`);
        return;
      }

      const contractAddress = tokenInfo.contractAddress;
      const chain = tokenInfo.chain || 'BSC';
      console.log(`         🔗 Contract address: ${contractAddress} (${chain})`);

      // 4. Record Twitter signal history
      // Use real engagement score calculation
      const engagementScore = extracted.engagementScore || 50; // Engagement score (0-100)
      const kolWeight = strategy.kol_weight || 80; // KOL weight (0-100)
      const finalScore = Math.round((kolWeight * engagementScore) / 100); // Final score

      console.log(`         📊 Score calculation: engagement=${engagementScore}, KOL weight=${kolWeight}, final=${finalScore}`);

      await DatabaseService.query(`
        INSERT INTO twitter_signal_history (
          signal_id,
          strategy_id,
          user_address,
          kol_handle,
          token_symbol,
          signal_type,
          tweet_url,
          tweet_content,
          kol_weight,
          tweet_engagement,
          external_score,
          internal_score,
          final_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        signalId,
        strategy.strategy_id,
        strategy.user_address || '0x0000000000000000000000000000000000000000',
        strategy.kol_handle,
        baseSymbol,
        extracted.signalType,
        tweet.url || tweet.twitterUrl,
        tweet.text,
        kolWeight,
        (tweet.likeCount || 0) + (tweet.retweetCount || 0) + (tweet.replyCount || 0),
        engagementScore,  // Use real engagement score
        0,  // internal_score (not available yet)
        finalScore  // Use calculated final score
      ]);

      console.log(`         📊 Twitter signal recorded: ${signalId}`);

      // 5. Directly create signal and trigger AutoTradeService
      // TWITTER_KOL strategy doesn't need confidence check, use KOL signal directly
      const signal = {
        signal_id: signalId,
        token_symbol: baseSymbol + 'USDT',
        signal_type: extracted.signalType,
        confidence: 100, // KOL signal defaults to 100% confidence (FULL_TRUST mode)
        current_price: currentPrice,
        entry_min: currentPrice * 0.98, // Entry range -2%
        entry_max: currentPrice * 1.02, // Entry range +2%
        stop_loss: currentPrice * 0.95,  // Stop loss -5%
        take_profit_1: currentPrice * 1.05, // Take profit 1 +5%
        take_profit_2: currentPrice * 1.10, // Take profit 2 +10%
        take_profit_3: currentPrice * 1.15, // Take profit 3 +15%
        contract_address: contractAddress, // Add contract address
        chain: chain, // Add chain info
        status: 'ACTIVE',
        created_at: new Date(),
        is_alpha_token: true,  // 🔧 修复: Twitter KOL 信号使用 BinanceAlphaService，是 Alpha 代币
        // 🔧 修复: 添加策略信息，避免 getEnabledUsers 错误匹配其他策略
        strategy_id: strategy.strategy_id,
        kol_handle: strategy.kol_handle
      };

      // 6. Insert into alpha_signals table (so AutoTradeService can query it)
      await DatabaseService.query(`
        INSERT INTO alpha_signals (
          signal_id,
          token_symbol,
          signal_type,
          confidence_score,
          current_price,
          entry_min,
          entry_max,
          stop_loss,
          take_profit_1,
          take_profit_2,
          take_profit_3,
          contract_address,
          chain,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        signal.signal_id,
        signal.token_symbol,
        signal.signal_type,
        signal.confidence,
        signal.current_price,
        signal.entry_min,
        signal.entry_max,
        signal.stop_loss,
        signal.take_profit_1,
        signal.take_profit_2,
        signal.take_profit_3,
        signal.contract_address,
        signal.chain,
        signal.status
      ]);

      console.log(`         ✅ Signal saved: ${signalId}`);
      console.log(`            Signal type: ${signal.signal_type}`);
      console.log(`            Current price: $${signal.current_price}`);
      console.log(`            Entry range: $${signal.entry_min} - $${signal.entry_max}`);
      console.log(`            Stop loss: $${signal.stop_loss}`);
      console.log(`            Take profit: $${signal.take_profit_1} / $${signal.take_profit_2} / $${signal.take_profit_3}`);

      // 7. Trigger auto-trade (await directly, avoid setImmediate to prevent timing issues)
      console.log(`         📞 Triggering auto-trade: ${signalId}...`);
      await AutoTradeService.handleNewSignal(signal);

    } catch (error) {
      console.error(`         ❌ Processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process contract address signal
   * @param {Object} strategy - Strategy config
   * @param {Object} tweet - Tweet object
   * @param {Object} contract - Contract object { address, chain, type }
   * @param {Object} extracted - Extracted signal data
   */
  async processContractSignal(strategy, tweet, contract, extracted) {
    try {
      console.log(`\n         🔷 Processing contract address signal: ${contract.address.substring(0, 10)}...`);
      console.log(`            Chain: ${contract.chain}, Type: ${contract.type}`);

      // 1. Determine if should execute trade (based on trust mode)
      const shouldTrade = this.shouldExecuteTrade(strategy.trust_mode);
      if (!shouldTrade) {
        console.log(`         ⏭️ Skip trade (trust mode ${strategy.trust_mode} does not allow trading)`);
        return;
      }

      // 2. Get pool info from DexScreener
      const DexScreenerService = require('../DexScreenerService');
      const poolInfo = await DexScreenerService.getPoolInfo(null, contract.address);

      if (!poolInfo || !poolInfo.pairAddress) {
        console.log(`         ⚠️ DexScreener pool not found, skipping`);
        return;
      }

      console.log(`         ✅ Pool found: ${poolInfo.pairAddress}`);
      console.log(`            DEX: ${poolInfo.dexId}, Chain: ${poolInfo.chainId}`);
      console.log(`            Liquidity: $${poolInfo.liquidity.toLocaleString()}`);
      console.log(`            24h txns: ${poolInfo.txnTotal24h} trades`);

      // 3. Chain validation - Check if chain is in user's supported chains list
      let supportedChains = ['BSC', 'Base', 'Solana']; // Default chains
      if (strategy.meme_supported_chains) {
        try {
          supportedChains = typeof strategy.meme_supported_chains === 'string'
            ? JSON.parse(strategy.meme_supported_chains)
            : strategy.meme_supported_chains;
        } catch (e) {
          console.log(`         ⚠️ Failed to parse meme_supported_chains, using defaults`);
        }
      }

      if (!supportedChains.includes(contract.chain)) {
        console.log(`         ❌ Chain ${contract.chain} not in user's supported chains: [${supportedChains.join(', ')}], skipping`);
        return;
      }

      // 4. Risk validation (USER CONFIGURABLE - can be disabled)
      const riskCheckEnabled = strategy.meme_enable_risk_check || false;

      if (riskCheckEnabled) {
        // Risk check ENABLED - Validate liquidity and trading activity
        const MIN_LIQUIDITY = strategy.meme_min_liquidity || 50000;
        const MIN_TXN_COUNT = strategy.meme_min_txn_count || 100;

        console.log(`         🛡️ Risk check ENABLED - Validating thresholds:`);
        console.log(`            Liquidity >= $${MIN_LIQUIDITY.toLocaleString()}, Txns >= ${MIN_TXN_COUNT}`);

        if (poolInfo.liquidity < MIN_LIQUIDITY) {
          console.log(`         ❌ Insufficient liquidity: $${poolInfo.liquidity} < $${MIN_LIQUIDITY}, skipping`);
          return;
        }

        if (poolInfo.txnTotal24h < MIN_TXN_COUNT) {
          console.log(`         ❌ Insufficient trading activity: ${poolInfo.txnTotal24h} < ${MIN_TXN_COUNT} txns, skipping`);
          return;
        }

        console.log(`         ✅ Risk validation passed`);
      } else {
        // Risk check DISABLED - Trust KOL directly, trade immediately
        console.log(`         ⚡ Risk check DISABLED - Trusting KOL directly (early meme hunting mode)`);
        console.log(`            Pool liquidity: $${poolInfo.liquidity.toLocaleString()}`);
        console.log(`            24h txns: ${poolInfo.txnTotal24h} trades`);
        console.log(`         ✅ Proceeding with trade (no validation)`);
      }

      // 4. Extract token symbol (if available)
      const tokenSymbol = poolInfo.baseToken?.symbol || 'UNKNOWN';
      const tokenName = poolInfo.baseToken?.name || tokenSymbol;

      // 5. Generate Twitter signal ID
      const signalId = `TWSIG-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${tokenSymbol}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // 6. Save Twitter signal to database
      await this.saveTwitterSignal({
        signalId,
        strategyId: strategy.strategy_id,
        kolHandle: tweet.authorUsername,
        tokenSymbol,
        signalType: extracted.signalType,
        tweetUrl: tweet.url || tweet.twitterUrl,
        tweetText: tweet.text,
        contractAddress: contract.address,
        detectedChain: contract.chain,
        signalSource: 'CONTRACT',  // Mark as contract address signal
        engagementScore: extracted.engagementScore
      });

      // 7. Add to whitelist
      await this.addContractToWhitelist(contract, poolInfo, tokenSymbol);

      // 8. Create Alpha signal (for trade execution)
      const AlphaMarketAnalyzer = require('../AlphaMarketAnalyzer');
      const signal = {
        signal_id: signalId,
        token_symbol: tokenSymbol,
        signal_type: extracted.signalType,
        confidence: 100, // KOL signal defaults to 100% confidence
        current_price: poolInfo.priceUsd,
        entry_min: poolInfo.priceUsd * 0.98,
        entry_max: poolInfo.priceUsd * 1.02,
        stop_loss: poolInfo.priceUsd * 0.95,
        take_profit_1: poolInfo.priceUsd * 1.05,
        take_profit_2: poolInfo.priceUsd * 1.10,
        take_profit_3: poolInfo.priceUsd * 1.15,
        contract_address: contract.address,
        chain: poolInfo.chainId,
        status: 'ACTIVE',
        is_alpha_token: false,  // 🔧 修复: 合约地址信号使用 DexScreener，是真正的 MEME 代币
        // 🔧 修复: 添加策略信息，避免 getEnabledUsers 错误匹配其他策略
        strategy_id: strategy.strategy_id,
        kol_handle: tweet.authorUsername
      };

      await AlphaMarketAnalyzer.saveSignalToDatabase(signal);

      console.log(`         ✅ Contract signal saved: ${signalId}`);
      console.log(`            Token: ${tokenSymbol} (${tokenName})`);
      console.log(`            Current price: $${poolInfo.priceUsd}`);

      // 9. Trigger auto-trade
      const AutoTradeService = require('../autoTrade/AutoTradeService');
      console.log(`         📞 Triggering auto-trade: ${signalId}...`);
      await AutoTradeService.handleNewSignal(signal);

    } catch (error) {
      console.error(`         ❌ Contract signal processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save Twitter signal to database
   */
  async saveTwitterSignal(data) {
    const {
      signalId, strategyId, kolHandle, tokenSymbol, signalType,
      tweetUrl, tweetText, contractAddress, detectedChain,
      signalSource, engagementScore
    } = data;

    await DatabaseService.query(`
      INSERT INTO twitter_signals
      (signal_id, strategy_id, kol_handle, token_symbol, signal_type,
       tweet_url, tweet_text, contract_address, detected_chain, signal_source,
       kol_weight, total_engagement, engagement_score, final_score, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 0, ?, 100, NOW())
    `, [
      signalId, strategyId, kolHandle, tokenSymbol, signalType,
      tweetUrl, tweetText, contractAddress, detectedChain, signalSource,
      engagementScore
    ]);

    console.log(`         📊 Twitter signal recorded: ${signalId}`);
  }

  /**
   * Add contract to whitelist
   */
  async addContractToWhitelist(contract, poolInfo, tokenSymbol) {
    try {
      await DatabaseService.query(`
        INSERT INTO auto_trade_token_whitelist
        (token_symbol, chain, contract_address, pool_address, dex_name,
         liquidity_usd, volume_24h_usd, price_usd,
         txn_buys_24h, txn_sells_24h, txn_total_24h,
         is_eligible, risk_level, eligibility_reason, source, last_checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'MEDIUM', ?, 'TWITTER_CONTRACT', NOW())
        ON DUPLICATE KEY UPDATE
          pool_address = VALUES(pool_address),
          dex_name = VALUES(dex_name),
          liquidity_usd = VALUES(liquidity_usd),
          volume_24h_usd = VALUES(volume_24h_usd),
          price_usd = VALUES(price_usd),
          txn_buys_24h = VALUES(txn_buys_24h),
          txn_sells_24h = VALUES(txn_sells_24h),
          txn_total_24h = VALUES(txn_total_24h),
          last_checked_at = NOW()
      `, [
        tokenSymbol,
        poolInfo.chainId,
        contract.address,
        poolInfo.pairAddress,
        poolInfo.dexId,
        poolInfo.liquidity,
        poolInfo.volume24h,
        poolInfo.priceUsd,
        poolInfo.txnBuys24h,
        poolInfo.txnSells24h,
        poolInfo.txnTotal24h,
        `Twitter KOL recommended, liquidity: $${Math.round(poolInfo.liquidity / 1000)}K`
      ]);

      console.log(`         ✅ Added to whitelist: ${tokenSymbol} (${contract.address.substring(0, 10)}...)`);
    } catch (error) {
      console.error(`         ⚠️ Whitelist addition failed: ${error.message}`);
    }
  }

  /**
   * Determine if should execute trade (simplified version, only check trust mode)
   */
  shouldExecuteTrade(trustMode) {
    // FULL_TRUST: Fully trust KOL, trade directly
    // STRICT: Need internal AI confirmation (determined by AlphaMarketAnalyzer's confidence)
    return trustMode === 'FULL_TRUST';
  }

  /**
   * Update check time
   */
  async updateCheckTime(kolHandle) {
    try {
      await DatabaseService.query(`
        UPDATE twitter_kol_config
        SET last_check_time = NOW()
        WHERE kol_handle = ?
      `, [kolHandle]);
    } catch (error) {
      if (!error.message.includes('Unknown column')) {
        console.error(`      ⚠️ Update check time failed:`, error.message);
      }
    }
  }

  /**
   * Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new PollingMonitorService();

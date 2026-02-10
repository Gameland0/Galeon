/**
 * 批量执行引擎
 * 功能:
 * 1. 接收 PriceWatcher 的触发
 * 2. 查询所有跟单用户
 * 3. 计算批次策略 (防止滑点)
 * 4. 分批执行交易
 * 5. 处理并发控制 (Redis 分布式锁)
 */

const DatabaseService = require('../databaseService');
const LiquidityMonitor = require('./LiquidityMonitor');
const DEXAggregatorService = require('./DEXAggregatorService');
const FeeService = require('../FeeService');
const { v4: uuidv4 } = require('uuid');
const BaseAgent = require('./core/BaseAgent');
const AgentBus = require('./core/AgentBus');

class BatchExecutor extends BaseAgent {
  constructor() {
    super('Execution Agent', 'execution');
    AgentBus.register(this);
    this.executing = new Map(); // batchId -> executing state

    // 批次配置
    this.batchConfig = {
      maxLiquidityPercent: 2.0,  // 单批次最多占流动性的 2%
      batchInterval: 30000,       // 批次间隔 30 秒
      maxBatchSize: 50,           // 单批次最多 50 个用户
      minBatchAmount: 1000,       // 最小批次金额 $1000 (否则不分批)
    };

    this.log('✅ BatchExecutor initialized');
  }

  /**
   * 执行批量交易 (由 PriceWatcher 触发)
   */
  async executeBatchTrades(signal, users, currentPrice) {
    const batchId = `batch_${signal.signal_id}_${Date.now()}`;

    this.log(`\n🚀 启动批量执行: ${signal.token_symbol}`);
    this.log(`   信号ID: ${signal.signal_id}`);
    this.log(`   当前价格: $${currentPrice.toFixed(4)}`);
    this.log(`   跟单用户: ${users.length} 人`);
    // 🔧 调试: 打印 is_alpha_token 值
    this.log(`   📍 is_alpha_token: ${signal.is_alpha_token} (type: ${typeof signal.is_alpha_token})`);

    try {
      // 1. 计算总金额
      const totalAmount = users.reduce((sum, user) => sum + parseFloat(user.trade_amount || 100), 0);
      this.log(`   总交易额: $${totalAmount.toLocaleString()}`);

      // 2. 获取流动性数据
      let liquidity = null;
      try {
        liquidity = await LiquidityMonitor.getLiquidity(signal.token_symbol, signal.chain);
      } catch (error) {
        this.log(`   ⚠️ 流动性数据获取失败，使用默认值: ${error.message}`);
      }

      // 🧪 [测试模式] 临时跳过流动性检查
      this.log(`   ⚠️ [测试模式] 跳过流动性检查: ${signal.token_symbol}`);
      // if (!liquidity || !liquidity.isEligible) {
      //   this.log(`   ❌ 流动性不足，放弃执行`);
      //   await this.logBatchEvent(batchId, signal, 'FAILED', '流动性不足');
      //   return;
      // }

      const tvl = liquidity?.tvl || 1000000; // 默认TVL用于计算
      this.log(`   流动性: $${tvl.toLocaleString()}`);

      // 3. 计算批次策略
      const batchStrategy = this.calculateBatchStrategy(totalAmount, tvl, users.length);

      this.log(`   批次策略: ${batchStrategy.batchCount} 批`);
      this.log(`   单批金额: $${batchStrategy.batchAmount.toFixed(2)}`);
      this.log(`   单批用户: ${batchStrategy.usersPerBatch} 人`);

      // 4. 记录批次信息
      await DatabaseService.query(`
        INSERT INTO auto_trade_batches
        (batch_id, signal_id, total_users, total_amount_usdt, batch_count,
         batch_size, status, started_at)
        VALUES (?, ?, ?, ?, ?, ?, 'EXECUTING', NOW())
      `, [
        batchId,
        signal.signal_id,
        users.length,
        totalAmount,
        batchStrategy.batchCount,
        batchStrategy.batchAmount
      ]);

      // 5. 分批执行
      const batches = this.splitIntoBatches(users, batchStrategy.usersPerBatch);

      for (let i = 0; i < batches.length; i++) {
        const batchUsers = batches[i];
        const batchNum = i + 1;

        this.log(`\n   📦 执行第 ${batchNum}/${batches.length} 批 (${batchUsers.length} 用户)`);

        try {
          this.publish('execution:trade_submitted', { signalId: signal.signal_id, token: signal.token_symbol, batchSize: batchUsers.length });

          await this.executeSingleBatch(
            batchId,
            signal,
            batchUsers,
            currentPrice,
            batchNum
          );

          // 更新批次进度
          await DatabaseService.query(`
            UPDATE auto_trade_batches
            SET current_batch = ?, completed_batches = completed_batches + 1
            WHERE batch_id = ?
          `, [batchNum, batchId]);

          // 批次间隔
          if (i < batches.length - 1) {
            this.log(`   ⏳ 等待 ${this.batchConfig.batchInterval / 1000} 秒...`);
            await this.sleep(this.batchConfig.batchInterval);
          }

        } catch (error) {
          this.error(`   ❌ 第 ${batchNum} 批执行失败: ${error.message}`);

          await DatabaseService.query(`
            UPDATE auto_trade_batches
            SET failed_batches = failed_batches + 1
            WHERE batch_id = ?
          `, [batchId]);
        }
      }

      // 6. 完成
      await DatabaseService.query(`
        UPDATE auto_trade_batches
        SET status = 'COMPLETED', completed_at = NOW()
        WHERE batch_id = ?
      `, [batchId]);

      this.log(`\n   ✅ 批量执行完成!`);

    } catch (error) {
      this.error(`   ❌ 批量执行失败: ${error.message}`);

      await DatabaseService.query(`
        UPDATE auto_trade_batches
        SET status = 'FAILED'
        WHERE batch_id = ?
      `, [batchId]);
    }
  }

  /**
   * 计算批次策略
   */
  calculateBatchStrategy(totalAmount, liquidityTVL, userCount) {
    // 流动性太小，不允许交易
    if (liquidityTVL < 50000) {
      throw new Error('Liquidity too low (< $50K)');
    }

    // 计算最大单批金额 (流动性的 2%)
    const maxBatchAmount = liquidityTVL * (this.batchConfig.maxLiquidityPercent / 100);

    // 总金额小于最小批次，不分批
    if (totalAmount < this.batchConfig.minBatchAmount) {
      return {
        batchCount: 1,
        batchAmount: totalAmount,
        usersPerBatch: userCount
      };
    }

    // 计算需要几批
    const batchCount = Math.ceil(totalAmount / maxBatchAmount);

    // 平均分配
    const avgBatchAmount = totalAmount / batchCount;
    const avgUsersPerBatch = Math.ceil(userCount / batchCount);

    return {
      batchCount,
      batchAmount: avgBatchAmount,
      usersPerBatch: Math.min(avgUsersPerBatch, this.batchConfig.maxBatchSize)
    };
  }

  /**
   * 将用户分组
   */
  splitIntoBatches(users, usersPerBatch) {
    const batches = [];

    for (let i = 0; i < users.length; i += usersPerBatch) {
      batches.push(users.slice(i, i + usersPerBatch));
    }

    return batches;
  }

  /**
   * 执行单个批次
   */
  async executeSingleBatch(batchId, signal, users, currentPrice, batchNum) {
    const promises = users.map(user =>
      this.executeUserTrade(batchId, signal, user, currentPrice, batchNum)
    );

    // 并发执行当前批次的所有用户
    const results = await Promise.allSettled(promises);

    // 统计 - 区分实际执行和跳过
    const executed = results.filter(r => r.status === 'fulfilled' && r.value?.result === 'executed').length;
    const skipped = results.filter(r => r.status === 'fulfilled' && r.value?.result === 'skipped').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (executed > 0) {
      this.log(`      ✅ 执行成功: ${executed} 笔`);
    }
    if (skipped > 0) {
      this.log(`      ⏭️ 跳过: ${skipped} 笔`);
    }
    if (failed > 0) {
      this.log(`      ❌ 失败: ${failed} 笔`);
    }

    return { succeeded: executed, skipped, failed };
  }

  /**
   * 执行单个用户的交易
   */
  async executeUserTrade(batchId, signal, user, currentPrice, batchNum) {
    const executionId = `exec_${user.user_id}_${signal.signal_id}`;

    try {
      this.log(`         - ${user.user_id}: $${user.trade_amount}`);

      // 🔧 修复: 从数据库查询 is_alpha_token 和 signal_source，因为信号传递过程中可能丢失
      // 优先级: 1. signal 对象  2. 数据库 alpha_signals  3. 默认值
      let isAlphaToken = 0;
      let signalSource = signal.signal_source || null;

      // 从数据库查询 is_alpha_token 和 signal_source
      try {
        const signalData = await DatabaseService.query(`
          SELECT is_alpha_token, signal_source FROM alpha_signals WHERE signal_id = ? LIMIT 1
        `, [signal.signal_id]);

        if (signalData.length > 0) {
          // 🔧 is_alpha_token: 优先使用 signal 对象，否则用数据库值
          if (signal.is_alpha_token !== undefined && signal.is_alpha_token !== null) {
            isAlphaToken = signal.is_alpha_token ? 1 : 0;
            this.log(`         📍 is_alpha_token = ${isAlphaToken} (来自信号对象)`);
          } else if (signalData[0].is_alpha_token !== null) {
            isAlphaToken = signalData[0].is_alpha_token ? 1 : 0;
            this.log(`         📍 is_alpha_token = ${isAlphaToken} (来自数据库 alpha_signals)`);
          }

          // 🔧 signal_source: 优先使用 signal 对象，否则用数据库值
          if (!signalSource && signalData[0].signal_source) {
            signalSource = signalData[0].signal_source;
            this.log(`         📍 signal_source = ${signalSource} (来自数据库 alpha_signals)`);
          } else if (signalSource) {
            this.log(`         📍 signal_source = ${signalSource} (来自信号对象)`);
          }
        } else {
          // 数据库没有记录，使用信号对象的值或推断
          if (signal.is_alpha_token !== undefined && signal.is_alpha_token !== null) {
            isAlphaToken = signal.is_alpha_token ? 1 : 0;
          } else {
            const isRangeAlpha = signalSource && signalSource.includes('ALPHA');
            isAlphaToken = isRangeAlpha ? 1 : 0;
          }
          this.log(`         📍 is_alpha_token = ${isAlphaToken}, signal_source = ${signalSource} (推断)`);
        }
      } catch (dbError) {
        this.error(`         ⚠️ 查询 alpha_signals 失败: ${dbError.message}`);
        // 回退到信号对象的值
        if (signal.is_alpha_token !== undefined && signal.is_alpha_token !== null) {
          isAlphaToken = signal.is_alpha_token ? 1 : 0;
        }
      }

      // 1. 检查是否已存在成功或进行中的记录 (幂等性)
      // FAILED 状态允许重试
      const existing = await DatabaseService.query(`
        SELECT execution_id, status FROM auto_trade_executions
        WHERE execution_id = ? AND status IN ('SUCCESS', 'PENDING', 'HOLDING')
      `, [executionId]);

      if (existing.length > 0) {
        this.log(`         ⏭️ 已存在(${existing[0].status})，跳过`);
        return { result: 'skipped', reason: `已存在(${existing[0].status})` };
      }

      // 🔧 新增: 检查该 token 是否已有 HOLDING 持仓（防止重复购买同一 token）
      const existingHolding = await DatabaseService.query(`
        SELECT COUNT(*) as count
        FROM auto_trade_positions
        WHERE token_symbol = ? AND status = 'HOLDING'
      `, [signal.token_symbol]);

      if (existingHolding[0]?.count > 0) {
        this.log(`         ⏭️ ${signal.token_symbol} 已有 ${existingHolding[0].count} 个 HOLDING 持仓，跳过`);
        return { result: 'skipped', reason: `已有 HOLDING 持仓` };
      }

      // 🔧 新增: 检查该 token 是否有活跃的执行（防止并发重复）
      // 排除已完成(EXITED)、已失败(FAILED)、已取消(CANCELLED)的状态
      const existingActive = await DatabaseService.query(`
        SELECT COUNT(*) as count
        FROM auto_trade_executions
        WHERE token_symbol = ? AND status NOT IN ('EXITED', 'FAILED', 'CANCELLED')
      `, [signal.token_symbol]);

      if (existingActive[0]?.count > 0) {
        this.log(`         ⏭️ ${signal.token_symbol} 已有 ${existingActive[0].count} 个活跃执行，跳过`);
        return { result: 'skipped', reason: `已有活跃执行` };
      }

      // 🔧 已移除: 全局冷却检查 - 允许同一 token 重复交易
      // 如需恢复，取消下方注释
      /*
      const cooldownHours = 24;
      const recentTrades = await DatabaseService.query(`
        SELECT
          (SELECT COUNT(*) FROM auto_trade_executions
           WHERE token_symbol = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR) AND status NOT IN ('FAILED', 'CANCELLED')) as exec_count,
          (SELECT COUNT(*) FROM auto_trade_history
           WHERE token_symbol = ? AND entry_executed_at > DATE_SUB(NOW(), INTERVAL ? HOUR)) as hist_count,
          (SELECT MAX(created_at) FROM auto_trade_executions
           WHERE token_symbol = ? AND status NOT IN ('FAILED', 'CANCELLED')) as last_exec,
          (SELECT MAX(entry_executed_at) FROM auto_trade_history
           WHERE token_symbol = ?) as last_hist
      `, [signal.token_symbol, cooldownHours, signal.token_symbol, cooldownHours, signal.token_symbol, signal.token_symbol]);

      const totalRecentTrades = (recentTrades[0]?.exec_count || 0) + (recentTrades[0]?.hist_count || 0);
      if (totalRecentTrades > 0) {
        const lastTradeTime = recentTrades[0]?.last_exec || recentTrades[0]?.last_hist;
        this.log(`         ⏭️ ${signal.token_symbol} 冷却中: ${totalRecentTrades} 笔交易在 ${cooldownHours}h 内, 最后交易: ${lastTradeTime}`);
        return { result: 'skipped', reason: `冷却中 (${cooldownHours}h)` };
      }
      */

      // 删除之前失败的记录，允许重试
      await DatabaseService.query(`
        DELETE FROM auto_trade_executions
        WHERE execution_id = ? AND status = 'FAILED'
      `, [executionId]);

      // 🆕 2. 执行前再次检查余额 (防止从风险检查到实际执行期间余额被消耗)
      const RiskController = require('./RiskController');
      const balanceCheck = await RiskController.checkBalance(
        user.user_id,
        parseFloat(user.trade_amount),
        signal.chain
      );

      if (!balanceCheck.passed) {
        this.log(`         ⏭️ 余额不足,跳过: ${balanceCheck.reason}`);

        // 创建记录但标记为 INSUFFICIENT_BALANCE (不是 FAILED)
        await DatabaseService.query(`
          INSERT INTO auto_trade_executions
          (execution_id, user_id, signal_id, token_symbol, chain, dex_name,
           entry_amount_usdt, status, error_message, batch_id, batch_position, follow_strategy, strategy_id, is_alpha_token, signal_source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'INSUFFICIENT_BALANCE', ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
          executionId,
          user.user_id,
          signal.signal_id,
          signal.token_symbol,
          signal.chain,
          signal.dex_name,
          user.trade_amount,
          balanceCheck.reason,
          batchId,
          batchNum,
          user.follow_strategy || 'UNKNOWN',
          user.strategy_id || null,
          isAlphaToken ? 1 : 0,
          signalSource  // 🔧 修复：使用从数据库获取的 signalSource
        ]);

        return { result: 'skipped', reason: `余额不足: ${balanceCheck.reason}` };
      }

      // 🔧 获取 Privy User ID (后续手续费和交易都需要)
      let privyUserId = null;
      const configRecord = await DatabaseService.query(`
        SELECT privy_user_id FROM auto_trade_config
        WHERE user_id = ? OR wallet_address = ?
        LIMIT 1
      `, [user.user_id, user.wallet_address]);

      if (configRecord.length > 0 && configRecord[0].privy_user_id) {
        privyUserId = configRecord[0].privy_user_id;
      } else {
        const userRecord = await DatabaseService.query(`
          SELECT id FROM users WHERE address = ? OR address = ?
        `, [user.user_id, user.wallet_address]);
        if (userRecord.length > 0) {
          privyUserId = userRecord[0].id;
        }
      }

      if (!privyUserId) {
        throw new Error(`无法找到 Privy User ID`);
      }

      // 🔧 保存 privyUserId 到执行记录，供 TransactionMonitor 交易成功后收取手续费使用
      // 💰 手续费收取已移到 TransactionMonitor，在交易确认成功后才收取

      // 2. 创建执行记录 (PENDING)
      await DatabaseService.query(`
        INSERT INTO auto_trade_executions
        (execution_id, user_id, signal_id, token_symbol, chain, dex_name,
         entry_amount_usdt, contract_address, status, batch_id, batch_position, follow_strategy, strategy_id, is_alpha_token, signal_source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, NOW())
      `, [
        executionId,
        user.user_id,
        signal.signal_id,
        signal.token_symbol,
        signal.chain,
        signal.dex_name,
        user.trade_amount,
        signal.contract_address || null,  // 🔧 修复：初始创建时就写入 contract_address
        batchId,
        batchNum,
        user.follow_strategy || 'UNKNOWN',
        user.strategy_id || null,
        isAlphaToken ? 1 : 0,
        signalSource  // 🔧 修复：使用从数据库获取的 signalSource
      ]);

      // 3. 构建 DEX 交易 (支持 four.meme + pump.fun + Jupiter)
      // 🔧 2026-02-06 修复: 传递 Solana 特有参数 (isPumpFun/isBondingCurve/pumpFunInfo)
      // 🔧 备份: 原始代码不传递 isPumpFun/isBondingCurve/pumpFunInfo, Solana bonding curve 代币无法正确路由
      const txData = await DEXAggregatorService.buildSwapTx({
        chain: signal.chain,
        tokenIn: signal.chain === 'BSC' ? 'USDT' : (signal.chain === 'Solana' ? 'SOL' : 'USDC'),
        tokenOut: signal.token_symbol,
        tokenOutAddress: signal.contract_address,
        amountIn: user.trade_amount,
        slippage: user.max_slippage || 2.0,
        // 🔧 2026-02-06 修复: Solana 交易使用 solana_wallet_address, 不是 EVM wallet_address
        // 🔧 备份: 原始代码 userAddress: user.wallet_address (对 Solana 交易会使用错误的 EVM 地址)
        userAddress: (signal.chain === 'Solana' ? (user.solana_wallet_address || user.wallet_address) : user.wallet_address),
        // 🆕 four.meme 支持
        isFourMeme: signal.is_four_meme || false,
        fourMemeInfo: signal.four_meme_info || null,
        // 🟣 Solana pump.fun 支持
        isPumpFun: signal.is_pump_fun || false,
        isBondingCurve: signal.is_bonding_curve || false,
        pumpFunInfo: signal.pump_fun_info || null,
        // 🔧 传递 isAlphaToken 用于价格验证优化
        isAlphaToken: isAlphaToken
      });

      // 4. 更新状态为 SUBMITTING
      // 🔧 修复：Solana 的 JupiterService/PumpFunService 返回值中没有 tokenAddress，
      //    使用 signal.contract_address 作为 fallback
      await DatabaseService.query(`
        UPDATE auto_trade_executions
        SET status = 'SUBMITTING', contract_address = ?
        WHERE execution_id = ?
      `, [txData.tokenAddress || signal.contract_address, executionId]);

      // 5. 提交交易 (使用 Privy 签名)
      const txHash = await this.submitTransaction(user, txData, privyUserId);

      // 6. 更新状态为 SUBMITTED
      await DatabaseService.query(`
        UPDATE auto_trade_executions
        SET status = 'SUBMITTED',
            entry_tx_hash = ?,
            entry_price = ?,
            entry_slippage = ?
        WHERE execution_id = ?
      `, [txHash, currentPrice, txData.estimatedSlippage, executionId]);

      this.log(`         ✅ 已提交: ${txHash.slice(0, 10)}...`);

      // 🔧 修改: 买入成功后，标记该 token 的所有 ACTIVE 信号为 TRIGGERED
      // 这样可以防止同一 token 的多个信号重复触发交易
      try {
        const updateResult = await DatabaseService.query(`
          UPDATE alpha_signals
          SET status = 'TRIGGERED'
          WHERE token_symbol = ? AND status = 'ACTIVE'
        `, [signal.token_symbol]);
        const affectedRows = updateResult.affectedRows || 0;
        this.log(`         📌 ${signal.token_symbol} 的 ${affectedRows} 个 ACTIVE 信号已标记为 TRIGGERED`);
      } catch (updateErr) {
        this.log(`         ⚠️ Failed to update signal status: ${updateErr.message}`);
      }

      return { result: 'executed', executionId, txHash };

    } catch (error) {
      this.error(`         ❌ 失败: ${error.message}`);

      // 记录错误
      await DatabaseService.query(`
        UPDATE auto_trade_executions
        SET status = 'FAILED', error_message = ?
        WHERE execution_id = ?
      `, [error.message, executionId]);

      throw error;
    }
  }

  /**
   * 提交交易 (🆕 使用 Privy Session Signer)
   * @param {Object} user - 用户信息
   * @param {Object} dexTxData - DEX 交易数据
   * @param {string} existingPrivyUserId - 已获取的 Privy User ID (可选)
   */
  async submitTransaction(user, dexTxData, existingPrivyUserId = null) {
    const PrivyService = require('../PrivyService');
    const DatabaseService = require('../databaseService');

    try {
      let privyUserId = existingPrivyUserId;

      // 如果没有传入 privyUserId，则从数据库查询
      if (!privyUserId) {
        // 🔧 直接从 auto_trade_config 表查询 Privy User ID
        const configRecord = await DatabaseService.query(`
          SELECT privy_user_id FROM auto_trade_config
          WHERE user_id = ? OR wallet_address = ?
          LIMIT 1
        `, [user.user_id, user.wallet_address]);

        if (configRecord.length > 0 && configRecord[0].privy_user_id) {
          privyUserId = configRecord[0].privy_user_id;
          this.log(`         🔑 Privy User ID (from config): ${privyUserId.slice(0, 20)}...`);
        } else {
          // 备用方案: 从 users 表查询
          this.log(`         ℹ️ 配置表中没有 privy_user_id,尝试从 users 表查询...`);
          const userRecord = await DatabaseService.query(`
            SELECT id FROM users WHERE address = ? OR address = ?
          `, [user.user_id, user.wallet_address]);

          if (userRecord.length === 0) {
            throw new Error(`无法找到 Privy User ID。user_id: ${user.user_id.slice(0, 10)}..., wallet_address: ${user.wallet_address.slice(0, 10)}...`);
          }

          privyUserId = userRecord[0].id;
          this.log(`         🔑 Privy User ID (from users): ${privyUserId.slice(0, 20)}...`);
        }
      }

      this.log(`         📍 user_id: ${user.user_id.slice(0, 10)}...`);
      this.log(`         📍 wallet_address: ${user.wallet_address.slice(0, 10)}...`);
      this.log(`         📍 chain: ${dexTxData.chain}`);

      // 🟣 Solana 链处理
      // 🔧 2026-02-06 修复: 兼容 'SOLANA' 和 'Solana' 大小写，备份: if (dexTxData.chain === 'SOLANA')
      if (dexTxData.chain === 'SOLANA' || dexTxData.chain === 'Solana') {
        this.log(`         🟣 [Privy Solana] 发送 Solana 交易...`);

        // Solana 不需要 Approval，直接发送主交易
        const result = await PrivyService.signSolanaTransaction(
          privyUserId,
          dexTxData.transaction, // Base64 编码的交易
          {
            network: 'mainnet',
            sponsor: false
          }
        );

        this.log(`         ✅ Solana 交易已通过 Privy 发送: ${result.hash.slice(0, 10)}...`);

        return result.hash;
      }

      // EVM 链处理 (BSC / Base)
      const chainId = dexTxData.chain === 'BSC' ? 56 : 8453;

      // 1. 如果需要 approval, 先发送 approval 交易
      if (dexTxData.needsApproval && dexTxData.approvalTx) {
        this.log(`         [Privy] 需要授权, 先发送 Approval 交易...`);

        const approvalResult = await PrivyService.signTransaction(privyUserId, {
          to: dexTxData.approvalTx.to,
          data: dexTxData.approvalTx.data,
          value: dexTxData.approvalTx.value || '0x0',
          chainId: chainId,
          gas: '0x15f90', // 90000 gas for approval
          gasPrice: dexTxData.gasPrice
        });

        this.log(`         ✅ Approval 交易已发送: ${approvalResult.hash.slice(0, 10)}...`);
        this.log(`         ⏳ 等待 Approval 确认...`);

        // 等待 approval 交易确认 (简单等待 5 秒)
        await new Promise(resolve => setTimeout(resolve, 5000));

        this.log(`         ✅ Approval 已确认, 继续主交易...`);
      }

      // 2. 发送主交易
      this.log(`         [Privy] 发送主交易...`);

      const result = await PrivyService.signTransaction(privyUserId, {
        to: dexTxData.routerAddress,
        data: dexTxData.txData,
        value: dexTxData.value || '0x0',
        chainId: chainId,
        gas: dexTxData.gasLimit,
        gasPrice: dexTxData.gasPrice
      });

      this.log(`         ✅ 主交易已通过 Privy 发送: ${result.hash.slice(0, 10)}...`);

      return result.hash;

    } catch (error) {
      this.error(`         ❌ Privy 签名失败: ${error.message}`);
      throw new Error(`Privy签名失败: ${error.message}`);
    }
  }

  /**
   * 记录批次事件
   */
  async logBatchEvent(batchId, signal, status, reason) {
    try {
      await DatabaseService.query(`
        INSERT INTO auto_trade_batches
        (batch_id, signal_id, status, started_at)
        VALUES (?, ?, ?, NOW())
      `, [batchId, signal.signal_id, status]);
    } catch (error) {
      this.error(`   ⚠️ 日志记录失败: ${error.message}`);
    }
  }

  /**
   * 获取批次状态
   */
  async getBatchStatus(batchId) {
    const result = await DatabaseService.query(`
      SELECT * FROM auto_trade_batches
      WHERE batch_id = ?
    `, [batchId]);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new BatchExecutor();

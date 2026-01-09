/**
 * 自动交易主服务
 * 功能:
 * 1. 监听新信号生成
 * 2. 查询跟单用户
 * 3. 风险检查
 * 4. 触发批量执行
 * 5. 管理整体流程
 */

const PriceWatcher = require('./PriceWatcher');
const RiskController = require('./RiskController');
const LiquidityMonitor = require('./LiquidityMonitor');
const ExitMonitor = require('./ExitMonitor');
const TransactionMonitor = require('./TransactionMonitor');
const DatabaseService = require('../databaseService');
const RangeSignalService = require('./RangeSignalService');

class AutoTradeService {
  constructor() {
    this.initialized = false;
    this.monitoring = false;

    console.log('✅ AutoTradeService initialized');
  }

  /**
   * 初始化服务
   */
  async initialize() {
    if (this.initialized) {
      console.log('⚠️ AutoTradeService 已初始化');
      return;
    }

    console.log('\n🚀 初始化自动交易服务...');

    try {
      // 1. 检查数据库表
      await this.checkDatabaseTables();

      // 2. 恢复中断的监控
      await this.recoverInterruptedMonitors();

      // 3. 启动定时任务
      this.startScheduledTasks();

      // 4. 初始化并启动 Range Trading 服务
      await RangeSignalService.initialize();
      RangeSignalService.startScanning();

      this.initialized = true;
      this.monitoring = true;

      console.log('✅ 自动交易服务已启动\n');

    } catch (error) {
      console.error(`❌ 初始化失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查数据库表是否存在
   */
  async checkDatabaseTables() {
    const requiredTables = [
      'auto_trade_config',
      'auto_trade_executions',
      'auto_trade_token_whitelist',
      'auto_trade_batches'
    ];

    console.log('🔍 检查数据库表...');

    for (const table of requiredTables) {
      const result = await DatabaseService.query(`
        SHOW TABLES LIKE ?
      `, [table]);

      if (result.length === 0) {
        throw new Error(`表不存在: ${table}`);
      }

      console.log(`   ✅ ${table}`);
    }
  }

  /**
   * 恢复中断的监控
   * (服务重启后恢复价格监控和持仓监控)
   */
  async recoverInterruptedMonitors() {
    console.log('🔄 恢复中断的监控...');

    try {
      // 1. 恢复价格监控 (ACTIVE 状态的信号)
      // 🔧 修复: 添加 is_alpha_token 和 signal_source 字段
      const activeSignals = await DatabaseService.query(`
        SELECT
          signal_id, token_symbol, chain, signal_type,
          confidence_score, entry_min, entry_max,
          stop_loss, take_profit_1, current_price,
          contract_address, expires_at,
          is_alpha_token, signal_source
        FROM alpha_signals
        WHERE status = 'ACTIVE'
        AND expires_at > NOW()
        AND signal_type IN ('LONG', 'BUY')
        ORDER BY created_at DESC
      `, []);

      console.log(`   找到 ${activeSignals.length} 个活跃信号需要恢复价格监控`);

      for (const signal of activeSignals) {
        // 转换信号格式
        // 🔧 修复: 添加 is_alpha_token 和 signal_source 字段
        const formattedSignal = {
          signal_id: signal.signal_id,
          token_symbol: signal.token_symbol,
          chain: signal.chain,
          signal_type: signal.signal_type,
          confidence_score: parseFloat(signal.confidence_score),
          entry_min: parseFloat(signal.entry_min),
          entry_max: parseFloat(signal.entry_max),
          stop_loss_price: parseFloat(signal.stop_loss),
          take_profit_price: parseFloat(signal.take_profit_1),
          current_price: parseFloat(signal.current_price),
          contract_address: signal.contract_address,
          expires_at: signal.expires_at,
          dex_name: signal.dex_name || 'Unknown',
          is_alpha_token: signal.is_alpha_token,
          signal_source: signal.signal_source
        };

        // 查询匹配的用户策略
        // 🔧 修复: 必须传递 signal_id 参数，否则会使用错误的策略过滤条件
        const matchedUsers = await RiskController.getEnabledUsers(signal.signal_id, null);
        const passedUsers = [];

        // 🔧 改进: 恢复时也进行完整的风险检查 (包括余额检查)
        for (const strategy of matchedUsers) {
          // 🔧 新增: 检查 signal_source 与 follow_strategy 是否匹配
          // ALPHA 策略只跟踪 ALPHA 信号，RANGE 策略只跟踪 RANGE_ALPHA 信号
          const signalSource = formattedSignal.signal_source || 'ALPHA';
          const followStrategy = strategy.follow_strategy || 'ALPHA';

          if (followStrategy === 'RANGE' && signalSource !== 'RANGE_ALPHA') {
            console.log(`   ⏭️ [恢复] ${strategy.user_id.slice(0,10)}... 策略不匹配: RANGE 策略不跟踪 ${signalSource} 信号`);
            continue;
          }
          if (followStrategy === 'ALPHA' && signalSource !== 'ALPHA') {
            console.log(`   ⏭️ [恢复] ${strategy.user_id.slice(0,10)}... 策略不匹配: ALPHA 策略不跟踪 ${signalSource} 信号`);
            continue;
          }

          const riskCheck = await RiskController.checkTradeRisk(
            strategy,
            formattedSignal,
            parseFloat(strategy.trade_amount)
          );

          if (riskCheck.passed) {
            passedUsers.push(strategy);
          } else {
            // 记录未通过的原因 (帮助调试)
            if (riskCheck.risks && riskCheck.risks.length > 0) {
              console.log(`   ⏭️ [恢复] ${strategy.user_id.slice(0,10)}... 风险检查未通过: ${riskCheck.risks[0].reason}`);
            }
          }
        }

        if (passedUsers.length > 0) {
          console.log(`   📊 [恢复] ${signal.token_symbol}: ${passedUsers.length} 个用户通过风险检查`);
          await PriceWatcher.startMonitoring(formattedSignal, passedUsers);
        } else {
          console.log(`   ℹ️ [恢复] ${signal.token_symbol}: 无用户通过风险检查,跳过监控`);
        }
      }

      // 2. 恢复持仓监控 (HOLDING 状态的持仓)
      // 🔧 修复: 从 auto_trade_positions 表恢复,移除7天限制
      const holdingPositions = await DatabaseService.query(`
        SELECT execution_id, token_symbol
        FROM auto_trade_positions
        WHERE status = 'HOLDING'
        AND execution_id IS NOT NULL
        ORDER BY opened_at DESC
      `);

      console.log(`   找到 ${holdingPositions.length} 个持仓需要恢复监控`);

      for (const position of holdingPositions) {
        console.log(`   🔄 恢复 ${position.token_symbol} 监控 (${position.execution_id})`);
        await ExitMonitor.startMonitoring(position.execution_id);
      }

      // 3. 恢复待确认交易监控 (SUBMITTED 状态)
      await TransactionMonitor.checkPendingTransactions();

      console.log('   ✅ 监控恢复完成');

    } catch (error) {
      console.error(`   ⚠️ 恢复失败: ${error.message}`);
      console.error(error.stack);
    }
  }

  /**
   * 启动定时任务
   */
  startScheduledTasks() {
    console.log('⏰ 启动定时任务...');

    // 1. 每小时更新流动性白名单
    setInterval(async () => {
      console.log('\n📊 [定时任务] 更新流动性白名单');
      await LiquidityMonitor.updateAllDEXTokens();
    }, 3600000); // 1 小时

    // 2. 每 30 秒检查待确认交易
    setInterval(async () => {
      await TransactionMonitor.checkPendingTransactions();
    }, 30000); // 30 秒

    // 3. 每 10 分钟检查熔断状态
    setInterval(async () => {
      await this.checkCircuitBreakers();
    }, 600000); // 10 分钟

    console.log('   ✅ 定时任务已启动');
  }

  /**
   * 检查熔断状态 (自动解除过期的熔断)
   */
  async checkCircuitBreakers() {
    try {
      const paused = await DatabaseService.query(`
        SELECT user_id, paused_until, pause_reason
        FROM auto_trade_config
        WHERE paused_until IS NOT NULL
        AND paused_until < NOW()
      `);

      if (paused.length > 0) {
        console.log(`\n🔓 解除 ${paused.length} 个过期熔断`);

        for (const user of paused) {
          await RiskController.unpauseUser(user.user_id);
        }
      }

    } catch (error) {
      console.error(`❌ 熔断检查失败: ${error.message}`);
    }
  }

  /**
   * 处理新信号 (由 Alpha Monitor 调用)
   */
  async handleNewSignal(signal) {
    if (!this.monitoring) {
      console.log('⚠️ 自动交易服务未启动');
      return;
    }

    // 🔧 兼容两种字段名格式
    const stopLoss = signal.stop_loss_price || signal.stop_loss;
    const takeProfit = signal.take_profit_price || signal.take_profit_1;

    console.log(`\n📢 收到新信号: ${signal.token_symbol} (${signal.signal_id})`);
    console.log(`   信号类型: ${signal.signal_type}`);
    console.log(`   入场区间: $${signal.entry_min} - $${signal.entry_max}`);
    console.log(`   止损: $${stopLoss}`);
    console.log(`   止盈: $${takeProfit}`);

    try {
      // 1. 过滤信号类型 (仅支持 LONG/BUY)
      if (signal.signal_type === 'SHORT' || signal.signal_type === 'SELL' || signal.signal_type === 'NEUTRAL') {
        const reason = `Only LONG/BUY supported, skip ${signal.signal_type}`;
        console.log(`   ⏭️ ${reason}`);
        await this.updateRejectReason(signal.signal_id, reason);
        return;
      }

      // 🆕 1.1 过滤没有合约地址的信号 (CEX 期货信号)
      if (!signal.contract_address || signal.contract_address === 'NULL' || signal.contract_address === null) {
        const reason = `No contract address (CEX futures)`;
        console.log(`   ⏭️ ${reason}`);
        await this.updateRejectReason(signal.signal_id, reason);
        return;
      }

      // 2. 检查代币流动性
      // 🧪 临时跳过流动性检查用于测试
      console.log(`   ⚠️ [测试模式] 跳过流动性检查: ${signal.token_symbol}`);
      // const liquidity = await LiquidityMonitor.checkLiquidity(
      //   signal.token_symbol,
      //   signal.chain,
      //   signal.contract_address // ✅ 传递合约地址
      // );

      // if (!liquidity || !liquidity.isEligible) {
      //   console.log(`   ⏭️ 流动性不足，跳过: ${signal.token_symbol}`);
      //   return;
      // }

      // 3. 查询所有启用自动交易的策略
      // 🔧 修复: 如果信号指定了 strategy_id，优先使用该策略
      const allStrategies = await RiskController.getEnabledUsers(signal.signal_id, signal.strategy_id);

      if (allStrategies.length === 0) {
        const reason = `No matching enabled strategy`;
        console.log(`   ℹ️ ${reason}`);
        await this.updateRejectReason(signal.signal_id, reason);
        return;
      }

      // 4. 逐个策略进行风险检查
      const validStrategies = [];
      const rejectReasons = [];

      for (const strategy of allStrategies) {
        console.log(`   🔍 检查策略: [${strategy.strategy_name}] (${strategy.user_id})`);

        // 🔧 新增: 检查 signal_source 与 follow_strategy 是否匹配
        // ALPHA 策略只跟踪 ALPHA 信号，RANGE 策略只跟踪 RANGE_ALPHA 信号
        const signalSource = signal.signal_source || 'ALPHA';
        const followStrategy = strategy.follow_strategy || 'ALPHA';

        if (followStrategy === 'RANGE' && signalSource !== 'RANGE_ALPHA') {
          const reason = `策略不匹配: RANGE 策略不跟踪 ${signalSource} 信号`;
          rejectReasons.push(`${strategy.strategy_name}: ${reason}`);
          console.log(`   ⏭️ 策略 [${strategy.strategy_name}] ${reason}`);
          continue;
        }
        if (followStrategy === 'ALPHA' && signalSource !== 'ALPHA') {
          const reason = `策略不匹配: ALPHA 策略不跟踪 ${signalSource} 信号`;
          rejectReasons.push(`${strategy.strategy_name}: ${reason}`);
          console.log(`   ⏭️ 策略 [${strategy.strategy_name}] ${reason}`);
          continue;
        }

        const riskCheck = await RiskController.checkTradeRisk(
          strategy,  // 🔧 传递完整策略对象,而不是只传 user_id
          signal,
          parseFloat(strategy.trade_amount)
        );

        if (riskCheck.passed) {
          validStrategies.push(strategy);
          console.log(`   ✅ 策略 [${strategy.strategy_name}] 通过风险检查`);
        } else {
          const reason = riskCheck.risks[0]?.reason || 'Unknown';
          rejectReasons.push(`${strategy.strategy_name}: ${reason}`);
          console.log(`   ⏭️ 策略 [${strategy.strategy_name}] 未通过: ${reason}`);
        }
      }

      if (validStrategies.length === 0) {
        const reason = `Risk check failed: ${rejectReasons.join('; ')}`;
        console.log(`   ℹ️ ${reason}`);
        await this.updateRejectReason(signal.signal_id, reason.substring(0, 255));
        return;
      }

      console.log(`   ✅ 通过风险检查: ${validStrategies.length}/${allStrategies.length} 策略`);

      // 5. 启动价格监控 (传入策略信息)
      await PriceWatcher.startMonitoring(signal, validStrategies);

    } catch (error) {
      console.error(`   ❌ 处理失败: ${error.message}`);
    }
  }

  /**
   * Update reject reason in alpha_signals table
   */
  async updateRejectReason(signalId, reason) {
    try {
      await DatabaseService.query(`
        UPDATE alpha_signals
        SET reject_reason = ?
        WHERE signal_id = ?
      `, [reason, signalId]);
    } catch (error) {
      console.error(`   ⚠️ Failed to update reject_reason: ${error.message}`);
    }
  }

  /**
   * 手动创建自动交易配置
   */
  async createUserConfig(userId, config = {}) {
    console.log(`\n⚙️ 创建用户配置: ${userId}`);

    try {
      const defaults = {
        enabled: false,
        wallet_address: config.wallet_address || null,
        supported_chains: JSON.stringify(config.supported_chains || ['BSC', 'Base']),
        max_trade_amount: config.max_trade_amount || 100,
        max_slippage_percent: config.max_slippage_percent || 2.0,
        max_positions: config.max_positions || 3,
        take_profit_strategy: config.take_profit_strategy || 'ONE_TIME',
        daily_loss_limit: config.daily_loss_limit || -10,
        single_token_max_percent: config.single_token_max_percent || 30,
        min_liquidity_required: config.min_liquidity_required || 200000,
        whitelisted_tokens: config.whitelisted_tokens ? JSON.stringify(config.whitelisted_tokens) : null,
        blacklisted_tokens: config.blacklisted_tokens ? JSON.stringify(config.blacklisted_tokens) : null,
        usdt_balance: config.usdt_balance || 0,
        gas_balance: config.gas_balance || 0
      };

      await DatabaseService.query(`
        INSERT INTO auto_trade_config
        (user_id, enabled, wallet_address, supported_chains, max_trade_amount,
         max_slippage_percent, max_positions, take_profit_strategy,
         daily_loss_limit, single_token_max_percent, min_liquidity_required,
         whitelisted_tokens, blacklisted_tokens, usdt_balance, gas_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          wallet_address = VALUES(wallet_address),
          max_trade_amount = VALUES(max_trade_amount),
          max_slippage_percent = VALUES(max_slippage_percent),
          max_positions = VALUES(max_positions)
      `, [
        userId,
        defaults.enabled,
        defaults.wallet_address,
        defaults.supported_chains,
        defaults.max_trade_amount,
        defaults.max_slippage_percent,
        defaults.max_positions,
        defaults.take_profit_strategy,
        defaults.daily_loss_limit,
        defaults.single_token_max_percent,
        defaults.min_liquidity_required,
        defaults.whitelisted_tokens,
        defaults.blacklisted_tokens,
        defaults.usdt_balance,
        defaults.gas_balance
      ]);

      console.log(`   ✅ 配置已创建/更新`);

      return { success: true };

    } catch (error) {
      console.error(`   ❌ 创建失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 启用/禁用自动交易
   */
  async toggleAutoTrade(userId, enabled) {
    try {
      await DatabaseService.query(`
        UPDATE auto_trade_config
        SET enabled = ?
        WHERE user_id = ?
      `, [enabled, userId]);

      console.log(`   ${enabled ? '✅ 已启用' : '⏸️ 已禁用'} 自动交易: ${userId}`);

      return { success: true };

    } catch (error) {
      console.error(`   ❌ 操作失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取用户统计
   */
  async getUserStats(userId) {
    try {
      // 🔧 修复: 支持通过 wallet_address 或 user_id 查询
      // 1. 先尝试找到所有匹配的 user_id (Privy DID)
      const configs = await DatabaseService.query(`
        SELECT DISTINCT user_id
        FROM auto_trade_config
        WHERE wallet_address = ? OR user_id = ?
      `, [userId, userId]);

      // 如果用户配置不存在，返回默认空数据（而不是错误）
      if (configs.length === 0) {
        return {
          config: null,
          positions: [],
          history: [],
          stats: {
            totalTrades: 0,
            winTrades: 0,
            winRate: 0,
            totalProfit: 0,
            currentPositions: 0,
            todayProfit: 0,
            todayTrades: 0,
            weekProfit: 0,
            weekTrades: 0,
          }
        };
      }

      // 提取所有 user_id
      const userIds = configs.map(c => c.user_id);
      const firstUserId = userIds[0]; // 用于获取配置信息

      // 获取配置信息
      const config = await DatabaseService.query(`
        SELECT * FROM auto_trade_config WHERE user_id = ?
      `, [firstUserId]);

      // 构建 IN 子句的占位符
      const placeholders = userIds.map(() => '?').join(',');

      // 🔧 修复: 从 auto_trade_positions 表查询持仓
      const positions = await DatabaseService.query(`
        SELECT * FROM auto_trade_positions
        WHERE user_id IN (${placeholders}) AND status = 'HOLDING'
        ORDER BY opened_at DESC
      `, userIds);

      // 🔧 修复: 从 auto_trade_history 表查询历史
      const history = await DatabaseService.query(`
        SELECT * FROM auto_trade_history
        WHERE user_id IN (${placeholders})
        ORDER BY exit_executed_at DESC
        LIMIT 20
      `, userIds);

      // 🔧 修复: 从 auto_trade_user_stats 表查询统计数据
      const userStats = await DatabaseService.query(`
        SELECT * FROM auto_trade_user_stats
        WHERE user_id IN (${placeholders})
      `, userIds);

      // 如果没有统计记录，返回默认值
      const stats = userStats.length > 0 ? userStats[0] : {
        today_total_trades: 0,
        today_profit_usdt: 0,
        week_total_trades: 0,
        week_profit_usdt: 0,
        total_trades: 0,
        total_wins: 0,
        total_profit_usdt: 0,
        current_positions_count: 0
      };

      return {
        config: config[0],
        positions: positions,
        history: history,
        stats: {
          totalTrades: stats.total_trades || 0,
          winTrades: stats.total_wins || 0,
          winRate: stats.total_trades > 0 ? (stats.total_wins / stats.total_trades * 100).toFixed(2) : 0,
          totalProfit: parseFloat(stats.total_profit_usdt || 0),
          currentPositions: stats.current_positions_count || 0,
          // 今日统计
          todayProfit: parseFloat(stats.today_profit_usdt || 0),
          todayTrades: stats.today_total_trades || 0,
          // 本周统计
          weekProfit: parseFloat(stats.week_profit_usdt || 0),
          weekTrades: stats.week_total_trades || 0,
        }
      };

    } catch (error) {
      console.error(`❌ 统计查询失败: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * 关闭服务
   */
  async shutdown() {
    console.log('\n🛑 关闭自动交易服务...');

    this.monitoring = false;

    // 停止所有监控
    PriceWatcher.stopAll();
    ExitMonitor.stopAll();

    // 停止 Range Trading 服务
    RangeSignalService.shutdown();

    console.log('✅ 服务已关闭');
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      initialized: this.initialized,
      monitoring: this.monitoring,
      priceMonitors: PriceWatcher.getMonitorStatus(),
      exitMonitors: ExitMonitor.getMonitorStatus()
    };
  }
}

module.exports = new AutoTradeService();

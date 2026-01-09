/**
 * 自动交易数据同步服务
 * 负责将 executions 表的数据同步到 positions/history/stats 表
 */

const DatabaseService = require('../databaseService');
const DynamicStopLoss = require('./DynamicStopLoss');

class DataSyncService {
  /**
   * 当交易入场成功时,创建持仓记录
   * @param {string} executionId - 执行ID
   */
  async onTradeEntry(executionId) {
    try {
      console.log(`\n   📊 [DataSync] 同步入场数据: ${executionId}`);

      // 1. 从 executions 表获取交易数据
      // 🔧 修复: 同时支持 CONFIRMED 和 HOLDING 状态（ExitMonitor 可能已经把状态改成 HOLDING）
      const executions = await DatabaseService.query(
        `SELECT * FROM auto_trade_executions
         WHERE execution_id = ?
         AND status IN ('CONFIRMED', 'HOLDING')
         AND entry_tx_hash IS NOT NULL`,
        [executionId]
      );

      if (executions.length === 0) {
        console.log(`   ⚠️  未找到可同步的执行记录 (需要 CONFIRMED/HOLDING 状态且有 entry_tx_hash)`);
        return;
      }

      const execution = executions[0];

      // 2. 计算 position_id
      const positionId = `pos_${execution.execution_id}`;

      // 3. 获取止损止盈价格
      // 🔧 修复: 优先使用信号中的动态计算 TP/SL (Range Trading 信号已预计算)
      let stopLossPrice = null;
      let takeProfitPrice = null;
      let atrValue = null;
      let stopLossType = 'FIXED';
      let trailingActivated = false;

      // 🆕 优先级1: 从 alpha_signals 表读取信号中的 TP/SL 价格
      // Range Trading 信号包含预计算的动态 TP/SL
      console.log(`   🔍 [DataSync] 查询 alpha_signals: signal_id=${execution.signal_id}`);
      const signalResult = await DatabaseService.query(
        `SELECT stop_loss, take_profit_1, current_price, is_alpha_token FROM alpha_signals WHERE signal_id = ? LIMIT 1`,
        [execution.signal_id]
      );
      console.log(`   🔍 [DataSync] 查询结果: ${JSON.stringify(signalResult)}`);

      // 🔧 提取 is_alpha_token (用于后续 INSERT)
      let signalIsAlphaToken = null;

      if (signalResult.length > 0 && signalResult[0].stop_loss && signalResult[0].take_profit_1) {
        // 🔧 首先计算实际成交价
        const actualEntryPrice = execution.entry_amount_token && parseFloat(execution.entry_amount_token) > 0
          ? parseFloat(execution.entry_amount_usdt) / parseFloat(execution.entry_amount_token)
          : parseFloat(execution.entry_price);

        // 读取信号中的预计算值
        const signalStopLoss = parseFloat(signalResult[0].stop_loss);
        const signalTakeProfit = parseFloat(signalResult[0].take_profit_1);

        // 🔧 修复: 验证 TP/SL 相对于实际成交价是否合理
        // 如果 take_profit <= actual_entry_price，说明买入时价格已上涨，需要重新计算
        if (signalTakeProfit <= actualEntryPrice) {
          console.log(`   ⚠️ [DataSync] 信号 TP($${signalTakeProfit.toFixed(8)}) <= 实际成交价($${actualEntryPrice.toFixed(8)})，需要重新计算`);

          // 从信号推算原本的 TP/SL 百分比
          const signalEntryPrice = parseFloat(signalResult[0].current_price) || actualEntryPrice;
          let tpPct = signalEntryPrice > 0 ? ((signalTakeProfit - signalEntryPrice) / signalEntryPrice) * 100 : 10;
          let slPct = signalEntryPrice > 0 ? ((signalEntryPrice - signalStopLoss) / signalEntryPrice) * 100 : 5;

          // 确保百分比在合理范围内
          tpPct = Math.max(5, Math.min(50, tpPct));  // 5%-50%
          slPct = Math.max(3, Math.min(20, slPct));  // 3%-20%

          // 基于实际成交价重新计算 TP/SL
          takeProfitPrice = actualEntryPrice * (1 + tpPct / 100);
          stopLossPrice = actualEntryPrice * (1 - slPct / 100);

          console.log(`   🔄 [DataSync] 重新计算 TP/SL: 基于实际成交价 $${actualEntryPrice.toFixed(8)}, SL=${slPct.toFixed(1)}% → $${stopLossPrice.toFixed(8)}, TP=${tpPct.toFixed(1)}% → $${takeProfitPrice.toFixed(8)}`);
        } else {
          // 信号 TP > 实际成交价，可以使用信号值
          stopLossPrice = signalStopLoss;
          takeProfitPrice = signalTakeProfit;
          console.log(`   ✅ [DataSync] 使用信号预计算 TP/SL: SL=$${stopLossPrice.toFixed(8)}, TP=$${takeProfitPrice.toFixed(8)}`);
        }

        stopLossType = 'FIXED';  // 🔧 修复: 数据库只支持 FIXED|ATR|TRAILING|TIME_DECAY，不支持 DYNAMIC
        // 🔧 同时获取 is_alpha_token
        signalIsAlphaToken = signalResult[0].is_alpha_token;

        console.log(`   📊 [DataSync] is_alpha=${signalIsAlphaToken}`);
      } else {
        console.log(`   ⚠️ [DataSync] 优先级1失败: signalResult.length=${signalResult.length}, stop_loss=${signalResult[0]?.stop_loss}, take_profit_1=${signalResult[0]?.take_profit_1}`);

        // 🔧 修复: 即使 TP/SL 不存在，也要提取 is_alpha_token
        if (signalResult.length > 0 && signalResult[0].is_alpha_token !== undefined && signalResult[0].is_alpha_token !== null) {
          signalIsAlphaToken = signalResult[0].is_alpha_token;
          console.log(`   📊 [DataSync] is_alpha=${signalIsAlphaToken} (从信号提取，TP/SL将用策略配置计算)`);
        }

        // 🆕 优先级2: 从策略配置计算 TP/SL
        let settings;

        // 使用 strategy_id 精确匹配 (最准确)
        if (execution.strategy_id) {
          settings = await DatabaseService.query(
            `SELECT stop_loss_percent, take_profit_percent, stop_loss_mode, strategy_name
             FROM auto_trade_config
             WHERE strategy_id = ?
             LIMIT 1`,
            [execution.strategy_id]
          );
          if (settings.length > 0) {
            console.log(`   🎯 [DataSync] 使用策略ID: ${execution.strategy_id} (${settings[0].strategy_name})`);
          }
        }

        // 使用 follow_strategy 匹配 (兼容旧数据)
        if ((!settings || settings.length === 0) && execution.follow_strategy && execution.follow_strategy !== 'UNKNOWN') {
          settings = await DatabaseService.query(
            `SELECT stop_loss_percent, take_profit_percent, stop_loss_mode, strategy_name
             FROM auto_trade_config
             WHERE user_id = ? AND follow_strategy = ?
             LIMIT 1`,
            [execution.user_id, execution.follow_strategy]
          );
          if (settings.length > 0) {
            console.log(`   🎯 [DataSync] 使用策略类型: ${execution.follow_strategy}`);
          }
        }

        // 如果都没找到，使用系统默认值
        if (!settings || settings.length === 0) {
          console.log(`   ⚠️ [DataSync] 未找到匹配策略，使用系统默认值: SL=10%, TP=120%`);
          settings = [{
            stop_loss_percent: 10,
            take_profit_percent: 120,
            stop_loss_mode: 'FIXED'
          }];
        }

        if (settings.length > 0 && execution.entry_price) {
          const stopLossPct = settings[0].stop_loss_percent || 10;
          const takeProfitPct = settings[0].take_profit_percent || 20;
          const stopLossMode = settings[0].stop_loss_mode || 'FIXED';

          console.log(`   📋 [DataSync] 使用配置计算: SL=${stopLossPct}%, TP=${takeProfitPct}%, Mode=${stopLossMode}`);

          // 使用实际成交价计算止损止盈
          const actualEntryPrice = execution.entry_amount_token && parseFloat(execution.entry_amount_token) > 0
            ? parseFloat(execution.entry_amount_usdt) / parseFloat(execution.entry_amount_token)
            : parseFloat(execution.entry_price);

          console.log(`   🔍 [DataSync] 实际成交价=$${actualEntryPrice.toFixed(8)}`);

          // 尝试获取K线数据计算ATR动态止损（仅 ATR 模式需要）
          let klines = [];
          if (stopLossMode === 'ATR') {
            try {
              const BinanceAlphaService = require('../BinanceAlphaService');
              const marketData = await BinanceAlphaService.getMarketData(execution.token_symbol + 'USDT');
              klines = marketData?.klines?.['1h'] || [];
              console.log(`   📊 [DataSync] 获取K线数据: ${klines.length} 条`);
            } catch (e) {
              console.log(`   ⚠️ [DataSync] 获取K线失败: ${e.message}`);
            }
          }

          // 使用 DynamicStopLoss 计算止损止盈
          const slConfig = DynamicStopLoss.getInitialStopLoss(actualEntryPrice, klines, {
            stopLossPct: stopLossPct,
            takeProfitPct: takeProfitPct,
            stopLossMode: stopLossMode
          });

          stopLossPrice = slConfig.stopLossPrice;
          takeProfitPrice = slConfig.takeProfitPrice;
          atrValue = slConfig.atrValue;
          stopLossType = slConfig.stopLossType;
          trailingActivated = slConfig.trailingActivated || false;

          console.log(`   🛡️ [DataSync] 计算结果: 类型=${stopLossType}, SL=$${stopLossPrice?.toFixed(8)}, TP=$${takeProfitPrice?.toFixed(8)}`);
        }
      }

      // 4. 插入到 positions 表 (包含动态止损字段)
      // 计算实际入场价用于 highest_price 初始值
      const actualEntryPriceForHighest = execution.entry_amount_token && parseFloat(execution.entry_amount_token) > 0
        ? parseFloat(execution.entry_amount_usdt) / parseFloat(execution.entry_amount_token)
        : parseFloat(execution.entry_price);

      // 🔧 获取 signal_source：优先从 execution，其次从 alpha_signals 查询
      let signalSource = execution.signal_source;
      if (!signalSource && execution.signal_id) {
        try {
          const signalData = await DatabaseService.query(
            `SELECT signal_source FROM alpha_signals WHERE signal_id = ? LIMIT 1`,
            [execution.signal_id]
          );
          if (signalData.length > 0) {
            signalSource = signalData[0].signal_source;
            console.log(`   📍 [DataSync] signal_source = ${signalSource} (来自 alpha_signals)`);
          }
        } catch (e) {
          console.log(`   ⚠️ [DataSync] 获取 signal_source 失败: ${e.message}`);
        }
      }

      await DatabaseService.query(
        `INSERT INTO auto_trade_positions (
          position_id, user_id, execution_id, signal_id,
          token_symbol, chain, contract_address, dex_name,
          entry_price, entry_amount_usdt, entry_amount_token, entry_tx_hash,
          current_token_balance,
          stop_loss_price, take_profit_price,
          atr_value, highest_price, trailing_stop_activated, trailing_stop_price, stop_loss_type,
          current_price, unrealized_pnl_usdt, unrealized_pnl_percent,
          is_alpha_token, signal_source,
          status, opened_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          entry_price = VALUES(entry_price),
          entry_amount_usdt = VALUES(entry_amount_usdt),
          entry_amount_token = VALUES(entry_amount_token),
          current_token_balance = VALUES(current_token_balance),
          atr_value = VALUES(atr_value),
          stop_loss_type = VALUES(stop_loss_type),
          is_alpha_token = VALUES(is_alpha_token),
          signal_source = VALUES(signal_source),
          updated_at = NOW()`,
        [
          positionId,
          execution.user_id,
          execution.execution_id,
          execution.signal_id,
          execution.token_symbol,
          execution.chain,
          execution.contract_address,
          execution.dex_name,
          execution.entry_price,
          execution.entry_amount_usdt,
          execution.entry_amount_token,
          execution.entry_tx_hash,
          execution.entry_amount_token, // current_token_balance = entry_amount_token
          stopLossPrice,
          takeProfitPrice,
          atrValue,                        // 🆕 ATR值
          actualEntryPriceForHighest,      // 🆕 highest_price 初始值 = 入场价
          trailingActivated ? 1 : 0,       // 🔧 修复: 使用计算的 trailingActivated 值
          null,                            // 🆕 trailing_stop_price = null
          stopLossType,                    // 🆕 stop_loss_type (ATR/FIXED/TRAILING)
          execution.entry_price,           // current_price 初始值 = entry_price
          0,                               // unrealized_pnl_usdt 初始值 = 0
          0,                               // unrealized_pnl_percent 初始值 = 0
          signalIsAlphaToken ?? (execution.is_alpha_token ? 1 : 0), // 🔧 修复：优先使用信号的 is_alpha_token
          signalSource || null,            // 🔧 新增：signal_source
          'HOLDING',
          execution.entry_executed_at
        ]
      );

      console.log(`   ✅ 持仓记录已创建: ${positionId}`);

      // 5. 更新用户统计
      await this.updateUserStats(execution.user_id);

    } catch (error) {
      console.error(`   ❌ 同步入场数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 当交易出场完成时,更新历史记录
   * @param {string} executionId - 执行ID
   */
  async onTradeExit(executionId) {
    try {
      console.log(`\n   📊 [DataSync] 同步出场数据: ${executionId}`);

      // 1. 从 executions 表获取交易数据
      const executions = await DatabaseService.query(
        `SELECT * FROM auto_trade_executions WHERE execution_id = ? AND status = 'EXITED'`,
        [executionId]
      );

      if (executions.length === 0) {
        console.log(`   ⚠️  未找到已平仓的执行记录`);
        return;
      }

      const execution = executions[0];

      // 2. 计算持仓时长
      let holdingDuration = null;
      if (execution.entry_executed_at && execution.exit_executed_at) {
        const entryTime = new Date(execution.entry_executed_at).getTime();
        const exitTime = new Date(execution.exit_executed_at).getTime();
        holdingDuration = Math.floor((exitTime - entryTime) / 1000);
      }

      // 3. 插入到 history 表
      const historyId = `hist_${execution.execution_id}`;

      await DatabaseService.query(
        `INSERT INTO auto_trade_history (
          history_id, user_id, execution_id, signal_id,
          token_symbol, chain, contract_address, dex_name,
          entry_price, entry_amount_usdt, entry_amount_token, entry_tx_hash, entry_executed_at,
          exit_price, exit_amount_usdt, exit_type, exit_tx_hash, exit_executed_at,
          profit_loss_usdt, profit_loss_percent, total_fees,
          holding_duration_seconds, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          exit_price = VALUES(exit_price),
          exit_amount_usdt = VALUES(exit_amount_usdt),
          exit_type = VALUES(exit_type),
          exit_tx_hash = VALUES(exit_tx_hash),
          profit_loss_usdt = VALUES(profit_loss_usdt),
          profit_loss_percent = VALUES(profit_loss_percent)`,
        [
          historyId,
          execution.user_id,
          execution.execution_id,
          execution.signal_id,
          execution.token_symbol,
          execution.chain,
          execution.contract_address,
          execution.dex_name,
          execution.entry_price,
          execution.entry_amount_usdt,
          execution.entry_amount_token,
          execution.entry_tx_hash,
          execution.entry_executed_at,
          execution.exit_price,
          execution.exit_amount_usdt,
          execution.exit_type,
          execution.exit_tx_hash,
          execution.exit_executed_at,
          execution.profit_loss_usdt,
          execution.profit_loss_percent,
          execution.total_fees,
          holdingDuration
        ]
      );

      console.log(`   ✅ 历史记录已创建: ${historyId}`);

      // 4. 从 positions 表删除
      const positionId = `pos_${execution.execution_id}`;
      await DatabaseService.query(
        `DELETE FROM auto_trade_positions WHERE position_id = ?`,
        [positionId]
      );

      console.log(`   ✅ 持仓记录已删除: ${positionId}`);

      // 5. 更新用户统计
      await this.updateUserStats(execution.user_id);

    } catch (error) {
      console.error(`   ❌ 同步出场数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 更新用户统计数据
   * @param {string} userId - 用户ID
   */
  async updateUserStats(userId) {
    try {
      console.log(`   📊 [DataSync] 更新用户统计: ${userId}`);

      // 1. 计算今日统计
      const todayStats = await DatabaseService.query(
        `SELECT
          COUNT(*) as total_trades,
          COALESCE(SUM(profit_loss_usdt), 0) as profit_usdt,
          COALESCE(SUM(CASE WHEN profit_loss_usdt > 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) as win_rate
        FROM auto_trade_history
        WHERE user_id = ? AND DATE(exit_executed_at) = CURDATE()`,
        [userId]
      );

      // 2. 计算本周统计
      const weekStats = await DatabaseService.query(
        `SELECT
          COUNT(*) as total_trades,
          COALESCE(SUM(profit_loss_usdt), 0) as profit_usdt,
          COALESCE(SUM(CASE WHEN profit_loss_usdt > 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) as win_rate
        FROM auto_trade_history
        WHERE user_id = ? AND YEARWEEK(exit_executed_at, 1) = YEARWEEK(CURDATE(), 1)`,
        [userId]
      );

      // 3. 计算总计统计
      const totalStats = await DatabaseService.query(
        `SELECT
          COUNT(*) as total_trades,
          COALESCE(SUM(profit_loss_usdt), 0) as profit_usdt,
          COALESCE(SUM(CASE WHEN profit_loss_usdt > 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) as win_rate,
          SUM(CASE WHEN profit_loss_usdt > 0 THEN 1 ELSE 0 END) as total_wins,
          SUM(CASE WHEN profit_loss_usdt < 0 THEN 1 ELSE 0 END) as total_losses,
          COALESCE(MAX(profit_loss_usdt), 0) as best_profit,
          COALESCE(MIN(profit_loss_usdt), 0) as worst_loss
        FROM auto_trade_history
        WHERE user_id = ?`,
        [userId]
      );

      // 4. 计算当前持仓统计
      const positionsStats = await DatabaseService.query(
        `SELECT
          COUNT(*) as positions_count,
          COALESCE(SUM(entry_amount_usdt), 0) as positions_value,
          COALESCE(SUM(unrealized_pnl_usdt), 0) as unrealized_pnl
        FROM auto_trade_positions
        WHERE user_id = ? AND status = 'HOLDING'`,
        [userId]
      );

      // 5. 插入或更新统计表
      await DatabaseService.query(
        `INSERT INTO auto_trade_user_stats (
          user_id,
          today_total_trades, today_profit_usdt, today_win_rate,
          week_total_trades, week_profit_usdt, week_win_rate,
          total_trades, total_profit_usdt, total_win_rate, total_wins, total_losses,
          current_positions_count, current_positions_value_usdt, current_unrealized_pnl_usdt,
          best_trade_profit_usdt, worst_trade_loss_usdt,
          last_updated, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          today_total_trades = VALUES(today_total_trades),
          today_profit_usdt = VALUES(today_profit_usdt),
          today_win_rate = VALUES(today_win_rate),
          week_total_trades = VALUES(week_total_trades),
          week_profit_usdt = VALUES(week_profit_usdt),
          week_win_rate = VALUES(week_win_rate),
          total_trades = VALUES(total_trades),
          total_profit_usdt = VALUES(total_profit_usdt),
          total_win_rate = VALUES(total_win_rate),
          total_wins = VALUES(total_wins),
          total_losses = VALUES(total_losses),
          current_positions_count = VALUES(current_positions_count),
          current_positions_value_usdt = VALUES(current_positions_value_usdt),
          current_unrealized_pnl_usdt = VALUES(current_unrealized_pnl_usdt),
          best_trade_profit_usdt = VALUES(best_trade_profit_usdt),
          worst_trade_loss_usdt = VALUES(worst_trade_loss_usdt),
          last_updated = NOW()`,
        [
          userId,
          todayStats[0].total_trades,
          todayStats[0].profit_usdt,
          todayStats[0].win_rate,
          weekStats[0].total_trades,
          weekStats[0].profit_usdt,
          weekStats[0].win_rate,
          totalStats[0].total_trades,
          totalStats[0].profit_usdt,
          totalStats[0].win_rate,
          totalStats[0].total_wins || 0,
          totalStats[0].total_losses || 0,
          positionsStats[0].positions_count,
          positionsStats[0].positions_value,
          positionsStats[0].unrealized_pnl,
          totalStats[0].best_profit,
          totalStats[0].worst_loss
        ]
      );

      console.log(`   ✅ 用户统计已更新`);

    } catch (error) {
      console.error(`   ❌ 更新用户统计失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 同步现有的 CONFIRMED 记录到 positions 表
   * 用于初始化或修复数据
   */
  async syncExistingPositions() {
    try {
      console.log(`\n📊 [DataSync] 同步现有持仓数据...`);

      // 🔧 修复: 同时查询 CONFIRMED 和 HOLDING 状态
      // 🔧 新增: 只恢复最近3天内的记录，防止恢复过期旧持仓
      // 找出有入场交易但没有同步到 positions 表的记录
      const executions = await DatabaseService.query(
        `SELECT e.* FROM auto_trade_executions e
         LEFT JOIN auto_trade_positions p ON p.execution_id = e.execution_id
         WHERE e.status IN ('CONFIRMED', 'HOLDING')
         AND e.entry_tx_hash IS NOT NULL
         AND e.exit_tx_hash IS NULL
         AND p.position_id IS NULL
         AND e.created_at > DATE_SUB(NOW(), INTERVAL 3 DAY)`
      );

      // 🔧 统计被跳过的旧记录
      const oldExecutions = await DatabaseService.query(
        `SELECT COUNT(*) as count FROM auto_trade_executions e
         LEFT JOIN auto_trade_positions p ON p.execution_id = e.execution_id
         WHERE e.status IN ('CONFIRMED', 'HOLDING')
         AND e.entry_tx_hash IS NOT NULL
         AND e.exit_tx_hash IS NULL
         AND p.position_id IS NULL
         AND e.created_at <= DATE_SUB(NOW(), INTERVAL 3 DAY)`
      );
      const oldCount = oldExecutions[0]?.count || 0;

      console.log(`   找到 ${executions.length} 条待同步记录 (仅恢复最近3天内的记录)`);
      if (oldCount > 0) {
        console.log(`   ⏭️ 跳过 ${oldCount} 条超过3天的旧记录`);
      }

      for (const execution of executions) {
        await this.onTradeEntry(execution.execution_id);
      }

      console.log(`   ✅ 同步完成`);

    } catch (error) {
      console.error(`   ❌ 同步现有持仓失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🆕 数据一致性检查与修复
   * 定期运行，检查和修复 executions 与 positions 表之间的数据不一致
   */
  async checkAndRepairDataConsistency() {
    try {
      console.log(`\n🔧 [DataSync] 开始数据一致性检查...`);
      let repaired = 0;

      // 1. 检查有 entry_tx_hash 但没有 positions 记录的 HOLDING 状态
      const missingPositions = await DatabaseService.query(
        `SELECT e.execution_id, e.token_symbol, e.status
         FROM auto_trade_executions e
         LEFT JOIN auto_trade_positions p ON p.execution_id = e.execution_id
         WHERE e.status IN ('CONFIRMED', 'HOLDING')
         AND e.entry_tx_hash IS NOT NULL
         AND e.exit_tx_hash IS NULL
         AND p.position_id IS NULL`
      );

      if (missingPositions.length > 0) {
        console.log(`   ⚠️ 发现 ${missingPositions.length} 条缺少 positions 记录的交易`);
        for (const exec of missingPositions) {
          console.log(`   🔄 修复: ${exec.execution_id} (${exec.token_symbol})`);
          await this.onTradeEntry(exec.execution_id);
          repaired++;
        }
      }

      // 2. 检查有 exit_tx_hash 但状态还是 HOLDING 的记录
      // 这种情况需要验证链上交易状态
      const stuckExits = await DatabaseService.query(
        `SELECT execution_id, token_symbol, exit_tx_hash, chain
         FROM auto_trade_executions
         WHERE status = 'HOLDING'
         AND exit_tx_hash IS NOT NULL`
      );

      if (stuckExits.length > 0) {
        console.log(`   ⚠️ 发现 ${stuckExits.length} 条卡住的出场交易`);
        const TransactionMonitor = require('./TransactionMonitor');

        for (const exec of stuckExits) {
          console.log(`   🔍 检查链上状态: ${exec.execution_id} (${exec.token_symbol})`);
          try {
            const txStatus = await TransactionMonitor.getTransactionStatus(exec.exit_tx_hash, exec.chain);

            if (txStatus.status === 'SUCCESS') {
              console.log(`   ✅ 链上交易已成功，更新状态为 EXITED`);
              await DatabaseService.query(
                `UPDATE auto_trade_executions SET status = 'EXITED' WHERE execution_id = ?`,
                [exec.execution_id]
              );
              await this.onTradeExit(exec.execution_id);
              repaired++;
            } else if (txStatus.status === 'FAILED') {
              console.log(`   ❌ 链上交易失败，更新状态为 FAILED`);
              await DatabaseService.query(
                `UPDATE auto_trade_executions SET status = 'FAILED' WHERE execution_id = ?`,
                [exec.execution_id]
              );
              repaired++;
            } else {
              console.log(`   ⏳ 交易仍在等待确认 (${txStatus.status})`);
            }
          } catch (e) {
            console.error(`   ⚠️ 检查链上状态失败: ${e.message}`);
          }
        }
      }

      // 3. 🆕 FAILED 出场自动重试
      // 当链上交易 revert 时，状态变为 FAILED，需要自动重试
      // exit_tx_hash IS NOT NULL 确保只重试出场失败的订单（不重试入场失败）
      const failedExits = await DatabaseService.query(
        `SELECT e.execution_id, e.token_symbol, e.chain, e.exit_type, e.error_message,
                p.contract_address, p.entry_amount_token, p.partial_sold_pct
         FROM auto_trade_executions e
         LEFT JOIN auto_trade_positions p ON p.execution_id = e.execution_id
         WHERE e.status = 'FAILED'
         AND e.exit_tx_hash IS NOT NULL`
      );

      if (failedExits.length > 0) {
        console.log(`   🔄 发现 ${failedExits.length} 条出场失败的交易，尝试重试...`);
        const ExitMonitor = require('./ExitMonitor');

        for (const exec of failedExits) {
          // 解析重试次数 (从 error_message 中提取)
          let retryCount = 0;
          if (exec.error_message) {
            const match = exec.error_message.match(/\[Retry (\d+)\]/);
            if (match) {
              retryCount = parseInt(match[1], 10);
            }
          }

          // 最多重试 3 次
          if (retryCount >= 3) {
            console.log(`   ⚠️ ${exec.execution_id} 已重试 ${retryCount} 次，跳过`);
            continue;
          }

          console.log(`   🔄 重试出场 (第 ${retryCount + 1} 次): ${exec.execution_id} (${exec.token_symbol})`);

          try {
            // 🔧 新增：先检查持仓是否还存在
            if (!exec.contract_address) {
              // 持仓已不存在，说明交易实际已完成，直接标记为 EXITED
              console.log(`   ✅ 持仓已不存在，标记为 EXITED: ${exec.execution_id}`);
              await DatabaseService.query(
                `UPDATE auto_trade_executions SET status = 'EXITED' WHERE execution_id = ?`,
                [exec.execution_id]
              );
              await this.onTradeExit(exec.execution_id);
              repaired++;
              continue;
            }

            // 1. 清除旧的 exit_tx_hash，重置状态为 HOLDING
            await DatabaseService.query(
              `UPDATE auto_trade_executions
               SET status = 'HOLDING',
                   exit_tx_hash = NULL,
                   error_message = ?
               WHERE execution_id = ?`,
              [`[Retry ${retryCount + 1}] 准备重新出场`, exec.execution_id]
            );

            // 2. 重新启动监控（会在下一个检查周期触发出场）
            // 或直接执行出场
            const exitType = exec.exit_type || 'STOP_LOSS';

            // 直接调用 executeExit 强制出场
            const result = await ExitMonitor.executeExit(
              exec.execution_id,
              exitType,
              `Auto retry #${retryCount + 1} after FAILED`
            );

            if (result.success) {
              console.log(`   ✅ 重试出场成功: ${exec.execution_id}`);
              repaired++;
            } else {
              console.log(`   ⚠️ 重试出场失败: ${result.error}`);
              // 更新 error_message 记录重试次数
              await DatabaseService.query(
                `UPDATE auto_trade_executions
                 SET error_message = ?
                 WHERE execution_id = ?`,
                [`[Retry ${retryCount + 1}] ${result.error || 'Unknown error'}`, exec.execution_id]
              );
            }
          } catch (retryError) {
            console.error(`   ❌ 重试出场异常: ${retryError.message}`);
            await DatabaseService.query(
              `UPDATE auto_trade_executions
               SET error_message = ?
               WHERE execution_id = ?`,
              [`[Retry ${retryCount + 1}] Exception: ${retryError.message}`, exec.execution_id]
            );
          }

          // 等待 10 秒再处理下一个，避免并发问题
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }

      // 4. 清理 positions 表中状态异常的记录
      // 如果 executions 表已经是 EXITED 但 positions 表还有记录
      // 🔧 注意：不删除 EXIT_FAILED 的记录，因为会重试
      const orphanPositions = await DatabaseService.query(
        `SELECT p.position_id, p.token_symbol, e.status as exec_status
         FROM auto_trade_positions p
         LEFT JOIN auto_trade_executions e ON e.execution_id = p.execution_id
         WHERE e.status = 'EXITED' OR e.execution_id IS NULL`
      );

      if (orphanPositions.length > 0) {
        console.log(`   ⚠️ 发现 ${orphanPositions.length} 条孤立的 positions 记录`);
        for (const pos of orphanPositions) {
          console.log(`   🗑️ 删除孤立记录: ${pos.position_id} (${pos.token_symbol})`);
          await DatabaseService.query(
            `DELETE FROM auto_trade_positions WHERE position_id = ?`,
            [pos.position_id]
          );
          repaired++;
        }
      }

      console.log(`   ✅ 数据一致性检查完成，修复了 ${repaired} 条记录`);
      return { repaired };

    } catch (error) {
      console.error(`   ❌ 数据一致性检查失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 启动定期一致性检查 (每5分钟运行一次)
   */
  startPeriodicCheck() {
    console.log(`\n⏰ [DataSync] 启动定期数据一致性检查 (每5分钟)`);
    setInterval(() => {
      this.checkAndRepairDataConsistency().catch(e => {
        console.error(`   ❌ 定期检查失败: ${e.message}`);
      });
    }, 5 * 60 * 1000); // 5分钟
  }
}

module.exports = new DataSyncService();

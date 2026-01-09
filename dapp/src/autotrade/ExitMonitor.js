/**
 * 出场监控服务
 * 功能:
 * 1. 监控持仓价格
 * 2. 触发止损 (Stop Loss)
 * 3. 触发止盈 (Take Profit)
 * 4. 信号过期自动出场
 * 5. 手动出场
 */

const DatabaseService = require('../databaseService');
const DEXAggregatorService = require('./DEXAggregatorService');
const DynamicStopLoss = require('./DynamicStopLoss');
const { ethers } = require('ethers');

class ExitMonitor {
  constructor() {
    this.activeMonitors = new Map(); // executionId -> { interval, position }
    this.checkInterval = 15000; // 每 15 秒检查一次

    console.log('✅ ExitMonitor initialized');
  }

  /**
   * 启动持仓监控
   */
  async startMonitoring(executionId) {
    // 已在监控中
    if (this.activeMonitors.has(executionId)) {
      console.log(`   ⚠️ ${executionId} 已在监控中`);
      return;
    }

    console.log(`\n👁️ 启动出场监控: ${executionId}`);

    try {
      // 1. 查询持仓信息 (包含止损止盈价格)
      const position = await this.getPositionWithStopLoss(executionId);

      if (!position) {
        console.log(`   ❌ 持仓不存在`);
        return;
      }

      console.log(`   代币: ${position.token_symbol}`);
      console.log(`   入场价: $${position.entry_price}`);
      console.log(`   止损点: $${position.stop_loss_price}`);
      console.log(`   止盈点: $${position.take_profit_price}`);

      // 3. 更新状态为 HOLDING
      await DatabaseService.query(`
        UPDATE auto_trade_executions
        SET status = 'HOLDING'
        WHERE execution_id = ?
      `, [executionId]);

      // 2. 定时检查价格
      const interval = setInterval(async () => {
        try {
          await this.checkExitConditions(executionId, position);
        } catch (error) {
          console.error(`   ❌ 检查失败: ${error.message}`);
        }
      }, this.checkInterval);

      // 3. 保存监控状态
      this.activeMonitors.set(executionId, {
        interval,
        position,
        startedAt: new Date()
      });

    } catch (error) {
      console.error(`   ❌ 启动监控失败: ${error.message}`);
    }
  }

  /**
   * 检查出场条件
   */
  async checkExitConditions(executionId, position) {
    try {
      // 🔧 重新获取最新的持仓数据（确保有 contract_address 等字段）
      const freshPosition = await this.getPositionWithStopLoss(executionId);
      if (freshPosition) {
        position = freshPosition;
      }

      // 1. 获取当前价格 (🔧 传入 position 以支持 MEME 策略的 DEX 价格)
      // 🔧 DEBUG: 打印 contract_address 确认是否存在
      if (position.contract_address) {
        console.log(`   🔧 [DEBUG] contract_address: ${position.contract_address}`);
      }

      // 🔧 修复: 根据 signal_source 判断 is_alpha_token（避免同名MEME/Alpha冲突）
      // signal_source 包含 "ALPHA" → is_alpha_token = 1
      // signal_source 包含 "MEME" → is_alpha_token = 0
      const signalSource = position.signal_source || '';
      const shouldBeAlpha = signalSource.toUpperCase().includes('ALPHA');
      const shouldBeMeme = signalSource.toUpperCase().includes('MEME');

      if (shouldBeAlpha && position.is_alpha_token !== 1) {
        console.log(`   ⚠️ is_alpha_token 修正: ${position.is_alpha_token} → 1 (signal_source=${signalSource})`);
        position.is_alpha_token = 1;
        await DatabaseService.query(
          `UPDATE auto_trade_positions SET is_alpha_token = 1 WHERE execution_id = ?`,
          [executionId]
        );
        await DatabaseService.query(
          `UPDATE auto_trade_executions SET is_alpha_token = 1 WHERE execution_id = ?`,
          [executionId]
        );
      } else if (shouldBeMeme && position.is_alpha_token !== 0) {
        console.log(`   ⚠️ is_alpha_token 修正: ${position.is_alpha_token} → 0 (signal_source=${signalSource})`);
        position.is_alpha_token = 0;
        await DatabaseService.query(
          `UPDATE auto_trade_positions SET is_alpha_token = 0 WHERE execution_id = ?`,
          [executionId]
        );
        await DatabaseService.query(
          `UPDATE auto_trade_executions SET is_alpha_token = 0 WHERE execution_id = ?`,
          [executionId]
        );
      } else if (!signalSource && (position.is_alpha_token === null || position.is_alpha_token === undefined)) {
        // 没有 signal_source 且 is_alpha_token 未设置，根据是否有合约地址推断
        if (!position.contract_address) {
          console.log(`   ⚠️ is_alpha_token 推断: → 1 (无signal_source，无contract_address)`);
          position.is_alpha_token = 1;
        }
      }

      const currentPrice = await this.getCurrentPrice(position.token_symbol, position.chain, position);

      if (!currentPrice) {
        console.log(`   ⚠️ 无法获取价格: ${position.token_symbol}`);
        return;
      }

      // 2. 计算收益率和盈亏
      const entryPrice = parseFloat(position.entry_price);
      const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      const entryAmountUsdt = parseFloat(position.entry_amount_usdt) || 0;
      const unrealizedPnlUsdt = entryAmountUsdt * (profitPercent / 100);

      console.log(`   [${new Date().toLocaleTimeString()}] ${position.token_symbol}: $${currentPrice.toFixed(6)} (${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);

      // 🆕 动态止损检查与更新 (移动止损 + 时间衰减)
      const stopLossUpdate = DynamicStopLoss.checkAndUpdateStopLoss(position, currentPrice);

      if (stopLossUpdate.shouldUpdate) {
        // 构建更新字段
        const updateFields = ['current_price = ?', 'unrealized_pnl_usdt = ?', 'unrealized_pnl_percent = ?'];
        const updateValues = [currentPrice, unrealizedPnlUsdt, profitPercent];

        for (const [key, value] of Object.entries(stopLossUpdate.fields)) {
          updateFields.push(`${key} = ?`);
          updateValues.push(value);
        }
        updateValues.push(executionId);

        await DatabaseService.query(`
          UPDATE auto_trade_positions
          SET ${updateFields.join(', ')}, updated_at = NOW()
          WHERE execution_id = ?
        `, updateValues);

        // 更新内存中的 position 对象
        Object.assign(position, stopLossUpdate.fields);

        if (stopLossUpdate.fields.stop_loss_price) {
          console.log(`   🔄 [DynamicSL] 止损已更新: $${stopLossUpdate.fields.stop_loss_price.toFixed(6)} (${stopLossUpdate.fields.stop_loss_type})`);
        }
      } else {
        // 仅更新价格和盈亏
        await DatabaseService.query(`
          UPDATE auto_trade_positions
          SET
            current_price = ?,
            unrealized_pnl_usdt = ?,
            unrealized_pnl_percent = ?,
            updated_at = NOW()
          WHERE execution_id = ?
        `, [currentPrice, unrealizedPnlUsdt, profitPercent, executionId]);
      }

      // 3. 检查止损 (使用更新后的止损价)
      const stopLossPrice = parseFloat(position.stop_loss_price);
      if (stopLossPrice && currentPrice <= stopLossPrice) {
        // 根据止损类型确定退出类型
        const exitType = position.stop_loss_type === 'TRAILING' ? 'TRAILING_STOP' : 'STOP_LOSS';
        console.log(`   🛑 触发${exitType}: $${currentPrice} <= $${stopLossPrice}`);
        await this.executeExit(executionId, exitType, `Price dropped to $${currentPrice}`);
        return;
      }

      // 4. 检查阶梯止盈 (Partial Take Profit)
      await this.checkPartialTakeProfit(executionId, position, currentPrice, profitPercent);

      // 5. 检查全仓止盈 (从 position 读取,而不是 signal)
      // ⚠️ 如果启用了 Partial TP，跳过全仓止盈检查（避免冲突）
      const partialTpEnabled = position.partial_tp_enabled === 1;
      let takeProfitPrice = parseFloat(position.take_profit_price);

      // 🔧 修复: 如果 take_profit_price 异常（低于入场价），从 alpha_signals 读取正确值
      if (takeProfitPrice && takeProfitPrice < entryPrice) {
        console.log(`   ⚠️ take_profit_price 异常 ($${takeProfitPrice} < entry $${entryPrice})，从 alpha_signals 读取正确值`);
        const signalData = await DatabaseService.query(
          `SELECT take_profit_1 FROM alpha_signals WHERE signal_id = ? LIMIT 1`,
          [position.signal_id]
        );
        if (signalData.length > 0 && signalData[0].take_profit_1) {
          takeProfitPrice = parseFloat(signalData[0].take_profit_1);
          console.log(`   ✅ 使用 alpha_signals 止盈价: $${takeProfitPrice}`);
          // 同时修复 positions 表的错误数据
          await DatabaseService.query(
            `UPDATE auto_trade_positions SET take_profit_price = ? WHERE execution_id = ?`,
            [takeProfitPrice, executionId]
          );
        }
      }

      if (!partialTpEnabled && takeProfitPrice && currentPrice >= takeProfitPrice) {
        console.log(`   🎯 触发全仓止盈: $${currentPrice} >= $${takeProfitPrice}`);
        await this.executeExit(executionId, 'TAKE_PROFIT', `Price reached $${currentPrice}`);
        return;
      } else if (partialTpEnabled && takeProfitPrice && currentPrice >= takeProfitPrice) {
        console.log(`   ℹ️ 已达全仓止盈价 $${takeProfitPrice}，但启用了阶梯止盈，跳过全仓卖出`);
      }

    } catch (error) {
      console.error(`   ❌ 检查失败: ${error.message}`);
    }
  }

  /**
   * 检查阶梯止盈
   * @param {string} executionId - 执行ID
   * @param {Object} position - 持仓信息
   * @param {number} currentPrice - 当前价格
   * @param {number} profitPercent - 当前盈利百分比
   */
  async checkPartialTakeProfit(executionId, position, currentPrice, profitPercent) {
    try {
      // 1. 获取用户配置
      // 🔧 修复: 使用 follow_strategy 精确匹配策略配置
      let configResult;

      if (position.follow_strategy && position.follow_strategy !== 'UNKNOWN') {
        configResult = await DatabaseService.query(`
          SELECT partial_tp_enabled, partial_tp_rules
          FROM auto_trade_config
          WHERE user_id = ? AND follow_strategy = ?
          LIMIT 1
        `, [position.user_id, position.follow_strategy]);
      }

      // 回退：如果没有找到，使用任意活跃配置
      if (!configResult || configResult.length === 0) {
        configResult = await DatabaseService.query(`
          SELECT partial_tp_enabled, partial_tp_rules
          FROM auto_trade_config
          WHERE user_id = ? AND is_active = 1
          LIMIT 1
        `, [position.user_id]);
      }

      if (configResult.length === 0 || !configResult[0].partial_tp_enabled) {
        return; // 未启用阶梯止盈
      }

      const config = configResult[0];
      let rules = [];

      try {
        rules = typeof config.partial_tp_rules === 'string'
          ? JSON.parse(config.partial_tp_rules)
          : config.partial_tp_rules;
      } catch (e) {
        console.log(`   ⚠️ [PartialTP] 解析规则失败: ${e.message}`);
        return;
      }

      if (!rules || !Array.isArray(rules) || rules.length === 0) {
        return; // 没有配置规则
      }

      // 2. 获取已触发的规则索引
      let triggeredRules = [];
      try {
        triggeredRules = position.partial_tp_triggered
          ? (typeof position.partial_tp_triggered === 'string'
            ? JSON.parse(position.partial_tp_triggered)
            : position.partial_tp_triggered)
          : [];
      } catch (e) {
        triggeredRules = [];
      }

      // 3. 检查每个规则是否触发
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];

        // 跳过已触发的规则
        if (triggeredRules.includes(i)) {
          continue;
        }

        // 检查是否达到触发条件
        if (profitPercent >= rule.profitPct) {
          console.log(`   🎯 [PartialTP] 触发规则 #${i}: 盈利 ${profitPercent.toFixed(2)}% >= ${rule.profitPct}%,卖出 ${rule.sellPct}%`);

          // 执行部分卖出
          const sellResult = await this.executePartialSell(
            executionId,
            position,
            currentPrice,
            profitPercent,
            rule,
            i
          );

          if (sellResult.success) {
            // 更新已触发规则
            triggeredRules.push(i);

            // 更新数据库
            const newPartialSoldPct = (parseFloat(position.partial_sold_pct) || 0) + rule.sellPct;
            // 🔧 修复：计算卖出的代币数量并更新 current_token_balance
            const soldTokens = sellResult.soldTokens || (parseFloat(position.entry_amount_token) * rule.sellPct / 100);
            const newTokenBalance = parseFloat(position.current_token_balance) - soldTokens;

            await DatabaseService.query(`
              UPDATE auto_trade_positions
              SET partial_tp_triggered = ?,
                  partial_sold_pct = ?,
                  partial_sold_usdt = partial_sold_usdt + ?,
                  current_token_balance = ?
              WHERE execution_id = ?
            `, [
              JSON.stringify(triggeredRules),
              newPartialSoldPct,
              sellResult.soldUsdt || 0,
              newTokenBalance,
              executionId
            ]);

            // 🆕 记录部分止盈历史
            try {
              await DatabaseService.query(`
                INSERT INTO auto_trade_partial_exits
                (execution_id, user_id, token_symbol, chain, rule_index, sell_percent,
                 sell_amount_token, sell_amount_usdt, trigger_price, profit_percent, tx_hash, gas_fee)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                executionId,
                position.user_id,
                position.token_symbol,
                position.chain,
                i,
                rule.sellPct,
                soldTokens,
                sellResult.soldUsdt || 0,
                currentPrice,
                profitPercent,
                sellResult.txHash || null,
                sellResult.gasFee || 0
              ]);
              console.log(`   📝 [PartialTP] 历史记录已保存`);
            } catch (historyError) {
              console.error(`   ⚠️ [PartialTP] 保存历史记录失败: ${historyError.message}`);
            }

            // 更新内存中的 position
            position.partial_tp_triggered = triggeredRules;
            position.partial_sold_pct = newPartialSoldPct;
            position.current_token_balance = newTokenBalance;
            console.log(`   📦 [PartialTP] 更新余额: ${newTokenBalance.toFixed(8)} ${position.token_symbol}`);
          }
        }
      }

    } catch (error) {
      console.error(`   ❌ [PartialTP] 检查失败: ${error.message}`);
    }
  }

  /**
   * 执行部分卖出
   * @param {string} executionId - 执行ID
   * @param {Object} position - 持仓信息
   * @param {number} currentPrice - 当前价格
   * @param {number} profitPercent - 当前盈利百分比
   * @param {Object} rule - 触发的规则 {profitPct, sellPct}
   * @param {number} ruleIndex - 规则索引
   */
  async executePartialSell(executionId, position, currentPrice, profitPercent, rule, ruleIndex) {
    try {
      // 1. 计算卖出数量
      const totalTokens = parseFloat(position.entry_amount_token);
      const alreadySoldPct = parseFloat(position.partial_sold_pct) || 0;
      const remainingPct = 100 - alreadySoldPct;

      // 确保不超过剩余仓位
      const actualSellPct = Math.min(rule.sellPct, remainingPct);
      const sellAmount = totalTokens * (actualSellPct / 100);

      if (sellAmount <= 0) {
        console.log(`   ⚠️ [PartialTP] 可卖出数量为 0`);
        return { success: false };
      }

      console.log(`   📤 [PartialTP] 卖出 ${actualSellPct}% = ${sellAmount.toFixed(8)} ${position.token_symbol}`);

      // 2. 记录到 partial_sells 表 (状态 PENDING)
      // 🔧 修复: 使用 position.id (int) 而不是 position.position_id (string)
      const insertResult = await DatabaseService.query(`
        INSERT INTO auto_trade_partial_sells
        (execution_id, position_id, user_id, rule_index, profit_pct_trigger, sell_pct,
         trigger_price, sell_amount_token, actual_profit_pct, tx_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `, [
        executionId,
        position.id,  // 🔧 使用自增 ID
        position.user_id,
        ruleIndex,
        rule.profitPct,
        actualSellPct,
        currentPrice,
        sellAmount,
        profitPercent
      ]);

      const partialSellId = insertResult.insertId;

      // 3. 构建卖出交易
      const sellTxData = await DEXAggregatorService.buildSwapTx({
        chain: position.chain,
        tokenIn: position.token_symbol,
        tokenInAddress: position.contract_address,
        tokenOut: position.chain === 'BSC' ? 'USDT' : 'USDC',
        amountIn: sellAmount.toString(),
        slippage: 3.0,
        userAddress: position.wallet_address
      });

      // 4. 如果需要授权，先执行 approve
      if (sellTxData.needsApproval && sellTxData.approvalTx) {
        console.log(`   🔑 [PartialTP] 执行 approve...`);
        await this.submitExitTransaction(position, {
          routerAddress: sellTxData.approvalTx.to,
          txData: sellTxData.approvalTx.data,
          value: sellTxData.approvalTx.value,
          gasLimit: '0x15f90',
          gasPrice: sellTxData.gasPrice
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // 5. 提交卖出交易
      const txHash = await this.submitExitTransaction(position, sellTxData);

      console.log(`   ✅ [PartialTP] 交易已提交: ${txHash.slice(0, 10)}...`);

      // 6. 更新 partial_sells 记录
      await DatabaseService.query(`
        UPDATE auto_trade_partial_sells
        SET tx_hash = ?, tx_status = 'SUCCESS', confirmed_at = NOW()
        WHERE id = ?
      `, [txHash, partialSellId]);

      // 7. 估算卖出获得的 USDT
      const soldUsdt = sellAmount * currentPrice;

      return {
        success: true,
        txHash,
        soldAmount: sellAmount,
        soldUsdt
      };

    } catch (error) {
      console.error(`   ❌ [PartialTP] 卖出失败: ${error.message}`);

      // 记录失败
      await DatabaseService.query(`
        UPDATE auto_trade_partial_sells
        SET tx_status = 'FAILED'
        WHERE execution_id = ? AND rule_index = ? AND tx_status = 'PENDING'
      `, [executionId, ruleIndex]);

      return { success: false, error: error.message };
    }
  }

  /**
   * 执行出场
   */
  async executeExit(executionId, exitType, reason) {
    try {
      console.log(`\n🚪 执行出场: ${executionId} (${exitType})`);

      // 1. 停止监控
      if (this.activeMonitors.has(executionId)) {
        const monitor = this.activeMonitors.get(executionId);
        clearInterval(monitor.interval);
        this.activeMonitors.delete(executionId);
      }

      // 2. 查询持仓 (🔧 修复：使用 getPositionWithStopLoss 获取 positions 表数据)
      const position = await this.getPositionWithStopLoss(executionId);

      if (!position) {
        throw new Error('Position not found');
      }

      // 3. 更新状态为 EXITING
      await DatabaseService.query(`
        UPDATE auto_trade_executions
        SET status = 'EXITING'
        WHERE execution_id = ?
      `, [executionId]);

      // 4. 计算剩余持仓数量（🔧 修复：直接使用 current_token_balance）
      let remainingTokens = parseFloat(position.current_token_balance);
      const soldPct = parseFloat(position.partial_sold_pct) || 0;

      // 🔧 修复：如果 current_token_balance 是 NULL 或 NaN，使用 entry_amount_token
      if (!remainingTokens || isNaN(remainingTokens)) {
        remainingTokens = parseFloat(position.entry_amount_token);
        console.log(`   ⚠️ current_token_balance 为空，使用 entry_amount_token: ${remainingTokens}`);
        // 同时修复数据库
        await DatabaseService.query(
          `UPDATE auto_trade_positions SET current_token_balance = entry_amount_token WHERE execution_id = ?`,
          [executionId]
        );
      }

      if (remainingTokens <= 0) {
        console.log(`   ⚠️ 无剩余持仓可卖出 (已卖出 ${soldPct}%)`);
        // 直接标记为完成
        await this.markPositionCompleted(executionId, position, exitType, null, 0, 0);
        return;
      }

      const totalTokens = parseFloat(position.entry_amount_token);
      console.log(`   💰 持仓数量: 初始 ${totalTokens.toFixed(8)}, 当前 ${remainingTokens.toFixed(8)} ${position.token_symbol}`);
      if (soldPct > 0) {
        console.log(`   📊 已部分卖出: ${soldPct.toFixed(2)}%`);
      }

      // 5. 构建卖出交易（🔧 修复：使用 position 表里存的合约地址 + 剩余数量）
      const exitTxData = await DEXAggregatorService.buildSwapTx({
        chain: position.chain,
        tokenIn: position.token_symbol,
        tokenInAddress: position.contract_address, // 🔧 使用持仓时的实际合约地址
        tokenOut: position.chain === 'BSC' ? 'USDT' : 'USDC',
        amountIn: remainingTokens.toString(), // ✅ 使用剩余数量
        slippage: 5.0, // 出场时允许更高滑点 (紧急情况)
        userAddress: position.wallet_address
      });

      console.log(`   🚪 最终卖出数量: ${remainingTokens.toFixed(8)} ${position.token_symbol}`);
      console.log(`   预期获得: ${exitTxData.amountOutMin} USDT/USDC`);
      console.log(`   🔧 [DEBUG] needsApproval: ${exitTxData.needsApproval}, approvalTx: ${exitTxData.approvalTx ? 'EXISTS' : 'NULL'}`);

      // 4.5. 如果需要授权,先执行approve
      if (exitTxData.needsApproval && exitTxData.approvalTx) {
        console.log(`   🔑 需要授权,先执行 approve...`);
        const approveTxHash = await this.submitExitTransaction(position, {
          routerAddress: exitTxData.approvalTx.to,
          txData: exitTxData.approvalTx.data,
          value: exitTxData.approvalTx.value,
          gasLimit: '0x15f90', // 90000 gas for approve
          gasPrice: exitTxData.gasPrice
        });
        console.log(`   ✅ Approve 交易已提交: ${approveTxHash.slice(0, 10)}...`);

        // 等待5秒让approve交易确认
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // 5. 提交交易 (通过 Privy) - 即使Privy抛出错误也要检查是否有hash
      let exitTxHash = null;
      let submitError = null;

      try {
        exitTxHash = await this.submitExitTransaction(position, exitTxData);
      } catch (error) {
        submitError = error;
        // 检查错误消息中是否包含transaction hash (Privy可能在抛出错误的同时返回了hash)
        const hashMatch = error.message.match(/0x[a-fA-F0-9]{64}/);
        if (hashMatch) {
          exitTxHash = hashMatch[0];
          console.log(`   ⚠️ Privy报错但找到交易hash: ${exitTxHash.slice(0, 10)}...`);
        }
      }

      // 如果没有交易hash,则真的失败了
      if (!exitTxHash) {
        throw new Error(submitError ? submitError.message : '未能获取交易hash');
      }

      // 6. 更新数据库 - 先标记为EXITING,等TransactionMonitor确认后再更新真实价格
      // 🔧 注意: exit_price 会在 TransactionMonitor 确认交易后从实际结果计算
      await DatabaseService.query(`
        UPDATE auto_trade_executions
        SET status = 'EXITING',
            exit_tx_hash = ?,
            exit_type = ?,
            exit_executed_at = NOW()
        WHERE execution_id = ?
      `, [exitTxHash, exitType, executionId]);

      // 8. 启动TransactionMonitor监控交易确认状态 (🔧 传入 'EXIT' 类型)
      const TransactionMonitor = require('./TransactionMonitor');
      console.log(`   🔍 启动TransactionMonitor监控: ${exitTxHash.slice(0, 10)}...`);

      TransactionMonitor.monitorTransaction(executionId, exitTxHash, position.chain, 'EXIT')
        .then(async (result) => {
          if (result.success) {
            console.log(`   ✅ 交易确认成功: ${executionId}`);

            // 更新为EXITED状态
            await DatabaseService.query(`
              UPDATE auto_trade_executions
              SET status = 'EXITED'
              WHERE execution_id = ?
            `, [executionId]);

            // 计算最终盈亏
            await this.calculateProfitLoss(executionId);

            // 🔧 同步出场数据到 positions 表
            const DataSyncService = require('./DataSyncService');
            await DataSyncService.onTradeExit(executionId);
          } else {
            console.log(`   ⚠️ 交易确认失败: ${executionId}, 原因: ${result.reason}`);
            // 🔧 修复: 不直接回滚到 HOLDING，而是保持 EXITING 状态
            // 因为 exit_tx_hash 已经存在，需要等待链上确认或手动处理
            // 只有当交易真的 reverted 时才标记为失败
            if (result.reason === 'reverted') {
              console.log(`   ❌ 交易被回滚，标记为 FAILED`);
              await DatabaseService.query(`
                UPDATE auto_trade_executions
                SET status = 'FAILED', error_message = 'Transaction reverted on-chain'
                WHERE execution_id = ?
              `, [executionId]);
            } else {
              // 超时或其他原因，保持 EXITING 状态，稍后重试确认
              console.log(`   🔄 保持 EXITING 状态，60秒后重试确认`);
              setTimeout(async () => {
                try {
                  const retryResult = await TransactionMonitor.monitorTransaction(executionId, exitTxHash, position.chain, 'EXIT');
                  if (retryResult.success) {
                    await DatabaseService.query(`UPDATE auto_trade_executions SET status = 'EXITED' WHERE execution_id = ?`, [executionId]);
                    await this.calculateProfitLoss(executionId);
                    const DataSyncService = require('./DataSyncService');
                    await DataSyncService.onTradeExit(executionId);
                  }
                } catch (e) {
                  console.error(`   ⚠️ 重试确认失败: ${e.message}`);
                }
              }, 60000);
            }
          }
        })
        .catch(async (error) => {
          console.error(`   ❌ TransactionMonitor错误: ${error.message}`);
          // 🔧 修复: 不回滚状态，保持 EXITING，因为 exit_tx_hash 已经存在
          // 交易可能已经在链上成功，只是确认过程出错
          console.log(`   ⚠️ 保持 EXITING 状态，需要手动检查链上交易状态`);
          await DatabaseService.query(`
            UPDATE auto_trade_executions
            SET error_message = ?
            WHERE execution_id = ? AND status = 'EXITING'
          `, [`TransactionMonitor error: ${error.message}`, executionId]);
        });

      console.log(`   ✅ 出场交易已提交: ${exitTxHash.slice(0, 10)}...`);

      return { success: true, txHash: exitTxHash };

    } catch (error) {
      console.error(`   ❌ 出场失败: ${error.message}`);

      await DatabaseService.query(`
        UPDATE auto_trade_executions
        SET status = 'HOLDING', error_message = ?
        WHERE execution_id = ?
      `, [error.message, executionId]);

      // 重新启动监控
      setTimeout(() => {
        this.startMonitoring(executionId);
      }, 30000); // 30秒后重试

      return { success: false, error: error.message };
    }
  }


  /**
   * 获取当前价格
   * 🔧 支持 CEX (BinanceAlphaService) 和 DEX (FourMemeService/DexScreener) 两种价格源
   * 🔧 修复: 使用 is_alpha_token 字段判断价格源
   *   - is_alpha_token = 1 → 优先使用 Binance Alpha API
   *   - is_alpha_token = 0 → 使用 DEX 价格 (FourMeme/DexScreener)
   */
  async getCurrentPrice(tokenSymbol, chain, position = null) {
    try {
      // 🔧 使用 is_alpha_token 判断价格源
      // 🔧 修复：NULL/undefined 也当作可能是 Alpha 代币（优先尝试 Binance Alpha API）
      const isAlphaToken = position && (
        position.is_alpha_token === 1 ||
        position.is_alpha_token === null ||
        position.is_alpha_token === undefined
      );
      const isMemeToken = position && position.is_alpha_token === 0;

      // 🔧 Alpha 代币：优先使用 Binance Alpha API
      if (isAlphaToken) {
        const BinanceAlphaService = require('../BinanceAlphaService');
        const price = await BinanceAlphaService.getTokenRealtimePrice(tokenSymbol, chain);

        if (price && price > 0) {
          console.log(`   ✅ [Alpha] Binance Alpha API 获取价格成功: $${price.toFixed(8)}`);
          return price;
        }

        // Alpha 代币如果 Binance 获取不到，才尝试 DEX 作为备用
        console.log(`   ⚠️ [Alpha] Binance Alpha API 无法获取价格，尝试 DEX 备用...`);
      }

      // 🔧 MEME 代币或 Alpha 代币备用：使用 DEX 价格
      if (position && position.contract_address) {
        // 尝试 FourMemeService
        try {
          const FourMemeService = require('./FourMemeService');
          const tokenInfo = await FourMemeService.getTokenInfo(position.contract_address);

          if (tokenInfo && tokenInfo.lastPriceUSD && tokenInfo.lastPriceUSD > 0) {
            console.log(`   ✅ [DEX] FourMeme 获取价格成功: $${tokenInfo.lastPriceUSD.toFixed(8)}`);
            return tokenInfo.lastPriceUSD;
          }
        } catch (dexError) {
          console.log(`   ⚠️ [DEX] FourMeme 价格获取失败: ${dexError.message}`);
        }

        // 尝试 DexScreener 作为备用
        try {
          const DexScreenerService = require('../DexScreenerService');
          const poolInfo = await DexScreenerService.getPoolInfo(tokenSymbol, position.contract_address);
          if (poolInfo && poolInfo.priceUsd && poolInfo.priceUsd > 0) {
            console.log(`   ✅ [DEX] DexScreener 获取价格成功: $${poolInfo.priceUsd.toFixed(8)}`);
            return poolInfo.priceUsd;
          }
        } catch (dexError) {
          console.log(`   ⚠️ [DEX] DexScreener 价格获取失败: ${dexError.message}`);
        }

        // 🚫 MEME 代币不回退到 BinanceAlphaService，避免同名冲突
        if (isMemeToken) {
          console.log(`   ⚠️ [MEME] 无法获取 ${tokenSymbol} 的链上价格 (不使用 Alpha API 避免同名冲突)`);
          return null;
        }
      }

      // 🔧 未知类型（历史数据）或无合约地址：使用 BinanceAlphaService
      const BinanceAlphaService = require('../BinanceAlphaService');
      const price = await BinanceAlphaService.getTokenRealtimePrice(tokenSymbol, chain);

      if (price && price > 0) {
        return price;
      }

      console.log(`   ⚠️ 未找到 ${tokenSymbol} 的实时价格`);
      return null;

    } catch (error) {
      console.error(`   ❌ 获取价格失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 提交出场交易 (🆕 使用 Privy Session Signer)
   */
  async submitExitTransaction(position, txData) {
    const PrivyService = require('../PrivyService');
    const DatabaseService = require('../databaseService');

    try {
      console.log(`         [Privy] 使用 Session Signer 签名出场交易...`);

      // 🔧 映射 DEXAggregatorService 返回的字段到 Privy 期望的格式
      const chainId = position.chain === 'BSC' ? 56 : 8453; // BSC=56, Base=8453

      // 🔧 获取 Privy User ID (与 BatchExecutor 一致的逻辑)
      const configRecord = await DatabaseService.query(`
        SELECT privy_user_id FROM auto_trade_config
        WHERE user_id = ? OR wallet_address = ?
        LIMIT 1
      `, [position.user_id, position.wallet_address]);

      let privyUserId = null;

      if (configRecord.length > 0 && configRecord[0].privy_user_id) {
        privyUserId = configRecord[0].privy_user_id;
        console.log(`         🔑 Privy User ID (from config): ${privyUserId.slice(0, 20)}...`);
      } else {
        // 备用方案: 从 users 表查询
        console.log(`         ℹ️ 配置表中没有 privy_user_id,尝试从 users 表查询...`);
        const userRecord = await DatabaseService.query(`
          SELECT id FROM users WHERE address = ? OR address = ?
        `, [position.user_id, position.wallet_address]);

        if (userRecord.length === 0) {
          throw new Error(`无法找到 Privy User ID。user_id: ${position.user_id.slice(0, 10)}..., wallet_address: ${position.wallet_address.slice(0, 10)}...`);
        }

        privyUserId = userRecord[0].id;
        console.log(`         🔑 Privy User ID (from users): ${privyUserId.slice(0, 20)}...`);
      }

      // 使用 Privy Session Signer 签名并发送交易
      const result = await PrivyService.signTransaction(privyUserId, {
        to: txData.routerAddress,        // DEXAggregator 返回的是 routerAddress
        data: txData.txData,             // DEXAggregator 返回的是 txData.txData
        value: txData.value || '0x0',
        chainId: chainId,                // 根据链计算 chainId
        gas: txData.gasLimit,            // DEXAggregator 返回的是 gasLimit
        gasPrice: txData.gasPrice
      });

      console.log(`         ✅ 出场交易已通过 Privy 发送: ${result.hash.slice(0, 10)}...`);

      return result.hash;

    } catch (error) {
      console.error(`         ❌ Privy 出场签名失败: ${error.message}`);
      throw new Error(`Privy出场签名失败: ${error.message}`);
    }
  }

  /**
   * 计算盈亏
   */
  async calculateProfitLoss(executionId) {
    try {
      const position = await this.getPosition(executionId);

      const entryAmount = parseFloat(position.entry_amount_usdt);
      const exitAmount = parseFloat(position.exit_amount_usdt);
      const totalFees = parseFloat(position.entry_gas_fee || 0) + parseFloat(position.exit_gas_fee || 0);

      const profitLoss = exitAmount - entryAmount - totalFees;
      const profitPercent = (profitLoss / entryAmount) * 100;

      await DatabaseService.query(`
        UPDATE auto_trade_executions
        SET profit_loss_usdt = ?,
            profit_loss_percent = ?,
            total_fees = ?
        WHERE execution_id = ?
      `, [profitLoss, profitPercent, totalFees, executionId]);

      console.log(`   💰 盈亏: ${profitLoss > 0 ? '+' : ''}$${profitLoss.toFixed(2)} (${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);

      // 同步数据到 history 和 stats 表
      const DataSyncService = require('./DataSyncService');
      await DataSyncService.onTradeExit(executionId);

      // 更新用户统计
      await this.updateUserStats(position.user_id, profitLoss > 0);

    } catch (error) {
      console.error(`   ❌ 盈亏计算失败: ${error.message}`);
    }
  }

  /**
   * 更新用户统计
   */
  async updateUserStats(userId, isWin) {
    try {
      await DatabaseService.query(`
        UPDATE auto_trade_config
        SET total_trades = total_trades + 1,
            win_trades = win_trades + ?,
            total_profit = total_profit + (
              SELECT COALESCE(SUM(profit_loss_usdt), 0)
              FROM auto_trade_executions
              WHERE user_id = ? AND status = 'EXITED'
            )
        WHERE user_id = ?
      `, [isWin ? 1 : 0, userId, userId]);

    } catch (error) {
      console.error(`   ⚠️ 统计更新失败: ${error.message}`);
    }
  }

  /**
   * 查询持仓 (包含止损止盈价格)
   * 🔧 修复: 从 executions 表获取 follow_strategy，精确匹配 config
   */
  async getPositionWithStopLoss(executionId) {
    const result = await DatabaseService.query(`
      SELECT
        p.*,
        e.follow_strategy,
        COALESCE(p.is_alpha_token, e.is_alpha_token) AS is_alpha_token,
        COALESCE(p.signal_source, e.signal_source, s.signal_source) AS signal_source,
        c.wallet_address
      FROM auto_trade_positions p
      LEFT JOIN auto_trade_executions e ON p.execution_id = e.execution_id
      LEFT JOIN alpha_signals s ON p.signal_id = s.signal_id
      LEFT JOIN auto_trade_config c ON p.user_id = c.user_id
        AND (e.follow_strategy IS NULL OR c.follow_strategy = e.follow_strategy)
      WHERE p.execution_id = ?
    `, [executionId]);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * 查询持仓 (旧方法,保留用于兼容)
   * 🔧 修复: 使用 e.follow_strategy 精确匹配 config
   */
  async getPosition(executionId) {
    const result = await DatabaseService.query(`
      SELECT e.*, c.wallet_address
      FROM auto_trade_executions e
      LEFT JOIN auto_trade_config c ON e.user_id = c.user_id
        AND (e.follow_strategy IS NULL OR c.follow_strategy = e.follow_strategy)
      WHERE e.execution_id = ?
    `, [executionId]);

    return result.length > 0 ? result[0] : null;
  }


  /**
   * 手动出场
   */
  async manualExit(executionId, reason = 'User manual exit') {
    console.log(`\n🖐️ 手动出场: ${executionId}`);
    return await this.executeExit(executionId, 'MANUAL', reason);
  }

  /**
   * 停止监控
   */
  stopMonitoring(executionId) {
    if (this.activeMonitors.has(executionId)) {
      const monitor = this.activeMonitors.get(executionId);
      clearInterval(monitor.interval);
      this.activeMonitors.delete(executionId);

      console.log(`   🛑 已停止监控: ${executionId}`);
      return true;
    }

    return false;
  }

  /**
   * 停止所有监控
   */
  stopAll() {
    console.log(`\n🛑 停止所有出场监控 (${this.activeMonitors.size} 个)`);

    this.activeMonitors.forEach((monitor, executionId) => {
      clearInterval(monitor.interval);
      console.log(`   - ${executionId}`);
    });

    this.activeMonitors.clear();
  }

  /**
   * 获取监控状态
   */
  getMonitorStatus() {
    const monitors = [];

    this.activeMonitors.forEach((monitor, executionId) => {
      monitors.push({
        executionId,
        tokenSymbol: monitor.position.token_symbol,
        entryPrice: monitor.position.entry_price,
        stopLoss: monitor.signal.stop_loss_price,
        takeProfit: monitor.signal.take_profit_price,
        startedAt: monitor.startedAt,
        runningTime: Date.now() - monitor.startedAt.getTime()
      });
    });

    return {
      activeCount: monitors.length,
      monitors
    };
  }
}

module.exports = new ExitMonitor();

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
const FeeService = require('../FeeService');
const { ethers } = require('ethers');
const BaseAgent = require('./core/BaseAgent');
const AgentBus = require('./core/AgentBus');

class ExitMonitor extends BaseAgent {
  constructor() {
    super('Portfolio Agent', 'portfolio');
    AgentBus.register(this);
    this.activeMonitors = new Map(); // executionId -> { interval, position }
    this.checkInterval = 15000; // 每 15 秒检查一次

    this.log('✅ ExitMonitor initialized');
  }

  /**
   * 启动持仓监控
   */
  async startMonitoring(executionId) {
    // 已在监控中
    if (this.activeMonitors.has(executionId)) {
      this.log(`   ⚠️ ${executionId} 已在监控中`);
      return;
    }

    this.log(`\n👁️ 启动出场监控: ${executionId}`);

    try {
      // 1. 查询持仓信息 (包含止损止盈价格)
      const position = await this.getPositionWithStopLoss(executionId);

      if (!position) {
        this.log(`   ❌ 持仓不存在`);
        return;
      }

      this.log(`   代币: ${position.token_symbol}`);
      this.log(`   入场价: $${position.entry_price}`);
      this.log(`   止损点: $${position.stop_loss_price}`);
      this.log(`   止盈点: $${position.take_profit_price}`);

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
          this.error(`   ❌ 检查失败: ${error.message}`);
        }
      }, this.checkInterval);

      // 3. 保存监控状态
      this.activeMonitors.set(executionId, {
        interval,
        position,
        startedAt: new Date()
      });

    } catch (error) {
      this.error(`   ❌ 启动监控失败: ${error.message}`);
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
        this.log(`   🔧 [DEBUG] contract_address: ${position.contract_address}`);
      }

      // 🔧 修复: 根据 signal_source 判断 is_alpha_token（避免同名MEME/Alpha冲突）
      // signal_source 包含 "ALPHA" → is_alpha_token = 1
      // signal_source 包含 "MEME" → is_alpha_token = 0
      const signalSource = position.signal_source || '';
      const shouldBeAlpha = signalSource.toUpperCase().includes('ALPHA');
      const shouldBeMeme = signalSource.toUpperCase().includes('MEME');

      if (shouldBeAlpha && position.is_alpha_token !== 1) {
        this.log(`   ⚠️ is_alpha_token 修正: ${position.is_alpha_token} → 1 (signal_source=${signalSource})`);
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
        this.log(`   ⚠️ is_alpha_token 修正: ${position.is_alpha_token} → 0 (signal_source=${signalSource})`);
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
          this.log(`   ⚠️ is_alpha_token 推断: → 1 (无signal_source，无contract_address)`);
          position.is_alpha_token = 1;
        }
      }

      const currentPrice = await this.getCurrentPrice(position.token_symbol, position.chain, position);

      if (!currentPrice) {
        this.log(`   ⚠️ 无法获取价格: ${position.token_symbol}`);
        return;
      }

      // 2. 计算收益率和盈亏
      const entryPrice = parseFloat(position.entry_price);
      const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      const entryAmountUsdt = parseFloat(position.entry_amount_usdt) || 0;
      const unrealizedPnlUsdt = entryAmountUsdt * (profitPercent / 100);

      this.log(`   [${new Date().toLocaleTimeString()}] ${position.token_symbol}: $${currentPrice.toFixed(6)} (${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);

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
          this.log(`   🔄 [DynamicSL] 止损已更新: $${stopLossUpdate.fields.stop_loss_price.toFixed(6)} (${stopLossUpdate.fields.stop_loss_type})`);
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
        this.log(`   🛑 触发${exitType}: $${currentPrice} <= $${stopLossPrice}`);
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
        this.log(`   ⚠️ take_profit_price 异常 ($${takeProfitPrice} < entry $${entryPrice})，从 alpha_signals 读取正确值`);
        const signalData = await DatabaseService.query(
          `SELECT take_profit_1 FROM alpha_signals WHERE signal_id = ? LIMIT 1`,
          [position.signal_id]
        );
        if (signalData.length > 0 && signalData[0].take_profit_1) {
          takeProfitPrice = parseFloat(signalData[0].take_profit_1);
          this.log(`   ✅ 使用 alpha_signals 止盈价: $${takeProfitPrice}`);
          // 同时修复 positions 表的错误数据
          await DatabaseService.query(
            `UPDATE auto_trade_positions SET take_profit_price = ? WHERE execution_id = ?`,
            [takeProfitPrice, executionId]
          );
        }
      }

      if (!partialTpEnabled && takeProfitPrice && currentPrice >= takeProfitPrice) {
        this.log(`   🎯 触发全仓止盈: $${currentPrice} >= $${takeProfitPrice}`);
        await this.executeExit(executionId, 'TAKE_PROFIT', `Price reached $${currentPrice}`);
        return;
      } else if (partialTpEnabled && takeProfitPrice && currentPrice >= takeProfitPrice) {
        this.log(`   ℹ️ 已达全仓止盈价 $${takeProfitPrice}，但启用了阶梯止盈，跳过全仓卖出`);
      }

    } catch (error) {
      this.error(`   ❌ 检查失败: ${error.message}`);
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
          SELECT partial_tp_enabled, partial_tp_rules, stop_loss_mode
          FROM auto_trade_config
          WHERE user_id = ? AND follow_strategy = ?
          LIMIT 1
        `, [position.user_id, position.follow_strategy]);
      }

      // 回退：如果没有找到，使用任意活跃配置
      if (!configResult || configResult.length === 0) {
        configResult = await DatabaseService.query(`
          SELECT partial_tp_enabled, partial_tp_rules, stop_loss_mode
          FROM auto_trade_config
          WHERE user_id = ? AND is_active = 1
          LIMIT 1
        `, [position.user_id]);
      }

      if (configResult.length === 0 || !configResult[0].partial_tp_enabled) {
        return; // 未启用阶梯止盈
      }

      // 🔧 修复: FIXED 模式不支持阶梯止盈，只有 TRAILING 模式才支持
      const stopLossMode = configResult[0].stop_loss_mode || 'FIXED';
      if (stopLossMode === 'FIXED') {
        return; // FIXED 模式不执行阶梯止盈
      }

      const config = configResult[0];
      let rules = [];

      try {
        rules = typeof config.partial_tp_rules === 'string'
          ? JSON.parse(config.partial_tp_rules)
          : config.partial_tp_rules;
      } catch (e) {
        this.log(`   ⚠️ [PartialTP] 解析规则失败: ${e.message}`);
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
          this.log(`   🎯 [PartialTP] 触发规则 #${i}: 盈利 ${profitPercent.toFixed(2)}% >= ${rule.profitPct}%,卖出 ${rule.sellPct}%`);

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
            // 🔧 修复：处理 current_token_balance 为 NULL 的情况
            const currentBalance = parseFloat(position.current_token_balance) || parseFloat(position.entry_amount_token);
            const newTokenBalance = currentBalance - soldTokens;

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
              this.log(`   📝 [PartialTP] 历史记录已保存`);
            } catch (historyError) {
              this.error(`   ⚠️ [PartialTP] 保存历史记录失败: ${historyError.message}`);
            }

            // 更新内存中的 position
            position.partial_tp_triggered = triggeredRules;
            position.partial_sold_pct = newPartialSoldPct;
            position.current_token_balance = newTokenBalance;
            this.log(`   📦 [PartialTP] 更新余额: ${newTokenBalance.toFixed(8)} ${position.token_symbol}`);
          }
        }
      }

    } catch (error) {
      this.error(`   ❌ [PartialTP] 检查失败: ${error.message}`);
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
        this.log(`   ⚠️ [PartialTP] 可卖出数量为 0`);
        return { success: false };
      }

      this.log(`   📤 [PartialTP] 卖出 ${actualSellPct}% = ${sellAmount.toFixed(8)} ${position.token_symbol}`);

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
      // 🔧 2026-02-06 修复: Solana 卖出输出 SOL，备份: tokenOut: position.chain === 'BSC' ? 'USDT' : 'USDC'
      const sellTxData = await DEXAggregatorService.buildSwapTx({
        chain: position.chain,
        tokenIn: position.token_symbol,
        tokenInAddress: position.contract_address,
        tokenOut: position.chain === 'Solana' ? 'SOL' : (position.chain === 'BSC' ? 'USDT' : 'USDC'),
        amountIn: sellAmount.toString(),
        slippage: 3.0,
        userAddress: position.wallet_address,
        // 🔧 传递 isAlphaToken 用于价格验证优化
        isAlphaToken: position.is_alpha_token === 1
      });

      // 4. 如果需要授权，先执行 approve
      if (sellTxData.needsApproval && sellTxData.approvalTx) {
        this.log(`   🔑 [PartialTP] 执行 approve...`);
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

      this.log(`   ✅ [PartialTP] 交易已提交: ${txHash.slice(0, 10)}...`);

      // 6. 更新 partial_sells 记录 (交易已提交，等待确认)
      await DatabaseService.query(`
        UPDATE auto_trade_partial_sells
        SET tx_hash = ?, tx_status = 'PENDING'
        WHERE id = ?
      `, [txHash, partialSellId]);

      // 🔧 7. 使用 TransactionMonitor 监控交易并获取实际卖出金额
      const TransactionMonitor = require('./TransactionMonitor');
      this.log(`   🔍 [PartialTP] 启动 TransactionMonitor 监控: ${txHash.slice(0, 10)}...`);

      // 构建 exitInfo 用于精确解析交易日志
      const exitInfo = {
        userAddress: position.wallet_address,         // 用户实际钱包地址
        tokenOutAddress: sellTxData.tokenAddress,     // 输出代币地址 (USDT/USDC)
        amountOutMin: sellTxData.amountOutMin         // 预期最小输出金额 (备用)
      };
      this.log(`   🔍 [PartialTP] exitInfo: userAddress=${exitInfo.userAddress?.slice(0, 10)}..., tokenOut=${exitInfo.tokenOutAddress?.slice(0, 10)}..., amountOutMin=${exitInfo.amountOutMin}`);

      // 异步监控交易，在回调中处理手续费收取
      TransactionMonitor.monitorTransaction(executionId, txHash, position.chain, 'PARTIAL_EXIT', exitInfo)
        .then(async (result) => {
          if (result.success) {
            // 获取实际卖出金额
            const actualSoldUsdt = parseFloat(result.exitResult?.amountOut || 0);
            this.log(`   ✅ [PartialTP] 交易确认成功，实际卖出获得: ${actualSoldUsdt} USDT/USDC`);

            // 更新 partial_sells 记录为 SUCCESS
            await DatabaseService.query(`
              UPDATE auto_trade_partial_sells
              SET tx_status = 'SUCCESS', confirmed_at = NOW(), sell_amount_usdt = ?
              WHERE id = ?
            `, [actualSoldUsdt, partialSellId]);

            // 💰 基于实际卖出金额收取手续费
            if (actualSoldUsdt > 0) {
              try {
                // 获取 Privy User ID
                const configRecord = await DatabaseService.query(
                  `SELECT privy_user_id FROM auto_trade_config WHERE user_id = ? OR wallet_address = ? LIMIT 1`,
                  [position.user_id, position.wallet_address]
                );
                let privyUserId = configRecord[0]?.privy_user_id;
                if (!privyUserId) {
                  const userRecord = await DatabaseService.query(
                    `SELECT id FROM users WHERE address = ? OR address = ? LIMIT 1`,
                    [position.user_id, position.wallet_address]
                  );
                  privyUserId = userRecord[0]?.id;
                }

                if (privyUserId) {
                  const feeResult = await FeeService.collectFee({
                    userId: position.user_id,
                    privyUserId: privyUserId,
                    walletAddress: position.wallet_address,
                    chain: position.chain,
                    tradeAmountUsd: actualSoldUsdt,
                    tradeType: 'SELL',
                    executionId: executionId
                  });

                  if (feeResult.success && feeResult.txHash) {
                    this.log(`   💰 [PartialTP] 手续费已收取: ${feeResult.feeAmount?.toFixed(4)} ${feeResult.feeToken}`);
                  } else if (feeResult.skipped) {
                    this.log(`   ⏭️ [PartialTP] 手续费跳过: ${feeResult.reason}`);
                  } else {
                    this.log(`   ⚠️ [PartialTP] 手续费收取失败: ${feeResult.error}`);
                  }
                } else {
                  this.log(`   ⚠️ [PartialTP] 无法获取 Privy User ID，跳过手续费收取`);
                }
              } catch (feeError) {
                this.error(`   ⚠️ [PartialTP] 收取手续费异常: ${feeError.message}`);
              }
            } else {
              this.log(`   ⚠️ [PartialTP] 实际卖出金额为 0，跳过手续费收取`);
            }
          } else {
            this.log(`   ⚠️ [PartialTP] 交易确认失败: ${result.reason}`);
            // 更新 partial_sells 记录为 FAILED
            await DatabaseService.query(`
              UPDATE auto_trade_partial_sells
              SET tx_status = 'FAILED'
              WHERE id = ?
            `, [partialSellId]);
          }
        })
        .catch(async (error) => {
          this.error(`   ❌ [PartialTP] TransactionMonitor 错误: ${error.message}`);
          // 错误时保持 PENDING 状态，等待后续确认或手动处理
          this.log(`   ⚠️ [PartialTP] 保持 PENDING 状态，需要检查链上交易状态`);
        });

      // 🔧 返回交易提交成功（实际金额将在回调中更新）
      return {
        success: true,
        txHash,
        soldAmount: sellAmount,
        soldUsdt: sellAmount * currentPrice  // 返回估算值，实际值在回调中处理
      };

    } catch (error) {
      this.error(`   ❌ [PartialTP] 卖出失败: ${error.message}`);

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
      this.log(`\n🚪 执行出场: ${executionId} (${exitType})`);
      this.publish('portfolio:exit_triggered', { executionId, exitType, reason });

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
        this.log(`   ⚠️ current_token_balance 为空，使用 entry_amount_token: ${remainingTokens}`);
        // 同时修复数据库
        await DatabaseService.query(
          `UPDATE auto_trade_positions SET current_token_balance = entry_amount_token WHERE execution_id = ?`,
          [executionId]
        );
      }

      if (remainingTokens <= 0) {
        this.log(`   ⚠️ 无剩余持仓可卖出 (已卖出 ${soldPct}%)`);
        // 直接标记为完成
        await this.markPositionCompleted(executionId, position, exitType, null, 0, 0);
        return;
      }

      const totalTokens = parseFloat(position.entry_amount_token);
      this.log(`   💰 持仓数量: 初始 ${totalTokens.toFixed(8)}, 当前 ${remainingTokens.toFixed(8)} ${position.token_symbol}`);
      if (soldPct > 0) {
        this.log(`   📊 已部分卖出: ${soldPct.toFixed(2)}%`);
      }

      // 5. 构建卖出交易（🔧 修复：使用 position 表里存的合约地址 + 剩余数量）
      // 🔧 2026-02-06 修复: Solana 卖出输出 SOL，备份: tokenOut: position.chain === 'BSC' ? 'USDT' : 'USDC'
      const exitTxData = await DEXAggregatorService.buildSwapTx({
        chain: position.chain,
        tokenIn: position.token_symbol,
        tokenInAddress: position.contract_address, // 🔧 使用持仓时的实际合约地址
        tokenOut: position.chain === 'Solana' ? 'SOL' : (position.chain === 'BSC' ? 'USDT' : 'USDC'),
        amountIn: remainingTokens.toString(), // ✅ 使用剩余数量
        slippage: 5.0, // 出场时允许更高滑点 (紧急情况)
        userAddress: position.wallet_address,
        // 🔧 传递 isAlphaToken 用于价格验证优化
        isAlphaToken: position.is_alpha_token === 1
      });

      this.log(`   🚪 最终卖出数量: ${remainingTokens.toFixed(8)} ${position.token_symbol}`);
      this.log(`   预期获得: ${exitTxData.amountOutMin} USDT/USDC`);
      this.log(`   🔧 [DEBUG] needsApproval: ${exitTxData.needsApproval}, approvalTx: ${exitTxData.approvalTx ? 'EXISTS' : 'NULL'}`);

      // 4.5. 如果需要授权,先执行approve
      if (exitTxData.needsApproval && exitTxData.approvalTx) {
        this.log(`   🔑 需要授权,先执行 approve...`);
        const approveTxHash = await this.submitExitTransaction(position, {
          routerAddress: exitTxData.approvalTx.to,
          txData: exitTxData.approvalTx.data,
          value: exitTxData.approvalTx.value,
          gasLimit: '0x15f90', // 90000 gas for approve
          gasPrice: exitTxData.gasPrice
        });
        this.log(`   ✅ Approve 交易已提交: ${approveTxHash.slice(0, 10)}...`);

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
          this.log(`   ⚠️ Privy报错但找到交易hash: ${exitTxHash.slice(0, 10)}...`);
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

      // 8. 启动TransactionMonitor监控交易确认状态 (🔧 传入 'EXIT' 类型 + exitInfo)
      const TransactionMonitor = require('./TransactionMonitor');
      this.log(`   🔍 启动TransactionMonitor监控: ${exitTxHash.slice(0, 10)}...`);

      // 🔧 传递 exitInfo 用于精确解析交易日志
      const exitInfo = {
        userAddress: position.wallet_address,           // 用户实际钱包地址
        tokenOutAddress: exitTxData.tokenAddress,       // 输出代币地址 (USDT/USDC)
        amountOutMin: exitTxData.amountOutMin           // 预期最小输出金额 (备用)
      };
      this.log(`   🔍 [DEBUG] exitInfo: userAddress=${exitInfo.userAddress?.slice(0, 10)}..., tokenOut=${exitInfo.tokenOutAddress?.slice(0, 10)}..., amountOutMin=${exitInfo.amountOutMin}`);

      TransactionMonitor.monitorTransaction(executionId, exitTxHash, position.chain, 'EXIT', exitInfo)
        .then(async (result) => {
          if (result.success) {
            this.log(`   ✅ 交易确认成功: ${executionId}`);

            // 更新为EXITED状态
            await DatabaseService.query(`
              UPDATE auto_trade_executions
              SET status = 'EXITED'
              WHERE execution_id = ?
            `, [executionId]);

            // 计算最终盈亏
            await this.calculateProfitLoss(executionId);

            // 💰 收取卖出手续费 (在 DEX swap 确认后)
            try {
              // 查询实际卖出获得的 USDT/USDC 金额
              const exitData = await DatabaseService.query(
                `SELECT exit_amount_usdt FROM auto_trade_executions WHERE execution_id = ?`,
                [executionId]
              );
              const exitAmountUsd = parseFloat(exitData[0]?.exit_amount_usdt || 0);
              this.log(`   💰 [FEE] 卖出金额查询: exit_amount_usdt = ${exitData[0]?.exit_amount_usdt}, 解析后 = ${exitAmountUsd}`);

              if (exitAmountUsd > 0) {
                // 获取 Privy User ID
                const configRecord = await DatabaseService.query(
                  `SELECT privy_user_id FROM auto_trade_config WHERE user_id = ? OR wallet_address = ? LIMIT 1`,
                  [position.user_id, position.wallet_address]
                );
                let privyUserId = configRecord[0]?.privy_user_id;
                if (!privyUserId) {
                  const userRecord = await DatabaseService.query(
                    `SELECT id FROM users WHERE address = ? OR address = ? LIMIT 1`,
                    [position.user_id, position.wallet_address]
                  );
                  privyUserId = userRecord[0]?.id;
                }

                if (privyUserId) {
                  const feeResult = await FeeService.collectFee({
                    userId: position.user_id,
                    privyUserId: privyUserId,
                    walletAddress: position.wallet_address,
                    chain: position.chain,
                    tradeAmountUsd: exitAmountUsd,
                    tradeType: 'SELL',
                    executionId: executionId
                  });

                  if (feeResult.success && feeResult.txHash) {
                    this.log(`   💰 卖出手续费已收取: ${feeResult.feeAmount?.toFixed(4)} ${feeResult.feeToken}`);
                  } else if (feeResult.skipped) {
                    this.log(`   ⏭️ 卖出手续费跳过: ${feeResult.reason}`);
                  } else {
                    this.log(`   ⚠️ 卖出手续费收取失败: ${feeResult.error}`);
                  }
                } else {
                  this.log(`   ⚠️ [FEE] 无法获取 Privy User ID，跳过卖出手续费`);
                }
              } else {
                this.log(`   ⚠️ [FEE] 卖出金额为 0，跳过手续费收取`);
              }
            } catch (feeError) {
              this.error(`   ⚠️ 收取卖出手续费异常: ${feeError.message}`);
            }

            // 🔧 同步出场数据到 positions 表
            const DataSyncService = require('./DataSyncService');
            await DataSyncService.onTradeExit(executionId);
          } else {
            this.log(`   ⚠️ 交易确认失败: ${executionId}, 原因: ${result.reason}`);
            // 🔧 修复: 不直接回滚到 HOLDING，而是保持 EXITING 状态
            // 因为 exit_tx_hash 已经存在，需要等待链上确认或手动处理
            // 只有当交易真的 reverted 时才标记为失败
            if (result.reason === 'reverted') {
              this.log(`   ❌ 交易被回滚，标记为 FAILED`);
              await DatabaseService.query(`
                UPDATE auto_trade_executions
                SET status = 'FAILED', error_message = 'Transaction reverted on-chain'
                WHERE execution_id = ?
              `, [executionId]);
            } else {
              // 超时或其他原因，保持 EXITING 状态，稍后重试确认
              this.log(`   🔄 保持 EXITING 状态，60秒后重试确认`);
              setTimeout(async () => {
                try {
                  // 🔧 重试时也传递 exitInfo
                  const retryResult = await TransactionMonitor.monitorTransaction(executionId, exitTxHash, position.chain, 'EXIT', exitInfo);
                  if (retryResult.success) {
                    await DatabaseService.query(`UPDATE auto_trade_executions SET status = 'EXITED' WHERE execution_id = ?`, [executionId]);
                    await this.calculateProfitLoss(executionId);
                    const DataSyncService = require('./DataSyncService');
                    await DataSyncService.onTradeExit(executionId);
                  }
                } catch (e) {
                  this.error(`   ⚠️ 重试确认失败: ${e.message}`);
                }
              }, 60000);
            }
          }
        })
        .catch(async (error) => {
          this.error(`   ❌ TransactionMonitor错误: ${error.message}`);
          // 🔧 修复: 不回滚状态，保持 EXITING，因为 exit_tx_hash 已经存在
          // 交易可能已经在链上成功，只是确认过程出错
          this.log(`   ⚠️ 保持 EXITING 状态，需要手动检查链上交易状态`);
          await DatabaseService.query(`
            UPDATE auto_trade_executions
            SET error_message = ?
            WHERE execution_id = ? AND status = 'EXITING'
          `, [`TransactionMonitor error: ${error.message}`, executionId]);
        });

      this.log(`   ✅ 出场交易已提交: ${exitTxHash.slice(0, 10)}...`);

      return { success: true, txHash: exitTxHash };

    } catch (error) {
      this.error(`   ❌ 出场失败: ${error.message}`);

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
   * 🔧 2026-02-06 修复: 新增 Solana 链价格查询 (DexScreener + Jupiter)
   * 🔧 备份: 原始代码无 Solana 分支, Solana 代币只能碰运气走到 DexScreener 备用
   */
  async getCurrentPrice(tokenSymbol, chain, position = null) {
    try {
      // ===============================================
      // 🟣 2026-02-06 新增: Solana 链专用价格查询
      // ===============================================
      if (chain === 'Solana' || chain === 'SOLANA') {
        if (position && position.contract_address) {
          // 优先尝试 DexScreener (支持 Solana)
          try {
            const DexScreenerService = require('../DexScreenerService');
            const poolInfo = await DexScreenerService.getPoolInfo(tokenSymbol, position.contract_address);
            if (poolInfo && poolInfo.priceUsd && poolInfo.priceUsd > 0) {
              this.log(`   ✅ [Solana] DexScreener 获取价格成功: $${poolInfo.priceUsd.toFixed(8)}`);
              return poolInfo.priceUsd;
            }
          } catch (dexError) {
            this.log(`   ⚠️ [Solana] DexScreener 价格获取失败: ${dexError.message}`);
          }

          // 备用: Jupiter 价格 API
          try {
            const JupiterService = require('../solana/JupiterService');
            const SOL_MINT = 'So11111111111111111111111111111111111111112';
            const priceInfo = await JupiterService.calculatePrice(
              position.contract_address,
              SOL_MINT,
              1  // 1 token
            );
            if (priceInfo && priceInfo.outputAmount > 0) {
              // priceInfo.outputAmount 是 SOL 数量, 需要转换为 USD
              // 使用 Jupiter 获取 SOL/USDC 价格
              const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
              const solPrice = await JupiterService.calculatePrice(SOL_MINT, USDC_MINT, 1);
              if (solPrice && solPrice.outputAmount > 0) {
                const tokenPriceUsd = priceInfo.outputAmount * solPrice.outputAmount;
                this.log(`   ✅ [Solana] Jupiter 获取价格成功: $${tokenPriceUsd.toFixed(8)}`);
                return tokenPriceUsd;
              }
            }
          } catch (jupiterError) {
            this.log(`   ⚠️ [Solana] Jupiter 价格获取失败: ${jupiterError.message}`);
          }
        }

        this.log(`   ⚠️ [Solana] 无法获取 ${tokenSymbol} 的价格`);
        return null;
      }

      // ===============================================
      // EVM 链价格查询 (BSC / Base)
      // ===============================================

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
          this.log(`   ✅ [Alpha] Binance Alpha API 获取价格成功: $${price.toFixed(8)}`);
          return price;
        }

        // Alpha 代币如果 Binance 获取不到，才尝试 DEX 作为备用
        this.log(`   ⚠️ [Alpha] Binance Alpha API 无法获取价格，尝试 DEX 备用...`);
      }

      // 🔧 MEME 代币或 Alpha 代币备用：使用 DEX 价格
      if (position && position.contract_address) {
        // 🔧 修复: FourMeme 只用于 BSC 链，Solana 地址传入会 BUFFER_OVERRUN
        const posChain = position.chain || chain;
        if (posChain === 'BSC') {
          try {
            const FourMemeService = require('./FourMemeService');
            const tokenInfo = await FourMemeService.getTokenInfo(position.contract_address);

            if (tokenInfo && tokenInfo.lastPriceUSD && tokenInfo.lastPriceUSD > 0) {
              this.log(`   ✅ [DEX] FourMeme 获取价格成功: $${tokenInfo.lastPriceUSD.toFixed(8)}`);
              return tokenInfo.lastPriceUSD;
            }
          } catch (dexError) {
            this.log(`   ⚠️ [DEX] FourMeme 价格获取失败: ${dexError.message}`);
          }
        }

        // 尝试 DexScreener 作为备用
        try {
          const DexScreenerService = require('../DexScreenerService');
          const poolInfo = await DexScreenerService.getPoolInfo(tokenSymbol, position.contract_address);
          if (poolInfo && poolInfo.priceUsd && poolInfo.priceUsd > 0) {
            this.log(`   ✅ [DEX] DexScreener 获取价格成功: $${poolInfo.priceUsd.toFixed(8)}`);
            return poolInfo.priceUsd;
          }
        } catch (dexError) {
          this.log(`   ⚠️ [DEX] DexScreener 价格获取失败: ${dexError.message}`);
        }

        // 🚫 MEME 代币不回退到 BinanceAlphaService，避免同名冲突
        if (isMemeToken) {
          this.log(`   ⚠️ [MEME] 无法获取 ${tokenSymbol} 的链上价格 (不使用 Alpha API 避免同名冲突)`);
          return null;
        }
      }

      // 🔧 未知类型（历史数据）或无合约地址：使用 BinanceAlphaService
      const BinanceAlphaService = require('../BinanceAlphaService');
      const price = await BinanceAlphaService.getTokenRealtimePrice(tokenSymbol, chain);

      if (price && price > 0) {
        return price;
      }

      this.log(`   ⚠️ 未找到 ${tokenSymbol} 的实时价格`);
      return null;

    } catch (error) {
      this.error(`   ❌ 获取价格失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 提交出场交易 (🆕 使用 Privy Session Signer)
   * 🔧 2026-02-06 修复: 新增 Solana 链签名支持 (PrivyService.signSolanaTransaction)
   * 🔧 备份: 原始代码只有 EVM 签名 (chainId = BSC 56 / Base 8453), 无 Solana 分支
   */
  async submitExitTransaction(position, txData) {
    const PrivyService = require('../PrivyService');
    const DatabaseService = require('../databaseService');

    try {
      this.log(`         [Privy] 使用 Session Signer 签名出场交易... (chain: ${position.chain})`);

      // 🔧 获取 Privy User ID (与 BatchExecutor 一致的逻辑)
      const configRecord = await DatabaseService.query(`
        SELECT privy_user_id FROM auto_trade_config
        WHERE user_id = ? OR wallet_address = ?
        LIMIT 1
      `, [position.user_id, position.wallet_address]);

      let privyUserId = null;

      if (configRecord.length > 0 && configRecord[0].privy_user_id) {
        privyUserId = configRecord[0].privy_user_id;
        this.log(`         🔑 Privy User ID (from config): ${privyUserId.slice(0, 20)}...`);
      } else {
        // 备用方案: 从 users 表查询
        this.log(`         ℹ️ 配置表中没有 privy_user_id,尝试从 users 表查询...`);
        const userRecord = await DatabaseService.query(`
          SELECT id FROM users WHERE address = ? OR address = ?
        `, [position.user_id, position.wallet_address]);

        if (userRecord.length === 0) {
          throw new Error(`无法找到 Privy User ID。user_id: ${position.user_id.slice(0, 10)}..., wallet_address: ${position.wallet_address.slice(0, 10)}...`);
        }

        privyUserId = userRecord[0].id;
        this.log(`         🔑 Privy User ID (from users): ${privyUserId.slice(0, 20)}...`);
      }

      // 🟣 2026-02-06 新增: Solana 链签名 (参考 BatchExecutor 第 551-566 行)
      if (position.chain === 'Solana' || position.chain === 'SOLANA') {
        this.log(`         🟣 [Privy Solana] 发送 Solana 出场交易...`);

        // Solana 不需要 Approval，直接发送主交易
        const result = await PrivyService.signSolanaTransaction(
          privyUserId,
          txData.transaction,  // Base64 编码的 Solana 交易 (由 JupiterService 返回)
          {
            network: 'mainnet',
            sponsor: false
          }
        );

        this.log(`         ✅ Solana 出场交易已通过 Privy 发送: ${result.hash.slice(0, 10)}...`);
        return result.hash;
      }

      // ===============================================
      // EVM 链签名 (BSC / Base)
      // ===============================================
      // 🔧 映射 DEXAggregatorService 返回的字段到 Privy 期望的格式
      const chainId = position.chain === 'BSC' ? 56 : 8453; // BSC=56, Base=8453

      // 使用 Privy Session Signer 签名并发送交易
      const result = await PrivyService.signTransaction(privyUserId, {
        to: txData.routerAddress,        // DEXAggregator 返回的是 routerAddress
        data: txData.txData,             // DEXAggregator 返回的是 txData.txData
        value: txData.value || '0x0',
        chainId: chainId,                // 根据链计算 chainId
        gas: txData.gasLimit,            // DEXAggregator 返回的是 gasLimit
        gasPrice: txData.gasPrice
      });

      this.log(`         ✅ 出场交易已通过 Privy 发送: ${result.hash.slice(0, 10)}...`);

      return result.hash;

    } catch (error) {
      this.error(`         ❌ Privy 出场签名失败: ${error.message}`);
      throw new Error(`Privy出场签名失败: ${error.message}`);
    }
  }

  /**
   * 计算盈亏
   * 🔧 修复: 盈亏计算需要包含部分止盈的累计卖出金额 (partial_sold_usdt)
   */
  async calculateProfitLoss(executionId) {
    try {
      const position = await this.getPosition(executionId);

      // 🔧 从 positions 表获取部分止盈累计卖出金额
      const positionData = await DatabaseService.query(`
        SELECT partial_sold_usdt FROM auto_trade_positions
        WHERE execution_id = ?
      `, [executionId]);
      const partialSoldUsdt = parseFloat(positionData[0]?.partial_sold_usdt || 0);

      const entryAmount = parseFloat(position.entry_amount_usdt);
      // 🔧 修复: 总卖出金额 = 最后卖出金额 + 部分止盈累计金额
      const lastExitAmount = parseFloat(position.exit_amount_usdt || 0);
      const exitAmount = lastExitAmount + partialSoldUsdt;
      const totalFees = parseFloat(position.entry_gas_fee || 0) + parseFloat(position.exit_gas_fee || 0);

      this.log(`   📊 [盈亏计算] 入场: $${entryAmount.toFixed(2)}, 最后卖出: $${lastExitAmount.toFixed(2)}, 部分止盈累计: $${partialSoldUsdt.toFixed(2)}, 总卖出: $${exitAmount.toFixed(2)}`);

      const profitLoss = exitAmount - entryAmount - totalFees;
      const profitPercent = (profitLoss / entryAmount) * 100;

      // 🔧 修复: 校验并修正 exit_type 与实际盈亏的一致性
      // 问题: 可能因为滑点导致触发止盈但实际是亏损
      let correctedExitType = position.exit_type;
      const currentExitType = position.exit_type;

      if (profitLoss < 0 && currentExitType === 'TAKE_PROFIT') {
        // 亏损但显示止盈 → 实际是止损（可能因滑点）
        correctedExitType = 'STOP_LOSS';
        this.log(`   ⚠️ exit_type 修正: TAKE_PROFIT → STOP_LOSS (实际亏损 $${profitLoss.toFixed(2)})`);
      } else if (profitLoss > 0 && currentExitType === 'STOP_LOSS') {
        // 盈利但显示止损 → 实际是止盈
        correctedExitType = 'TAKE_PROFIT';
        this.log(`   ⚠️ exit_type 修正: STOP_LOSS → TAKE_PROFIT (实际盈利 $${profitLoss.toFixed(2)})`);
      }

      // 更新盈亏和修正后的 exit_type
      // 🔧 修复: 同时更新 exit_amount_usdt 为总卖出金额（包含部分止盈）
      await DatabaseService.query(`
        UPDATE auto_trade_executions
        SET profit_loss_usdt = ?,
            profit_loss_percent = ?,
            total_fees = ?,
            exit_type = ?,
            exit_amount_usdt = ?
        WHERE execution_id = ?
      `, [profitLoss, profitPercent, totalFees, correctedExitType, exitAmount, executionId]);

      this.log(`   💰 盈亏: ${profitLoss > 0 ? '+' : ''}$${profitLoss.toFixed(2)} (${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%)`);

      // 同步数据到 history 和 stats 表
      const DataSyncService = require('./DataSyncService');
      await DataSyncService.onTradeExit(executionId);

      // 更新用户统计
      await this.updateUserStats(position.user_id);

    } catch (error) {
      this.error(`   ❌ 盈亏计算失败: ${error.message}`);
    }
  }

  /**
   * 更新用户统计
   * 🔧 修复: 直接从 history 表重新计算统计数据，避免累加错误
   */
  async updateUserStats(userId) {
    try {
      // 从 history 表重新计算准确的统计数据
      const stats = await DatabaseService.query(`
        SELECT
          COUNT(*) as total_trades,
          SUM(CASE WHEN profit_loss_usdt > 0 THEN 1 ELSE 0 END) as win_trades,
          COALESCE(SUM(profit_loss_usdt), 0) as total_profit
        FROM auto_trade_history
        WHERE user_id = ?
      `, [userId]);

      if (stats.length > 0) {
        const { total_trades, win_trades, total_profit } = stats[0];

        // 更新所有该用户的配置记录
        await DatabaseService.query(`
          UPDATE auto_trade_config
          SET total_trades = ?,
              win_trades = ?,
              total_profit = ?
          WHERE user_id = ?
        `, [total_trades || 0, win_trades || 0, total_profit || 0, userId]);

        this.log(`   📊 统计更新: 交易=${total_trades}, 盈利=${win_trades}, 总盈亏=$${parseFloat(total_profit || 0).toFixed(2)}`);
      }

    } catch (error) {
      this.error(`   ⚠️ 统计更新失败: ${error.message}`);
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
    this.log(`\n🖐️ 手动出场: ${executionId}`);
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

      this.log(`   🛑 已停止监控: ${executionId}`);
      return true;
    }

    return false;
  }

  /**
   * 停止所有监控
   */
  stopAll() {
    this.log(`\n🛑 停止所有出场监控 (${this.activeMonitors.size} 个)`);

    this.activeMonitors.forEach((monitor, executionId) => {
      clearInterval(monitor.interval);
      this.log(`   - ${executionId}`);
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

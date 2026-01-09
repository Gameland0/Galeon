/**
 * 价格监控服务
 * 功能:
 * 1. 监听新信号生成
 * 2. 持续监控价格是否进入入场区间
 * 3. 触发批量执行
 * 4. 管理监控生命周期
 */

const axios = require('axios');
const LiquidityMonitor = require('./LiquidityMonitor');
const DatabaseService = require('../databaseService');

class PriceWatcher {
  constructor() {
    this.activeMonitors = new Map(); // signalId -> { interval, signal, users }
    this.tokenMonitors = new Map(); // token+chain -> signalId (防止同一代币重复监控)

    console.log('✅ PriceWatcher initialized');
  }

  /**
   * 启动价格监控
   */
  async startMonitoring(signal, users) {
    const monitorId = `monitor_${signal.signal_id}`;
    const tokenKey = `${signal.token_symbol}_${signal.chain}`; // 代币唯一标识

    // 🔧 1. 检查该代币是否已在监控中 (防止重复信号)
    if (this.tokenMonitors.has(tokenKey)) {
      const existingSignalId = this.tokenMonitors.get(tokenKey);
      console.log(`   ⚠️ ${signal.token_symbol} 已在监控中 (信号: ${existingSignalId})`);
      console.log(`   ⏭️ 跳过重复信号: ${signal.signal_id}`);
      return;
    }

    // 2. 检查是否已有该信号ID的监控 (正常检查)
    if (this.activeMonitors.has(monitorId)) {
      console.log(`   ⚠️ 信号 ${signal.signal_id} 已在监控中`);
      return;
    }

    console.log(`\n👁️ 启动价格监控: ${signal.token_symbol}`);
    console.log(`   入场区间: $${signal.entry_min} - $${signal.entry_max}`);
    console.log(`   跟单用户: ${users.length} 人`);

    // 定时监控价格
    const interval = setInterval(async () => {
      try {
        // 1. 获取当前价格
        const currentPrice = await this.getDEXPrice(
          signal.token_symbol,
          signal.chain
        );

        if (!currentPrice) {
          console.log(`   ⚠️ 无法获取 ${signal.token_symbol} 价格`);
          return;
        }

        // 计算与入场区间的距离
        const distanceToEntry = this.calculateDistance(currentPrice, signal);
        const inRange = currentPrice >= signal.entry_min && currentPrice <= signal.entry_max;

        console.log(`   [${new Date().toLocaleTimeString()}] ${signal.token_symbol}: $${currentPrice.toFixed(4)} (${distanceToEntry})`);

        // 2. 检查是否进入入场区间
        if (inRange) {
          console.log(`   ✅ 价格进入入场区间!`);

          // 停止监控
          clearInterval(interval);
          this.activeMonitors.delete(monitorId);
          this.tokenMonitors.delete(tokenKey); // 🔧 清理代币监控标记

          // 3. 触发批量执行
          const BatchExecutor = require('./BatchExecutor');
          await BatchExecutor.executeBatchTrades(signal, users, currentPrice);
        }

        // 4. 价格突破区间太多，放弃入场
        // 🧪 [测试模式] 临时禁用价格偏差检查,直接执行交易
        if (false && currentPrice > signal.entry_max * 1.1) {
          console.log(`   ⏭️ 价格已突破区间 10%，放弃入场`);
          clearInterval(interval);
          this.activeMonitors.delete(monitorId);
          this.tokenMonitors.delete(tokenKey); // 🔧 清理代币监控标记

          // 记录日志
          await this.logPriceEvent(signal, 'SKIPPED', currentPrice, '价格突破入场区间');
        }

        // 5. 价格跌破区间太多
        // 🧪 [测试模式] 临时禁用价格偏差检查,直接执行交易
        if (false && currentPrice < signal.entry_min * 0.9) {
          console.log(`   ⏭️ 价格已跌破区间 10%，放弃入场`);
          clearInterval(interval);
          this.activeMonitors.delete(monitorId);
          this.tokenMonitors.delete(tokenKey); // 🔧 清理代币监控标记

          await this.logPriceEvent(signal, 'SKIPPED', currentPrice, '价格跌破入场区间');
        }

        // 🧪 [测试模式] 无论价格如何,都执行交易 - 已禁用，恢复正常价格检查
        // 🔧 修复: 禁用测试模式，避免绕过正常的价格区间检查
        // if (!inRange && currentPrice > 0) {
        //   console.log(`   🧪 [测试模式] 忽略价格偏差,强制执行交易`);
        //   console.log(`   📊 当前价格: $${currentPrice.toFixed(6)}, 入场区间: $${signal.entry_min} - $${signal.entry_max}`);
        //
        //   clearInterval(interval);
        //   this.activeMonitors.delete(monitorId);
        //   this.tokenMonitors.delete(tokenKey);
        //
        //   const BatchExecutor = require('./BatchExecutor');
        //   await BatchExecutor.executeBatchTrades(signal, users, currentPrice);
        // }

      } catch (error) {
        console.error(`   ❌ 价格监控错误: ${error.message}`);
      }
    }, 10000); // 每 10 秒检查一次

    // 保存监控状态
    this.activeMonitors.set(monitorId, {
      interval,
      signal,
      users,
      startedAt: new Date()
    });

    // 🔧 注册代币监控标记
    this.tokenMonitors.set(tokenKey, signal.signal_id);

    // 信号过期后自动停止
    const expiresAt = new Date(signal.expires_at).getTime();
    const timeout = expiresAt - Date.now();

    if (timeout > 0) {
      setTimeout(() => {
        if (this.activeMonitors.has(monitorId)) {
          clearInterval(interval);
          this.activeMonitors.delete(monitorId);
          this.tokenMonitors.delete(tokenKey); // 🔧 清理代币监控标记
          console.log(`   ⏰ ${signal.token_symbol} 信号已过期`);

          this.logPriceEvent(signal, 'EXPIRED', null, '信号已过期');
        }
      }, timeout);
    }
  }

  /**
   * 获取 DEX 价格
   * ✅ 优先从 alpha_signals 表读取实时价格,备用白名单价格
   */
  async getDEXPrice(tokenSymbol, chain) {
    try {
      const DatabaseService = require('../databaseService');

      // 🔧 优先从 alpha_signals 表读取最新价格
      const signalResult = await DatabaseService.query(`
        SELECT current_price FROM alpha_signals
        WHERE token_symbol = ? AND chain = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [tokenSymbol, chain]);

      if (signalResult.length > 0 && signalResult[0].current_price) {
        const price = parseFloat(signalResult[0].current_price);
        console.log(`   📊 [DEBUG] 从信号表获取 ${tokenSymbol} 价格: $${price.toFixed(6)}`);
        return price;
      }

      // 备用方案: 从数据库白名单读取价格 (来自 Binance Alpha)
      const whitelistResult = await DatabaseService.query(`
        SELECT price_usd FROM auto_trade_token_whitelist
        WHERE token_symbol = ? AND chain = ?
        LIMIT 1
      `, [tokenSymbol, chain]);

      if (whitelistResult.length > 0 && whitelistResult[0].price_usd) {
        const price = parseFloat(whitelistResult[0].price_usd);
        console.log(`   📊 [DEBUG] 从白名单获取 ${tokenSymbol} 价格: $${price.toFixed(6)}`);
        return price;
      }

      console.log(`   ⚠️ 数据库中未找到 ${tokenSymbol} 价格`);
      return null;

    } catch (error) {
      console.error(`   ❌ 获取价格失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 计算价格与入场区间的距离
   */
  calculateDistance(currentPrice, signal) {
    if (currentPrice >= signal.entry_min && currentPrice <= signal.entry_max) {
      return '✅ 在区间内';
    }

    if (currentPrice > signal.entry_max) {
      const percent = ((currentPrice - signal.entry_max) / signal.entry_max * 100).toFixed(2);
      return `⬆️ 高于 +${percent}%`;
    }

    if (currentPrice < signal.entry_min) {
      const percent = ((signal.entry_min - currentPrice) / signal.entry_min * 100).toFixed(2);
      return `⬇️ 低于 -${percent}%`;
    }

    return '';
  }

  /**
   * 记录价格事件日志
   */
  async logPriceEvent(signal, event, price, reason) {
    try {
      await DatabaseService.query(`
        INSERT INTO price_monitor_logs
        (signal_id, token_symbol, event, price, reason, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `, [signal.signal_id, signal.token_symbol, event, price, reason]);
    } catch (error) {
      // 日志表可能不存在，忽略错误
      console.log(`   ℹ️ 日志记录失败 (表可能不存在): ${error.message}`);
    }
  }

  /**
   * 停止指定信号的监控
   */
  stopMonitoring(signalId) {
    const monitorId = `monitor_${signalId}`;

    if (this.activeMonitors.has(monitorId)) {
      const monitor = this.activeMonitors.get(monitorId);
      const tokenKey = `${monitor.signal.token_symbol}_${monitor.signal.chain}`;

      clearInterval(monitor.interval);
      this.activeMonitors.delete(monitorId);
      this.tokenMonitors.delete(tokenKey); // 🔧 清理代币监控标记

      console.log(`   🛑 已停止监控: ${monitor.signal.token_symbol}`);
      return true;
    }

    return false;
  }

  /**
   * 停止所有监控
   */
  stopAll() {
    console.log(`\n🛑 停止所有价格监控 (${this.activeMonitors.size} 个)`);

    this.activeMonitors.forEach((monitor, monitorId) => {
      clearInterval(monitor.interval);
      console.log(`   - ${monitor.signal.token_symbol}`);
    });

    this.activeMonitors.clear();
    this.tokenMonitors.clear(); // 🔧 清理所有代币监控标记
  }

  /**
   * 获取监控状态
   */
  getMonitorStatus() {
    const monitors = [];

    this.activeMonitors.forEach((monitor, monitorId) => {
      monitors.push({
        signalId: monitor.signal.signal_id,
        tokenSymbol: monitor.signal.token_symbol,
        chain: monitor.signal.chain,
        usersCount: monitor.users.length,
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

module.exports = new PriceWatcher();

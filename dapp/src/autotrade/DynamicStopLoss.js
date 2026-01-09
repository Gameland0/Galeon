/**
 * 动态止损止盈服务
 * 功能:
 * 1. ATR 计算 (Average True Range)
 * 2. 初始动态止损计算
 * 3. 移动止损更新 (Trailing Stop)
 * 4. 时间衰减规则 (Time Decay)
 */

class DynamicStopLoss {
  constructor() {
    // 配置参数
    this.config = {
      // ATR 配置
      atrPeriod: 14,              // ATR 周期
      atrMultiplierSL: 2.0,       // 止损 ATR 倍数
      atrMultiplierTP: 3.0,       // 止盈 ATR 倍数

      // 移动止损配置
      // 🔧 修改：一入场就激活移动止损（原来是 5%）
      trailingActivationPct: 0,   // 盈利 0% 后激活移动止损（立即激活）
      trailingStopPct: 3,         // 追踪止损比例 3%

      // 硬止损限制
      maxStopLossPct: 20,         // 最大止损 20%
      minStopLossPct: 3,          // 最小止损 3%
    };

    console.log('✅ DynamicStopLoss initialized');
  }

  /**
   * 计算 ATR (Average True Range)
   * @param {Array} klines - K线数据 [{high, low, close}, ...] 或 [[time, open, high, low, close, volume], ...]
   * @param {number} period - ATR 周期
   * @returns {number|null} ATR 值
   */
  calculateATR(klines, period = 14) {
    if (!klines || klines.length < period + 1) {
      console.log(`   ⚠️ [ATR] K线数据不足 (${klines?.length || 0}/${period + 1})`);
      return null;
    }

    const trueRanges = [];

    for (let i = 1; i < klines.length; i++) {
      // 支持两种K线格式
      let high, low, prevClose;

      if (Array.isArray(klines[i])) {
        // Binance 格式: [time, open, high, low, close, volume, ...]
        high = parseFloat(klines[i][2]);
        low = parseFloat(klines[i][3]);
        prevClose = parseFloat(klines[i - 1][4]);
      } else {
        // 对象格式: {high, low, close}
        high = parseFloat(klines[i].high);
        low = parseFloat(klines[i].low);
        prevClose = parseFloat(klines[i - 1].close);
      }

      // True Range = max(H-L, |H-prevClose|, |L-prevClose|)
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // 取最近 period 个 TR 的平均值
    const recentTRs = trueRanges.slice(-period);
    const atr = recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length;

    return atr;
  }

  /**
   * 计算初始动态止损止盈
   * @param {number} entryPrice - 入场价
   * @param {Array} klines - K线数据
   * @param {Object} options - 配置选项 {stopLossPct, takeProfitPct, stopLossMode}
   *   - stopLossMode: 用户配置的止损模式 (FIXED/ATR/TRAILING)
   * @returns {Object} 止损止盈配置
   */
  getInitialStopLoss(entryPrice, klines, options = {}) {
    const result = {
      stopLossPrice: null,
      takeProfitPrice: null,
      stopLossType: 'FIXED',
      atrValue: null,
      stopLossPct: null,
      takeProfitPct: null,
      trailingActivated: false  // 🔧 新增：是否立即激活 Trailing
    };

    // 🔧 获取用户配置的止损模式
    const userStopLossMode = (options.stopLossMode || 'FIXED').toUpperCase();
    console.log(`   📊 [DynamicSL] 用户止损模式: ${userStopLossMode}`);

    // 默认使用用户配置的百分比
    const fallbackSL = options.stopLossPct || 10;
    const fallbackTP = options.takeProfitPct || 20;

    // 1. 尝试 ATR 计算（只有 ATR 模式才使用）
    let atr = null;
    let useATR = false;

    if (userStopLossMode === 'ATR') {
      atr = this.calculateATR(klines, this.config.atrPeriod);
      useATR = atr && atr > 0;
    }

    if (useATR) {
      // ATR 动态止损
      const atrStopLoss = entryPrice - (atr * this.config.atrMultiplierSL);
      const atrTakeProfit = entryPrice + (atr * this.config.atrMultiplierTP);

      // 计算百分比
      let stopLossPct = ((entryPrice - atrStopLoss) / entryPrice) * 100;
      let takeProfitPct = ((atrTakeProfit - entryPrice) / entryPrice) * 100;

      // 限制在合理范围内
      stopLossPct = Math.max(this.config.minStopLossPct,
        Math.min(this.config.maxStopLossPct, stopLossPct));

      result.stopLossPrice = entryPrice * (1 - stopLossPct / 100);
      // ✅ 修复: 止盈 = 入场价 × (1 + 百分比) (16% = 1.16倍)
      result.takeProfitPrice = entryPrice * (1 + takeProfitPct / 100);
      result.stopLossType = 'ATR';
      result.atrValue = atr;
      result.stopLossPct = stopLossPct;
      result.takeProfitPct = takeProfitPct;

      console.log(`   📊 [DynamicSL] ATR止损: ATR=${atr.toFixed(6)}, SL=${stopLossPct.toFixed(2)}%, TP=${takeProfitPct.toFixed(2)}%`);

    } else if (userStopLossMode === 'TRAILING') {
      // 🔧 Trailing 模式：使用固定百分比计算初始止损，但标记为 TRAILING
      result.stopLossPrice = entryPrice * (1 - fallbackSL / 100);
      // ✅ 修复: 止盈 = 入场价 × (1 + 百分比) (16% = 1.16倍)
      result.takeProfitPrice = entryPrice * (1 + fallbackTP / 100);
      result.stopLossType = 'TRAILING';  // 🔧 直接标记为 TRAILING
      result.stopLossPct = fallbackSL;
      result.takeProfitPct = fallbackTP;
      result.trailingActivated = true;   // 🔧 立即激活

      console.log(`   📊 [DynamicSL] Trailing止损: SL=${fallbackSL}%, TP=${fallbackTP}% (已激活移动止损)`);

    } else {
      // FIXED 模式（默认）或 ATR 数据不足时降级
      result.stopLossPrice = entryPrice * (1 - fallbackSL / 100);
      // ✅ 修复: 止盈 = 入场价 × (1 + 百分比) (16% = 1.16倍)
      result.takeProfitPrice = entryPrice * (1 + fallbackTP / 100);
      result.stopLossType = 'FIXED';
      result.stopLossPct = fallbackSL;
      result.takeProfitPct = fallbackTP;

      if (userStopLossMode === 'ATR') {
        console.log(`   📊 [DynamicSL] 固定止损: SL=${fallbackSL}%, TP=${fallbackTP}% (ATR数据不足,降级为FIXED)`);
      } else {
        console.log(`   📊 [DynamicSL] 固定止损: SL=${fallbackSL}%, TP=${fallbackTP}%`);
      }
    }

    return result;
  }

  /**
   * 更新移动止损
   * @param {Object} position - 持仓信息
   * @param {number} currentPrice - 当前价格
   * @returns {Object} 更新结果
   */
  updateTrailingStop(position, currentPrice) {
    const entryPrice = parseFloat(position.entry_price);
    const highestPrice = parseFloat(position.highest_price) || entryPrice;
    const currentStopLoss = parseFloat(position.stop_loss_price);
    const trailingActivated = position.trailing_stop_activated === 1;

    const result = {
      shouldUpdate: false,
      newHighestPrice: highestPrice,
      newStopLossPrice: currentStopLoss,
      trailingActivated: trailingActivated,
      stopLossType: position.stop_loss_type || 'FIXED'
    };

    // 1. 更新最高价
    if (currentPrice > highestPrice) {
      result.newHighestPrice = currentPrice;
      result.shouldUpdate = true;
    }

    // 2. 检查是否应该激活移动止损
    // 🔧 修复: 只有当用户设置的模式是 TRAILING 时才自动激活
    const profitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    const initialStopLossType = position.stop_loss_type || 'FIXED';

    // 只有 TRAILING 模式才会自动激活移动止损
    if (initialStopLossType === 'TRAILING' && !trailingActivated && profitPct >= this.config.trailingActivationPct) {
      console.log(`   🔄 [Trailing] 激活移动止损: 盈利 ${profitPct.toFixed(2)}% >= ${this.config.trailingActivationPct}%`);
      result.trailingActivated = true;
      result.stopLossType = 'TRAILING';
      result.shouldUpdate = true;
    }

    // 3. 如果移动止损已激活，更新止损价
    if (result.trailingActivated) {
      // 新止损价 = 最高价 × (1 - 追踪比例)
      const newTrailingStop = result.newHighestPrice * (1 - this.config.trailingStopPct / 100);

      // 止损只能上移，不能下移
      if (newTrailingStop > result.newStopLossPrice) {
        console.log(`   📈 [Trailing] 止损上调: $${result.newStopLossPrice.toFixed(6)} → $${newTrailingStop.toFixed(6)}`);
        result.newStopLossPrice = newTrailingStop;
        result.shouldUpdate = true;
      }
    }

    return result;
  }

  /**
   * 综合检查并更新止损 (在 ExitMonitor 中调用)
   * @param {Object} position - 持仓信息
   * @param {number} currentPrice - 当前价格
   * @returns {Object} 更新结果
   */
  checkAndUpdateStopLoss(position, currentPrice) {
    const updates = {
      shouldUpdate: false,
      fields: {}
    };

    // 移动止损检查
    const trailingResult = this.updateTrailingStop(position, currentPrice);
    if (trailingResult.shouldUpdate) {
      updates.shouldUpdate = true;
      updates.fields.highest_price = trailingResult.newHighestPrice;
      updates.fields.trailing_stop_activated = trailingResult.trailingActivated ? 1 : 0;

      if (trailingResult.newStopLossPrice > parseFloat(position.stop_loss_price)) {
        updates.fields.stop_loss_price = trailingResult.newStopLossPrice;
        updates.fields.stop_loss_type = trailingResult.stopLossType;
      }
    }

    if (updates.shouldUpdate) {
      updates.fields.last_stop_update_at = new Date();
    }

    return updates;
  }

  /**
   * 获取配置
   */
  getConfig() {
    return this.config;
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('   ✅ [DynamicSL] 配置已更新');
  }
}

module.exports = new DynamicStopLoss();

/**
 * LearningEngine - 投票维度自学习权重引擎
 *
 * 功能:
 * - 加载/缓存维度权重（从DB）
 * - 记录每笔交易各维度投票情况
 * - 定期计算各维度准确率 → 更新权重
 *
 * 权重规则:
 *   准确率 ≥ 65% → weight = 2 (强信号)
 *   准确率 ≥ 55% → weight = 1 (正常)
 *   准确率 ≥ 45% → weight = 0 (随机,忽略)
 *   准确率 < 45% → weight = -1 (反指标)
 */

const DatabaseService = require('../databaseService');
const axios = require('axios');
const MarketDataCache = require('./MarketDataCache');
const { createStorage } = require('./storage/StorageFactory');

class LearningEngine {
  // [2026-07-29] 修复MySQL2 JSON列自动解析为object的问题
  // MySQL2返回JSON列时已经是object, 但代码用JSON.parse()解析→报错→被catch吞掉→学习数据永远total=1
  static _parseData(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch(e) { return null; }
  }

  constructor(env = 'mainnet', strategy = 'stable') {
    this.env = env;
    this.strategy = strategy;
    this.weights = {}; // { dimension: weight }
    this.lessonBuffer = []; // 未写入DB的交易记录
    this.initialized = false;
    this.oiHistory = {};   // { symbol: [{ts, oi}] }
    this.frHistory = {};   // { symbol: [{ts, fr}] }
    this.takerHistory = {}; // { symbol: [{ts, taker}] }
    this._lastOIScan = 0;
    this._oiHistoryPath = null; // 由外部设置 (DATA_DIR)
    this.dimOutcomes = {}; // [2026-05-27] dimOutcomes学习: 每个维度方向的实际结果统计
    this.comboStats = {};  // [2026-06-07] combo组合学习: 按BTC环境分的胜率统计
    this.marketMemory = null; // [2026-07-16] Market Memory: 历史形态匹配
    // [2026-07-29] ML Service客户端
    this._mlBaseUrl = process.env.ML_SERVICE_URL || 'http://localhost:5050/api/v1';
    this._mlAvailable = false;
    this._mlLastCheck = 0;
    // [2026-08-27] Dynamic combo blocking: 从真实交易结果学习，自动拦截连续亏损的入场条件组合
    this._recentComboOutcomes = {};  // { comboKey: [{ ts, isWin, pnl }] }
    this._comboBlockUntil = {};      // { comboKey: unblockTimestamp }
    // [2026-09-04] Sibyl Memory StorageAdapter: LEARNING_STORAGE=sibyl|mysql
    this.storage = createStorage(env, strategy);
  }

  async initialize(dataDir = null) {
    await this.loadWeights();
    await this._loadDimOutcomes();
    await this._loadComboStats();
    await this._loadMarketMemory();
    if (dataDir) {
      const fs = require('fs'), path = require('path');
      this._oiHistoryPath = path.join(dataDir, 'oi_history.json');
      try {
        if (fs.existsSync(this._oiHistoryPath)) {
          const d = JSON.parse(fs.readFileSync(this._oiHistoryPath, 'utf8'));
          this.oiHistory = d.oiHistory || {};
          this.frHistory = d.frHistory || {};
          this.takerHistory = d.takerHistory || {};
        }
      } catch(e) {}
    }
    this.initialized = true;
    console.log(`[LearningEngine][${this.env}] Initialized with ${Object.keys(this.weights).length} dimensions`);
  }

  _saveOIHistory() {
    if (!this._oiHistoryPath) return;
    try {
      const fs = require('fs');
      fs.writeFileSync(this._oiHistoryPath, JSON.stringify({
        oiHistory: this.oiHistory, frHistory: this.frHistory, takerHistory: this.takerHistory
      }));
    } catch(e) {}
  }

  // === OI 多时间窗口记录 (每3分钟, 配合候选池15分钟等待至少5次采集) ===
  async recordOI(symbols) {
    if (Date.now() - this._lastOIScan < 3 * 60 * 1000) return;
    this._lastOIScan = Date.now();

    for (const sym of symbols.slice(0, 30)) {
      try {
        const [oiR, frR, tkR] = await Promise.all([
          MarketDataCache.get('https://fapi.binance.com/fapi/v1/openInterest', { params: { symbol: sym }, timeout: 5000 }).catch(() => null),
          MarketDataCache.get('https://fapi.binance.com/fapi/v1/premiumIndex', { params: { symbol: sym }, timeout: 5000 }).catch(() => null),
          MarketDataCache.get('https://fapi.binance.com/futures/data/takerlongshortRatio', { params: { symbol: sym, period: '1h', limit: 1 }, timeout: 5000 }).catch(() => null),
        ]);
        const now = Date.now();
        if (oiR?.data) {
          const oi = parseFloat(oiR.data.openInterest);
          if (!this.oiHistory[sym]) this.oiHistory[sym] = [];
          this.oiHistory[sym].push({ ts: now, oi });
          if (this.oiHistory[sym].length > 2016) this.oiHistory[sym] = this.oiHistory[sym].slice(-2016);
        }
        if (frR?.data) {
          const fr = parseFloat(frR.data.lastFundingRate);
          if (!this.frHistory[sym]) this.frHistory[sym] = [];
          this.frHistory[sym].push({ ts: now, fr });
          if (this.frHistory[sym].length > 288) this.frHistory[sym] = this.frHistory[sym].slice(-288);
        }
        if (tkR?.data?.[0]) {
          const taker = parseFloat(tkR.data[0].buySellRatio);
          if (!this.takerHistory[sym]) this.takerHistory[sym] = [];
          this.takerHistory[sym].push({ ts: now, taker });
          if (this.takerHistory[sym].length > 288) this.takerHistory[sym] = this.takerHistory[sym].slice(-288);
        }
        await new Promise(r => setTimeout(r, 100));
      } catch(e) {}
    }
    this._saveOIHistory();
  }

  // FR趋势分析
  analyzeFRTrend(symbol) {
    const h = this.frHistory?.[symbol];
    if (!h || h.length < 3) return { trend: 'UNKNOWN', change: 0 };
    const recent = h.slice(-6);
    const first = recent[0].fr, last = recent[recent.length - 1].fr;
    const mid = recent[Math.floor(recent.length / 2)].fr;
    if (last > first && last > mid) return { trend: 'RISING', change: last - first, from: first, to: last };
    if (last < first && last < mid) return { trend: 'FALLING', change: last - first, from: first, to: last };
    if ((first < 0 && last > 0) || (first > 0 && last < 0)) return { trend: 'FLIP', change: last - first, from: first, to: last };
    return { trend: 'FLAT', change: last - first, from: first, to: last };
  }

  // Taker趋势分析
  analyzeTakerTrend(symbol) {
    const h = this.takerHistory?.[symbol];
    if (!h || h.length < 3) return { trend: 'UNKNOWN', change: 0 };
    const recent = h.slice(-6);
    const first = recent[0].taker, last = recent[recent.length - 1].taker;
    if (first > 1.05 && last < 0.95) return { trend: 'BUY_TO_SELL', from: first, to: last };
    if (first < 0.95 && last > 1.05) return { trend: 'SELL_TO_BUY', from: first, to: last };
    if (last > first + 0.05) return { trend: 'RISING', from: first, to: last };
    if (last < first - 0.05) return { trend: 'FALLING', from: first, to: last };
    return { trend: 'FLAT', from: first, to: last };
  }

  // === K线动态分析 ===
  async analyzeKlineDynamics(symbol) {
    const result = { score: 0, trend: 'UNKNOWN', reasons: [], data: {} };
    try {
      // [2026-06-25] 从4h改为1h: 对齐本地, 1h更灵敏能捕捉趋势变化
      // SKYAI案例: 15m急跌-8.9%在4h看不到, 1h能反映 → RT给正确负分
      const r = await MarketDataCache.get('https://fapi.binance.com/fapi/v1/klines', {
        params: { symbol, interval: '1h', limit: 20 }, timeout: 5000
      });
      if (!Array.isArray(r.data) || r.data.length < 10) return result;
      const klines = r.data;
      const closes = klines.map(k => parseFloat(k[4]));
      const opens = klines.map(k => parseFloat(k[1]));
      const highs = klines.map(k => parseFloat(k[2]));
      const lows = klines.map(k => parseFloat(k[3]));
      const vols = klines.map(k => parseFloat(k[5]));
      const current = closes[closes.length - 1];

      let consecutiveBear = 0, consecutiveBull = 0;
      for (let i = klines.length - 2; i >= 0; i--) {
        if (closes[i] < opens[i]) { if (consecutiveBull === 0) consecutiveBear++; else break; }
        else { if (consecutiveBear === 0) consecutiveBull++; else break; }
      }
      result.data.consecutiveBear = consecutiveBear;
      result.data.consecutiveBull = consecutiveBull;
      if (consecutiveBear >= 5) { result.score -= 4; result.reasons.push(`连续${consecutiveBear}阴(强下跌)`); }
      else if (consecutiveBear >= 3) { result.score -= 2; result.reasons.push(`连续${consecutiveBear}阴`); }
      // [2026-05-30] 连续阳线加分提升: 3阳+1→+2, 5阳+3→+4
      // LAB案例: 连续3阳+缩量0.42x → 旧规则3阳(+1)+缩量(-1)=0 → NEUTRAL → 被踢出候选池
      if (consecutiveBull >= 5) { result.score += 4; result.reasons.push(`连续${consecutiveBull}阳(强上涨)`); }
      else if (consecutiveBull >= 3) { result.score += 2; result.reasons.push(`连续${consecutiveBull}阳`); }

      const avgVol = vols.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(vols.length - 3, 1);
      const recentVol = (vols[vols.length - 1] + vols[vols.length - 2] + vols[vols.length - 3]) / 3;
      const volRatio = avgVol > 0 ? +(recentVol / avgVol).toFixed(2) : 1;
      result.data.volRatio = volRatio;
      // [2026-06-13] 缩量不再无条件扣方向分
      // CTR案例: 连3阴(-2)+严重缩量(-3)+底部(+2)=-3→BEARISH, 但实际是底部横盘不是下跌趋势
      // 连阴+缩量=动能衰竭(到底了), 不是下跌加速。连阴+放量才是真正下跌
      // 改法: 缩量只在没有连阴/连阳时扣方向分; 有连阴/连阳时只标记不扣分(由投票系统缩量降权处理)
      const _hasConsec = consecutiveBear >= 3 || consecutiveBull >= 3;
      if (volRatio < 0.3) {
        if (_hasConsec) {
          // 连阴+严重缩量=动能衰竭, 不扣方向分, 只标记
          result.reasons.push(`严重缩量(${volRatio}x)`);
        } else {
          result.score -= 2; result.reasons.push(`严重缩量(${volRatio}x)`);
        }
      }
      else if (volRatio < 0.6) {
        if (!_hasConsec) {
          result.score -= 1; result.reasons.push(`缩量(${volRatio}x)`);
        } else {
          result.reasons.push(`缩量(${volRatio}x)`);
        }
      }
      // [2026-06-25] 放量区分方向: 上涨放量=看多, 下跌放量=看空
      // PUMP案例: 下跌放量2.85x被当成看多+2分 → K线判BULLISH → score=12开LONG → 亏$109
      // 看最近3根K线的涨跌方向决定放量含义
      else if (volRatio > 2) {
        const _recent3 = closes.slice(-3);
        const _recent3Bull = _recent3.filter((c, i) => i > 0 && c > _recent3[i-1]).length;
        const _recent3Bear = _recent3.filter((c, i) => i > 0 && c < _recent3[i-1]).length;
        if (_recent3Bull > _recent3Bear) {
          result.score += 2; result.reasons.push(`放量(${volRatio}x)`);
        } else if (_recent3Bear > _recent3Bull) {
          result.score -= 2; result.reasons.push(`下跌放量(${volRatio}x)`);
        } else {
          result.reasons.push(`放量方向不明(${volRatio}x)`);
        }
      }
      else if (volRatio > 1.3) {
        const _recent2 = closes.slice(-2);
        if (_recent2[1] >= _recent2[0]) {
          result.score += 1; result.reasons.push(`量增(${volRatio}x)`);
        } else {
          result.score -= 1; result.reasons.push(`下跌量增(${volRatio}x)`);
        }
      }

      const peak = Math.max(...highs);
      const trough = Math.min(...lows);
      const range = peak - trough;
      const fromPeak = +((current - peak) / peak * 100).toFixed(1);
      const fromTrough = +((current - trough) / trough * 100).toFixed(1);
      const positionInRange = range > 0 ? (current - trough) / range : 0.5;
      result.data.fromPeak = fromPeak;
      result.data.fromTrough = fromTrough;
      result.data.positionInRange = +positionInRange.toFixed(2);
      // 连阴>=3时底部可能是瀑布中继，不加分
      if (positionInRange < 0.2 && consecutiveBear < 3) { result.score += 2; result.reasons.push(`底部区域(pos=${(positionInRange*100).toFixed(0)}%,距低点${fromTrough.toFixed(1)}%)`); }
      else if (positionInRange < 0.2 && consecutiveBear >= 3) { result.reasons.push(`底部区域(pos=${(positionInRange*100).toFixed(0)}%,距低点${fromTrough.toFixed(1)}%)但${consecutiveBear}连阴不加分`); }
      else if (positionInRange < 0.35) { result.score += 1; result.reasons.push(`偏低位(pos=${(positionInRange*100).toFixed(0)}%)`); }
      else if (positionInRange > 0.9) { result.score += 1; result.reasons.push(`趋势极强(pos=${(positionInRange*100).toFixed(0)}%,距高点${fromPeak}%)`); }
      else if (positionInRange > 0.7) { result.reasons.push(`高位观望(pos=${(positionInRange*100).toFixed(0)}%)`); }
      // [2026-08-18] 高位连阴补分: consecutiveBear>=3 + pos>70% = 明确下跌趋势
      // VVV/VIRTUAL案例: consecutiveBear=3, pos=87% → 仅-2分=NEUTRAL → 被当成中性开LONG亏损
      // 额外-1确保高位连阴触发BEARISH(≤-3)判定; 底部连阴不适用(可能是超卖反弹)
      if (consecutiveBear >= 3 && positionInRange > 0.70) {
        result.score -= 1; result.reasons.push(`高位连${consecutiveBear}阴(pos=${(positionInRange*100).toFixed(0)}%,下跌趋势)`);
      }

      let pumpDumpDetected = false;
      for (let i = 3; i < klines.length - 2; i++) {
        const kChg = (closes[i] - opens[i]) / opens[i] * 100;
        if (kChg > 20) {
          const afterBears = klines.slice(i + 1).filter(k => parseFloat(k[4]) < parseFloat(k[1])).length;
          const afterTotal = klines.length - i - 1;
          if (afterBears / afterTotal > 0.6) {
            pumpDumpDetected = true;
            result.score -= 4;
            result.reasons.push(`暴涨${kChg.toFixed(0)}%后出货(${afterBears}/${afterTotal}阴线)`);
            break;
          }
        }
      }
      result.data.pumpDump = pumpDumpDetected;

      const prevHigh = Math.max(...highs.slice(-6, -1));
      const lastHigh = highs[highs.length - 1];
      const lastClose = closes[closes.length - 1];
      // [2026-06-11] 假突破放宽: 回落>突破幅度50%才算假突破
      // H/COLLECT等涨幅榜token震荡上涨, 每根K线创新高小回落是正常节奏
      // 被误判假突破后K线降级NEUTRAL → 触发FR拥挤+K线无方向拦截
      if (lastHigh > prevHigh && lastClose < prevHigh) {
        const _breakAmt = lastHigh - prevHigh;
        const _pullback = lastHigh - lastClose;
        if (_breakAmt > 0 && _pullback / _breakAmt > 0.5) {
          result.score -= 2; result.reasons.push(`假突破(冲${lastHigh.toFixed(4)}回落)`);
          result.data.fakeBreakout = true;
        }
      }

      const last2VolAvg = (vols[vols.length - 1] + vols[vols.length - 2]) / 2;
      const prev5VolAvg = vols.slice(-7, -2).reduce((a, b) => a + b, 0) / 5;
      const last2Chg = (closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3] * 100;
      if (prev5VolAvg > 0 && last2VolAvg / prev5VolAvg > 2 && last2Chg > 5) {
        result.score += 3; result.reasons.push(`底部放量启动(vol=${(last2VolAvg/prev5VolAvg).toFixed(1)}x,chg=${last2Chg.toFixed(1)}%)`);
        result.data.bottomBreakout = true;
      }

      // [2026-06-28] 15m短线修正: 1h连阴/连阳只反映已完成K线, 15m能捕捉当前小时内的反转
      // BTW案例: 1h连续6阴=-4分, 但15m已出现2根大阳线 → 反转信号未被1h识别
      // 逻辑: 4根15m=1根1h, 15m连续N阳说明当前1h蜡烛正在反转, 需对1h评分做短线修正
      try {
        const r15 = await MarketDataCache.get('https://fapi.binance.com/fapi/v1/klines', {
          params: { symbol, interval: '15m', limit: 20 }, timeout: 5000
        });
        if (Array.isArray(r15.data) && r15.data.length >= 8) {
          const k15 = r15.data;
          const c15 = k15.map(k => parseFloat(k[4]));
          const o15 = k15.map(k => parseFloat(k[1]));
          const v15 = k15.map(k => parseFloat(k[5]));
          let bull15 = 0, bear15 = 0;
          for (let i = k15.length - 2; i >= 0; i--) {
            if (c15[i] > o15[i]) { if (bear15 === 0) bull15++; else break; }
            else if (c15[i] < o15[i]) { if (bull15 === 0) bear15++; else break; }
            else break; // doji不计入
          }
          result.data.consecutiveBull15m = bull15;
          result.data.consecutiveBear15m = bear15;

          // 15m量能(最近4根均量 vs 前8根均量)
          const _avg15Recent = v15.slice(-5, -1).reduce((a, b) => a + b, 0) / 4;
          const _avg15Prev = v15.slice(-13, -5).reduce((a, b) => a + b, 0) / 8;
          const _volRatio15 = _avg15Prev > 0 ? +(_avg15Recent / _avg15Prev).toFixed(2) : 1;
          result.data.volRatio15m = _volRatio15;

          const _1hBear = consecutiveBear >= 3;
          const _1hBull = consecutiveBull >= 3;

          // 1h连阴 + 15m开始反转
          if (bull15 >= 4 && _1hBear) {
            // 4根15m=完整1h反转, 强信号
            result.score += 3;
            result.reasons.push(`15m强反转(连续${bull15}阳${_volRatio15 > 1.3 ? ',放量' + _volRatio15 + 'x' : ''})`);
          } else if (bull15 >= 2 && _1hBear) {
            // 2-3根15m阳=短线企稳, 1h熊信号降权
            result.score += 2;
            result.reasons.push(`15m企稳(连续${bull15}阳${_volRatio15 > 1.3 ? ',放量' + _volRatio15 + 'x' : ''})`);
          } else if (bull15 >= 3 && !_1hBear) {
            // 1h中性/看多 + 15m连阳 = 短线偏多确认
            result.score += 1;
            result.reasons.push(`15m偏多(连续${bull15}阳)`);
          }

          // 1h连阳 + 15m开始转弱
          if (bear15 >= 4 && _1hBull) {
            result.score -= 2;
            result.reasons.push(`15m转弱(连续${bear15}阴)`);
          } else if (bear15 >= 2 && _1hBull) {
            result.score -= 1;
            result.reasons.push(`15m回调(连续${bear15}阴)`);
          }

          // [2026-08-18] 15m整体方向: 最近6根已收盘K线的多空分布
          // 根因: consecutiveBull/Bear只看最近streak, 1-2根反弹就清零了之前5根大阴的背景
          // CYSUSDT案例: 暴跌后出现1-2根反弹绿K → bear=0 → 系统判定为中性 → 开LONG亏损
          // 修复: 统计最近6根的整体多空格局, 4+阴=整体偏空 kS-1, 4+阳=整体偏多 kS+1
          // 意义: "站稳"需要整体格局翻转(4+阳), 不是1-2根绿K就算向上趋势
          const _last6 = k15.slice(-7, -1); // 最近6根已收盘15m(排除当前未收盘)
          if (_last6.length >= 6) {
            const _bull6 = _last6.filter(k => parseFloat(k[4]) > parseFloat(k[1])).length;
            const _bear6 = _last6.length - _bull6;
            result.data.bull15Count6 = _bull6;
            result.data.bear15Count6 = _bear6;
            if (_bear6 >= 4) {
              result.score -= 1;
              result.reasons.push(`15m整体偏空(近6根${_bear6}阴${_bull6}阳)`);
            } else if (_bull6 >= 4) {
              result.score += 1;
              result.reasons.push(`15m整体偏多(近6根${_bull6}阳${_bear6}阴)`);
            }
          }
        }
      } catch (e15) {}

      if (result.score >= 3) result.trend = 'BULLISH';
      else if (result.score <= -3) result.trend = 'BEARISH';
      else result.trend = 'NEUTRAL';
    } catch (e) {}
    return result;
  }

  // === 技术面精确入场分析 (15min K线 + EMA通道 + RSI回踩 + Volume Surge) ===
  async analyzeTechnicalEntry(symbol) {
    const result = {
      signal: 'NONE',
      confidence: 0,
      reasons: [],
      data: {
        ema9: null, ema21: null, ema50: null,
        emaChannel: null,
        rsi14: null, rsiPullback: false, rsiRecovery: false,
        volumeSurge: false, surgeRatio: 0,
        priceAboveEma9: false,
      }
    };
    try {
      const r = await MarketDataCache.get('https://fapi.binance.com/fapi/v1/klines', {
        params: { symbol, interval: '15m', limit: 60 }, timeout: 5000
      });
      if (!Array.isArray(r.data) || r.data.length < 52) return result;
      const klines = r.data;
      const closes = klines.map(k => parseFloat(k[4]));
      const vols = klines.map(k => parseFloat(k[5]));
      const current = closes[closes.length - 1];

      function calcEMA(data, period) {
        const k = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
        return ema;
      }
      const ema9 = calcEMA(closes, 9);
      const ema21 = calcEMA(closes, 21);
      const ema50 = calcEMA(closes, 50);
      result.data.ema9 = +ema9.toFixed(8);
      result.data.ema21 = +ema21.toFixed(8);
      result.data.ema50 = +ema50.toFixed(8);

      if (ema9 > ema21 && ema21 > ema50) result.data.emaChannel = 'BULL_CHANNEL';
      else if (ema9 < ema21 && ema21 < ema50) result.data.emaChannel = 'BEAR_CHANNEL';
      else if (ema21 > ema50) result.data.emaChannel = 'BULL_WEAK';
      else if (ema21 < ema50) result.data.emaChannel = 'BEAR_WEAK';
      else result.data.emaChannel = 'SIDEWAYS';
      result.data.priceAboveEma9 = current > ema9;

      if (closes.length >= 15) {
        let gains = 0, losses = 0;
        for (let i = closes.length - 14; i < closes.length; i++) {
          const diff = closes[i] - closes[i - 1];
          if (diff > 0) gains += diff; else losses -= diff;
        }
        const rs = losses === 0 ? 100 : gains / losses;
        result.data.rsi14 = +(100 - 100 / (1 + rs)).toFixed(1);
      }

      if (closes.length >= 20) {
        const rsiHistory = [];
        for (let end = closes.length - 5; end <= closes.length; end++) {
          let g = 0, l = 0;
          for (let i = end - 14; i < end; i++) {
            const d = closes[i] - closes[i - 1];
            if (d > 0) g += d; else l -= d;
          }
          rsiHistory.push(l === 0 ? 100 : +(100 - 100 / (1 + g / l)).toFixed(1));
        }
        const maxRsi = Math.max(...rsiHistory.slice(0, 3));
        const minRsi = Math.min(...rsiHistory);
        const curRsi = rsiHistory[rsiHistory.length - 1];
        if (maxRsi > 55 && minRsi < 48 && curRsi > minRsi + 3) {
          result.data.rsiPullback = true;
          result.data.rsiPullbackDepth = +minRsi.toFixed(1);
        }
        if (curRsi > rsiHistory[rsiHistory.length - 2] && curRsi > 45) result.data.rsiRecovery = true;
      }

      // [2026-06-13] 回踩确认信号检测
      // 旧逻辑: RSI回踩+站上9EMA就入场, 17笔WR=52.9%净亏$18
      // 新逻辑: 需要额外确认信号才允许回踩入场
      // 条件(满足其一): 1.回踩MA25后收阳站上MA7  2.低点不再创新低  3.反包阳线  4.资金面转强
      if (result.data.rsiPullback && closes.length >= 25) {
        const _ma7 = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
        const _ma25 = closes.slice(-25).reduce((a, b) => a + b, 0) / 25;
        const _lastClose = closes[closes.length - 1];
        const _lastOpen = parseFloat(klines[klines.length - 1][1]);
        const _prevClose = closes[closes.length - 2];
        const _prevOpen = parseFloat(klines[klines.length - 2][1]);
        const _prevLow = parseFloat(klines[klines.length - 2][3]);
        const _lastLow = parseFloat(klines[klines.length - 1][3]);
        const _prev2Low = parseFloat(klines[klines.length - 3][3]);

        let _pullbackConfirmed = false;
        let _confirmReason = '';

        // 条件1: 回踩MA25后，最新K线收阳且重新站上MA7
        if (_lastClose > _ma7 && _lastClose > _lastOpen && _prevClose <= _ma25 * 1.01) {
          _pullbackConfirmed = true;
          _confirmReason = '回踩MA25后收阳站上MA7';
        }
        // 条件2: 低点不再创新低（最近3根低点抬升）
        else if (_lastLow > _prevLow && _prevLow >= _prev2Low) {
          _pullbackConfirmed = true;
          _confirmReason = '低点抬升不再创新低';
        }
        // 条件3: 反包阳线（当前阳线实体覆盖前一根阴线）
        else if (_lastClose > _lastOpen && _prevClose < _prevOpen
          && _lastClose > _prevOpen && _lastOpen < _prevClose) {
          _pullbackConfirmed = true;
          _confirmReason = '反包阳线';
        }

        result.data.pullbackConfirmed = _pullbackConfirmed;
        result.data.pullbackConfirmReason = _confirmReason;
        // 条件4(Taker/SM/OI转强)在GainerScanner候选池确认阶段检查(有votingResult数据)
      }

      const recentVol = (vols[vols.length - 1] + vols[vols.length - 2]) / 2;
      const avgVol20 = vols.slice(-22, -2).reduce((a, b) => a + b, 0) / 20;
      if (avgVol20 > 0) {
        result.data.surgeRatio = +(recentVol / avgVol20).toFixed(2);
        result.data.volumeSurge = result.data.surgeRatio >= 1.2;
      }
      // [2026-05-26] 放量方向: 最近2根K线是阳线还是阴线
      // 用于区分"放量下跌"(空头确认) vs "放量反弹"(底部买盘, 非空头信号)
      const opens = klines.map(k => parseFloat(k[1]));
      const recentBearish = closes[closes.length - 1] < opens[opens.length - 1]
                         && closes[closes.length - 2] < opens[opens.length - 2];
      const recentBullish = closes[closes.length - 1] > opens[opens.length - 1]
                         && closes[closes.length - 2] > opens[opens.length - 2];
      result.data.surgeBearish = result.data.volumeSurge && recentBearish;  // 放量+阴线=空头放量
      result.data.surgeBullish = result.data.volumeSurge && recentBullish;  // 放量+阳线=多头放量

      const reasons = [];
      let score = 0;
      if (result.data.emaChannel === 'BULL_CHANNEL' || result.data.emaChannel === 'BULL_WEAK') {
        score += (result.data.emaChannel === 'BULL_CHANNEL') ? 3 : 1;
        reasons.push(`EMA${result.data.emaChannel === 'BULL_CHANNEL' ? '多头通道' : '弱多'}`);
      }
      if (result.data.emaChannel === 'BEAR_CHANNEL' || result.data.emaChannel === 'BEAR_WEAK') {
        score -= (result.data.emaChannel === 'BEAR_CHANNEL') ? 3 : 1;
        reasons.push(`EMA${result.data.emaChannel === 'BEAR_CHANNEL' ? '空头通道' : '弱空'}`);
      }
      if (result.data.rsiPullback && result.data.rsiRecovery) {
        score += 2; reasons.push(`RSI回踩(${result.data.rsiPullbackDepth})后回升→${result.data.rsi14}`);
      } else if (result.data.rsi14 !== null) {
        if (result.data.rsi14 > 80) { score -= 1; reasons.push(`RSI=${result.data.rsi14}(15m超买)`); }
        else if (result.data.rsi14 < 30) { score += 1; reasons.push(`RSI=${result.data.rsi14}(15m超卖)`); }
      }
      if (result.data.priceAboveEma9 && score > 0) { score += 1; reasons.push('价格站上9EMA(右侧确认)'); }
      else if (!result.data.priceAboveEma9 && score < 0) { score -= 1; reasons.push('价格跌破9EMA'); }
      if (result.data.volumeSurge) {
        score += (score > 0 ? 2 : score < 0 ? -2 : 0);
        reasons.push(`放量${result.data.surgeRatio}x(surge)`);
      }
      if (score >= 4) { result.signal = 'LONG_ENTRY'; result.confidence = Math.min(50 + score * 8, 95); }
      else if (score <= -4) { result.signal = 'SHORT_ENTRY'; result.confidence = Math.min(50 + Math.abs(score) * 8, 95); }
      result.reasons = reasons;
      result.data.techScore = score;
    } catch (e) {}
    return result;
  }

  // === OI 多时间窗口分析 ===
  analyzeOIMultiWindow(symbol) {
    const history = this.oiHistory[symbol];
    if (!history || history.length < 12) return { signal: 'NEUTRAL', stage: 'NO_DATA', description: 'Insufficient OI history' };
    const now = Date.now();
    const latest = history[history.length - 1];
    const find = (msAgo) => {
      const target = now - msAgo;
      let closest = history[0];
      for (const h of history) { if (Math.abs(h.ts - target) < Math.abs(closest.ts - target)) closest = h; }
      if (Math.abs(closest.ts - target) > 10 * 60 * 1000) return null;
      return closest;
    };
    const oi5m = find(5 * 60 * 1000), oi1h = find(60 * 60 * 1000);
    const oi4h = find(4 * 60 * 60 * 1000), oi24h = find(24 * 60 * 60 * 1000);
    const chg5m = oi5m ? ((latest.oi - oi5m.oi) / oi5m.oi * 100) : 0;
    const chg1h = oi1h ? ((latest.oi - oi1h.oi) / oi1h.oi * 100) : 0;
    const chg4h = oi4h ? ((latest.oi - oi4h.oi) / oi4h.oi * 100) : 0;
    const chg24h = oi24h ? ((latest.oi - oi24h.oi) / oi24h.oi * 100) : 0;
    const baseline = history.reduce((s, h) => s + h.oi, 0) / history.length;
    const vsBaseline = ((latest.oi - baseline) / baseline * 100);
    const recentOIs = history.slice(-12).map(h => h.oi);
    const mean = recentOIs.reduce((a, b) => a + b, 0) / recentOIs.length;
    const stdDev = Math.sqrt(recentOIs.reduce((s, v) => s + (v - mean) ** 2, 0) / recentOIs.length);
    const zScore = stdDev > 0 ? (latest.oi - mean) / stdDev : 0;

    let signal = 'NEUTRAL', stage = 'UNKNOWN', description = '';
    if (Math.abs(chg24h) < 5 && Math.abs(vsBaseline) < 10 && chg1h > 0 && chg1h < 3) {
      stage = 'ACCUMULATION'; signal = 'EARLY_LONG';
      description = `OI quiet (24h=${chg24h.toFixed(1)}%) but slowly rising (1h=${chg1h.toFixed(1)}%)`;
    } else if (zScore > 2 && Math.abs(chg24h) < 10) {
      stage = 'CONTRACT_START'; signal = 'ALERT';
      description = `OI spike detected! z=${zScore.toFixed(1)} 5m=${chg5m.toFixed(1)}%`;
    } else if (chg1h > 3 && chg4h > 5) {
      stage = 'BUILDING'; signal = 'LONG';
      description = `OI building: 1h=${chg1h.toFixed(1)}% 4h=${chg4h.toFixed(1)}%`;
    } else if (chg24h > 20 && chg1h < 2) {
      stage = 'LATE'; signal = 'CAUTION';
      description = `OI overextended: 24h=${chg24h.toFixed(1)}% but 1h slowing`;
    } else if (chg1h < -3 && chg4h < -5) {
      stage = 'UNWINDING'; signal = 'SHORT';
      description = `OI unwinding: 1h=${chg1h.toFixed(1)}% 4h=${chg4h.toFixed(1)}%`;
    } else {
      stage = 'FLAT';
      description = `OI flat: 1h=${chg1h.toFixed(1)}% 24h=${chg24h.toFixed(1)}%`;
    }
    return {
      signal, stage, description,
      chg5m: +chg5m.toFixed(2), chg1h: +chg1h.toFixed(2),
      chg4h: +chg4h.toFixed(2), chg24h: +chg24h.toFixed(2),
      vsBaseline: +vsBaseline.toFixed(2), zScore: +zScore.toFixed(2),
      dataPoints: history.length,
    };
  }

  // 从存储加载权重到内存
  async loadWeights() {
    try {
      this.weights = await this.storage.loadWeights();
    } catch (e) {
      console.error(`[LearningEngine] loadWeights error:`, e.message);
      this.weights = {};
    }
  }

  // VotingSystem 调用：获取维度权重
  // [2026-08-18] 结构性维度最低保护: weight不得低于1
  // 根因: K线/EMA/价格位置 等趋势维度因"方向被信号维度覆盖后仍赢" → 被标记错误 → accuracy<50% → weight=0
  // 这是计算逻辑的结构性偏差, 不代表这些维度真的无效
  // 信号维度(RSI/OI/SM等)允许学到0, 趋势/结构维度必须保留至少1的话语权
  static STRUCTURAL_DIMS = new Set(['K线','EMA','价格位置','BTC','做多空间','做空空间','波动率']);

  getDimWeight(dim) {
    if (!this.weights[dim]) return 1;
    const learned = this.weights[dim].weight;
    // 结构性维度: 即使学习引擎认为无效也保留最低权重1
    if (LearningEngine.STRUCTURAL_DIMS.has(dim) && learned < 1) return 1;
    return learned;
  }

  // 获取全部权重（API展示用）
  getAllWeights() {
    return Object.entries(this.weights).map(([dim, info]) => ({
      dimension: dim,
      weight: info.weight,
      accuracy: info.accuracy,
      sampleCount: info.sampleCount
    }));
  }

  /**
   * 记录一笔交易的学习数据
   * @param {Object} trade - 已平仓交易
   * @param {Array} entryVotes - 入场时的投票记录 [{dim, score, reason}]
   * @param {boolean} isWin - 是否盈利
   */
  async recordTradeLesson(trade, entryVotes, isWin) {
    const ed = trade.entry_data || {};
    const lesson = {
      tradeId: trade.id,
      symbol: trade.symbol,
      direction: trade.direction,
      entryVotes: entryVotes || [],
      isWin,
      pnlPct: trade.total_pnl_pct || 0,
      exitReason: trade.exit_reason,
      entrySource: trade.entry_source,
      durationMin: trade.duration_min,
      timestamp: Date.now(),
      // 市场环境上下文
      context: {
        btcTrend: ed.btcTrend || null,
        btcRegime: ed.btcRegime || null,
        priceVsMa20: ed.priceVsMa20 || null,
        candle1hChange: ed.candle1hChange || null,
        rsi: ed.rsi || null,
        klineTrend: ed.klineTrend || (ed.klineData?.trend) || null,
        positionInRange: ed.klineData?.positionInRange || ed.klineData?.data?.positionInRange || null,
      },
      // HL 专家行为信号（BEHAVIORAL 仓位有）
      behavioral: ed.behavioral_signal ? {
        state: ed.behavioral_signal.state,
        delta: ed.behavioral_signal.confidence_delta,
        aligned_wr: ed.behavioral_signal.aligned_rules?.[0]?.wr || null,
        aligned_entries: ed.behavioral_signal.aligned_rules?.[0]?.entries || null,
        ma_position: ed.behavioral_signal.context?.ma_position || null,
        momentum: ed.behavioral_signal.context?.momentum || null,
      } : null,
    };

    this.lessonBuffer.push(lesson);

    // 写入存储
    try {
      await this.storage.set('trade_lesson', trade.id, lesson);
    } catch (e) {
      console.error(`[LearningEngine] recordTradeLesson error:`, e.message);
    }

    // 记录维度准确率（增量更新）
    for (const vote of (entryVotes || [])) {
      await this._updateDimAccuracy(vote.dim, vote.score, trade.direction, isWin);
    }

    // [2026-05-27] dimOutcomes: 记录每个维度的实际结果
    await this._recordDimOutcomes(trade);

    // 每5笔触发一次权重调整
    if (this.lessonBuffer.length >= 5) {
      await this.autoAdjustRules();
      this.lessonBuffer = [];
    }
  }

  // [2026-05-27] dimOutcomes学习系统: 从平仓结果学习每个维度的真实预测力
  // 数据来源: 入场时的entry_data(快照) → 平仓时的实际结果(涨跌)

  async _loadDimOutcomes() {
    try {
      console.log(`[LearningEngine] _loadDimOutcomes: env=${this.env} strategy=${this.strategy}`);
      const data = await this.storage.get('dim_outcomes', 'all');
      if (data) {
        this.dimOutcomes = data;
        console.log(`[LearningEngine] dimOutcomes loaded: ${Object.keys(this.dimOutcomes).length} dims, gls_chasing=${this.dimOutcomes.gls_chasing?.count||0}`);
      }
    } catch (e) {
      console.error(`[LearningEngine] _loadDimOutcomes error:`, e.message);
    }
  }

  async _saveDimOutcomes() {
    try {
      await this.storage.set('dim_outcomes', 'all', this.dimOutcomes);
    } catch (e) {}
  }

  // [2026-07-16] Market Memory: 历史形态匹配
  async _loadMarketMemory() {
    try {
      const data = await this.storage.get('market_memory', 'all');
      if (data) {
        this.marketMemory = data;
        const fk = this.marketMemory?.byFullKey ? Object.keys(this.marketMemory.byFullKey).length : 0;
        const ms = this.marketMemory?.byMarketStructure ? Object.keys(this.marketMemory.byMarketStructure).length : 0;
        console.log(`[LearningEngine] marketMemory loaded: ${fk} fullKeys, ${ms} structures`);
      }
    } catch (e) {}
  }

  async _saveMarketMemory() {
    try {
      await this.storage.set('market_memory', 'all', this.marketMemory || {});
    } catch (e) {}
  }

  // 平仓时记录形态到Market Memory
  async recordMarketMemory(trade) {
    try {
      const ed = trade.entry_data || {};
      // 兼容SIGNAL和PROACTIVE两种entry_data格式
      const kd = ed.klineData?.data || ed.klineData || {};
      const isWin = (trade.total_pnl_pct || 0) > 0;
      const btcTrend = ed.btcTrend || 'UNKNOWN';
      const posR = kd.positionInRange ?? 0.5;
      const _taker = ed.takerRatio || ed.taker || 1;
      const _sm = ed.smHolders ?? ed.sm ?? 0;
      const _bs = ed.buySellRatio || ed.bs || 1;
      const structure = [
        kd.trend || ed.klineTrend || 'UNKNOWN',
        posR > 0.8 ? 'HIGH' : posR > 0.5 ? 'MID' : posR > 0.2 ? 'LOW' : 'BOTTOM',
        (kd.volRatio||1) > 1.5 ? 'VOL_HIGH' : (kd.volRatio||1) > 0.7 ? 'VOL_NORM' : 'VOL_LOW',
        (ed.rsi||50) > 75 ? 'RSI_OB' : (ed.rsi||50) > 55 ? 'RSI_MID' : (ed.rsi||50) > 35 ? 'RSI_LOW' : 'RSI_OS',
      ].join('_');
      const onchain = [
        _taker > 1.1 ? 'TK_BUY' : _taker < 0.9 ? 'TK_SELL' : 'TK_FLAT',
        _sm >= 10 ? 'SM_HIGH' : _sm >= 3 ? 'SM_MID' : 'SM_LOW',
        _bs > 1.3 ? 'BS_BUY' : _bs < 0.7 ? 'BS_SELL' : 'BS_FLAT',
        (ed.fr||0) < -0.0003 ? 'FR_NEG' : (ed.fr||0) > 0.0005 ? 'FR_POS' : 'FR_FLAT',
      ].join('_');
      const dir = trade.direction || 'LONG';
      const posLabel = posR > 0.8 ? 'HIGH' : posR > 0.5 ? 'MID' : posR > 0.2 ? 'LOW' : 'BOTTOM';
      const tkLabel = _taker > 1.1 ? 'TK_BUY' : _taker < 0.9 ? 'TK_SELL' : 'TK_FLAT';
      const smLabel = _sm >= 10 ? 'SM_HIGH' : _sm >= 3 ? 'SM_MID' : 'SM_LOW';

      // L1: 8维精确key
      const fullKey = `${dir}|${btcTrend}|${structure}|${onchain}`;
      // L2: 3维核心key (BTC+位置+Taker) — 48种组合, 每个模式累积更多样本
      const coreKey = `${dir}|${btcTrend}|${posLabel}|${tkLabel}`;
      // L3: 2维环境key (BTC+位置)
      const envKey = `${dir}|${btcTrend}|${posLabel}`;

      if (!this.marketMemory) this.marketMemory = { byFullKey: {}, byMarketStructure: {}, byCore: {}, byEnv: {} };
      if (!this.marketMemory.byFullKey) this.marketMemory.byFullKey = {};
      if (!this.marketMemory.byCore) this.marketMemory.byCore = {};
      if (!this.marketMemory.byEnv) this.marketMemory.byEnv = {};

      // L1 byFullKey
      if (!this.marketMemory.byFullKey[fullKey]) this.marketMemory.byFullKey[fullKey] = { wins: 0, count: 0 };
      this.marketMemory.byFullKey[fullKey].count++;
      if (isWin) this.marketMemory.byFullKey[fullKey].wins++;

      // L2 byCore
      if (!this.marketMemory.byCore[coreKey]) this.marketMemory.byCore[coreKey] = { wins: 0, count: 0 };
      this.marketMemory.byCore[coreKey].count++;
      if (isWin) this.marketMemory.byCore[coreKey].wins++;

      // L3 byEnv
      if (!this.marketMemory.byEnv[envKey]) this.marketMemory.byEnv[envKey] = { wins: 0, count: 0 };
      this.marketMemory.byEnv[envKey].count++;
      if (isWin) this.marketMemory.byEnv[envKey].wins++;

      // 每10笔保存一次
      if (!this._mmSaveCounter) this._mmSaveCounter = 0;
      this._mmSaveCounter++;
      if (this._mmSaveCounter >= 10) {
        await this._saveMarketMemory();
        this._mmSaveCounter = 0;
      }
    } catch (e) {
      console.error(`[LearningEngine] recordMarketMemory error:`, e.message);
    }
  }

  async _recordDimOutcomes(trade) {
    try {
      const ed = trade.entry_data || {};
      const pnlPct = parseFloat(trade.total_pnl_pct || 0);
      const isWin = pnlPct > 0;

      // 结果分类: 根据价格变化幅度
      const priceChange = Math.abs(pnlPct);
      let outcomeKey;
      if (isWin) {
        outcomeKey = priceChange > 5 ? 'KEPT_RISING' : 'FLAT';
      } else {
        outcomeKey = priceChange > 5 ? (trade.direction === 'LONG' ? 'DUMPED' : 'BOUNCED') : 'FLAT';
      }
      // LONG亏 → DUMPED/KEPT_FALLING, SHORT亏 → BOUNCED/KEPT_FALLING
      if (!isWin && priceChange > 5) {
        outcomeKey = trade.direction === 'LONG' ? 'DUMPED' : 'BOUNCED';
      } else if (!isWin && priceChange <= 5) {
        outcomeKey = 'FLAT';
      } else if (isWin && priceChange > 5) {
        outcomeKey = trade.direction === 'LONG' ? 'KEPT_RISING' : 'KEPT_FALLING';
      }

      const _record = (dimName, direction) => {
        const dk = `${dimName}_${direction}`;
        if (!this.dimOutcomes[dk]) {
          this.dimOutcomes[dk] = { KEPT_RISING: 0, FLAT: 0, DUMPED: 0, KEPT_FALLING: 0, BOUNCED: 0, totalChange: 0, count: 0 };
        }
        this.dimOutcomes[dk][outcomeKey]++;
        this.dimOutcomes[dk].totalChange += pnlPct;
        this.dimOutcomes[dk].count++;
      };

      // Taker
      const taker = ed.takerRatio || ed.taker;
      if (taker != null) {
        if (taker < 0.95) _record('taker_init', 'selling');
        else if (taker > 1.05) _record('taker_init', 'buying');
        else _record('taker_init', 'neutral');
      }

      // BS
      const bs = ed.buySellRatio || ed.bs;
      if (bs != null) {
        if (bs < 0.9) _record('bs', 'sell');
        else if (bs > 1.1) _record('bs', 'buy');
        else _record('bs', 'stable');
      }

      // SM
      const sm = ed.smHolders || ed.sm;
      if (sm != null) {
        if (sm <= 0) _record('sm', 'exit');
        else if (sm >= 5) _record('sm', 'increase');
        else _record('sm', 'unchanged');
      }

      // 大户 tLS
      const tLS = ed.tLS || (ed.votes?.find(v => v.dim === '大户')?.reason?.match(/tLS=([\d.]+)/)?.[1]);
      if (tLS != null) {
        const tLSVal = parseFloat(tLS);
        if (tLSVal > 1.3) _record('topLS_init', 'crowded');
        else if (tLSVal < 0.9) _record('topLS_init', 'bearish');
        else _record('topLS_init', 'normal');
      }

      // 散户 gLS
      const gLS = ed.gLS || (ed.votes?.find(v => v.dim === '散户')?.reason?.match(/gLS=([\d.]+)/)?.[1]);
      if (gLS != null) {
        const gLSVal = parseFloat(gLS);
        if (gLSVal > 1.3) _record('gls', 'chasing');
        else if (gLSVal < 0.8) _record('gls', 'retreating');
        else _record('gls', 'stable');
      }

      // OI
      const oiStage = ed.oiStage;
      if (oiStage === 'ACCUMULATION' || oiStage === 'BUILDING') _record('oi', 'surge');
      else if (oiStage === 'UNWINDING' || oiStage === 'LATE') _record('oi', 'drop');
      else _record('oi', 'stable');

      // BTC
      const btc = ed.btcTrend;
      if (btc === 'BULL') _record('btc', 'bull');
      else if (btc === 'BEAR' || btc === 'CRASH') _record('btc', 'bear');
      else _record('btc', 'neutral');

      await this._saveDimOutcomes();
    } catch (e) {}
  }

  // 获取dimOutcomes计算的维度权重
  getDimOutcomeWeight(voteDim) {
    const dimNameMap = {
      'Taker': 'taker_init', 'Taker变化': 'taker', 'Taker趋势': 'taker',
      'BS': 'bs', 'BS变化': 'bs',
      'SM': 'sm', 'SM变化': 'sm',
      '大户': 'topLS_init', '大户变化': 'topLS', '大户趋势': 'topLS',
      '散户': 'gls', '散户变化': 'gls',
      'OI': 'oi', 'OIstg': 'oi', 'OI变化': 'oi',
      'BTC': 'btc',
    };
    const dimBase = dimNameMap[voteDim];
    if (!dimBase) return null;

    const badDirs = { taker_init: 'selling', taker: 'weaken', bs: 'sell', sm: 'exit', topLS_init: 'crowded', topLS: 'add', gls: 'chasing', oi: 'surge', btc: 'bear' };
    const goodDirs = { taker_init: 'buying', taker: 'strengthen', bs: 'buy', sm: 'increase', topLS_init: 'normal', topLS: 'reduce', gls: 'retreating', oi: 'drop', btc: 'bull' };

    const badKey = `${dimBase}_${badDirs[dimBase]}`;
    const goodKey = `${dimBase}_${goodDirs[dimBase]}`;
    const badSignal = this.dimOutcomes[badKey];
    const goodSignal = this.dimOutcomes[goodKey];

    if (!badSignal && !goodSignal) return null;
    const badCount = badSignal?.count || 0;
    const goodCount = goodSignal?.count || 0;
    if (badCount + goodCount < 10) return null; // 样本不够

    const badDumpRate = badSignal ? ((badSignal.DUMPED || 0) + (badSignal.KEPT_FALLING || 0)) / (badSignal.count || 1) : 0;
    const goodRiseRate = goodSignal ? ((goodSignal.KEPT_RISING || 0) + (goodSignal.BOUNCED || 0)) / (goodSignal.count || 1) : 0;
    const predictPower = (badDumpRate + goodRiseRate) / 2;

    if (predictPower >= 0.30) return 2;
    if (predictPower >= 0.15) return 1;
    if (predictPower >= 0.08) return 1;
    return 0;
  }

  // 增量更新单个维度的准确率
  async _updateDimAccuracy(dim, voteScore, direction, isWin) {
    // 判断该维度投票是否正确:
    // vote > 0 且 direction=LONG 且 win => 正确
    // vote < 0 且 direction=SHORT 且 win => 正确
    // 反之为错误
    const voteDirection = voteScore > 0 ? 'LONG' : 'SHORT';
    const isCorrect = (voteDirection === direction && isWin) || (voteDirection !== direction && !isWin);

    try {
      const key = `dim_accuracy_${dim}`;
      let stats = await this.storage.get('dim_accuracy', key) || { correct: 0, total: 0 };
      stats.total++;
      if (isCorrect) stats.correct++;
      await this.storage.set('dim_accuracy', key, stats);
    } catch (e) {
      // non-critical
    }
  }

  /**
   * [2026-07-31] 自动调整权重 — 从paper_trade_history全量计算
   * 只用当前strategy的数据(stable学stable, aggressive学aggressive)
   * 两套策略投票维度含义不同，混合学习会稀释准确率
   */
  async autoAdjustRules() {
    try {
      // [2026-08-01] 性能防护: 近期表现优秀时冻结权重，避免破坏正在运作良好的系统
      // 检查最近3天的交易表现
      const recentPerf = await DatabaseService.query(
        `SELECT total_pnl_pct FROM paper_trade_history
         WHERE env = 'mainnet' AND strategy = ? AND total_pnl_pct IS NOT NULL
           AND closed_at > DATE_SUB(NOW(), INTERVAL 3 DAY)`,
        [this.strategy]
      );
      if (recentPerf.length >= 10) {
        const wins = recentPerf.filter(r => parseFloat(r.total_pnl_pct) > 0).length;
        const winRate = wins / recentPerf.length;
        const totalPnl = recentPerf.reduce((s, r) => s + parseFloat(r.total_pnl_pct), 0);
        const avgPnl = totalPnl / recentPerf.length;
        // 胜率>=65% 且 平均盈亏>0.5% → 冻结权重，观察
        if (winRate >= 0.65 && avgPnl > 0.5) {
          console.log(`[LearningEngine][${this.env}] 🔒 性能防护: 近3天胜率=${(winRate*100).toFixed(1)}% avgPnL=${avgPnl.toFixed(2)}% (n=${recentPerf.length}), 冻结权重调整`);
          return;
        }
        console.log(`[LearningEngine][${this.env}] 📊 近3天表现: 胜率=${(winRate*100).toFixed(1)}% avgPnL=${avgPnl.toFixed(2)}% (n=${recentPerf.length}), 允许调整`);
      }

      // 只读当前strategy的最近30天交易
      const rows = await DatabaseService.query(
        `SELECT entry_data, direction, total_pnl_pct FROM paper_trade_history
         WHERE env = 'mainnet' AND strategy = ? AND entry_data IS NOT NULL AND total_pnl_pct IS NOT NULL
           AND closed_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
           AND JSON_EXTRACT(entry_data, '$.votes') IS NOT NULL`,
        [this.strategy]
      );

      if (rows.length < 50) {
        console.log(`[LearningEngine] autoAdjustRules: only ${rows.length} trades with votes, skip`);
        return;
      }

      // 按维度统计准确率
      const dimStats = {};
      for (const row of rows) {
        const ed = LearningEngine._parseData(row.entry_data);
        if (!ed?.votes || !Array.isArray(ed.votes)) continue;
        const isWin = parseFloat(row.total_pnl_pct) > 0;
        const direction = row.direction;

        for (const vote of ed.votes) {
          if (!vote.dim || vote.score === 0) continue;
          if (!dimStats[vote.dim]) dimStats[vote.dim] = { correct: 0, total: 0 };
          dimStats[vote.dim].total++;
          const voteDir = vote.score > 0 ? 'LONG' : 'SHORT';
          const isCorrect = (voteDir === direction && isWin) || (voteDir !== direction && !isWin);
          if (isCorrect) dimStats[vote.dim].correct++;
        }
      }

      // 更新权重
      let updated = 0;
      for (const [dim, stats] of Object.entries(dimStats)) {
        if (stats.total < 10) continue;
        const accuracy = (stats.correct / stats.total) * 100;
        let newWeight;
        if (accuracy >= 60) newWeight = 2;
        else if (accuracy >= 52) newWeight = 1;
        // [2026-08-10] 修复: accuracy<45%不再设weight=-1(反转)
        // 反转会把正确的看空信号变成看多加分, 导致垃圾信号通过门槛
        // 实测: CYS原始score=-3, 反转后变+8放行→亏$590
        // accuracy<50%说明维度不可靠, 应该忽略(weight=0), 而不是反转
        else newWeight = 0;

        await this.storage.saveWeight(dim, newWeight, parseFloat(accuracy.toFixed(2)), stats.total);

        const oldWeight = this.weights[dim]?.weight;
        this.weights[dim] = { weight: newWeight, accuracy, sampleCount: stats.total };
        if (oldWeight !== undefined && oldWeight !== newWeight) {
          console.log(`[LearningEngine][${this.env}] ⚡ ${dim} weight: ${oldWeight}→${newWeight} (acc=${accuracy.toFixed(1)}% n=${stats.total})`);
        }
        updated++;
      }

      console.log(`[LearningEngine][${this.env}] Weights adjusted from ${rows.length} trades (agg+stable): ${updated} dims`);
    } catch (e) {
      console.error(`[LearningEngine] autoAdjustRules error:`, e.message);
    }
  }

  /**
   * 记录入场来源表现（PROACTIVE vs SIGNAL）
   */
  async recordSourcePerformance(source, isWin, pnl) {
    try {
      const key = `source_${source}`;
      let stats = await this.storage.get('source_perf', key) || { wins: 0, losses: 0, totalPnl: 0 };
      if (isWin) stats.wins++;
      else stats.losses++;
      stats.totalPnl += pnl;
      await this.storage.set('source_perf', key, stats);
    } catch (e) { /* non-critical */ }
  }

  /**
   * 记录模式表现
   */
  async recordPatternPerformance(pattern, isWin, pnl) {
    if (!pattern) return;
    try {
      const key = `pattern_${pattern}`;
      let stats = await this.storage.get('pattern_perf', key) || { wins: 0, losses: 0, totalPnl: 0 };
      if (isWin) stats.wins++;
      else stats.losses++;
      stats.totalPnl += pnl;
      await this.storage.set('pattern_perf', key, stats);
    } catch (e) { /* non-critical */ }
  }

  /**
   * [2026-07-30] 查询模式胜率 — 开仓前调用
   * @param {string} pattern - 模式key如 "rsiHi_tkBuy_NEUTRAL"
   * @returns { action: 'boost'|'penalize'|'block'|null, score, winRate, samples, reason }
   */
  async getPatternDecision(pattern) {
    if (!pattern || pattern === 'unknown') return null;
    try {
      const key = `pattern_${pattern}`;
      const stats = await this.storage.get('pattern_perf', key);
      if (!stats) return null;
      const total = (stats.wins || 0) + (stats.losses || 0);
      if (total < 6) return null; // 样本不够
      const wr = stats.wins / total;
      const avgPnl = stats.totalPnl / total;
      if (wr >= 0.75) return { action: 'boost', score: 2, winRate: wr, samples: total, reason: `模式${pattern} WR=${(wr*100).toFixed(0)}%(${total}笔,+$${stats.totalPnl.toFixed(0)})` };
      if (wr >= 0.65 && total >= 10) return { action: 'boost', score: 1, winRate: wr, samples: total, reason: `模式${pattern} WR=${(wr*100).toFixed(0)}%(${total}笔)` };
      if (wr <= 0.35 && total >= 8) return { action: 'block', score: -3, winRate: wr, samples: total, reason: `模式${pattern} WR=${(wr*100).toFixed(0)}%(${total}笔,亏$${Math.abs(stats.totalPnl).toFixed(0)})` };
      if (wr <= 0.45 && avgPnl < -10) return { action: 'penalize', score: -2, winRate: wr, samples: total, reason: `模式${pattern} WR=${(wr*100).toFixed(0)}%+亏损(${total}笔)` };
      return null;
    } catch (e) { return null; }
  }

  /**
   * 记录频繁涨幅token
   */
  async recordFrequentGainer(symbol, change) {
    try {
      const key = symbol;
      let stats = await this.storage.get('frequent_gainer', key) || { count: 0, totalChange: 0, dailyHistory: [] };

      stats.count++;
      stats.totalChange += change;

      const today = new Date().toISOString().slice(0, 10);
      const todayEntry = stats.dailyHistory.find(d => d.date === today);
      if (todayEntry) {
        todayEntry.count++;
        todayEntry.maxChange = Math.max(todayEntry.maxChange, change);
        todayEntry.lastChange = change;
      } else {
        stats.dailyHistory.push({ date: today, count: 1, maxChange: change, lastChange: change });
        // 保留最近30天
        if (stats.dailyHistory.length > 30) stats.dailyHistory = stats.dailyHistory.slice(-30);
      }

      await this.storage.set('frequent_gainer', key, stats);
    } catch (e) { /* non-critical */ }
  }

  /**
   * 获取频繁涨幅token列表（GainerScanner用）
   */
  async getFrequentGainers(minCount = 10) {
    try {
      const items = await this.storage.list('frequent_gainer');
      const result = {};
      for (const item of items) {
        if (item.data && item.data.count >= minCount) {
          result[item.key] = item.data;
        }
      }
      return result;
    } catch (e) {
      return {};
    }
  }

  /**
   * 获取学习数据摘要（API展示用）
   */
  async getLearningStats() {
    try {
      const [weights, sources, patterns, gainers] = await Promise.all([
        this.getAllWeights(),
        this.storage.list('source_perf'),
        this.storage.list('pattern_perf', { limit: 20 }),
        this.storage.list('frequent_gainer', { limit: 30 }),
      ]);

      return {
        weights,
        sources: sources.map(r => ({ source: r.key.replace('source_', ''), ...(r.data || {}) })),
        topPatterns: patterns.map(r => ({ pattern: r.key.replace('pattern_', ''), ...(r.data || {}) })),
        topGainers: gainers.map(r => ({ symbol: r.key, ...(r.data || {}) }))
          .sort((a, b) => b.count - a.count).slice(0, 20),
      };
    } catch (e) {
      return { weights: [], sources: [], topPatterns: [], topGainers: [] };
    }
  }
  // [2026-05-12] 历史交易经验维度: 查该token近48h交易记录参与投票
  // [2026-09-05] Sibyl模式: 用 search() 直接按symbol召回，比list+filter快且更精准
  async getTokenHistoryVotes(symbol, direction, entryData) {
    const votes = [];
    const fsym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
    const baseSymbol = symbol.replace('USDT', '');
    try {
      const now = Date.now();
      let tokenLessons = [];

      if (this.storage.type === 'sibyl' && typeof this.storage.search === 'function') {
        // Sibyl: 全文搜索 symbol → 直接召回相关记忆，无需遍历全量数据
        const recalled = this.storage.search(baseSymbol, 'trade_lesson', 10);
        for (const item of recalled) {
          const l = item.data;
          if (l && l.timestamp && (now - l.timestamp < 48 * 60 * 60 * 1000)) {
            tokenLessons.push(l);
          }
        }
        if (tokenLessons.length > 0) {
          console.log(`  🔮 [MemoryRecall] ${baseSymbol}: Sibyl召回${tokenLessons.length}条历史记忆`);
        }

        // Base链预测市场结算数据：从 Sibyl 召回社区预测结果
        try {
          const fullSym = baseSymbol.endsWith('USDT') ? baseSymbol : baseSymbol + 'USDT';
          let predictions = this.storage.search(fullSym, 'prediction_outcome', 5);
          if (predictions.length === 0) predictions = this.storage.search(baseSymbol, 'prediction_outcome', 5);
          for (const item of predictions) {
            const p = item.data;
            if (!p || !p.participants || p.participants < 3) continue;
            const wr = p.communityWinRate || 0;
            if (wr > 0.65) {
              votes.push({ dim: 'Community Prediction', score: 1, reason: `${baseSymbol} community WR ${(wr * 100).toFixed(0)}% (${p.participants} bettors, Base chain)` });
            } else if (wr < 0.3) {
              votes.push({ dim: 'Community Prediction', score: -1, reason: `${baseSymbol} community WR low ${(wr * 100).toFixed(0)}% (${p.participants} bettors, Base chain)` });
            }
          }
        } catch (e) { /* non-blocking */ }
      } else {
        // MySQL: 列表+过滤
        const lessons = await this.storage.list('trade_lesson', { limit: 100 });
        for (const item of lessons) {
          const l = item.data;
          if (l && (l.symbol === symbol || l.symbol === fsym) && l.timestamp && (now - l.timestamp < 48 * 60 * 60 * 1000)) {
            tokenLessons.push(l);
          }
        }
      }
      if (tokenLessons.length === 0) return votes;

      // 1. 近24h有入场即亏 → -2
      const instantSL = tokenLessons.filter(l => !l.isWin && l.exitReason === 'STOP_LOSS' && (l.pnlPct || 0) < -5 && (now - l.timestamp < 24 * 60 * 60 * 1000));
      if (instantSL.length > 0) {
        votes.push({ dim: '历史闪崩', score: -2, reason: `${symbol}近24h有${instantSL.length}次入场即亏` });
      }

      // 2. 近48h胜率统计
      const wins = tokenLessons.filter(l => l.isWin).length;
      const losses = tokenLessons.filter(l => !l.isWin).length;
      if (wins + losses >= 3) {
        const wr = wins / (wins + losses);
        if (wr < 0.3) votes.push({ dim: '历史胜率', score: -2, reason: `${symbol}近48h WR=${(wr * 100).toFixed(0)}%(${wins}/${wins + losses})` });
        else if (wr >= 0.7) votes.push({ dim: '历史胜率', score: 1, reason: `${symbol}近48h WR=${(wr * 100).toFixed(0)}%(${wins}/${wins + losses})` });
      }

      // 3. 同方向反复亏损>=2次
      const sameDirLosses = tokenLessons.filter(l => !l.isWin && l.direction === direction);
      if (sameDirLosses.length >= 2) {
        votes.push({ dim: '历史同向', score: -1, reason: `${symbol}近48h同方向(${direction})亏${sameDirLosses.length}次` });
      }
    } catch (e) {}
    return votes;
  }

  // [2026-05-12] 非Alpha token通过search/ai API获取合约地址
  async searchTokenContract(symbol) {
    const baseSymbol = symbol.replace('USDT', '').toUpperCase();
    if (!this._searchCache) this._searchCache = {};
    if (this._searchCache[baseSymbol] !== undefined) return this._searchCache[baseSymbol];
    try {
      const r = await MarketDataCache.get('https://web3.binance.com/bapi/defi/v5/public/wallet-direct/buw/wallet/market/token/search/ai', {
        params: { keyword: baseSymbol }, timeout: 8000
      });
      if (r.data?.data?.length > 0) {
        // 精确匹配: symbol 必须完全等于搜索关键词（不区分大小写）
        const exact = r.data.data.find(t => t.symbol?.toUpperCase() === baseSymbol && t.contractAddress);
        if (exact) {
          const info = { contractAddress: exact.contractAddress, chainId: String(exact.chainId || '56') };
          this._searchCache[baseSymbol] = info;
          return info;
        }
      }
    } catch (e) {}
    this._searchCache[baseSymbol] = null;
    return null;
  }

  // ============================================================
  // [2026-06-07] Combo组合学习系统
  // 替代硬编码的_checkComboRules, 按BTC环境分别统计组合胜率
  // key: "{direction}_{rsiZone}_{tkZone}_{smZone}" e.g. "LONG_Lo_Buy_smNo"
  // 每个key下按btcEnv分: { BEAR: {wins,losses,totalPnl}, BULL: {...}, NEUTRAL: {...} }
  // ============================================================

  async _loadComboStats() {
    try {
      const data = await this.storage.get('combo_stats', 'all');
      if (data) {
        this.comboStats = data;
        const totalKeys = Object.keys(this.comboStats).length;
        let totalSamples = 0;
        for (const v of Object.values(this.comboStats)) {
          for (const env of Object.values(v)) totalSamples += (env.wins || 0) + (env.losses || 0);
        }
        console.log(`[LearningEngine] comboStats loaded: ${totalKeys} patterns, ${totalSamples} samples`);
      }
    } catch (e) {}
  }

  async _saveComboStats() {
    try {
      await this.storage.set('combo_stats', 'all', this.comboStats);
    } catch (e) {}
  }

  /**
   * 生成combo pattern key
   */
  _comboKey(direction, rsi, taker, sm) {
    const rsiZone = rsi < 45 ? 'Lo' : rsi > 75 ? 'Hi' : 'Mid';
    const tkZone = taker !== null ? (taker > 1.05 ? 'Buy' : taker < 0.85 ? 'Sell' : 'Flat') : 'Flat';
    const smZone = (sm !== null && sm >= 5) ? 'smLarge' : (sm !== null && sm >= 1) ? 'smYes' : 'smNo';
    return `${direction}_${rsiZone}_${tkZone}_${smZone}`;
  }

  _btcEnvKey(btcTrend) {
    if (btcTrend === 'BEAR' || btcTrend === 'CRASH') return 'BEAR';
    if (btcTrend === 'BULL') return 'BULL';
    return 'NEUTRAL';
  }

  /**
   * 记录combo结果 — 平仓时调用
   * @param {Object} trade - 已平仓交易 (需要 entry_data, direction, total_pnl)
   */
  async recordComboOutcome(trade) {
    try {
      const ed = trade.entry_data || {};
      const rsi = ed.rsi || 50;
      const taker = ed.takerRatio || ed.taker;
      const sm = ed.smHolders || ed.sm;
      const btcTrend = ed.btcTrend || 'NEUTRAL';
      const direction = trade.direction;
      const isWin = parseFloat(trade.total_pnl || 0) > 0;
      const pnl = parseFloat(trade.total_pnl || 0);

      const key = this._comboKey(direction, rsi, taker, sm);
      const env = this._btcEnvKey(btcTrend);

      if (!this.comboStats[key]) this.comboStats[key] = {};
      if (!this.comboStats[key][env]) this.comboStats[key][env] = { wins: 0, losses: 0, totalPnl: 0 };

      const s = this.comboStats[key][env];
      if (isWin) s.wins++;
      else s.losses++;
      s.totalPnl += pnl;

      await this._saveComboStats();
    } catch (e) {}
  }

  /**
   * 获取combo决策 — 替代硬编码的_checkComboRules
   * @returns { action: 'block'|'penalize'|'neutral'|'boost', scoreAdj, reason, winRate, sampleSize }
   */
  getComboDecision(direction, rsi, taker, sm, btcTrend) {
    const key = this._comboKey(direction, rsi, taker, sm);
    const env = this._btcEnvKey(btcTrend);

    // 1. 先查当前BTC环境的统计
    const envStats = this.comboStats[key]?.[env];
    // 2. 再查全环境汇总
    let allWins = 0, allLosses = 0;
    if (this.comboStats[key]) {
      for (const e of Object.values(this.comboStats[key])) {
        allWins += e.wins || 0;
        allLosses += e.losses || 0;
      }
    }

    const envTotal = envStats ? (envStats.wins + envStats.losses) : 0;
    const allTotal = allWins + allLosses;

    // 样本不足(<5): 返回null, 让调用方用fallback
    if (envTotal < 3 && allTotal < 5) {
      return null; // 数据不足, 用fallback默认规则
    }

    // 优先用当前环境数据(>=3样本), 否则用全环境
    let winRate, sampleSize, useEnv;
    if (envTotal >= 3) {
      winRate = envStats.wins / envTotal;
      sampleSize = envTotal;
      useEnv = env;
    } else {
      winRate = allTotal > 0 ? allWins / allTotal : 0.5;
      sampleSize = allTotal;
      useEnv = 'ALL';
    }

    const rsiZone = rsi < 45 ? 'Lo' : rsi > 75 ? 'Hi' : 'Mid';
    const tkZone = taker !== null ? (taker > 1.05 ? 'Buy' : taker < 0.85 ? 'Sell' : 'Flat') : 'Flat';
    const smDesc = (sm !== null && sm >= 5) ? `SM${sm}` : (sm !== null && sm >= 1) ? `SM${sm}` : 'noSM';
    const detail = `RSI${rsi}+${tkZone}+${smDesc} WR=${(winRate*100).toFixed(0)}%(${sampleSize}笔,${useEnv})`;

    // 决策: 基于胜率
    if (winRate < 0.15 && sampleSize >= 5) {
      return { action: 'block', scoreAdj: 0, reason: `[学习] ${detail} → 极低胜率拦截`, winRate, sampleSize };
    }
    if (winRate < 0.30) {
      const adj = direction === 'LONG' ? -3 : 3;
      return { action: 'penalize', scoreAdj: adj, reason: `[学习] ${detail} → 低胜率扣分`, winRate, sampleSize };
    }
    if (winRate < 0.45) {
      const adj = direction === 'LONG' ? -2 : 2;
      return { action: 'penalize', scoreAdj: adj, reason: `[学习] ${detail} → 中低胜率扣分`, winRate, sampleSize };
    }
    if (winRate > 0.70 && sampleSize >= 5) {
      const adj = direction === 'LONG' ? 3 : -3;
      return { action: 'boost', scoreAdj: adj, reason: `[学习] ${detail} → 高胜率加分`, winRate, sampleSize };
    }
    if (winRate > 0.60) {
      const adj = direction === 'LONG' ? 2 : -2;
      return { action: 'boost', scoreAdj: adj, reason: `[学习] ${detail} → 中高胜率加分`, winRate, sampleSize };
    }

    return { action: 'neutral', scoreAdj: 0, reason: `[学习] ${detail} → 中性`, winRate, sampleSize };
  }

  // ================================================================
  // 统一自学习智能投票API — 所有调用方(stable/aggressive/VotingSystem)共用
  // 输入: votes数组, 市场数据d, BTC环境, K线数据kd, symbol
  // 输出: 修改votes + 返回额外投票 + 毒组合拦截结果
  // ================================================================

  /**
   * applyIntelligence — 投票时调用
   * @param {Array} votes - 已有投票 [{dim, score, reason}]
   * @param {Object} d - 市场数据 {gLS, tLS, tLSTrend, oi, social, fr, taker, sm, bs, rsi, ...}
   * @param {Object} kd - K线数据 {trend, score, data: {positionInRange, volRatio, ...}}
   * @param {string} btcTrend - BTC环境 BULL/CAUTION/NEUTRAL/BEAR/CRASH
   * @param {string} fsym - token symbol
   * @param {Object} dailyTrend - 日线趋势 {dMacdSign, ...}
   * @param {string} entryDirection - 实际入场方向(LONG/SHORT), 不传则从votes推断
   * @returns {Object} { extraVotes, blocked, blockReason }
   */
  applyIntelligence(votes, d, kd, btcTrend, fsym, dailyTrend = null, entryDirection = null) {
    const extraVotes = [];
    let blocked = false, blockReason = '';

    // ── 模块1: BTC环境动态调整投票分数 ──
    if (btcTrend === 'BULL' || btcTrend === 'CAUTION') {
      for (const v of votes) {
        if (v.score > 0 && ['Taker','BS','SM','TT','OI/MC','实时动量','形态铁律','反向做多'].includes(v.dim)) {
          v.score = Math.round(v.score * 1.3);
          v.reason += '[BULL放大]';
        }
        if (v.score < 0 && ['散户','COMBO'].includes(v.dim)) {
          v.score = Math.round(v.score * 0.7);
          v.reason += '[BULL减弱]';
        }
      }
    } else if (btcTrend === 'BEAR' || btcTrend === 'CRASH') {
      for (const v of votes) {
        if (v.score < 0 && ['Taker','BS','SM','散户','COMBO','大户趋势'].includes(v.dim)) {
          v.score = Math.round(v.score * 1.3);
          v.reason += '[BEAR放大]';
        }
        if (v.score > 0 && ['RSI','形态铁律','OI/MC'].includes(v.dim)) {
          v.score = Math.round(v.score * 0.7);
          v.reason += '[BEAR减弱]';
        }
      }
    }

    // ── 模块2: dimOutcomes自动反馈投票 ──
    const _dimOut = this.dimOutcomes || {};
    try {
      // [2026-07-25] dimOutcomes反指标: 阈值提高到55%+分级打分
      // 之前>50%就扣分, 但49-55%几乎是50/50噪音不是信号
      // >55%=-1, >65%=-2 分级响应
      // 散户追多
      if (d.gLS && d.gLS > 1.3) {
        const _gc = _dimOut['gls_chasing'];
        if (_gc) {
          const _total = (_gc.KEPT_RISING||0)+(_gc.DUMPED||0)+(_gc.KEPT_FALLING||0)+(_gc.BOUNCED||0);
          const _dumpRate = _total > 50 ? (_gc.DUMPED||0) / _total : 0;
          if (_dumpRate > 0.65) extraVotes.push({dim:'dimOut散户',score:-2,reason:`散户追多后${(_dumpRate*100).toFixed(0)}%暴跌(${_total}样本)`});
          else if (_dumpRate > 0.55) extraVotes.push({dim:'dimOut散户',score:-1,reason:`散户追多后${(_dumpRate*100).toFixed(0)}%偏跌(${_total}样本)`});
        }
      }
      // OI下降
      const _oiHist = this.oiHistory?.[fsym];
      const _oiChg = (_oiHist?.length >= 2 && _oiHist[0].oi > 0) ? ((_oiHist[_oiHist.length-1].oi - _oiHist[0].oi) / _oiHist[0].oi * 100) : 0;
      if (_oiChg < -5) {
        const _od = _dimOut['oi_drop'];
        if (_od) {
          const _total = (_od.KEPT_RISING||0)+(_od.DUMPED||0)+(_od.KEPT_FALLING||0)+(_od.BOUNCED||0);
          const _dumpRate = _total > 50 ? ((_od.DUMPED||0)+(_od.KEPT_FALLING||0)) / _total : 0;
          if (_dumpRate > 0.65) extraVotes.push({dim:'dimOutOI',score:-2,reason:`OI下降后${(_dumpRate*100).toFixed(0)}%暴跌(${_total}样本)`});
          else if (_dumpRate > 0.55) extraVotes.push({dim:'dimOutOI',score:-1,reason:`OI下降后${(_dumpRate*100).toFixed(0)}%偏跌(${_total}样本)`});
        }
      }
      // Social暴涨 → 续涨
      if (d.social !== null && d.social >= 100) {
        const _ss = _dimOut['social_surge'];
        if (_ss) {
          const _total = (_ss.KEPT_RISING||0)+(_ss.DUMPED||0)+(_ss.KEPT_FALLING||0)+(_ss.BOUNCED||0);
          const _riseRate = _total > 30 ? (_ss.KEPT_RISING||0) / _total : 0;
          if (_riseRate > 0.35) extraVotes.push({dim:'dimOutSocial',score:2,reason:`Social暴涨后${(_riseRate*100).toFixed(0)}%续涨(${_total}样本)`});
        }
      }
      // 大户加仓: 当前49%仅比50/50多1%, 不应算反指标, 阈值提高到55%
      if (d.tLS && d.tLSTrend === 'rising') {
        const _ta = _dimOut['topLS_add'];
        if (_ta) {
          const _total = (_ta.KEPT_RISING||0)+(_ta.DUMPED||0)+(_ta.KEPT_FALLING||0)+(_ta.BOUNCED||0);
          const _dumpRate = _total > 50 ? (_ta.DUMPED||0) / _total : 0;
          if (_dumpRate > 0.60) extraVotes.push({dim:'dimOut大户',score:-2,reason:`大户加仓后${(_dumpRate*100).toFixed(0)}%暴跌(反指标,${_total}样本)`});
          else if (_dumpRate > 0.55) extraVotes.push({dim:'dimOut大户',score:-1,reason:`大户加仓后${(_dumpRate*100).toFixed(0)}%偏跌(${_total}样本)`});
        }
      }
    } catch(e) {}

    // ── 模块2b: [2026-07-31] 15m放量FOMO拦截 ──
    // 数据(30天): 15m放量>2.5x+高波动 → 19笔WR=58%,平均亏$66,总亏$1,248
    // 赢$65 vs 亏$246 盈亏比极差，是系统性亏损模式
    if (kd?.data?.volRatio15m > 2.5) {
      const _hasHighVol = kd.data.volRatio15m > 2.5;
      const _hasOiBoom = [...votes, ...extraVotes].some(v => v.reason && v.reason.includes('OI暴涨'));
      const _hasRetailChase = (d.gLS || 0) > 1.3;
      const _hasHighVolatility = [...votes, ...extraVotes].some(v => v.reason && v.reason.includes('高风险'));

      // 三个全中: 放量+OI暴涨+散户追多 → WR=50% 直接拦截
      if (_hasOiBoom && _hasRetailChase) {
        blocked = true;
        blockReason = `FOMO陷阱: 15m放量${kd.data.volRatio15m.toFixed(1)}x+OI暴涨+散户追多(WR=50%,30天亏$365)`;
      }
      // 放量+高波动 → WR=58% 扣分
      else if (_hasHighVolatility) {
        extraVotes.push({ dim: 'FOMO风险', score: -3, reason: `15m放量${kd.data.volRatio15m.toFixed(1)}x+高波动(WR=58%,30天亏$1248)` });
      }
      // 放量+散户追多 → WR=53% 扣分
      else if (_hasRetailChase) {
        extraVotes.push({ dim: 'FOMO风险', score: -2, reason: `15m放量${kd.data.volRatio15m.toFixed(1)}x+散户追多(WR=53%)` });
      }
    }

    // ── 模块3: Market Memory三级形态匹配 ──
    // L1精确(8维,≥5次,±2) → L2核心(4维,≥8次,±1.5) → L3环境(2维,≥15次,±1)
    if (this.marketMemory?.byFullKey) {
      try {
        const _market = btcTrend || 'UNKNOWN';
        const _posR = kd?.data?.positionInRange ?? 0.5;
        const _posLabel = _posR > 0.8 ? 'HIGH' : _posR > 0.5 ? 'MID' : _posR > 0.2 ? 'LOW' : 'BOTTOM';
        const _tkLabel = (d.taker||1) > 1.1 ? 'TK_BUY' : (d.taker||1) < 0.9 ? 'TK_SELL' : 'TK_FLAT';
        const _smLabel = (d.sm||0) >= 10 ? 'SM_HIGH' : (d.sm||0) >= 3 ? 'SM_MID' : 'SM_LOW';

        // L1: 8维精确匹配(原逻辑)
        const _structure = [
          kd?.trend || 'UNKNOWN', _posLabel,
          (kd?.data?.volRatio||1) > 1.5 ? 'VOL_HIGH' : (kd?.data?.volRatio||1) > 0.7 ? 'VOL_NORM' : 'VOL_LOW',
          (d.rsi||50) > 75 ? 'RSI_OB' : (d.rsi||50) > 55 ? 'RSI_MID' : (d.rsi||50) > 35 ? 'RSI_LOW' : 'RSI_OS',
        ].join('_');
        const _onchain = [
          _tkLabel, _smLabel,
          (d.bs||1) > 1.3 ? 'BS_BUY' : (d.bs||1) < 0.7 ? 'BS_SELL' : 'BS_FLAT',
          (d.fr||0) < -0.0003 ? 'FR_NEG' : (d.fr||0) > 0.0005 ? 'FR_POS' : 'FR_FLAT',
        ].join('_');
        const _allVotes = [...votes, ...extraVotes];
        const _dir3 = _allVotes.reduce((s,v)=>s+v.score,0) >= 0 ? 'LONG' : 'SHORT';
        const _l1Key = `${_dir3}|${_market}|${_structure}|${_onchain}`;
        const _l1Match = this.marketMemory.byFullKey[_l1Key];

        // L2: 3维核心匹配(BTC+位置+Taker) — 48种组合
        const _l2Key = `${_dir3}|${_market}|${_posLabel}|${_tkLabel}`;
        const _l2Match = this.marketMemory.byCore?.[_l2Key];

        // L3: 2维环境匹配(BTC+位置) — 16种组合
        const _l3Key = `${_dir3}|${_market}|${_posLabel}`;
        const _l3Match = this.marketMemory.byEnv?.[_l3Key];

        let _matched = false;
        if (_l1Match && _l1Match.count >= 5) {
          const _wr = _l1Match.wins / _l1Match.count;
          if (_wr >= 0.65) { extraVotes.push({dim:'形态记忆',score:2,reason:`L1形态WR=${(_wr*100).toFixed(0)}%(${_l1Match.count}次)=高胜率`}); _matched = true; }
          else if (_wr <= 0.30) { extraVotes.push({dim:'形态记忆',score:-2,reason:`L1形态WR=${(_wr*100).toFixed(0)}%(${_l1Match.count}次)=低胜率`}); _matched = true; }
        }
        if (!_matched && _l2Match && _l2Match.count >= 8) {
          const _wr = _l2Match.wins / _l2Match.count;
          if (_wr >= 0.65) { extraVotes.push({dim:'形态记忆',score:1.5,reason:`L2核心WR=${(_wr*100).toFixed(0)}%(${_l2Match.count}次)`}); _matched = true; }
          else if (_wr <= 0.30) { extraVotes.push({dim:'形态记忆',score:-1.5,reason:`L2核心WR=${(_wr*100).toFixed(0)}%(${_l2Match.count}次)`}); _matched = true; }
        }
        if (!_matched && _l3Match && _l3Match.count >= 15) {
          const _wr = _l3Match.wins / _l3Match.count;
          if (_wr >= 0.65) extraVotes.push({dim:'形态记忆',score:1,reason:`L3环境WR=${(_wr*100).toFixed(0)}%(${_l3Match.count}次)`});
          else if (_wr <= 0.30) extraVotes.push({dim:'形态记忆',score:-1,reason:`L3环境WR=${(_wr*100).toFixed(0)}%(${_l3Match.count}次)`});
        }
      } catch(e) {}
    }

    // ── 模块3b: comboStats动态调分 (SIGNAL路径也生效) ──
    try {
      const _rsi = d.rsi || 50;
      const _taker = d.taker || d.takerRatio || 1;
      const _sm = d.smHolders ?? d.sm ?? 0;
      const _comboDecision = this.getComboDecision(direction || 'LONG', _rsi, _taker, _sm, btcTrend);
      if (_comboDecision) {
        if (_comboDecision.action === 'block' && _comboDecision.sampleSize >= 5) {
          blocked = true;
          blockReason = _comboDecision.reason;
        } else if (_comboDecision.scoreAdj !== 0) {
          extraVotes.push({ dim: 'COMBO', score: _comboDecision.scoreAdj, reason: _comboDecision.reason });
        }
      }
    } catch(e) {}

    // ── 模块4 毒组合拦截 ──
    // 用实际入场方向（Signal Agent决定），不用votes推断方向（BEAR环境下votes可能偏空但实际做LONG）
    const direction = entryDirection || ([...votes, ...extraVotes].reduce((s,v)=>s+v.score,0) >= 0 ? 'LONG' : 'SHORT');
    const _hasMacdDeath = dailyTrend?.dMacdSign === 'BEAR';
    const _ttBear = d.ttChg !== null && d.ttChg < -1;
    const _bigReduce = d.tLSTrend === 'declining';
    const _bigBear = d.tLS !== null && d.tLS < 0.85;
    const _frCrowdedLong = (d.fr || 0) > 0.0003;
    const _slowBleed = [...votes, ...extraVotes].some(v => v.reason && v.reason.includes('SLOW_BLEED'));

    if (!blocked && direction === 'LONG') {
      // FR拥挤+TT偏空: 任何BTC环境都拦(WR=25%太低)
      if (_frCrowdedLong && _ttBear) { blocked = true; blockReason = '毒组合:FR拥挤+TT偏空(WR=25%)'; }
      // [2026-07-25] MACD死叉相关毒组合: 只在BTC BULL时拦截
      // 数据(30天): BULL时MACD死叉+LONG亏-$1,268, CAUTION时+$256, NEUTRAL时+$524
      // BTC下跌/企稳后MACD死叉是全市场现象(滞后指标), 不应拦截
      else if (_hasMacdDeath && btcTrend === 'BULL') {
        if (_ttBear) { blocked = true; blockReason = '毒组合:MACD死叉+TT偏空+BTC_BULL(WR=54%)'; }
        else if (_bigBear) { blocked = true; blockReason = '毒组合:MACD死叉+大户偏空+BTC_BULL(WR=61%)'; }
        else if (_bigReduce) { blocked = true; blockReason = '毒组合:MACD死叉+大户在减+BTC_BULL(诱多)'; }
        else if (_slowBleed) { blocked = true; blockReason = '毒组合:MACD死叉+SLOW_BLEED+BTC_BULL(诱多)'; }
      }
    }

    return { extraVotes, blocked, blockReason };
  }

  /**
   * getVolatilityTierMultiplier — HEALTH_EXIT时调用
   * @param {number} volRatio - K线成交量比
   * @returns {number} tier乘数 (高波动1.3, 低波动0.8, 正常1.0)
   */
  getVolatilityTierMultiplier(volRatio) {
    if (volRatio >= 1.5) return 1.3;
    if (volRatio < 0.6) return 0.8;
    return 1.0;
  }

  // [2026-07-29] ML Service 胜率预测
  async predictWinRate(features) {
    try {
      // 每60秒检查一次ML服务可用性
      const now = Date.now();
      if (now - this._mlLastCheck < 60000 && !this._mlAvailable) return null;

      const _res = await axios.post(`${this._mlBaseUrl}/winrate/predict`, features, { timeout: 3000 });
      if (_res.data && _res.data.winRate !== undefined) {
        this._mlAvailable = true;
        this._mlLastCheck = now;
        return _res.data;
      }
      return null;
    } catch (e) {
      this._mlAvailable = false;
      this._mlLastCheck = Date.now();
      return null;
    }
  }

  /**
   * recordAllOutcomes — 平仓时统一调用，记录所有学习数据
   * @param {Object} trade - 已平仓交易
   * @param {Array} entryVotes - 入场时的投票记录
   * @param {boolean} isWin - 是否盈利
   */
  async recordAllOutcomes(trade, entryVotes, isWin) {
    // 如果votes为空，尝试从entry_data重建基本维度votes
    let votes = entryVotes;
    if ((!votes || votes.length === 0) && trade.entry_data) {
      votes = [];
      const ed = trade.entry_data;
      const taker = ed.takerRatio || ed.taker;
      if (taker != null) votes.push({ dim: 'Taker', score: taker > 1.1 ? 2 : taker < 0.9 ? -2 : 0 });
      if (ed.rsi != null) votes.push({ dim: 'RSI', score: ed.rsi < 30 ? 2 : ed.rsi > 75 ? -1 : 0 });
      const sm = ed.smHolders ?? ed.sm;
      if (sm != null) votes.push({ dim: 'SM', score: sm >= 10 ? 2 : sm >= 3 ? 1 : sm === 0 ? -1 : 0 });
      const bs = ed.buySellRatio || ed.bs;
      if (bs != null) votes.push({ dim: 'BS', score: bs > 1.3 ? 2 : bs < 0.7 ? -2 : 0 });
      votes = votes.filter(v => v.score !== 0);
    }
    await this.recordTradeLesson(trade, votes, isWin);
    await this.recordMarketMemory(trade);
    await this.recordComboOutcome(trade);
    this.recordDynamicComboOutcome(trade, isWin);
  }

  // ==================== [2026-08-27] Dynamic Combo Learning ====================
  // 不再靠人手动加规则，系统自动从交易结果学习
  // 入场条件组合(kScore+连阳+量比+位置) → 记录结果 → 连续亏损自动临时封禁

  /**
   * 生成动态combo key — 入场条件的简化签名
   */
  _dynamicComboKey(params) {
    const dir = params.direction || 'LONG';
    const kS = params.kScore ?? 0;
    const kBucket = kS <= -2 ? 'kBear' : kS >= 2 ? 'kBull' : 'kNeu';
    const consBull = params.consecutiveBull ?? 0;
    const consBucket = consBull >= 4 ? 'cb4+' : consBull >= 2 ? 'cb2' : 'cb0';
    const volR = params.volRatio ?? 1;
    const volBucket = volR < 0.5 ? 'vLo' : volR > 2 ? 'vHi' : 'vMid';
    const pos = params.positionInRange ?? 0.5;
    const posBucket = pos >= 0.75 ? 'pHi' : pos <= 0.25 ? 'pLo' : 'pMid';
    return `${dir}_${kBucket}_${consBucket}_${volBucket}_${posBucket}`;
  }

  /**
   * 平仓后记录combo结果，自动检测是否需要封禁
   */
  recordDynamicComboOutcome(trade, isWin) {
    try {
      const ed = trade.entry_data || {};
      const kd = ed.klineData?.data || ed.klineData || {};
      const key = this._dynamicComboKey({
        direction: trade.direction,
        kScore: ed.klineScore ?? kd.score ?? 0,
        consecutiveBull: kd.consecutiveBull ?? 0,
        volRatio: kd.volRatio ?? 1,
        positionInRange: kd.positionInRange ?? 0.5,
      });
      const pnl = parseFloat(trade.total_pnl || 0);

      if (!this._recentComboOutcomes[key]) this._recentComboOutcomes[key] = [];
      this._recentComboOutcomes[key].push({ ts: Date.now(), isWin, pnl });

      // 只保留最近10条
      if (this._recentComboOutcomes[key].length > 10) {
        this._recentComboOutcomes[key] = this._recentComboOutcomes[key].slice(-10);
      }

      // 检测: 48h内最近5笔中>=3笔亏损 → 封禁4h
      const now = Date.now();
      const cutoff = now - 48 * 3600000;
      const recent = this._recentComboOutcomes[key].filter(r => r.ts > cutoff).slice(-5);
      const losses = recent.filter(r => !r.isWin).length;
      if (recent.length >= 3 && losses >= 3) {
        this._comboBlockUntil[key] = now + 4 * 3600000;
        const totalLoss = recent.filter(r => !r.isWin).reduce((s, r) => s + r.pnl, 0);
        console.log(`[LearningEngine] 🚫 动态封禁: ${key} 近${recent.length}笔${losses}亏(合计$${totalLoss.toFixed(0)}) → 封禁4h`);
      }
    } catch (e) {}
  }

  /**
   * shouldBlock — PaperTradeService._scanSignals() 调用
   * 检查入场条件组合是否在冷却中
   */
  shouldBlock(params) {
    try {
      const kd = params.klineData || {};
      const key = this._dynamicComboKey({
        direction: params.signal_type || params.direction || 'LONG',
        kScore: params.kScore ?? 0,
        consecutiveBull: kd.consecutiveBull ?? 0,
        volRatio: kd.volRatio ?? 1,
        positionInRange: params.positionInRange ?? kd.positionInRange ?? 0.5,
      });

      const blockUntil = this._comboBlockUntil[key];
      if (blockUntil && Date.now() < blockUntil) {
        const remaining = Math.round((blockUntil - Date.now()) / 60000);
        const recent = this._recentComboOutcomes[key] || [];
        const losses = recent.filter(r => !r.isWin).length;
        return { block: true, msg: `动态封禁 ${key} (近期${losses}连亏, 剩${remaining}min)` };
      }

      // 清理过期封禁
      if (blockUntil && Date.now() >= blockUntil) {
        delete this._comboBlockUntil[key];
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * [2026-08-02] 规则自学习: 回测被硬拦截信号的后续走势
   * 每30分钟跑一次，查询20分钟前被拦截的信号，用当前价格计算假设PnL
   * 统计每条规则在不同K线场景下的"拦对率"，写入paper_trade_learning供分析
   */
  async reviewBlockedSignals() {
    try {
      const axios = require('axios');
      // 查20分钟前~6小时前未回测的被拦截信号
      const rows = await DatabaseService.query(
        `SELECT * FROM pt_blocked_signals
         WHERE env = ? AND outcome_checked = 0
           AND blocked_at < DATE_SUB(NOW(), INTERVAL 20 MINUTE)
           AND blocked_at > DATE_SUB(NOW(), INTERVAL 6 HOUR)
         LIMIT 50`,
        [this.env]
      );
      if (rows.length === 0) return;

      for (const row of rows) {
        try {
          // 查当前markPrice
          const res = await axios.get('https://fapi.binance.com/fapi/v1/premiumIndex', {
            params: { symbol: row.symbol }, timeout: 3000
          });
          const currentPrice = parseFloat(res.data?.markPrice || 0);
          if (!currentPrice) continue;

          // 按实际方向计算假设PnL
          const entryPrice = parseFloat(row.entry_price);
          const pnlPct = row.direction === 'SHORT'
            ? ((entryPrice - currentPrice) / entryPrice) * 100
            : ((currentPrice - entryPrice) / entryPrice) * 100;
          const isWin = pnlPct > 0;

          // 更新回测结果
          await DatabaseService.query(
            `UPDATE pt_blocked_signals SET
               outcome_checked = 1, outcome_pnl = ?, outcome_direction = ?, outcome_checked_at = NOW()
             WHERE id = ?`,
            [pnlPct.toFixed(4), isWin ? 'WIN' : 'LOSS', row.id]
          );

          // 按规则+kScore场景统计胜率，写入learning
          const dims = typeof row.dims === 'string' ? JSON.parse(row.dims) : row.dims;
          const kBucket = dims.kScore <= -2 ? 'kScore_bearish' : dims.kScore >= 2 ? 'kScore_bullish' : 'kScore_neutral';
          const learningKey = `blocked_rule_${row.rule_name}_${kBucket}`;

          let stats = await this.storage.get('rule_block_review', learningKey) || { wins: 0, losses: 0, totalPnl: 0, samples: 0 };

          stats.samples++;
          stats.totalPnl += pnlPct;
          if (isWin) stats.wins++; else stats.losses++;
          const wr = stats.samples > 0 ? (stats.wins / stats.samples * 100).toFixed(1) : 0;

          await this.storage.set('rule_block_review', learningKey, stats);

          console.log(`[LearningEngine] 规则回测 ${row.rule_name}(${kBucket}): ${isWin?'WIN':'LOSS'} pnl=${pnlPct.toFixed(2)}% WR=${wr}%(${stats.samples}笔)`);
        } catch (e) { /* 单条失败不影响其他 */ }
      }
    } catch (e) {
      console.error(`[LearningEngine] reviewBlockedSignals error:`, e.message);
    }
  }

  // [2026-09-01] Trader Regime Map: HL真实交易行为 × BTC市场机制
  // 数据基础: 179活跃trader, 858K笔fills, 不同BTC机制下各archetype的实际edge
  // BTC_PUMP → TREND_LONG有edge(WR76.6%,+$140K)
  // BTC_RANGE → XYZ_SPECIALIST有edge(WR61.5%,+$1.16M)
  // BTC_DUMP  → TREND_SHORT是方向顺应者
  // 逻辑: 查询高edge archetype最近4h开仓方向 → 判断市场偏向 → 投票
  async getHLRegimeSignal(btcTrend) {
    const now = Date.now();
    // 20分钟缓存: 避免每次投票都查DB
    if (this._regimeCache && (now - this._regimeCache.ts) < 20 * 60 * 1000) {
      return this._regimeCache.result;
    }

    // BTC趋势 → 机制 + 对应高edge archetype
    let regime, edgeArchetype;
    if (btcTrend === 'BULL') {
      regime = 'BTC_PUMP'; edgeArchetype = 'TREND_LONG';
    } else if (btcTrend === 'BEAR' || btcTrend === 'CRASH') {
      regime = 'BTC_DUMP'; edgeArchetype = 'TREND_SHORT';
    } else {
      regime = 'BTC_RANGE'; edgeArchetype = 'XYZ_SPECIALIST';
    }

    try {
      // 查询该archetype最近4h的开仓方向分布
      // dir值: 'Open Long', 'Open Short', 'Close Long', 'Close Short'
      const rows = await DatabaseService.query(`
        SELECT
          SUM(CASE WHEN f.dir = 'Open Long'  THEN 1 ELSE 0 END) AS longs,
          SUM(CASE WHEN f.dir = 'Open Short' THEN 1 ELSE 0 END) AS shorts,
          COUNT(*) AS total
        FROM hl_trader_fills f
        JOIN hl_traders t ON f.address = t.address
        WHERE t.archetype = ?
          AND f.fill_time > DATE_SUB(NOW(), INTERVAL 4 HOUR)
          AND t.sync_status = 'ACTIVE'
      `, [edgeArchetype]);

      const row = rows[0] || {};
      const longs = parseInt(row.longs || 0);
      const shorts = parseInt(row.shorts || 0);
      const opens = longs + shorts;

      let score = 0, reason = '';
      if (opens < 5) {
        reason = `${regime}:${edgeArchetype}近4h开仓数据不足(${opens}笔)`;
      } else {
        const longBias = longs / opens;
        if (longBias > 0.65) {
          score = 2;
          reason = `${regime}:${edgeArchetype}偏多(${longs}/${opens}=${(longBias*100).toFixed(0)}%)`;
        } else if (longBias < 0.35) {
          score = -2;
          reason = `${regime}:${edgeArchetype}偏空(${shorts}/${opens}=${((1-longBias)*100).toFixed(0)}%)`;
        } else {
          reason = `${regime}:${edgeArchetype}方向中性(多${longs}空${shorts})`;
        }
      }

      const result = { score, reason, regime, archetype: edgeArchetype, opens };
      this._regimeCache = { ts: now, result };
      return result;
    } catch (e) {
      const result = { score: 0, reason: `RegimeMap查询失败`, regime, archetype: edgeArchetype, opens: 0 };
      this._regimeCache = { ts: now - 18 * 60 * 1000, result }; // 2min后重试
      return result;
    }
  }
}

module.exports = LearningEngine;

/**
 * Paper Trade API Routes
 *
 * 公开路由(不需要authMiddleware)，但有：
 * - Rate limiting (30次/分钟/IP)
 * - Origin白名单
 * - 数据脱敏(延迟5分钟, 不返回精确价格/仓位量)
 */

const express = require('express');
const router = express.Router();

// Rate limiting
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (e) {
  // fallback: 无限流控
  rateLimit = () => (req, res, next) => next();
  console.warn('[paperTradeRoutes] express-rate-limit not installed, rate limiting disabled');
}

const paperTradeLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Origin白名单检查
const originCheck = (req, res, next) => {
  const origin = req.get('origin') || req.get('referer') || '';
  const allowed = ['gameland.network', 'galeon.world', 'localhost', '127.0.0.1', '184.168.123.133'];
  // 允许没有origin的请求(如curl测试)在开发环境
  if (!origin || allowed.some(d => origin.includes(d))) {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden' });
};

router.use(paperTradeLimit);
router.use(originCheck);

// 延迟加载PaperTradeService(避免循环依赖)
let _service = null;
let _aggressiveService = null;
function getService(strategy) {
  if (strategy === 'aggressive') {
    if (!_aggressiveService) {
      try {
        _aggressiveService = require('../services/autoTrade/AlphaPaperTradeService');
      } catch (e) {
        return null; // 激进版未启用
      }
    }
    return _aggressiveService;
  }
  if (!_service) {
    _service = require('../services/autoTrade/PaperTradeService');
  }
  return _service;
}

/**
 * GET /api/paper-trade/overview
 * 纸上交易总览
 */
router.get('/overview', async (req, res) => {
  try {
    const strategy = req.query.strategy || 'stable';
    const service = getService(strategy);
    if (!service) {
      return res.status(404).json({ error: `Strategy '${strategy}' not available on this server` });
    }
    if (!service) {
      return res.status(404).json({ error: `Strategy '${strategy}' not available on this server` });
    }
    if (!service.initialized) {
      return res.status(503).json({ error: 'Service not ready' });
    }
    const data = await service.getOverview();
    res.json({ success: true, data });
  } catch (e) {
    console.error('[paperTradeRoutes] /overview error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/paper-trade/positions
 * 当前持仓(延迟5分钟, 脱敏)
 */
router.get('/positions', async (req, res) => {
  try {
    const strategy = req.query.strategy || 'stable';
    const service = getService(strategy);
    if (!service) {
      return res.status(404).json({ error: `Strategy '${strategy}' not available on this server` });
    }
    if (!service.initialized) {
      return res.status(503).json({ error: 'Service not ready' });
    }
    const data = await service.getPositions(true); // delayed=true
    res.json({ success: true, data });
  } catch (e) {
    console.error('[paperTradeRoutes] /positions error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/paper-trade/history
 * 历史交易(分页, 最多50条/页)
 */
router.get('/history', async (req, res) => {
  try {
    const strategy = req.query.strategy || 'stable';
    const service = getService(strategy);
    if (!service) {
      return res.status(404).json({ error: `Strategy '${strategy}' not available on this server` });
    }
    if (!service.initialized) {
      return res.status(503).json({ error: 'Service not ready' });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize) || 20);
    const filter = {};
    if (req.query.symbol) filter.symbol = req.query.symbol;
    if (req.query.direction) filter.direction = req.query.direction;
    if (req.query.profitable === 'true') filter.profitable = true;
    if (req.query.profitable === 'false') filter.profitable = false;

    const data = await service.getHistory(page, pageSize, filter);
    res.json({ success: true, data });
  } catch (e) {
    console.error('[paperTradeRoutes] /history error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/paper-trade/capital-history
 * 资金曲线(按天聚合)
 */
router.get('/capital-history', async (req, res) => {
  try {
    const strategy = req.query.strategy || 'stable';
    const service = getService(strategy);
    if (!service) {
      return res.status(404).json({ error: `Strategy '${strategy}' not available on this server` });
    }
    if (!service.initialized) {
      return res.status(503).json({ error: 'Service not ready' });
    }
    const data = await service.getCapitalHistory();
    res.json({ success: true, data });
  } catch (e) {
    console.error('[paperTradeRoutes] /capital-history error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/paper-trade/learning
 * 学习数据(维度权重, 热门token等)
 * 脱敏: 只返回准确率%, 不返回具体权重数值
 */
router.get('/learning', async (req, res) => {
  try {
    const strategy = req.query.strategy || 'stable';
    const service = getService(strategy);
    if (!service) {
      return res.status(404).json({ error: `Strategy '${strategy}' not available on this server` });
    }
    if (!service.initialized) {
      return res.status(503).json({ error: 'Service not ready' });
    }
    const data = await service.getLearningStats();
    // 脱敏: 不暴露具体权重, 只给准确率
    if (data.weights) {
      data.weights = data.weights.map(w => ({
        dimension: w.dimension,
        accuracy: w.accuracy,
        sampleCount: w.sampleCount,
        // weight字段不返回给前端
      }));
    }
    res.json({ success: true, data });
  } catch (e) {
    console.error('[paperTradeRoutes] /learning error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── Report 缓存（DB持久化，24h有效）──
const _reportCacheKey = (period, strategy) => `report_${period}_${strategy}`;
const REPORT_CACHE_TTL_H = 24; // 小时

async function _computeReport(DatabaseService, period, strategyFilter) {
    const periodMap = { '7d': 7, '30d': 30, '90d': 90, 'all': 9999 };
    const days = periodMap[period] || 30;
    const dateClause = days < 9999 ? `AND closed_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)` : '';
    const stratClause = strategyFilter !== 'all' ? `AND strategy = '${strategyFilter}'` : '';
    const envClause = strategyFilter === 'aggressive' ? "AND env='mainnet'"
      : strategyFilter === 'stable' ? "AND env='testnet'"
      : "AND ((env='testnet' AND strategy='stable') OR (env='mainnet' AND strategy='aggressive'))";

    const q = async (sql, params = []) => DatabaseService.query(sql, params);

    const buildSummary = async (stratWhere) => {
      const rows = await q(`
        SELECT COUNT(*) as trades,
          SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END) as wins,
          ROUND(SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate,
          ROUND(SUM(total_pnl),2) as totalPnl,
          ROUND(AVG(CASE WHEN total_pnl > 0 THEN total_pnl_pct END),2) as avgWinPct,
          ROUND(AVG(CASE WHEN total_pnl <= 0 THEN total_pnl_pct END),2) as avgLossPct,
          ROUND(MAX(total_pnl),2) as maxWin,
          ROUND(MIN(total_pnl),2) as maxLoss,
          ROUND(SUM(CASE WHEN total_pnl > 0 THEN total_pnl ELSE 0 END),2) as grossWin,
          ROUND(ABS(SUM(CASE WHEN total_pnl <= 0 THEN total_pnl ELSE 0 END)),2) as grossLoss
        FROM paper_trade_history WHERE 1=1 ${envClause} ${stratWhere} ${dateClause}`);
      const r = rows[0] || {};
      const pf = r.grossLoss > 0 ? +(r.grossWin / r.grossLoss).toFixed(2) : (r.grossWin > 0 ? 99 : 0);
      const streakRows = await q(`
        SELECT total_pnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratWhere} ${dateClause} ORDER BY closed_at`);
      let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
      for (const sr of streakRows) {
        if (sr.total_pnl > 0) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
        else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
      }
      const capEnvClause = stratWhere.includes('aggressive') ? "AND env='mainnet'" : stratWhere.includes('stable') ? "AND env='testnet'" : envClause;
      const capRows = await q(`
        SELECT capital FROM paper_trade_capital_history WHERE 1=1 ${capEnvClause} ${stratWhere}
        ${days < 9999 ? `AND trade_date >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)` : ''}
        ORDER BY trade_date`);
      let maxDD = 0;
      if (capRows.length > 0) {
        let peak = capRows[0].capital;
        for (const c of capRows) {
          if (c.capital > peak) peak = c.capital;
          const dd = peak > 0 ? ((c.capital - peak) / peak) * 100 : 0;
          if (dd < maxDD) maxDD = dd;
        }
        maxDD = +maxDD.toFixed(1);
      }
      return {
        trades: r.trades || 0, wins: r.wins || 0, winRate: r.winRate || 0,
        totalPnl: r.totalPnl || 0, roi: 0,
        profitFactor: pf, maxDrawdown: maxDD, sharpeRatio: 0,
        avgWinPct: r.avgWinPct || 0, avgLossPct: r.avgLossPct || 0,
        maxWin: r.maxWin || 0, maxLoss: r.maxLoss || 0,
        maxWinStreak, maxLossStreak,
      };
    };

    const [summaryAll, summaryStable, summaryAggressive] = await Promise.all([
      buildSummary(''),
      buildSummary("AND strategy='stable'"),
      buildSummary("AND strategy='aggressive'"),
    ]);

    const highConf = await q(`SELECT COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as wr, ROUND(SUM(total_pnl),2) as pnl FROM paper_trade_history WHERE 1=1 ${envClause} AND entry_score>=10 ${stratClause} ${dateClause}`);
    const lowConf = await q(`SELECT COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as wr, ROUND(SUM(total_pnl),2) as pnl FROM paper_trade_history WHERE 1=1 ${envClause} AND entry_score<10 ${stratClause} ${dateClause}`);
    const weeklyAcc = await q(`SELECT YEARWEEK(closed_at,1) as yw, DATE_FORMAT(MIN(closed_at), '%m/%d') as week, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(AVG(entry_score),1) as avgScore FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY yw ORDER BY yw`);
    const scoreBuckets = await q(`SELECT CASE WHEN entry_score >= 12 THEN '12+' WHEN entry_score >= 10 THEN '10-11' WHEN entry_score >= 8 THEN '8-9' ELSE '6-7' END as bucket, COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(AVG(total_pnl_pct),2) as avgPnl, ROUND(SUM(total_pnl),2) as totalPnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY bucket ORDER BY FIELD(bucket,'6-7','8-9','10-11','12+')`);
    const sourcePerf = await q(`SELECT entry_source as source, COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(SUM(total_pnl),2) as pnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY entry_source ORDER BY pnl DESC`);

    let dimAccuracy = [];
    try {
      const dimRows = await q(`SELECT key_name, data FROM paper_trade_learning WHERE env='testnet' AND category='dim_accuracy' AND key_name LIKE 'dim_accuracy_%'`);
      const dimNameMap = {
        'SM': 'Smart Money', '散户': 'Retail Ratio', '大户': 'Whale Ratio', '大户趋势': 'Whale Trend',
        'K线': 'Candlestick', 'K线趋势': 'K-line Trend', 'K趋势': 'K Trend', 'EMA': 'EMA Channel',
        '9EMA': '9EMA', 'MTF': 'Multi-Timeframe', 'TT': 'Top Trader', 'Taker': 'Taker Ratio',
        'Taker趋势': 'Taker Trend', 'BS': 'Buy/Sell Ratio', 'FR': 'Funding Rate', 'FR趋势': 'FR Trend',
        'RSI': 'RSI', 'RSI回踩': 'RSI Pullback', 'MACD': 'MACD', 'OI': 'Open Interest',
        'OI/MC': 'OI/MarketCap', 'OIstg': 'OI Stage', '价格位置': 'Price Position',
        '做多空间': 'Long Room', '做空空间': 'Short Room', '波动率': 'Volatility',
        '模式匹配': 'Pattern Match', 'ML预测': 'AI Prediction', '形态铁律': 'Pattern Rule',
        '双拥挤': 'Double Crowding', 'Surge': 'Volume Surge', 'COMBO': 'Combo Signal',
        '实时动量': 'Real-time Momentum', '关键价位': 'Key Level', '量价背离': 'Vol-Price Divergence',
        '成交额': 'Volume', 'BTC': 'BTC Correlation', 'BTC环境': 'BTC Environment',
        '4H趋势': '4H Trend', '1h趋势': '1H Trend', '7日趋势': '7D Trend',
        'FOMO风险': 'FOMO Risk', 'Social': 'Social Signal', 'Social热度': 'Social Hype',
        'dimOutOI': 'OI Outcome', 'dimOutSocial': 'Social Outcome',
        '历史胜率': 'Historical WR', '历史同向': 'Historical Alignment', '历史闪崩': 'Flash Crash',
        'BTC连阴': 'BTC Consecutive Bear', 'BTC连阳': 'BTC Consecutive Bull',
        'K形态': 'K Pattern', '5m插针': '5m Wick', '形态记忆': 'Pattern Memory',
      };
      dimAccuracy = dimRows.map(r => {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        const rawDim = r.key_name.replace('dim_accuracy_', '');
        return { dim: dimNameMap[rawDim] || rawDim, total: d.total || 0, correct: d.correct || 0, accuracy: d.total > 0 ? +((d.correct / d.total) * 100).toFixed(1) : 0 };
      }).filter(d => d.total >= 20).sort((a, b) => b.accuracy - a.accuracy);
    } catch (e) {}

    const regimeDirection = await q(`SELECT CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(entry_data,'$.btcTrend')) IN ('BULL') THEN 'Bull' WHEN JSON_UNQUOTE(JSON_EXTRACT(entry_data,'$.btcTrend')) IN ('BEAR','CRASH') THEN 'Bear' ELSE 'Neutral' END as regime, direction, COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(SUM(total_pnl),2) as pnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY regime, direction ORDER BY regime, direction`);
    const blockStats = await q(`SELECT COUNT(*) as total, SUM(outcome_checked) as checked, SUM(CASE WHEN outcome_checked=1 AND outcome_pnl<=0 THEN 1 ELSE 0 END) as correctBlocks, ROUND(ABS(SUM(CASE WHEN outcome_checked=1 AND outcome_pnl<0 THEN outcome_pnl ELSE 0 END)),2) as capitalSaved FROM pt_blocked_signals WHERE env='testnet' ${days < 9999 ? `AND blocked_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)` : ''}`);
    const bs = blockStats[0] || {};
    const blockRules = await q(`SELECT rule_name as name, COUNT(*) as blocked, ROUND(SUM(CASE WHEN outcome_checked=1 AND outcome_pnl<=0 THEN 1 ELSE 0 END)/GREATEST(SUM(outcome_checked),1)*100,1) as accuracy FROM pt_blocked_signals WHERE env='testnet' AND outcome_checked=1 ${days < 9999 ? `AND blocked_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)` : ''} GROUP BY rule_name HAVING SUM(outcome_checked)>=5 ORDER BY accuracy DESC LIMIT 10`);
    const regimeRows = await q(`SELECT CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(entry_data,'$.btcTrend')) IN ('BULL') THEN 'Bull' WHEN JSON_UNQUOTE(JSON_EXTRACT(entry_data,'$.btcTrend')) IN ('BEAR','CRASH') THEN 'Bear' ELSE 'Neutral' END as regime, COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(SUM(total_pnl),2) as pnl, ROUND(AVG(total_pnl_pct),2) as avgPnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY regime ORDER BY FIELD(regime,'Bull','Neutral','Bear')`);
    const dirRows = await q(`SELECT direction, COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(SUM(total_pnl),2) as pnl, ROUND(AVG(duration_min),0) as avgHoldMin FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY direction`);
    const topTokens = await q(`SELECT symbol, COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(SUM(total_pnl),2) as pnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY symbol ORDER BY pnl DESC LIMIT 10`);
    const bottomTokens = await q(`SELECT symbol, COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(SUM(total_pnl),2) as pnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY symbol ORDER BY pnl ASC LIMIT 10`);
    const durationRows = await q(`SELECT CASE WHEN duration_min < 10 THEN '< 10m' WHEN duration_min < 60 THEN '10-60m' WHEN duration_min < 180 THEN '1-3h' ELSE '3h+' END as bucket, COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(AVG(total_pnl_pct),2) as avgPnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY bucket ORDER BY FIELD(bucket,'< 10m','10-60m','1-3h','3h+')`);
    const exitRows = await q(`SELECT exit_reason as type, COUNT(*) as count, ROUND(COUNT(*) / (SELECT COUNT(*) FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause}) * 100, 1) as pct, ROUND(AVG(total_pnl_pct),2) as avgPnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY exit_reason ORDER BY count DESC`);
    const hourRows = await q(`SELECT HOUR(entered_at) as hour, COUNT(*) as trades, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(SUM(total_pnl),2) as pnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY hour ORDER BY hour`);
    const timePerf = Array.from({ length: 24 }, (_, h) => { const found = hourRows.find(r => r.hour === h); return { hour: h, trades: found?.trades || 0, winRate: found?.winRate || 0, pnl: found?.pnl || 0 }; });
    const dailyPnl = await q(`SELECT DATE(closed_at) as date, ROUND(SUM(total_pnl),2) as pnl FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY date ORDER BY date`);
    const bestDay = dailyPnl.length > 0 ? Math.max(...dailyPnl.map(d => d.pnl)) : 0;
    const worstDay = dailyPnl.length > 0 ? Math.min(...dailyPnl.map(d => d.pnl)) : 0;
    const avgRisk = await q(`SELECT ROUND(AVG(ABS(total_pnl_pct)),2) as avgRisk FROM paper_trade_history WHERE 1=1 ${envClause} AND total_pnl<0 ${stratClause} ${dateClause}`);
    const weeklyProgress = await q(`SELECT YEARWEEK(closed_at,1) as yw, DATE_FORMAT(MIN(closed_at), '%m/%d') as week, ROUND(SUM(CASE WHEN total_pnl>0 THEN 1 ELSE 0 END)/GREATEST(COUNT(*),1)*100,1) as winRate, ROUND(SUM(CASE WHEN total_pnl>0 THEN total_pnl ELSE 0 END) / GREATEST(ABS(SUM(CASE WHEN total_pnl<=0 THEN total_pnl ELSE 0 END)),1), 2) as profitFactor, ROUND(AVG(CASE WHEN total_pnl<=0 THEN total_pnl_pct END),2) as avgLoss FROM paper_trade_history WHERE 1=1 ${envClause} ${stratClause} ${dateClause} GROUP BY yw ORDER BY yw`);

    let modelVersion = '-', lastRetrained = '-';
    try {
      const mlRows = await q(`SELECT data FROM paper_trade_learning WHERE env='testnet' AND category='ml_model_info' AND key_name='winrate' LIMIT 1`);
      if (mlRows.length > 0) { const mlData = JSON.parse(mlRows[0].data); modelVersion = mlData.version || '-'; lastRetrained = mlData.trained_at || '-'; }
    } catch (e) {}

    const _n = (v) => Number(v) || 0;
    for (const sm of [summaryAll, summaryStable, summaryAggressive]) {
      try {
        const envQ = sm === summaryStable ? "AND env='testnet' AND strategy='stable'" : sm === summaryAggressive ? "AND env='mainnet' AND strategy='aggressive'" : '';
        if (envQ) {
          const first = await q(`SELECT capital FROM paper_trade_capital_history WHERE 1=1 ${envQ} ORDER BY trade_date ASC LIMIT 1`);
          const last = await q(`SELECT capital FROM paper_trade_capital_history WHERE 1=1 ${envQ} ORDER BY trade_date DESC LIMIT 1`);
          if (first.length > 0 && last.length > 0) sm.roi = +((last[0].capital - first[0].capital) / first[0].capital * 100).toFixed(1);
        }
      } catch (e) {}
    }
    if (summaryStable.trades > 0 || summaryAggressive.trades > 0) {
      summaryAll.roi = +((_n(summaryStable.totalPnl) + _n(summaryAggressive.totalPnl)) / 8000 * 100).toFixed(1);
    }

    const _wr = _n(summaryAll.winRate);
    const _pf = _n(summaryAll.profitFactor);
    const _avgWin = Math.abs(_n(summaryAll.avgWinPct));
    const _avgLoss = Math.abs(_n(summaryAll.avgLossPct));
    const _bestToken = topTokens[0];
    const _worstToken = bottomTokens[0];
    const _longDir = dirRows.find(d => d.direction === 'LONG');
    const _shortDir = dirRows.find(d => d.direction === 'SHORT');
    const keyInsights = [];
    keyInsights.push(`Galeon Brain has executed ${_n(summaryAll.trades).toLocaleString()} trades with a ${_wr.toFixed(1)}% win rate and a Profit Factor of ${_pf.toFixed(2)}x. ${_pf >= 1.3 ? 'The system demonstrates strong risk-adjusted returns.' : _pf >= 1 ? 'The system is net profitable, though margins remain tight.' : 'The system is currently in a drawdown phase.'}`);
    if (_avgLoss > _avgWin * 1.3) {
      keyInsights.push(`The average loss (-${_avgLoss.toFixed(1)}%) is ${(_avgLoss / _avgWin).toFixed(1)}x the average win (+${_avgWin.toFixed(1)}%), indicating the system wins frequently but gives back gains on losing trades. Active stop-loss optimization is in progress to reduce loss severity.`);
    } else {
      keyInsights.push(`The system maintains a healthy risk profile with average wins of +${_avgWin.toFixed(1)}% and average losses of -${_avgLoss.toFixed(1)}%.`);
    }
    if (_n(bs.total) > 0) {
      const _blockRate = ((_n(bs.total) / (_n(bs.total) + summaryAll.trades)) * 100).toFixed(0);
      keyInsights.push(`The AI Risk Shield has filtered ${_blockRate}% of all incoming signals, blocking ${_n(bs.total).toLocaleString()} low-quality setups and saving an estimated $${_n(bs.capitalSaved).toLocaleString()} in potential losses. Only signals that pass multi-dimensional analysis are executed.`);
    }
    if (_longDir && _shortDir) {
      const _lp = _n(_longDir.pnl); const _sp = _n(_shortDir.pnl);
      if (_lp > 0 && _sp > 0) keyInsights.push(`The system is profitable in both directions — LONG (+$${_lp.toLocaleString()}) and SHORT (+$${_sp.toLocaleString()}) — demonstrating the ability to capture opportunities in any market condition.`);
      else if (_lp > 0) keyInsights.push(`LONG positions are the primary profit driver (+$${_lp.toLocaleString()}), while SHORT performance ($${_sp.toLocaleString()}) is being optimized through improved entry timing and trend confirmation.`);
    }
    if (weeklyProgress.length >= 4) {
      const _recent = weeklyProgress.slice(-2); const _earlier = weeklyProgress.slice(0, 2);
      const _rWR = _recent.reduce((s, w) => s + _n(w.winRate), 0) / _recent.length;
      const _eWR = _earlier.reduce((s, w) => s + _n(w.winRate), 0) / _earlier.length;
      if (_rWR > _eWR) keyInsights.push(`The AI model shows continuous improvement — recent win rate of ${_rWR.toFixed(1)}% is up from ${_eWR.toFixed(1)}% in the earliest period, reflecting ongoing learning and strategy refinement.`);
    }

    return {
      period,
      keyInsights,
      summary: { overall: summaryAll, stable: summaryStable, aggressive: summaryAggressive },
      aiDecisionQuality: {
        highConfTrades: highConf[0]?.trades || 0, highConfWinRate: highConf[0]?.wr || 0, highConfPnl: highConf[0]?.pnl || 0,
        lowConfTrades: lowConf[0]?.trades || 0, lowConfWinRate: lowConf[0]?.wr || 0, lowConfPnl: lowConf[0]?.pnl || 0,
        weeklyAccuracy: weeklyAcc.map(w => ({ week: w.week, winRate: w.winRate, avgScore: w.avgScore })),
        scoreBuckets: scoreBuckets.map(b => ({ bucket: b.bucket, trades: b.trades, winRate: b.winRate, avgPnl: b.avgPnl, totalPnl: b.totalPnl })),
        sourcePerformance: sourcePerf.map(s => ({ source: s.source || 'UNKNOWN', trades: s.trades, winRate: s.winRate, pnl: s.pnl })),
      },
      aiMarketAdaptation: { regimeDirection: regimeDirection.map(r => ({ regime: r.regime, direction: r.direction, trades: r.trades, winRate: r.winRate, pnl: r.pnl })) },
      aiRiskShield: {
        signalsScanned: (bs.total || 0) + summaryAll.trades, tradesBlocked: bs.total || 0,
        blockAccuracy: bs.checked > 0 ? +((bs.correctBlocks / bs.checked) * 100).toFixed(1) : 0,
        capitalSaved: bs.capitalSaved || 0,
        topRules: blockRules.map(r => ({ rule: r.name, blocked: r.blocked, accuracy: r.accuracy })),
      },
      marketRegime: regimeRows.map(r => ({ regime: r.regime, trades: r.trades, winRate: r.winRate, pnl: r.pnl, avgPnl: r.avgPnl })),
      direction: dirRows.map(d => ({ direction: d.direction, trades: d.trades, winRate: d.winRate, pnl: d.pnl, avgHoldMin: d.avgHoldMin })),
      tokenLeaderboard: { top: topTokens, bottom: bottomTokens },
      durationAnalysis: durationRows,
      exitAnalysis: exitRows,
      timePerformance: timePerf,
      riskMetrics: {
        maxDrawdown: summaryAll.maxDrawdown, maxDrawdownDuration: 0,
        recoveryFactor: summaryAll.maxDrawdown < 0 ? +(-summaryAll.totalPnl / summaryAll.maxDrawdown).toFixed(1) : 0,
        worstDay, bestDay, avgRiskPerTrade: avgRisk[0]?.avgRisk || 0,
      },
      aiLearning: {
        weeklyProgress: weeklyProgress.map(w => ({ week: w.week, winRate: w.winRate, profitFactor: w.profitFactor, avgLoss: w.avgLoss || 0 })),
        modelVersion, lastRetrained, dimAccuracy: dimAccuracy.slice(0, 15),
      },
    };
}

// 每天凌晨1点刷新所有report缓存
function _scheduleReportRefresh() {
  const DatabaseService = require('../services/databaseService');
  const periods = ['7d', '30d', '90d', 'all'];
  const strategies = ['all', 'stable', 'aggressive'];
  const refreshAll = async () => {
    console.log('[Report] 开始刷新 report 缓存...');
    for (const p of periods) {
      for (const s of strategies) {
        try {
          const data = await _computeReport(DatabaseService, p, s);
          await DatabaseService.query(
            `INSERT INTO paper_trade_learning (env, strategy, category, key_name, data)
             VALUES ('global','','report_cache',?,?)
             ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=NOW()`,
            [_reportCacheKey(p, s), JSON.stringify(data)]
          );
          console.log(`[Report] 缓存已更新: ${p}/${s}`);
        } catch (e) { console.error(`[Report] 缓存刷新失败 ${p}/${s}:`, e.message); }
      }
    }
  };
  // 立即预热一次（启动后延迟30s，避免影响启动速度）
  setTimeout(refreshAll, 30 * 1000);
  // 每天凌晨1:00刷新
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(1, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const msUntil = next - now;
    setTimeout(() => { refreshAll().finally(() => scheduleNext()); }, msUntil);
  };
  scheduleNext();
}
_scheduleReportRefresh();

/**
 * GET /api/paper-trade/report
 * 交易分析报告 — 10个Section的聚合数据（每日缓存，所有用户共享）
 * ?period=7d|30d|90d|all &strategy=all|stable|aggressive
 */
router.get('/report', async (req, res) => {
  try {
    const DatabaseService = require('../services/databaseService');
    const period = ['7d', '30d', '90d', 'all'].includes(req.query.period) ? req.query.period : '30d';
    const strategyFilter = ['all', 'stable', 'aggressive'].includes(req.query.strategy) ? req.query.strategy : 'all';
    const cacheKey = _reportCacheKey(period, strategyFilter);

    // 读DB缓存（24h有效）
    const cached = await DatabaseService.query(
      `SELECT data, updated_at FROM paper_trade_learning
       WHERE env='global' AND strategy='' AND category='report_cache' AND key_name=?
       AND updated_at >= DATE_SUB(NOW(), INTERVAL ? HOUR) LIMIT 1`,
      [cacheKey, REPORT_CACHE_TTL_H]
    );

    if (cached && cached.length > 0) {
      const data = typeof cached[0].data === 'string' ? JSON.parse(cached[0].data) : cached[0].data;
      return res.json({ success: true, cached: true, cachedAt: cached[0].updated_at, data });
    }

    // 缓存未命中：实时计算并写入缓存
    const data = await _computeReport(DatabaseService, period, strategyFilter);
    try {
      await DatabaseService.query(
        `INSERT INTO paper_trade_learning (env, strategy, category, key_name, data)
         VALUES ('global','','report_cache',?,?)
         ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=NOW()`,
        [cacheKey, JSON.stringify(data)]
      );
    } catch (e) { /* 缓存写入失败不影响返回 */ }

    res.json({ success: true, cached: false, data });
  } catch (e) {
    console.error('[paperTradeRoutes] /report error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/paper-trade/hl-regime
 * Trader Regime Map: 当前BTC机制 + 高edge archetype的4h开仓方向偏向
 */
router.get('/hl-regime', async (req, res) => {
  try {
    const DatabaseService = require('../services/databaseService');

    // 1. 获取当前BTC 4h涨跌幅 → 判断regime
    let btcTrend = 'NEUTRAL';
    try {
      const btcRows = await DatabaseService.query(`
        SELECT btc_price FROM hl_market_snapshots
        ORDER BY snapshot_time DESC LIMIT 2
      `);
      if (btcRows.length >= 2) {
        const latest = parseFloat(btcRows[0].btc_price);
        const prev = parseFloat(btcRows[1].btc_price);
        const chg = prev > 0 ? (latest - prev) / prev * 100 : 0;
        if (chg > 2) btcTrend = 'BULL';
        else if (chg < -2) btcTrend = 'BEAR';
      }
    } catch (e) {}

    // 2. 根据机制确定高edge archetype
    const regimeMap = {
      BULL: { regime: 'BTC_PUMP', archetype: 'TREND_LONG', note: 'WR 76.6% in PUMP' },
      BEAR: { regime: 'BTC_DUMP', archetype: 'TREND_SHORT', note: 'Directional followers in DUMP' },
      NEUTRAL: { regime: 'BTC_RANGE', archetype: 'XYZ_SPECIALIST', note: 'WR 61.5%, +$1.16M in RANGE' },
    };
    const { regime, archetype, note } = regimeMap[btcTrend] || regimeMap.NEUTRAL;

    // 3. 查询该archetype最近4h开仓方向 + 各archetype近4h活跃度
    const [fillsRow, archetypeRows] = await Promise.all([
      DatabaseService.query(`
        SELECT
          SUM(CASE WHEN f.dir = 'Open Long'  THEN 1 ELSE 0 END) AS longs,
          SUM(CASE WHEN f.dir = 'Open Short' THEN 1 ELSE 0 END) AS shorts,
          COUNT(*) AS total
        FROM hl_trader_fills f
        JOIN hl_traders t ON f.address = t.address
        WHERE t.archetype = ?
          AND f.fill_time > DATE_SUB(NOW(), INTERVAL 4 HOUR)
          AND t.sync_status = 'ACTIVE'
      `, [archetype]),
      DatabaseService.query(`
        SELECT t.archetype,
          SUM(CASE WHEN f.dir = 'Open Long'  THEN 1 ELSE 0 END) AS longs,
          SUM(CASE WHEN f.dir = 'Open Short' THEN 1 ELSE 0 END) AS shorts,
          COUNT(*) AS total_fills
        FROM hl_trader_fills f
        JOIN hl_traders t ON f.address = t.address
        WHERE f.fill_time > DATE_SUB(NOW(), INTERVAL 4 HOUR)
          AND t.sync_status = 'ACTIVE'
        GROUP BY t.archetype
        ORDER BY total_fills DESC
      `),
    ]);

    const row = fillsRow[0] || {};
    const longs = parseInt(row.longs || 0);
    const shorts = parseInt(row.shorts || 0);
    const opens = longs + shorts;
    const longBias = opens > 0 ? longs / opens : 0.5;

    let signal = 'neutral', score = 0;
    if (opens >= 5) {
      if (longBias > 0.65) { signal = 'long'; score = 2; }
      else if (longBias < 0.35) { signal = 'short'; score = -2; }
    }

    res.json({
      success: true,
      data: {
        btcTrend, regime, archetype, note,
        longs, shorts, opens, longBias: Math.round(longBias * 100),
        signal, score,
        archetypes: archetypeRows.map(r => ({
          archetype: r.archetype,
          longs: parseInt(r.longs || 0),
          shorts: parseInt(r.shorts || 0),
          total: parseInt(r.total_fills || 0),
          bias: (parseInt(r.longs || 0) + parseInt(r.shorts || 0)) > 0
            ? Math.round(parseInt(r.longs || 0) / (parseInt(r.longs || 0) + parseInt(r.shorts || 0)) * 100)
            : 50,
        })),
      },
    });
  } catch (e) {
    console.error('[paperTradeRoutes] /hl-regime error:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── [2026-09-04] Sibyl Memory Dashboard ─────────────────────────────────────
// 黑客松演示用: 展示 LearningEngine 从 Sibyl Memory 中回忆出的交易经验
// 访问: GET /api/paper-trade/memory-dashboard
router.get('/memory-dashboard', async (req, res) => {
  try {
    const strategy = req.query.strategy || 'stable';
    const svc = getService(strategy);
    // stable策略: PaperTradeService.learningEngine (autoTrade/LearningEngine.js)
    // aggressive策略: alpha-paper-trader-v7 的内嵌LearningEngine (global._learningRef)
    const engine = svc?.learningEngine || (strategy === 'aggressive' ? global._learningRef : null);

    let weights = [], lessons = [], combos = [], storageType = 'unknown', recallDemo = [];

    if (engine) {
      storageType = engine.storage?.type || 'unknown';
      weights = engine.getAllWeights ? engine.getAllWeights() : [];
      // 最近10条交易教训
      try {
        const lessonItems = await engine.storage.list('trade_lesson', { limit: 10 });
        lessons = lessonItems.map(i => i.data).filter(Boolean);
      } catch (e) {}
      // combo stats摘要
      combos = Object.entries(engine.comboStats || {}).slice(0, 15).map(([key, envData]) => {
        let wins = 0, losses = 0;
        for (const e of Object.values(envData)) { wins += e.wins || 0; losses += e.losses || 0; }
        const wr = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 'N/A';
        return { key, wins, losses, wr };
      });
      // [2026-09-05] Sibyl Memory Recall 演示: 搜索最近3个token的历史记忆
      if (storageType === 'sibyl' && engine.storage?.search) {
        const recentSymbols = [...new Set(lessons.slice(0, 5).map(l => l.symbol).filter(Boolean))].slice(0, 3);
        for (const sym of recentSymbols) {
          const base = sym.replace('USDT', '');
          try {
            const recalled = engine.storage.search(base, 'trade_lesson', 5);
            if (recalled.length > 0) {
              recallDemo.push({ symbol: base, count: recalled.length, items: recalled.map(r => r.data).filter(Boolean) });
            }
          } catch (e) {}
        }
      }
    }

    const DIM_MAP = {
      'SM': 'Smart Money', '散户': 'Retail Ratio', '大户': 'Whale Ratio', '大户趋势': 'Whale Trend',
      'K线': 'Candlestick', 'K线趋势': 'K-line Trend', 'K趋势': 'K Trend', 'EMA': 'EMA Channel',
      '9EMA': '9EMA', 'MTF': 'Multi-TF', 'TT': 'Top Trader', 'Taker': 'Taker Ratio',
      'Taker趋势': 'Taker Trend', 'BS': 'Buy/Sell', 'FR': 'Funding Rate', 'FR趋势': 'FR Trend',
      'RSI': 'RSI', 'RSI回踩': 'RSI Pullback', 'MACD': 'MACD', 'OI': 'Open Interest',
      'OI/MC': 'OI/MCap', 'OIstg': 'OI Stage', '价格位置': 'Price Position',
      '做多空间': 'Long Room', '做空空间': 'Short Room', '波动率': 'Volatility',
      '模式匹配': 'Pattern Match', 'ML预测': 'AI Prediction', '形态铁律': 'Pattern Rule',
      '双拥挤': 'Crowding', 'Surge': 'Volume Surge', 'COMBO': 'Combo Signal',
      '实时动量': 'Momentum', '关键价位': 'Key Level', '量价背离': 'Vol Divergence',
      '成交额': 'Volume', 'BTC': 'BTC Corr', 'BTC环境': 'BTC Env',
      '4H趋势': '4H Trend', '1h趋势': '1H Trend', '7日趋势': '7D Trend',
      'FOMO风险': 'FOMO Risk', 'Social': 'Social', 'Social热度': 'Social Hype',
      '历史胜率': 'Hist WR', '历史同向': 'Hist Align', '历史闪崩': 'Flash Crash',
      'BTC连阴': 'BTC Bear Run', 'BTC连阳': 'BTC Bull Run',
      'K形态': 'K Pattern', '5m插针': '5m Wick', '形态记忆': 'Pattern Mem',
      'Community Prediction': 'Community Prediction',
    };
    const EXIT_MAP = {
      'PROFIT_PROTECT': 'PROFIT_PROTECT', 'TIMEOUT': 'TIMEOUT', 'STOP_LOSS': 'STOP_LOSS',
      'TAKE_PROFIT': 'TAKE_PROFIT', 'DATA_BAIL': 'DATA_BAIL', 'MANUAL': 'MANUAL',
      '止盈保护': 'PROFIT_PROTECT', '超时': 'TIMEOUT', '止损': 'STOP_LOSS',
      '获利了结': 'TAKE_PROFIT', '数据异常': 'DATA_BAIL', '手动': 'MANUAL',
    };
    const tDim = d => DIM_MAP[d] || d.replace(/[\u4e00-\u9fff]+/g, '').trim() || d;
    const tExit = e => EXIT_MAP[e] || e.replace(/[\u4e00-\u9fff]+/g, '').trim() || e;

    const weightRows = weights.sort((a, b) => b.weight - a.weight).slice(0, 8).map(w => `
      <tr>
        <td style="color:#c9d6e8">${tDim(w.dimension)}</td>
        <td style="color:${w.weight >= 2 ? '#22c55e' : w.weight === 0 ? '#ef4444' : '#96b8d8'}">${w.weight}</td>
        <td style="color:#96b8d8">${(w.accuracy * 1).toFixed(1)}%</td>
        <td style="color:#6b9bc8">${w.sampleCount}</td>
      </tr>`).join('');

    const lessonRows = lessons.slice(0, 10).map(l => `
      <tr>
        <td style="color:#c9d6e8">${l.symbol || '-'}</td>
        <td style="color:#96b8d8">${l.direction || '-'}</td>
        <td style="color:${l.isWin ? '#22c55e' : '#ef4444'}">${l.isWin ? 'WIN' : 'LOSS'}</td>
        <td style="color:${(l.pnlPct||0)>=0?'#22c55e':'#ef4444'}">${(l.pnlPct || 0).toFixed(2)}%</td>
        <td style="color:#6b9bc8">${tExit(l.exitReason || '-')}</td>
      </tr>`).join('');

    const comboRows = combos.map(c => `
      <tr>
        <td style="font-size:11px;color:#96b8d8">${c.key}</td>
        <td style="color:#c9d6e8">${c.wins}</td>
        <td style="color:#c9d6e8">${c.losses}</td>
        <td style="color:${parseFloat(c.wr) >= 60 ? '#22c55e' : parseFloat(c.wr) < 40 ? '#ef4444' : '#96b8d8'}">${c.wr}%</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Galeon — Memory Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a2744; color: #c9d6e8; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; min-height: 100vh; }
    .layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
    .sidebar { background: #10192c; border-right: 1px solid #1e3356; padding: 24px 16px; }
    .sidebar-logo { font-size: 13px; font-weight: 600; color: #c9d6e8; letter-spacing: -0.01em; margin-bottom: 28px; }
    .sidebar-logo span { font-size: 11px; color: #5a7fa8; font-weight: 400; display: block; margin-top: 1px; }
    .nav-label { font-size: 10px; letter-spacing: 0.08em; color: #3a5a7a; margin-bottom: 6px; padding: 0 8px; }
    .nav-item { display: block; padding: 6px 8px; border-radius: 4px; font-size: 13px; color: #6b9bc8; text-decoration: none; margin-bottom: 1px; }
    .nav-item:hover { background: #1e3356; color: #96b8d8; }
    .nav-item.active { background: #1e3356; color: #c9d6e8; }
    .sidebar-meta { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1e3356; }
    .meta-row { display: flex; justify-content: space-between; font-size: 11px; color: #3a5a7a; margin-bottom: 5px; }
    .meta-row span:last-child { color: #5a7fa8; font-family: monospace; }
    .main { padding: 32px 40px; }
    .page-header { margin-bottom: 28px; }
    .page-header h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: #c9d6e8; }
    .page-header p { font-size: 12px; color: #5a7fa8; margin-top: 4px; font-family: monospace; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
    .stat-card { background: #1e3356; border: 1px solid #2a4a72; border-radius: 6px; padding: 16px; }
    .stat-card .num { font-size: 28px; font-weight: 600; letter-spacing: -0.03em; color: #c9d6e8; line-height: 1; }
    .stat-card .label { font-size: 11px; color: #3a5a7a; margin-top: 6px; letter-spacing: 0.02em; }
    .section { margin-bottom: 24px; }
    .section-header { font-size: 11px; letter-spacing: 0.08em; color: #3a5a7a; margin-bottom: 10px; }
    .recall-block { background: #1e3356; border: 1px solid #2a4a72; border-radius: 6px; padding: 14px 16px; margin-bottom: 16px; }
    .recall-block .rb-title { font-size: 13px; font-weight: 500; color: #96b8d8; margin-bottom: 4px; }
    .recall-block .rb-body { font-size: 12px; color: #6b9bc8; line-height: 1.7; }
    .recall-block .rb-body b { color: #7babc8; }
    .search-result { background: #152238; border: 1px solid #253d60; border-radius: 5px; padding: 10px 12px; margin-bottom: 8px; }
    .search-result .sr-header { font-size: 12px; color: #5a7fa8; margin-bottom: 6px; font-family: monospace; }
    .search-result .sr-header b { color: #7babc8; }
    .sr-row { display: flex; gap: 12px; padding: 4px 0; font-size: 11px; font-family: monospace; border-top: 1px solid #1e3356; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .table-block { background: #1e3356; border: 1px solid #2a4a72; border-radius: 6px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { padding: 8px 14px; text-align: left; font-size: 10px; letter-spacing: 0.06em; color: #3a5a7a; font-weight: 500; border-bottom: 1px solid #253d60; }
    td { padding: 8px 14px; border-bottom: 1px solid #152238; color: #6b9bc8; font-family: monospace; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #152238; }
    .empty { padding: 20px 14px; font-size: 12px; color: #2a4a72; font-family: monospace; }
  </style>
</head>
<body>
<div class="layout">
  <div class="sidebar">
    <div class="sidebar-logo">Galeon <span>Memory Dashboard</span></div>
    <div class="nav-label">VIEWS</div>
    <a class="nav-item active">Memory Dashboard</a>
    <a class="nav-item" href="/api/paper-trade/memory-recall-demo?strategy=${strategy}">Decision Trace</a>
    <div class="sidebar-meta">
      <div class="meta-row"><span>Backend</span><span>${storageType}</span></div>
      <div class="meta-row"><span>Strategy</span><span>${strategy}</span></div>
      <div class="meta-row"><span>Updated</span><span>${new Date().toLocaleTimeString()}</span></div>
    </div>
  </div>

  <div class="main">
    <div class="page-header">
      <h1>Memory Dashboard</h1>
      <p>${new Date().toISOString()} · ${storageType === 'sibyl' ? 'Sibyl Memory' : 'MySQL'} backend</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="num">${weights.length}</div><div class="label">DIMENSION WEIGHTS</div></div>
      <div class="stat-card"><div class="num">${Object.keys(engine?.comboStats || {}).length}</div><div class="label">COMBO PATTERNS</div></div>
      <div class="stat-card"><div class="num">${lessons.length}</div><div class="label">TRADE LESSONS</div></div>
      <div class="stat-card"><div class="num">${weights.filter(w => w.weight === 2).length}</div><div class="label">STRONG SIGNALS</div></div>
    </div>

    <div class="section">
      <div class="section-header">SESSION MEMORY RECALL</div>
      <div class="recall-block">
        <div class="rb-title">Cold-start recall</div>
        <div class="rb-body">On startup, agent recalled <b>${weights.length} dimension weights</b>, <b>${Object.keys(engine?.comboStats || {}).length} combo patterns</b>, and recent trade lessons from Sibyl Memory. No retraining required — learned behavior persists across sessions.</div>
      </div>
      ${recallDemo.length > 0 ? `
      <div class="recall-block">
        <div class="rb-title">Live search — <code>search_entities(symbol)</code></div>
        <div class="rb-body" style="margin-bottom:10px">Pre-trade recall by token — available only in Sibyl mode, not replicable with SQL.</div>
        ${recallDemo.map(r => `
        <div class="search-result">
          <div class="sr-header"><b>search("${r.symbol}")</b> → ${r.count} memories</div>
          ${r.items.slice(0,3).map(l => `
          <div class="sr-row">
            <span style="color:${l.isWin?'#22c55e':'#ef4444'}">${l.isWin?'WIN':'LOSS'}</span>
            <span style="color:#96b8d8">${l.direction||'?'}</span>
            <span style="color:${(l.pnlPct||0)>=0?'#22c55e':'#ef4444'}">${(l.pnlPct||0)>=0?'+':''}${(l.pnlPct||0).toFixed(2)}%</span>
            <span style="color:#6b9bc8">${tExit(l.exitReason||'-')}</span>
            <span style="color:#3a5a7a;margin-left:auto">${l.timestamp?new Date(l.timestamp).toLocaleDateString():'-'}</span>
          </div>`).join('')}
        </div>`).join('')}
      </div>` : ''}
    </div>

    <div class="section">
      <div class="section-header">DIMENSION WEIGHTS</div>
      <div class="table-block">
        <table>
          <thead><tr><th>DIMENSION</th><th>WEIGHT</th><th>ACCURACY</th><th>SAMPLES</th></tr></thead>
          <tbody>${weightRows || `<tr><td colspan="4" class="empty">No weights loaded</td></tr>`}</tbody>
        </table>
        ${weights.length > 8 ? `<div style="padding:8px 14px;font-size:11px;color:#3a5a7a;border-top:1px solid #152238">+${weights.length - 8} more dimensions</div>` : ''}
      </div>
    </div>

    <div class="two-col">
      <div class="section">
        <div class="section-header">RECENT TRADE LESSONS</div>
        <div class="table-block">
          <table>
            <thead><tr><th>SYMBOL</th><th>DIR</th><th>RESULT</th><th>PNL</th><th>EXIT</th></tr></thead>
            <tbody>${lessonRows || `<tr><td colspan="5" class="empty">No lessons yet</td></tr>`}</tbody>
          </table>
        </div>
      </div>
      <div class="section">
        <div class="section-header">COMBO PATTERNS</div>
        <div class="table-block">
          <table>
            <thead><tr><th>PATTERN</th><th>W</th><th>L</th><th>WR</th></tr></thead>
            <tbody>${comboRows || `<tr><td colspan="4" class="empty">No patterns yet</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[paperTradeRoutes] /memory-dashboard error:', e.message);
    res.status(500).send(`<pre>Error: ${e.message}</pre>`);
  }
});

// ─── [2026-09-05] Memory Recall Demo — 模拟开仓决策全链路展示 ────────────────
// 输入 symbol，展示 AI 从 Sibyl Memory 搜索历史 → 权重加载 → 投票 → 决策 的完整过程
// 访问: GET /api/paper-trade/memory-recall-demo?symbol=HYPE
router.get('/memory-recall-demo', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'HYPE').toUpperCase();
    const fsym = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
    const baseSym = symbol.replace('USDT', '');
    const strategy = req.query.strategy || 'stable';
    const svc = getService(strategy);
    const engine = svc?.learningEngine || (strategy === 'aggressive' ? global._learningRef : null);

    if (!engine) {
      return res.status(503).send('<pre>LearningEngine not initialized. Access /api/paper-trade/overview first.</pre>');
    }

    const storageType = engine.storage?.type || 'mysql';
    const steps = [];
    const now = Date.now();

    // ─── Step 1: Memory Search (Sibyl独有) ────────────────────
    let recalled = [], recallTime = 0;
    if (storageType === 'sibyl' && engine.storage?.search) {
      const t0 = Date.now();
      recalled = engine.storage.search(baseSym, 'trade_lesson', 10);
      recallTime = Date.now() - t0;
      steps.push({
        step: 1,
        title: '🔍 Sibyl Memory Search',
        description: `search_entities("${baseSym}") → ${recalled.length} memories recalled (${recallTime}ms)`,
        status: recalled.length > 0 ? 'found' : 'empty',
        details: recalled.map(r => r.data).filter(Boolean),
      });
    } else {
      steps.push({
        step: 1,
        title: '🔍 Memory Search (MySQL fallback)',
        description: 'MySQL mode uses SQL LIKE — no full-text semantic search',
        status: 'fallback',
        details: [],
      });
    }

    // ─── Step 2: Base Chain Prediction Market Recall ──────────
    let predictionRecalled = [], predictionVotes = [];
    if (storageType === 'sibyl' && engine.storage?.search) {
      // Search with full symbol (SOLUSDT) since that's how data is stored
      predictionRecalled = engine.storage.search(fsym, 'prediction_outcome', 5);
      if (predictionRecalled.length === 0) predictionRecalled = engine.storage.search(baseSym + 'USDT', 'prediction_outcome', 5);
      for (const item of predictionRecalled) {
        const p = item.data;
        if (!p) continue;
        // 只有有实际下注的事件才生成社区 vote
        if (p.participants >= 3) {
          const wr = p.communityWinRate || 0;
          if (wr > 0.65) {
            predictionVotes.push({ dim: 'Community Prediction', score: 1, reason: `${baseSym} community win rate ${(wr*100).toFixed(0)}% (${p.participants} bettors, Base chain)` });
          } else if (wr < 0.3) {
            predictionVotes.push({ dim: 'Community Prediction', score: -1, reason: `${baseSym} community win rate low ${(wr*100).toFixed(0)}% (${p.participants} bettors, Base chain)` });
          }
        }
      }
    }
    const predictionData = predictionRecalled.map(r => r.data).filter(Boolean);
    steps.push({
      step: 2,
      title: '🔗 Base Chain Prediction Market',
      description: predictionData.length > 0
        ? `Sibyl recalled ${predictionData.length} Base chain settlement(s) for ${baseSym} → ${predictionVotes.length} community vote(s)`
        : `No Base prediction history for ${baseSym} yet`,
      status: predictionData.length > 0 ? 'base' : 'empty',
      details: predictionData,
    });

    // ─── Step 3: 分析历史记忆 → 生成投票 ─────────────────────
    const memoryVotes = [];
    const recentLessons = recalled.map(r => r.data).filter(l => l && l.timestamp && (now - l.timestamp < 48 * 60 * 60 * 1000));

    // 近24h止损
    const recentSL = recentLessons.filter(l => !l.isWin && l.exitReason === 'STOP_LOSS' && (l.pnlPct || 0) < -5 && (now - l.timestamp < 24 * 60 * 60 * 1000));
    if (recentSL.length > 0) {
      memoryVotes.push({ dim: 'Flash Crash', score: -2, reason: `${baseSym}: ${recentSL.length} stop-loss hit within 24h (recalled from Sibyl)` });
    }

    // 48h胜率
    const wins48h = recentLessons.filter(l => l.isWin).length;
    const losses48h = recentLessons.filter(l => !l.isWin).length;
    if (wins48h + losses48h >= 3) {
      const wr = wins48h / (wins48h + losses48h);
      if (wr < 0.3) memoryVotes.push({ dim: 'Historical WR', score: -2, reason: `${baseSym} 48h win rate ${(wr*100).toFixed(0)}% (${wins48h}/${wins48h+losses48h})` });
      else if (wr >= 0.7) memoryVotes.push({ dim: 'Historical WR', score: 1, reason: `${baseSym} 48h win rate ${(wr*100).toFixed(0)}% — strong` });
    }

    // 全量历史统计
    const allLessons = recalled.map(r => r.data).filter(Boolean);
    const allWins = allLessons.filter(l => l.isWin).length;
    const allLosses = allLessons.filter(l => !l.isWin).length;
    const avgPnl = allLessons.length > 0 ? (allLessons.reduce((s, l) => s + (l.pnlPct || 0), 0) / allLessons.length) : 0;

    const allMemoryVotes = [...memoryVotes, ...predictionVotes];
    steps.push({
      step: 3,
      title: '📖 Memory Analysis → Vote Generation',
      description: `Trade history: ${allWins}W/${allLosses}L, avg PnL ${avgPnl.toFixed(2)}% · Community signals: ${predictionVotes.length} vote(s)`,
      status: allMemoryVotes.length > 0 ? 'active' : 'neutral',
      details: allMemoryVotes,
    });

    // ─── Step 4: 权重加载 ────────────────────────────────────
    const weights = engine.getAllWeights ? engine.getAllWeights() : [];
    const topWeights = weights.sort((a, b) => b.weight - a.weight).slice(0, 10);

    steps.push({
      step: 4,
      title: '⚖️ Dimension Weights (Loaded from Sibyl)',
      description: `${weights.length} dimension weights loaded from ${storageType === 'sibyl' ? 'Sibyl Memory' : 'MySQL'}`,
      status: 'loaded',
      details: topWeights,
    });

    // ─── Step 4: Pattern Memory ──────────────────────────────
    let patternDecision = null;
    try {
      // 用一个常见的 pattern key 尝试查询
      const testPatterns = ['LONG_Lo_Buy_smYes', 'LONG_Hi_Sell_smNo', 'SHORT_Hi_Sell_smLarge'];
      for (const p of testPatterns) {
        const pd = await engine.getPatternDecision(p);
        if (pd) { patternDecision = { pattern: p, ...pd }; break; }
      }
    } catch (e) {}

    steps.push({
      step: 5,
      title: '🎯 Combo Pattern Check (Learned from History)',
      description: patternDecision
        ? `Pattern ${patternDecision.pattern}: WR=${(patternDecision.winRate*100).toFixed(0)}% (${patternDecision.samples} samples) → ${patternDecision.action}`
        : 'No learned pattern for this token yet',
      status: patternDecision ? patternDecision.action : 'none',
      details: patternDecision ? [patternDecision] : [],
    });

    // ─── Step 6: 最终决策模拟 ─────────────────────────────────
    const baseScore = 6;
    const memoryPenalty = memoryVotes.reduce((s, v) => s + v.score, 0);
    const predictionBonus = predictionVotes.reduce((s, v) => s + v.score, 0);
    const patternBonus = patternDecision ? patternDecision.score : 0;
    const finalScore = baseScore + memoryPenalty + predictionBonus + patternBonus;
    const decision = finalScore >= 4 ? 'ALLOW' : finalScore >= 1 ? 'REDUCE_SIZE' : 'BLOCK';

    steps.push({
      step: 6,
      title: '🧠 Final Decision',
      description: `Base score: ${baseScore} + Memory: ${memoryPenalty >= 0 ? '+' : ''}${memoryPenalty} + Community (Base): ${predictionBonus >= 0 ? '+' : ''}${predictionBonus} + Pattern: ${patternBonus >= 0 ? '+' : ''}${patternBonus} = ${finalScore}`,
      status: decision,
      details: { baseScore, memoryPenalty, predictionBonus, patternBonus, finalScore, decision },
    });

    // ─── Render HTML ──────────────────────────────────────────
    const stepHtml = steps.map(s => {
      const isBase = s.step === 2;
      const isFinal = s.step === 6;

      let detailHtml = '';
      if (s.step === 1 && s.details.length > 0) {
        detailHtml = `<div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">` + s.details.map(l => `
          <div style="display:flex;align-items:center;gap:12px;padding:6px 10px;background:#243044;border-radius:4px;font-size:12px;font-family:monospace">
            <span style="color:${l.isWin ? '#22c55e' : '#ef4444'};width:40px">${l.isWin ? 'WIN' : 'LOSS'}</span>
            <span style="color:#7b95b4">${l.direction || '?'}</span>
            <span style="color:${(l.pnlPct||0)>=0?'#22c55e':'#ef4444'};width:60px">${(l.pnlPct||0)>=0?'+':''}${(l.pnlPct||0).toFixed(2)}%</span>
            <span style="color:#637898">${l.exitReason||'-'}</span>
            <span style="color:#4a6080;margin-left:auto">${l.timestamp ? new Date(l.timestamp).toLocaleDateString() : '-'}</span>
          </div>`).join('') + `</div>`;
      } else if (s.step === 2 && s.details.length > 0) {
        detailHtml = `<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">` + s.details.map(p => `
          <div style="display:flex;align-items:center;gap:12px;padding:7px 10px;background:#243044;border-radius:4px;font-size:12px;font-family:monospace;border-left:2px solid #d97706">
            <span style="color:#d97706;font-size:10px;letter-spacing:0.05em">BASE</span>
            <span style="color:#c9d1e0">${p.symbol}</span>
            <span style="color:#7b95b4">${p.direction}</span>
            <span style="color:${(p.actualPnlPct||0)>=0?'#22c55e':'#ef4444'}">${(p.actualPnlPct||0)>=0?'+':''}${(p.actualPnlPct||0).toFixed(2)}%</span>
            <span style="color:#637898">Community WR ${((p.communityWinRate||0)*100).toFixed(0)}%</span>
            <span style="color:#637898">${p.participants||0} bettors</span>
            <span style="color:#4a6080;margin-left:auto">${p.settledAt ? new Date(p.settledAt).toLocaleDateString() : ''}</span>
          </div>`).join('') + `</div>`;
      } else if (s.step === 3 && s.details.length > 0) {
        detailHtml = `<div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">` + s.details.map(v => `
          <div style="display:flex;align-items:center;gap:12px;padding:6px 10px;background:#243044;border-radius:4px;font-size:12px">
            <span style="color:${v.score > 0 ? '#22c55e' : '#ef4444'};font-family:monospace;width:24px">${v.score > 0 ? '+' + v.score : v.score}</span>
            <span style="color:#96a3b5;font-weight:500">${v.dim}</span>
            <span style="color:#637898">${v.reason}</span>
          </div>`).join('') + `</div>`;
      } else if (s.step === 4 && s.details.length > 0) {
        detailHtml = `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:5px">` + s.details.map(w => `
          <span style="font-size:11px;padding:3px 9px;border-radius:3px;background:#16202f;border:1px solid ${w.weight >= 2 ? '#166534' : w.weight === 0 ? '#7f1d1d' : '#2e3d54'};color:${w.weight >= 2 ? '#22c55e' : w.weight === 0 ? '#ef4444' : '#7b95b4'};font-family:monospace">
            ${w.dimension} <span style="opacity:0.6">${w.weight}</span>
          </span>`).join('') + `</div>`;
      } else if (s.step === 6) {
        const d = s.details;
        const dc = d.decision === 'ALLOW' ? '#22c55e' : d.decision === 'BLOCK' ? '#ef4444' : '#f59e0b';
        detailHtml = `
          <div style="margin-top:14px;padding:20px 24px;background:#16202f;border-radius:6px;border:1px solid ${d.decision === 'ALLOW' ? '#14532d' : d.decision === 'BLOCK' ? '#7f1d1d' : '#78350f'}">
            <div style="font-size:11px;letter-spacing:0.1em;color:#637898;margin-bottom:8px">DECISION</div>
            <div style="font-size:24px;font-weight:700;color:${dc};letter-spacing:-0.02em">${d.decision === 'ALLOW' ? 'Entry Allowed' : d.decision === 'BLOCK' ? 'Entry Blocked' : 'Reduce Size'}</div>
            <div style="margin-top:12px;display:flex;gap:20px;font-size:12px;font-family:monospace">
              <span style="color:#637898">Base <span style="color:#96a3b5">${d.baseScore}</span></span>
              <span style="color:#637898">Memory <span style="color:${d.memoryPenalty>=0?'#22c55e':'#ef4444'}">${d.memoryPenalty>=0?'+':''}${d.memoryPenalty}</span></span>
              <span style="color:#637898">Community <span style="color:#d97706">${d.predictionBonus>=0?'+':''}${d.predictionBonus}</span></span>
              <span style="color:#637898">Pattern <span style="color:#96a3b5">${d.patternBonus>=0?'+':''}${d.patternBonus}</span></span>
              <span style="color:#637898">= <span style="color:${dc};font-weight:700">${d.finalScore}</span></span>
            </div>
            <div style="margin-top:6px;font-size:11px;color:#4a6080">threshold: ≥4 allow · 1–3 reduce · ≤0 block</div>
          </div>`;
      }

      const stepLabel = isBase ? 'BASE CHAIN' : isFinal ? 'DECISION' : `STEP ${s.step}`;
      const labelColor = isBase ? '#d97706' : isFinal ? '#7b95b4' : '#4a6080';

      return `
        <div style="display:flex;gap:0;margin-bottom:2px">
          <div style="display:flex;flex-direction:column;align-items:center;margin-right:14px;padding-top:16px">
            <div style="width:6px;height:6px;border-radius:50%;background:${isBase?'#d97706':isFinal?'#7b95b4':'#2e3d54'};flex-shrink:0"></div>
            <div style="width:1px;flex:1;background:#2e3d54;margin-top:4px"></div>
          </div>
          <div style="flex:1;padding:14px 0 20px">
            <div style="font-size:10px;letter-spacing:0.08em;color:${labelColor};margin-bottom:5px">${stepLabel}</div>
            <div style="font-size:14px;font-weight:600;color:#c9d1e0;margin-bottom:4px">${s.title.replace(/[🔍🔗📖⚖️🎯🧠]/g,'').trim()}</div>
            <div style="font-size:13px;color:#7b95b4;line-height:1.5">${s.description}</div>
            ${detailHtml}
          </div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Galeon — Decision Trace: ${baseSym}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a2744; color: #c9d6e8; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; min-height: 100vh; }
    .layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
    .sidebar { background: #10192c; border-right: 1px solid #1e3356; padding: 24px 16px; }
    .sidebar-logo { font-size: 13px; font-weight: 600; color: #c9d6e8; letter-spacing: -0.01em; margin-bottom: 28px; display: flex; align-items: center; gap: 8px; }
    .sidebar-logo span { font-size: 11px; color: #5a7fa8; font-weight: 400; }
    .nav-label { font-size: 10px; letter-spacing: 0.08em; color: #3a5a7a; margin-bottom: 6px; padding: 0 8px; }
    .nav-item { display: block; padding: 6px 8px; border-radius: 4px; font-size: 13px; color: #6b9bc8; text-decoration: none; cursor: pointer; margin-bottom: 1px; }
    .nav-item:hover { background: #1e3356; color: #96b8d8; }
    .nav-item.active { background: #1e3356; color: #c9d6e8; }
    .meta { margin-top: 32px; padding-top: 24px; border-top: 1px solid #1e3356; }
    .meta-row { display: flex; justify-content: space-between; font-size: 11px; color: #3a5a7a; margin-bottom: 4px; }
    .meta-row span:last-child { color: #5a7fa8; }
    .main { padding: 32px 40px; max-width: 760px; }
    .header { margin-bottom: 28px; }
    .header h1 { font-size: 20px; font-weight: 600; color: #c9d6e8; letter-spacing: -0.02em; }
    .header-sub { font-size: 13px; color: #5a7fa8; margin-top: 4px; font-family: monospace; }
    .search-row { display: flex; gap: 8px; margin-bottom: 36px; padding: 12px; background: #10192c; border: 1px solid #1e3356; border-radius: 6px; }
    .search-row input { flex: 1; background: transparent; border: none; outline: none; color: #c9d6e8; font-size: 13px; font-family: monospace; }
    .search-row input::placeholder { color: #3a5a7a; }
    .search-row button { background: #1e3356; border: 1px solid #2a4a72; color: #96b8d8; border-radius: 4px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
    .search-row button:hover { background: #254268; color: #c9d6e8; }
    .context-bar { display: flex; gap: 20px; margin-bottom: 28px; padding: 12px 16px; background: #10192c; border: 1px solid #1e3356; border-radius: 6px; }
    .context-item { font-size: 12px; }
    .context-item .label { color: #3a5a7a; margin-bottom: 2px; }
    .context-item .value { color: #96b8d8; font-family: monospace; }
    .section-title { font-size: 11px; letter-spacing: 0.08em; color: #3a5a7a; margin-bottom: 16px; }
    .footer-note { margin-top: 28px; padding: 14px 16px; background: #10192c; border: 1px solid #1e3356; border-radius: 6px; }
    .footer-note .fn-title { font-size: 11px; letter-spacing: 0.06em; color: #5a7fa8; margin-bottom: 6px; }
    .footer-note p { font-size: 12px; color: #5a7fa8; line-height: 1.7; }
    .footer-note b { color: #6b9bc8; }
    code { font-family: monospace; font-size: 11px; color: #6b9bc8; background: #1e3356; padding: 1px 5px; border-radius: 3px; }
  </style>
</head>
<body>
<div class="layout">
  <div class="sidebar">
    <div class="sidebar-logo">Galeon <span>by Sibyl Memory</span></div>
    <div class="nav-label">VIEWS</div>
    <a class="nav-item" href="/api/paper-trade/memory-dashboard?strategy=${strategy}">Memory Dashboard</a>
    <a class="nav-item active">Decision Trace</a>
    <div class="meta">
      <div class="meta-row"><span>Storage</span><span>${storageType.toUpperCase()}</span></div>
      <div class="meta-row"><span>Strategy</span><span>${strategy}</span></div>
      <div class="meta-row"><span>Symbol</span><span>${baseSym}</span></div>
    </div>
  </div>
  <div class="main">
    <div class="header">
      <h1>Decision Trace — ${baseSym}USDT</h1>
      <div class="header-sub">${new Date().toISOString()}</div>
    </div>

    <div class="search-row">
      <input type="text" id="sym" value="${baseSym}" placeholder="Enter symbol e.g. SOL, HYPE, BTC" onkeydown="if(event.key==='Enter')go()"/>
      <button onclick="go()">Run</button>
    </div>
    <script>function go(){location.href='?symbol='+document.getElementById('sym').value+'&strategy=${strategy}'}</script>

    <div class="context-bar">
      <div class="context-item"><div class="label">MEMORIES RECALLED</div><div class="value">${recalled.length}</div></div>
      <div class="context-item"><div class="label">BASE SETTLEMENTS</div><div class="value">${predictionData.length}</div></div>
      <div class="context-item"><div class="label">DIMENSION WEIGHTS</div><div class="value">${weights.length}</div></div>
      <div class="context-item"><div class="label">RECALL TIME</div><div class="value">${recallTime}ms</div></div>
      <div class="context-item"><div class="label">ACTIVE VOTES</div><div class="value">${allMemoryVotes.length}</div></div>
    </div>

    <div class="section-title">DECISION CHAIN</div>

    ${stepHtml}

    <div class="footer-note">
      <div class="fn-title">WHY MEMORY IS LOAD-BEARING</div>
      <p>Without Sibyl: <b>0 recalled memories</b>, default weights, no Base chain community data — agent is stateless.<br>
      With Sibyl: <b>${recalled.length} trade memories</b> + <b>${predictionData.length} Base chain settlements</b> recalled in ${recallTime}ms, ${allMemoryVotes.length} vote(s) applied, learned weights shape every dimension score.</p>
    </div>
  </div>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[paperTradeRoutes] /memory-recall-demo error:', e.message);
    res.status(500).send(`<pre>Error: ${e.message}</pre>`);
  }
});

module.exports = router;

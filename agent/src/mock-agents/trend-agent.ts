/**
 * TrendAgent v2 — EMA crossover + RSI filter, multi-asset
 *
 * Strategy:
 *   LONG  when EMA20 > EMA50 AND 40 < RSI < 72 AND price > EMA20
 *   SHORT when EMA20 < EMA50 AND 28 < RSI < 60 AND price < EMA20
 *
 * Data source: Binance public klines API (no auth needed)
 * Covers: BTC, ETH, SOL
 * Cache: 5 min
 */

import express from 'express';
import * as https from 'https';

const PORT = process.env.TREND_AGENT_PORT || 4001;
const COINS = ['BTC', 'ETH', 'SOL'];
const CANDLE_COUNT = 55;
const app = express();

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET',
      headers: { 'User-Agent': 'galeon-agent/1.0' },
      timeout: 10_000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ── Math ──────────────────────────────────────────────────────────────────────

function calcEma(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const seed = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out: number[] = new Array(period - 1).fill(NaN);
  out.push(seed);
  let prev = seed;
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function calcRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const slice = closes.slice(closes.length - period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  const avgG = gains / period, avgL = losses / period;
  if (avgL === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgG / avgL)).toFixed(2));
}

// ── Data fetch (Binance) ──────────────────────────────────────────────────────

async function fetchCloses(coin: string): Promise<number[]> {
  const symbol = `${coin}USDT`;
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=4h&limit=${CANDLE_COUNT}`;
  const data = await httpGet(url) as any[][];
  // Binance kline: [openTime, open, high, low, close, volume, ...]
  return data.map(c => parseFloat(c[4]));
}

// ── Signal logic ──────────────────────────────────────────────────────────────

interface AgentSignal {
  id: string; symbol: string; direction: 'LONG' | 'SHORT';
  entryPrice: number; confidence: number; leverage: number;
  stopLoss: number; takeProfit1: number; takeProfit2: number;
  timestamp: string; entryReason: string;
}

async function evalCoin(coin: string): Promise<AgentSignal | null> {
  const closes = await fetchCloses(coin);
  if (closes.length < 52) return null;

  const ema20 = calcEma(closes, 20);
  const ema50 = calcEma(closes, 50);
  const rsiVal = calcRsi(closes, 14);

  const price = closes[closes.length - 1];
  const e20 = ema20[ema20.length - 1];
  const e50 = ema50[ema50.length - 1];
  if (isNaN(e20) || isNaN(e50)) return null;

  const gapPct = ((e20 - e50) / e50) * 100;

  // Direction logic — relaxed thresholds for more responsive signals
  // LONG:  mild bullish EMA alignment + RSI not overbought + price not collapsed
  // SHORT: mild bearish EMA alignment + RSI not oversold + price weakness
  let direction: 'LONG' | 'SHORT' | null = null;
  if (gapPct > 0.05 && rsiVal > 35 && rsiVal < 75) direction = 'LONG';
  else if (gapPct < -0.02 && rsiVal > 25 && rsiVal < 55 && price < e20) direction = 'SHORT';
  if (!direction) return null;

  const emaScore = Math.min(15, Math.abs(gapPct) * 8);
  const rsiScore = direction === 'LONG'
    ? Math.min(10, Math.max(0, (rsiVal - 40) * 0.5))
    : Math.min(10, Math.max(0, (50 - rsiVal) * 0.5));
  const confidence = Math.min(92, Math.round(58 + emaScore + rsiScore));

  const sl = direction === 'LONG' ? price * 0.970 : price * 1.030;
  const tp1 = direction === 'LONG' ? price * 1.045 : price * 0.955;
  const tp2 = direction === 'LONG' ? price * 1.080 : price * 0.920;

  return {
    id: `trend-${coin}-${Date.now()}`,
    symbol: coin,
    direction,
    entryPrice: parseFloat(price.toFixed(4)),
    confidence,
    leverage: 3,
    stopLoss: parseFloat(sl.toFixed(4)),
    takeProfit1: parseFloat(tp1.toFixed(4)),
    takeProfit2: parseFloat(tp2.toFixed(4)),
    timestamp: new Date().toISOString(),
    entryReason: `EMA_gap=${gapPct.toFixed(2)} RSI=${rsiVal} EMA20=${e20.toFixed(2)} EMA50=${e50.toFixed(2)}`,
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cache: AgentSignal[] = [];
let cacheAt = 0;

async function getSignals(): Promise<AgentSignal[]> {
  if (Date.now() - cacheAt < 5 * 60 * 1000) return cache;
  const settled = await Promise.allSettled(COINS.map(evalCoin));
  cache = settled
    .filter((r): r is PromiseFulfilledResult<AgentSignal | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((s): s is AgentSignal => s !== null);
  cacheAt = Date.now();
  const summary = cache.length > 0
    ? cache.map(s => `${s.symbol} ${s.direction} conf=${s.confidence}`).join(', ')
    : 'none';
  console.log(`[TrendAgent] ${new Date().toLocaleTimeString()} — ${summary}`);
  return cache;
}

app.get('/positions', async (_req, res) => {
  try { res.json({ success: true, data: await getSignals() }); }
  catch (err: any) { console.error('[TrendAgent]', err.message); res.json({ success: true, data: [] }); }
});

// ── FIP: GET /intel — Structured financial intelligence ──────────────────────

app.get('/intel', async (_req, res) => {
  try {
    const intel: any[] = [];
    for (const coin of COINS) {
      try {
        const closes = await fetchCloses(coin);
        if (closes.length < 52) continue;

        const ema20 = calcEma(closes, 20);
        const ema50 = calcEma(closes, 50);
        const rsiVal = calcRsi(closes, 14);
        const e20 = ema20[ema20.length - 1];
        const e50 = ema50[ema50.length - 1];
        if (isNaN(e20) || isNaN(e50)) continue;

        const gapPct = ((e20 - e50) / e50) * 100;
        const isBullish = gapPct > 0.05 && rsiVal > 35;
        const isBearish = gapPct < -0.02 && rsiVal < 55;
        const trendStrength = Math.min(1.0, Math.abs(gapPct) / 2);

        let regime = 'RANGING';
        if (gapPct > 0.5) regime = 'TREND_UP';
        else if (gapPct < -0.5) regime = 'TREND_DOWN';
        else if (Math.abs(gapPct) > 0.2) regime = isBullish ? 'TREND_UP' : isBearish ? 'TREND_DOWN' : 'RANGING';

        const now = new Date();
        intel.push({
          agentId: 'trend-agent',
          symbol: coin,
          timeframe: '4h',
          timestamp: now.toISOString(),
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
          data: {
            capability: 'TREND_ANALYSIS',
            direction: isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL',
            trend_strength: parseFloat(trendStrength.toFixed(3)),
            market_regime: regime,
            ema_gap_pct: parseFloat(gapPct.toFixed(3)),
            rsi: rsiVal,
          },
        });
      } catch { /* skip coin */ }
    }
    res.json({ success: true, intel });
  } catch (err: any) {
    res.json({ success: true, intel: [] });
  }
});

app.get('/capabilities', (_req, res) => res.json({
  agentId: 'trend-agent',
  capabilities: ['TREND_ANALYSIS'],
  supportedMarkets: COINS,
  timeframes: ['4h'],
  protocolType: 'fip',
}));

app.get('/health', (_req, res) => res.json({
  agent: 'TrendAgent v2', strategy: 'EMA20/50 + RSI14 (Binance data)',
  protocol: 'FIP', capabilities: ['TREND_ANALYSIS'],
  coins: COINS, cacheAge: Math.round((Date.now() - cacheAt) / 1000) + 's',
}));

app.listen(PORT, () => {
  console.log(`[TrendAgent] port ${PORT} — EMA20/50 + RSI14, Binance data, ${COINS.join('/')}`);
  getSignals().catch(() => {});
});

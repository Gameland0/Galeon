/**
 * OrderBookAgent v2 — Taker flow + momentum-implied funding rate, multi-asset
 *
 * Strategy:
 *   SHORT when syntheticFR > 0.0003 (1h momentum overbought) AND taker sell ratio > 0.55
 *   LONG  when syntheticFR < -0.0002 (1h momentum oversold)   AND taker buy ratio > 0.55
 *
 * syntheticFR = 1h_close_change_pct × 0.001
 *   rationale: sustained up-move → longs overpaying → positive funding
 *
 * Data source: Binance spot public API (api.binance.com, no auth needed)
 *   aggTrades  → taker buy/sell volume split (last 200 trades)
 *   klines 1h  → 1h price change for synthetic funding rate
 *
 * Covers: BTC, ETH, SOL, BNB
 * Cache: 2 min
 */

import express from 'express';
import * as https from 'https';

const PORT = process.env.OB_AGENT_PORT || 4002;
const COINS = ['BTC', 'ETH', 'SOL', 'BNB'];

const app = express();

// ── HTTP helper (Binance spot — api.binance.com works fine in Node.js v22) ────

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
    req.on('error', (e: any) => { e.requestUrl = url; reject(e); });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ── Binance spot data helpers ─────────────────────────────────────────────────

/**
 * Taker buy ratio from recent aggTrades.
 * isBuyerMaker=false → buyer is taker (buy pressure)
 * isBuyerMaker=true  → seller is taker (sell pressure)
 */
async function fetchTakerRatio(coin: string): Promise<number> {
  const symbol = `${coin}USDT`;
  const url = `https://api.binance.com/api/v3/aggTrades?symbol=${symbol}&limit=200`;
  const trades = await httpGet(url) as { q: string; m: boolean }[];
  // q = quantity, m = isBuyerMaker
  let buyVol = 0, sellVol = 0;
  for (const t of trades) {
    const qty = parseFloat(t.q);
    if (t.m) sellVol += qty;   // maker buy = taker sell
    else     buyVol  += qty;   // maker sell = taker buy
  }
  const total = buyVol + sellVol;
  return total > 0 ? parseFloat((buyVol / total).toFixed(4)) : 0.5;
}

/**
 * 1h momentum — percentage change over last 1h candle.
 * Used as a momentum-implied "funding rate" proxy:
 *   positive = recent up-move (longs crowded)
 *   negative = recent down-move (shorts crowded)
 */
async function fetch1hMomentum(coin: string): Promise<{ momentum: number; price: number }> {
  const symbol = `${coin}USDT`;
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=3`;
  const data = await httpGet(url) as any[][];
  const prevClose = parseFloat(data[data.length - 2][4]);
  const lastClose = parseFloat(data[data.length - 1][4]);
  const momentum = ((lastClose - prevClose) / prevClose) * 100; // percentage
  return { momentum: parseFloat(momentum.toFixed(4)), price: lastClose };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Signal logic ──────────────────────────────────────────────────────────────

interface AgentSignal {
  id: string; symbol: string; direction: 'LONG' | 'SHORT';
  entryPrice: number; confidence: number; leverage: number;
  stopLoss: number; takeProfit1: number; takeProfit2: number;
  timestamp: string; entryReason: string;
}

async function evalCoin(coin: string): Promise<AgentSignal | null> {
  const { momentum, price } = await fetch1hMomentum(coin);
  const takerRatio = await fetchTakerRatio(coin);

  if (price === 0 || isNaN(price)) return null;

  let direction: 'LONG' | 'SHORT' | null = null;

  // Contrarian logic — trade against the 1h move when taker flow confirms reversal
  // SHORT: 1h up >0.08% (longs crowded) + taker sell-side dominant
  if (momentum > 0.08 && takerRatio < 0.45) direction = 'SHORT';
  // LONG: 1h down >0.05% (shorts crowded) + taker buy-side dominant
  else if (momentum < -0.05 && takerRatio > 0.55) direction = 'LONG';
  // Also pure taker imbalance signals when flow is extreme
  else if (takerRatio > 0.72) direction = 'LONG';
  else if (takerRatio < 0.28) direction = 'SHORT';

  if (!direction) return null;

  // Confidence: 60 base + momentum intensity (max 12) + taker imbalance (max 12)
  const momScore   = Math.min(12, Math.abs(momentum) * 20);
  const takerScore = Math.min(12, Math.abs(takerRatio - 0.5) * 30);
  const confidence = Math.min(90, Math.round(60 + momScore + takerScore));

  const sl  = direction === 'LONG' ? price * 0.972 : price * 1.028;
  const tp1 = direction === 'LONG' ? price * 1.040 : price * 0.960;
  const tp2 = direction === 'LONG' ? price * 1.075 : price * 0.925;

  return {
    id: `ob-${coin}-${Date.now()}`,
    symbol: coin,
    direction,
    entryPrice: parseFloat(price.toFixed(4)),
    confidence,
    leverage: 3,
    stopLoss:    parseFloat(sl.toFixed(4)),
    takeProfit1: parseFloat(tp1.toFixed(4)),
    takeProfit2: parseFloat(tp2.toFixed(4)),
    timestamp: new Date().toISOString(),
    entryReason: `FR=${momentum.toFixed(3)}% taker=${takerRatio.toFixed(3)}`,
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cache: AgentSignal[] = [];
let cacheAt = 0;

async function getSignals(): Promise<AgentSignal[]> {
  if (Date.now() - cacheAt < 2 * 60 * 1000) return cache;

  const signals: AgentSignal[] = [];
  for (const coin of COINS) {
    try {
      const sig = await evalCoin(coin);
      if (sig) signals.push(sig);
    } catch (err: any) {
      console.error(`[OrderBookAgent] ${coin} error: code=${err.code} url=${err.requestUrl} msg=${err.message}`);
    }
    await sleep(200);
  }

  cache = signals;
  cacheAt = Date.now();
  const summary = cache.length > 0
    ? cache.map(s => `${s.symbol} ${s.direction} conf=${s.confidence}`).join(', ')
    : 'none';
  console.log(`[OrderBookAgent] ${new Date().toLocaleTimeString()} — ${summary}`);
  return cache;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/positions', async (_req, res) => {
  try {
    const data = await getSignals();
    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[OrderBookAgent]', err.message);
    res.json({ success: true, data: [] });
  }
});

// ── FIP: GET /intel — Structured financial intelligence ──────────────────────

app.get('/intel', async (_req, res) => {
  try {
    const intel: any[] = [];
    for (const coin of COINS) {
      try {
        const { momentum, price } = await fetch1hMomentum(coin);
        const takerRatio = await fetchTakerRatio(coin);
        const imbalance = (takerRatio - 0.5) * 2; // -1.0 to +1.0

        const now = new Date();
        intel.push({
          agentId: 'orderbook-agent',
          symbol: coin,
          timeframe: '5m',
          timestamp: now.toISOString(),
          expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString(),
          data: {
            capability: 'ORDERBOOK_DEPTH',
            buy_sell_imbalance: parseFloat(imbalance.toFixed(3)),
            liquidity_depth: Math.abs(imbalance) > 0.4 ? 'HIGH' : Math.abs(imbalance) > 0.15 ? 'MEDIUM' : 'LOW',
            slippage_bps: Math.abs(imbalance) > 0.3 ? 3 : 6,
            taker_ratio: parseFloat(takerRatio.toFixed(4)),
          },
        });
        await sleep(200);
      } catch { /* skip coin */ }
    }
    res.json({ success: true, intel });
  } catch {
    res.json({ success: true, intel: [] });
  }
});

app.get('/capabilities', (_req, res) => res.json({
  agentId: 'orderbook-agent',
  capabilities: ['ORDERBOOK_DEPTH'],
  supportedMarkets: COINS,
  timeframes: ['5m'],
  protocolType: 'fip',
}));

app.get('/health', (_req, res) => res.json({
  agent: 'OrderBookAgent v2',
  strategy: 'Momentum-implied FR + taker buy/sell ratio (Binance spot)',
  protocol: 'FIP', capabilities: ['ORDERBOOK_DEPTH'],
  coins: COINS,
  cacheAge: Math.round((Date.now() - cacheAt) / 1000) + 's',
}));

app.listen(PORT, () => {
  console.log(`[OrderBookAgent] port ${PORT} — synthetic FR + taker ratio on ${COINS.join('/')} (Binance spot)`);
  // Small delay to let the server socket finish initializing before opening outbound TLS
  setTimeout(() => getSignals().catch(() => {}), 2000);
});

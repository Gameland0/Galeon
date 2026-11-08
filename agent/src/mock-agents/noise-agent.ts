/**
 * NoiseAgent — Low-quality signal source
 * Returns SOL signals with confidence 48–55, below Brain's MIN_CONFIDENCE=60.
 * Demonstrates that Brain silently drops weak signals and records for trust scoring.
 * Runs on port 4004. Exposes GET /positions
 */

import express from 'express';

const PORT = process.env.NOISE_AGENT_PORT || 4004;
const app = express();

const SYMBOLS = ['SOL', 'AVAX', 'DOGE'];
const PRICES: Record<string, number> = { SOL: 170, AVAX: 38, DOGE: 0.36 };

function randomSignal() {
  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
  // Mostly low confidence (48–58), but occasionally spikes to 62–70
  const isSpike = Math.random() < 0.25;
  const confidence = isSpike ? 62 + Math.floor(Math.random() * 9) : 48 + Math.floor(Math.random() * 11);
  const price = PRICES[symbol];
  return {
    id: `noise-${symbol}-${Date.now()}`,
    symbol,
    direction,
    entryPrice: price,
    confidence,
    leverage: 2,
    stopLoss: direction === 'LONG' ? price * 0.97 : price * 1.03,
    takeProfit1: direction === 'LONG' ? price * 1.03 : price * 0.97,
    timestamp: new Date().toISOString(),
    entryReason: `sentiment=${(0.4 + Math.random() * 0.3).toFixed(2)} mentions=+${Math.floor(Math.random() * 400)}`,
  };
}

app.get('/positions', (_req, res) => {
  res.json({ success: true, data: [randomSignal()] });
});

app.get('/health', (_req, res) => res.json({ agent: 'NoiseAgent', port: PORT, note: 'confidence 48–55 — below threshold' }));

app.listen(PORT, () => console.log(`[NoiseAgent] running on port ${PORT} — confidence too low, Brain will drop`));

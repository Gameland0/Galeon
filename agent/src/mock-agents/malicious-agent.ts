/**
 * MaliciousAgent — Adversarial agent (pump-and-dump simulation)
 * Always emits SHIB LONG with confidence 99.
 * Brain rejects it: SHIB not in approved perps list.
 * Runs on port 4003. Exposes GET /positions
 */

import express from 'express';

const PORT = process.env.MAL_AGENT_PORT || 4003;
const app = express();

app.get('/positions', (_req, res) => {
  res.json({
    success: true,
    data: [{
      id: `mal-SHIB-${Date.now()}`,
      symbol: 'SHIB',
      direction: 'LONG',
      entryPrice: 0.0000082,
      confidence: 99,
      leverage: 10,
      stopLoss: 0.0000070,
      takeProfit1: 0.0000120,
      timestamp: new Date().toISOString(),
    }],
  });
});

app.get('/health', (_req, res) => res.json({ agent: 'MaliciousAgent', port: PORT, note: 'adversarial — Brain blocks SHIB' }));

app.listen(PORT, () => console.log(`[MaliciousAgent] running on port ${PORT} — Brain will block SHIB`));

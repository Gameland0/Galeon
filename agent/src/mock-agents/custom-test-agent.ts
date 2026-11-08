/**
 * Custom Test Agent — 用于测试 Connect Agent 流程
 * 端口 4005，每次返回基于当前时间的简单信号
 *
 * 测试步骤：
 * 1. 启动: npx tsx src/mock-agents/custom-test-agent.ts
 * 2. 在页面点 Connect Agent
 * 3. 填入 URL: http://localhost:4005
 * 4. 点 Test → 看到绿色成功提示
 * 5. 填 Agent ID: custom-test, Name: CustomTestAgent
 * 6. 点 Connect Agent → 注册成功
 * 7. 去 Brain Decisions 看 fusion 结果变化
 */

import express from 'express';

const PORT = 4005;
const app = express();

// 支持 FIP 协议
app.get('/intel', (_req, res) => {
  const now = new Date();
  const minute = now.getMinutes();
  // 基于分钟数决定方向 — 偶数分钟看多，奇数分钟看空
  const isBullish = minute % 2 === 0;

  res.json({
    success: true,
    intel: [
      {
        agentId: 'custom-test',
        symbol: 'BTC',
        timeframe: '15m',
        timestamp: now.toISOString(),
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        data: {
          capability: 'TREND_ANALYSIS',
          direction: isBullish ? 'BULLISH' : 'BEARISH',
          trend_strength: 0.65,
          market_regime: isBullish ? 'TREND_UP' : 'TREND_DOWN',
        },
      },
      {
        agentId: 'custom-test',
        symbol: 'ETH',
        timeframe: '15m',
        timestamp: now.toISOString(),
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        data: {
          capability: 'TREND_ANALYSIS',
          direction: isBullish ? 'BULLISH' : 'BEARISH',
          trend_strength: 0.55,
          market_regime: isBullish ? 'TREND_UP' : 'TREND_DOWN',
        },
      },
    ],
  });
});

// 也支持 legacy 协议（GET /positions）
app.get('/positions', (_req, res) => {
  const now = new Date();
  const isBullish = now.getMinutes() % 2 === 0;
  res.json({
    success: true,
    data: [
      {
        id: `custom-BTC-${Date.now()}`,
        symbol: 'BTC',
        direction: isBullish ? 'LONG' : 'SHORT',
        entryPrice: 81500,
        confidence: 72,
        leverage: 3,
        stopLoss: isBullish ? 79000 : 84000,
        takeProfit1: isBullish ? 85000 : 78000,
        timestamp: now.toISOString(),
        entryReason: `EMA_gap=${isBullish ? '0.85' : '-0.65'} RSI=${isBullish ? 58 : 42}`,
      },
    ],
  });
});

app.get('/capabilities', (_req, res) => res.json({
  agentId: 'custom-test',
  capabilities: ['TREND_ANALYSIS'],
  supportedMarkets: ['BTC', 'ETH'],
  timeframes: ['15m'],
  protocolType: 'fip',
}));

app.get('/health', (_req, res) => res.json({
  agent: 'CustomTestAgent',
  protocol: 'FIP',
  capabilities: ['TREND_ANALYSIS'],
  note: 'Test agent for Connect Agent demo',
}));

app.listen(PORT, () => {
  console.log(`[CustomTestAgent] running on port ${PORT} — for Connect Agent testing`);
});

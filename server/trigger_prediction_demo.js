/**
 * trigger_prediction_demo.js
 * Manually trigger one full prediction event cycle on testnet:
 *   onPTOpen → wait 5s → onPTClose → Sibyl written → verify
 *
 * Usage: PAPER_TRADE_ENV=testnet LEARNING_STORAGE=sibyl node trigger_prediction_demo.js
 */

const DatabaseService = require('./src/services/databaseService');

async function run() {
  const env = process.env.PAPER_TRADE_ENV || 'testnet';
  console.log(`[Demo] env=${env}`);

  // 1. Find the PredictionMarketService instance via a fresh init
  const PredictionMarketService = require('./src/services/prediction/PredictionMarketService');

  // Wrap DatabaseService to match mysql2 pool interface (execute returns [rows])
  const DS = require('./src/services/databaseService');
  const db = {
    execute: async (sql, params) => {
      const rows = await DS.query(sql, params);
      return [rows || []];
    },
    getConnection: async () => {
      let conn = { _sqls: [] };
      conn.beginTransaction = async () => {};
      conn.execute = async (sql, params) => { const r = await DS.query(sql, params); return [r || []]; };
      conn.commit = async () => {};
      conn.rollback = async () => {};
      conn.release = () => {};
      return conn;
    },
  };

  const svc = new PredictionMarketService({
    db,
    paperTradeService: null,
    contractConfig: {
      rpcUrl: process.env.PREDICTION_RPC_URL || 'https://base-rpc.publicnode.com',
      contractAddress: process.env.PREDICTION_CONTRACT_ADDRESS || '0xE1E61ecdc2C98f22A83E22a9207b43Bf64e63f98',
      privateKey: process.env.PREDICTION_ADMIN_KEY || '',
    },
  });
  await svc.initialize();

  // 2. Fake a PT position (open)
  const fakePosition = {
    id: `demo_${Date.now()}`,
    symbol: 'SOLUSDT',
    direction: 'LONG',
    entry_price: 145.5,
    entryPrice: 145.5,
    leverage: 5,
    stop_loss_pct: -20,
  };

  console.log(`\n[Demo] Step 1: Creating prediction event for ${fakePosition.symbol}...`);
  const eventId = await svc.onPTOpen(fakePosition);
  console.log(`[Demo] Event created: ${eventId}`);

  if (!eventId) {
    console.error('[Demo] Failed to create event');
    process.exit(1);
  }

  // 3. Insert a few fake bets so settlement has participants
  console.log(`\n[Demo] Step 2: Adding 3 demo bets...`);
  const fakeBets = [
    { addr: '0x1111111111111111111111111111111111111111', pnl: 8.5, amount: 100 },
    { addr: '0x2222222222222222222222222222222222222222', pnl: 3.2, amount: 200 },
    { addr: '0x3333333333333333333333333333333333333333', pnl: -2.1, amount: 150 },
  ];
  for (const b of fakeBets) {
    await DatabaseService.query(
      `INSERT INTO prediction_bets (event_id, user_address, predicted_pnl_pct, bet_amount, bet_type, created_at)
       VALUES (?, ?, ?, ?, 'POINTS', NOW())`,
      [eventId, b.addr, b.pnl, b.amount]
    );
    await DatabaseService.query(
      `UPDATE prediction_events SET participant_count = participant_count + 1, total_pool = total_pool + ? WHERE event_id = ?`,
      [b.amount, eventId]
    );
  }
  console.log(`[Demo] 3 bets inserted`);

  // 4. Fake a PT close (skip the 60s wait)
  const fakeTrade = {
    id: fakePosition.id,
    total_pnl_pct: 5.8,
    totalPnlPct: 5.8,
  };

  // Patch: skip the 60s wait for demo
  const orig = global.setTimeout;
  let waitSkipped = false;
  global.setTimeout = (fn, ms) => {
    if (ms >= 50000 && !waitSkipped) {
      waitSkipped = true;
      console.log(`[Demo] Skipping 60s settlement wait for demo...`);
      return orig(fn, 100);
    }
    return orig(fn, ms);
  };

  console.log(`\n[Demo] Step 3: Closing position (PnL=+5.8%)...`);
  await svc.onPTClose(fakeTrade);
  console.log(`[Demo] Settlement complete`);

  // 5. Verify Sibyl got the data
  console.log(`\n[Demo] Step 4: Verifying Sibyl Memory...`);
  await new Promise(r => setTimeout(r, 2000));

  const { createStorage } = require('./src/services/autoTrade/storage/StorageFactory');
  const storage = createStorage(env, 'stable');
  const results = storage.search('SOLUSDT', 'prediction_outcome', 5);
  console.log(`[Demo] Sibyl prediction_outcome for SOLUSDT: ${results.length} records`);
  for (const r of results) {
    const d = r.data;
    console.log(`  - PnL=${d.actualPnlPct}% communityWR=${(d.communityWinRate*100).toFixed(0)}% (${d.participants} bettors) settledAt=${new Date(d.settledAt).toISOString()}`);
  }

  console.log(`\n✅ Demo complete. Now open:`);
  console.log(`   http://184.168.123.133:5000/api/paper-trade/memory-recall-demo?symbol=SOL`);
  console.log(`   Step 2 should show the Base prediction outcome just written to Sibyl.`);

  process.exit(0);
}

run().catch(err => {
  console.error('[Demo] Error:', err.message);
  process.exit(1);
});

/**
 * migrate_prediction_to_sibyl.js
 * 把 MySQL prediction_events (SETTLED) 迁移到 Sibyl Memory prediction_outcome category
 * 用法: LEARNING_STORAGE=sibyl node migrate_prediction_to_sibyl.js
 */

const DatabaseService = require('./src/services/databaseService');
const { createStorage } = require('./src/services/autoTrade/storage/StorageFactory');

const ENV = process.env.PAPER_TRADE_ENV || 'testnet';
const STRATEGY = 'stable';

async function migrate() {
  const storage = createStorage(ENV, STRATEGY);
  console.log(`[Migrate] Storage: ${storage.type}, env=${ENV}`);
  if (storage.type !== 'sibyl') {
    console.error('请设置 LEARNING_STORAGE=sibyl 再运行');
    process.exit(1);
  }

  // 查所有已结算的预测事件
  const events = await DatabaseService.query(
    `SELECT event_id, symbol, direction, actual_pnl_pct,
            participant_count, winner_count, settled_at, env
     FROM prediction_events
     WHERE status = 'SETTLED'
       AND actual_pnl_pct IS NOT NULL
     ORDER BY settled_at DESC
     LIMIT 200`,
    []
  );

  if (!events || events.length === 0) {
    console.log('没有已结算的预测事件');
    process.exit(0);
  }

  console.log(`[Migrate] 找到 ${events.length} 条已结算记录，开始写入 Sibyl...`);

  let success = 0;
  for (const e of events) {
    const communityWinRate = e.participant_count > 0
      ? e.winner_count / e.participant_count : 0;
    const key = `${e.symbol}_${e.event_id.slice(0, 8)}`;

    await storage.set('prediction_outcome', key, {
      symbol: e.symbol,
      direction: e.direction,
      actualPnlPct: parseFloat(e.actual_pnl_pct),
      communityWinRate,
      participants: e.participant_count,
      winners: e.winner_count,
      settledAt: e.settled_at ? new Date(e.settled_at).getTime() : Date.now(),
    });
    success++;
    if (success % 10 === 0) {
      console.log(`  ${success}/${events.length}...`);
    }
  }

  console.log(`\n✅ 迁移完成: ${success} 条 prediction_outcome 写入 Sibyl`);

  // 验证
  const list = await storage.list('prediction_outcome', { limit: 5 });
  console.log(`\n[验证] Sibyl prediction_outcome 样本:`);
  for (const item of list) {
    const d = item.data;
    console.log(`  ${d.symbol} ${d.direction} PnL=${d.actualPnlPct?.toFixed(1)}% 社区WR=${(d.communityWinRate*100).toFixed(0)}%(${d.participants}人)`);
  }

  process.exit(0);
}

migrate().catch(err => {
  console.error('[Migrate] Error:', err.message);
  process.exit(1);
});

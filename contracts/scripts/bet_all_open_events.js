/**
 * bet_all_open_events.js
 *
 * 用所有已知钱包参与当前所有 OPEN 预测事件
 * 只处理有 contract_event_id 的事件（可链上验证）
 */

const { ethers } = require('ethers');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const RPC      = 'https://sepolia.base.org';
const PM_ADDR  = '0x67B2E2a2b26ED20c01f43d91fABC13C28e6EB082';
const USDC_ADDR = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const PM_ABI = [
  'function placeBet(bytes32 _eventId, int256 _predictedPnlBps, uint256 _amount) external',
  'function hasBet(bytes32, address) view returns (bool)',
  'function getEvent(bytes32) view returns (uint256 totalPool, uint256 participantCount, uint8 status, uint64 createdAt, int256 actualPnlBps)',
];
const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
];

// 已知钱包（有私钥的）
const WALLETS = [
  { name: 'Admin', key: '0x3fe8f9df4058328d538e865e8ce07ddb71c9e3d6040cb1e5040106894d4ab88e', predict: 2.5 },
  { name: 'W1',    key: '0x31ff5eb4dcec8df2027e0145802fc5d09de8a9b190191a37c46e4f10e57661cd', predict: 5.0 },
];

const BET_WEI   = BigInt(1e6);    // $1 USDC
const MIN_ETH   = ethers.parseEther('0.0003');

// 从测试服务器读取 open 事件
async function getOpenEvents(db) {
  const [rows] = await db.execute(
    `SELECT event_id, symbol, direction, contract_event_id
     FROM prediction_events
     WHERE status = 'OPEN' AND contract_event_id IS NOT NULL
     ORDER BY created_at ASC`
  );
  return rows;
}

async function placeBetAndRecord(db, provider, wallet, walletName, event, predictPct) {
  const pm   = new ethers.Contract(PM_ADDR, PM_ABI, wallet);
  const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, wallet);

  // 检查是否已下注
  const alreadyBet = await pm.hasBet(event.contract_event_id, wallet.address);
  if (alreadyBet) {
    console.log(`  [${walletName}] 已下注过 ${event.symbol}，跳过`);
    return;
  }

  // 检查 USDC 余额
  const bal = await usdc.balanceOf(wallet.address);
  if (bal < BET_WEI) {
    console.log(`  [${walletName}] USDC 不足 ($${Number(bal)/1e6})，跳过`);
    return;
  }

  // 检查 ETH
  const ethBal = await provider.getBalance(wallet.address);
  if (ethBal < MIN_ETH) {
    console.log(`  [${walletName}] ETH 不足 (${ethers.formatEther(ethBal)})，跳过`);
    return;
  }

  // Approve
  const allowance = await usdc.allowance(wallet.address, PM_ADDR);
  if (allowance < BET_WEI) {
    const tx = await usdc.approve(PM_ADDR, BET_WEI * 10n);
    await tx.wait();
  }

  // PlaceBet
  const predictBps = Math.round(predictPct * 100);
  const tx = await pm.placeBet(event.contract_event_id, predictBps, BET_WEI);
  const receipt = await tx.wait();

  console.log(`  [${walletName}] ✅ ${event.symbol} predict=${predictPct}% tx=${receipt.hash.slice(0,18)}...`);

  // 记录到 DB
  const existing = await db.execute(
    'SELECT id FROM prediction_bets WHERE event_id = ? AND user_address = ?',
    [event.event_id, wallet.address.toLowerCase()]
  );
  if (existing[0].length === 0) {
    await db.execute(
      'INSERT INTO prediction_bets (event_id, user_address, predicted_pnl_pct, bet_amount, bet_tx_hash, created_at) VALUES (?,?,?,?,?,NOW())',
      [event.event_id, wallet.address, predictPct, 1.0, receipt.hash]
    );
    // 更新事件统计
    await db.execute(
      'UPDATE prediction_events SET participant_count = participant_count + 1, total_pool = total_pool + 1.0 WHERE event_id = ?',
      [event.event_id]
    );
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);

  const db = await mysql.createConnection({
    host: 'localhost', port: 3306,
    user: 'rott', password: '123',
    database: 'multiagent_platforms',
  });

  const events = await getOpenEvents(db);
  console.log(`\n找到 ${events.length} 个可下注事件: ${events.map(e => e.symbol).join(', ')}\n`);

  if (events.length === 0) {
    console.log('没有可下注的事件（需要有 contract_event_id）');
    await db.end();
    return;
  }

  // Admin 给 W1 补 ETH（如果不足）
  const adminWallet = new ethers.Wallet(WALLETS[0].key, provider);
  const w1Wallet    = new ethers.Wallet(WALLETS[1].key, provider);
  const w1Eth = await provider.getBalance(w1Wallet.address);
  if (w1Eth < MIN_ETH * 2n) {
    console.log(`W1 ETH 不足 (${ethers.formatEther(w1Eth)})，Admin 补充...`);
    const tx = await adminWallet.sendTransaction({ to: w1Wallet.address, value: ethers.parseEther('0.001') });
    await tx.wait();
    console.log('  ✅ 已补充 0.001 ETH\n');
  }

  // 每个事件，每个钱包下注
  for (const event of events) {
    console.log(`📋 ${event.symbol} ${event.direction} (${event.event_id.slice(0,8)}...)`);

    // 分配不同预测值：每个事件用不同的预测分布
    const eventIdx = events.indexOf(event);
    const predictions = [2.5 + eventIdx * 0.5, 5.0 + eventIdx * 0.5];

    for (let wi = 0; wi < WALLETS.length; wi++) {
      const w = WALLETS[wi];
      const signer = new ethers.Wallet(w.key, provider);
      try {
        await placeBetAndRecord(db, provider, signer, w.name, event, predictions[wi]);
      } catch (err) {
        console.log(`  [${w.name}] ❌ ${err.reason || err.message}`);
      }
    }
    console.log('');
  }

  // 打印结果
  const [updated] = await db.execute(
    'SELECT symbol, participant_count, total_pool FROM prediction_events WHERE status = "OPEN" AND contract_event_id IS NOT NULL'
  );
  console.log('当前事件状态:');
  for (const r of updated) {
    console.log(`  ${r.symbol}: ${r.participant_count} 人, $${r.total_pool}`);
  }

  await db.end();
}

main().catch(e => {
  console.error('❌', e.message || e);
  process.exit(1);
});

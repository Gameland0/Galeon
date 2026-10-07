/**
 * bet_with_usdb.js
 *
 * 用 TestUSD (USDB) 对当前所有 OPEN 预测事件批量下注
 *
 * 流程:
 *  1. 部署 TestUSD + 新 PredictionMarket (USDB)
 *  2. 从 DB 读取所有 OPEN 事件
 *  3. 为每个事件在新 PM 上创建链上事件，更新 DB contract_event_id
 *  4. 生成 8 个钱包，faucet USDB + 补 ETH
 *  5. 每个钱包对每个事件下注（不同预测值）
 *  6. 记录到 DB
 */

const { ethers } = require('ethers');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const RPC       = 'https://sepolia.base.org';
const ADMIN_KEY = process.env.PREDICTION_ADMIN_KEY || process.env.PRIVATE_KEY;

const USDB_ABI = [
  'function faucet(address to, uint256 amount) external',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
];

// PM ABI for contract instance (no constructor)
const PM_INSTANCE_ABI = [
  'function createEvent(bytes32 _eventId) external',
  'function placeBet(bytes32 _eventId, int256 _predictedPnlBps, uint256 _amount) external',
  'function getEvent(bytes32) view returns (uint256 totalPool, uint256 participantCount, uint8 status, uint64 createdAt, int256 actualPnlBps)',
  'function hasBet(bytes32,address) view returns (bool)',
];
// PM ABI for factory (with constructor)
const PM_CONSTRUCTOR_ABI = [
  'constructor(address _usdc, address _platformWallet, address _reserveWallet, address _guardian)',
  ...PM_INSTANCE_ABI,
];

const ETH_PER_W   = ethers.parseEther('0.00001');
const MIN_ADMIN_ETH = ethers.parseEther('0.001');

// 22 个钱包：不同预测值 + 不同金额
const BETS = [
  { pct: 1.5,  amt: 2 },
  { pct: 3.0,  amt: 5 },
  { pct: 5.0,  amt: 1 },
  { pct: 8.0,  amt: 10 },
  { pct: -1.0, amt: 3 },
  { pct: 2.0,  amt: 7 },
  { pct: 4.5,  amt: 2 },
  { pct: 7.0,  amt: 4 },
  { pct: 0.5,  amt: 8 },
  { pct: 2.5,  amt: 1 },
  { pct: 4.0,  amt: 6 },
  { pct: 6.0,  amt: 3 },
  { pct: 9.0,  amt: 5 },
  { pct: -0.5, amt: 2 },
  { pct: 1.0,  amt: 9 },
  { pct: 3.5,  amt: 4 },
  { pct: 6.5,  amt: 1 },
  { pct: -2.0, amt: 7 },
  { pct: 0.8,  amt: 3 },
  { pct: 2.2,  amt: 5 },
  { pct: 5.5,  amt: 10 },
  { pct: 7.5,  amt: 2 },
];

async function getDb() {
  return mysql.createConnection({
    host: 'localhost', port: 3306,
    user: 'rott', password: '123',
    database: 'multiagent_platforms',
  });
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const admin    = new ethers.Wallet(ADMIN_KEY, provider);

  console.log(`\n${'='.repeat(60)}`);
  console.log(' USDB 批量下注脚本');
  console.log(`${'='.repeat(60)}`);
  console.log(`Admin: ${admin.address}`);
  const ethBal = await provider.getBalance(admin.address);
  console.log(`Admin ETH: ${ethers.formatEther(ethBal)}`);
  if (ethBal < MIN_ADMIN_ETH) {
    throw new Error(`Admin ETH 不足: ${ethers.formatEther(ethBal)} < 0.005`);
  }

  // 创建一个全新的普通 EOA 作为 PM 部署者（绕过 EIP-7702 委托账户的 calldata 限制）
  const pmAdmin = ethers.Wallet.createRandom().connect(provider);
  console.log(`pmAdmin: ${pmAdmin.address}`);
  const fundTx = await admin.sendTransaction({ to: pmAdmin.address, value: ethers.parseEther('0.001') });
  await fundTx.wait();
  console.log('  pmAdmin 已补充 0.001 ETH');

  // ── 1. 部署合约 ────────────────────────────────────────────────────────────
  const artifactsBase = __dirname;
  const usdbArtifact = require(path.join(artifactsBase, 'TestUSD.json'));
  const pmArtifact   = require(path.join(artifactsBase, 'PredictionMarket.json'));

  console.log('\n[1/5] 部署 TestUSD...');
  const usdbFactory = new ethers.ContractFactory(usdbArtifact.abi, usdbArtifact.bytecode, pmAdmin);
  const usdb = await usdbFactory.deploy();
  await usdb.waitForDeployment();
  const usdbAddr = await usdb.getAddress();
  await new Promise(r => setTimeout(r, 4000)); // wait for RPC state propagation
  console.log(`  USDB: ${usdbAddr}`);

  console.log('[1/5] 部署 PredictionMarket...');
  const pmFactory = new ethers.ContractFactory(pmArtifact.abi, pmArtifact.bytecode, pmAdmin);
  const pmDeployed = await pmFactory.deploy(usdbAddr, pmAdmin.address, pmAdmin.address, pmAdmin.address, pmAdmin.address);
  await pmDeployed.waitForDeployment();
  const pmAddr = await pmDeployed.getAddress();
  await new Promise(r => setTimeout(r, 4000)); // wait for RPC state propagation
  const pm = new ethers.Contract(pmAddr, PM_INSTANCE_ABI, pmAdmin);
  console.log(`  PM:   ${pmAddr}`);

  // ── 2. 读取 OPEN 事件 ──────────────────────────────────────────────────────
  const db = await getDb();
  const [events] = await db.execute(
    `SELECT event_id, symbol, direction FROM prediction_events WHERE status = 'OPEN' ORDER BY created_at ASC`
  );
  console.log(`\n[2/5] 发现 ${events.length} 个 OPEN 事件: ${events.map(e=>e.symbol).join(', ')}`);

  if (events.length === 0) {
    console.log('  无 OPEN 事件，退出');
    await db.end(); return;
  }

  // ── 3. 为每个事件创建链上事件 + 更新 DB ───────────────────────────────────
  console.log('\n[3/5] 创建链上事件...');
  const pmIface = new ethers.Interface(PM_INSTANCE_ABI);
  const contractEventIds = {};
  for (const evt of events) {
    const ceid = ethers.keccak256(ethers.toUtf8Bytes(evt.event_id));
    const tx = await pm.createEvent(ceid);
    await tx.wait();
    contractEventIds[evt.event_id] = ceid;
    await db.execute(
      'UPDATE prediction_events SET contract_event_id = ? WHERE event_id = ?',
      [ceid, evt.event_id]
    );
    console.log(`  ${evt.symbol}: ${ceid.slice(0,20)}...`);
  }

  // ── 4. 生成 8 钱包 + faucet USDB + 补 ETH ────────────────────────────────
  console.log('\n[4/5] 生成钱包 + 分发 USDB...');
  const wallets = Array.from({ length: BETS.length }, (_, i) =>
    ethers.Wallet.createRandom().connect(provider)
  );

  process.stdout.write('  发ETH+mint: ');
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const mintAmount = BigInt(BETS[i].amt * 1e6) * BigInt(events.length) + BigInt(1e6);
    const ethTx = await admin.sendTransaction({ to: w.address, value: ETH_PER_W });
    await ethTx.wait();
    const mintTx = await usdb.faucet(w.address, mintAmount);
    await mintTx.wait();
    process.stdout.write('.');
  }
  console.log(' ✅');

  // ── 5. 每个钱包对每个事件下注 ──────────────────────────────────────────────
  console.log('\n[5/5] 下注...');
  for (const evt of events) {
    const ceid = contractEventIds[evt.event_id];
    console.log(`  ${evt.symbol}:`);

    let eventPool = 0;
    for (let wi = 0; wi < wallets.length; wi++) {
      const w = wallets[wi];
      const { pct: predictPct, amt: betUsd } = BETS[wi];
      const predictBps = Math.round(predictPct * 100);
      const betAmount = BigInt(betUsd * 1e6);

      const uc = new ethers.Contract(usdbAddr, USDB_ABI, w);
      let allowance = await uc.allowance(w.address, pmAddr);
      if (allowance < betAmount) {
        const appTx = await uc.approve(pmAddr, betAmount * 10n);
        await appTx.wait();
        for (let t = 0; t < 8; t++) {
          allowance = await uc.allowance(w.address, pmAddr);
          if (allowance >= betAmount) break;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      const pmc = new ethers.Contract(pmAddr, PM_INSTANCE_ABI, w);
      const betTx = await pmc.placeBet(ceid, predictBps, betAmount);
      const receipt = await betTx.wait();

      await db.execute(
        'INSERT INTO prediction_bets (event_id, user_address, predicted_pnl_pct, bet_amount, bet_tx_hash, created_at) VALUES (?,?,?,?,?,NOW())',
        [evt.event_id, w.address, predictPct, betUsd, receipt.hash]
      );
      eventPool += betUsd;
      process.stdout.write(`    W${wi+1} predict=${predictPct}% $${betUsd} ✓\n`);
    }

    await db.execute(
      'UPDATE prediction_events SET participant_count = participant_count + ?, total_pool = total_pool + ? WHERE event_id = ?',
      [wallets.length, eventPool, evt.event_id]
    );
  }

  // ── 汇总 ───────────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ 完成！');
  console.log(`TestUSD (USDB): ${usdbAddr}`);
  console.log(`PredictionMarket: ${pmAddr}`);
  const [result] = await db.execute(
    `SELECT symbol, participant_count, total_pool FROM prediction_events WHERE status='OPEN'`
  );
  for (const r of result) {
    console.log(`  ${r.symbol}: ${r.participant_count} 人 $${r.total_pool}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  // 保存合约地址供结算脚本使用
  const fs = require('fs');
  fs.writeFileSync('/tmp/usdb_pm_addrs.json', JSON.stringify({ usdbAddr, pmAddr, events: events.map(e=>({...e, ceid: contractEventIds[e.event_id]})) }, null, 2));
  console.log('合约地址已保存至 /tmp/usdb_pm_addrs.json');

  await db.end();
}

main().catch(e => {
  console.error('❌', e.reason || e.message);
  process.exit(1);
});

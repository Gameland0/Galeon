/**
 * bet_custom.js — 自定义人数+金额批量下注
 *
 * 用法: node bet_custom.js
 * 配置: EVENTS_CONFIG 数组
 */
const { ethers } = require('ethers');
const mysql = require('mysql2/promise');
const path = require('path');

const RPC       = 'https://sepolia.base.org';
const ADMIN_KEY = process.env.PREDICTION_ADMIN_KEY || '0x3fe8f9df4058328d538e865e8ce07ddb71c9e3d6040cb1e5040106894d4ab88e';

const USDB_ABI = [
  'function faucet(address to, uint256 amount) external',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
];
const PM_ABI = [
  'function createEvent(bytes32 _eventId) external',
  'function placeBet(bytes32 _eventId, int256 _predictedPnlBps, uint256 _amount) external',
  'function hasBet(bytes32,address) view returns (bool)',
];

const ETH_PER_W = ethers.parseEther('0.00001');

// ── 每个事件的配置 ──
// symbol 用来匹配 DB 中的 OPEN 事件
const EVENTS_CONFIG = [
  {
    symbol: 'PUMPUSDT',
    count: 50,
    // 随机金额 $5~$20
    amountFn: () => Math.floor(Math.random() * 16) + 5,
  },
  {
    symbol: 'ZENUSDT',
    count: 30,
    // 固定 $10
    amountFn: () => 10,
  },
];

// 生成随机预测值 (-5% ~ +15%)
function randomPrediction() {
  return Math.round((Math.random() * 20 - 5) * 10) / 10; // -5.0 ~ +15.0
}

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
  console.log(' 自定义批量下注脚本');
  console.log(`${'='.repeat(60)}`);
  console.log(`Admin: ${admin.address}`);
  const ethBal = await provider.getBalance(admin.address);
  console.log(`Admin ETH: ${ethers.formatEther(ethBal)}`);

  // 创建 deployer（避免 EIP-7702 限制）
  const pmAdmin = ethers.Wallet.createRandom().connect(provider);
  console.log(`pmAdmin: ${pmAdmin.address}`);
  const fundTx = await admin.sendTransaction({ to: pmAdmin.address, value: ethers.parseEther('0.001'), gasLimit: 50000 });
  await fundTx.wait();
  console.log('  pmAdmin 已补充 0.001 ETH');

  // ── 1. 部署合约 ──
  const usdbArt = require(path.join(__dirname, 'TestUSD.json'));
  const pmArt   = require(path.join(__dirname, 'PredictionMarket.json'));

  console.log('\n[1] 部署 TestUSD + PredictionMarket...');
  const usdbFactory = new ethers.ContractFactory(usdbArt.abi, usdbArt.bytecode, pmAdmin);
  const usdb = await usdbFactory.deploy();
  await usdb.waitForDeployment();
  const usdbAddr = await usdb.getAddress();
  await new Promise(r => setTimeout(r, 4000));
  console.log(`  USDB: ${usdbAddr}`);

  const pmFactory = new ethers.ContractFactory(pmArt.abi, pmArt.bytecode, pmAdmin);
  const pmDeployed = await pmFactory.deploy(usdbAddr, pmAdmin.address, pmAdmin.address, pmAdmin.address, pmAdmin.address);
  await pmDeployed.waitForDeployment();
  const pmAddr = await pmDeployed.getAddress();
  await new Promise(r => setTimeout(r, 4000));
  const pm = new ethers.Contract(pmAddr, PM_ABI, pmAdmin);
  console.log(`  PM:   ${pmAddr}`);

  // ── 2. 读取 OPEN 事件 ──
  const db = await getDb();
  const [allEvents] = await db.execute(
    `SELECT event_id, symbol, direction FROM prediction_events WHERE status = 'OPEN' AND env = 'testnet' ORDER BY created_at ASC`
  );
  console.log(`\n[2] 测试网 OPEN 事件: ${allEvents.map(e => e.symbol).join(', ')}`);

  // 匹配配置
  const matched = [];
  for (const cfg of EVENTS_CONFIG) {
    const evt = allEvents.find(e => e.symbol === cfg.symbol);
    if (evt) {
      matched.push({ ...evt, ...cfg });
    } else {
      console.log(`  ⚠️ ${cfg.symbol} 未找到 OPEN 事件，跳过`);
    }
  }

  if (matched.length === 0) {
    console.log('  无匹配事件，退出');
    await db.end(); return;
  }

  // ── 3. 创建链上事件 ──
  console.log('\n[3] 创建链上事件...');
  const contractEventIds = {};
  for (const evt of matched) {
    const ceid = ethers.keccak256(ethers.toUtf8Bytes(evt.event_id));
    const tx = await pm.createEvent(ceid);
    await tx.wait();
    contractEventIds[evt.event_id] = ceid;
    await db.execute(
      'UPDATE prediction_events SET contract_event_id = ? WHERE event_id = ?',
      [ceid, evt.event_id]
    );
    console.log(`  ${evt.symbol}: ${ceid.slice(0, 20)}...`);
  }

  // ── 4. 生成钱包 + 下注 ──
  for (const evt of matched) {
    const ceid = contractEventIds[evt.event_id];
    console.log(`\n[4] ${evt.symbol}: ${evt.count}人下注...`);

    // 生成钱包
    const wallets = Array.from({ length: evt.count }, () =>
      ethers.Wallet.createRandom().connect(provider)
    );

    // 生成每人的预测和金额
    const bets = wallets.map(() => ({
      pct: randomPrediction(),
      amt: evt.amountFn(),
    }));

    // 分发ETH + mint USDB
    process.stdout.write('  发ETH+mint: ');
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const mintAmount = BigInt(bets[i].amt * 1e6) + BigInt(1e6);
      const ethTx = await admin.sendTransaction({ to: w.address, value: ETH_PER_W, gasLimit: 50000 });
      await ethTx.wait();
      const mintTx = await usdb.faucet(w.address, mintAmount);
      await mintTx.wait();
      process.stdout.write('.');
    }
    console.log(' ✅');

    // 下注
    let eventPool = 0;
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const { pct, amt } = bets[i];
      const predictBps = Math.round(pct * 100);
      const betAmount = BigInt(amt * 1e6);

      const uc = new ethers.Contract(usdbAddr, USDB_ABI, w);
      await (await uc.approve(pmAddr, betAmount * 10n)).wait();
      await new Promise(r => setTimeout(r, 2000));

      const pmc = new ethers.Contract(pmAddr, PM_ABI, w);
      const betTx = await pmc.placeBet(ceid, predictBps, betAmount);
      const receipt = await betTx.wait();

      await db.execute(
        'INSERT INTO prediction_bets (event_id, user_address, predicted_pnl_pct, bet_amount, bet_tx_hash, created_at) VALUES (?,?,?,?,?,NOW())',
        [evt.event_id, w.address, pct, amt, receipt.hash]
      );
      eventPool += amt;

      if ((i + 1) % 10 === 0 || i === wallets.length - 1) {
        console.log(`  ${i + 1}/${wallets.length} done (latest: predict=${pct}% $${amt})`);
      }
    }

    await db.execute(
      'UPDATE prediction_events SET participant_count = participant_count + ?, total_pool = total_pool + ? WHERE event_id = ?',
      [wallets.length, eventPool, evt.event_id]
    );
    console.log(`  ${evt.symbol}: ${wallets.length}人, 总池 $${eventPool}`);
  }

  // ── 汇总 ──
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ 完成！');
  const [result] = await db.execute(
    `SELECT symbol, participant_count, total_pool FROM prediction_events WHERE status='OPEN' AND env='testnet'`
  );
  for (const r of result) {
    console.log(`  ${r.symbol}: ${r.participant_count}人 $${r.total_pool}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  await db.end();
}

main().catch(e => {
  console.error('❌', e.reason || e.message);
  process.exit(1);
});

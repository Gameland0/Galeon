/**
 * bet_scenarios.js — 5种投注场景脚本
 *
 * 用法: node bet_scenarios.js <场景编号 1-5>
 * 不传参数则运行全部5个场景（需要5个OPEN事件）
 *
 * 场景说明:
 *   1. 【10倍利润】100人, 仅3人猜中, 猜中者获10x+回报
 *   2. 【鲸鱼大战】80人, 含5个大户($200-$500), 大小混合
 *   3. 【精准对决】60人, 15人中奖, 距离差异大, 展示权重效果
 *   4. 【全军覆没】50人, 无人猜中, 全池进储备
 *   5. 【大众赢家】120人, 30人中奖, 小额多人, 展示保底机制
 */

const { ethers } = require('ethers');
const mysql = require('mysql2/promise');
const path = require('path');

const RPC = 'https://sepolia.base.org';
const ADMIN_KEY = process.env.PREDICTION_ADMIN_KEY || '0x3fe8f9df4058328d538e865e8ce07ddb71c9e3d6040cb1e5040106894d4ab88e';
const ETH_PER_W = ethers.parseEther('0.00001');

const USDB_ABI = [
  'function faucet(address to, uint256 amount) external',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
];
const PM_ABI = [
  'function createEvent(bytes32 _eventId) external',
  'function placeBet(bytes32 _eventId, int256 _predictedPnlBps, uint256 _amount) external',
];

// ============ 5种场景配置 ============

const SCENARIOS = {
  1: {
    name: '10倍利润 — 少数精准赢家',
    count: 100,
    // 3人猜准(距离<2%), 97人猜偏(距离>2%)
    // 假设实际PnL在+3%左右, 猜准的人预测+2%~+4%, 其他人预测+8%~+20%
    generateBets: () => {
      const bets = [];
      // 3个精准赢家
      bets.push({ pct: 3.5, amt: 10 });   // dist ~0.5%, 10x候选
      bets.push({ pct: 2.8, amt: 5 });    // dist ~0.2%
      bets.push({ pct: 4.0, amt: 8 });    // dist ~1.0%
      // 97个输家 - 预测偏离较远
      for (let i = 0; i < 97; i++) {
        const pct = Math.round((Math.random() * 15 + 8) * 10) / 10; // +8% ~ +23%
        const amt = Math.floor(Math.random() * 15) + 5; // $5~$20
        bets.push({ pct, amt });
      }
      return bets;
    },
  },

  2: {
    name: '鲸鱼大战 — 大户小户混合',
    count: 80,
    generateBets: () => {
      const bets = [];
      // 5个大户
      bets.push({ pct: 2.0, amt: 500 });  // 大户A 猜准
      bets.push({ pct: 5.5, amt: 300 });  // 大户B 猜偏
      bets.push({ pct: 3.0, amt: 400 });  // 大户C 猜准
      bets.push({ pct: -1.0, amt: 200 }); // 大户D 猜很偏
      bets.push({ pct: 3.5, amt: 250 });  // 大户E 猜准
      // 75个散户
      for (let i = 0; i < 75; i++) {
        const pct = Math.round((Math.random() * 20 - 5) * 10) / 10;
        const amt = Math.floor(Math.random() * 20) + 1; // $1~$20
        bets.push({ pct, amt });
      }
      return bets;
    },
  },

  3: {
    name: '精准对决 — 距离权重展示',
    count: 60,
    generateBets: () => {
      const bets = [];
      // 15人在±2%内, 不同距离展示权重差异
      // 假设实际~+3%
      bets.push({ pct: 3.0, amt: 20 });  // dist 0.0% 完美
      bets.push({ pct: 3.1, amt: 15 });  // dist 0.1%
      bets.push({ pct: 2.5, amt: 25 });  // dist 0.5%
      bets.push({ pct: 3.8, amt: 10 });  // dist 0.8%
      bets.push({ pct: 2.0, amt: 30 });  // dist 1.0%
      bets.push({ pct: 4.0, amt: 12 });  // dist 1.0%
      bets.push({ pct: 1.5, amt: 18 });  // dist 1.5%
      bets.push({ pct: 4.5, amt: 8 });   // dist 1.5%
      bets.push({ pct: 4.8, amt: 15 });  // dist 1.8%
      bets.push({ pct: 1.2, amt: 22 });  // dist 1.8%
      bets.push({ pct: 5.0, amt: 10 });  // dist 2.0% 刚好及格
      bets.push({ pct: 1.0, amt: 14 });  // dist 2.0% 刚好及格
      bets.push({ pct: 3.2, amt: 50 });  // dist 0.2% 大注+准
      bets.push({ pct: 2.8, amt: 40 });  // dist 0.2% 大注+准
      bets.push({ pct: 3.5, amt: 35 });  // dist 0.5%
      // 45个输家
      for (let i = 0; i < 45; i++) {
        const pct = Math.round((Math.random() * 15 + 8) * 10) / 10;
        const amt = Math.floor(Math.random() * 25) + 5;
        bets.push({ pct, amt });
      }
      return bets;
    },
  },

  4: {
    name: '全军覆没 — 无人猜中',
    count: 50,
    // 所有人预测偏离>2%, 实际PnL大涨或大跌
    generateBets: () => {
      const bets = [];
      for (let i = 0; i < 50; i++) {
        // 假设实际PnL会是很极端的值(>10%或<-10%)
        // 所有人预测在-5%~+8%范围, 都会超出±2%
        const pct = Math.round((Math.random() * 13 - 5) * 10) / 10;
        const amt = Math.floor(Math.random() * 15) + 5;
        bets.push({ pct, amt });
      }
      return bets;
    },
  },

  5: {
    name: '大众赢家 — 多人中奖+保底',
    count: 120,
    generateBets: () => {
      const bets = [];
      // 30人在±2%内(各种金额), 90人在外
      // 假设实际~+3%
      for (let i = 0; i < 30; i++) {
        const pct = Math.round((3 + (Math.random() * 4 - 2)) * 10) / 10; // +1%~+5%
        const amt = Math.floor(Math.random() * 46) + 5; // $5~$50
        bets.push({ pct, amt });
      }
      for (let i = 0; i < 90; i++) {
        const pct = Math.round((Math.random() * 20 + 8) * 10) / 10; // +8%~+28%
        const amt = Math.floor(Math.random() * 20) + 1;
        bets.push({ pct, amt });
      }
      return bets;
    },
  },
};

// ============ 主逻辑 ============

async function getDb() {
  return mysql.createConnection({ host: 'localhost', port: 3306, user: 'rott', password: '123', database: 'multiagent_platforms' });
}

async function runScenario(scenarioNum, event, pm, pmAddr, usdb, usdbAddr, admin, db) {
  const scenario = SCENARIOS[scenarioNum];
  const bets = scenario.generateBets();
  const ceid = ethers.keccak256(ethers.toUtf8Bytes(event.event_id));

  console.log(`\n  【场景${scenarioNum}】${scenario.name}`);
  console.log(`  事件: ${event.symbol} | ${bets.length}人`);

  // 创建链上事件
  try {
    const tx = await pm.createEvent(ceid);
    await tx.wait();
  } catch (e) {
    console.log('  createEvent:', e.reason || e.message);
  }
  await db.execute('UPDATE prediction_events SET contract_event_id = ? WHERE event_id = ?', [ceid, event.event_id]);

  // 生成钱包
  const wallets = bets.map(() => ethers.Wallet.createRandom().connect(admin.provider));

  // 分发ETH + mint USDB
  process.stdout.write('  分发中: ');
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const mintAmt = BigInt(bets[i].amt * 1e6) + BigInt(1e6);
    await (await admin.sendTransaction({ to: w.address, value: ETH_PER_W, gasLimit: 50000 })).wait();
    await (await usdb.faucet(w.address, mintAmt)).wait();
    if ((i + 1) % 20 === 0) process.stdout.write(`${i + 1}`);
    else if ((i + 1) % 5 === 0) process.stdout.write('.');
  }
  console.log(' ✅');

  // 下注
  let eventPool = 0;
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const { pct, amt } = bets[i];
    const betAmount = BigInt(amt * 1e6);
    const predictBps = Math.round(pct * 100);

    const uc = new ethers.Contract(usdbAddr, USDB_ABI, w);
    await (await uc.approve(pmAddr, betAmount * 10n)).wait();
    await new Promise(r => setTimeout(r, 1500));

    const pmc = new ethers.Contract(pmAddr, PM_ABI, w);
    await (await pmc.placeBet(ceid, predictBps, betAmount)).wait();

    await db.execute(
      'INSERT INTO prediction_bets (event_id, user_address, predicted_pnl_pct, bet_amount, bet_tx_hash, created_at) VALUES (?,?,?,?,?,NOW())',
      [event.event_id, w.address, pct, amt, '0x' + Buffer.from(ethers.randomBytes(32)).toString('hex')]
    );
    eventPool += amt;

    if ((i + 1) % 20 === 0 || i === wallets.length - 1) {
      console.log(`  ${i + 1}/${wallets.length} (latest: predict=${pct}% $${amt})`);
    }
  }

  await db.execute(
    'UPDATE prediction_events SET participant_count = participant_count + ?, total_pool = total_pool + ? WHERE event_id = ?',
    [wallets.length, eventPool, event.event_id]
  );

  console.log(`  ✅ ${event.symbol}: ${wallets.length}人, 总池 $${eventPool}`);
}

async function main() {
  const targetScenario = process.argv[2] ? parseInt(process.argv[2]) : null;
  const provider = new ethers.JsonRpcProvider(RPC);
  const admin = new ethers.Wallet(ADMIN_KEY, provider);

  console.log(`${'='.repeat(60)}`);
  console.log(' 投注场景脚本');
  console.log(`${'='.repeat(60)}`);
  console.log(`Admin: ${admin.address}`);
  const ethBal = await provider.getBalance(admin.address);
  console.log(`ETH: ${ethers.formatEther(ethBal)}`);

  // deployer
  const pmAdmin = ethers.Wallet.createRandom().connect(provider);
  await (await admin.sendTransaction({ to: pmAdmin.address, value: ethers.parseEther('0.001'), gasLimit: 50000 })).wait();

  // 部署合约
  const usdbArt = require(path.join(__dirname, 'TestUSD.json'));
  const pmArt = require(path.join(__dirname, 'PredictionMarket.json'));

  console.log('\n部署合约...');
  const usdb = await new ethers.ContractFactory(usdbArt.abi, usdbArt.bytecode, pmAdmin).deploy();
  await usdb.waitForDeployment();
  const usdbAddr = await usdb.getAddress();
  await new Promise(r => setTimeout(r, 4000));

  const pmDeploy = await new ethers.ContractFactory(pmArt.abi, pmArt.bytecode, pmAdmin).deploy(usdbAddr, pmAdmin.address, pmAdmin.address, pmAdmin.address, pmAdmin.address);
  await pmDeploy.waitForDeployment();
  const pmAddr = await pmDeploy.getAddress();
  await new Promise(r => setTimeout(r, 4000));
  const pm = new ethers.Contract(pmAddr, PM_ABI, pmAdmin);
  console.log(`USDB: ${usdbAddr}`);
  console.log(`PM:   ${pmAddr}`);

  // 读取OPEN事件
  const db = await getDb();
  const [events] = await db.execute(
    `SELECT event_id, symbol, direction FROM prediction_events WHERE status = 'OPEN' AND env = 'testnet' AND participant_count = 0 ORDER BY created_at ASC`
  );
  console.log(`\nOPEN事件(未参与): ${events.map(e => e.symbol).join(', ') || '无'}`);

  if (events.length === 0) {
    console.log('❌ 没有可用的OPEN事件');
    await db.end();
    return;
  }

  // 运行场景
  const scenariosToRun = targetScenario ? [targetScenario] : [1, 2, 3, 4, 5];

  for (let i = 0; i < scenariosToRun.length; i++) {
    const sNum = scenariosToRun[i];
    if (i >= events.length) {
      console.log(`\n  ⚠️ 场景${sNum}: 没有更多OPEN事件`);
      continue;
    }
    await runScenario(sNum, events[i], pm, pmAddr, usdb, usdbAddr, admin, db);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ 完成！');
  const [result] = await db.execute(
    `SELECT symbol, participant_count, total_pool FROM prediction_events WHERE status='OPEN' AND env='testnet' AND participant_count > 0`
  );
  for (const r of result) {
    console.log(`  ${r.symbol}: ${r.participant_count}人 $${r.total_pool}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  await db.end();
}

main().catch(e => { console.error('❌', e.reason || e.message); process.exit(1); });

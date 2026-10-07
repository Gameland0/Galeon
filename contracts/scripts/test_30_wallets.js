/**
 * test_30_wallets.js
 *
 * 全流程测试：30个钱包参与预测市场结算
 *
 * 步骤：
 *  1. 部署 TestUSD (USDB) — 公开 faucet，无限铸币
 *  2. 部署新的 PredictionMarket (使用 USDB)
 *  3. 生成 30 个随机钱包
 *  4. Admin 给每个钱包发 0.002 ETH (gas费) + mint 5 USDB
 *  5. 创建预测事件
 *  6. 30个钱包各自 approve + placeBet (预测值分布在 -10% ~ +15%)
 *  7. Admin 以 actualPnl = +3.5% 结算
 *  8. 输出完整结算报告
 */

const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const RPC = 'https://sepolia.base.org';
const ADMIN_KEY = process.env.PRIVATE_KEY;

// 合约 ABI (只需要用到的函数)
const USDB_ABI = [
  'function faucet(address to, uint256 amount) external',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
];

const PM_ABI = [
  'function createEvent(bytes32 _eventId) external',
  'function placeBet(bytes32 _eventId, int256 _predictedPnlBps, uint256 _amount) external',
  'function settle(bytes32 _eventId, int256 _actualPnlBps, uint256[] calldata _winnerIndices, uint256[] calldata _payouts) external',
  'function getEvent(bytes32 _eventId) view returns (uint256 totalPool, uint256 participantCount, uint8 status, uint64 createdAt, int256 actualPnlBps)',
  'function getBet(bytes32 _eventId, uint256 _index) view returns (address user, int256 predictedPnlBps, uint256 amount)',
  'function getBetCount(bytes32 _eventId) view returns (uint256)',
];

// 结算引擎常量（与 SettlementEngine.js 一致）
const CONFIG = {
  THRESHOLD_LONG: 3.0,
  GATE_LONG: 7.5,
  DECAY_POWER: 1.5,
  RATE_FLOOR: 0.08,
  RANK_DECAY: 0.65,
  PLATFORM_FEE_PCT: 0.05,
  AVAILABLE_PCT: 0.85,
  MAX_WINNERS_CAP: 7,
  WINNER_SCALE_PCT: 0.15,
};

function getMaxWinners(n) {
  if (n <= 3) return 1;
  if (n <= 7) return 2;
  if (n <= 14) return 3;
  if (n <= 39) return Math.floor(n * CONFIG.WINNER_SCALE_PCT);
  return CONFIG.MAX_WINNERS_CAP;
}

function calcRate(distance, threshold) {
  const d = Math.max(distance, 0.1);
  const raw = Math.pow(threshold / d, CONFIG.DECAY_POWER);
  return Math.max(Math.min(raw, 1.0), CONFIG.RATE_FLOOR);
}

function settle(bets, actualPnlPct) {
  const totalPool = bets.reduce((s, b) => s + b.amount, 0);
  const platformFee = totalPool * CONFIG.PLATFORM_FEE_PCT;
  const availablePool = totalPool * CONFIG.AVAILABLE_PCT;
  const gate = CONFIG.GATE_LONG;
  const threshold = CONFIG.THRESHOLD_LONG;

  const participants = bets.map((b, idx) => ({
    idx,
    address: b.address,
    predictPct: b.predictPct,
    amount: b.amount,
    distance: Math.abs(b.predictPct - actualPnlPct),
  }));

  const qualified = participants
    .filter(p => p.distance <= gate)
    .sort((a, b) => a.distance - b.distance);

  if (qualified.length === 0) {
    return { status: 'NO_WINNER', totalPool, platformFee, availablePool, winners: [], participants };
  }

  const maxWinners = getMaxWinners(participants.length);
  let winners = [];
  let rank = 0;
  let i = 0;
  while (i < qualified.length && rank < maxWinners) {
    rank++;
    const dist = qualified[i].distance;
    while (i < qualified.length && qualified[i].distance === dist) {
      winners.push({ ...qualified[i], rank });
      i++;
    }
  }

  for (const w of winners) {
    w.rate = calcRate(w.distance, threshold);
    w.rankWeight = Math.pow(CONFIG.RANK_DECAY, w.rank - 1);
    w.effectiveWeight = w.rate * w.rankWeight * w.amount;
  }

  const totalEW = winners.reduce((s, w) => s + w.effectiveWeight, 0);
  let totalPayout = 0;

  for (const w of winners) {
    let payout = totalEW > 0 ? availablePool * (w.effectiveWeight / totalEW) : 0;
    const cap = availablePool * w.rate;
    payout = Math.min(payout, cap);
    w.payout = payout;
    w.netPnl = payout - w.amount;
    totalPayout += payout;
  }

  return {
    status: 'SETTLED',
    totalPool,
    platformFee,
    availablePool,
    totalPayout,
    reserveAmount: totalPool - platformFee - totalPayout,
    winnerCount: winners.length,
    maxWinners,
    winners,
    participants,
  };
}

// 预测值分布（30个不同值，单位%）
const PREDICTIONS = [
  3.0, 1.5, 5.0, -1.0, 4.5, 0.5, 8.0, -5.0, 2.0, 6.5,
  -3.0, 7.0, 1.0, 9.5, -8.0, 3.5, 12.0, -2.5, 0.2, 15.0,
  -10.0, 4.0, 2.8, 6.0, -0.5, 11.0, -7.0, 3.2, 0.8, -4.0
];

const ACTUAL_PNL = 3.5;   // 实际 PnL%
const BET_AMOUNT = 5;     // $5 USDB each
const BET_WEI = BigInt(BET_AMOUNT) * BigInt(1e6);
// Base Sepolia gas 极低 (~0.011 gwei), 每个钱包只需很少 ETH
const ETH_PER_WALLET = ethers.parseEther('0.00001'); // 0.00001 ETH 足够做 approve+bet
const MIN_ADMIN_ETH  = ethers.parseEther('0.001');   // admin 至少需要 0.001 ETH 做部署+transfer

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const admin = new ethers.Wallet(ADMIN_KEY, provider);
  console.log(`\n${'='.repeat(65)}`);
  console.log(' 预测市场 30钱包测试');
  console.log(`${'='.repeat(65)}`);
  console.log(`Admin: ${admin.address}`);

  const ethBal = await provider.getBalance(admin.address);
  console.log(`Admin ETH: ${ethers.formatEther(ethBal)} ETH`);
  if (ethBal < MIN_ADMIN_ETH) {
    console.error(`❌ Admin ETH 不足，当前: ${ethers.formatEther(ethBal)} ETH`);
    console.error(`   请从 Base Sepolia faucet 获取至少 0.001 ETH 到: ${admin.address}`);
    console.error(`   推荐 faucet: https://faucet.quicknode.com/base/sepolia`);
    process.exit(1);
  }

  // ── Step 1: 编译并部署 TestUSD ─────────────────────────────────────────
  console.log('\n[1/6] 部署 TestUSD (USDB)...');

  // 使用 hardhat artifacts 获取 bytecode
  let USDB_BYTECODE, PM_BYTECODE;
  try {
    const usdbArtifact = require('../artifacts/src/TestUSD.sol/TestUSD.json');
    USDB_BYTECODE = usdbArtifact.bytecode;
  } catch (e) {
    console.error('❌ TestUSD.json 未找到，请先运行: npx hardhat compile');
    process.exit(1);
  }
  try {
    const pmArtifact = require('../artifacts/src/PredictionMarket.sol/PredictionMarket.json');
    PM_BYTECODE = pmArtifact.bytecode;
  } catch (e) {
    console.error('❌ PredictionMarket.json 未找到，请先运行: npx hardhat compile');
    process.exit(1);
  }

  const usdbFactory = new ethers.ContractFactory(USDB_ABI, USDB_BYTECODE, admin);
  const usdb = await usdbFactory.deploy();
  await usdb.waitForDeployment();
  const usdbAddr = await usdb.getAddress();
  console.log(`   TestUSD 部署成功: ${usdbAddr}`);

  // ── Step 2: 部署 PredictionMarket ─────────────────────────────────────
  console.log('\n[2/6] 部署 PredictionMarket...');

  const pmAbi = [
    'constructor(address _usdc, address _platformWallet, address _reserveWallet, address _guardian)',
    ...PM_ABI,
  ];
  const pmFactory = new ethers.ContractFactory(pmAbi, PM_BYTECODE, admin);
  const pm = await pmFactory.deploy(usdbAddr, admin.address, admin.address, admin.address);
  await pm.waitForDeployment();
  const pmAddr = await pm.getAddress();
  console.log(`   PredictionMarket 部署成功: ${pmAddr}`);

  // ── Step 3: 生成 30 个钱包 ─────────────────────────────────────────────
  console.log('\n[3/6] 生成 30 个测试钱包...');
  const wallets = Array.from({ length: 30 }, (_, i) => {
    const w = ethers.Wallet.createRandom().connect(provider);
    return { idx: i, wallet: w, predictPct: PREDICTIONS[i] };
  });
  console.log(`   已生成 30 个钱包`);

  // ── Step 4: 发 ETH + mint USDB ────────────────────────────────────────
  console.log('\n[4/6] 分发 ETH + mint USDB...');

  // 串行发 ETH + 等待确认（auto-nonce，避免冲突）
  const mintAmount = BET_WEI + BigInt(1e6); // $6 each
  process.stdout.write('   发ETH+mint: ');
  for (const w of wallets) {
    const ethTx = await admin.sendTransaction({ to: w.wallet.address, value: ETH_PER_WALLET });
    await ethTx.wait();
    const mintTx = await usdb.faucet(w.wallet.address, mintAmount);
    await mintTx.wait();
    process.stdout.write('.');
  }
  console.log(' ✅');

  // ── Step 5: 创建事件 ───────────────────────────────────────────────────
  console.log('\n[5/6] 创建预测事件...');
  const eventId = ethers.keccak256(ethers.toUtf8Bytes(`test-30w-${Date.now()}`));
  const pmContract = new ethers.Contract(pmAddr, PM_ABI, admin);
  const createTx = await pmContract.createEvent(eventId);
  await createTx.wait();
  console.log(`   事件 ID: ${eventId.slice(0, 20)}...`);

  // ── Step 6: 30 钱包并发下注 ────────────────────────────────────────────
  console.log('\n[6/6] 30个钱包下注...');
  console.log(`   actualPnl (结算用): +${ACTUAL_PNL}%`);

  const betResults = [];
  process.stdout.write('   Approve+Bet: ');
  for (const w of wallets) {
    const uc = new ethers.Contract(usdbAddr, USDB_ABI, w.wallet);

    // approve
    const approveTx = await uc.approve(pmAddr, BET_WEI * 2n);
    await approveTx.wait();

    // 等链上状态更新
    let allowanceVal = 0n;
    for (let attempt = 0; attempt < 10; attempt++) {
      allowanceVal = await uc.allowance(w.wallet.address, pmAddr);
      if (allowanceVal >= BET_WEI) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    if (allowanceVal < BET_WEI) {
      throw new Error(`Allowance not set for ${w.wallet.address}: ${allowanceVal}`);
    }

    const pmc = new ethers.Contract(pmAddr, PM_ABI, w.wallet);
    const predictBps = Math.round(w.predictPct * 100);
    const betTx = await pmc.placeBet(eventId, predictBps, BET_WEI);
    await betTx.wait();
    process.stdout.write('.');
  }
  console.log('✅');

  // ── 读取链上下注顺序 ───────────────────────────────────────────────────
  const betCount = await pmContract.getBetCount(eventId);
  const onChainBets = [];
  for (let i = 0; i < betCount; i++) {
    const [user, predictedPnlBps, amount] = await pmContract.getBet(eventId, i);
    onChainBets.push({
      idx: i,
      address: user,
      predictPct: Number(predictedPnlBps) / 100,
      amount: Number(amount) / 1e6,
    });
  }

  // ── 本地计算结算 ────────────────────────────────────────────────────────
  const result = settle(onChainBets, ACTUAL_PNL);

  // ── 构造链上 settle 参数 ────────────────────────────────────────────────
  const winnerIndices = result.winners.map(w => w.idx);
  const payouts = result.winners.map(w => BigInt(Math.floor(w.payout * 1e6)));

  // ── 等待 60s 冷却（如果上一笔结算是同一个合约） ──────────────────────────
  // 新合约 lastSettleTime=0，不需要等
  const actualPnlBps = Math.round(ACTUAL_PNL * 100);
  const settleTx = await pmContract.settle(eventId, actualPnlBps, winnerIndices, payouts);
  await settleTx.wait();

  // ── 输出报告 ────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(65)}`);
  console.log(' 结算报告');
  console.log(`${'='.repeat(65)}`);
  console.log(`实际 PnL:    +${ACTUAL_PNL}%`);
  console.log(`参与人数:    ${onChainBets.length}`);
  console.log(`总奖池:      $${result.totalPool.toFixed(2)}`);
  console.log(`平台抽水:    $${result.platformFee.toFixed(2)} (5%)`);
  console.log(`可分配池:    $${result.availablePool.toFixed(2)} (95%)`);
  console.log(`最大赢家数:  ${result.maxWinners}`);
  console.log(`实际赢家数:  ${result.winnerCount}`);
  console.log(`总发放奖金:  $${(result.totalPayout || 0).toFixed(2)}`);
  console.log(`储备池:      $${(result.reserveAmount || 0).toFixed(2)}`);

  console.log(`\n${'─'.repeat(65)}`);
  console.log(' 🏆 赢家列表');
  console.log(`${'─'.repeat(65)}`);
  if (result.winners.length === 0) {
    console.log('  无赢家（所有预测超出资格线 7.5%）');
  } else {
    for (const w of result.winners) {
      console.log(
        `  Rank#${w.rank}  预测:${w.predictPct > 0 ? '+' : ''}${w.predictPct.toFixed(1)}%` +
        `  距离:${w.distance.toFixed(2)}%  Rate:${w.rate.toFixed(3)}` +
        `  奖金:$${w.payout.toFixed(2)}  净盈亏:${w.netPnl >= 0 ? '+' : ''}$${w.netPnl.toFixed(2)}` +
        `  地址:${w.address.slice(0, 10)}...`
      );
    }
  }

  console.log(`\n${'─'.repeat(65)}`);
  console.log(' 📋 全部参与者');
  console.log(`${'─'.repeat(65)}`);
  const sorted = [...onChainBets].sort((a, b) => Math.abs(a.predictPct - ACTUAL_PNL) - Math.abs(b.predictPct - ACTUAL_PNL));
  for (const p of sorted) {
    const dist = Math.abs(p.predictPct - ACTUAL_PNL);
    const isWinner = result.winners.find(w => w.idx === p.idx);
    const inGate = dist <= CONFIG.GATE_LONG;
    const status = isWinner ? `🏆 Rank#${isWinner.rank}` : inGate ? '✓ 资格' : '✗ 淘汰';
    console.log(
      `  ${status.padEnd(10)} 预测:${(p.predictPct >= 0 ? '+' : '') + p.predictPct.toFixed(1) + '%'}`.padEnd(28) +
      `距离:${dist.toFixed(2)}%`
    );
  }

  console.log(`\n${'='.repeat(65)}`);
  console.log(` TestUSD:          ${usdbAddr}`);
  console.log(` PredictionMarket: ${pmAddr}`);
  console.log(` Settle tx:        https://sepolia.basescan.org/tx/${settleTx.hash}`);
  console.log(`${'='.repeat(65)}\n`);
}

main().catch(e => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});

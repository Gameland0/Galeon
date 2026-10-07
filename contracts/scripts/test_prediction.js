/**
 * 预测市场完整场景测试脚本
 *
 * 场景规划 (actualPnl = +3.5%):
 *   W1: 预测 +3.0% → distance 0.5% → 资格内 → Rank 1 WINNER
 *   W2: 预测 +12.0% → distance 8.5% → 超出资格线(>7.5%) → LOSER
 *
 * 2人参与 → 1个winner
 * Pool = $10, available = $8.50 (85%)
 * Rate_W1 = min(1, (3.0/0.5)^1.5) = 1.0 → W1拿走全部$8.50
 * W1 net: +$3.50, W2 net: -$5.00
 */

const { ethers } = require('ethers');
require('dotenv').config();

const CONTRACT = '0x85de22618C8f4ED8661Bbc85749A7364E7B52E2e';
const USDC_ADDR = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RPC = 'https://sepolia.base.org';
const BACKEND = 'http://184.168.123.133:5000';

const CONTRACT_ABI = require('../artifacts/src/PredictionMarket.sol/PredictionMarket.json').abi;
const USDC_ABI = [
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];

const provider = new ethers.JsonRpcProvider(RPC);

// 测试钱包（W1=赢家，W2=输家）
const WALLETS = [
  { name: 'W1 (Winner)', key: '0x31ff5eb4dcec8df2027e0145802fc5d09de8a9b190191a37c46e4f10e57661cd', predict: 3.0 },
  { name: 'W2 (Loser)',  key: '0x83374bb37ccaedeb27da347f529ef5a753bee7f5bfedd828046b6c9c7ac25709', predict: 12.0 },
];

const EVENT_ID     = 'test-btc-long-002';
const CONTRACT_EID = '0x13a502b17f7d0c785ecb711d237c8770b336522f74a3582a7ad6f5a072c8d86b';
const ACTUAL_PNL   = 3.5; // 实际PnL%
const BET_AMOUNT   = 5n * 10n**6n; // $5 USDC

async function step(label, fn) {
  process.stdout.write(`\n[${label}] `);
  const result = await fn();
  console.log('✅');
  return result;
}

async function placeBet(walletInfo) {
  const signer = new ethers.Wallet(walletInfo.key, provider);
  const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, signer);
  const contract = new ethers.Contract(CONTRACT, CONTRACT_ABI, signer);

  const bal = await usdc.balanceOf(signer.address);
  console.log(`\n  ${walletInfo.name} (${signer.address.slice(0,10)}...) USDC: $${Number(bal)/1e6}`);

  // Approve (用 MaxUint256 避免 Circle USDC 的精确额度问题)
  const allowance = await usdc.allowance(signer.address, CONTRACT);
  console.log(`  → Current allowance: $${Number(allowance)/1e6}`);
  if (allowance < BET_AMOUNT) {
    process.stdout.write('  → Approving USDC (max)... ');
    const tx = await usdc.approve(CONTRACT, BET_AMOUNT);
    const receipt = await tx.wait();
    console.log(`done (gasUsed: ${receipt.gasUsed})`);
    // 等一下确认 allowance 已更新
    const newAllowance = await usdc.allowance(signer.address, CONTRACT);
    console.log(`  → New allowance: $${newAllowance >= BET_AMOUNT ? '✅ OK' : '❌ STILL LOW: ' + Number(newAllowance)/1e6}`);
  }

  // PlaceBet
  const predictBps = Math.round(walletInfo.predict * 100);
  process.stdout.write(`  → placeBet(predict=${walletInfo.predict}%, bps=${predictBps})... `);
  const tx = await contract.placeBet(CONTRACT_EID, predictBps, BET_AMOUNT);
  const receipt = await tx.wait();
  console.log(`done | tx: ${receipt.hash.slice(0,18)}...`);
  return receipt.hash;
}

async function getBalances(label) {
  console.log(`\n  [${label}]`);
  for (const w of WALLETS) {
    const addr = new ethers.Wallet(w.key).address;
    const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, provider);
    const bal = await usdc.balanceOf(addr);
    console.log(`  ${w.name}: $${(Number(bal)/1e6).toFixed(6)} USDC`);
  }
  // 合约余额
  const usdc = new ethers.Contract(USDC_ADDR, USDC_ABI, provider);
  const contractBal = await usdc.balanceOf(CONTRACT);
  console.log(`  Contract: $${(Number(contractBal)/1e6).toFixed(6)} USDC`);
}

async function triggerSettlement() {
  // 直接调后端 settlement API（需要有效的PT trade记录）
  // 这里通过直接调用合约的 settle() 来测试
  const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT, CONTRACT_ABI, adminWallet);

  const actualPnlBps = Math.round(ACTUAL_PNL * 100); // 350

  // 查链上event数据（ethers v6 getEvent 是内置方法，需用 getFunction 调用合约函数）
  const eventData = await contract.getFunction('getEvent')(CONTRACT_EID);
  console.log(`\n  Event on-chain: participantCount=${eventData.participantCount}, totalPool=$${Number(eventData.totalPool)/1e6}`);

  // winnerIndices: W1(index=0)是赢家, W2(index=1)超出资格线
  // 计算W1的payout
  // Pool = $10, available = $8.50
  // Rate = 1.0 (distance 0.5% < T=3.0%), weight = 1.0
  // payout = $8.50
  const availablePool = (10n * 10n**6n * 85n) / 100n; // $8.50
  const winnerIndices = [0]; // W1 is index 0 (first to bet)
  const payouts = [availablePool];

  process.stdout.write(`  → settle(actualPnl=${ACTUAL_PNL}%, winners=[W1], payout=$${Number(availablePool)/1e6})... `);
  const tx = await contract.settle(CONTRACT_EID, actualPnlBps, winnerIndices, payouts);
  const receipt = await tx.wait();
  console.log(`done | tx: ${receipt.hash.slice(0,18)}...`);
  return receipt.hash;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Prediction Market — Full Scenario Test');
  console.log('='.repeat(60));
  console.log(`Event:      ${EVENT_ID}`);
  console.log(`Actual PnL: +${ACTUAL_PNL}%`);
  console.log(`W1 predict: +${WALLETS[0].predict}% → distance ${Math.abs(WALLETS[0].predict - ACTUAL_PNL)}% → WITHIN gate (7.5%)`);
  console.log(`W2 predict: +${WALLETS[1].predict}% → distance ${Math.abs(WALLETS[1].predict - ACTUAL_PNL)}% → OUTSIDE gate`);

  // ── 初始余额 ────────────────────────────────────────────────────────────
  await getBalances('Before bets');

  // ── 下注 ────────────────────────────────────────────────────────────────
  console.log('\n--- Placing Bets ---');
  await placeBet(WALLETS[0]);
  await placeBet(WALLETS[1]);
  await getBalances('After bets (USDC locked in contract)');

  // ── 结算 ────────────────────────────────────────────────────────────────
  console.log('\n--- Settling ---');
  const settleTx = await triggerSettlement();

  // ── 结算后余额 ───────────────────────────────────────────────────────────
  await getBalances('After settlement (W1 should have ~$8.50)');

  // ── 结果验证 ─────────────────────────────────────────────────────────────
  console.log('\n='.repeat(60));
  console.log('Expected Results:');
  console.log(`  W1 (+${WALLETS[0].predict}%): should receive $8.50 → net +$3.50`);
  console.log(`  W2 (+${WALLETS[1].predict}%): outside gate, loses $5.00`);
  console.log(`  Platform fee: $0.50 (5%)`);
  console.log(`  Reserve:      $1.00 (10%)`);
  console.log('='.repeat(60));
  console.log(`\nSettle tx: https://sepolia.basescan.org/tx/${settleTx}`);
}

main().catch(e => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});

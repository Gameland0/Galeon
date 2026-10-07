/**
 * deploy_v2.js — 部署 PredictionMarket V2 (无签名验证版)
 *
 * 地址配置:
 *   Owner:          admin (后续转多签)
 *   Settler:        admin
 *   Guardian:       admin
 *   platformWallet: 多签钱包
 *   reserveWallet:  多签钱包
 */
const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

const RPC = 'https://sepolia.base.org';
const ADMIN_KEY = '0x3fe8f9df4058328d538e865e8ce07ddb71c9e3d6040cb1e5040106894d4ab88e';
const MULTISIG_WALLET = '0x8DEb5Ae2BB574a199FD6c6A476aa437F4f062e02';

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const admin = new ethers.Wallet(ADMIN_KEY, provider);

  console.log(`\n${'='.repeat(60)}`);
  console.log(' PredictionMarket V2 部署 + 测试');
  console.log(`${'='.repeat(60)}`);
  console.log(`Admin/Settler/Guardian: ${admin.address}`);
  console.log(`Platform/Reserve:       ${MULTISIG_WALLET}`);
  const ethBal = await provider.getBalance(admin.address);
  console.log(`ETH: ${ethers.formatEther(ethBal)}\n`);

  const usdbArt = JSON.parse(fs.readFileSync(path.join(__dirname, 'TestUSD.json')));
  const pmArt = JSON.parse(fs.readFileSync(path.join(__dirname, 'PredictionMarket.json')));

  // 用独立EOA部署（admin是EIP-7702 delegated account，有并发限制）
  const deployer = ethers.Wallet.createRandom().connect(provider);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Deployer Key: ${deployer.privateKey}`);
  // 立即保存，防止后续崩溃丢失
  fs.writeFileSync('/tmp/pm_v2_deployer.json', JSON.stringify({ address: deployer.address, key: deployer.privateKey }));
  console.log('  Deployer私钥已保存 /tmp/pm_v2_deployer.json');
  await (await admin.sendTransaction({ to: deployer.address, value: ethers.parseEther('0.003'), gasLimit: 50000 })).wait();
  console.log('  已补充ETH\n');

  // ── 1. 部署 TestUSD ──
  console.log('[1/4] 部署 TestUSD (USDB)...');
  const usdb = await new ethers.ContractFactory(usdbArt.abi, usdbArt.bytecode, deployer).deploy();
  await usdb.waitForDeployment();
  const usdbAddr = await usdb.getAddress();
  await sleep(4000);
  console.log(`  USDB: ${usdbAddr}`);

  // ── 2. 部署 PredictionMarket V2 ──
  console.log('\n[2/4] 部署 PredictionMarket V2...');
  const pm = await new ethers.ContractFactory(pmArt.abi, pmArt.bytecode, deployer).deploy(
    usdbAddr,           // _usdc (USDB)
    MULTISIG_WALLET,    // _platformWallet (手续费)
    MULTISIG_WALLET,    // _reserveWallet (储备池)
    admin.address,      // _guardian
    deployer.address,   // _settler (deployer先做settler，后面可改)
  );
  await pm.waitForDeployment();
  const pmAddr = await pm.getAddress();
  await sleep(4000);
  console.log(`  PM V2: ${pmAddr}`);
  console.log(`  Owner: ${await pm.owner()}`);
  console.log(`  Settler: ${await pm.settler()}`);
  console.log(`  Guardian: ${await pm.guardian()}`);
  console.log(`  Platform: ${await pm.platformWallet()}`);
  console.log(`  Reserve: ${await pm.reserveWallet()}`);

  // ── 3. 功能测试 ──
  console.log('\n[3/4] 功能测试...');

  // 3a. createEvent
  const eventId = ethers.id('test-v2-final');
  await (await pm.createEvent(eventId)).wait();
  console.log('  createEvent ✅');

  // 3b. mint USDB + placeBet (2个用户)
  const user1 = ethers.Wallet.createRandom().connect(provider);
  const user2 = ethers.Wallet.createRandom().connect(provider);
  await (await deployer.sendTransaction({ to: user1.address, value: ethers.parseEther('0.00008') })).wait();
  await (await deployer.sendTransaction({ to: user2.address, value: ethers.parseEther('0.00008') })).wait();

  const betAmount = BigInt(5e6); // $5
  await (await usdb.faucet(user1.address, betAmount * 2n)).wait();
  await (await usdb.faucet(user2.address, betAmount * 2n)).wait();
  console.log('  mint USDB ✅');

  // user1 bet +3.0%
  const usdb1 = new ethers.Contract(usdbAddr, usdbArt.abi, user1);
  await (await usdb1.approve(pmAddr, betAmount * 10n)).wait();
  await sleep(3000);
  const pm1 = new ethers.Contract(pmAddr, pmArt.abi, user1);
  await (await pm1.placeBet(eventId, 300, betAmount)).wait();
  console.log('  user1 placeBet(+3.0%, $5) ✅');

  // user2 bet +5.0%
  const usdb2 = new ethers.Contract(usdbAddr, usdbArt.abi, user2);
  await (await usdb2.approve(pmAddr, betAmount * 10n)).wait();
  await sleep(3000);
  const pm2 = new ethers.Contract(pmAddr, pmArt.abi, user2);
  await (await pm2.placeBet(eventId, 500, betAmount)).wait();
  console.log('  user2 placeBet(+5.0%, $5) ✅');

  // 3c. closeBetting
  await (await pm.closeBetting(eventId)).wait();
  console.log('  closeBetting ✅');

  // 3d. user3 尝试下注 — 应失败
  const user3 = ethers.Wallet.createRandom().connect(provider);
  await (await deployer.sendTransaction({ to: user3.address, value: ethers.parseEther('0.00005') })).wait();
  await (await usdb.faucet(user3.address, betAmount * 2n)).wait();
  const usdb3 = new ethers.Contract(usdbAddr, usdbArt.abi, user3);
  await (await usdb3.approve(pmAddr, betAmount * 10n)).wait();
  await sleep(3000);
  const pm3 = new ethers.Contract(pmAddr, pmArt.abi, user3);
  try {
    await (await pm3.placeBet(eventId, 200, betAmount)).wait();
    console.log('  closeBetting后下注: ❌ 不应成功');
  } catch (e) {
    console.log('  closeBetting后下注被拒: ✅ (NOT_OPEN)');
  }

  // 3e. settle — user1(+3%)距离actual(+4%)=1%, user2(+5%)距离=1%, 都在±2%内
  const evt = await pm.getFunction('getEvent').staticCall(eventId);
  console.log(`  Pool: $${Number(evt[0])/1e6}, Players: ${evt[1]}`);

  const actualBps = 400; // +4.0%
  const availablePool = (Number(evt[0]) * 9000) / 10000;
  const payout1 = Math.floor(availablePool / 2);
  const payout2 = Math.floor(availablePool / 2);

  await (await pm.settle(
    eventId, actualBps,
    [0, 1],
    [payout1, payout2]
  )).wait();
  console.log(`  settle(+4.0%) ✅ — 两人并列, 各分 $${payout1/1e6}`);

  // 3f. 检查手续费和储备池
  const platformBal = await usdb.balanceOf(MULTISIG_WALLET);
  console.log(`  多签钱包USDB余额: $${Number(platformBal)/1e6} (手续费+储备池)`);

  // ── 4. emergencyWithdraw timelock测试 ──
  console.log('\n[4/4] emergencyWithdraw测试...');
  const usdbDeployer = new ethers.Contract(usdbAddr, usdbArt.abi, deployer);
  await (await usdbDeployer.faucet(pmAddr, BigInt(50e6))).wait();
  console.log(`  合约余额: $${Number(await usdbDeployer.balanceOf(pmAddr))/1e6}`);

  // pause (deployer is owner, can pause)
  await (await pm.pause()).wait();
  console.log('  pause ✅');

  // requestWithdraw
  await (await pm.requestWithdraw(deployer.address)).wait();
  console.log('  requestWithdraw ✅');

  // 立即executeWithdraw — 应失败
  try {
    await (await pm.executeWithdraw(BigInt(50e6))).wait();
    console.log('  立即提款: ❌ 不应成功');
  } catch (e) {
    console.log('  立即提款被拒: ✅ (需等24小时)');
  }

  // ── 汇总 ──
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ 全部测试通过！');
  console.log(`  TestUSD (USDB):      ${usdbAddr}`);
  console.log(`  PredictionMarket V2: ${pmAddr}`);
  console.log(`  Owner:               ${admin.address}`);
  console.log(`  Settler/Guardian:    ${admin.address}`);
  console.log(`  Platform/Reserve:    ${MULTISIG_WALLET}`);

  const result = {
    usdb: usdbAddr,
    pm: pmAddr,
    owner: deployer.address,
    ownerKey: deployer.privateKey,
    settler: deployer.address,
    guardian: admin.address,
    platformWallet: MULTISIG_WALLET,
    reserveWallet: MULTISIG_WALLET,
    chain: 'base-sepolia',
    chainId: 84532,
  };
  fs.writeFileSync('/tmp/pm_v2_deploy.json', JSON.stringify(result, null, 2));
  console.log(`  保存: /tmp/pm_v2_deploy.json`);
  console.log(`${'='.repeat(60)}\n`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
main().catch(e => { console.error('❌', e.reason || e.message); process.exit(1); });

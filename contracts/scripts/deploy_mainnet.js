/**
 * deploy_mainnet.js — 部署 PredictionMarket V2 到 Base Mainnet
 *
 * 地址配置:
 *   Owner/Settler/Guardian: 0x330837C2a0D30Cb707e1576dFA4959FEE1427082
 *   PlatformWallet (2% fee): 0xc34b4124794d0a2143b427804E0D9fEf2fFdDDF8
 *   ReserveWallet (储备池):   0x8DEb5Ae2BB574a199FD6c6A476aa437F4f062e02
 *   USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (Base native USDC)
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://base.drpc.org';
const OWNER_KEY = '0xa3090624ecab9fcf4a3261de5812ef4852593decb4845104dc2fa64ad2de60bb';

const USDC_ADDRESS      = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PLATFORM_WALLET   = '0xc34b4124794d0a2143b427804E0D9fEf2fFdDDF8';
const RESERVE_WALLET    = '0x8DEb5Ae2BB574a199FD6c6A476aa437F4f062e02';

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const deployer = new ethers.Wallet(OWNER_KEY, provider);

  console.log(`\n${'='.repeat(60)}`);
  console.log(' PredictionMarket V2 — Base Mainnet 部署');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Deployer:        ${deployer.address}`);
  console.log(`  PlatformWallet:  ${PLATFORM_WALLET}`);
  console.log(`  ReserveWallet:   ${RESERVE_WALLET}`);
  console.log(`  USDC:            ${USDC_ADDRESS}`);

  const ethBal = await provider.getBalance(deployer.address);
  console.log(`  ETH Balance:     ${ethers.formatEther(ethBal)} ETH\n`);

  if (ethBal < ethers.parseEther('0.001')) {
    console.error('❌ ETH 不足，需要至少 0.001 ETH');
    process.exit(1);
  }

  // 加载合约 ABI + Bytecode
  const pmArt = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'artifacts', 'src', 'PredictionMarket.sol', 'PredictionMarket.json')
  ));

  console.log('[1/2] 部署 PredictionMarket V2...');
  const factory = new ethers.ContractFactory(pmArt.abi, pmArt.bytecode, deployer);
  const pm = await factory.deploy(
    USDC_ADDRESS,        // _usdc
    PLATFORM_WALLET,     // _platformWallet (手续费)
    RESERVE_WALLET,      // _reserveWallet (储备池)
    deployer.address,    // _guardian
    deployer.address,    // _settler
  );

  await pm.waitForDeployment();
  const pmAddr = await pm.getAddress();

  console.log(`  ✅ Deployed at: ${pmAddr}`);

  // 等待几秒让 RPC 同步
  await new Promise(r => setTimeout(r, 3000));

  // 验证
  console.log('\n[2/2] 验证合约状态...');
  const owner = await pm.owner();
  const settler = await pm.settler();
  const guardian = await pm.guardian();
  const platformWallet = await pm.platformWallet();
  const reserveWallet = await pm.reserveWallet();
  const paused = await pm.paused();

  console.log(`  Owner:          ${owner}`);
  console.log(`  Settler:        ${settler}`);
  console.log(`  Guardian:       ${guardian}`);
  console.log(`  PlatformWallet: ${platformWallet}`);
  console.log(`  ReserveWallet:  ${reserveWallet}`);
  console.log(`  Paused:         ${paused}`);

  // 保存部署结果
  const result = {
    contract: pmAddr,
    owner: deployer.address,
    settler: deployer.address,
    guardian: deployer.address,
    platformWallet: PLATFORM_WALLET,
    reserveWallet: RESERVE_WALLET,
    usdc: USDC_ADDRESS,
    chain: 'base-mainnet',
    chainId: 8453,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, 'deploy_mainnet_result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ 部署完成！');
  console.log(`  合约地址: ${pmAddr}`);
  console.log(`  结果已保存: ${outPath}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error('❌ 部署失败:', err.reason || err.message);
  process.exit(1);
});

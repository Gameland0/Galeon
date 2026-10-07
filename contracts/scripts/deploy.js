const { ethers } = require("hardhat");
const fs = require("fs");

/**
 * 部署 PredictionMarket
 *
 * 构造函数参数:
 *   _usdc          — USDC 合约地址
 *   _platformWallet — 平台手续费接收地址 (5%)
 *   _reserveWallet  — 无人获奖时资金池地址 (10%+)
 *   _guardian       — 独立监控地址 (只能 pause，不能转钱)
 *
 * 环境变量覆盖:
 *   USDC_ADDRESS / PLATFORM_WALLET / RESERVE_WALLET / GUARDIAN_ADDRESS
 */

// Base Sepolia 官方 Circle USDC
const BASE_TESTNET_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(60));
  console.log(`Network  : ${network.name} (chainId=${network.chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("=".repeat(60));

  // 参数配置（测试网默认用deployer地址，生产环境必须显式指定）
  const usdcAddress     = process.env.USDC_ADDRESS      || BASE_TESTNET_USDC;
  const platformWallet  = process.env.PLATFORM_WALLET   || deployer.address;
  const reserveWallet   = process.env.RESERVE_WALLET    || deployer.address;
  const guardianAddress = process.env.GUARDIAN_ADDRESS  || deployer.address;

  console.log("\nConstructor args:");
  console.log(`  USDC           : ${usdcAddress}`);
  console.log(`  platformWallet : ${platformWallet}`);
  console.log(`  reserveWallet  : ${reserveWallet}`);
  console.log(`  guardian       : ${guardianAddress}`);
  console.log("");

  // 部署
  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const contract = await PredictionMarket.deploy(
    usdcAddress,
    platformWallet,
    reserveWallet,
    guardianAddress
  );

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("✅ PredictionMarket deployed!");
  console.log(`   Address : ${address}`);
  console.log(`   Tx hash : ${contract.deploymentTransaction().hash}`);

  // 验证链上参数
  console.log("\nVerifying on-chain state...");
  const owner    = await contract.owner();
  const guardian = await contract.guardian();
  const usdc     = await contract.usdc();
  console.log(`   owner    : ${owner}`);
  console.log(`   guardian : ${guardian}`);
  console.log(`   usdc     : ${usdc}`);

  // 保存部署信息
  const deployInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    contractAddress: address,
    usdcAddress,
    platformWallet,
    reserveWallet,
    guardian: guardianAddress,
    deployedAt: new Date().toISOString(),
    deployTx: contract.deploymentTransaction().hash,
  };

  const outPath = `./deployments/${network.chainId}.json`;
  fs.mkdirSync("./deployments", { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(deployInfo, null, 2));
  console.log(`\n📄 Deployment saved to ${outPath}`);
  console.log("\n🔧 Next steps:");
  console.log(`   1. Set in ai-server/.env:`);
  console.log(`      PREDICTION_CONTRACT_ADDRESS=${address}`);
  console.log(`   2. Verify contract:`);
  console.log(`      npx hardhat verify --network baseTestnet ${address} ${usdcAddress} ${platformWallet} ${reserveWallet} ${guardianAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

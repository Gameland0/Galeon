/**
 * Deploy GaleonBrain + GaleonRouter to Monad Testnet
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx hardhat run scripts/deploy-brain-link.js --network monadTestnet
 *
 * After deployment, update:
 *   - ai-server/src/config/contracts.js (GaleonBrain, GaleonRouter)
 *   - ai-dapp/.env.development (REACT_APP_MONAD_GALEON_BRAIN_ADDRESS, REACT_APP_MONAD_GALEON_ROUTER_ADDRESS)
 *   - ai-dapp/.env.production (same)
 */

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "MON");

  if (balance === 0n) {
    console.error("❌ No MON balance. Get testnet MON from https://faucet.monad.xyz/");
    process.exit(1);
  }

  // 1. Deploy GaleonBrain
  console.log("\n📦 Deploying GaleonBrain...");
  const GaleonBrain = await hre.ethers.getContractFactory("GaleonBrain");
  const galeonBrain = await GaleonBrain.deploy(deployer.address); // oracle = deployer for now
  await galeonBrain.waitForDeployment();
  const brainAddress = await galeonBrain.getAddress();
  console.log("✅ GaleonBrain deployed to:", brainAddress);

  // 2. Deploy GaleonRouter
  console.log("\n📦 Deploying GaleonRouter...");
  const GaleonRouter = await hre.ethers.getContractFactory("GaleonRouter");
  const galeonRouter = await GaleonRouter.deploy(
    brainAddress,       // galeonBrain address
    deployer.address    // feeReceiver = deployer for testnet
  );
  await galeonRouter.waitForDeployment();
  const routerAddress = await galeonRouter.getAddress();
  console.log("✅ GaleonRouter deployed to:", routerAddress);

  // 3. Configure: Set GaleonRouter as authorized caller in GaleonBrain
  console.log("\n⚙️ Configuring GaleonBrain.setRouter...");
  const setRouterTx = await galeonBrain.setRouter(routerAddress);
  await setRouterTx.wait();
  console.log("✅ GaleonRouter set as authorized router in GaleonBrain");

  // 4. Approve Kuru Router as target in GaleonRouter
  // Kuru 主网 Router + Flow Entrypoint
  const kuruRouter = "0xd651346d7c789536ebf06dc72aE3C8502cd695CC";
  const kuruFlowEntrypoint = "0xb3e6778480b2E488385E8205eA05E20060B813cb";
  console.log("\n⚙️ Approving Kuru mainnet routers as swap targets...");
  const approveTx1 = await galeonRouter.setApprovedTarget(kuruRouter, true);
  await approveTx1.wait();
  console.log("✅ Kuru Router approved:", kuruRouter);
  const approveTx2 = await galeonRouter.setApprovedTarget(kuruFlowEntrypoint, true);
  await approveTx2.wait();
  console.log("✅ Kuru Flow Entrypoint approved:", kuruFlowEntrypoint);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE — Monad Testnet");
  console.log("=".repeat(60));
  console.log(`GaleonBrain:  ${brainAddress}`);
  console.log(`GaleonRouter: ${routerAddress}`);
  console.log(`Oracle:       ${deployer.address}`);
  console.log(`FeeReceiver:  ${deployer.address}`);
  console.log(`Kuru Router:  ${kuruTestnetRouter}`);
  console.log("=".repeat(60));
  console.log("\n📝 Update these files:");
  console.log(`   ai-server/src/config/contracts.js → GaleonBrain: '${brainAddress}', GaleonRouter: '${routerAddress}'`);
  console.log(`   ai-dapp/.env.development → REACT_APP_MONAD_GALEON_BRAIN_ADDRESS=${brainAddress}`);
  console.log(`   ai-dapp/.env.development → REACT_APP_MONAD_GALEON_ROUTER_ADDRESS=${routerAddress}`);
  console.log(`   .env → MONAD_ORACLE_PRIVATE_KEY=<your deployer private key>`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });

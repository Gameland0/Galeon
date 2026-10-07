/**
 * Deploy GaleonRouter V2 to Monad Mainnet
 * Reuses existing GaleonBrain contract
 *
 * Usage: npx hardhat run scripts/deploy-brain-link-v2.js --network monad
 */
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("MON balance:", hre.ethers.formatEther(balance));

  const BRAIN = "0xE1E61ecdc2C98f22A83E22a9207b43Bf64e63f98"; // Existing GaleonBrain
  const FEE_RECEIVER = "0xeD4c2576A79D1BB10f9076A69b7Def188A97909A";
  const KURU_ROUTER = "0xd651346d7c789536ebf06dc72aE3C8502cd695CC";
  const KURU_FLOW = "0xb3e6778480b2E488385E8205eA05E20060B813cb";

  // 1. Deploy new GaleonRouter V2
  console.log("\n📦 Deploying GaleonRouter V2...");
  const GaleonRouter = await hre.ethers.getContractFactory("GaleonRouter");
  const router = await GaleonRouter.deploy(
    BRAIN,              // galeonBrain
    deployer.address,   // oracle
    FEE_RECEIVER        // feeReceiver
  );
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("✅ GaleonRouter V2:", routerAddress);

  // 2. Update GaleonBrain to point to new router
  console.log("\n⚙️ Updating GaleonBrain.setRouter...");
  const brain = await hre.ethers.getContractAt("GaleonBrain", BRAIN);
  await (await brain.setRouter(routerAddress)).wait();
  console.log("✅ Brain router updated");

  // 3. Approve Kuru targets
  console.log("\n⚙️ Approving Kuru targets...");
  await (await router.setApprovedTarget(KURU_ROUTER, true)).wait();
  await (await router.setApprovedTarget(KURU_FLOW, true)).wait();
  console.log("✅ Kuru Router + Flow approved");

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("GaleonRouter V2: " + routerAddress);
  console.log("GaleonBrain:     " + BRAIN);
  console.log("Oracle:          " + deployer.address);
  console.log("Fee Receiver:    " + FEE_RECEIVER);
  console.log("=".repeat(50));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

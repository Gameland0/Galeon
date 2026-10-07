/**
 * scheduled_unpause.js — 定时 unpause PredictionMarket 合约
 *
 * 合约 unpause 需要等 pause 后 24 小时。
 * 此脚本会每 5 分钟检查一次，到时间自动 unpause。
 *
 * 用法: node scheduled_unpause.js
 */

const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

const RPC_URL = 'https://base.drpc.org';
const CONTRACT_ADDRESS = '0xA21be9b7813561d684e5503c15d3c3171Fe94712';
const OWNER_KEY = '0xa3090624ecab9fcf4a3261de5812ef4852593decb4845104dc2fa64ad2de60bb';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

async function main() {
  const pmArt = JSON.parse(fs.readFileSync(path.join(__dirname, 'PredictionMarket.json')));
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(OWNER_KEY, provider);
  const pm = new ethers.Contract(CONTRACT_ADDRESS, pmArt.abi, wallet);

  console.log(`\n${'='.repeat(60)}`);
  console.log('  PredictionMarket Scheduled Unpause');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Contract: ${CONTRACT_ADDRESS}`);
  console.log(`  Owner:    ${wallet.address}`);
  console.log(`  RPC:      ${RPC_URL}`);
  console.log(`  Check interval: ${CHECK_INTERVAL_MS / 1000}s\n`);

  // 验证合约状态
  const paused = await pm.paused();
  if (!paused) {
    console.log('✅ Contract is already unpaused. Nothing to do.');
    process.exit(0);
  }

  const pausedAt = await pm.pausedAt();
  const UNPAUSE_DELAY = 24 * 60 * 60; // 24 hours in seconds
  const unpauseAfter = Number(pausedAt) + UNPAUSE_DELAY;
  const unpauseDate = new Date(unpauseAfter * 1000);

  console.log(`  Paused at:      ${new Date(Number(pausedAt) * 1000).toISOString()}`);
  console.log(`  Can unpause at: ${unpauseDate.toISOString()}`);
  console.log(`  Current time:   ${new Date().toISOString()}\n`);

  async function tryUnpause() {
    const now = Math.floor(Date.now() / 1000);
    const remaining = unpauseAfter - now;

    if (remaining > 0) {
      const hours = Math.floor(remaining / 3600);
      const mins = Math.floor((remaining % 3600) / 60);
      console.log(`[${new Date().toISOString()}] Waiting... ${hours}h ${mins}m remaining`);
      return false;
    }

    console.log(`\n[${new Date().toISOString()}] 24h passed. Calling unpause()...`);
    try {
      const tx = await pm.unpause();
      console.log(`  TX Hash: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  Status: ${receipt.status === 1 ? 'SUCCESS ✅' : 'FAILED ❌'}`);

      // 验证
      const stillPaused = await pm.paused();
      console.log(`  Paused: ${stillPaused}`);

      if (!stillPaused) {
        console.log('\n✅ Contract successfully unpaused!');
        // 验证最终状态
        const platformWallet = await pm.platformWallet();
        const reserveWallet = await pm.reserveWallet();
        console.log(`  PlatformWallet: ${platformWallet}`);
        console.log(`  ReserveWallet:  ${reserveWallet}`);
        return true;
      }
    } catch (err) {
      console.error(`  ❌ Unpause failed: ${err.reason || err.message}`);
      if (err.message.includes('UNPAUSE_TOO_SOON')) {
        console.log('  Still too early, will retry...');
        return false;
      }
      throw err;
    }
    return false;
  }

  // 立即尝试一次
  const done = await tryUnpause();
  if (done) process.exit(0);

  // 定时检查
  const timer = setInterval(async () => {
    try {
      const done = await tryUnpause();
      if (done) {
        clearInterval(timer);
        process.exit(0);
      }
    } catch (err) {
      console.error('Fatal error:', err.message);
      clearInterval(timer);
      process.exit(1);
    }
  }, CHECK_INTERVAL_MS);

  console.log(`\nScheduler running. Will check every ${CHECK_INTERVAL_MS / 1000 / 60} minutes.\n`);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});

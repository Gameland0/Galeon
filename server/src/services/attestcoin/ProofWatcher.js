'use strict';

/**
 * ProofWatcher — 监听 Attestcoin SDK，等待 Sepolia tx 的证明就绪
 *
 * 工作流程：
 *   1. 收到 txHash（Sepolia 上的 commitSignal 或 recordExit）
 *   2. 轮询 ProofBuilder.getProof(txHash) 直到 success=true
 *   3. 返回完整 proof 供 CC3Recorder 使用
 *
 * Sepolia → Attestcoin 延迟约 7-10 分钟（~38个Sepolia块）
 */

const { JsonRpcProvider } = require('ethers');
const uscSdk = require('@gluwa/usc-sdk');

const CHAIN_KEY  = parseInt(process.env.CHAIN_KEY  || '1');   // 1 = Ethereum Sepolia
const PROOF_API  = process.env.PROOF_API || 'https://proof-gen-api.cc3-testnet.creditcoin.network';
const CC3_RPC    = process.env.CC3_TESTNET_RPC || 'https://rpc.cc3-testnet.creditcoin.network';

const POLL_INTERVAL_MS = 30_000;   // 每30秒轮询一次
const MAX_WAIT_MS      = 30 * 60 * 1000; // 最多等30分钟

class ProofWatcher {
  constructor() {
    this.cc3Provider   = null;
    this.proofBuilder  = null;
    this.chainInfoProvider = null;
  }

  initialize() {
    this.cc3Provider       = new JsonRpcProvider(CC3_RPC);
    this.proofBuilder      = new uscSdk.proofProvider.service.ProofBuilder(CHAIN_KEY, PROOF_API);
    this.chainInfoProvider = new uscSdk.chainInfo.PrecompileChainInfoProvider(this.cc3Provider);
    console.log(`[ProofWatcher] 初始化完成 | chainKey=${CHAIN_KEY} | API=${PROOF_API}`);
  }

  /**
   * 等待一个 Sepolia tx 的 Attestcoin 证明就绪
   * @param {string} txHash - Sepolia 上的交易 hash
   * @param {number} blockNumber - 该 tx 所在的 Sepolia 块高
   * @returns {Promise<object>} Attestcoin proof 对象
   */
  async waitForProof(txHash, blockNumber) {
    console.log(`[ProofWatcher] 开始等待证明 | tx=${txHash} | 块=${blockNumber}`);

    const startTime = Date.now();

    while (Date.now() - startTime < MAX_WAIT_MS) {
      try {
        // 先检查 CC3 已 attest 的最新 Sepolia 块高
        const latestAttested = await this.chainInfoProvider.getLatestAttestedHeightAndHash(CHAIN_KEY);
        const attestedHeight = Number(latestAttested?.height || 0);

        if (attestedHeight < blockNumber) {
          const waitBlocks = blockNumber - attestedHeight;
          const waitSecs   = Math.round(waitBlocks * 12); // Sepolia 12s/block
          console.log(`[ProofWatcher] 等待 attestation... 已 attest=${attestedHeight} 目标=${blockNumber} 还需约 ${waitSecs}s`);
          await this._sleep(POLL_INTERVAL_MS);
          continue;
        }

        // 块已被 attest，尝试获取 proof
        const result = await this.proofBuilder.getProof(txHash);

        if (result?.success && result?.data) {
          const proof = result.data;
          console.log(`[ProofWatcher] ✅ 证明获取成功 | cached=${proof.cached} | continuityRoots=${proof.continuityProof?.roots?.length}`);
          return proof;
        }

        if (result?.error) {
          console.log(`[ProofWatcher] API 错误: ${result.error}，继续重试...`);
        }

      } catch (e) {
        console.log(`[ProofWatcher] 轮询错误: ${e.message}，继续重试...`);
      }

      await this._sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`[ProofWatcher] 超时（${MAX_WAIT_MS / 60000}分钟）: tx=${txHash}`);
  }

  /**
   * 查询 CC3 当前已 attest 的 Sepolia 最新块高（调试用）
   */
  async getLatestAttestedHeight() {
    const info = await this.chainInfoProvider.getLatestAttestedHeightAndHash(CHAIN_KEY);
    return Number(info?.height || 0);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ProofWatcher;

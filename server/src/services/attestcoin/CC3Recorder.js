'use strict';

/**
 * CC3Recorder — 向 Creditcoin CC3 上的 GaleonASC 合约提交 Attestcoin 证明
 *
 * 两个操作:
 *   openPosition(proof, posData)  — 开仓：提交 SignalCommitted 证明
 *   closePosition(proof, signalId) — 平仓：提交 ExitRecorded 证明
 */

const { ethers } = require('ethers');

const ASC_ABI = [
  // 开仓：txBytes=原始proof bytes，eventData=ABI编码的事件数据，struct 参数
  'function openPosition(uint64 blockHeight, bytes txBytes, bytes eventData, tuple(bytes32 root, tuple(bytes32 hash, bool isLeft)[] siblings) merkleProof, tuple(bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) external',
  // 平仓
  'function closePosition(bytes32 signalId, uint64 blockHeight, bytes txBytes, bytes eventData, tuple(bytes32 root, tuple(bytes32 hash, bool isLeft)[] siblings) merkleProof, tuple(bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) external',
  // 押注
  'function placeBet(bytes32 signalId, int8 side) external payable',
  // 查询
  'function getPosition(bytes32 signalId) external view returns (tuple(bytes32 signalId, string symbol, int8 direction, uint8 confidence, uint256 entryPrice, bytes32 reasonsHash, uint256 openedAt, uint256 exitPrice, int256 pnlBps, string exitReason, uint256 closedAt, bool settled))',
  'function getAllPositions() external view returns (bytes32[])',
  'event PositionOpened(bytes32 indexed signalId, string symbol, int8 direction, uint8 confidence, uint256 entryPrice, uint256 openedAt)',
  'event PositionClosed(bytes32 indexed signalId, uint256 exitPrice, int256 pnlBps, string exitReason, uint256 closedAt)',
];

class CC3Recorder {
  constructor() {
    this.provider = null;
    this.wallet   = null;
    this.contract = null;
  }

  initialize() {
    const rpc     = process.env.CC3_TESTNET_RPC || 'https://rpc.cc3-testnet.creditcoin.network';
    const pk      = process.env.CC3_WALLET_PRIVATE_KEY;
    const address = process.env.GALEON_ASC_ADDRESS;

    if (!pk || !address) {
      throw new Error('[CC3Recorder] 缺少 CC3_WALLET_PRIVATE_KEY 或 GALEON_ASC_ADDRESS');
    }

    this.provider = new ethers.JsonRpcProvider(rpc);
    this.wallet   = new ethers.Wallet(pk, this.provider);
    this.contract = new ethers.Contract(address, ASC_ABI, this.wallet);

    console.log(`[CC3Recorder] 初始化完成 | ASC: ${address} | sender: ${this.wallet.address}`);
  }

  /**
   * 开仓：提交 SignalCommitted 证明到 CC3 ASC
   *
   * Hackathon 版简化：
   *   encodedTransaction = abi.encode(signalId, symbol, direction, confidence, entryPrice, reasonsHash)
   *   这样合约的 _decodeSignalCommitted 可以直接 abi.decode
   *
   * @param {object} proof  - ProofWatcher 返回的 Attestcoin proof
   * @param {object} posData - { signalId, symbol, direction, confidence, entryPrice, reasonsHash }
   */
  async openPosition(proof, posData) {
    console.log(`[CC3Recorder] openPosition | signalId=${posData.signalId}`);

    // 将事件数据 ABI 编码（对应 GaleonASC._decodeSignalCommitted）
    const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'string', 'int8', 'uint8', 'uint256', 'bytes32'],
      [
        posData.signalId,
        posData.symbol,
        posData.direction,
        posData.confidence,
        posData.entryPrice,
        posData.reasonsHash,
      ]
    );

    const { merkleProof, continuityProof, headerNumber } = proof;

    const tx = await this.contract.openPosition(
      headerNumber,
      proof.txBytes,
      encodedData,
      { root: merkleProof.root, siblings: merkleProof.siblings },
      { lowerEndpointDigest: continuityProof.lowerEndpointDigest, roots: continuityProof.roots },
      { gasLimit: 800_000 }
    );
    const receipt = await tx.wait(1);
    console.log(`[CC3Recorder] ✅ openPosition | tx=${receipt.hash} | 块=${receipt.blockNumber}`);
    return receipt.hash;
  }

  /**
   * 平仓：提交 ExitRecorded 证明到 CC3 ASC
   * @param {object} proof    - ProofWatcher 返回的 Attestcoin proof
   * @param {object} exitData - { signalId, exitPrice, exitReason, pnlBps }
   */
  async closePosition(proof, exitData) {
    console.log(`[CC3Recorder] closePosition | signalId=${exitData.signalId}`);

    const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint256', 'string', 'int256'],
      [
        exitData.signalId,
        exitData.exitPrice,
        exitData.exitReason,
        exitData.pnlBps,
      ]
    );

    const { merkleProof, continuityProof, headerNumber } = proof;

    const tx = await this.contract.closePosition(
      exitData.signalId,
      headerNumber,
      proof.txBytes,
      encodedData,
      { root: merkleProof.root, siblings: merkleProof.siblings },
      { lowerEndpointDigest: continuityProof.lowerEndpointDigest, roots: continuityProof.roots },
      { gasLimit: 1_000_000 }
    );
    const receipt = await tx.wait(1);
    console.log(`[CC3Recorder] ✅ closePosition | tx=${receipt.hash} | 块=${receipt.blockNumber}`);
    return receipt.hash;
  }

  /**
   * 查询 CC3 上的仓位信息（调试用）
   */
  async getPosition(signalId) {
    return this.contract.getPosition(signalId);
  }

  async getAllPositions() {
    return this.contract.getAllPositions();
  }
}

module.exports = CC3Recorder;

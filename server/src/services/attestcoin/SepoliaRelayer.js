'use strict';

/**
 * SepoliaRelayer — 负责调用 Sepolia 上的 GaleonTradeRecorder 合约
 * 开仓时: commitSignal()
 * 平仓时: recordExit()
 */

const { ethers } = require('ethers');

const ABI = [
  'function commitSignal(bytes32 signalId, string symbol, int8 direction, uint8 confidence, bytes32 reasonsHash) external',
  'function recordExit(bytes32 signalId, uint256 entryPrice, string exitReason) external',
  'function getCurrentPrice() external view returns (uint256)',
  'event SignalCommitted(bytes32 indexed signalId, string symbol, int8 direction, uint8 confidence, uint256 entryPrice, bytes32 reasonsHash, uint256 timestamp)',
  'event ExitRecorded(bytes32 indexed signalId, uint256 exitPrice, string exitReason, int256 pnlBps, uint256 timestamp)',
];

class SepoliaRelayer {
  constructor() {
    this.provider = null;
    this.wallet   = null;
    this.contract = null;
  }

  initialize() {
    const rpc     = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
    const pk      = process.env.SEPOLIA_WALLET_PRIVATE_KEY;
    const address = process.env.GALEON_RECORDER_ADDRESS;

    if (!pk || !address) {
      throw new Error('[SepoliaRelayer] 缺少 SEPOLIA_WALLET_PRIVATE_KEY 或 GALEON_RECORDER_ADDRESS');
    }

    this.provider = new ethers.JsonRpcProvider(rpc);
    this.wallet   = new ethers.Wallet(pk, this.provider);
    this.contract = new ethers.Contract(address, ABI, this.wallet);

    console.log(`[SepoliaRelayer] 初始化完成 | 合约: ${address} | relayer: ${this.wallet.address}`);
  }

  /**
   * 开仓：将 AI 信号承诺写到 Sepolia
   * @param {object} pos - PaperTradeService 的 pos 对象
   * @returns {{ txHash, signalId, blockNumber }}
   */
  async commitSignal(pos) {
    const signalId    = this._makeSignalId(pos);
    const direction   = pos.direction === 'LONG' ? 1 : -1;
    const confidence  = Math.min(100, Math.max(0, Math.round(pos.confidence || 0)));
    const reasonsHash = this._hashReasons(pos);

    console.log(`[SepoliaRelayer] commitSignal | ${pos.symbol} ${pos.direction} conf=${confidence} signalId=${signalId}`);

    const tx = await this.contract.commitSignal(
      signalId,
      pos.symbol.replace('USDT', '').replace('USD', ''),  // "ETHUSDT" → "ETH"
      direction,
      confidence,
      reasonsHash,
      { gasLimit: 200_000 }
    );
    const receipt = await tx.wait(1);

    console.log(`[SepoliaRelayer] ✅ commitSignal tx: ${receipt.hash} | 块: ${receipt.blockNumber}`);
    return { txHash: receipt.hash, signalId, blockNumber: receipt.blockNumber };
  }

  /**
   * 平仓：将出场事件写到 Sepolia
   * @param {object} trade - PaperTradeService 的 trade/pos 对象（平仓后的）
   * @param {string} signalId - 对应开仓时的 signalId
   * @returns {{ txHash, blockNumber }}
   */
  async recordExit(trade, signalId) {
    // entry_price 从 trade 对象获取（6位小数 → 需转换成合约期望格式）
    // Uniswap 价格是 USDC 6位小数，entry_price 是 USD float
    const entryPrice = Math.round((parseFloat(trade.entry_price) || 0) * 1e6);
    const exitReason = trade.exit_type || trade.exit_reason || 'CLOSED';

    console.log(`[SepoliaRelayer] recordExit | signalId=${signalId} entryPrice=${entryPrice} reason=${exitReason}`);

    const tx = await this.contract.recordExit(
      signalId,
      entryPrice,
      exitReason,
      { gasLimit: 200_000 }
    );
    const receipt = await tx.wait(1);

    console.log(`[SepoliaRelayer] ✅ recordExit tx: ${receipt.hash} | 块: ${receipt.blockNumber}`);
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  /**
   * 查询当前 Uniswap 价格（供调试用）
   */
  async getCurrentPrice() {
    const price = await this.contract.getCurrentPrice();
    return Number(price) / 1e6;
  }

  // ── 内部工具 ────────────────────────────────────────────────

  /**
   * 生成 signalId：keccak256(posId + timestamp)
   * 保证唯一且可从 pos 重建
   */
  _makeSignalId(pos) {
    const raw = ethers.solidityPacked(
      ['string', 'uint256'],
      [pos.id || pos.symbol, Math.floor(new Date(pos.entered_at || Date.now()).getTime() / 1000)]
    );
    return ethers.keccak256(raw);
  }

  /**
   * 将 AI 分析原因 hash 化（原因明文存 off-chain，合约只存 hash）
   */
  _hashReasons(pos) {
    const reasons = pos.entry_reason || pos.reasons || '';
    const encoded = ethers.toUtf8Bytes(typeof reasons === 'string' ? reasons : JSON.stringify(reasons));
    return ethers.keccak256(encoded);
  }
}

module.exports = SepoliaRelayer;

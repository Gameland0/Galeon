'use strict';

/**
 * AttestcoinBridge — Galeon × Attestcoin 黑客松集成主入口
 *
 * 通过 global.__attestcoinBridge 挂载，由 PaperTradeService 调用:
 *   onPTOpen(pos)    — 开仓时触发，异步非阻塞
 *   onPTClose(trade) — 平仓时触发，异步非阻塞
 *
 * 完整流程:
 *   开仓: AI信号 → Sepolia commitSignal() → Attestcoin证明(~7min) → CC3 openPosition()
 *   平仓: AI出场 → Sepolia recordExit()   → Attestcoin证明(~7min) → CC3 closePosition()
 */

const SepoliaRelayer = require('./SepoliaRelayer');
const ProofWatcher   = require('./ProofWatcher');
const CC3Recorder    = require('./CC3Recorder');

class AttestcoinBridge {
  constructor() {
    this.relayer  = new SepoliaRelayer();
    this.watcher  = new ProofWatcher();
    this.recorder = new CC3Recorder();

    // signalId Map: posId → signalId（开仓时记录，平仓时查找）
    this._posToSignal = new Map();  // posId → signalId
    this._signalData  = new Map();  // signalId → { entryPrice, reasonsHash, ... }
    this._txRecords   = new Map();  // signalId → { sepoliaTx, cc3OpenTx, sepoliaExitTx, cc3CloseTx, sepoliaCommitAt, cc3OpenAt, sepoliaExitAt, cc3CloseAt, proofArriveAt }

    this._started = false;
  }

  start() {
    this.relayer.initialize();
    this.watcher.initialize();
    this.recorder.initialize();
    this._started = true;
    console.log('[AttestcoinBridge] ✅ 启动完成');
  }

  /**
   * 开仓 hook — 由 PaperTradeService._openPosition 调用
   * 完全异步，不阻塞 PT 正常逻辑
   */
  onPTOpen(pos) {
    if (!this._started) return;
    this._handleOpen(pos).catch(e =>
      console.error(`[AttestcoinBridge] onPTOpen 错误 (non-critical): ${e.message}`)
    );
  }

  /**
   * 平仓 hook — 由 PaperTradeService._exitPosition 调用
   * 完全异步，不阻塞 PT 正常逻辑
   */
  async onPTClose(trade) {
    if (!this._started) return;
    this._handleClose(trade).catch(e =>
      console.error(`[AttestcoinBridge] onPTClose 错误 (non-critical): ${e.message}`)
    );
  }

  // ── 内部：完整开仓流程 ──────────────────────────────────────
  async _handleOpen(pos) {
    const label = `${pos.symbol} ${pos.direction}`;
    console.log(`[AttestcoinBridge] 开始开仓流程 | ${label} | posId=${pos.id}`);

    // Step 1: 写 Sepolia 合约
    let sepoliaResult;
    try {
      sepoliaResult = await this.relayer.commitSignal(pos);
    } catch (e) {
      console.error(`[AttestcoinBridge] Sepolia commitSignal 失败: ${e.message}`);
      return;
    }

    const { txHash, signalId, blockNumber } = sepoliaResult;

    // 记录 posId → signalId 映射
    this._posToSignal.set(String(pos.id), signalId);
    this._txRecords.set(signalId, { sepoliaTx: txHash, sepoliaCommitAt: Math.floor(Date.now() / 1000) });
    this._signalData.set(signalId, {
      symbol:       pos.symbol.replace('USDT', '').replace('USD', ''),
      direction:    pos.direction === 'LONG' ? 1 : -1,
      confidence:   Math.min(100, Math.round(pos.confidence || 0)),
      reasonsHash:  this.relayer._hashReasons(pos),
      ptEntryPrice: parseFloat(pos.entry_price || 0),   // PT 实际价格（USD）
    });

    console.log(`[AttestcoinBridge] Sepolia tx 已提交 | txHash=${txHash} 等待 Attestcoin 证明...`);

    // Step 2: 等待 Attestcoin 证明（异步，约7分钟）
    let proof;
    try {
      proof = await this.watcher.waitForProof(txHash, blockNumber);
    } catch (e) {
      console.error(`[AttestcoinBridge] 等待证明超时: ${e.message}`);
      return;
    }

    // Step 3: 从 Sepolia 事件解析 entryPrice（合约 event 里有）
    const entryPrice = proof.entryPrice || await this._getEntryPriceFromLog(txHash);
    const sigData = this._signalData.get(signalId);

    // Step 4: 提交到 CC3 ASC
    try {
      const cc3OpenTx = await this.recorder.openPosition(proof, {
        signalId,
        symbol:      sigData.symbol,
        direction:   sigData.direction,
        confidence:  sigData.confidence,
        entryPrice:  entryPrice || Math.round(parseFloat(pos.entry_price || 0) * 1e6),
        reasonsHash: sigData.reasonsHash,
      });
      // 保存 entryPrice 供平仓用（cents 单位，与 ptEntryPrice 保持一致）
      sigData.entryPrice = Math.round(parseFloat(pos.entry_price || 0) * 100);
      const rec = this._txRecords.get(signalId) || {};
      rec.cc3OpenTx = cc3OpenTx;
      rec.proofArriveAt = Math.floor(Date.now() / 1000);
      rec.cc3OpenAt = Math.floor(Date.now() / 1000);
      this._txRecords.set(signalId, rec);
      console.log(`[AttestcoinBridge] ✅ 开仓完成 | ${label} | signalId=${signalId}`);
    } catch (e) {
      console.error(`[AttestcoinBridge] CC3 openPosition 失败: ${e.message}`);
    }
  }

  // ── 内部：完整平仓流程 ──────────────────────────────────────
  async _handleClose(trade) {
    const posId    = String(trade.position_id || trade.id);
    const signalId = this._posToSignal.get(posId);

    if (!signalId) {
      // 这笔仓位不是在 AttestcoinBridge 启动后开的，忽略
      return;
    }

    const sigData  = this._signalData.get(signalId) || {};
    const label    = `${trade.symbol} ${trade.direction}`;
    const exitType = trade.exit_type || 'CLOSED';

    console.log(`[AttestcoinBridge] 开始平仓流程 | ${label} | signalId=${signalId} reason=${exitType}`);

    // Step 1: 写 Sepolia 合约
    let sepoliaResult;
    try {
      sepoliaResult = await this.relayer.recordExit(trade, signalId);
    } catch (e) {
      console.error(`[AttestcoinBridge] Sepolia recordExit 失败: ${e.message}`);
      return;
    }

    const rec = this._txRecords.get(signalId) || {};
    rec.sepoliaExitTx = sepoliaResult.txHash;
    rec.sepoliaExitAt = Math.floor(Date.now() / 1000);
    this._txRecords.set(signalId, rec);
    console.log(`[AttestcoinBridge] Sepolia recordExit tx=${sepoliaResult.txHash} 等待证明...`);

    // Step 2: 等待证明
    let proof;
    try {
      proof = await this.watcher.waitForProof(sepoliaResult.txHash, sepoliaResult.blockNumber);
    } catch (e) {
      console.error(`[AttestcoinBridge] 平仓证明超时: ${e.message}`);
      return;
    }

    // Step 3: 计算 P&L
    // 统一使用 PT 自身价格数据（cents 单位，×100），避免与 Uniswap testnet ETH 价格混用
    const ptEntry = parseFloat(trade.entry_price || sigData.ptEntryPrice || 0);
    const ptExit  = parseFloat(trade.exit_price || 0);
    // on-chain 存 cents（2位小数），保持一致性
    const entryPrice = sigData.entryPrice || Math.round(ptEntry * 100);
    const exitPrice  = Math.round(ptExit * 100);
    // pnlBps 优先用 PT 已计算好的 profit_loss_percent，fallback 自算
    const pnlBps = trade.profit_loss_percent != null
      ? Math.round(parseFloat(trade.profit_loss_percent) * 100)
      : entryPrice > 0 ? Math.round((exitPrice - entryPrice) * 10000 / entryPrice) : 0;

    // Step 4: 提交 CC3
    try {
      const cc3CloseTx = await this.recorder.closePosition(proof, {
        signalId,
        exitPrice,
        exitReason: exitType,
        pnlBps,
      });

      const closeRec = this._txRecords.get(signalId) || {};
      closeRec.cc3CloseTx = cc3CloseTx;
      closeRec.cc3CloseAt = Math.floor(Date.now() / 1000);
      this._txRecords.set(signalId, closeRec);

      // 清理 posId/signalData Map，但保留 txRecords 供查询
      this._posToSignal.delete(posId);
      this._signalData.delete(signalId);

      console.log(`[AttestcoinBridge] ✅ 平仓完成 | ${label} | pnlBps=${pnlBps} (${(pnlBps / 100).toFixed(2)}%)`);
    } catch (e) {
      console.error(`[AttestcoinBridge] CC3 closePosition 失败: ${e.message}`);
    }
  }

  // ── 内部：从 Sepolia 事件 log 解析 entryPrice ──────────────
  async _getEntryPriceFromLog(txHash) {
    try {
      const iface = new (require('ethers').Interface)([
        'event SignalCommitted(bytes32 indexed signalId, string symbol, int8 direction, uint8 confidence, uint256 entryPrice, bytes32 reasonsHash, uint256 timestamp)'
      ]);
      const receipt = await this.relayer.provider.getTransactionReceipt(txHash);
      for (const log of receipt?.logs || []) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'SignalCommitted') {
            return Number(parsed.args.entryPrice);
          }
        } catch {}
      }
    } catch (e) {}
    return 0;
  }

  // ── 状态查询（调试用）──────────────────────────────────────
  getStatus() {
    return {
      started:        this._started,
      pendingSignals: this._posToSignal.size,
      signalMap:      Object.fromEntries(this._posToSignal),
    };
  }

  // ── 获取 tx 记录（供 API 使用）─────────────────────────────
  getTxRecords() {
    return Object.fromEntries(this._txRecords);
  }

  getTxRecord(signalId) {
    return this._txRecords.get(signalId) || null;
  }
}

module.exports = { AttestcoinBridge };

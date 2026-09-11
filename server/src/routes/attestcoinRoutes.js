// === [HACKATHON-ATTESTCOIN] 比赛后删除整个文件 ===
const express = require('express');
const { ethers } = require('ethers');
const router = express.Router();

const CC3_RPC = process.env.CC3_TESTNET_RPC || 'https://rpc.cc3-testnet.creditcoin.network';
const ASC_ADDR = process.env.GALEON_ASC_ADDRESS || '0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39';
const RECORDER_ADDR = process.env.GALEON_RECORDER_ADDRESS || '0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';

const ASC_ABI = [
  'function getPosition(bytes32 signalId) external view returns (tuple(bytes32 signalId, string symbol, int8 direction, uint8 confidence, uint256 entryPrice, bytes32 reasonsHash, uint256 openedAt, uint256 exitPrice, int256 pnlBps, string exitReason, uint256 closedAt, bool settled))',
  'function getAllPositions() external view returns (bytes32[])',
  'function getBetInfo(bytes32 signalId) external view returns (uint256 longPool, uint256 shortPool, uint256 myLongBet, uint256 myShortBet)',
];

const RECORDER_ABI = [
  'function getCurrentPrice() external view returns (uint256)',
];

let cc3Provider = null;
let sepoliaProvider = null;
let asc = null;
let recorder = null;

function getContracts() {
  if (!cc3Provider) {
    cc3Provider = new ethers.JsonRpcProvider(CC3_RPC);
    asc = new ethers.Contract(ASC_ADDR, ASC_ABI, cc3Provider);
  }
  if (!sepoliaProvider) {
    sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    recorder = new ethers.Contract(RECORDER_ADDR, RECORDER_ABI, sepoliaProvider);
  }
  return { asc, recorder };
}

// GET /api/attestcoin/positions — 获取所有链上仓位
router.get('/positions', async (req, res) => {
  try {
    const { asc } = getContracts();
    const signalIds = await asc.getAllPositions();
    const bridge = global.__attestcoinBridge;
    const txRecords = bridge ? bridge.getTxRecords() : {};

    const positions = await Promise.all(
      signalIds.map(async (id) => {
        try {
          const p = await asc.getPosition(id);
          const txRec = txRecords[p.signalId] || {};
          return {
            signalId: p.signalId,
            symbol: p.symbol,
            direction: Number(p.direction),
            confidence: Number(p.confidence),
            entryPrice: p.entryPrice.toString(),
            reasonsHash: p.reasonsHash,
            openedAt: Number(p.openedAt),
            exitPrice: p.exitPrice.toString(),
            pnlBps: Number(p.pnlBps),
            exitReason: p.exitReason,
            closedAt: Number(p.closedAt),
            settled: p.settled,
            // 链上 tx hash + 时间戳
            sepoliaTx: txRec.sepoliaTx || null,
            cc3OpenTx: txRec.cc3OpenTx || null,
            sepoliaExitTx: txRec.sepoliaExitTx || null,
            cc3CloseTx: txRec.cc3CloseTx || null,
            sepoliaCommitAt: txRec.sepoliaCommitAt || null,
            proofArriveAt: txRec.proofArriveAt || null,
            cc3OpenAt: txRec.cc3OpenAt || null,
            sepoliaExitAt: txRec.sepoliaExitAt || null,
            cc3CloseAt: txRec.cc3CloseAt || null,
          };
        } catch (e) {
          return { signalId: id, error: e.message };
        }
      })
    );

    res.json({ success: true, positions, count: positions.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/attestcoin/price — Sepolia Uniswap 当前价格
router.get('/price', async (req, res) => {
  try {
    const { recorder } = getContracts();
    const price = await recorder.getCurrentPrice();
    res.json({ success: true, price: price.toString() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/attestcoin/stats — 统计
router.get('/stats', async (req, res) => {
  try {
    const { asc } = getContracts();
    const signalIds = await asc.getAllPositions();
    let open = 0, closed = 0, totalPnl = 0, wins = 0;

    for (const id of signalIds) {
      try {
        const p = await asc.getPosition(id);
        if (Number(p.closedAt) > 0) {
          closed++;
          const pnl = Number(p.pnlBps);
          totalPnl += pnl;
          if (pnl > 0) wins++;
        } else {
          open++;
        }
      } catch {}
    }

    // 每个仓位产生的链上 tx 数：
    //   开仓: Sepolia commitSignal + CC3 openPosition = 2
    //   平仓: Sepolia recordExit  + CC3 closePosition = 2
    const txPerOpen   = 2;
    const txPerClose  = 2;
    const totalTxCount = signalIds.length * txPerOpen + closed * txPerClose;
    // PT 平均每天开仓约 20 次 → 主网每天贡献 tx 数
    const ptDailySignals = 20;
    const projectedDailyTx = ptDailySignals * (txPerOpen + txPerClose);

    res.json({
      success: true,
      stats: {
        total: signalIds.length,
        open,
        closed,
        winRate: closed > 0 ? ((wins / closed) * 100).toFixed(1) : '0',
        avgPnlBps: closed > 0 ? (totalPnl / closed).toFixed(1) : '0',
        totalTxCount,
        projectedDailyTx,
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/attestcoin/bridge-status — Bridge 状态
router.get('/bridge-status', async (req, res) => {
  try {
    const bridge = global.__attestcoinBridge;
    if (!bridge) {
      return res.json({ success: true, enabled: false, status: 'disabled' });
    }
    res.json({
      success: true,
      enabled: true,
      status: 'running',
      pendingProofs: bridge._posToSignal ? bridge._posToSignal.size : 0,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

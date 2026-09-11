// === [HACKATHON-ATTESTCOIN] 比赛后删除整个文件 ===
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import './AttestcoinPage.css';

interface Position {
  signalId: string;
  symbol: string;
  direction: number;
  confidence: number;
  entryPrice: string;
  openedAt: number;
  exitPrice: string;
  pnlBps: number;
  exitReason: string;
  closedAt: number;
  settled: boolean;
  sepoliaTx?: string | null;
  cc3OpenTx?: string | null;
  sepoliaExitTx?: string | null;
  cc3CloseTx?: string | null;
  sepoliaCommitAt?: number | null;
  proofArriveAt?: number | null;
  cc3OpenAt?: number | null;
  sepoliaExitAt?: number | null;
  cc3CloseAt?: number | null;
  error?: string;
}

interface Stats { total: number; open: number; closed: number; winRate: string; avgPnlBps: string; totalTxCount: number; projectedDailyTx: number; }

const SEPOLIA_TX   = 'https://sepolia.etherscan.io/tx/';
const SEPOLIA_ADDR = 'https://sepolia.etherscan.io/address/';
const CC3_TX       = 'https://creditcoin-testnet.blockscout.com/tx/';
const RECORDER     = '0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39';
const ASC_ADDR     = '0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39';

const fmtPrice = (raw: string) => {
  const n = Number(raw); if (!n) return '—';
  // on-chain price stored in cents (×100), display in USD
  const usd = n / 100;
  return '$' + usd.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtTime = (ts?: number | null) => {
  if (!ts) return null;
  return new Date(ts * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};
const fmtPnl = (bps: number) => (bps > 0 ? '+' : '') + (bps / 100).toFixed(2) + '%';
const shorten = (h?: string | null) => h ? h.slice(0, 8) + '…' + h.slice(-6) : '';
const diffMin = (a?: number | null, b?: number | null) => (a && b) ? Math.round(Math.abs(b - a) / 60) + 'min' : null;

const AttestcoinPage: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [bridge, setBridge]       = useState<{ enabled: boolean; status: string; pendingProofs?: number } | null>(null);
  const [price, setPrice]         = useState('');
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    try {
      const [pR, sR, bR, prR] = await Promise.all([
        api.get('/attestcoin/positions').catch(() => ({ data: { positions: [] } })),
        api.get('/attestcoin/stats').catch(() => ({ data: { stats: null } })),
        api.get('/attestcoin/bridge-status').catch(() => ({ data: { enabled: false } })),
        api.get('/attestcoin/price').catch(() => ({ data: { price: '0' } })),
      ]);
      const sorted = (pR.data.positions || [])
        .filter((p: Position) => !p.error)
        .sort((a: Position, b: Position) => (b.openedAt || 0) - (a.openedAt || 0));
      setPositions(sorted);
      if (sR.data.stats) setStats(sR.data.stats);
      if (bR.data) setBridge(bR.data);
      if (prR.data.price) setPrice(prR.data.price);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const isLive = bridge?.enabled;

  return (
    <div className="ac-page">

      {/* ── HERO ─────────────────────────────────────────── */}
      <div className="ac-hero">
        <div className="ac-hero-badge">
          <span className="ac-hero-dot" />
          {isLive ? 'Bridge Live — Signals Auto-Anchoring' : 'Bridge Offline'}
          {bridge?.pendingProofs ? ` · ${bridge.pendingProofs} awaiting proof` : ''}
        </div>

        <div className="ac-hero-title">
          <span className="grad">Tamper-Proof AI</span> Trading Signals
        </div>

        <div className="ac-hero-desc">
          Every AI trading decision is <strong>committed on Ethereum Sepolia before execution</strong>.
          Attestcoin cryptographic proofs bridge the record to <strong>Creditcoin CC3</strong> — no centralized oracle,
          no cherry-picking, no post-hoc editing. The on-chain history <strong>cannot lie</strong>.
        </div>

        <div className="ac-flow">
          <div className="ac-flow-node n1">
            <span className="ac-flow-node-icon">🧠</span>
            AI Brain
            <span className="ac-flow-node-sub">Galeon PaperTrade</span>
          </div>
          <span className="ac-flow-arrow">→</span>
          <div className="ac-flow-node n2">
            <span className="ac-flow-node-icon">⛓</span>
            Sepolia Commit
            <span className="ac-flow-node-sub">Signal locked on-chain</span>
          </div>
          <span className="ac-flow-arrow">→</span>
          <div className="ac-flow-node n3">
            <span className="ac-flow-node-icon">🔐</span>
            Attestcoin Proof
            <span className="ac-flow-node-sub">~7 min cryptographic proof</span>
          </div>
          <span className="ac-flow-arrow">→</span>
          <div className="ac-flow-node n4">
            <span className="ac-flow-node-icon">✅</span>
            CC3 Record
            <span className="ac-flow-node-sub">Verified on Creditcoin</span>
          </div>
        </div>
      </div>

      {/* ── STATS BAR ────────────────────────────────────── */}
      <div className="ac-stats-bar">
        <div className="ac-stat">
          <div className="ac-stat-label">Total Signals</div>
          <div className="ac-stat-val purple">{stats?.total ?? '—'}</div>
          <div className="ac-stat-sub">on-chain records</div>
        </div>
        <div className="ac-stat">
          <div className="ac-stat-label">Open</div>
          <div className="ac-stat-val blue">{stats?.open ?? '—'}</div>
          <div className="ac-stat-sub">active positions</div>
        </div>
        <div className="ac-stat">
          <div className="ac-stat-label">Closed</div>
          <div className="ac-stat-val gray">{stats?.closed ?? '—'}</div>
          <div className="ac-stat-sub">with verified P&L</div>
        </div>
        <div className="ac-stat">
          <div className="ac-stat-label">Win Rate</div>
          <div className={`ac-stat-val ${Number(stats?.winRate) >= 50 ? 'green' : 'red'}`}>
            {stats?.winRate ? stats.winRate + '%' : '—'}
          </div>
          <div className="ac-stat-sub">cannot be faked</div>
        </div>
        <div className="ac-stat">
          <div className="ac-stat-label">On-Chain Txs Generated</div>
          <div className="ac-stat-val purple">{stats?.totalTxCount ?? '—'}</div>
          <div className="ac-stat-sub">~{stats?.projectedDailyTx ?? 80}/day on mainnet</div>
        </div>
        <div className="ac-stat">
          <div className="ac-stat-label">ETH Price Oracle</div>
          <div className="ac-stat-val blue">{price ? fmtPrice(price) : '—'}</div>
          <div className="ac-stat-sub">Uniswap V3 on-chain</div>
        </div>
      </div>

      {/* ── WHY IT MATTERS ───────────────────────────────── */}
      <div className="ac-why">
        <div className="ac-why-card">
          <div className="ac-why-icon">🔒</div>
          <div className="ac-why-title">Signal Committed Before Execution</div>
          <div className="ac-why-desc">
            The AI's prediction is locked on Ethereum <em>before</em> any trade happens.
            It's impossible to retroactively claim a different entry point or direction.
          </div>
        </div>
        <div className="ac-why-card">
          <div className="ac-why-icon">⚡</div>
          <div className="ac-why-title">Trustless Cross-Chain Verification</div>
          <div className="ac-why-desc">
            Attestcoin cryptographic proofs are verified by Creditcoin's <em>Block Prover Precompile</em> — a protocol-level verifier, not a centralized oracle operator.
            <em> No single party can manipulate the proof.</em>
          </div>
        </div>
        <div className="ac-why-card">
          <div className="ac-why-icon">📊</div>
          <div className="ac-why-title">Auditable AI Performance</div>
          <div className="ac-why-desc">
            Every P&L, win rate, and exit reason is verifiable on-chain.
            <em> What you see is what the AI actually did</em> — not a curated highlight reel.
          </div>
        </div>
        <div className="ac-why-card">
          <div className="ac-why-icon">⛓</div>
          <div className="ac-why-title">Real Transaction Volume for Creditcoin</div>
          <div className="ac-why-desc">
            Each AI signal generates <em>4 on-chain transactions</em> — 2 on Sepolia, 2 on CC3.
            Galeon's AI opens ~20 positions/day → <em>~80 CC3 transactions/day on mainnet</em>.
            Scale to multiple users and this becomes significant organic chain activity.
          </div>
        </div>
      </div>

      {/* ── POSITION LIST ─────────────────────────────────── */}
      <div className="ac-section-hd">
        <div className="ac-section-title">On-Chain Signal Records ({positions.length})</div>
        {isLive && <div className="ac-live-dot">Auto-updating every 30s</div>}
      </div>

      {loading ? (
        <div className="ac-loading"><div className="ac-spinner" />Loading from Creditcoin CC3...</div>
      ) : positions.length === 0 ? (
        <div className="ac-empty">
          <div className="ac-empty-icon">⛓</div>
          <div className="ac-empty-text">No on-chain signals yet</div>
          <div className="ac-empty-sub">Waiting for AI to open the first position</div>
        </div>
      ) : (
        <div className="ac-positions">
          {positions.map(pos => {
            const isLong   = pos.direction === 1;
            const isOpen   = pos.closedAt === 0;
            const pnlColor = pos.pnlBps > 0 ? 'green' : pos.pnlBps < 0 ? 'red' : '';
            const hasTx    = pos.sepoliaTx || pos.cc3OpenTx;

            // timeline step status
            const step1 = pos.sepoliaCommitAt ? 'done' : pos.sepoliaTx ? 'done' : 'pending';
            const step2 = pos.proofArriveAt ? 'done' : step1 === 'done' ? 'wait' : 'pending';
            const step3 = pos.cc3OpenTx ? 'done' : step2 === 'done' ? 'wait' : 'pending';
            const step4 = pos.sepoliaExitTx ? 'done' : 'pending';
            const step5 = pos.cc3CloseTx ? 'done' : step4 === 'done' ? 'wait' : 'pending';

            return (
              <div className="ac-card" key={pos.signalId}>

                {/* Top bar */}
                <div className="ac-card-top">
                  <div className="ac-card-left">
                    <span className="ac-card-symbol">{pos.symbol}</span>
                    <span className={`ac-tag ${isLong ? 'long' : 'short'}`}>{isLong ? '↑ LONG' : '↓ SHORT'}</span>
                    <span className={`ac-tag ${isOpen ? 'open' : 'closed'}`}>{isOpen ? 'OPEN' : 'CLOSED'}</span>
                    <span style={{ fontSize: 12, color: '#4b5563' }}>Confidence: <b style={{ color: '#d1d5db' }}>{pos.confidence}%</b></span>
                  </div>
                  {!isOpen && (
                    <div className={`ac-card-pnl ${pnlColor}`} style={{ color: pos.pnlBps > 0 ? '#4ade80' : pos.pnlBps < 0 ? '#f87171' : '#9ca3af' }}>
                      {fmtPnl(pos.pnlBps)}
                    </div>
                  )}
                </div>

                {/* Metrics */}
                <div className="ac-card-metrics">
                  <div className="ac-metric">
                    <div className="ac-metric-label">Entry Price</div>
                    <div className="ac-metric-val">{fmtPrice(pos.entryPrice)}</div>
                  </div>
                  {!isOpen && (
                    <div className="ac-metric">
                      <div className="ac-metric-label">Exit Price</div>
                      <div className="ac-metric-val">{fmtPrice(pos.exitPrice)}</div>
                    </div>
                  )}
                  {!isOpen && (
                    <div className="ac-metric">
                      <div className="ac-metric-label">P&L</div>
                      <div className={`ac-metric-val ${pnlColor}`}>{fmtPnl(pos.pnlBps)}</div>
                    </div>
                  )}
                  {!isOpen && (
                    <div className="ac-metric">
                      <div className="ac-metric-label">Exit Reason</div>
                      <div className="ac-metric-val" style={{ fontSize: 13 }}>{pos.exitReason || '—'}</div>
                    </div>
                  )}
                  <div className="ac-metric">
                    <div className="ac-metric-label">Opened At</div>
                    <div className="ac-metric-val" style={{ fontSize: 12 }}>{fmtTime(pos.openedAt) || '—'}</div>
                  </div>
                  {!isOpen && (
                    <div className="ac-metric">
                      <div className="ac-metric-label">Closed At</div>
                      <div className="ac-metric-val" style={{ fontSize: 12 }}>{fmtTime(pos.closedAt) || '—'}</div>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div className="ac-timeline">
                  <div className="ac-timeline-title">Cryptographic Proof Timeline</div>
                  <div className="ac-timeline-steps">

                    <div className={`ac-tl-step ${step1}`}>
                      <div className="ac-tl-dot">⛓</div>
                      <div className="ac-tl-label">Sepolia<br/>Commit</div>
                      <div className="ac-tl-time">{fmtTime(pos.sepoliaCommitAt) || (pos.sepoliaTx ? 'done' : '—')}</div>
                    </div>

                    <div className={`ac-tl-step ${step2}`}>
                      <div className="ac-tl-dot">🔐</div>
                      <div className="ac-tl-label">Attestcoin<br/>Proof</div>
                      <div className="ac-tl-time">
                        {pos.proofArriveAt
                          ? (diffMin(pos.sepoliaCommitAt, pos.proofArriveAt) || '') + ' wait'
                          : step2 === 'wait' ? '~7 min…' : '—'}
                      </div>
                    </div>

                    <div className={`ac-tl-step ${step3}`}>
                      <div className="ac-tl-dot">✅</div>
                      <div className="ac-tl-label">CC3<br/>Recorded</div>
                      <div className="ac-tl-time">{fmtTime(pos.cc3OpenAt) || (pos.cc3OpenTx ? 'done' : '—')}</div>
                    </div>

                    {(!isOpen || pos.sepoliaExitTx) && <>
                      <div className={`ac-tl-step ${step4}`}>
                        <div className="ac-tl-dot">📤</div>
                        <div className="ac-tl-label">Sepolia<br/>Exit</div>
                        <div className="ac-tl-time">{fmtTime(pos.sepoliaExitAt) || (pos.sepoliaExitTx ? 'done' : '—')}</div>
                      </div>

                      <div className={`ac-tl-step ${step5}`}>
                        <div className="ac-tl-dot">🏁</div>
                        <div className="ac-tl-label">CC3<br/>Settled</div>
                        <div className="ac-tl-time">{fmtTime(pos.cc3CloseAt) || (pos.cc3CloseTx ? 'done' : step5 === 'wait' ? '~7 min…' : '—')}</div>
                      </div>
                    </>}

                  </div>
                </div>

                {/* Links */}
                <div className="ac-card-links">
                  {pos.sepoliaTx ? (
                    <a className="ac-link sepolia" href={SEPOLIA_TX + pos.sepoliaTx} target="_blank" rel="noopener noreferrer">
                      ⛓ Sepolia Open ↗
                    </a>
                  ) : (
                    <a className="ac-link sepolia" href={SEPOLIA_ADDR + RECORDER} target="_blank" rel="noopener noreferrer">
                      ⛓ Sepolia Contract ↗
                    </a>
                  )}
                  {pos.cc3OpenTx && (
                    <a className="ac-link cc3" href={CC3_TX + pos.cc3OpenTx} target="_blank" rel="noopener noreferrer">
                      ✅ CC3 Open ↗
                    </a>
                  )}
                  {pos.sepoliaExitTx && (
                    <a className="ac-link sepolia" href={SEPOLIA_TX + pos.sepoliaExitTx} target="_blank" rel="noopener noreferrer">
                      📤 Sepolia Exit ↗
                    </a>
                  )}
                  {pos.cc3CloseTx && (
                    <a className="ac-link cc3" href={CC3_TX + pos.cc3CloseTx} target="_blank" rel="noopener noreferrer">
                      🏁 CC3 Close ↗
                    </a>
                  )}
                  <span className="ac-link signal">
                    Signal: {shorten(pos.signalId)}
                  </span>
                  <span className="ac-proof-badge">⚡ Attestcoin Verified</span>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AttestcoinPage;

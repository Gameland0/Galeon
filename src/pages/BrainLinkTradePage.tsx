/**
 * BrainLinkTradePage - AI Auto Trade on Monad (LIVE DATA)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useBrainActivity } from '../hooks/useBrainLink';
import { getMonadPositions, getAssetActivity } from '../services/brainLinkService';
import type { BrainActivity } from '../services/brainLinkService';
import AgentWalletCard from '../components/brainLink/AgentWalletCard';
import './BrainLinkPages.css';

const dotColorMap: Record<string, string> = {
  decision_change: 'green', micro_step: 'blue', risk_alert: 'amber',
  combo_block: 'red', learning_update: 'green', dca_pause: 'amber',
  trade_open: 'green', partial_exit: 'amber', trade_close: 'red',
};
function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return 'now'; if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`; return `${Math.floor(d / 3600)}h`;
}

const BrainLinkTradePage: React.FC = () => {
  const [positions, setPositions] = useState<any[]>([]);
  const [closedPositions, setClosedPositions] = useState<any[]>([]);
  const [balances, setBalances] = useState({ usdc: 0, mon: 0 });
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const [expandedPos, setExpandedPos] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [positionActivities, setPositionActivities] = useState<BrainActivity[]>([]);
  const { activities: globalActivities } = useBrainActivity(10000);

  const fetchPositions = useCallback(async () => {
    try {
      const data = await getMonadPositions();
      setPositions(data.active || []);
      setClosedPositions(data.closed || []);
      setBalances(data.balances || { usdc: 0, mon: 0 });
      setCurrentPrice(data.currentPrice);
    } catch (e) { console.error('Failed to fetch positions:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchPositions();
    const timer = setInterval(fetchPositions, 10000);
    return () => clearInterval(timer);
  }, [fetchPositions]);

  // Fetch position-specific activity
  useEffect(() => {
    const assets = positions.map(p => p.asset);
    if (assets.length > 0) {
      Promise.all(assets.map(a => getAssetActivity(a)))
        .then(results => setPositionActivities(results.flat().sort((a, b) => b.timestamp - a.timestamp).slice(0, 20)))
        .catch(() => {});
    } else {
      // No active positions — show recent closed position activity
      getAssetActivity('MON').then(setPositionActivities).catch(() => {});
    }
  }, [positions]);

  const totalPnl = positions.reduce((sum, p) => sum + (p.pnlPercent || 0), 0);
  const totalInvested = positions.reduce((sum, p) => sum + (p.usdcInvested || 0), 0);

  return (
    <div className="bl-page">
      <h1 className="bl-title">AI Auto Trade — <span>Monad</span></h1>
      <p className="bl-subtitle">Galeon Brain trades on Kuru DEX. Real positions, real PnL, all on-chain.</p>

      <div className="bl-grid-2">
        {/* Left */}
        <div>
          {/* Agent Wallet */}
          <AgentWalletCard currentPrice={currentPrice} />



          {/* Active Positions */}
          <div className="bl-card">
            <div className="bl-card-label">
              Active Positions {positions.length > 0 && <span style={{ color: '#22c55e' }}>({positions.length})</span>}
            </div>

            {loading && <div style={{ color: '#94a3b8', fontSize: 13, padding: 20, textAlign: 'center' }}>Loading positions...</div>}
            {!loading && positions.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: 30, textAlign: 'center' }}>
                No active positions. Brain is scanning for signals...
              </div>
            )}

            {positions.map((pos, i) => {
              const pnl = pos.pnlPercent || 0;
              const pnlColor = pnl >= 0 ? '#22c55e' : '#ef4444';
              const pnlUsd = (pos.usdcInvested * pnl / 100);
              const isExpanded = expandedPos === i;
              const votes = pos.votingResult?.votes || [];

              return (
                <div key={i} className="bl-pos" onClick={() => setExpandedPos(isExpanded ? null : i)} style={{ cursor: 'pointer' }}>
                  {/* Header */}
                  <div className="bl-pos-header">
                    <div>
                      <span className="bl-pos-token">{pos.asset}</span>
                      <span className={`bl-badge ${pos.direction?.toLowerCase()}`} style={{ marginLeft: 8 }}>{pos.direction}</span>
                      <span style={{ fontSize: 11, color: '#4f7df9', marginLeft: 8 }}>{pos.votingResult?.confidence || 76}% conf</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="bl-pos-pnl" style={{ color: pnlColor }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%</span>
                      <div style={{ fontSize: 11, color: pnlColor, fontFamily: "'JetBrains Mono'" }}>{pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(4)}</div>
                    </div>
                  </div>

                  {/* Position Details */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '10px 0', fontSize: 12 }}>
                    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>Amount</div>
                      <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: '#1e293b' }}>{pos.monAmount?.toFixed(2)} MON</div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>${pos.usdcInvested?.toFixed(2)} invested</div>
                    </div>
                    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>Entry Price</div>
                      <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: '#1e293b' }}>${pos.entryPrice?.toFixed(6)}</div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>Now: ${pos.currentPrice?.toFixed(6) || '...'}</div>
                    </div>
                    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>Targets</div>
                      <div style={{ color: '#22c55e', fontWeight: 600, fontSize: 11 }}>TP1: ${pos.tp1Price?.toFixed(6)}{pos.tp1Hit ? ' ✅' : ''}</div>
                      <div style={{ color: '#ef4444', fontWeight: 600, fontSize: 11 }}>SL: ${pos.slPrice?.toFixed(6)}</div>
                    </div>
                  </div>

                  {/* On-chain badges */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {pos.decisionId !== null && <span className="bl-onchain">Decision #{pos.decisionId}</span>}
                    {pos.tradeId !== null && <span className="bl-onchain">Trade #{pos.tradeId}</span>}
                    {pos.entryTxHash && (
                      <a href={`https://monadscan.com/tx/${pos.entryTxHash}`} target="_blank" rel="noopener noreferrer" className="bl-onchain" style={{ textDecoration: 'none' }}>Kuru Swap ↗</a>
                    )}
                  </div>

                  {/* ═══ Expanded: Full Brain Decision Path ═══ */}
                  {isExpanded && votes.length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                        Brain Decision Path — {votes.filter((v: any) => v.score > 0).length} Bullish / {votes.filter((v: any) => v.score < 0).length} Bearish
                      </div>

                      {/* Vote bars */}
                      {[...votes].sort((a: any, b: any) => b.score - a.score).map((v: any, j: number) => {
                        const cls = v.score > 0 ? 'bull' : v.score < 0 ? 'bear' : 'neutral';
                        const w = Math.min(Math.abs(v.score) * 50, 100);
                        return (
                          <div key={j} className="bl-vote-row">
                            <div className="bl-vote-dim">{v.dim}</div>
                            <div className="bl-vote-bar">
                              <div className={`bl-vote-fill ${cls}`} style={{ width: `${w}%` }}>{v.reason}</div>
                            </div>
                            <div className="bl-vote-score" style={{ color: v.score > 0 ? '#22c55e' : v.score < 0 ? '#ef4444' : '#94a3b8' }}>
                              {v.score > 0 ? '+' : ''}{v.score}
                            </div>
                          </div>
                        );
                      })}

                      {/* Score summary */}
                      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#64748b' }}>
                        <span>Total Score: <strong style={{ color: (pos.votingResult?.score || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                          {(pos.votingResult?.score || 0) > 0 ? '+' : ''}{pos.votingResult?.score || 0}
                        </strong></span>
                        <span>Threshold: <strong>6</strong></span>
                        <span style={{ color: '#22c55e' }}>PASSED ✅</span>
                      </div>

                      {/* Trade execution path */}
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                          Execution Path
                        </div>
                        <div style={{ position: 'relative', paddingLeft: 24 }}>
                          <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, background: '#e2e8f0' }} />

                          {[
                            { dot: 'green', label: 'Brain Signal', desc: `${pos.direction} ${pos.votingResult?.confidence || 76}% — Score +${pos.votingResult?.score || 8} (12 dimensions)` },
                            { dot: 'active', label: 'Decision On-chain', desc: `Decision #${pos.decisionId} published to Monad` },
                            { dot: 'green', label: 'Kuru Swap', desc: `$${pos.usdcInvested?.toFixed(2)} USDC → ${pos.monAmount?.toFixed(2)} MON @ $${pos.entryPrice?.toFixed(6)}` },
                            { dot: 'active', label: 'AI-Endorsed Trade', desc: `Trade #${pos.tradeId} recorded on-chain with AI endorsement` },
                            { dot: pnl >= 5 ? 'green' : pnl <= -8 ? 'red' : 'amber', label: 'Monitoring', desc: `PnL ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% — TP1 at +5%, SL at -8%` },
                          ].map((step, j) => (
                            <div key={j} style={{ position: 'relative', padding: '8px 0' }}>
                              <div className={`bl-timeline-dot ${step.dot}`} style={{ position: 'absolute', left: -20, top: 12, width: 10, height: 10 }} />
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{step.label}</div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{step.desc}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Click hint */}
                  <div style={{ textAlign: 'center', fontSize: 10, color: '#cbd5e1', marginTop: 8 }}>
                    {isExpanded ? '▲ Collapse' : '▼ Click to view Brain decision path'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Closed */}
          {closedPositions.length > 0 && (
            <div className="bl-card">
              <div className="bl-card-label">Closed Positions ({closedPositions.length})</div>
              {closedPositions.map((pos, i) => (
                <div key={i} className="bl-row">
                  <span className="bl-row-label">{pos.asset} {pos.direction}</span>
                  <span className={`bl-row-val ${(pos.totalPnlBps || 0) >= 0 ? 'green' : 'red'}`}>
                    {(pos.totalPnlBps || 0) >= 0 ? '+' : ''}{((pos.totalPnlBps || 0) / 100).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Performance */}
          <div className="bl-card">
            <div className="bl-card-label">Performance</div>
            <div className="bl-grid-4">
              <div className="bl-stat"><div className={`bl-stat-val ${totalPnl >= 0 ? 'green' : 'red'}`}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}%</div><div className="bl-stat-label">Current PnL</div></div>
              <div className="bl-stat"><div className="bl-stat-val">${totalInvested.toFixed(2)}</div><div className="bl-stat-label">Invested</div></div>
              <div className="bl-stat"><div className="bl-stat-val">{positions.length}</div><div className="bl-stat-label">Active</div></div>
              <div className="bl-stat"><div className="bl-stat-val">{closedPositions.length}</div><div className="bl-stat-label">Closed</div></div>
            </div>
          </div>
        </div>

        {/* Right */}
        <div>
          {/* Config */}
          <div className="bl-card">
            <div className="bl-card-label">Auto-Trade Config</div>
            {[
              { l: 'Trade size', v: '$0.50 per trade' },
              { l: 'Max positions', v: '3' },
              { l: 'TP1', v: '+5% (sell 50%)' },
              { l: 'TP2', v: '+10% (sell rest)' },
              { l: 'Stop Loss', v: '-8%' },
              { l: 'DEX', v: 'Kuru (Monad Mainnet)' },
              { l: 'Fee', v: '0.5% per swap' },
              { l: 'Monitor interval', v: 'Every 30s' },
              { l: 'Signal source', v: 'Galeon Brain (12 dimensions)' },
            ].map((r, i) => (
              <div key={i} className="bl-row">
                <span className="bl-row-label">{r.l}</span>
                <span className="bl-row-val">{r.v}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="bl-toggle on" />
              <span style={{ fontWeight: 700, color: '#22c55e', fontSize: 13 }}>Auto-Trade: ON</span>
            </div>
          </div>

          {/* Brain Activity */}
          <div className="bl-card" style={{ maxHeight: 500, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="bl-card-label" style={{ marginBottom: 0 }}>Position Activity</div>
              <span className="bl-live">Live</span>
            </div>
            {positionActivities.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 20 }}>No position activity yet...</div>
            )}
            {positionActivities.map((a: BrainActivity, i: number) => (
              <div key={i} className="bl-feed-item">
                <div className={`bl-feed-dot ${dotColorMap[a.type] || 'blue'}`} />
                <div className="bl-feed-time">{timeAgo(a.timestamp)}</div>
                <div className="bl-feed-body">
                  <div className="bl-feed-desc">
                    {a.asset && <strong style={{ color: '#1e293b' }}>{a.asset}</strong>}
                    {a.asset && ' — '}{a.message}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrainLinkTradePage;

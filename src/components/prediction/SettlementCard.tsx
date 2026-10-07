import React, { useState } from 'react';
import { RiseOutlined, FallOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import type { PredictionEvent, SettlementBet } from '../../types/prediction';
import * as predictionApi from '../../services/predictionMarketService';

interface Props { event: PredictionEvent; }

const SettlementCard: React.FC<Props> = ({ event }) => {
  const [expanded, setExpanded] = useState(false);
  const [bets, setBets] = useState<SettlementBet[]>([]);
  const [loading, setLoading] = useState(false);

  const pnl = parseFloat(String(event.actual_pnl_pct || 0));
  const pnlPos = pnl >= 0;
  const isLong = event.direction === 'LONG';
  const winnerCount = Number(event.winner_count || 0) + Number((event as any).points_winner_count || 0);
  const participantCount = Number(event.participant_count || 0) + Number((event as any).points_participant_count || 0);
  const pool = Number(event.total_pool || 0);

  const handleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    setLoading(true);
    try {
      const result = await predictionApi.getEventSettlement(event.event_id);
      if (result) setBets(result.bets);
      setExpanded(true);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const winners = bets.filter(b => b.is_winner);
  const others = bets.filter(b => !b.is_winner);

  const MEDALS = ['#f59e0b', '#94a3b8', '#cd7c2f'];

  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
      border: '1px solid #ebebf0',
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={handleExpand}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          alignItems: 'center',
          gap: 14,
          padding: '12px 16px',
          cursor: 'pointer',
        }}
      >
        {/* Left: symbol + direction + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>
            {event.symbol}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700,
            background: isLong ? '#dcfce7' : '#fee2e2',
            color: isLong ? '#15803d' : '#b91c1c',
            border: `1px solid ${isLong ? '#bbf7d0' : '#fecaca'}`,
            whiteSpace: 'nowrap',
          }}>
            {isLong ? <RiseOutlined /> : <FallOutlined />}
            {event.direction}{event.leverage ? ` ${event.leverage}x` : ''}
          </span>
          {event.settled_at && (
            <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
              {new Date(event.settled_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Center: PnL outcome pill */}
        <div style={{
          padding: '4px 14px',
          borderRadius: 30,
          background: pnlPos ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${pnlPos ? '#86efac' : '#fca5a5'}`,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14,
          fontWeight: 700,
          color: pnlPos ? '#16a34a' : '#dc2626',
          whiteSpace: 'nowrap',
        }}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
        </div>

        {/* Right: compact stats + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {[
            { label: 'Players', val: String(participantCount) },
            { label: 'Winners', val: winnerCount > 0 ? String(winnerCount) : '—' },
            { label: 'Pool',    val: pool > 0 ? `$${pool.toFixed(0)}` : `${Number((event as any).points_pool || 0).toFixed(0)} pts` },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: 'center', minWidth: 30 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                {val}
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>
                {label}
              </div>
            </div>
          ))}
          <div style={{ color: '#cbd5e1', fontSize: 11, marginLeft: 2 }}>
            {loading ? '…' : expanded
              ? <DownOutlined />
              : <RightOutlined />
            }
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && bets.length > 0 && (
        <div style={{ borderTop: '1px solid #f1f5f9' }}>

          {/* Winners */}
          {winners.length > 0 && (
            <div style={{ padding: '16px 20px', borderBottom: others.length > 0 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 12 }}>
                Winners
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {winners.map((b, i) => {
                  const payout = parseFloat(String(b.payout)) || 0;
                  const dist = parseFloat(String(b.distance));
                  const predicted = parseFloat(String(b.predicted_pnl_pct));
                  return (
                    <div key={b.user_address} style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 1fr auto',
                      alignItems: 'center',
                      gap: 14,
                      padding: '10px 14px',
                      background: '#fafafa',
                      borderRadius: 10,
                      border: '1px solid #f0f0f5',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: MEDALS[i] || '#cbd5e1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: 'white', flexShrink: 0,
                      }}>
                        #{b.rank_position}
                      </div>
                      <div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, color: '#374151' }}>
                          {b.user_address.slice(0, 6)}…{b.user_address.slice(-4)}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          predicted{' '}
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#6b7280', fontWeight: 600 }}>
                            {predicted >= 0 ? '+' : ''}{predicted.toFixed(1)}%
                          </span>
                          {' '}· staked{' '}
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#6b7280', fontWeight: 600 }}>
                            {(b as any).bet_type === 'POINTS' ? `${parseFloat(String(b.bet_amount || 0)).toFixed(0)} pts` : `$${parseFloat(String(b.bet_amount || 0)).toFixed(0)}`}
                          </span>
                          {' '}· dist{' '}
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#6b7280', fontWeight: 600 }}>
                            {isNaN(dist) ? '—' : dist.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: '#16a34a' }}>
                          {(b as any).bet_type === 'POINTS' ? `+${payout.toFixed(0)} pts` : `+$${payout.toFixed(2)}`}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>payout</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Others */}
          {others.length > 0 && (
            <div style={{ padding: '12px 20px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                Other Participants
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px 70px 76px 64px', gap: 8, padding: '4px 0 6px', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <div>Player</div>
                <div style={{ textAlign: 'center' }}>Predicted</div>
                <div style={{ textAlign: 'center' }}>Staked</div>
                <div style={{ textAlign: 'center' }}>Distance</div>
                <div style={{ textAlign: 'right' }}>Result</div>
              </div>
              {others.map(b => {
                const dist = parseFloat(String(b.distance));
                const predicted = parseFloat(String(b.predicted_pnl_pct));
                const betAmt = parseFloat(String(b.bet_amount || 0));
                return (
                  <div key={b.user_address} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 76px 70px 76px 64px',
                    gap: 8,
                    padding: '7px 0',
                    fontSize: 12,
                    borderBottom: '1px solid #f9fafb',
                    alignItems: 'center',
                  }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280' }}>
                      {b.user_address.slice(0, 6)}…{b.user_address.slice(-4)}
                    </div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#6b7280' }}>
                      {predicted >= 0 ? '+' : ''}{predicted.toFixed(1)}%
                    </div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#6b7280' }}>
                      {betAmt > 0 ? ((b as any).bet_type === 'POINTS' ? `${betAmt.toFixed(0)} pts` : `$${betAmt.toFixed(0)}`) : '—'}
                    </div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#6b7280' }}>
                      {isNaN(dist) ? '—' : dist.toFixed(1)}%
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {b.is_qualified
                        ? <span className="pm-badge pm-badge-runner" style={{ fontSize: 10 }}>Runner</span>
                        : <span className="pm-badge pm-badge-out" style={{ fontSize: 10 }}>Out</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SettlementCard;

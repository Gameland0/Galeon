import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Segmented } from 'antd';
import { DollarOutlined, StarOutlined } from '@ant-design/icons';
import type { LeaderboardEntry } from '../../types/prediction';
import * as predictionApi from '../../services/predictionMarketService';

const MEDALS = ['🥇', '🥈', '🥉'];
const PAGE_SIZE = 10;

const Leaderboard: React.FC = () => {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [betType, setBetType] = useState<'USDC' | 'POINTS'>('POINTS');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await predictionApi.getLeaderboard(100, betType);
      setData(list);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [betType]);

  useEffect(() => {
    load();
    setPage(0);
  }, [load]);

  const isPoints = betType === 'POINTS';
  const unit = isPoints ? ' pts' : '';
  const prefix = isPoints ? '' : '$';

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;

  return (
    <div>
      {/* Tab 切换 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          🏆 Top Predictors
        </div>
        <Segmented
          value={betType}
          onChange={(v) => setBetType(v as 'USDC' | 'POINTS')}
          options={[
            { label: <span><StarOutlined /> Points</span>, value: 'POINTS' },
            { label: <span><DollarOutlined /> USDC</span>, value: 'USDC' },
          ]}
          size="small"
        />
      </div>

      {data.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 14, padding: '60px 20px',
          textAlign: 'center', color: '#9ca3af',
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
          <div style={{ fontSize: 16, color: '#6b7280', fontWeight: 500 }}>No data yet</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Start predicting to appear on the leaderboard</div>
        </div>
      ) : (
        <>
          {/* Podium */}
          {data.slice(0, 3).length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(data.length, 3)}, 1fr)`,
              gap: 12,
              marginBottom: 20,
            }}>
              {data.slice(0, 3).map((entry, i) => {
                const net = parseFloat(String(entry.net_pnl)) || 0;
                const wr  = parseFloat(String(entry.win_rate));
                const podiumColors = [
                  { bg: 'linear-gradient(135deg, #fefce8, #fef9c3)', border: '#fde68a', accent: '#d97706' },
                  { bg: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', border: '#e2e8f0', accent: '#64748b' },
                  { bg: 'linear-gradient(135deg, #fff7ed, #ffedd5)', border: '#fed7aa', accent: '#c2410c' },
                ];
                const c = podiumColors[i];
                return (
                  <div key={entry.user_address} style={{
                    background: c.bg,
                    border: `1.5px solid ${c.border}`,
                    borderRadius: 14,
                    padding: '20px 16px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{MEDALS[i]}</div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12, color: '#374151', fontWeight: 600, marginBottom: 12,
                    }}>
                      {entry.user_address.slice(0, 6)}…{entry.user_address.slice(-4)}
                    </div>
                    <div style={{
                      fontSize: 22, fontWeight: 800,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: net >= 0 ? '#16a34a' : '#dc2626',
                      lineHeight: 1, marginBottom: 4,
                    }}>
                      {net >= 0 ? '+' : ''}{prefix}{Math.abs(net).toLocaleString()}{unit}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 12 }}>Net P&L</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: c.accent, fontWeight: 700 }}>{wr.toFixed(0)}%</div>
                        <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>Win Rate</div>
                      </div>
                      <div style={{ width: 1, background: '#e2e8f0' }} />
                      <div>
                        <div style={{ fontSize: 11, color: c.accent, fontWeight: 700 }}>{entry.total_bets}</div>
                        <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>Bets</div>
                      </div>
                      <div style={{ width: 1, background: '#e2e8f0' }} />
                      <div>
                        <div style={{ fontSize: 11, color: c.accent, fontWeight: 700 }}>{entry.total_wins}</div>
                        <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>Wins</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Table */}
          {data.slice(3).length > 0 && (() => {
            const rest = data.slice(3);
            const totalPages = Math.ceil(rest.length / PAGE_SIZE);
            const pagedRest = rest.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            return (
              <div style={{
                background: 'white', borderRadius: 14,
                overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
                border: '1px solid #f0f0f5',
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '50px 1fr 70px 70px 80px 100px 100px 100px',
                  padding: '10px 20px',
                  background: '#f8fafc',
                  borderBottom: '1px solid #f1f5f9',
                  fontSize: 10, fontWeight: 600,
                  color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px',
                }}>
                  <div>#</div>
                  <div>Player</div>
                  <div style={{ textAlign: 'center' }}>Bets</div>
                  <div style={{ textAlign: 'center' }}>Wins</div>
                  <div style={{ textAlign: 'center' }}>Win %</div>
                  <div style={{ textAlign: 'right' }}>Staked</div>
                  <div style={{ textAlign: 'right' }}>Payout</div>
                  <div style={{ textAlign: 'right' }}>Net P&L</div>
                </div>

                {pagedRest.map((entry, i) => {
                  const net = parseFloat(String(entry.net_pnl)) || 0;
                  const wr  = parseFloat(String(entry.win_rate));
                  const staked  = parseFloat(String(entry.total_bet_amount));
                  const payout  = parseFloat(String(entry.total_payout));
                  const rank = page * PAGE_SIZE + i + 4;
                  return (
                    <div key={entry.user_address} style={{
                      display: 'grid',
                      gridTemplateColumns: '50px 1fr 70px 70px 80px 100px 100px 100px',
                      padding: '12px 20px',
                      alignItems: 'center',
                      borderBottom: '1px solid #f9fafb',
                      fontSize: 13,
                      transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafbfc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>#{rank}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#374151', fontWeight: 600 }}>
                        {entry.user_address.slice(0, 6)}…{entry.user_address.slice(-4)}
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#374151' }}>{entry.total_bets}</div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#374151' }}>{entry.total_wins}</div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", color: '#6366f1', fontWeight: 600 }}>
                        {wr.toFixed(1)}%
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: '#374151' }}>
                        {prefix}{staked.toLocaleString()}{unit}
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: '#374151' }}>
                        {prefix}{payout.toLocaleString()}{unit}
                      </div>
                      <div style={{
                        textAlign: 'right',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 700,
                        color: net >= 0 ? '#16a34a' : '#dc2626',
                      }}>
                        {net >= 0 ? '+' : ''}{prefix}{Math.abs(net).toLocaleString()}{unit}
                      </div>
                    </div>
                  );
                })}

                {totalPages > 1 && (
                  <div style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
                    padding: '12px 20px', borderTop: '1px solid #f1f5f9',
                  }}>
                    <button
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
                        background: page === 0 ? '#f8fafc' : 'white', color: page === 0 ? '#cbd5e1' : '#374151',
                        cursor: page === 0 ? 'default' : 'pointer', fontSize: 12,
                      }}
                    >Prev</button>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{page + 1} / {totalPages}</span>
                    <button
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
                        background: page >= totalPages - 1 ? '#f8fafc' : 'white',
                        color: page >= totalPages - 1 ? '#cbd5e1' : '#374151',
                        cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: 12,
                      }}
                    >Next</button>
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
};

export default Leaderboard;

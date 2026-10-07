import React, { useState, useEffect, useCallback } from 'react';
import { Spin } from 'antd';
import { ReloadOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import type { PredictionUserStats, UserBetHistory } from '../../types/prediction';
import * as predictionApi from '../../services/predictionMarketService';

const MyPredictions: React.FC = () => {
  const [stats, setStats] = useState<PredictionUserStats | null>(null);
  const [history, setHistory] = useState<UserBetHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        predictionApi.getMyStats(),
        predictionApi.getMyHistory(50, 0),
      ]);
      setStats(s);
      setHistory(h);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalBets = parseFloat(String(stats?.total_bets || 0));
  const totalWins = parseFloat(String(stats?.total_wins || 0));
  const winRate = totalBets > 0 ? (totalWins / totalBets * 100).toFixed(1) : '0';
  const usdcNetPnl = stats ? parseFloat(String((stats as any).usdc_net_pnl || 0)) : 0;
  const ptsNetPnl = stats ? parseFloat(String((stats as any).pts_net_pnl || 0)) : 0;
  const usdcStaked = stats ? parseFloat(String((stats as any).usdc_staked || 0)) : 0;
  const ptsStaked = stats ? parseFloat(String((stats as any).pts_staked || 0)) : 0;
  const usdcPayout = stats ? parseFloat(String((stats as any).usdc_payout || 0)) : 0;
  const ptsPayout = stats ? parseFloat(String((stats as any).pts_payout || 0)) : 0;

  const fmtDual = (usdc: number, pts: number, showSign: boolean = false) => {
    const parts: string[] = [];
    const sign = (v: number) => showSign ? (v >= 0 ? '+' : '-') : (v < 0 ? '-' : '');
    const absStr = (v: number) => Math.abs(v) >= 1000 ? (Math.abs(v)/1000).toFixed(1)+'K' : Math.abs(v).toFixed(0);
    if (usdc !== 0) parts.push(`${sign(usdc)}$${absStr(usdc)}`);
    if (pts !== 0) parts.push(`${sign(pts)}${absStr(pts)} pts`);
    return parts.length > 0 ? parts.join(' / ') : '-';
  };

  const getResultBadge = (record: UserBetHistory) => {
    if (record.event_status === 'OPEN')
      return <span className="pm-badge pm-badge-live">● Live</span>;
    if (record.event_status === 'CANCELLED')
      return <span className="pm-badge pm-badge-neutral">Cancelled</span>;
    if (record.is_winner)
      return <span className="pm-badge pm-badge-win">🏆 #{record.rank_position} Won</span>;
    if (record.is_qualified)
      return <span className="pm-badge pm-badge-runner">Runner-up</span>;
    return <span className="pm-badge pm-badge-out">Eliminated</span>;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>My Predictions</div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'white', border: '1px solid #e2e8f0',
            borderRadius: 8, padding: '7px 14px',
            fontSize: 13, color: '#374151', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1, fontFamily: 'inherit',
          }}
        >
          <ReloadOutlined style={{ fontSize: 12 }} /> Refresh
        </button>
      </div>

      {/* Stats dashboard */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: 'white',
          borderRadius: 14,
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
          overflow: 'hidden',
          marginBottom: 20,
          border: '1px solid #f0f0f5',
        }}>
          {[
            { label: 'Total Bets', value: totalBets, color: undefined },
            { label: 'Wins',       value: totalWins, color: undefined },
            { label: 'Win Rate',   value: `${winRate}%`, color: undefined },
            { label: 'Staked',     value: fmtDual(usdcStaked, ptsStaked), color: undefined },
            { label: 'Payout',     value: fmtDual(usdcPayout, ptsPayout), color: undefined },
            { label: 'Net P&L',    value: fmtDual(usdcNetPnl, ptsNetPnl, true), color: (usdcNetPnl + ptsNetPnl) >= 0 ? '#16a34a' : '#dc2626' },
            { label: 'Best Streak',value: `${stats.best_win_streak ?? 0}🔥`, color: undefined },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '16px 8px',
              textAlign: 'center',
              borderRight: i < 6 ? '1px solid #f1f5f9' : 'none',
            }}>
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{
                fontSize: 18, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: s.color || '#111827',
              }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : history.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 14, padding: '60px 20px',
          textAlign: 'center', color: '#9ca3af',
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 16, color: '#6b7280', fontWeight: 500 }}>No bets yet</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Go to Live tab to place your first prediction</div>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #f0f0f5' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '110px 50px 80px 80px 65px 70px 100px 90px 1fr',
            padding: '10px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #f1f5f9',
            fontSize: 10, fontWeight: 600, color: '#94a3b8',
            textTransform: 'uppercase', letterSpacing: '0.4px',
          }}>
            <div>Symbol</div>
            <div>Dir</div>
            <div>My Pred</div>
            <div>Actual</div>
            <div>Dist</div>
            <div>Staked</div>
            <div>Result</div>
            <div style={{ textAlign: 'right' }}>Net P&L</div>
            <div style={{ textAlign: 'right' }}>Time</div>
          </div>

          {history.map((record, i) => {
            const predicted = parseFloat(String(record.predicted_pnl_pct));
            const actual    = record.actual_pnl_pct != null ? parseFloat(String(record.actual_pnl_pct)) : null;
            const dist      = record.distance != null ? parseFloat(String(record.distance)) : null;
            const net       = parseFloat(String(record.net_pnl)) || 0;
            const staked    = parseFloat(String(record.bet_amount));
            const isLong    = record.direction === 'LONG';

            return (
              <div key={record.id ?? i} style={{
                display: 'grid',
                gridTemplateColumns: '110px 50px 80px 80px 65px 70px 100px 90px 1fr',
                padding: '12px 20px',
                borderBottom: '1px solid #f9fafb',
                alignItems: 'center',
                fontSize: 13,
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fafbfc')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#111827', fontSize: 13 }}>
                  {record.symbol}
                </div>
                <div>
                  <span className={`pm-badge ${isLong ? 'pm-badge-live' : 'pm-badge-out'}`} style={{ padding: '2px 7px' }}>
                    {isLong ? <RiseOutlined /> : <FallOutlined />}
                  </span>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#374151' }}>
                  {predicted >= 0 ? '+' : ''}{predicted.toFixed(1)}%
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: actual === null ? '#d1d5db' : actual >= 0 ? '#16a34a' : '#dc2626' }}>
                  {actual === null ? '—' : `${actual >= 0 ? '+' : ''}${actual.toFixed(1)}%`}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#6b7280' }}>
                  {dist === null ? '—' : `${dist.toFixed(1)}%`}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#374151', fontSize: 12 }}>
                  {(record as any).bet_type === 'POINTS' ? `${staked.toFixed(0)} pts` : `$${staked.toFixed(0)}`}
                </div>
                <div>{getResultBadge(record)}</div>
                <div style={{
                  textAlign: 'right',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  color: net > 0 ? '#16a34a' : net < 0 ? '#dc2626' : '#94a3b8',
                }}>
                  {net === 0 ? '—' : (record as any).bet_type === 'POINTS'
                    ? `${net > 0 ? '+' : '-'}${Math.abs(net).toFixed(0)} pts`
                    : `${net > 0 ? '+' : '-'}$${Math.abs(net).toFixed(2)}`}
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: '#9ca3af' }}>
                  {record.created_at ? new Date(record.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyPredictions;

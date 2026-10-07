import React, { useEffect, useState } from 'react';
import { TeamOutlined, DollarOutlined, TrophyOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import type { PredictionEvent } from '../../types/prediction';
import { PREDICTION_CONFIG } from '../../types/prediction';
import { getEventDistribution } from '../../services/predictionMarketService';

interface Props {
  event: PredictionEvent;
  onBet: () => void;
  expanded?: boolean;
}

function getMaxWinners(count: number): number {
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  if (count <= 14) return 3;
  return Math.min(Math.max(4, Math.floor(count * 0.18)), 50);
}

const EventCard: React.FC<Props> = ({ event, onBet, expanded }) => {
  const [distribution, setDistribution] = useState<{ label: string; count: number; pct: number }[]>([]);

  useEffect(() => {
    getEventDistribution(event.event_id).then(setDistribution).catch(() => {});
  }, [event.event_id]);

  const participantCount = event.participant_count ?? 0;
  const maxWinners = getMaxWinners(participantCount);
  const gate = event.qualification_gate || PREDICTION_CONFIG.GATE_LONG;
  const isLong = event.direction === 'LONG';

  const pnl = event.current_pnl_pct != null ? Number(event.current_pnl_pct) : null;
  const hasPnl = pnl !== null && !isNaN(pnl);
  const pnlPositive = hasPnl && pnl! >= 0;

  const entryPrice = Number(event.entry_price);
  const currentPrice = event.current_price != null ? Number(event.current_price) : null;

  const formatPrice = (n: number) => {
    if (n >= 1000) return n.toFixed(2);
    if (n >= 1) return n.toFixed(4);
    return n.toFixed(6);
  };

  return (
    <div className="pm-card">
      <div className="pm-card-body">
        {/* Left */}
        <div className="pm-card-left">
          <div className="pm-card-title-row">
            <span className="pm-symbol">{event.symbol}</span>
            <span className={`pm-tag ${isLong ? 'pm-tag-long' : 'pm-tag-short'}`}>
              {isLong ? <RiseOutlined /> : <FallOutlined />} {event.direction}
            </span>
            {event.leverage && (
              <span className="pm-tag pm-tag-lev">{event.leverage}x</span>
            )}
            {/* Live pulse dot */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600, color: '#22c55e',
              textTransform: 'uppercase', letterSpacing: '0.6px',
              marginLeft: 4,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 0 0 rgba(34,197,94,0.5)',
                animation: 'pm-pulse 2s infinite',
                display: 'inline-block',
              }} />
              Live
            </span>
          </div>

          <div className="pm-price-row">
            <span className="pm-price-chip">
              Entry <strong>${isNaN(entryPrice) ? '—' : formatPrice(entryPrice)}</strong>
            </span>
            {currentPrice !== null && (
              <>
                <span className="pm-price-arrow">→</span>
                <span className="pm-price-chip">
                  Now <strong>${formatPrice(currentPrice)}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="pm-card-right">
          {hasPnl && (
            <div className="pm-pnl-block">
              <div className="pm-pnl-label">Live PnL</div>
              <div className={`pm-pnl-number ${pnlPositive ? 'pm-pnl-pos' : 'pm-pnl-neg'}`}>
                {pnl! >= 0 ? '+' : ''}{pnl!.toFixed(2)}%
              </div>
            </div>
          )}
          <button
            className={`pm-predict-btn${expanded ? ' active' : ''}`}
            onClick={onBet}
          >
            {expanded ? 'Cancel' : 'Predict Now'}
          </button>
        </div>
      </div>

      {/* Footer stats */}
      <div className="pm-card-footer" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="pm-stat-cell">
          <div className="pm-stat-label"><TeamOutlined /> Players</div>
          <div className="pm-stat-value">
            {participantCount + ((event as any).points_participant_count || 0)}
          </div>
        </div>
        <div className="pm-stat-cell">
          <div className="pm-stat-label"><DollarOutlined /> USDC Pool</div>
          <div className="pm-stat-value">${Number(event.total_pool || 0).toFixed(0)}</div>
        </div>
        <div className="pm-stat-cell">
          <div className="pm-stat-label">★ Points Pool</div>
          <div className="pm-stat-value">{Number((event as any).points_pool || 0).toLocaleString()}</div>
        </div>
        <div className="pm-stat-cell">
          <div className="pm-stat-label"><TrophyOutlined /> Win Zone</div>
          <div className="pm-stat-value">±{gate}%</div>
        </div>
      </div>

      {/* Prediction distribution */}
      {distribution.some(b => b.count > 0) && (() => {
        const maxPct = Math.max(...distribution.map(x => x.pct), 1);
        const total = distribution.reduce((s, b) => s + b.count, 0);
        return (
          <div style={{ padding: '12px 16px 14px', borderTop: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Prediction Heatmap
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>{total} predictions</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 64, padding: '0 2px' }}>
              {distribution.map((b) => {
                const barH = b.pct > 0 ? Math.max(8, Math.round((b.pct / maxPct) * 56)) : 4;
                const isTop = b.pct === maxPct && b.pct > 0;
                const opacity = b.pct > 0 ? 0.3 + (b.pct / maxPct) * 0.7 : 0.08;
                return (
                  <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{
                      fontSize: 10,
                      fontWeight: isTop ? 700 : 500,
                      color: isTop ? '#4f46e5' : b.pct > 0 ? '#6b7280' : 'transparent',
                      minHeight: 14,
                    }}>
                      {b.pct > 0 ? `${b.pct}%` : ''}
                    </div>
                    <div style={{
                      width: '100%',
                      height: barH,
                      borderRadius: 6,
                      background: isTop
                        ? 'linear-gradient(180deg, #a5b4fc, #4f46e5)'
                        : `rgba(99, 102, 241, ${opacity})`,
                      boxShadow: isTop ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none',
                      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '4px 2px 0' }}>
              {distribution.map((b) => (
                <div key={b.label} style={{
                  flex: 1,
                  fontSize: 9,
                  color: '#9ca3af',
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}>
                  {b.label}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default EventCard;

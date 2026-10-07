import React from 'react';
import { useNavigate } from 'react-router-dom';

interface AlphaSignalPreview {
  signalId: string;
  tokenSymbol: string;
  signalType: 'LONG' | 'SHORT' | 'NEUTRAL' | 'BUY' | 'SELL';
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  currentPrice: number;
  priceChangePercent?: number;
  status: 'ACTIVE' | 'HIT_TP' | 'HIT_SL' | 'EXPIRED';
  createdAt: string;
  tokenWinRate?: number;
  smartMoneyData?: {
    smartMoneyDirection?: string | null;
    smartMoneyHolders?: number | null;
  } | null;
  eventData?: {
    oiChange24h?: number | null;
    fundingRate?: number | null;
    trend?: string | null;
    pattern?: string | null;
  };
}

interface AlphaSignalCardProps {
  signal: AlphaSignalPreview;
  onViewDetail: (signalId: string) => Promise<any>;
}

const AlphaSignalCard: React.FC<AlphaSignalCardProps> = ({ signal }) => {
  const navigate = useNavigate();

  const getRelativeTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    if (h < 24) return `${h}h`;
    return `${d}d`;
  };

  const symbol = signal.tokenSymbol.replace(/USDT$|PERP$|BUSD$/i, '');
  const isLong = signal.signalType === 'LONG' || signal.signalType === 'BUY';
  const isShort = signal.signalType === 'SHORT' || signal.signalType === 'SELL';
  const dirColor = isLong ? '#16a34a' : isShort ? '#dc2626' : '#64748b';

  // Build English event tags
  const tags: string[] = [];
  const sm = signal.smartMoneyData?.smartMoneyDirection;
  const smH = signal.smartMoneyData?.smartMoneyHolders;
  if (sm) {
    const bull = sm === 'buy' || sm === 'LONG' || sm === 'BULL';
    tags.push(`SM ${bull ? 'Buying' : 'Selling'}${smH && smH > 0 ? ` ×${smH}` : ''}`);
  }
  const oi = signal.eventData?.oiChange24h;
  if (oi != null && Math.abs(oi) >= 2) tags.push(`OI ${oi > 0 ? '+' : ''}${oi.toFixed(1)}%`);
  const fr = signal.eventData?.fundingRate;
  if (fr != null) {
    const fp = fr * 100;
    if (Math.abs(fp) >= 0.02) tags.push(`FR ${fp > 0 ? '+' : ''}${fp.toFixed(3)}%`);
  }
  const trend = signal.eventData?.trend;
  if (trend) {
    const t = trend.toLowerCase();
    if (t.includes('bull') || t.includes('up') || t.includes('long')) tags.push('Rising');
    else if (t.includes('bear') || t.includes('down') || t.includes('short')) tags.push('Falling');
    else tags.push('Sideways');
  }

  const confColor = signal.confidence >= 80 ? '#16a34a' : signal.confidence >= 65 ? '#d97706' : '#94a3b8';
  const pct = signal.priceChangePercent;

  const statusDot: Record<string, string> = {
    ACTIVE: '#22c55e', HIT_TP: '#3b82f6', HIT_SL: '#ef4444', EXPIRED: '#94a3b8',
  };
  const dot = statusDot[signal.status] || '#94a3b8';

  return (
    <div
      onClick={() => navigate(`/alpha-agent/signal/${signal.signalId}`)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '13px 24px',
        borderBottom: '1px solid rgba(226,232,240,0.5)',
        cursor: 'pointer',
        transition: 'background 0.12s ease',
        gap: '16px',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(241,245,249,0.7)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Status dot */}
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: dot, flexShrink: 0 }} />

      {/* Token symbol — primary focus */}
      <div style={{ width: '72px', flexShrink: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px', lineHeight: 1 }}>
          {symbol}
        </div>
        {pct != null && pct !== 0 && (
          <div style={{ fontSize: '11px', fontWeight: '600', color: pct > 0 ? '#16a34a' : '#dc2626', marginTop: '2px' }}>
            {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
          </div>
        )}
      </div>

      {/* Direction badge */}
      <div style={{
        flexShrink: 0,
        fontSize: '11px', fontWeight: '700',
        padding: '3px 10px', borderRadius: '6px',
        color: dirColor,
        background: isLong ? 'rgba(22,163,74,0.1)' : isShort ? 'rgba(220,38,38,0.1)' : 'rgba(100,116,139,0.1)',
        letterSpacing: '0.5px',
      }}>
        {signal.signalType}
      </div>

      {/* Event description */}
      <div style={{ flex: 1, display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', overflow: 'hidden' }}>
        {tags.length > 0 ? tags.map((tag, i) => (
          <span key={i} style={{
            fontSize: '12px', color: '#475569', fontWeight: '500',
            background: 'rgba(100,116,139,0.07)',
            padding: '2px 8px', borderRadius: '5px',
            whiteSpace: 'nowrap',
          }}>
            {tag}
          </span>
        )) : (
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>—</span>
        )}
        {signal.status === 'HIT_TP' && <span style={{ fontSize: '11px', fontWeight: '700', color: '#3b82f6' }}>✓ TP Hit</span>}
        {signal.status === 'HIT_SL' && <span style={{ fontSize: '11px', fontWeight: '700', color: '#ef4444' }}>✗ SL Hit</span>}
      </div>

      {/* Confidence */}
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '36px' }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: confColor }}>{signal.confidence.toFixed(0)}%</div>
        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '500' }}>conf</div>
      </div>

      {/* Win Rate */}
      {signal.tokenWinRate != null && signal.tokenWinRate > 0 ? (
        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '36px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: signal.tokenWinRate >= 55 ? '#16a34a' : signal.tokenWinRate >= 45 ? '#d97706' : '#dc2626' }}>
            {signal.tokenWinRate.toFixed(0)}%
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '500' }}>WR</div>
        </div>
      ) : <div style={{ width: '36px', flexShrink: 0 }} />}

      {/* Time */}
      <div style={{ flexShrink: 0, fontSize: '12px', color: '#94a3b8', fontWeight: '500', minWidth: '24px', textAlign: 'right' }}>
        {getRelativeTime(signal.createdAt)}
      </div>

      {/* Arrow */}
      <div style={{ flexShrink: 0, fontSize: '16px', color: '#cbd5e1' }}>›</div>
    </div>
  );
};

export default AlphaSignalCard;

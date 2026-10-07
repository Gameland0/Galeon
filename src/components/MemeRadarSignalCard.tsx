import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MemeRadarSignalPreview } from '../types/memeRadarSignal';

interface MemeRadarSignalCardProps {
  signal: MemeRadarSignalPreview;
}

const MemeRadarSignalCard: React.FC<MemeRadarSignalCardProps> = ({ signal }) => {
  const navigate = useNavigate();

  const formatPrice = (price: number | null | undefined) => {
    if (!price || price === 0) return '—';
    if (price < 0.000001) return price.toExponential(2);
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01)   return price.toFixed(6);
    if (price < 1)      return price.toFixed(5);
    if (price < 100)    return price.toFixed(4);
    return price.toFixed(2);
  };

  const formatNumber = (num: number | null | undefined) => {
    const n = num ?? 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  };

  const getRelativeTime = (timestamp: string) => {
    const now = new Date().getTime();
    const signalTime = new Date(timestamp).getTime();
    const diffMs = now - signalTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getSignalLevelConfig = (level: string) => {
    switch (level) {
      case 'STRONG_BUY':
        return { text: 'STRONG BUY', bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.4)' };
      case 'BUY':
        return { text: 'BUY', bg: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.4)' };
      case 'VETO':
        return { text: 'VETO', bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.4)' };
      default:
        return { text: 'WATCH', bg: 'rgba(248, 210, 100, 0.2)', color: '#F8D264', border: 'rgba(248, 210, 100, 0.4)' };
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'WIN': return { text: 'Win', color: '#22c55e' };
      case 'LOSS': return { text: 'Loss', color: '#ef4444' };
      case 'EXPIRED': return { text: 'Expired', color: '#6b7280' };
      default: return { text: 'Active', color: '#3b82f6' };
    }
  };

  const getChainColor = (chain: string) => {
    switch (chain) {
      case 'SOL': return '#9945FF';
      case 'BSC': return '#F0B90B';
      case 'ETH': return '#627EEA';
      case 'BASE': return '#0052FF';
      default: return '#6b7280';
    }
  };

  const handleViewDetail = () => {
    navigate(`/alpha-agent/meme-radar/${signal.signalId}`);
  };

  const levelConfig = getSignalLevelConfig(signal.signalLevel);
  const statusConfig = getStatusConfig(signal.status);

  // Top 4 dimension scores for mini display
  const topDimensions = [
    { key: 'SM', label: 'Smart Money', value: signal.dimensionScores.smartMoney },
    { key: 'WK', label: 'Whale/KOL', value: signal.dimensionScores.whaleKol },
    { key: 'Vol', label: 'Volume', value: signal.dimensionScores.volumeMomentum },
    { key: 'Dev', label: 'Dev Safety', value: signal.dimensionScores.devSafety },
  ];

  return (
    <div
      style={{
        background: '#161B22',
        border: '1px solid #30363D',
        borderRadius: '14px',
        padding: '0',
        marginBottom: '16px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
        position: 'relative',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        overflow: 'hidden'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.18)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.12)';
      }}
    >
      {/* Header Section */}
      <div style={{
        background: '#0F111A',
        padding: '16px 20px',
        borderBottom: '1px solid #30363D'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px'
        }}>
          {/* Token Symbol + Chain */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#E6EDF3',
              letterSpacing: '-0.3px'
            }}>
              {signal.tokenSymbol}
            </div>
            {/* Chain Badge */}
            <span style={{
              fontSize: '10px',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: '8px',
              background: `${getChainColor(signal.chain)}20`,
              color: getChainColor(signal.chain),
              border: `1px solid ${getChainColor(signal.chain)}40`,
              textTransform: 'uppercase'
            }}>
              {signal.chain}
            </span>
          </div>

          {/* Signal Level + Status */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* SM Count Badge */}
            {signal.smartMoneyCount > 0 && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '10px',
                fontWeight: '600',
                padding: '3px 8px',
                borderRadius: '8px',
                background: 'rgba(0, 211, 149, 0.15)',
                color: '#00D395',
                border: '1px solid rgba(0, 211, 149, 0.3)',
              }}>
                SM {signal.smartMoneyCount}
              </span>
            )}

            {/* KOL Badge */}
            {signal.kolCount > 0 && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '10px',
                fontWeight: '600',
                padding: '3px 8px',
                borderRadius: '8px',
                background: 'rgba(168, 85, 247, 0.15)',
                color: '#A855F7',
                border: '1px solid rgba(168, 85, 247, 0.3)',
              }}>
                KOL {signal.kolCount}
              </span>
            )}

            {/* Signal Level */}
            <span style={{
              background: levelConfig.bg,
              color: levelConfig.color,
              border: `1px solid ${levelConfig.border}`,
              fontSize: '10px',
              fontWeight: '700',
              padding: '4px 10px',
              borderRadius: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {levelConfig.text}
            </span>

            {/* Status */}
            <span style={{
              background: statusConfig.color === '#3b82f6' ? 'rgba(90, 106, 230, 0.2)' :
                         statusConfig.color === '#22c55e' ? 'rgba(34, 197, 94, 0.2)' :
                         statusConfig.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(107, 114, 128, 0.2)',
              color: statusConfig.color,
              border: `1px solid ${statusConfig.color}`,
              fontSize: '10px',
              fontWeight: '600',
              padding: '4px 10px',
              borderRadius: '12px',
              textTransform: 'uppercase'
            }}>
              {statusConfig.text}
            </span>
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '11px', color: '#8B949E', fontWeight: '500' }}>
            {signal.tokenName}
          </span>
          <span style={{ fontSize: '11px', color: '#8B949E' }}>
            {getRelativeTime(signal.createdAt)}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '20px' }}>
        {/* Radar Score */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{
            fontSize: '10px',
            color: '#8B949E',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px'
          }}>
            Radar Score
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
            <div style={{
              fontSize: '32px',
              fontWeight: '700',
              color: '#F8D264',
              letterSpacing: '-1px'
            }}>
              {signal.radarScore}
            </div>
            <span style={{ fontSize: '14px', color: '#8B949E' }}>/100</span>
          </div>
          {/* Progress Bar */}
          <div style={{
            height: '6px',
            background: 'rgba(248, 210, 100, 0.15)',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${signal.radarScore}%`,
              height: '100%',
              background: signal.radarScore >= 75
                ? 'linear-gradient(90deg, #22c55e 0%, #4ade80 100%)'
                : signal.radarScore >= 50
                  ? 'linear-gradient(90deg, #F8D264 0%, #F0C24B 100%)'
                  : 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)',
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            }} />
          </div>
        </div>

        {/* Price + Market Cap Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '14px'
        }}>
          {/* Current Price */}
          <div>
            <div style={{
              fontSize: '10px', color: '#8B949E', fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px'
            }}>
              Price
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#E6EDF3' }}>
                ${formatPrice(signal.currentPrice)}
              </div>
              {!!signal.priceChange1h && signal.priceChange1h !== 0 && (
                <div style={{
                  fontSize: '11px', fontWeight: '700',
                  color: signal.priceChange1h > 0 ? '#00C797' : '#F05454'
                }}>
                  {signal.priceChange1h > 0 ? '+' : ''}{(signal.priceChange1h ?? 0).toFixed(1)}%
                </div>
              )}
            </div>
          </div>

          {/* Market Cap */}
          <div>
            <div style={{
              fontSize: '10px', color: '#8B949E', fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px'
            }}>
              Market Cap
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#E6EDF3' }}>
              ${formatNumber(signal.marketCap)}
            </div>
          </div>
        </div>

        {/* Volume + Liquidity Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <div>
            <div style={{
              fontSize: '10px', color: '#8B949E', fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px'
            }}>
              24h Volume
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#E6EDF3' }}>
              ${formatNumber(signal.volume24h)}
            </div>
          </div>
          <div>
            <div style={{
              fontSize: '10px', color: '#8B949E', fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px'
            }}>
              Liquidity
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#E6EDF3' }}>
              ${formatNumber(signal.liquidity)}
            </div>
          </div>
        </div>

        {/* Dimension Mini Bars */}
        <div style={{
          background: 'rgba(90, 106, 230, 0.08)',
          border: '1px solid rgba(90, 106, 230, 0.2)',
          borderRadius: '10px',
          padding: '12px 14px'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px'
          }}>
            <span style={{ fontSize: '14px' }}>📡</span>
            <span style={{
              fontSize: '11px', fontWeight: '700', color: '#5A6AE6',
              textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              Dimension Scores
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {topDimensions.map((dim) => (
              <div key={dim.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: '#8B949E', width: '28px', fontWeight: '600' }}>
                  {dim.key}
                </span>
                <div style={{
                  flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)',
                  borderRadius: '2px', overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${dim.value}%`, height: '100%',
                    background: dim.value >= 70 ? '#22c55e' : dim.value >= 40 ? '#F8D264' : '#ef4444',
                    transition: 'width 0.4s ease'
                  }} />
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: '700', width: '24px', textAlign: 'right',
                  color: dim.value >= 70 ? '#22c55e' : dim.value >= 40 ? '#F8D264' : '#ef4444'
                }}>
                  {dim.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div style={{
        padding: '16px 20px',
        background: '#0F111A',
        borderTop: '1px solid #30363D',
        display: 'flex',
        gap: '10px'
      }}>
        <button
          onClick={handleViewDetail}
          style={{
            flex: 1,
            background: 'linear-gradient(135deg, #5A6AE6 0%, #3A4FE0 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '12px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(90, 106, 230, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <span>View Details</span>
        </button>
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 20px',
        background: '#0D0F15',
        borderTop: '1px solid #21262D',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span style={{ fontSize: '10px', color: '#6E7681' }}>
          {signal.chain} Chain
        </span>
        <span style={{ fontSize: '10px', color: '#6E7681' }}>
          {new Date(signal.createdAt).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
        </span>
      </div>
    </div>
  );
};

export default MemeRadarSignalCard;

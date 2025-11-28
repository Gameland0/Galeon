import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/AlphaSignalCard.css';
import TokenLearningStats from './TokenLearningStats';

// FLock Insight Interface (for hackathon demo)
interface FlockInsight {
  source: string;
  similarCasesCount: number;
  analysis: string;
  adjustmentReason: string;
}

// Signal Preview Interface (for list browsing)
interface AlphaSignalPreview {
  signalId: string;
  tokenSymbol: string;
  signalType: 'LONG' | 'SHORT' | 'NEUTRAL' | 'BUY' | 'SELL';
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  currentPrice: number;
  signalPrice?: number;
  priceChangePercent?: number;
  status: 'ACTIVE' | 'HIT_TP' | 'HIT_SL' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
  // Preview info for list display
  entryMin?: number;
  entryMax?: number;
  stopLoss?: number;
  takeProfit1?: number;

  // FLock enhancement fields (for hackathon demo)
  originalConfidence?: number;
  confidenceAdjustment?: number;
  flockInsight?: FlockInsight | null;
}

// 完整信号接口（付费查看详情）
interface AlphaSignalFull extends AlphaSignalPreview {
  entryZone: {
    min: number;
    max: number;
  };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  analysis: {
    oiChange24h: number;
    fundingRate: number;
    trend: string;
    pattern: string;
    volume: string;
    supportLevel?: number | null;
    resistanceLevel?: number | null;
    oiValue?: number | null;
    marketCap?: number | null;
    oiMcRatio?: number | null;
  };
  reasoning: string;
}

interface AlphaSignalCardProps {
  signal: AlphaSignalPreview;
  onViewDetail: (signalId: string) => Promise<AlphaSignalFull | null>;
  loading?: boolean;
}

const AlphaSignalCard: React.FC<AlphaSignalCardProps> = ({ signal, onViewDetail, loading = false }) => {
  const navigate = useNavigate();

  const formatPrice = (price: number) => {
    return price.toFixed(3);
  };

  const getRelativeTime = (timestamp: string) => {
    const now = new Date().getTime();
    const signalTime = new Date(timestamp).getTime();
    const diffMs = now - signalTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const getSignalTypeColor = (type: string) => {
    switch (type) {
      case 'LONG':
        return '#22c55e';
      case 'SHORT':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'LOW':
        return '#10b981';
      case 'MEDIUM':
        return '#f59e0b';
      case 'HIGH':
        return '#dc2626';
      default:
        return '#6b7280';
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ACTIVE: { text: 'Active', color: '#3b82f6' },
      HIT_TP: { text: 'Hit TP', color: '#22c55e' },
      HIT_SL: { text: 'Hit SL', color: '#ef4444' },
      EXPIRED: { text: 'Expired', color: '#6b7280' }
    };
    return statusConfig[status as keyof typeof statusConfig] || statusConfig.EXPIRED;
  };

  const handleViewDetail = () => {
    // 导航到独立的详情页面
    navigate(`/alpha-agent/signal/${signal.signalId}`);
  };

  const statusBadge = getStatusBadge(signal.status);
  const isHighConfidence = signal.confidence >= 80;
  const isMediumConfidence = signal.confidence >= 70 && signal.confidence < 80;

  return (
    <div
      className="alpha-signal-card"
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
          {/* Token Symbol */}
          <div style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#E6EDF3',
            letterSpacing: '-0.3px',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            {signal.tokenSymbol}
          </div>

          {/* Signal Type + Status */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* FLock Badge (for hackathon demo) */}
            {signal.flockInsight && signal.confidenceAdjustment !== undefined && (
              <span style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                fontSize: '10px',
                fontWeight: '600',
                padding: '5px 12px',
                borderRadius: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 8px rgba(102, 126, 234, 0.4)'
              }}>
                <span style={{ fontSize: '12px' }}>🧠</span>
                <span>{signal.confidenceAdjustment !== 0 ? 'FLock Enhanced' : 'FLock Analyzed'}</span>
              </span>
            )}

            <span style={{
              background: signal.signalType === 'LONG' ? '#22c55e' : signal.signalType === 'SHORT' ? '#ef4444' : '#6b7280',
              color: 'white',
              fontSize: '10px',
              fontWeight: '700',
              padding: '4px 10px',
              borderRadius: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {signal.signalType}
            </span>

            <span style={{
              background: statusBadge.color === '#3b82f6' ? 'rgba(90, 106, 230, 0.2)' :
                         statusBadge.color === '#10b981' ? 'rgba(16, 185, 129, 0.2)' :
                         statusBadge.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(107, 114, 128, 0.2)',
              color: statusBadge.color,
              border: `1px solid ${statusBadge.color}`,
              fontSize: '10px',
              fontWeight: '600',
              padding: '4px 10px',
              borderRadius: '12px',
              textTransform: 'uppercase'
            }}>
              {statusBadge.text}
            </span>
          </div>
        </div>

        {/* AI Signal Active + Time */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{
            fontSize: '11px',
            color: '#8B949E',
            fontWeight: '500'
          }}>
            🤖 AI Signal {signal.status === 'ACTIVE' ? 'Active' : 'Closed'}
          </span>
          <span style={{
            fontSize: '11px',
            color: '#8B949E'
          }}>
            Updated {getRelativeTime(signal.createdAt)}
          </span>
        </div>
      </div>

      {/* Main Content Section */}
      <div style={{ padding: '20px' }}>
        {/* Core Metrics - Left Aligned */}
        <div style={{ marginBottom: '16px' }}>
          {/* Confidence */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '10px',
              color: '#8B949E',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '6px'
            }}>
              Confidence
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
              <div style={{
                fontSize: '32px',
                fontWeight: '700',
                color: '#F8D264',
                fontFamily: 'Inter, system-ui, sans-serif',
                letterSpacing: '-1px'
              }}>
                {signal.confidence}%
              </div>
            </div>
            {/* Progress Bar */}
            <div style={{
              height: '6px',
              background: 'rgba(248, 210, 100, 0.15)',
              borderRadius: '3px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${signal.confidence}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #F8D264 0%, #F0C24B 100%)',
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
              }} />
            </div>
          </div>

          {/* Risk Level & Price Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '14px'
          }}>
            {/* Risk Level */}
            <div>
              <div style={{
                fontSize: '10px',
                color: '#8B949E',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px'
              }}>
                Risk Level
              </div>
              <span style={{
                display: 'inline-block',
                background: signal.riskLevel === 'HIGH' ? 'rgba(240, 84, 84, 0.2)' :
                           signal.riskLevel === 'MEDIUM' ? 'rgba(248, 210, 100, 0.2)' : 'rgba(0, 199, 151, 0.2)',
                color: signal.riskLevel === 'HIGH' ? '#F05454' :
                       signal.riskLevel === 'MEDIUM' ? '#F8D264' : '#00C797',
                fontSize: '11px',
                fontWeight: '700',
                padding: '6px 12px',
                borderRadius: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {signal.riskLevel}
              </span>
            </div>

            {/* Current Price */}
            <div>
              <div style={{
                fontSize: '10px',
                color: '#8B949E',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px'
              }}>
                Current Price
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#E6EDF3' }}>
                  ${formatPrice(signal.currentPrice)}
                </div>
                {signal.priceChangePercent !== undefined && signal.priceChangePercent !== 0 && (
                  <div style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    color: signal.priceChangePercent > 0 ? '#00C797' : '#F05454'
                  }}>
                    {signal.priceChangePercent > 0 ? '↗' : '↘'}
                    {signal.priceChangePercent > 0 ? '+' : ''}
                    {signal.priceChangePercent.toFixed(2)}%
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Performance Overview Card */}
        <div style={{
          background: 'rgba(90, 106, 230, 0.08)',
          border: '1px solid rgba(90, 106, 230, 0.2)',
          borderRadius: '10px',
          padding: '12px 14px',
          marginBottom: '16px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '14px' }}>📊</span>
            <span style={{
              fontSize: '11px',
              fontWeight: '700',
              color: '#5A6AE6',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Performance
            </span>
          </div>
          <TokenLearningStats tokenSymbol={signal.tokenSymbol} compact={true} />
        </div>
      </div>

      {/* Action Buttons */}
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
          <span>🔍</span>
          <span>View Details</span>
        </button>
      </div>

      {/* Created Time Footer */}
      <div style={{
        padding: '10px 20px',
        background: '#0D0F15',
        borderTop: '1px solid #21262D',
        display: 'flex',
        justifyContent: 'flex-end'
      }}>
        <span style={{
          fontSize: '10px',
          color: '#6E7681'
        }}>
          Created: {new Date(signal.createdAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </div>
    </div>
  );
};

export default AlphaSignalCard;

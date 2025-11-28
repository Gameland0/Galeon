import React from 'react';
import { FlockInsight } from '../services/alphaAgentService';

interface FlockInsightPanelProps {
  originalConfidence?: number;
  confidence: number;
  confidenceAdjustment?: number;
  flockInsight?: FlockInsight | null;
}

const FlockInsightPanel: React.FC<FlockInsightPanelProps> = ({
  originalConfidence,
  confidence,
  confidenceAdjustment,
  flockInsight
}) => {
  // Only show if flockInsight exists (adjustment can be 0)
  if (!flockInsight || confidenceAdjustment === undefined) {
    return null;
  }

  const adjustmentColor = confidenceAdjustment > 0 ? '#22c55e' : '#ef4444';
  const adjustmentBgColor = confidenceAdjustment > 0
    ? 'rgba(34, 197, 94, 0.15)'
    : 'rgba(239, 68, 68, 0.15)';

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
      border: '1px solid rgba(102, 126, 234, 0.25)',
      borderRadius: '16px',
      padding: '24px',
      marginTop: '24px',
      marginBottom: '24px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid rgba(102, 126, 234, 0.2)'
      }}>
        <span style={{ fontSize: '24px' }}>🧠</span>
        <h3 style={{
          fontSize: '18px',
          fontWeight: '700',
          color: '#E6EDF3',
          margin: 0,
          letterSpacing: '-0.3px'
        }}>
          FLock Historical Analysis
        </h3>
      </div>

      {/* Confidence Adjustment Display */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{
          marginBottom: '12px',
          color: '#8B949E',
          fontSize: '13px',
          fontWeight: '500',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Confidence Adjustment
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          {/* Original Confidence */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
              Original
            </div>
            <span style={{
              color: '#9CA3AF',
              fontSize: '24px',
              fontWeight: '600'
            }}>
              {originalConfidence || confidence - confidenceAdjustment}%
            </span>
          </div>

          {/* Arrow + Adjustment */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ color: '#6B7280', fontSize: '20px' }}>→</span>
            <div style={{
              background: adjustmentBgColor,
              color: adjustmentColor,
              border: `1px solid ${adjustmentColor}`,
              fontSize: '16px',
              fontWeight: '700',
              padding: '6px 14px',
              borderRadius: '10px'
            }}>
              {confidenceAdjustment > 0 ? '+' : ''}{confidenceAdjustment}
            </div>
          </div>

          {/* Final Confidence */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
              Final
            </div>
            <span style={{
              color: confidence >= 80 ? '#22c55e' : confidence >= 70 ? '#f59e0b' : '#ef4444',
              fontSize: '28px',
              fontWeight: '700'
            }}>
              {confidence}%
            </span>
          </div>
        </div>
      </div>

      {/* Historical Cases Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '16px',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#667eea',
            marginBottom: '4px'
          }}>
            {flockInsight.similarCasesCount}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#8B949E',
            fontWeight: '500'
          }}>
            Similar Cases
          </div>
        </div>

        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '16px',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#667eea',
            marginBottom: '4px'
          }}>
            {flockInsight.source === 'FLock RAG' ? '🔥' : '📊'}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#8B949E',
            fontWeight: '500'
          }}>
            {flockInsight.source}
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '12px',
        padding: '18px',
        borderLeft: '4px solid #667eea'
      }}>
        <div style={{
          fontWeight: '600',
          marginBottom: '10px',
          color: '#E6EDF3',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span>💡</span>
          <span>Historical Insight</span>
        </div>
        <div style={{
          fontSize: '14px',
          lineHeight: '1.6',
          color: '#C9D1D9'
        }}>
          {flockInsight.analysis}
        </div>
      </div>

      {/* Powered by Footer */}
      <div style={{
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid rgba(102, 126, 234, 0.15)',
        fontSize: '11px',
        color: '#6B7280',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px'
      }}>
        <span>⚡</span>
        <span>Powered by FLock RAG + DeepSeek AI</span>
      </div>
    </div>
  );
};

export default FlockInsightPanel;

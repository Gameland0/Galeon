/**
 * BrainDecisionHero - Light theme
 */
import React from 'react';

interface Props {
  direction: string;
  confidence: number;
  riskLevel: string;
  winRate: number;
  suggestedAction?: string;
}

const directionColors: Record<string, string> = { LONG: '#16a34a', SHORT: '#dc2626', WAIT: '#d97706' };
const riskColors: Record<string, string> = { LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#dc2626' };

const BrainDecisionHero: React.FC<Props> = ({ direction, confidence, riskLevel, winRate, suggestedAction }) => {
  const dirColor = directionColors[direction] || '#888';
  const riskColor = riskColors[riskLevel] || '#888';

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0f0ff 0%, #e8eeff 100%)',
      border: '1px solid #d0d0e8',
      borderRadius: 16,
      padding: '28px 32px',
      textAlign: 'center',
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 34, fontWeight: 800, color: dirColor }}>{direction}</div>
      {suggestedAction && (
        <div style={{ fontSize: 14, color: '#666', margin: '4px 0 16px' }}>{suggestedAction}</div>
      )}
      <div style={{
        display: 'inline-flex', gap: 24,
        background: '#ffffff', padding: '12px 28px', borderRadius: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#7c6ff7' }}>{confidence}%</div>
          <div style={{ fontSize: 11, color: '#888' }}>Confidence</div>
        </div>
        <div style={{ borderLeft: '1px solid #e2e4ea' }} />
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: riskColor }}>{riskLevel}</div>
          <div style={{ fontSize: 11, color: '#888' }}>Risk</div>
        </div>
        <div style={{ borderLeft: '1px solid #e2e4ea' }} />
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#16a34a' }}>{winRate}%</div>
          <div style={{ fontSize: 11, color: '#888' }}>Win Rate</div>
        </div>
      </div>
    </div>
  );
};

export default BrainDecisionHero;

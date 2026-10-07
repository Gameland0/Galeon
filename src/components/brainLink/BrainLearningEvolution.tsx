/**
 * BrainLearningEvolution - Light theme
 */
import React from 'react';

interface DimensionAccuracy { dimension_name: string; total: number; wins: number; accuracy: number; }
interface Props { weights: Record<string, number>; dimensions: DimensionAccuracy[]; totalLearningCycles: number; lastUpdate: string | null; }

const BrainLearningEvolution: React.FC<Props> = ({ weights, dimensions, totalLearningCycles, lastUpdate }) => {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e4ea', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, fontWeight: 600 }}>Brain Learning Evolution</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Brain auto-adjusts rules from every trade result</div>
      {dimensions.map((dim, i) => {
        const weight = weights[dim.dimension_name] || 1;
        const isReverse = dim.accuracy < 45; const isStrong = dim.accuracy >= 65;
        const color = isReverse ? '#dc2626' : isStrong ? '#16a34a' : '#444';
        const arrow = isReverse ? '↓' : isStrong ? '↑' : '→';
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < dimensions.length - 1 ? '1px solid #f0f1f5' : 'none' }}>
            <div style={{ fontSize: 13, color: '#444' }}>
              {dim.dimension_name} <span style={{ fontSize: 11, color: '#aaa' }}>({dim.total} trades)</span>
            </div>
            <div>
              <span style={{ fontSize: 14, color, marginRight: 4 }}>{arrow}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{dim.accuracy.toFixed(0)}%</span>
              {isReverse && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>(reverse indicator)</span>}
              {weight !== 1 && <span style={{ fontSize: 10, color: '#7c6ff7', marginLeft: 6 }}>w={weight}x</span>}
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e4ea', fontSize: 11, color: '#aaa' }}>
        {lastUpdate && `Last cycle: ${new Date(lastUpdate).toLocaleString()}`} · {totalLearningCycles} total cycles
      </div>
    </div>
  );
};

export default BrainLearningEvolution;

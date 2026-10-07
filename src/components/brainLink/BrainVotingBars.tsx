/**
 * BrainVotingBars - Light theme
 */
import React from 'react';

interface Vote { dimension: string; score: number; reason: string; type: 'bullish' | 'bearish' | 'neutral'; }
interface Props { votes: Vote[]; totalScore: number; threshold?: number; passed?: boolean; bullCount?: number; bearCount?: number; }

const BrainVotingBars: React.FC<Props> = ({ votes, totalScore, threshold = 6, passed, bullCount, bearCount }) => {
  const sorted = [...votes].sort((a, b) => b.score - a.score);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e4ea', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, fontWeight: 600 }}>
        Voting Breakdown — Score {totalScore > 0 ? '+' : ''}{totalScore} (Threshold: {threshold}) {passed ? '✅' : '❌'}
      </div>
      {(bullCount !== undefined || bearCount !== undefined) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, fontSize: 12 }}>
          <span style={{ color: '#16a34a', fontWeight: 600 }}>{bullCount} Bullish</span>
          <span style={{ color: '#dc2626', fontWeight: 600 }}>{bearCount} Bearish</span>
          <span style={{ color: '#888' }}>{votes.filter(v => v.score === 0).length} Neutral</span>
        </div>
      )}
      {sorted.map((vote, i) => {
        const barColor = vote.score > 0 ? '#16a34a' : vote.score < 0 ? '#dc2626' : '#ccc';
        const barBg = vote.score > 0 ? '#dcfce7' : vote.score < 0 ? '#fee2e2' : '#f3f4f6';
        const barWidth = Math.min(Math.abs(vote.score) * 50, 100);
        const scoreColor = vote.score > 0 ? '#16a34a' : vote.score < 0 ? '#dc2626' : '#999';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 12 }}>
            <div style={{ width: 70, color: '#666', textAlign: 'right', flexShrink: 0 }}>{vote.dimension}</div>
            <div style={{ flex: 1, height: 22, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${barWidth}%`, background: barBg, borderRadius: 4,
                display: 'flex', alignItems: 'center', paddingLeft: 6,
                fontSize: 10, fontWeight: 600, color: vote.score > 0 ? '#15803d' : vote.score < 0 ? '#b91c1c' : '#666',
                whiteSpace: 'nowrap', overflow: 'hidden', borderLeft: `3px solid ${barColor}`,
              }}>
                {vote.reason}
              </div>
            </div>
            <div style={{ width: 36, textAlign: 'center', fontWeight: 600, fontSize: 13, color: scoreColor }}>
              {vote.score > 0 ? '+' : ''}{vote.score}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BrainVotingBars;

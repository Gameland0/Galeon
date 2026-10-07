/**
 * BrainTimeline - Light theme
 */
import React from 'react';
import type { TimelineEntry } from '../../services/brainLinkService';

interface Props { timeline: TimelineEntry[]; loading?: boolean; }
const dirColors: Record<string, string> = { LONG: '#16a34a', SHORT: '#dc2626', WAIT: '#d97706' };

function formatTime(ts: string): string {
  const d = new Date(ts); const now = new Date(); const diffMs = now.getTime() - d.getTime(); const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return `${Math.floor(diffMs / 60000)}m ago`; if (diffH < 24) return `${diffH}h ago`; return `${Math.floor(diffH / 24)}d ago`;
}

const BrainTimeline: React.FC<Props> = ({ timeline, loading }) => {
  if (loading) return <div style={{ color: '#aaa', padding: 20 }}>Loading timeline...</div>;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e4ea', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 14, fontWeight: 600 }}>Brain Decision Timeline</div>
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, background: '#e2e4ea' }} />
        {timeline.map((entry, i) => {
          const dotColor = dirColors[entry.direction] || '#ccc';
          const isFirst = i === 0;
          return (
            <div key={i} style={{ position: 'relative', padding: '10px 0' }}>
              <div style={{ position: 'absolute', left: -20, top: 14, width: 12, height: 12, borderRadius: '50%', background: isFirst ? dotColor : '#fff', border: `2px solid ${dotColor}` }} />
              <div style={{ fontSize: 11, color: '#aaa' }}>{isFirst ? 'Now' : formatTime(entry.timestamp)}</div>
              <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>
                <span style={{ color: dotColor, fontWeight: 600 }}>{entry.direction} {entry.confidence}%</span>
                {entry.reasoning && ` — ${entry.reasoning}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BrainTimeline;

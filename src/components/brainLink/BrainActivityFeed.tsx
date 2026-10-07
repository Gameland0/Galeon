/**
 * BrainActivityFeed - Light theme
 */
import React from 'react';
import type { BrainActivity } from '../../services/brainLinkService';

interface Props { activities: BrainActivity[]; maxHeight?: number; }

const dotColors: Record<string, string> = {
  decision_change: '#16a34a', micro_step: '#7c6ff7', risk_alert: '#d97706',
  combo_block: '#dc2626', learning_update: '#16a34a', dca_pause: '#d97706', emergency_exit: '#dc2626',
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now'; if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`; return `${Math.floor(diff / 3600)}h`;
}

const BrainActivityFeed: React.FC<Props> = ({ activities, maxHeight = 380 }) => {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e4ea', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12, fontWeight: 600 }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, background: '#7c6ff7', borderRadius: '50%', marginRight: 8, animation: 'blpulse 1.5s infinite' }} />
        Brain Activity
      </div>
      <div style={{ maxHeight, overflowY: 'auto' }}>
        {activities.length === 0 && (
          <div style={{ color: '#aaa', fontSize: 12, textAlign: 'center', padding: 20 }}>Waiting for Brain activity...</div>
        )}
        {activities.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < activities.length - 1 ? '1px solid #f0f1f5' : 'none', fontSize: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColors[a.type] || '#ccc', marginTop: 4, flexShrink: 0 }} />
            <div style={{ color: '#aaa', width: 32, flexShrink: 0 }}>{timeAgo(a.timestamp)}</div>
            <div style={{ color: '#444', lineHeight: 1.4 }}>
              {a.asset && <strong style={{ color: '#1a1a2e' }}>{a.asset}</strong>}
              {a.asset && ' — '}
              <span dangerouslySetInnerHTML={{ __html: formatMsg(a.message) }} />
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes blpulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
    </div>
  );
};

function formatMsg(msg: string): string {
  return msg
    .replace(/LONG/g, '<span style="color:#16a34a;font-weight:600">LONG</span>')
    .replace(/SHORT/g, '<span style="color:#dc2626;font-weight:600">SHORT</span>')
    .replace(/WAIT/g, '<span style="color:#d97706;font-weight:600">WAIT</span>')
    .replace(/TP\d/g, m => `<span style="color:#d97706;font-weight:600">${m}</span>`)
    .replace(/DCA/g, '<span style="color:#7c6ff7;font-weight:600">DCA</span>')
    .replace(/BLOCKED/g, '<span style="color:#dc2626;font-weight:600">BLOCKED</span>')
    .replace(/(\+\d+\.?\d*%)/g, '<span style="color:#16a34a;font-weight:600">$1</span>')
    .replace(/(-\d+\.?\d*%)/g, '<span style="color:#dc2626;font-weight:600">$1</span>');
}

export default BrainActivityFeed;

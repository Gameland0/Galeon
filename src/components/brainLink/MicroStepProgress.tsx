/**
 * MicroStepProgress - Light theme
 */
import React from 'react';

export interface MicroStep { label: string; type: 'DCA_IN' | 'PARTIAL_TP' | 'FULL_EXIT' | 'RISK_EXIT' | 'SL_ADJUST' | 'pending'; status: 'done' | 'active' | 'pending' | 'paused'; time?: string; }
interface Props { steps: MicroStep[]; summary?: string; brainStatus?: string; brainStatusColor?: string; }

const statusColors: Record<string, string> = { done: '#16a34a', active: '#7c6ff7', pending: '#ddd', paused: '#d97706' };

const MicroStepProgress: React.FC<Props> = ({ steps, summary, brainStatus, brainStatusColor }) => {
  return (
    <div style={{ margin: '10px 0', padding: 10, background: '#f5f6fa', borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Micro-Execution Steps</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 4, background: statusColors[step.status] || '#ddd', borderRadius: 2, marginBottom: 3 }} />
            <div style={{ fontSize: 9, color: step.status === 'done' ? '#16a34a' : step.status === 'paused' ? '#d97706' : step.status === 'active' ? '#7c6ff7' : '#bbb', fontWeight: step.status !== 'pending' ? 600 : 400 }}>
              {step.label}
            </div>
            {step.time && <div style={{ fontSize: 9, color: '#bbb' }}>{step.time}</div>}
          </div>
        ))}
      </div>
      {summary && <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>{summary}</div>}
      {brainStatus && (
        <div style={{ fontSize: 11, color: '#444', padding: 8, background: '#fff', borderRadius: 6, marginTop: 8, borderLeft: '2px solid #7c6ff7' }}>
          🧠 Brain: <span style={{ color: brainStatusColor || '#444' }}>{brainStatus}</span>
        </div>
      )}
    </div>
  );
};

export default MicroStepProgress;

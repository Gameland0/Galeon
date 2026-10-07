/**
 * BrainMicroPlan - Light theme
 */
import React from 'react';
import type { MicroPlan } from '../../services/brainLinkService';

interface Props { plan: MicroPlan | null; loading?: boolean; }

const stepColors: Record<string, string> = { DCA_IN: '#16a34a', PARTIAL_TP: '#d97706', FULL_EXIT: '#dc2626' };

const BrainMicroPlan: React.FC<Props> = ({ plan, loading }) => {
  if (loading) return <div style={{ color: '#aaa', padding: 20 }}>Loading plan...</div>;
  if (!plan) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #c7c7e8', borderRadius: 12, padding: 20, boxShadow: '0 2px 12px rgba(124,111,247,0.08)' }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, fontWeight: 600 }}>AI Micro-Execution Plan</div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>Brain won't buy ${plan.totalAmount} at once. It splits into micro-steps, block by block:</div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
        {[
          { label: 'DCA IN', sub: '3 steps', bg: '#dcfce7', color: '#15803d', flex: 3 },
          { label: 'HOLD', sub: 'monitor', bg: '#f3f4f6', color: '#666', flex: 1 },
          { label: 'TP', sub: '30/30/40%', bg: '#fef3c7', color: '#92400e', flex: 2 },
          { label: 'SL', sub: 'dynamic', bg: '#fee2e2', color: '#b91c1c', flex: 1 },
        ].map((s, i) => (
          <div key={i} style={{ flex: s.flex, background: s.bg, borderRadius: i === 0 ? '4px 0 0 4px' : i === 3 ? '0 4px 4px 0' : 0, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.label}</div>
            <div style={{ fontSize: 10, color: '#888' }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
        {plan.steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < plan.steps.length - 1 ? '1px solid #f0f1f5' : 'none' }}>
            <span style={{ color: '#888' }}>Step {step.step}</span>
            <span style={{ color: stepColors[step.type] || '#444' }}>
              {step.amount ? `${step.type} ${step.percent}% ($${step.amount})` : `${step.type} ${step.percent}%`} — {step.condition}
            </span>
          </div>
        ))}
        {plan.safety && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ color: '#888' }}>Safety</span>
            <span style={{ color: '#dc2626' }}>{plan.safety}</span>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, padding: 8, background: '#f5f6fa', borderRadius: 6, fontSize: 11, color: '#888' }}>
        Est. 4-6 on-chain micro-steps · Gas: {plan.estimatedGas || '~$0.02'} total · Only possible on Monad (0.8s blocks, near-zero gas)
      </div>
    </div>
  );
};

export default BrainMicroPlan;

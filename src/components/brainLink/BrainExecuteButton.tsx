/**
 * BrainExecuteButton - Light theme
 */
import React, { useState } from 'react';

interface Props { suggestedAmount: number; originalAmount: number; asset: string; decisionId?: string | null; onExecute: (amount: number) => void; disabled?: boolean; }

const BrainExecuteButton: React.FC<Props> = ({ suggestedAmount, originalAmount, asset, decisionId, onExecute, disabled }) => {
  const [confirming, setConfirming] = useState(false);
  const showOverride = suggestedAmount < originalAmount;
  return (
    <div style={{ background: '#fff', border: '1px solid #c7c7e8', borderRadius: 12, padding: 16, boxShadow: '0 2px 12px rgba(124,111,247,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>Execute on Kuru DEX</div>
          <div style={{ fontSize: 12, color: '#888' }}>Fee: 0.5% · AI-Endorsed on Monad</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onExecute(suggestedAmount)} disabled={disabled}
            style={{ padding: '12px 28px', background: disabled ? '#ccc' : '#7c6ff7', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }}>
            Execute ${suggestedAmount} ✅
          </button>
          {showOverride && !confirming && (
            <button onClick={() => setConfirming(true)} disabled={disabled}
              style={{ padding: '12px 20px', background: '#f5f6fa', color: '#666', border: '1px solid #e2e4ea', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Override ${originalAmount} ⚠
            </button>
          )}
          {showOverride && confirming && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#d97706' }}>Brain recommends ${suggestedAmount}. Proceed?</span>
              <button onClick={() => { onExecute(originalAmount); setConfirming(false); }}
                style={{ padding: '8px 16px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Yes, ${originalAmount}
              </button>
              <button onClick={() => setConfirming(false)}
                style={{ padding: '8px 12px', background: '#f5f6fa', color: '#888', border: '1px solid #e2e4ea', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
      {decisionId && (
        <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7c6ff7', background: '#f0f0ff', padding: '4px 10px', borderRadius: 6 }}>
          🔗 Decision ID: #{decisionId} · Will be recorded on Monad
        </div>
      )}
    </div>
  );
};

export default BrainExecuteButton;

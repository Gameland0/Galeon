/**
 * BrainLinkEmbedDemo - Two Integration Modes
 * Mode 1: Pre-trade Check (DEX popup)
 * Mode 2: Agent Wallet Auto-Trade (dashboard widget)
 */
import React, { useState, useEffect, useRef } from 'react';
import './BrainLinkPages.css';

const BrainLinkEmbedDemo: React.FC = () => {
  const [mode, setMode] = useState<1 | 2>(2); // Default to auto-trade
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Load SDK
  useEffect(() => {
    if ((window as any).GaleonBrainLink) { setSdkLoaded(true); return; }
    const script = document.createElement('script');
    script.src = '/brain-link-sdk.js';
    script.onload = () => {
      (window as any).GaleonBrainLink.init({ apiUrl: 'http://localhost:9090/api' });
      setSdkLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  // Render dashboard when Mode 2 active
  useEffect(() => {
    if (mode === 2 && sdkLoaded && dashboardRef.current) {
      (window as any).GaleonBrainLink.connectWallet().then(() => {
        (window as any).GaleonBrainLink.enableAutoTrade({ maxPerTrade: 50, validDays: 30 });
        (window as any).GaleonBrainLink.renderDashboard(dashboardRef.current, { autoRefresh: true });
      });
    }
  }, [mode, sdkLoaded]);

  const handleCheck = () => {
    if (!sdkLoaded) return;
    (window as any).GaleonBrainLink.check('MON', 1000, (result: any) => {
      console.log('Brain Link result:', result);
      if (result.action === 'execute') alert(`Executing swap for $${result.amount} (AI-Endorsed)`);
    });
  };

  return (
    <div className="bl-page">
      <h1 className="bl-title">Brain Link <span>Integration Demo</span></h1>
      <p className="bl-subtitle">See how any Monad app integrates Galeon Brain Link with one SDK.</p>

      {/* Mode Switcher */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 14, padding: 4 }}>
          <button
            onClick={() => setMode(1)}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .25s',
              background: mode === 1 ? '#1e293b' : 'none', color: mode === 1 ? '#fff' : '#94a3b8',
              boxShadow: mode === 1 ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            Mode 1: Pre-trade Check
          </button>
          <button
            onClick={() => setMode(2)}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .25s',
              background: mode === 2 ? '#1e293b' : 'none', color: mode === 2 ? '#fff' : '#94a3b8',
              boxShadow: mode === 2 ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            Mode 2: Agent Wallet Auto-Trade
          </button>
        </div>
      </div>

      {/* Mode 1: Pre-trade Check */}
      {mode === 1 && (
        <>
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>↓ Simulated DEX — Click Swap to trigger Brain Link check ↓</span>
          </div>

          <div className="bl-card" style={{ maxWidth: 420, margin: '0 auto 24px', padding: '28px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: '#1e293b' }}>🔄 MonadSwap</span>
              <span style={{ fontSize: 12, background: '#4f7df9', color: '#fff', padding: '5px 14px', borderRadius: 10, fontWeight: 700 }}>Connected 🟢</span>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}><span>From</span><span>USDC</span></div>
              <input readOnly value="1,000" style={{ width: '100%', padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, color: '#1e293b', fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono'", textAlign: 'right', outline: 'none' }} />
            </div>
            <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 20, margin: '8px 0' }}>↓</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}><span>To</span><span>MON</span></div>
              <input readOnly value="~44,843" style={{ width: '100%', padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, color: '#1e293b', fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono'", textAlign: 'right', outline: 'none' }} />
            </div>
            <button onClick={handleCheck} className="bl-btn bl-btn-primary" style={{ width: '100%', padding: 16, fontSize: 16 }}>
              Swap
            </button>
          </div>

          <div className="bl-card" style={{ maxWidth: 600, margin: '0 auto' }}>
            <div className="bl-card-label">Integration Code — 3 lines</div>
            <div className="bl-code" style={{ marginBottom: 8 }}>{'<script src="https://galeon.world/brain-link-sdk.js"></script>'}</div>
            <div className="bl-code" style={{ marginBottom: 8 }}>{"GaleonBrainLink.init({ apiUrl: 'https://galeon.world/api' });"}</div>
            <div className="bl-code" style={{ whiteSpace: 'pre-wrap' }}>{"GaleonBrainLink.check('MON', 1000, (result) => {\n  if (result.action === 'execute') doSwap(result.amount);\n});"}</div>
          </div>
        </>
      )}

      {/* Mode 2: Agent Wallet Auto-Trade */}
      {mode === 2 && (
        <>
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>↓ This widget can be embedded in any Monad wallet, DEX, or portfolio app ↓</span>
          </div>

          <div style={{ maxWidth: 560, margin: '0 auto 24px' }}>
            <div ref={dashboardRef} id="gbl-dashboard-demo">
              <div className="bl-card" style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
                Loading Brain Link Dashboard...
              </div>
            </div>
          </div>

          <div className="bl-card" style={{ maxWidth: 600, margin: '0 auto' }}>
            <div className="bl-card-label">MetaMask Agent Wallet Plugin</div>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Install the Galeon Brain Link plugin for MetaMask Agent Wallet:</p>
            <div className="bl-code" style={{ marginBottom: 8 }}>mm plugins install @galeon/brain-link-plugin</div>
            <div className="bl-code" style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>{"// Check a token before trading\nmm brain check MON\n→ LONG 76% | 184 setups | 63% WR"}</div>
            <div className="bl-code" style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>{"// Enable AI auto-trade\nmm brain auto-trade --max-per-trade 0.5 --total-limit 10\n→ Brain now trades on Kuru DEX automatically"}</div>
            <div className="bl-code" style={{ whiteSpace: 'pre-wrap' }}>{"// View positions\nmm brain positions\n→ MON LONG 20.03 MON @ $0.024957 | PnL +7.6%"}</div>
          </div>

          <div className="bl-card" style={{ maxWidth: 600, margin: '10px auto 0' }}>
            <div className="bl-card-label">Web SDK (for DEX / Wallet apps)</div>
            <div className="bl-code" style={{ marginBottom: 8 }}>{'<script src="https://galeon.world/brain-link-sdk.js"></script>'}</div>
            <div className="bl-code" style={{ marginBottom: 8 }}>{"GaleonBrainLink.init({ apiUrl: 'https://galeon.world/api' });"}</div>
            <div className="bl-code" style={{ whiteSpace: 'pre-wrap' }}>{"// Pre-trade check popup\nGaleonBrainLink.check('MON', 1000, (result) => {\n  if (result.action === 'execute') doSwap(result.amount);\n});"}</div>
          </div>
        </>
      )}
    </div>
  );
};

export default BrainLinkEmbedDemo;

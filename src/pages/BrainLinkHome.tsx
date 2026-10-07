/**
 * BrainLinkHome - Brain Link Dashboard (MarketOverview style)
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDecisions, useBrainActivity } from '../hooks/useBrainLink';
import type { BrainActivity } from '../services/brainLinkService';
import './BrainLinkPages.css';

const dirClass: Record<string, string> = { LONG: 'long', SHORT: 'short', WAIT: 'wait' };

function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return 'now'; if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`; return `${Math.floor(d / 3600)}h`;
}

const dotColorMap: Record<string, string> = {
  decision_change: 'green', micro_step: 'blue', risk_alert: 'amber',
  combo_block: 'red', learning_update: 'green', dca_pause: 'amber', emergency_exit: 'red',
};

const BrainLinkHome: React.FC = () => {
  const navigate = useNavigate();
  const { decisions, loading } = useDecisions();
  const { activities } = useBrainActivity();
  const [searchToken, setSearchToken] = useState('');

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchToken.trim()) {
      navigate(`/brain/asset/${searchToken.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="bl-page">
      {/* Title */}
      <h1 className="bl-title">Galeon <span>Brain Link</span></h1>
      <p className="bl-subtitle">Before every trade on Monad, ask Galeon.</p>

      {/* Search Bar */}
      <div className="bl-card" style={{ padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 18 }}>🔍</span>
        <input
          type="text"
          placeholder="Search any token for Brain analysis (e.g. MON, WETH, BTC)..."
          value={searchToken}
          onChange={e => setSearchToken(e.target.value)}
          onKeyDown={handleSearch}
          style={{
            flex: 1, border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit',
            color: '#1e293b', background: 'transparent',
          }}
        />
        <button
          onClick={() => searchToken.trim() && navigate(`/brain/asset/${searchToken.trim().toUpperCase()}`)}
          className="bl-btn bl-btn-primary"
          style={{ padding: '8px 20px', fontSize: 13 }}
        >
          Analyze
        </button>
      </div>

      <div className="bl-grid-2">
        {/* Left: Live Decisions */}
        <div>
          <div className="bl-section-title">Live Decisions</div>
          {loading && <div style={{ color: '#94a3b8' }}>Loading...</div>}

          {decisions.map((d, i) => (
            <div key={i} className="bl-token-card" onClick={() => navigate(`/brain/asset/${d.asset}`)}>
              <div className="bl-token-row">
                <div>
                  <span className="bl-token-name">{d.asset}</span>
                </div>
                <span className={`bl-signal ${dirClass[d.direction] || 'wait'}`}>
                  {d.direction} {d.confidence}%
                </span>
              </div>
              <div className="bl-token-sparkline">
                <svg width="100%" height="40" viewBox="0 0 300 40" preserveAspectRatio="none">
                  {(() => {
                    const data = (d as any).sparkline;
                    if (!data || data.length < 2) {
                      return <polyline fill="none" stroke="#cbd5e1" strokeWidth="1.5" points="0,20 300,20" />;
                    }
                    const min = Math.min(...data);
                    const max = Math.max(...data);
                    const range = max - min || 1;
                    const points = data.map((v: number, j: number) =>
                      `${(j / (data.length - 1)) * 300},${38 - ((v - min) / range) * 36}`
                    ).join(' ');
                    const lastPrice = data[data.length - 1];
                    const firstPrice = data[0];
                    const color = lastPrice >= firstPrice ? '#22c55e' : '#ef4444';
                    return <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" points={points} />;
                  })()}
                </svg>
              </div>
              {(d as any).price > 0 && (
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: "'JetBrains Mono'", marginBottom: 4 }}>
                  ${(d as any).price < 1 ? (d as any).price.toFixed(4) : (d as any).price.toFixed(2)}
                </div>
              )}
              <div className="bl-token-meta">
                {d.similarSetups > 0 ? `${d.similarSetups} similar · ${d.winRate}% WR` : d.passed ? 'Signal active' : 'No clear edge'}
              </div>
            </div>
          ))}

          {decisions.length === 0 && !loading && (
            <div className="bl-card" style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>
              Brain is scanning... Decisions will appear here.
            </div>
          )}
        </div>

        {/* Right: Activity + Stats */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="bl-section-title" style={{ marginBottom: 0 }}>Brain Activity</div>
            <span className="bl-live">Live</span>
          </div>

          {/* Activity Feed */}
          <div className="bl-card" style={{ maxHeight: 360, overflowY: 'auto', padding: '16px 20px' }}>
            {activities.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 20 }}>Waiting for Brain activity...</div>}
            {activities.map((a: BrainActivity, i: number) => (
              <div key={i} className="bl-feed-item">
                <div className={`bl-feed-dot ${dotColorMap[a.type] || 'blue'}`} />
                <div className="bl-feed-time">{timeAgo(a.timestamp)}</div>
                <div className="bl-feed-body">
                  <div className="bl-feed-desc">
                    {a.asset && <strong style={{ color: '#1e293b' }}>{a.asset}</strong>}
                    {a.asset && ' — '}
                    {a.message}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Brain Stats */}
          <div className="bl-card">
            <div className="bl-card-label">Brain Performance</div>
            <div className="bl-grid-3">
              <div className="bl-stat"><div className="bl-stat-val">2,947</div><div className="bl-stat-label">Total Decisions</div></div>
              <div className="bl-stat"><div className="bl-stat-val green">61%</div><div className="bl-stat-label">Win Rate</div></div>
              <div className="bl-stat"><div className="bl-stat-val blue">12s</div><div className="bl-stat-label">Last Update</div></div>
            </div>
          </div>

          {/* Developer */}
          <div className="bl-card">
            <div className="bl-card-label">For Developers</div>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Embed Brain Link in your Monad app:</p>
            <div className="bl-code">{'<GaleonBrainWidget asset="MON" />'}</div>
            <div className="bl-btn-row">
              <button className="bl-btn bl-btn-secondary" onClick={() => navigate('/brain/embed-demo')}>Embed Demo</button>
              <button className="bl-btn bl-btn-secondary">API Docs</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrainLinkHome;

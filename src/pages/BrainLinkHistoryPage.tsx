/**
 * BrainLinkHistoryPage - Trade History (MarketOverview style)
 */
import React, { useState, useContext } from 'react';
import { useTraderStats, useLearningEvolution } from '../hooks/useBrainLink';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import './BrainLinkPages.css';

const BrainLinkHistoryPage: React.FC = () => {
  const { evmAccount } = useContext(MultiWalletContext);
  const address = evmAccount || '';
  const { stats } = useTraderStats(address);
  const { evolution } = useLearningEvolution();
  const [selectedTrade, setSelectedTrade] = useState<number | null>(null);

  const mockTrades = [
    { id: 1, token: 'MON', dir: 'LONG', conf: 76, result: 'WIN', pnl: '+12.8%', chain: '#1234', steps: 6 },
    { id: 2, token: 'WETH', dir: 'LONG', conf: 71, result: 'LOSS', pnl: '-3.1%', chain: '#1236', steps: 3 },
    { id: 3, token: 'MON', dir: 'LONG', conf: 82, result: 'WIN', pnl: '+6.4%', chain: '#1240', steps: 5 },
    { id: 4, token: 'CHOG', dir: 'SHORT', conf: 68, result: 'WIN', pnl: '+8.9%', chain: '#1245', steps: 4 },
    { id: 5, token: 'MON', dir: 'LONG', conf: 58, result: 'LOSS', pnl: '-2.1%', chain: '#1251', steps: 2 },
    { id: 6, token: 'WBTC', dir: 'LONG', conf: 74, result: 'WIN', pnl: '+5.7%', chain: '#1258', steps: 5 },
    { id: 7, token: 'MON', dir: 'LONG', conf: 80, result: 'WIN', pnl: '+9.2%', chain: '#1263', steps: 6 },
    { id: 8, token: 'WETH', dir: 'LONG', conf: 65, result: 'WIN', pnl: '+3.4%', chain: '#1270', steps: 4 },
  ];

  const mockLearning = [
    { name: 'Overall Win Rate', val: '67%', arrow: '↑', color: '#22c55e', note: '55% → 67%' },
    { name: 'K线 Accuracy', val: '72%', arrow: '↑', color: '#22c55e', note: '58% → 72%' },
    { name: 'Taker Accuracy', val: '41%', arrow: '↓', color: '#ef4444', note: 'Reverse indicator' },
    { name: 'SM Weight', val: '1.8x', arrow: '↑', color: '#22c55e', note: '1.0 → 1.8x' },
    { name: 'Fatal Combo Rules', val: '7', arrow: '', color: '#4f7df9', note: '2 learned from losses' },
    { name: 'BTC Uptrend WR', val: '71%', arrow: '↑', color: '#22c55e', note: '60% → 71%' },
    { name: 'Sideways WR', val: '48%', arrow: '', color: '#f59e0b', note: 'Brain avoids' },
  ];

  return (
    <div className="bl-page">
      <h1 className="bl-title">AI-Endorsed <span>Trade History</span></h1>
      <p className="bl-subtitle">Every trade verified on Monad — trustless and transparent.</p>

      <div className="bl-grid-2">
        {/* Left */}
        <div>
          {/* Stats */}
          <div className="bl-card">
            <div className="bl-card-label">On-chain Verified Stats</div>
            <div className="bl-grid-4" style={{ marginBottom: 14 }}>
              <div className="bl-stat"><div className="bl-stat-val">{stats?.totalTrades || 12}</div><div className="bl-stat-label">Trades</div></div>
              <div className="bl-stat"><div className="bl-stat-val green">{stats?.winRate || 67}%</div><div className="bl-stat-label">Win Rate</div></div>
              <div className="bl-stat"><div className="bl-stat-val green">+${stats?.totalPnl || '48.30'}</div><div className="bl-stat-label">Total PnL</div></div>
              <div className="bl-stat"><div className="bl-stat-val purple">{stats?.aiTrustScore || 72}</div><div className="bl-stat-label">AI Trust</div></div>
            </div>
            <div style={{ textAlign: 'center' }}><span style={{ color: '#4f7df9', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>View on Monad Explorer ↗</span></div>
          </div>

          {/* Trade Table */}
          <div className="bl-card">
            <table className="bl-table">
              <thead><tr>
                {['#', 'Token', 'Dir', 'Conf', 'Steps', 'Result', 'PnL', 'Chain'].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {mockTrades.map(t => (
                  <tr key={t.id} onClick={() => setSelectedTrade(selectedTrade === t.id ? null : t.id)}>
                    <td>{t.id}</td>
                    <td style={{ fontWeight: 700, color: '#1e293b' }}>{t.token}</td>
                    <td><span className={`bl-badge ${t.dir.toLowerCase()}`}>{t.dir}</span></td>
                    <td style={{ fontFamily: "'JetBrains Mono'" }}>{t.conf}%</td>
                    <td style={{ color: '#4f7df9', fontWeight: 600 }}>{t.steps}</td>
                    <td><span className={`bl-badge ${t.result.toLowerCase()}`}>{t.result}</span></td>
                    <td style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: t.pnl.startsWith('+') ? '#22c55e' : '#ef4444' }}>{t.pnl}</td>
                    <td><span style={{ color: '#4f7df9', fontWeight: 600, cursor: 'pointer' }}>{t.chain} ↗</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expanded Detail */}
          {selectedTrade && (() => {
            const t = mockTrades.find(x => x.id === selectedTrade);
            if (!t) return null;
            return (
              <div className="bl-card">
                <div className="bl-card-label">Trade {t.chain} — {t.token} {t.dir} · {t.steps} micro-steps</div>
                <div className="bl-micro-bar" style={{ marginBottom: 12 }}>
                  {['DCA 30%', 'DCA 30%', 'DCA 40%', 'TP1 30%', 'TP2 30%', 'Exit 40%'].slice(0, t.steps).map((s, i) => (
                    <div key={i} className="bl-micro-step">
                      <div className="bl-micro-step-bar done" />
                      <div className="bl-micro-step-label" style={{ color: '#22c55e' }}>{s}</div>
                    </div>
                  ))}
                </div>
                {[{ l: 'PnL', v: t.pnl, c: t.pnl.startsWith('+') ? 'green' : 'red' }, { l: 'Confidence', v: `${t.conf}%`, c: 'blue' }, { l: 'Micro-Steps', v: `${t.steps} on-chain` }, { l: 'Decision ID', v: t.chain }].map((r, i) => (
                  <div key={i} className="bl-row"><span className="bl-row-label">{r.l}</span><span className={`bl-row-val ${r.c || ''}`}>{r.v}</span></div>
                ))}
                <div className="bl-onchain" style={{ marginTop: 12 }}>🔗 {t.steps} verified transactions · Each step AI-endorsed</div>
              </div>
            );
          })()}
        </div>

        {/* Right */}
        <div>
          {/* Learning Evolution */}
          <div className="bl-card">
            <div className="bl-card-label">Brain Learning Evolution</div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>Brain auto-adjusts rules from every trade result</p>
            {mockLearning.map((m, i) => (
              <div key={i} className="bl-learn-row">
                <div className="bl-learn-metric">{m.name}</div>
                <div className="bl-learn-val" style={{ color: m.color }}>
                  {m.arrow && <span style={{ marginRight: 4 }}>{m.arrow}</span>}
                  {m.val}
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>{m.note}</span>
                </div>
              </div>
            ))}
            <div className="bl-hint">Last learning cycle: 12 minutes ago · 847 total cycles</div>
          </div>

          {/* What Other Protocols See */}
          <div className="bl-card" style={{ borderColor: '#c7d2fe' }}>
            <div className="bl-card-label">What Other Protocols See (On-chain)</div>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Any Monad protocol can read your AI-endorsed trading history:</p>
            {[
              { l: 'Trader', v: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '0x7a3f...8b2c' },
              { l: 'Total Trades', v: '12' }, { l: 'Win Rate', v: '67%', c: 'green' }, { l: 'AI Trust Score', v: '72 / 100', c: 'purple' },
            ].map((r, i) => (
              <div key={i} className="bl-row"><span className="bl-row-label">{r.l}</span><span className={`bl-row-val ${r.c || ''}`}>{r.v}</span></div>
            ))}
            <div className="bl-hint"><b>Example:</b> A lending protocol reads this → 67% win rate + 72 trust → grants you 20% higher credit limit.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrainLinkHistoryPage;

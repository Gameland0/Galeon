import React, { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, BarController, LineController, ArcElement, Tooltip, Filler, Legend,
} from 'chart.js';
import { Chart, Bar, Doughnut } from 'react-chartjs-2';
import { api } from '../services/api';
import type { PaperTradeStrategy } from '../types/paperTrade';
import './ReportPage.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, ArcElement, Tooltip, Filler, Legend);

// ── Types ──
interface StrategySummary {
  trades: number; wins: number; winRate: number;
  totalPnl: number; roi: number; profitFactor: number;
  maxDrawdown: number; sharpeRatio: number;
  avgWinPct: number; avgLossPct: number;
  maxWin: number; maxLoss: number;
  maxWinStreak: number; maxLossStreak: number;
}

interface ReportData {
  period: string;
  summary: { overall: StrategySummary; stable: StrategySummary; aggressive: StrategySummary };
  aiDecisionQuality: {
    highConfTrades: number; highConfWinRate: number; highConfPnl: number;
    lowConfTrades: number; lowConfWinRate: number; lowConfPnl: number;
    weeklyAccuracy: { week: string; winRate: number; avgScore: number }[];
    scoreBuckets: { bucket: string; trades: number; winRate: number; avgPnl: number; totalPnl: number }[];
    sourcePerformance: { source: string; trades: number; winRate: number; pnl: number }[];
  };
  aiMarketAdaptation: {
    regimeDirection: { regime: string; direction: string; trades: number; winRate: number; pnl: number }[];
  };
  keyInsights: string[];
  aiRiskShield: {
    signalsScanned: number; tradesBlocked: number;
    blockAccuracy: number; capitalSaved: number;
    topRules: { rule: string; blocked: number; accuracy: number }[];
  };
  marketRegime: { regime: string; trades: number; winRate: number; pnl: number; avgPnl: number }[];
  direction: { direction: string; trades: number; winRate: number; pnl: number; avgHoldMin: number }[];
  tokenLeaderboard: { top: TokenRow[]; bottom: TokenRow[] };
  durationAnalysis: { bucket: string; trades: number; winRate: number; avgPnl: number }[];
  exitAnalysis: { type: string; count: number; pct: number; avgPnl: number }[];
  timePerformance: { hour: number; trades: number; winRate: number; pnl: number }[];
  riskMetrics: {
    maxDrawdown: number; maxDrawdownDuration: number;
    recoveryFactor: number; worstDay: number; bestDay: number;
    avgRiskPerTrade: number;
  };
  aiLearning: {
    weeklyProgress: { week: string; winRate: number; profitFactor: number; avgLoss: number }[];
    modelVersion: string; lastRetrained: string;
    dimAccuracy: { dim: string; total: number; correct: number; accuracy: number }[];
  };
}

interface TokenRow { symbol: string; trades: number; winRate: number; pnl: number }

type Period = '7d' | '30d' | '90d' | 'all';

// ── Helpers ──
const N = (v: any): number => Number(v) || 0;
const fu = (n: any) => '$' + Math.abs(N(n)).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fuSigned = (n: any) => (N(n) >= 0 ? '+' : '-') + fu(n);
const fp = (n: any, d = 1) => N(n).toFixed(d) + '%';
const cn = (n: any) => N(n) > 0 ? 'rpt-green' : N(n) < 0 ? 'rpt-red' : '';

// ── Section Components ──

const SummarySection: React.FC<{ data: ReportData['summary'] }> = ({ data }) => {
  const allCols: { key: keyof ReportData['summary']; label: string }[] = [
    { key: 'overall', label: 'Overall' },
    { key: 'stable', label: 'Stable' },
    { key: 'aggressive', label: 'Aggressive' },
  ];
  const cols = allCols.filter(c => N(data[c.key].trades) > 0);
  const rows: { label: string; fmt: (s: StrategySummary) => string; color?: (s: StrategySummary) => string }[] = [
    { label: 'Total Trades', fmt: s => N(s.trades).toLocaleString() },
    { label: 'Win Rate', fmt: s => fp(s.winRate), color: s => cn(N(s.winRate) - 50) },
    { label: 'Profit Factor', fmt: s => N(s.profitFactor).toFixed(2) + 'x', color: s => cn(N(s.profitFactor) - 1) },
    { label: 'Total PnL', fmt: s => fuSigned(s.totalPnl), color: s => cn(s.totalPnl) },
    { label: 'ROI', fmt: s => (N(s.roi) >= 0 ? '+' : '') + fp(s.roi), color: s => cn(s.roi) },
    { label: 'Max Drawdown', fmt: s => fp(s.maxDrawdown), color: () => 'rpt-red' },
    { label: 'Sharpe Ratio', fmt: s => N(s.sharpeRatio).toFixed(2), color: s => cn(N(s.sharpeRatio) - 1) },
  ];
  return (
    <div className="rpt-section">
      <h2 className="rpt-section-title">Performance Summary</h2>
      <div className="rpt-summary-grid" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
        {cols.map(col => {
          const s = data[col.key];
          return (
            <div key={col.key} className="rpt-summary-col">
              <div className="rpt-summary-col-head">{col.label}</div>
              {rows.map(r => (
                <div key={r.label} className="rpt-summary-row">
                  <span className="rpt-summary-label">{r.label}</span>
                  <span className={`rpt-summary-val ${r.color ? r.color(s) : ''}`}>{r.fmt(s)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const KeyInsightsSection: React.FC<{ insights: string[] }> = ({ insights }) => {
  if (!insights || insights.length === 0) return null;
  return (
    <div className="rpt-section">
      <h2 className="rpt-section-title">Key Insights</h2>
      <div className="rpt-insights-text">
        {insights.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </div>
  );
};

const AIDecisionSection: React.FC<{ data: ReportData['aiDecisionQuality'] }> = ({ data }) => (
  <div className="rpt-section">
    <h2 className="rpt-section-title">AI Decision Quality</h2>
    <div className="rpt-cards-2">
      <div className="rpt-card">
        <div className="rpt-card-title">High Confidence (Score {'>'}= 10)</div>
        <div className="rpt-metric-row">
          <div className="rpt-metric"><div className="rpt-metric-val">{data.highConfTrades}</div><div className="rpt-metric-label">Trades</div></div>
          <div className="rpt-metric"><div className={`rpt-metric-val ${cn(data.highConfWinRate - 50)}`}>{fp(data.highConfWinRate)}</div><div className="rpt-metric-label">Win Rate</div></div>
          <div className="rpt-metric"><div className={`rpt-metric-val ${cn(data.highConfPnl)}`}>{fuSigned(data.highConfPnl)}</div><div className="rpt-metric-label">PnL</div></div>
        </div>
      </div>
      <div className="rpt-card">
        <div className="rpt-card-title">Low Confidence (Score {'<'} 10)</div>
        <div className="rpt-metric-row">
          <div className="rpt-metric"><div className="rpt-metric-val">{data.lowConfTrades}</div><div className="rpt-metric-label">Trades</div></div>
          <div className="rpt-metric"><div className={`rpt-metric-val ${cn(data.lowConfWinRate - 50)}`}>{fp(data.lowConfWinRate)}</div><div className="rpt-metric-label">Win Rate</div></div>
          <div className="rpt-metric"><div className={`rpt-metric-val ${cn(data.lowConfPnl)}`}>{fuSigned(data.lowConfPnl)}</div><div className="rpt-metric-label">PnL</div></div>
        </div>
      </div>
    </div>
    {/* Score段位分布 */}
    {data.scoreBuckets && data.scoreBuckets.length > 0 && (
      <div className="rpt-card" style={{ marginTop: 14 }}>
        <div className="rpt-card-title">Score Distribution — Does Higher Score = Better Result?</div>
        <div className="rpt-tbl-wrap">
          <table>
            <thead><tr><th>Score Range</th><th>Trades</th><th>Win Rate</th><th>Avg PnL%</th><th>Total PnL</th></tr></thead>
            <tbody>
              {data.scoreBuckets.map(b => (
                <tr key={b.bucket}>
                  <td><strong>{b.bucket}</strong></td>
                  <td className="mono">{N(b.trades)}</td>
                  <td className={`mono ${cn(N(b.winRate) - 50)}`}>{fp(b.winRate)}</td>
                  <td className={`mono ${cn(b.avgPnl)}`}>{N(b.avgPnl) > 0 ? '+' : ''}{fp(b.avgPnl)}</td>
                  <td className={`mono ${cn(b.totalPnl)}`}>{fuSigned(b.totalPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {/* 信号源对比 */}
    {data.sourcePerformance && data.sourcePerformance.length > 0 && (
      <div className="rpt-card" style={{ marginTop: 14 }}>
        <div className="rpt-card-title">Signal Source Performance</div>
        <div className="rpt-tbl-wrap">
          <table>
            <thead><tr><th>Source</th><th>Trades</th><th>Win Rate</th><th>PnL</th></tr></thead>
            <tbody>
              {data.sourcePerformance.map(s => (
                <tr key={s.source}>
                  <td><strong>{s.source}</strong></td>
                  <td className="mono">{N(s.trades)}</td>
                  <td className={`mono ${cn(N(s.winRate) - 50)}`}>{fp(s.winRate)}</td>
                  <td className={`mono ${cn(s.pnl)}`}>{fuSigned(s.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {data.weeklyAccuracy.length > 0 && (
      <div className="rpt-chart-wrap" style={{ maxHeight: 220 }}>
        <div className="rpt-card-title">AI Accuracy Trend (Weekly)</div>
        <div style={{ height: 160 }}>
        <Chart type="bar" data={{
          labels: data.weeklyAccuracy.map(w => w.week),
          datasets: [{
            type: 'line' as const, label: 'Win Rate', data: data.weeklyAccuracy.map(w => w.winRate),
            borderColor: '#2563eb', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#2563eb',
            yAxisID: 'y', fill: false, tension: 0.3,
          }, {
            type: 'bar' as const, label: 'Avg Score', data: data.weeklyAccuracy.map(w => w.avgScore),
            backgroundColor: 'rgba(37,99,235,0.15)', borderColor: 'rgba(37,99,235,0.4)',
            borderWidth: 1, borderRadius: 4, yAxisID: 'y1',
          }],
        }} options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: {
            y: { position: 'left', title: { display: true, text: 'Win Rate %', font: { size: 10 } }, ticks: { font: { size: 10 } } },
            y1: { position: 'right', grid: { display: false }, title: { display: true, text: 'Avg Score', font: { size: 10 } }, ticks: { font: { size: 10 } } },
            x: { ticks: { font: { size: 10 } } },
          },
        }} />
        </div>
      </div>
    )}
  </div>
);

const AIRiskShieldSection: React.FC<{ data: ReportData['aiRiskShield'] }> = ({ data }) => (
  <div className="rpt-section">
    <h2 className="rpt-section-title">AI Risk Shield</h2>
    <div className="rpt-cards-4">
      <div className="rpt-stat-card">
        <div className="rpt-stat-val">{data.signalsScanned.toLocaleString()}</div>
        <div className="rpt-stat-label">Signals Scanned</div>
      </div>
      <div className="rpt-stat-card">
        <div className="rpt-stat-val">{data.tradesBlocked.toLocaleString()}</div>
        <div className="rpt-stat-label">Trades Blocked</div>
      </div>
      <div className="rpt-stat-card">
        <div className={`rpt-stat-val ${data.blockAccuracy >= 70 ? 'rpt-green' : ''}`}>{fp(data.blockAccuracy)}</div>
        <div className="rpt-stat-label">Block Accuracy</div>
      </div>
      <div className="rpt-stat-card">
        <div className="rpt-stat-val rpt-green">{fu(data.capitalSaved)}</div>
        <div className="rpt-stat-label">Capital Saved</div>
      </div>
    </div>
    {data.topRules.length > 0 && (
      <div className="rpt-tbl-wrap">
        <table>
          <thead><tr><th>Rule</th><th>Blocked</th><th>Accuracy</th></tr></thead>
          <tbody>
            {data.topRules.map(r => (
              <tr key={r.rule}>
                <td>{r.rule}</td>
                <td className="mono">{r.blocked}</td>
                <td className={`mono ${r.accuracy >= 70 ? 'rpt-green' : r.accuracy < 50 ? 'rpt-red' : ''}`}>{fp(r.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const AIMarketAdaptationSection: React.FC<{ data: ReportData['aiMarketAdaptation'] }> = ({ data }) => {
  const regimes = ['Bull', 'Neutral', 'Bear'];
  return (
    <div className="rpt-section">
      <h2 className="rpt-section-title">AI Market Adaptation</h2>
      <p className="rpt-section-desc">How AI adjusts LONG/SHORT ratio across different BTC market environments</p>
      <div className="rpt-cards-3">
        {regimes.map(regime => {
          const items = data.regimeDirection.filter(r => r.regime === regime);
          const total = items.reduce((s, i) => s + N(i.trades), 0);
          return (
            <div key={regime} className="rpt-card">
              <div className="rpt-card-title">{regime} Market</div>
              {items.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 12 }}>No trades</div> : (
                <div>
                  {items.map(i => {
                    const pct = total > 0 ? ((N(i.trades) / total) * 100).toFixed(0) : '0';
                    return (
                      <div key={i.direction} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid #f1f5f9' }}>
                        <span><span className={`rpt-dir-badge rpt-dir-${i.direction.toLowerCase()}`}>{i.direction}</span> {pct}%</span>
                        <span className="mono">{N(i.trades)} trades</span>
                        <span className={`mono ${cn(i.winRate - 50)}`}>{fp(i.winRate)}</span>
                        <span className={`mono ${cn(i.pnl)}`}>{fuSigned(i.pnl)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MarketRegimeSection: React.FC<{ data: ReportData['marketRegime'] }> = ({ data }) => (
  <div className="rpt-section">
    <h2 className="rpt-section-title">Market Regime Performance</h2>
    <div className="rpt-cards-3">
      {data.map(r => (
        <div key={r.regime} className="rpt-card">
          <div className="rpt-card-title">{r.regime}</div>
          <div className="rpt-metric-row">
            <div className="rpt-metric"><div className="rpt-metric-val">{r.trades}</div><div className="rpt-metric-label">Trades</div></div>
            <div className="rpt-metric"><div className={`rpt-metric-val ${cn(r.winRate - 50)}`}>{fp(r.winRate)}</div><div className="rpt-metric-label">Win Rate</div></div>
            <div className="rpt-metric"><div className={`rpt-metric-val ${cn(r.pnl)}`}>{fuSigned(r.pnl)}</div><div className="rpt-metric-label">PnL</div></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const DirectionSection: React.FC<{ data: ReportData['direction'] }> = ({ data }) => (
  <div className="rpt-section">
    <h2 className="rpt-section-title">Direction Breakdown</h2>
    <div className="rpt-cards-2">
      {data.map(d => (
        <div key={d.direction} className="rpt-card">
          <div className="rpt-card-title"><span className={`rpt-dir-badge rpt-dir-${d.direction.toLowerCase()}`}>{d.direction}</span></div>
          <div className="rpt-metric-row">
            <div className="rpt-metric"><div className="rpt-metric-val">{d.trades}</div><div className="rpt-metric-label">Trades</div></div>
            <div className="rpt-metric"><div className={`rpt-metric-val ${cn(d.winRate - 50)}`}>{fp(d.winRate)}</div><div className="rpt-metric-label">Win Rate</div></div>
            <div className="rpt-metric"><div className={`rpt-metric-val ${cn(d.pnl)}`}>{fuSigned(d.pnl)}</div><div className="rpt-metric-label">PnL</div></div>
            <div className="rpt-metric"><div className="rpt-metric-val">{d.avgHoldMin}m</div><div className="rpt-metric-label">Avg Hold</div></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const TokenSection: React.FC<{ data: ReportData['tokenLeaderboard'] }> = ({ data }) => {
  const [tab, setTab] = useState<'top' | 'bottom'>('top');
  const list = tab === 'top' ? data.top : data.bottom;
  return (
    <div className="rpt-section">
      <div className="rpt-section-head-row">
        <h2 className="rpt-section-title">Token Leaderboard</h2>
        <div className="rpt-tab-group">
          <button className={tab === 'top' ? 'active' : ''} onClick={() => setTab('top')}>Top Profit</button>
          <button className={tab === 'bottom' ? 'active' : ''} onClick={() => setTab('bottom')}>Top Loss</button>
        </div>
      </div>
      <div className="rpt-tbl-wrap">
        <table>
          <thead><tr><th>Token</th><th>Trades</th><th>Win Rate</th><th>PnL</th></tr></thead>
          <tbody>
            {list.map(t => (
              <tr key={t.symbol}>
                <td><strong>{t.symbol.replace('USDT', '')}</strong></td>
                <td className="mono">{t.trades}</td>
                <td className={`mono ${cn(t.winRate - 50)}`}>{fp(t.winRate)}</td>
                <td className={`mono ${cn(t.pnl)}`}>{fuSigned(t.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DurationExitSection: React.FC<{ duration: ReportData['durationAnalysis']; exit: ReportData['exitAnalysis'] }> = ({ duration, exit }) => (
  <div className="rpt-section">
    <h2 className="rpt-section-title">Duration & Exit Analysis</h2>
    <div className="rpt-cards-2">
      <div className="rpt-card">
        <div className="rpt-card-title">By Hold Duration</div>
        <div className="rpt-tbl-wrap">
          <table>
            <thead><tr><th>Duration</th><th>Trades</th><th>Win Rate</th><th>Avg PnL</th></tr></thead>
            <tbody>
              {duration.map(d => (
                <tr key={d.bucket}>
                  <td>{d.bucket}</td>
                  <td className="mono">{d.trades}</td>
                  <td className={`mono ${cn(d.winRate - 50)}`}>{fp(d.winRate)}</td>
                  <td className={`mono ${cn(d.avgPnl)}`}>{d.avgPnl > 0 ? '+' : ''}{fp(d.avgPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rpt-card">
        <div className="rpt-card-title">By Exit Type</div>
        {exit.length > 0 && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 140, height: 140 }}>
              <Doughnut data={{
                labels: exit.map(e => e.type),
                datasets: [{ data: exit.map(e => e.count), backgroundColor: ['#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#8b5cf6', '#94a3b8'], borderWidth: 0 }],
              }} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }} />
            </div>
            <div className="rpt-tbl-wrap" style={{ flex: 1 }}>
              <table>
                <thead><tr><th>Type</th><th>Count</th><th>%</th><th>Avg PnL</th></tr></thead>
                <tbody>
                  {exit.map(e => (
                    <tr key={e.type}>
                      <td>{e.type}</td>
                      <td className="mono">{e.count}</td>
                      <td className="mono">{fp(e.pct)}</td>
                      <td className={`mono ${cn(e.avgPnl)}`}>{e.avgPnl > 0 ? '+' : ''}{fp(e.avgPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);

const TimeSection: React.FC<{ data: ReportData['timePerformance'] }> = ({ data }) => {
  const maxTrades = Math.max(...data.map(d => d.trades), 1);
  return (
    <div className="rpt-section">
      <h2 className="rpt-section-title">Time Performance (UTC)</h2>
      <div className="rpt-heatmap">
        {data.map(h => {
          const intensity = h.trades / maxTrades;
          const wrColor = h.winRate >= 65 ? '#16a34a' : h.winRate >= 50 ? '#f59e0b' : '#dc2626';
          return (
            <div key={h.hour} className="rpt-heat-cell" title={`${h.hour}:00 — ${h.trades} trades, ${fp(h.winRate)} WR, ${fuSigned(h.pnl)}`}>
              <div className="rpt-heat-hour">{String(h.hour).padStart(2, '0')}</div>
              <div className="rpt-heat-bar" style={{ height: `${Math.max(intensity * 100, 8)}%`, background: wrColor, opacity: 0.3 + intensity * 0.7 }} />
              <div className="rpt-heat-wr" style={{ color: wrColor }}>{h.trades > 0 ? fp(h.winRate, 0) : '-'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RiskSection: React.FC<{ data: ReportData['riskMetrics'] }> = ({ data }) => (
  <div className="rpt-section">
    <h2 className="rpt-section-title">Risk Metrics</h2>
    <div className="rpt-cards-3">
      <div className="rpt-stat-card">
        <div className="rpt-stat-val rpt-red">{fp(data.maxDrawdown)}</div>
        <div className="rpt-stat-label">Max Drawdown</div>
        <div className="rpt-stat-sub">{data.maxDrawdownDuration}d duration</div>
      </div>
      <div className="rpt-stat-card">
        <div className={`rpt-stat-val ${data.recoveryFactor >= 3 ? 'rpt-green' : ''}`}>{data.recoveryFactor.toFixed(1)}x</div>
        <div className="rpt-stat-label">Recovery Factor</div>
        <div className="rpt-stat-sub">{data.recoveryFactor >= 3 ? 'Strong' : data.recoveryFactor >= 1.5 ? 'Moderate' : 'Weak'}</div>
      </div>
      <div className="rpt-stat-card">
        <div className="rpt-stat-val">{fp(data.avgRiskPerTrade)}</div>
        <div className="rpt-stat-label">Avg Risk / Trade</div>
      </div>
    </div>
    <div className="rpt-cards-2" style={{ marginTop: 12 }}>
      <div className="rpt-stat-card">
        <div className="rpt-stat-val rpt-green">{fuSigned(data.bestDay)}</div>
        <div className="rpt-stat-label">Best Day</div>
      </div>
      <div className="rpt-stat-card">
        <div className="rpt-stat-val rpt-red">{fuSigned(data.worstDay)}</div>
        <div className="rpt-stat-label">Worst Day</div>
      </div>
    </div>
  </div>
);

const AILearningSection: React.FC<{ data: ReportData['aiLearning'] }> = ({ data }) => (
  <div className="rpt-section">
    <h2 className="rpt-section-title">AI Learning Progress</h2>
    <div className="rpt-cards-2" style={{ marginBottom: 16 }}>
      <div className="rpt-stat-card">
        <div className="rpt-stat-val">{data.modelVersion}</div>
        <div className="rpt-stat-label">Model Version</div>
      </div>
      <div className="rpt-stat-card">
        <div className="rpt-stat-val">{data.lastRetrained}</div>
        <div className="rpt-stat-label">Last Retrained</div>
      </div>
    </div>
    {data.weeklyProgress.length > 0 && (
      <div className="rpt-chart-wrap" style={{ maxHeight: 240 }}>
        <div style={{ height: 180 }}>
        <Chart type="bar" data={{
          labels: data.weeklyProgress.map(w => w.week),
          datasets: [{
            type: 'line' as const, label: 'Win Rate %', data: data.weeklyProgress.map(w => w.winRate),
            borderColor: '#16a34a', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#16a34a',
            yAxisID: 'y', fill: false, tension: 0.3,
          }, {
            type: 'line' as const, label: 'Avg Loss %', data: data.weeklyProgress.map(w => Math.abs(w.avgLoss)),
            borderColor: '#dc2626', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#dc2626',
            yAxisID: 'y', fill: false, tension: 0.3, borderDash: [4, 4],
          }, {
            type: 'bar' as const, label: 'Profit Factor', data: data.weeklyProgress.map(w => w.profitFactor),
            backgroundColor: 'rgba(37,99,235,0.15)', borderColor: 'rgba(37,99,235,0.4)',
            borderWidth: 1, borderRadius: 4, yAxisID: 'y1',
          }],
        }} options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: {
            y: { position: 'left', title: { display: true, text: '%', font: { size: 10 } }, ticks: { font: { size: 10 } } },
            y1: { position: 'right', grid: { display: false }, title: { display: true, text: 'PF', font: { size: 10 } }, ticks: { font: { size: 10 } } },
            x: { ticks: { font: { size: 10 } } },
          },
        }} />
        </div>
      </div>
    )}
    {/* 维度准确率排行 */}
    {data.dimAccuracy && data.dimAccuracy.length > 0 && (
      <div className="rpt-card" style={{ marginTop: 14 }}>
        <div className="rpt-card-title">AI Voting Dimension Accuracy (Top 15, min 20 samples)</div>
        <div className="rpt-tbl-wrap">
          <table>
            <thead><tr><th>Dimension</th><th>Samples</th><th>Accuracy</th><th style={{ width: '40%' }}></th></tr></thead>
            <tbody>
              {data.dimAccuracy.map(d => (
                <tr key={d.dim}>
                  <td><strong>{d.dim}</strong></td>
                  <td className="mono">{d.total}</td>
                  <td className={`mono ${N(d.accuracy) >= 60 ? 'rpt-green' : N(d.accuracy) < 45 ? 'rpt-red' : ''}`}>{fp(d.accuracy)}</td>
                  <td>
                    <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(N(d.accuracy), 100)}%`, height: '100%', borderRadius: 4,
                        background: N(d.accuracy) >= 60 ? '#16a34a' : N(d.accuracy) >= 45 ? '#f59e0b' : '#dc2626',
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
);

// ── HL Regime Map ──
interface HLRegimeData {
  btcTrend: string; regime: string; archetype: string; note: string;
  longs: number; shorts: number; opens: number; longBias: number;
  signal: 'long' | 'short' | 'neutral'; score: number;
  archetypes: { archetype: string; longs: number; shorts: number; total: number; bias: number }[];
}

const HLRegimeSection: React.FC = () => {
  const [d, setD] = useState<HLRegimeData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.get('/paper-trade/hl-regime')
      .then(res => setD(res.data.data))
      .catch(() => setErr(true));
  }, []);

  const regimeLabel: Record<string, string> = {
    BTC_PUMP: 'BTC Uptrend', BTC_DUMP: 'BTC Downtrend', BTC_RANGE: 'BTC Sideways',
  };
  const archetypeLabel: Record<string, string> = {
    TREND_LONG: 'Trend Long', TREND_SHORT: 'Trend Short', XYZ_SPECIALIST: 'XYZ Specialist',
    SWING: 'Swing', HYPE_SPECIALIST: 'Hype Specialist', MULTI_MARKET: 'Multi Market',
    SCALPING: 'Scalping', REVERSAL: 'Reversal',
  };

  return (
    <div className="rpt-section">
      <h2 className="rpt-section-title">HL Trader Regime Map</h2>
      <p className="rpt-section-desc" style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16, marginTop: -8 }}>
        AI analysis of on-chain trading behavior across decentralized exchanges. Identifies which trader archetype has structural edge in the current BTC market regime, and how they are positioned right now.
      </p>

      {err && <div style={{ color: '#94a3b8', fontSize: 13 }}>Data unavailable</div>}
      {!err && !d && <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</div>}

      {d && (<>
        {/* Signal banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px',
          borderRadius: 10, marginBottom: 18,
          background: d.signal === 'long' ? '#f0fdf4' : d.signal === 'short' ? '#fff1f2' : '#f8fafc',
          border: `1.5px solid ${d.signal === 'long' ? '#86efac' : d.signal === 'short' ? '#fca5a5' : '#e2e8f0'}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              Current Regime
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', fontFamily: 'JetBrains Mono, monospace' }}>
              {regimeLabel[d.regime] || d.regime}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              Edge Archetype
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', fontFamily: 'JetBrains Mono, monospace' }}>
              {archetypeLabel[d.archetype] || d.archetype}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{d.note}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              4h Directional Bias
            </div>
            {d.opens >= 5 ? (<>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', width: '100%', maxWidth: 180 }}>
                <div style={{ width: `${d.longBias}%`, background: '#22c55e' }} />
                <div style={{ width: `${100 - d.longBias}%`, background: '#ef4444' }} />
              </div>
              <div style={{ fontSize: 11, marginTop: 4, color: '#64748b' }}>
                Long {d.longs} / Short {d.shorts}
              </div>
            </>) : (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Insufficient data ({d.opens} opens)</div>
            )}
          </div>
          <div style={{
            padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            background: d.signal === 'long' ? '#16a34a' : d.signal === 'short' ? '#dc2626' : '#e2e8f0',
            color: d.signal === 'neutral' ? '#94a3b8' : '#fff',
          }}>
            {d.signal === 'long' ? '▲ LONG BIAS' : d.signal === 'short' ? '▼ SHORT BIAS' : '─ NEUTRAL'}
          </div>
        </div>

        {/* Archetype breakdown table */}
        {d.archetypes.length > 0 && (
          <div className="rpt-tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Archetype</th>
                  <th>Long Opens</th>
                  <th>Short Opens</th>
                  <th>Long Bias</th>
                  <th>4h Activity</th>
                </tr>
              </thead>
              <tbody>
                {d.archetypes.map(a => {
                  const aOpens = a.longs + a.shorts;
                  return (
                    <tr key={a.archetype} style={{ background: a.archetype === d.archetype ? '#eff6ff' : undefined }}>
                      <td>
                        <strong style={{ color: a.archetype === d.archetype ? '#2563eb' : undefined }}>
                          {archetypeLabel[a.archetype] || a.archetype}
                        </strong>
                        {a.archetype === d.archetype && (
                          <span style={{ marginLeft: 6, fontSize: 10, background: '#dbeafe', color: '#2563eb', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>EDGE</span>
                        )}
                      </td>
                      <td className="mono rpt-green">{a.longs}</td>
                      <td className="mono rpt-red">{a.shorts}</td>
                      <td className="mono">
                        {aOpens > 0 ? (
                          <span style={{ color: a.bias > 60 ? '#16a34a' : a.bias < 40 ? '#dc2626' : '#64748b' }}>
                            {a.bias}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="mono">{a.total} fills</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </>)}
    </div>
  );
};

// ── Main Page ──
const ReportPage: React.FC = () => {
  const [period, setPeriod] = useState<Period>('all');
  const [strategy, setStrategy] = useState<'all' | PaperTradeStrategy>('all');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get('/paper-trade/report', { params: { period, strategy } })
      .then(res => setData(res.data.data))
      .catch(e => setError(e.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [period, strategy]);

  if (loading) return <div className="rpt-loading"><div className="rpt-spinner" /><span>Generating report...</span></div>;
  if (error || !data) return <div className="rpt-loading"><span className="rpt-error">{error || 'No data available'}</span></div>;

  return (
    <div className="rpt-wrap">
      {/* Header */}
      <div className="rpt-header">
        <div className="rpt-header-left">
          <h1><span>//</span> Trading Analytics Report</h1>
          <div className="rpt-subtitle">Galeon Brain AI Trading System Performance Analysis</div>
        </div>
        <div className="rpt-header-controls">
          <div className="rpt-btn-group">
            {(['7d', '30d', '90d', 'all'] as Period[]).map(p => (
              <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
                {p === 'all' ? 'ALL' : p.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="rpt-btn-group">
            {(['all', 'stable', 'aggressive'] as const).map(s => (
              <button key={s} className={strategy === s ? 'active' : ''} onClick={() => setStrategy(s)}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sections */}
      <SummarySection data={data.summary} />
      <KeyInsightsSection insights={data.keyInsights} />
      <AIDecisionSection data={data.aiDecisionQuality} />
      <AIRiskShieldSection data={data.aiRiskShield} />
      {data.aiMarketAdaptation && <AIMarketAdaptationSection data={data.aiMarketAdaptation} />}
      <MarketRegimeSection data={data.marketRegime} />
      <HLRegimeSection />
      <DirectionSection data={data.direction} />
      <TokenSection data={data.tokenLeaderboard} />
      <DurationExitSection duration={data.durationAnalysis} exit={data.exitAnalysis} />
      <TimeSection data={data.timePerformance} />
      <RiskSection data={data.riskMetrics} />
      <AILearningSection data={data.aiLearning} />

      <div className="rpt-footer">
        Generated by Galeon Brain AI · {new Date().toLocaleString()}
      </div>
    </div>
  );
};

export default ReportPage;

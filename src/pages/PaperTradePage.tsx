import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, Tooltip, Filler, Plugin } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { paperTradeService } from '../services/paperTradeService';
import {
  PaperTradeOverview, PaperTradePosition, PaperTradeHistoryItem, CapitalHistoryItem,
  PaperTradeStrategy,
} from '../types/paperTrade';
import './PaperTradePage.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, LineController, Tooltip, Filler);

const PER = 10;

function fu(n: number | null | undefined) {
  if (n == null) return '-';
  return '$' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function f(n: number | null | undefined, d = 2) {
  if (n == null) return '-';
  return Number(n).toFixed(d);
}

// ── Health dots ──────────────────────────────────────────────
const HealthDots: React.FC<{ health: number }> = ({ health: h }) => {
  const dots = Array.from({ length: 5 }, (_, i) => {
    if (h >= 3 && i >= 3) return 'on-g';
    if (h >= 1 && i >= 2) return 'on-g';
    if (h <= -3 && i <= 1) return 'on-r';
    if (h <= -1 && i <= 2) return 'on-r';
    if (h === 0 && i === 2) return 'on-y';
    return '';
  });
  return (
    <div className="pt2-health">
      {dots.map((c, i) => <div key={i} className={`pt2-health-dot ${c}`} />)}
    </div>
  );
};

// ── Positions table ──────────────────────────────────────────
const PositionsTable: React.FC<{ positions: PaperTradePosition[]; isSpot: boolean; label: string }> = ({ positions, isSpot, label }) => {
  if (!positions.length) return (
    <div className="pt2-section">
      <div className="pt2-section-head"><h2>{label}</h2></div>
      <div className="pt2-empty">No open positions</div>
    </div>
  );
  return (
    <div className="pt2-section">
      <div className="pt2-section-head">
        <h2>{label}</h2>
        <span className="pt2-count">{positions.length}</span>
      </div>
      <div className="pt2-tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Dir</th><th>Token</th>
              {!isSpot && <th>Lev</th>}
              <th>Margin</th><th>Entry</th><th>Mark</th><th>SL</th>
              <th>PnL</th><th>Health</th><th>Conf</th><th>Entered</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(p => {
              const dir = isSpot ? 'BUY' : p.direction;
              const lev = p.leverage || 1;
              const uPct = p.unrealizedPnlPct || 0;
              const uPnl = p.marginUsed > 0 ? (uPct / 100) * p.marginUsed : null;
              return (
                <tr key={p.id}>
                  <td><span className={`pt2-badge pt2-badge-${dir.toLowerCase()}`}>{dir}</span></td>
                  <td><strong>{p.tokenSymbol}</strong></td>
                  {!isSpot && <td className="mono">{lev}x</td>}
                  <td className="mono">{fu(p.marginUsed)}</td>
                  <td className="mono">{f(p.entryPrice, 6)}</td>
                  <td className="mono">{f(p.markPrice, 6)}</td>
                  <td className="mono dim">{f(p.slCurrent || p.stopLoss, 6)}</td>
                  <td className={uPct >= 0 ? 'up' : 'down'}>
                    {uPnl != null && <><strong className="mono">{fu(uPnl)}</strong><br /></>}
                    <span className="mono" style={{ fontSize: 10 }}>{uPct >= 0 ? '+' : ''}{f(uPct)}%</span>
                  </td>
                  <td><HealthDots health={p.health || 0} /></td>
                  <td className="mono dim">{f(p.confidence, 1)}</td>
                  <td className="dim" style={{ fontSize: 10 }}>{new Date(p.enteredAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Trades table ─────────────────────────────────────────────
const TradesTable: React.FC<{ trades: PaperTradeHistoryItem[]; isSpot: boolean; label: string }> = ({ trades, isSpot, label }) => {
  const [page, setPage] = useState(1);
  const all = [...trades].sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
  const tp = Math.ceil(all.length / PER) || 1;
  const sl = all.slice((page - 1) * PER, page * PER);

  if (!all.length) return (
    <div className="pt2-section">
      <div className="pt2-section-head"><h2>{label}</h2></div>
      <div className="pt2-empty">No trades yet</div>
    </div>
  );

  const maxShow = 7;
  let start = Math.max(1, page - 3);
  let end = Math.min(tp, start + maxShow - 1);
  if (end - start < maxShow - 1) start = Math.max(1, end - maxShow + 1);
  const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <div className="pt2-section">
      <div className="pt2-section-head">
        <h2>{label}</h2>
        <span className="pt2-count">{all.length}</span>
      </div>
      <div className="pt2-tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Dir</th><th>Token</th>
              {!isSpot && <th>Lev</th>}
              <th>Entry</th><th>Exit</th><th>PnL</th><th>PnL%</th>
              <th></th><th>Reason</th><th>Entered</th><th>Closed</th>
            </tr>
          </thead>
          <tbody>
            {sl.map(t => {
              const w = t.pnl > 0;
              const tdir = isSpot ? 'BUY' : t.direction;
              return (
                <tr key={t.id}>
                  <td><span className={`pt2-badge pt2-badge-${tdir.toLowerCase()}`}>{tdir}</span></td>
                  <td><strong>{t.tokenSymbol}</strong></td>
                  {!isSpot && <td className="mono">{t.leverage}x</td>}
                  <td className="mono">{f(t.entryPrice, 6)}</td>
                  <td className="mono">{f(t.exitPrice, 6)}</td>
                  <td className={w ? 'up' : 'down'}><strong className="mono">{fu(t.pnl)}</strong></td>
                  <td className={`mono ${w ? 'up' : 'down'}`}>{f(t.pnlPct)}%</td>
                  <td><span className={`pt2-badge pt2-badge-${w ? 'win' : 'loss'}`}>{w ? 'WIN' : 'LOSS'}</span></td>
                  <td className="dim" style={{ fontSize: 10, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.exitReason}</td>
                  <td className="dim" style={{ fontSize: 10 }}>{new Date(t.enteredAt).toLocaleString()}</td>
                  <td className="dim" style={{ fontSize: 10 }}>{t.closedAt ? new Date(t.closedAt).toLocaleString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pt2-pagi">
          <div className="pt2-pagi-info">Showing {(page - 1) * PER + 1}–{Math.min(page * PER, all.length)} of {all.length}</div>
          <div className="pt2-pagi-btns">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            {pageNums.map(n => <button key={n} className={n === page ? 'act' : ''} onClick={() => setPage(n)}>{n}</button>)}
            {end < tp && <button onClick={() => setPage(tp)}>{tp}</button>}
            <button onClick={() => setPage(p => Math.min(tp, p + 1))} disabled={page >= tp}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────
// ── Capital Chart ──
const CapitalChart: React.FC<{ data: CapitalHistoryItem[]; startCapital: number }> = ({ data, startCapital }) => {
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('all');

  const filtered = range === 'all' ? data
    : range === '30d' ? data.slice(-30)
    : data.slice(-7);

  // AI Stats calculations
  const stats = useMemo(() => {
    if (filtered.length === 0) return { profitFactor: 0, maxDrawdown: 0, winStreak: 0, aiConfidence: 0, streakType: 'win' as const };
    const totalGrossWin = filtered.reduce((s, d) => s + (d.dailyPnl > 0 ? d.dailyPnl : 0), 0);
    const totalGrossLoss = filtered.reduce((s, d) => s + (d.dailyPnl < 0 ? Math.abs(d.dailyPnl) : 0), 0);
    const pf = totalGrossLoss > 0 ? +(totalGrossWin / totalGrossLoss).toFixed(2) : (totalGrossWin > 0 ? 99 : 0);
    const maxDd = Math.min(...filtered.map(d => d.drawdownPct || 0));

    // Win/Loss streak
    let streak = 0;
    let streakType: 'win' | 'loss' = 'win';
    for (let i = filtered.length - 1; i >= 0; i--) {
      if (i === filtered.length - 1) { streakType = filtered[i].dailyPnl >= 0 ? 'win' : 'loss'; }
      if ((streakType === 'win' && filtered[i].dailyPnl >= 0) || (streakType === 'loss' && filtered[i].dailyPnl < 0)) streak++;
      else break;
    }

    // AI Confidence: based on recent 7d win rate + profit factor
    const recent7 = filtered.slice(-7);
    const r7Wins = recent7.filter(d => d.dailyPnl > 0).length;
    const r7WR = recent7.length > 0 ? r7Wins / recent7.length : 0;
    const r7Pf = recent7.reduce((s, d) => s + (d.dailyPnl > 0 ? d.dailyPnl : 0), 0)
      / Math.max(1, recent7.reduce((s, d) => s + (d.dailyPnl < 0 ? Math.abs(d.dailyPnl) : 0), 0));
    const confidence = Math.min(99, Math.round(r7WR * 50 + Math.min(r7Pf, 3) * 16.7));

    return { profitFactor: pf, maxDrawdown: maxDd, winStreak: streak, streakType, aiConfidence: confidence };
  }, [filtered]);

  const isUp = filtered.length > 0 && filtered[filtered.length - 1].capital >= startCapital;
  const lineColor = isUp ? '#16a34a' : '#dc2626';

  // Baseline plugin
  const baselinePlugin: Plugin = useMemo(() => ({
    id: 'baseline',
    beforeDraw: (chart: any) => {
      const yScale = chart.scales.y;
      if (!yScale) return;
      const yPos = yScale.getPixelForValue(startCapital);
      const ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chart.chartArea.left, yPos);
      ctx.lineTo(chart.chartArea.right, yPos);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.fillText(`Start $${startCapital.toLocaleString()}`, chart.chartArea.right - 80, yPos - 4);
      ctx.restore();
    },
  }), [startCapital]);

  const labels = filtered.map(d => {
    const dt = new Date(d.date);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  });

  const confColor = stats.aiConfidence >= 70 ? '#16a34a' : stats.aiConfidence >= 40 ? '#f59e0b' : '#dc2626';

  return (
    <div className="pt2-section">
      <div className="pt2-section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>CAPITAL CURVE</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['7d', '30d', 'all'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
                border: range === r ? '1px solid #2563eb' : '1px solid #d1d5db',
                background: range === r ? '#eff6ff' : '#fff',
                color: range === r ? '#2563eb' : '#64748b',
              }}>
              {r === '7d' ? '7D' : r === '30d' ? '30D' : 'ALL'}
            </button>
          ))}
        </div>
      </div>

      {/* AI Stats Cards — uses pt2-stat-card class for consistency */}
      <div className="pt2-curve-stats">
        <div className="pt2-stat-card">
          <div className="s-label">Profit Factor</div>
          <div className={`s-val ${stats.profitFactor >= 1.5 ? 'green' : stats.profitFactor >= 1 ? '' : 'red'}`}>
            {stats.profitFactor >= 99 ? '---' : stats.profitFactor.toFixed(2)}x
          </div>
          <div className="s-sub">{stats.profitFactor >= 1.5 ? 'Strong' : stats.profitFactor >= 1 ? 'Marginal' : 'Losing'}</div>
        </div>
        <div className="pt2-stat-card">
          <div className="s-label">Max Drawdown</div>
          <div className={`s-val ${stats.maxDrawdown > -5 ? 'green' : stats.maxDrawdown > -15 ? '' : 'red'}`}>
            {stats.maxDrawdown.toFixed(1)}%
          </div>
          <div className="s-sub">{stats.maxDrawdown > -5 ? 'Low Risk' : stats.maxDrawdown > -15 ? 'Moderate' : 'High Risk'}</div>
        </div>
        <div className="pt2-stat-card">
          <div className="s-label">{stats.streakType === 'win' ? 'Win Streak' : 'Loss Streak'}</div>
          <div className={`s-val ${stats.streakType === 'win' ? 'green' : 'red'}`}>
            {stats.winStreak}D
          </div>
          <div className="s-sub">Consecutive days</div>
        </div>
        <div className="pt2-stat-card pt2-ai-conf">
          <div className="s-label">AI Confidence</div>
          <div className={`s-val ${stats.aiConfidence >= 70 ? 'green' : stats.aiConfidence >= 40 ? '' : 'red'}`}>
            {stats.aiConfidence}
          </div>
          <div className="wr-bar"><div style={{ width: `${stats.aiConfidence}%`, background: confColor }} /></div>
        </div>
      </div>

      {/* Chart: Capital Line + Daily PnL Bars */}
      <div style={{ background: '#fff', borderRadius: 8, padding: '12px 8px', border: '1px solid #e8e8ec' }}>
        <Chart
          type="bar"
          plugins={[baselinePlugin]}
          data={{
            labels,
            datasets: [
              {
                type: 'line' as const,
                label: 'Capital',
                data: filtered.map(d => d.capital),
                borderColor: lineColor,
                backgroundColor: isUp ? 'rgba(22,163,74,0.04)' : 'rgba(220,38,38,0.04)',
                borderWidth: 2,
                pointRadius: filtered.length > 30 ? 0 : 3,
                pointHoverRadius: 5,
                pointBackgroundColor: lineColor,
                fill: true,
                tension: 0.3,
                yAxisID: 'y',
                order: 1,
              },
              {
                type: 'bar' as const,
                label: 'Daily PnL',
                data: filtered.map(d => d.dailyPnl),
                backgroundColor: filtered.map(d => d.dailyPnl >= 0 ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)'),
                borderColor: filtered.map(d => d.dailyPnl >= 0 ? 'rgba(22,163,74,0.6)' : 'rgba(220,38,38,0.6)'),
                borderWidth: 1,
                borderRadius: 2,
                yAxisID: 'y1',
                order: 2,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                enabled: false,
                external: (context) => {
                  const { chart, tooltip } = context;
                  const parent = chart.canvas.parentNode as HTMLElement;
                  if (parent) parent.style.position = 'relative';
                  let el = parent?.querySelector('.pt2-chart-tooltip') as HTMLDivElement;
                  if (!el) {
                    el = document.createElement('div');
                    el.className = 'pt2-chart-tooltip';
                    el.style.cssText = 'position:absolute;pointer-events:none;background:#1a1a2e;color:#e2e8f0;border-radius:10px;padding:12px 16px;font-size:12px;line-height:1.9;z-index:99;transition:opacity 0.15s;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,0.35);backdrop-filter:blur(8px)';
                    parent?.appendChild(el);
                  }
                  if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }
                  const idx = tooltip.dataPoints?.[0]?.dataIndex ?? 0;
                  const item = filtered[idx];
                  if (!item) { el.style.opacity = '0'; return; }
                  const dt = new Date(item.date);
                  const dateStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
                  const cap = item.capital;
                  const pnl = item.dailyPnl;
                  const pnlColor = pnl >= 0 ? '#4ade80' : '#f87171';
                  const totalPnl = cap - startCapital;
                  const totalPct = (totalPnl / startCapital * 100).toFixed(2);
                  const totalColor = totalPnl >= 0 ? '#4ade80' : '#f87171';
                  // winCount/lossCount are cumulative totals, compute daily delta
                  const prevItem = idx > 0 ? filtered[idx - 1] : null;
                  const dayWins = prevItem ? item.winCount - prevItem.winCount : item.winCount;
                  const dayLosses = prevItem ? item.lossCount - prevItem.lossCount : item.lossCount;
                  const dayTrades = dayWins + dayLosses;
                  const wr = dayTrades > 0 ? (dayWins / dayTrades * 100).toFixed(0) : '0';
                  const qualityPct = dayTrades > 0 ? (Number(item.qualityExits || 0) / dayTrades * 100).toFixed(0) : '0';

                  el.innerHTML = `<div style="font-weight:700;margin-bottom:4px;font-size:13px;color:#93c5fd">${dateStr}</div>`
                    + `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#94a3b8">Capital</span><b>$${cap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>`
                    + `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#94a3b8">Total Return</span><b style="color:${totalColor}">${totalPnl >= 0 ? '+' : ''}${totalPct}%</b></div>`
                    + `<div style="border-top:1px solid rgba(255,255,255,0.1);margin:4px 0"></div>`
                    + `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#94a3b8">Day PnL</span><b style="color:${pnlColor}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</b></div>`
                    + `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#94a3b8">Trades</span><b>${dayWins}W / ${dayLosses}L</b></div>`
                    + `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#94a3b8">Win Rate</span><b style="color:${Number(wr) >= 60 ? '#4ade80' : Number(wr) >= 50 ? '#fbbf24' : '#f87171'}">${wr}%</b></div>`
                    + `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#94a3b8">Signal Quality</span><b style="color:#93c5fd">${qualityPct}%</b></div>`
                    + (item.drawdownPct < -1 ? `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#94a3b8">Drawdown</span><b style="color:#f87171">${item.drawdownPct.toFixed(1)}%</b></div>` : '');
                  el.style.opacity = '1';
                  const left = Math.min(tooltip.caretX, (parent?.offsetWidth || 400) - 220);
                  el.style.left = Math.max(10, left) + 'px';
                  el.style.top = (tooltip.caretY - el.offsetHeight - 12) + 'px';
                },
              },
            },
            scales: {
              x: {
                ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: filtered.length > 30 ? 10 : 20 },
                grid: { display: false },
              },
              y: {
                type: 'linear',
                position: 'left',
                ticks: { color: '#94a3b8', font: { size: 10 }, callback: (v) => `$${Number(v).toLocaleString()}` },
                grid: { color: '#f1f5f9' },
              },
              y1: {
                type: 'linear',
                position: 'right',
                ticks: { color: '#94a3b8', font: { size: 9 }, callback: (v) => `${Number(v) >= 0 ? '+' : ''}$${Number(v).toFixed(0)}` },
                grid: { display: false },
              },
            },
          }}
          height={220}
        />
      </div>
    </div>
  );
};

// ── Main page ──
const PaperTradePage: React.FC = () => {
  const [strategy, setStrategy] = useState<PaperTradeStrategy>('stable');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<PaperTradeOverview | null>(null);
  const [positions, setPositions] = useState<PaperTradePosition[]>([]);
  const [allTrades, setAllTrades] = useState<PaperTradeHistoryItem[]>([]);
  const [lastUpdate, setLastUpdate] = useState('');
  const [capitalHistory, setCapitalHistory] = useState<CapitalHistoryItem[]>([]);
  const [tokenFilter, setTokenFilter] = useState<'all' | 'top'>('all');

  const STARTING_CAPITAL = 4000;
  const TOP_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

  const fetchAll = useCallback(async () => {
    try {
      const [ov, pos, hist, capHist] = await Promise.all([
        paperTradeService.getOverview(strategy),
        paperTradeService.getPositions(strategy),
        paperTradeService.getHistory(1, 999999, {}, strategy),
        paperTradeService.getCapitalHistory(strategy),
      ]);
      setOverview(ov);
      setPositions(pos);
      setAllTrades(hist.trades);
      setCapitalHistory(capHist);
      setLastUpdate(new Date().toLocaleTimeString() + ' UTC+8');
    } catch (e) {
      // 静默处理，避免控制台刷屏
    }
  }, [strategy]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
    const timer = setInterval(fetchAll, 10000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  if (loading) return <div className="pt2-loading"><div className="pt2-spinner" /><span>Loading...</span></div>;
  if (!overview) return <div className="pt2-loading"><span style={{ color: '#94a3b8' }}>Service not available</span></div>;

  const pct = (overview.capital - STARTING_CAPITAL) / STARTING_CAPITAL * 100;
  const wr = overview.totalTrades > 0 ? (overview.winCount / overview.totalTrades * 100) : 0;
  const wrColor = wr >= 50 ? 'green' : wr >= 40 ? 'dim' : 'red';

  const tokenMatch = (sym: string) => tokenFilter === 'all' || TOP_SYMBOLS.includes(sym);
  const futPos = positions.filter(p => !p.isSpot && tokenMatch(p.symbol));
  const spotPos = positions.filter(p => p.isSpot && tokenMatch(p.symbol));
  const futTrades = allTrades.filter(t => !t.isSpot && tokenMatch(t.symbol));
  const spotTrades = allTrades.filter(t => t.isSpot && tokenMatch(t.symbol));
  const umFut = futPos.reduce((a, p) => a + (p.marginUsed || 0), 0);
  const umSpot = spotPos.reduce((a, p) => a + (p.marginUsed || 0), 0);

  return (
    <div className="pt2-wrap">
      {/* Top bar */}
      <div className="pt2-topbar">
        <div className="pt2-topbar-left">
          <div>
            <h1><span>//</span> Galeon Paper Trader</h1>
            <div className="pt2-subtitle">Powered by Echo-Link · AI-driven market analysis & trading decisions</div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 16 }}>
            {([
              { key: 'stable' as const, label: 'Stable', icon: '' },
              { key: 'aggressive' as const, label: 'Aggressive', icon: '' },
            ]).map(s => (
              <button
                key={s.key}
                onClick={() => { setStrategy(s.key); setLoading(true); }}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  border: strategy === s.key ? '1.5px solid #2563eb' : '1px solid #d1d5db',
                  background: strategy === s.key ? '#eff6ff' : '#fff',
                  color: strategy === s.key ? '#2563eb' : '#64748b',
                  transition: 'all 0.15s',
                }}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
          <div className="pt2-status-chip">
            <i />
            <span>{overview.paused ? 'PAUSED' : 'ACTIVE'}</span>
          </div>
        </div>
        <div className="pt2-topbar-right">{lastUpdate}</div>
      </div>

      {/* Hero */}
      <div className="pt2-hero">
        <div className="pt2-hero-main">
          <div className="cap-label">Portfolio Value</div>
          <div className="cap-val">{fu(overview.capital)}</div>
          <div className={`cap-pct ${pct >= 0 ? 'up' : 'down'}`}>{pct >= 0 ? '+' : ''}{f(pct)}%</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 20 }}>
            <div>
              <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>PnL</span>
              <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: overview.totalPnl >= 0 ? '#16a34a' : '#dc2626', marginTop: 2 }}>{fu(overview.totalPnl)}</div>
            </div>
            <div>
              <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Today</span>
              <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: overview.dailyPnl >= 0 ? '#16a34a' : '#dc2626', marginTop: 2 }}>{fu(overview.dailyPnl)}</div>
            </div>
            <div>
              <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Drawdown</span>
              <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginTop: 2 }}>{f(overview.maxDrawdown)}%</div>
            </div>
          </div>
        </div>
        <div className="pt2-hero-right">
          <div className="pt2-stat-card">
            <div className="s-label">Win Rate</div>
            <div className={`s-val ${wrColor}`}>{f(wr, 1)}%</div>
            <div className="s-sub">{overview.winCount}W {overview.lossCount}L</div>
            <div className="wr-bar"><div style={{ width: `${wr}%`, background: wr >= 50 ? '#16a34a' : '#dc2626' }} /></div>
          </div>
          <div className="pt2-stat-card">
            <div className="s-label">Total Trades</div>
            <div className="s-val">{overview.totalTrades}</div>
            <div className="s-sub">{futTrades.length} fut / {spotTrades.length} spot</div>
          </div>
          <div className="pt2-stat-card">
            <div className="s-label">Futures</div>
            <div className="s-val">{futPos.length} <span className="dim" style={{ fontSize: 11 }}>/ {overview.maxFutures || 10}</span></div>
            <div className="s-sub">Margin {fu(umFut)}</div>
          </div>
          <div className="pt2-stat-card">
            <div className="s-label">Spot</div>
            <div className="s-val">{spotPos.length} <span className="dim" style={{ fontSize: 11 }}>/ {overview.maxSpot || 10}</span></div>
            <div className="s-sub">{umSpot > 0 ? fu(umSpot) : '—'}</div>
          </div>
          <div className="pt2-stat-card">
            <div className="s-label">Avail Capital</div>
            <div className="s-val">{fu(overview.availableCapital)}</div>
            <div className="s-sub">{overview.capital > 0 ? f(overview.availableCapital / overview.capital * 100, 0) : '0'}% free</div>
          </div>
          <div className="pt2-stat-card">
            <div className="s-label">Started</div>
            <div className="s-val" style={{ fontSize: 14, fontWeight: 700 }}>{overview.startedAt || '2026/4/23'}</div>
            <div className="s-val dim" style={{ fontSize: 13 }}>Day {overview.daysRunning}</div>
          </div>
        </div>
      </div>

      {/* Capital Curve */}
      {capitalHistory.length > 1 && <CapitalChart data={capitalHistory} startCapital={STARTING_CAPITAL} />}

      {/* Token Filter */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, margin: '20px 0 12px',
        padding: '4px', background: '#f1f5f9', borderRadius: 8, width: 'fit-content',
      }}>
        {([
          { key: 'all' as const, label: 'All' },
          { key: 'top' as const, label: 'BTC / ETH / SOL / BNB' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTokenFilter(t.key)}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
              border: 'none',
              background: tokenFilter === t.key ? '#fff' : 'transparent',
              color: tokenFilter === t.key ? '#0f172a' : '#64748b',
              boxShadow: tokenFilter === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Positions */}
      <PositionsTable positions={futPos} isSpot={false} label="Futures Positions" />
      <PositionsTable positions={spotPos} isSpot={true} label="Spot Positions" />

      {/* Trades */}
      <TradesTable trades={futTrades} isSpot={false} label="Futures Trades" />
      <TradesTable trades={spotTrades} isSpot={true} label="Spot Trades" />

      {/* Footer */}
      <div className="pt2-footer">
        All signals are for reference only. Past performance does not guarantee future results. Traders are solely responsible for their own decisions.
      </div>
    </div>
  );
};

export default PaperTradePage;

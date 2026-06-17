/**
 * Galeon Brain — Backtest Report Generator (HTML + Charts)
 *
 * Generates a visual backtest report from live forward-test trading data.
 * Usage: node generate_backtest_html.js
 * Output: backtest_report.html
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'src/services/paper-trade-data');

// ==================== Load Data ====================
const trades = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'trades.json'), 'utf8'));
const spotTrades = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'spot_trades.json'), 'utf8'));
const brainState = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/brain/data/brain-state.json'), 'utf8'));

let learningReports = { reports: [], adjustmentHistory: [] };
try { learningReports = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/brain/data/learning-reports.json'), 'utf8')); } catch {}
const controlParams = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/brain/data/control-params.json'), 'utf8'));

const allTrades = [...trades, ...spotTrades].filter(t => t.exit_price && t.total_pnl !== undefined);
allTrades.sort((a, b) => new Date(a.entered_at) - new Date(b.entered_at));

// ==================== Compute Metrics ====================
// Read actual initial capital from PT state
const ptState = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'state.json'), 'utf8'));
const INITIAL_CAPITAL = Math.round(ptState.capital - ptState.total_pnl);
const wins = allTrades.filter(t => t.total_pnl > 0);
const losses = allTrades.filter(t => t.total_pnl <= 0);
const totalPnl = allTrades.reduce((s, t) => s + t.total_pnl, 0);
const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.total_pnl, 0) / wins.length : 0;
const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.total_pnl, 0) / losses.length) : 0;
const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;
const expectancy = totalPnl / allTrades.length;

// Equity curve + drawdown
let cumPnl = 0, peak = INITIAL_CAPITAL, maxDD = 0, maxDDPct = 0;
const equityCurve = [];
allTrades.forEach(t => {
  cumPnl += t.total_pnl;
  const eq = INITIAL_CAPITAL + cumPnl;
  if (eq > peak) peak = eq;
  const dd = peak - eq;
  const ddPct = peak > 0 ? dd / peak * 100 : 0;
  if (ddPct > maxDDPct) { maxDD = dd; maxDDPct = ddPct; }
  equityCurve.push({ date: t.closed_at?.slice(0, 10), equity: Math.round(eq * 100) / 100, dd: Math.round(ddPct * 100) / 100 });
});

// Daily PnL
const byDay = {};
allTrades.forEach(t => {
  const d = t.closed_at?.slice(0, 10);
  if (!d) return;
  if (!byDay[d]) byDay[d] = { trades: 0, wins: 0, pnl: 0 };
  byDay[d].trades++;
  if (t.total_pnl > 0) byDay[d].wins++;
  byDay[d].pnl += t.total_pnl;
});
const days = Object.entries(byDay).sort();
const profitDays = days.filter(([_, v]) => v.pnl > 0).length;

// Sharpe (daily % returns, annualized)
let runningEquity = INITIAL_CAPITAL;
const dailyReturnsPct = days.map(([_, v]) => {
  const retPct = runningEquity > 0 ? v.pnl / runningEquity * 100 : 0;
  runningEquity += v.pnl;
  return retPct;
});
const avgDailyReturnPct = dailyReturnsPct.reduce((s, r) => s + r, 0) / dailyReturnsPct.length;
const stdDevPct = Math.sqrt(dailyReturnsPct.reduce((s, r) => s + Math.pow(r - avgDailyReturnPct, 2), 0) / dailyReturnsPct.length);
const sharpe = stdDevPct > 0 ? (avgDailyReturnPct / stdDevPct) * Math.sqrt(365) : 0;

// Calmar Ratio (annualized return / max drawdown)
const tradingDays = days.length;
const annualizedReturn = ((INITIAL_CAPITAL + totalPnl) / INITIAL_CAPITAL) ** (365 / tradingDays) - 1;
const calmar = maxDDPct > 0 ? (annualizedReturn * 100) / maxDDPct : 0;

// Strategy exits vs System exits
const strategyExits = allTrades.filter(t => {
  const r = (t.exit_reason || '').split(':')[0].trim();
  return ['STOP_LOSS', 'HEALTH_EXIT', 'TIMEOUT', 'SL_MOVED', 'TP3', 'BTC_PROTECT'].includes(r);
});
const systemExits = allTrades.filter(t => {
  const r = (t.exit_reason || '').split(':')[0].trim();
  return ['STALE_EXIT', 'DATA_BAIL'].includes(r);
});
const strategyWR = strategyExits.length > 0 ? strategyExits.filter(t => t.total_pnl > 0).length / strategyExits.length * 100 : 0;
const strategyPnl = strategyExits.reduce((s, t) => s + t.total_pnl, 0);

// By direction
const byDir = {};
allTrades.forEach(t => {
  const d = t.direction || '?';
  if (!byDir[d]) byDir[d] = { t: 0, w: 0, pnl: 0 };
  byDir[d].t++;
  if (t.total_pnl > 0) byDir[d].w++;
  byDir[d].pnl += t.total_pnl;
});

// By exit reason
const byExit = {};
allTrades.forEach(t => {
  const r = (t.exit_reason || '?').split(':')[0].trim();
  if (!byExit[r]) byExit[r] = { t: 0, w: 0, pnl: 0 };
  byExit[r].t++;
  if (t.total_pnl > 0) byExit[r].w++;
  byExit[r].pnl += t.total_pnl;
});

// Top tokens
const byToken = {};
allTrades.forEach(t => {
  const tk = t.token_symbol || t.symbol;
  if (!byToken[tk]) byToken[tk] = { t: 0, w: 0, pnl: 0 };
  byToken[tk].t++;
  if (t.total_pnl > 0) byToken[tk].w++;
  byToken[tk].pnl += t.total_pnl;
});
const topProfit = Object.entries(byToken).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 10);
const topLoss = Object.entries(byToken).sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 5);

// Weekly rolling WR (for evolution chart)
const weeklyWR = [];
for (let i = 0; i < allTrades.length; i += 50) {
  const batch = allTrades.slice(i, i + 50);
  const bw = batch.filter(t => t.total_pnl > 0).length;
  weeklyWR.push({
    label: batch[0]?.entered_at?.slice(5, 10) || '',
    wr: Math.round(bw / batch.length * 100)
  });
}

// Evolution: params version over time from adjustment history
const adjustHist = learningReports.adjustmentHistory || [];
const evolutionTimeline = [];
const seen = new Set();
adjustHist.forEach(a => {
  const d = a.timestamp?.slice(0, 10);
  if (d && !seen.has(d)) {
    seen.add(d);
    evolutionTimeline.push({ date: d, adjustments: adjustHist.filter(x => x.timestamp?.slice(0, 10) === d).length });
  }
});

// ==================== Generate HTML ====================

// Prepare chart data
const eqDates = [], eqValues = [], ddValues = [];
const sampledEq = equityCurve.filter((_, i) => i % 5 === 0 || i === equityCurve.length - 1);
sampledEq.forEach(e => { eqDates.push(e.date); eqValues.push(e.equity); ddValues.push(-e.dd); });

const dailyDates = [], dailyPnls = [], dailyColors = [];
days.forEach(([d, v]) => { dailyDates.push(d.slice(5)); dailyPnls.push(Math.round(v.pnl)); dailyColors.push(v.pnl >= 0 ? '#22c55e' : '#ef4444'); });

const wrLabels = weeklyWR.map(w => w.label);
const wrValues = weeklyWR.map(w => w.wr);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Galeon Brain — Backtest Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e17; color: #e2e8f0; line-height: 1.6; }
  .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
  h1 { font-size: 2.2em; margin-bottom: 8px; color: #fff; }
  h2 { font-size: 1.4em; margin: 40px 0 20px; color: #94a3b8; border-bottom: 1px solid #1e293b; padding-bottom: 10px; }
  .subtitle { color: #64748b; font-size: 0.95em; margin-bottom: 30px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.8em; font-weight: 600; }
  .badge-green { background: #064e3b; color: #34d399; }
  .badge-blue { background: #1e3a5f; color: #60a5fa; }

  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 20px 0; }
  .metric-card { background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; }
  .metric-card .label { font-size: 0.8em; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .metric-card .value { font-size: 1.8em; font-weight: 700; margin-top: 4px; }
  .metric-card .value.green { color: #22c55e; }
  .metric-card .value.red { color: #ef4444; }
  .metric-card .value.blue { color: #3b82f6; }
  .metric-card .value.yellow { color: #eab308; }

  .chart-container { background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin: 20px 0; }
  .chart-container canvas { max-height: 350px; }

  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { text-align: left; padding: 10px 12px; color: #64748b; font-size: 0.8em; text-transform: uppercase; border-bottom: 1px solid #1e293b; }
  td { padding: 10px 12px; border-bottom: 1px solid #1e293b; font-size: 0.9em; }
  tr:hover { background: #1e293b33; }
  .pnl-pos { color: #22c55e; }
  .pnl-neg { color: #ef4444; }

  .methodology { background: #111827; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; margin: 20px 0; font-size: 0.9em; color: #94a3b8; }
  .methodology h3 { color: #e2e8f0; margin-bottom: 10px; }
  .methodology ul { padding-left: 20px; }
  .methodology li { margin: 6px 0; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }

  .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #1e293b; color: #475569; font-size: 0.85em; text-align: center; }
</style>
</head>
<body>
<div class="container">

<h1>Galeon Brain — Backtest Report</h1>
<p class="subtitle">
  Live Forward-Test Results &nbsp;|&nbsp;
  ${allTrades[0]?.entered_at?.slice(0, 10)} → ${allTrades[allTrades.length - 1]?.closed_at?.slice(0, 10)} &nbsp;|&nbsp;
  ${allTrades.length} Trades over ${days.length} Days &nbsp;|&nbsp;
  <span class="badge badge-green">LIVE EXECUTION</span>
</p>

<!-- Methodology -->
<div class="methodology">
  <h3>Methodology</h3>
  <ul>
    <li><strong>Test Type:</strong> Live forward-test (out-of-sample) — all trades executed in real-time against live market data, not fitted to historical data</li>
    <li><strong>Initial Capital:</strong> $${INITIAL_CAPITAL} simulated</li>
    <li><strong>Universe:</strong> Alpha tokens (CEX derivatives + DEX spot)</li>
    <li><strong>Signal Sources:</strong> Multi-dimensional perception — on-chain analytics (via Bitget Agent Skill), derivatives microstructure, technical indicators, macro regime</li>
    <li><strong>Decision Engine:</strong> Self-evolving rules engine with LLM-assisted cognition, multi-dimensional voting, dynamic confidence gating</li>
    <li><strong>Risk Controls:</strong> Multi-layer defense — red-line blocking, self-learned stage filters, time-decay stop-loss, loss cooldown</li>
    <li><strong>Evolution:</strong> Automatic post-trade attribution → parameter adjustment → backtest validation → deployment (${adjustHist.length} auto-adjustments applied)</li>
    <li><strong>Fees:</strong> 0.1% per trade (included in PnL calculations)</li>
  </ul>
</div>

<!-- Core Metrics -->
<h2>Core Performance Metrics</h2>
<div class="metrics-grid">
  <div class="metric-card"><div class="label">Capital Growth</div><div class="value green">${((INITIAL_CAPITAL + totalPnl) / INITIAL_CAPITAL).toFixed(1)}x</div></div>
  <div class="metric-card"><div class="label">Net Return</div><div class="value green">+${(totalPnl / INITIAL_CAPITAL * 100).toFixed(0)}%</div></div>
  <div class="metric-card"><div class="label">Total PnL</div><div class="value green">+$${totalPnl.toFixed(0)}</div></div>
  <div class="metric-card"><div class="label">Strategy Win Rate</div><div class="value blue">${strategyWR.toFixed(1)}%</div></div>
  <div class="metric-card"><div class="label">Profit Factor</div><div class="value blue">${profitFactor.toFixed(2)}</div></div>
  <div class="metric-card"><div class="label">Sharpe Ratio</div><div class="value blue">${sharpe.toFixed(2)}</div></div>
  <div class="metric-card"><div class="label">Calmar Ratio</div><div class="value blue">${calmar.toFixed(2)}</div></div>
  <div class="metric-card"><div class="label">Max Drawdown</div><div class="value red">${maxDDPct.toFixed(1)}%</div></div>
  <div class="metric-card"><div class="label">Expectancy</div><div class="value green">$${expectancy.toFixed(2)}/trade</div></div>
  <div class="metric-card"><div class="label">Avg Win / Avg Loss</div><div class="value yellow">$${avgWin.toFixed(0)} / $${avgLoss.toFixed(0)}</div></div>
</div>

<div class="methodology" style="margin-top:10px;">
  <p style="margin:0;"><strong>Note on Win Rate:</strong> Overall WR across all ${allTrades.length} trades is ${(wins.length / allTrades.length * 100).toFixed(1)}%.
  However, ${systemExits.length} trades (${(systemExits.length/allTrades.length*100).toFixed(0)}%) exited due to system-level events (stale data timeout, data source unavailability) rather than strategy decisions.
  Excluding these, <strong>strategy-driven exits achieve ${strategyWR.toFixed(1)}% WR</strong> with $${strategyPnl.toFixed(0)} PnL across ${strategyExits.length} trades.</p>
</div>

<!-- Equity Curve -->
<h2>Equity Curve</h2>
<div class="chart-container">
  <canvas id="equityChart"></canvas>
</div>

<!-- Drawdown -->
<h2>Drawdown</h2>
<div class="chart-container">
  <canvas id="drawdownChart"></canvas>
</div>

<!-- Daily PnL -->
<h2>Daily PnL</h2>
<div class="chart-container">
  <canvas id="dailyPnlChart"></canvas>
</div>

<!-- Rolling Win Rate -->
<h2>Rolling Win Rate (50-trade window) — Strategy Evolution</h2>
<div class="chart-container">
  <canvas id="wrChart"></canvas>
</div>

<!-- By Direction & Exit Reason -->
<h2>Performance Breakdown</h2>
<div class="two-col">
  <div class="chart-container">
    <h3 style="margin-bottom:12px; color:#94a3b8;">By Direction</h3>
    <table>
      <tr><th>Direction</th><th>Trades</th><th>Win Rate</th><th>PnL</th></tr>
      ${Object.entries(byDir).map(([d, v]) => `<tr><td>${d}</td><td>${v.t}</td><td>${(v.w / v.t * 100).toFixed(0)}%</td><td class="${v.pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">$${v.pnl.toFixed(0)}</td></tr>`).join('')}
    </table>
  </div>
  <div class="chart-container">
    <h3 style="margin-bottom:12px; color:#94a3b8;">By Exit Reason</h3>
    <table>
      <tr><th>Reason</th><th>Type</th><th>Trades</th><th>WR</th><th>Avg PnL</th></tr>
      ${Object.entries(byExit).sort((a, b) => b[1].t - a[1].t).map(([r, v]) => {
        const isSystem = ['STALE_EXIT', 'DATA_BAIL'].includes(r);
        const typeLabel = isSystem ? '<span style="color:#f59e0b;">System</span>' : '<span style="color:#22c55e;">Strategy</span>';
        return `<tr><td>${r}</td><td>${typeLabel}</td><td>${v.t}</td><td>${(v.w / v.t * 100).toFixed(0)}%</td><td class="${v.pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">$${(v.pnl / v.t).toFixed(1)}</td></tr>`;
      }).join('')}
    </table>
    <p style="margin-top:10px; font-size:0.8em; color:#64748b;">
      <strong>Strategy exits:</strong> Stop loss, health-based exit, take profit, timeout, BTC protection — decisions made by the trading agent.<br>
      <strong>System exits:</strong> Stale data timeout, data source bail — forced exits due to infrastructure events, not strategy logic.
    </p>
  </div>
</div>

<!-- Top Tokens -->
<h2>Top Performing Tokens</h2>
<div class="two-col">
  <div class="chart-container">
    <h3 style="margin-bottom:12px; color:#22c55e;">Top 10 Profitable</h3>
    <table>
      <tr><th>Token</th><th>Trades</th><th>WR</th><th>PnL</th></tr>
      ${topProfit.map(([tk, v]) => `<tr><td>${tk}</td><td>${v.t}</td><td>${(v.w / v.t * 100).toFixed(0)}%</td><td class="pnl-pos">+$${v.pnl.toFixed(0)}</td></tr>`).join('')}
    </table>
  </div>
  <div class="chart-container">
    <h3 style="margin-bottom:12px; color:#ef4444;">Top 5 Losing</h3>
    <table>
      <tr><th>Token</th><th>Trades</th><th>WR</th><th>PnL</th></tr>
      ${topLoss.map(([tk, v]) => `<tr><td>${tk}</td><td>${v.t}</td><td>${(v.w / v.t * 100).toFixed(0)}%</td><td class="pnl-neg">-$${Math.abs(v.pnl).toFixed(0)}</td></tr>`).join('')}
    </table>
  </div>
</div>

<!-- Self-Evolution -->
<h2>Self-Evolution Metrics</h2>
<div class="metrics-grid">
  <div class="metric-card"><div class="label">Learning Cycles</div><div class="value blue">${learningReports.reports?.length || 0}</div></div>
  <div class="metric-card"><div class="label">Auto Adjustments</div><div class="value blue">${adjustHist.length}</div></div>
  <div class="metric-card"><div class="label">Params Version</div><div class="value yellow">v${controlParams.version}</div></div>
  <div class="metric-card"><div class="label">Profitable Days</div><div class="value green">${profitDays}/${days.length} (${(profitDays / days.length * 100).toFixed(0)}%)</div></div>
</div>

<div class="chart-container">
  <h3 style="margin-bottom:12px; color:#94a3b8;">Parameter Adjustments Over Time</h3>
  <canvas id="evoChart"></canvas>
</div>

<div class="methodology">
  <h3>Self-Evolution Process</h3>
  <ul>
    <li><strong>Post-Trade Attribution:</strong> Every closed trade is automatically analyzed — which signal dimensions contributed to the outcome, what was the dominant error pattern</li>
    <li><strong>Rule Adjustment:</strong> The RuleEvolver automatically tunes decision parameters (entry thresholds, stage penalties, risk weights) based on accumulated evidence</li>
    <li><strong>Overfitting Protection:</strong> Consecutive same-direction adjustments are blocked after 3 iterations; parameter bounds prevent extreme values</li>
    <li><strong>Continuous Operation:</strong> The system runs 24/7, learning from every trade cycle without human intervention</li>
  </ul>
</div>

<!-- Summary -->
<h2>Summary</h2>
<div class="methodology">
  <table>
    <tr><td style="width:250px; color:#64748b;">Test Period</td><td>${allTrades[0]?.entered_at?.slice(0, 10)} → ${allTrades[allTrades.length - 1]?.closed_at?.slice(0, 10)} (${days.length} days)</td></tr>
    <tr><td style="color:#64748b;">Initial → Final Capital</td><td>$${INITIAL_CAPITAL} → $${(INITIAL_CAPITAL + totalPnl).toFixed(0)}</td></tr>
    <tr><td style="color:#64748b;">Capital Growth</td><td style="color:#22c55e; font-weight:700;">${((INITIAL_CAPITAL + totalPnl) / INITIAL_CAPITAL).toFixed(1)}x (net +${(totalPnl / INITIAL_CAPITAL * 100).toFixed(0)}%)</td></tr>
    <tr><td style="color:#64748b;">Total Trades</td><td>${allTrades.length} (${(allTrades.length / days.length).toFixed(1)} avg/day)</td></tr>
    <tr><td style="color:#64748b;">Strategy Win Rate</td><td>${strategyWR.toFixed(1)}% (excl. ${systemExits.length} system exits)</td></tr>
    <tr><td style="color:#64748b;">Overall Win Rate</td><td>${(wins.length / allTrades.length * 100).toFixed(1)}% (${wins.length}W / ${losses.length}L)</td></tr>
    <tr><td style="color:#64748b;">Profit Factor</td><td>${profitFactor.toFixed(2)}</td></tr>
    <tr><td style="color:#64748b;">Sharpe Ratio (annualized)</td><td>${sharpe.toFixed(2)}</td></tr>
    <tr><td style="color:#64748b;">Calmar Ratio</td><td>${calmar.toFixed(2)}</td></tr>
    <tr><td style="color:#64748b;">Max Drawdown</td><td style="color:#ef4444;">${maxDDPct.toFixed(1)}%</td></tr>
    <tr><td style="color:#64748b;">Self-Evolution Adjustments</td><td>${adjustHist.length} auto-applied</td></tr>
  </table>
</div>

<div class="footer">
  Generated by <strong>generate_backtest_html.js</strong> &nbsp;|&nbsp; ${new Date().toISOString().slice(0, 16)} &nbsp;|&nbsp; Galeon Brain v0.1
</div>

</div>

<script>
const chartDefaults = { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } };
const gridColor = '#1e293b';
const scales = (yLabel) => ({ x: { ticks: { color: '#475569', maxTicksLimit: 15 }, grid: { color: gridColor } }, y: { ticks: { color: '#475569' }, grid: { color: gridColor }, title: { display: true, text: yLabel, color: '#64748b' } } });

// Equity
new Chart(document.getElementById('equityChart'), {
  type: 'line',
  data: { labels: ${JSON.stringify(eqDates)}, datasets: [{ data: ${JSON.stringify(eqValues)}, borderColor: '#22c55e', borderWidth: 2, fill: true, backgroundColor: 'rgba(34,197,94,0.08)', pointRadius: 0, tension: 0.3 }] },
  options: { ...chartDefaults, scales: scales('Equity ($)') }
});

// Drawdown
new Chart(document.getElementById('drawdownChart'), {
  type: 'line',
  data: { labels: ${JSON.stringify(eqDates)}, datasets: [{ data: ${JSON.stringify(ddValues)}, borderColor: '#ef4444', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(239,68,68,0.1)', pointRadius: 0, tension: 0.3 }] },
  options: { ...chartDefaults, scales: scales('Drawdown (%)') }
});

// Daily PnL
new Chart(document.getElementById('dailyPnlChart'), {
  type: 'bar',
  data: { labels: ${JSON.stringify(dailyDates)}, datasets: [{ data: ${JSON.stringify(dailyPnls)}, backgroundColor: ${JSON.stringify(dailyColors)}, borderRadius: 3 }] },
  options: { ...chartDefaults, scales: scales('Daily PnL ($)') }
});

// Rolling WR
new Chart(document.getElementById('wrChart'), {
  type: 'line',
  data: { labels: ${JSON.stringify(wrLabels)}, datasets: [
    { data: ${JSON.stringify(wrValues)}, borderColor: '#3b82f6', borderWidth: 2, fill: true, backgroundColor: 'rgba(59,130,246,0.08)', pointRadius: 3, pointBackgroundColor: '#3b82f6', tension: 0.3 },
    { data: Array(${wrLabels.length}).fill(50), borderColor: '#475569', borderWidth: 1, borderDash: [5,5], pointRadius: 0 }
  ]},
  options: { ...chartDefaults, scales: scales('Win Rate (%)'), plugins: { legend: { display: false } } }
});

// Evolution
new Chart(document.getElementById('evoChart'), {
  type: 'bar',
  data: { labels: ${JSON.stringify(evolutionTimeline.map(e => e.date.slice(5)))}, datasets: [{ data: ${JSON.stringify(evolutionTimeline.map(e => e.adjustments))}, backgroundColor: '#8b5cf6', borderRadius: 3 }] },
  options: { ...chartDefaults, scales: scales('Adjustments per Day') }
});
</script>
</body>
</html>`;

const outPath = path.join(__dirname, 'backtest_report.html');
fs.writeFileSync(outPath, html);
console.log(`Backtest report generated: ${outPath}`);
console.log(`Open in browser to view charts.`);

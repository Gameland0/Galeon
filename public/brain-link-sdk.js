/**
 * Galeon Brain Link SDK v0.2.0
 *
 * Two modes:
 *   Mode 1: Pre-trade Check — popup before swap
 *   Mode 2: Agent Wallet Auto-Trade — Brain auto-trades via Smart Account
 *
 * Usage:
 *   <script src="https://galeon.world/brain-link-sdk.js"></script>
 *   <script>
 *     GaleonBrainLink.init({ apiUrl: 'https://galeon.world/api' });
 *
 *     // Mode 1: Check before swap
 *     GaleonBrainLink.check('MON', 1000, (result) => {
 *       if (result.action === 'execute') doSwap(result.amount);
 *     });
 *
 *     // Mode 2: Auto-Trade via Agent Wallet
 *     await GaleonBrainLink.connectWallet();
 *     await GaleonBrainLink.enableAutoTrade({ maxPerTrade: 50, validDays: 30 });
 *     // Brain now auto-trades on Kuru DEX. Monitor with:
 *     GaleonBrainLink.renderDashboard('container');
 *   </script>
 */

(function () {
  'use strict';

  const VERSION = '0.2.0';
  let config = { apiUrl: '' };
  let walletState = { connected: false, address: '', smartAccount: '', approved: false, autoTradeOn: false, balance: '0' };
  let autoTradeConfig = { maxPerTrade: 50, validDays: 30 };
  let activityLog = [];

  // ── Styles ──
  const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
    .gbl-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;justify-content:center;align-items:flex-end;font-family:'Inter',sans-serif}
    .gbl-popup{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:520px;padding:28px 32px;max-height:85vh;overflow-y:auto;box-shadow:0 -8px 40px rgba(0,0,0,0.12);animation:gbl-slide .3s ease}
    @keyframes gbl-slide{from{transform:translateY(100%)}to{transform:translateY(0)}}
    .gbl-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .gbl-logo{font-size:16px;font-weight:800;color:#4f7df9}
    .gbl-close{cursor:pointer;color:#94a3b8;font-size:20px;border:none;background:none;padding:4px 8px}
    .gbl-hero{background:linear-gradient(135deg,#f0f4ff,#e8eeff);border-radius:16px;padding:20px 28px;text-align:center;margin-bottom:16px}
    .gbl-dir{font-size:28px;font-weight:800}
    .gbl-dir.long{color:#22c55e}.gbl-dir.short{color:#ef4444}.gbl-dir.wait{color:#f59e0b}
    .gbl-sub{font-size:13px;color:#64748b;margin:4px 0 12px}
    .gbl-badges{display:inline-flex;gap:20px;background:#fff;padding:10px 24px;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
    .gbl-badge-val{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:800;letter-spacing:-1px}
    .gbl-badge-lbl{font-size:10px;color:#94a3b8;margin-top:2px}
    .gbl-info{font-size:13px;margin-bottom:6px;color:#64748b;line-height:1.6}
    .gbl-info b{color:#1e293b}
    .gbl-votes{background:#f8fafc;border-radius:10px;padding:10px 14px;margin:12px 0;font-size:11px;color:#64748b}
    .gbl-votes b{color:#1e293b}
    .gbl-btns{display:flex;gap:10px;margin-top:16px}
    .gbl-btn{flex:1;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;border:none;font-family:inherit;transition:all .2s}
    .gbl-btn-primary{background:#4f7df9;color:#fff}.gbl-btn-primary:hover{background:#3b6de0;box-shadow:0 4px 12px rgba(79,125,249,0.3)}
    .gbl-btn-secondary{background:#f1f5f9;color:#64748b}.gbl-btn-secondary:hover{background:#e2e8f0}
    .gbl-btn-success{background:#22c55e;color:#fff}.gbl-btn-success:hover{background:#16a34a}
    .gbl-btn-danger{background:rgba(239,68,68,0.08);color:#ef4444}.gbl-btn-danger:hover{background:rgba(239,68,68,0.15)}
    .gbl-footer{margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;text-align:center;line-height:1.6}
    .gbl-footer b{color:#4f7df9}
    .gbl-widget{font-family:'Inter',sans-serif;background:#fff;border-radius:20px;padding:20px 24px;box-shadow:0 2px 16px rgba(0,0,0,0.06)}
    .gbl-widget-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
    .gbl-widget-title{font-size:14px;font-weight:700;color:#1e293b;display:flex;align-items:center;gap:6px}
    .gbl-widget-live{font-size:10px;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.06);padding:3px 10px;border-radius:6px}
    .gbl-widget-row{display:flex;justify-content:space-between;padding:8px 0;font-size:13px;border-bottom:1px solid #f1f5f9}
    .gbl-widget-row:last-child{border-bottom:none}
    .gbl-widget-label{color:#64748b}.gbl-widget-val{font-family:'JetBrains Mono',monospace;font-weight:700;color:#1e293b}
    .gbl-loading{display:flex;align-items:center;justify-content:center;padding:40px;color:#94a3b8;font-size:13px;gap:8px}
    .gbl-spinner{width:16px;height:16px;border:2px solid #e2e8f0;border-top-color:#4f7df9;border-radius:50%;animation:gbl-spin .6s linear infinite}
    @keyframes gbl-spin{to{transform:rotate(360deg)}}
    .gbl-dash{font-family:'Inter',sans-serif;background:#fff;border-radius:20px;padding:24px 28px;box-shadow:0 2px 16px rgba(0,0,0,0.06)}
    .gbl-dash-section{margin-bottom:20px}
    .gbl-dash-label{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px}
    .gbl-dash-stat{display:flex;gap:12px;margin-bottom:16px}
    .gbl-dash-stat-item{flex:1;text-align:center;padding:14px;background:#f8fafc;border-radius:14px}
    .gbl-dash-stat-val{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-1px}
    .gbl-dash-stat-lbl{font-size:10px;color:#94a3b8;margin-top:3px}
    .gbl-dash-activity{max-height:260px;overflow-y:auto}
    .gbl-dash-activity::-webkit-scrollbar{width:3px}.gbl-dash-activity::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}
    .gbl-dash-item{display:flex;gap:10px;padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;align-items:flex-start}
    .gbl-dash-item:last-child{border-bottom:none}
    .gbl-dash-dot{width:7px;height:7px;border-radius:50%;margin-top:4px;flex-shrink:0}
    .gbl-dash-dot.green{background:#22c55e}.gbl-dash-dot.blue{background:#4f7df9}.gbl-dash-dot.amber{background:#f59e0b}.gbl-dash-dot.red{background:#ef4444}
    .gbl-dash-time{color:#94a3b8;width:30px;flex-shrink:0;font-family:'JetBrains Mono',monospace;font-size:10px}
    .gbl-dash-text{color:#64748b;flex:1;line-height:1.4}
    .gbl-dash-pos{background:#f8fafc;border-radius:14px;padding:14px 16px;margin-bottom:10px}
    .gbl-dash-pos-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .gbl-dash-pos-token{font-size:15px;font-weight:700;color:#1e293b}
    .gbl-dash-pos-pnl{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:800}
    .gbl-dash-pos-info{font-size:11px;color:#64748b;margin-top:4px}
    .gbl-dash-pos-brain{font-size:11px;color:#64748b;padding:8px 10px;background:#fff;border-radius:8px;margin-top:8px;border-left:3px solid #4f7df9}
    .gbl-dash-micro{display:flex;gap:3px;margin:8px 0}
    .gbl-dash-micro-step{flex:1;text-align:center}
    .gbl-dash-micro-bar{height:4px;border-radius:2px;margin-bottom:3px}
    .gbl-dash-micro-bar.done{background:#22c55e}.gbl-dash-micro-bar.active{background:#4f7df9}.gbl-dash-micro-bar.paused{background:#f59e0b}.gbl-dash-micro-bar.pending{background:#e2e8f0}
    .gbl-dash-micro-label{font-size:8px;font-weight:600}
    .gbl-toggle{width:44px;height:24px;border-radius:12px;position:relative;cursor:pointer;transition:.2s;display:inline-block}
    .gbl-toggle.on{background:#22c55e}.gbl-toggle.off{background:#cbd5e1}
    .gbl-toggle::after{content:'';width:20px;height:20px;background:#fff;border-radius:50%;position:absolute;top:2px;transition:.2s;box-shadow:0 1px 4px rgba(0,0,0,0.12)}
    .gbl-toggle.on::after{left:22px}.gbl-toggle.off::after{left:2px}
    .gbl-badge{padding:3px 10px;border-radius:8px;font-size:11px;font-weight:700}
    .gbl-badge.long{background:rgba(34,197,94,0.08);color:#22c55e}.gbl-badge.short{background:rgba(239,68,68,0.08);color:#ef4444}
    .gbl-onchain{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:#4f7df9;font-weight:600;background:rgba(79,125,249,0.06);padding:4px 12px;border-radius:8px}
  `;

  let styleInjected = false;
  function injectStyles() { if (styleInjected) return; const s = document.createElement('style'); s.textContent = STYLES; document.head.appendChild(s); styleInjected = true; }
  function timeAgo(ts) { const d = Math.floor((Date.now() - ts) / 1000); if (d < 5) return 'now'; if (d < 60) return d + 's'; if (d < 3600) return Math.floor(d / 60) + 'm'; return Math.floor(d / 3600) + 'h'; }

  // ── API ──
  async function fetchDecision(asset) {
    try { const r = await fetch(`${config.apiUrl}/brain-link/decision/${asset}`); return await r.json(); }
    catch (e) { return null; }
  }
  async function fetchAssessRisk(asset, amount) {
    try { const r = await fetch(`${config.apiUrl}/brain-link/assess-risk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset, amount }) }); return await r.json(); }
    catch (e) { return { action: 'PASS', suggestedAmount: amount, riskScore: 50, reason: '' }; }
  }
  async function fetchActivity() {
    try { const r = await fetch(`${config.apiUrl}/brain-link/activity?limit=20`); const d = await r.json(); return d.activities || []; }
    catch (e) { return []; }
  }
  async function fetchAllDecisions() {
    try { const r = await fetch(`${config.apiUrl}/brain-link/decisions`); const d = await r.json(); return d.decisions || []; }
    catch (e) { return []; }
  }

  // ── Mode 1: Pre-trade Check Popup ──
  function showCheckPopup(decision, risk, amount, callback) {
    const d = decision;
    const dir = d.direction || 'WAIT';
    const dirCls = dir === 'LONG' ? 'long' : dir === 'SHORT' ? 'short' : 'wait';
    const suggested = risk.suggestedAmount || amount;

    const overlay = document.createElement('div');
    overlay.className = 'gbl-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); callback && callback({ action: 'cancel' }); } };

    overlay.innerHTML = `
      <div class="gbl-popup">
        <div class="gbl-header"><span class="gbl-logo">🧠 Galeon Brain Link</span><button class="gbl-close" id="gbl-close">✕</button></div>
        <div style="text-align:center;font-size:12px;color:#94a3b8;margin-bottom:14px">Checking your trade against 12 AI dimensions...</div>
        <div class="gbl-hero">
          <div class="gbl-dir ${dirCls}">${dir} ${d.asset || ''}</div>
          <div class="gbl-sub">${risk.action === 'ADJUST' ? 'ADJUST — $' + suggested + ' recommended' : risk.action === 'REJECT' ? 'REJECT — Brain advises against' : 'PASS — Trade looks reasonable'}</div>
          <div class="gbl-badges">
            <div><div class="gbl-badge-val" style="color:#4f7df9">${d.confidence || 0}%</div><div class="gbl-badge-lbl">Confidence</div></div>
            <div style="border-left:1px solid #e2e8f0;margin:0 4px"></div>
            <div><div class="gbl-badge-val" style="color:#22c55e">${d.winRate || 0}%</div><div class="gbl-badge-lbl">Win Rate</div></div>
            <div style="border-left:1px solid #e2e8f0;margin:0 4px"></div>
            <div><div class="gbl-badge-val">${d.similarSetups || 0}</div><div class="gbl-badge-lbl">Setups</div></div>
          </div>
        </div>
        <div class="gbl-info"><b>Why:</b> ${d.reasoning || 'No data'}</div>
        ${risk.reason ? '<div class="gbl-info" style="color:#f59e0b"><b>Risk:</b> ' + risk.reason + '</div>' : ''}
        <div class="gbl-votes"><b>Score:</b> ${d.score > 0 ? '+' : ''}${d.score || 0} (threshold: 6) ${d.passed ? '✅' : '❌'} · <b>Decision ID:</b> #${d.decisionId || '—'}</div>
        <div class="gbl-btns">
          <button class="gbl-btn gbl-btn-primary" id="gbl-exec">Execute $${suggested} ✅</button>
          ${suggested < amount ? '<button class="gbl-btn gbl-btn-secondary" id="gbl-override">Override $' + amount + ' ⚠</button>' : ''}
        </div>
        <div class="gbl-footer">This trade will be <b>AI-Endorsed</b> on Monad.<br>Powered by <b>Galeon Brain Link</b> v${VERSION}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#gbl-close').onclick = () => { overlay.remove(); callback && callback({ action: 'cancel' }); };
    overlay.querySelector('#gbl-exec').onclick = () => { overlay.remove(); callback && callback({ action: 'execute', amount: suggested, decision: d, risk }); };
    const ob = overlay.querySelector('#gbl-override');
    if (ob) ob.onclick = () => { overlay.remove(); callback && callback({ action: 'execute', amount, decision: d, risk }); };
  }

  // ── Mode 2: Auto-Trade Dashboard ──
  function renderDashboard(container, data) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    const ws = walletState;
    const positions = data.positions || [];
    const activities = data.activities || [];
    const decisions = data.decisions || [];

    const mockPositions = positions.length > 0 ? positions : [
      { token: 'MON', dir: 'LONG', pnl: '+3.2%', pnlColor: '#22c55e', steps: [
        { l: 'DCA 30%', s: 'done' }, { l: 'DCA 30%', s: 'done' }, { l: 'DCA 40%', s: 'done' },
        { l: 'TP1', s: 'done' }, { l: 'TP2', s: 'pending' }, { l: 'Exit', s: 'pending' }
      ], brain: 'Holding 70%. SL → breakeven. Next: TP2 at +10%.' },
      { token: 'WETH', dir: 'LONG', pnl: '-1.1%', pnlColor: '#ef4444', steps: [
        { l: 'DCA 30%', s: 'done' }, { l: 'DCA 30%', s: 'done' }, { l: 'DCA', s: 'paused' }, { l: 'TP1', s: 'pending' }
      ], brain: 'DCA paused — price below confirm. SL $2,280 active.' },
    ];

    el.innerHTML = `
      <div class="gbl-dash">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <div style="font-size:18px;font-weight:800;color:#1e293b">🧠 Galeon Brain Link</div>
            <div style="font-size:12px;color:#94a3b8">Agent Wallet Auto-Trade on Monad</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="gbl-toggle ${ws.autoTradeOn ? 'on' : 'off'}" id="gbl-toggle-auto"></div>
            <span style="font-size:13px;font-weight:700;color:${ws.autoTradeOn ? '#22c55e' : '#94a3b8'}" id="gbl-toggle-label">${ws.autoTradeOn ? 'Auto-Trade ON' : 'Auto-Trade OFF'}</span>
          </div>
        </div>

        <!-- Wallet -->
        <div class="gbl-dash-section">
          <div class="gbl-dash-label">Agent Wallet</div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#f8fafc;border-radius:14px">
            <div>
              <span style="color:${ws.connected ? '#22c55e' : '#ef4444'};font-weight:700">● ${ws.connected ? 'Connected' : 'Not Connected'}</span>
              ${ws.address ? '<span style="font-size:11px;color:#94a3b8;margin-left:8px;font-family:JetBrains Mono,monospace">' + ws.address.slice(0, 6) + '...' + ws.address.slice(-4) + '</span>' : ''}
            </div>
            <div style="font-family:JetBrains Mono,monospace;font-size:18px;font-weight:800;color:#1e293b">${ws.balance} <span style="font-size:12px;color:#94a3b8">USDC</span></div>
          </div>
          ${!ws.connected ? '<div class="gbl-btns" style="margin-top:10px"><button class="gbl-btn gbl-btn-primary" id="gbl-connect">Connect Wallet & Create Smart Account</button></div>' : ''}
          ${ws.connected && !ws.approved ? '<div class="gbl-btns" style="margin-top:10px"><button class="gbl-btn gbl-btn-success" id="gbl-approve">Approve Auto-Trade (max $' + autoTradeConfig.maxPerTrade + '/trade, ' + autoTradeConfig.validDays + ' days)</button></div>' : ''}
        </div>

        <!-- Settings -->
        ${ws.approved ? '<div class="gbl-dash-section"><div class="gbl-dash-label">Settings</div>' +
          [['Max per trade', '$' + autoTradeConfig.maxPerTrade], ['Trading on', 'Kuru DEX'], ['Fee', '0.5% per swap'], ['Session Key', autoTradeConfig.validDays + ' days']].map(function(r) {
            return '<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">' + r[0] + '</span><span style="font-family:JetBrains Mono,monospace;font-weight:700;color:#1e293b">' + r[1] + '</span></div>';
          }).join('') +
        '</div>' : ''}

        <!-- Active Positions (Micro-Execution) -->
        ${ws.autoTradeOn ? '<div class="gbl-dash-section"><div class="gbl-dash-label">Active Positions — AI Micro-Execution</div>' +
          mockPositions.map(function(p) {
            return '<div class="gbl-dash-pos">' +
              '<div class="gbl-dash-pos-header"><div><span class="gbl-dash-pos-token">' + p.token + '</span> <span class="gbl-badge ' + p.dir.toLowerCase() + '" style="margin-left:6px">' + p.dir + '</span></div><span class="gbl-dash-pos-pnl" style="color:' + p.pnlColor + '">' + p.pnl + '</span></div>' +
              '<div class="gbl-dash-micro">' + p.steps.map(function(s) {
                return '<div class="gbl-dash-micro-step"><div class="gbl-dash-micro-bar ' + s.s + '"></div><div class="gbl-dash-micro-label" style="color:' + (s.s === 'done' ? '#22c55e' : s.s === 'paused' ? '#f59e0b' : '#cbd5e1') + '">' + s.l + '</div></div>';
              }).join('') + '</div>' +
              '<div class="gbl-dash-pos-brain">🧠 ' + p.brain + '</div>' +
            '</div>';
          }).join('') +
        '</div>' : ''}

        <!-- Brain Activity -->
        <div class="gbl-dash-section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div class="gbl-dash-label" style="margin-bottom:0">Brain Activity</div>
            <span style="font-size:10px;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.06);padding:3px 10px;border-radius:6px">Live</span>
          </div>
          <div class="gbl-dash-activity" id="gbl-activity">
            ${activities.length > 0 ? activities.map(function(a) {
              var dot = a.type === 'micro_step' ? 'blue' : a.type === 'risk_alert' ? 'amber' : a.type === 'combo_block' || a.type === 'emergency_exit' ? 'red' : 'green';
              return '<div class="gbl-dash-item"><div class="gbl-dash-dot ' + dot + '"></div><div class="gbl-dash-time">' + timeAgo(a.timestamp) + '</div><div class="gbl-dash-text">' + (a.asset ? '<b>' + a.asset + '</b> — ' : '') + a.message + '</div></div>';
            }).join('') : '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:12px">Waiting for Brain signals...</div>'}
          </div>
        </div>

        <!-- Performance -->
        <div class="gbl-dash-section">
          <div class="gbl-dash-label">Performance</div>
          <div class="gbl-dash-stat">
            <div class="gbl-dash-stat-item"><div class="gbl-dash-stat-val" style="color:#22c55e">+$4.50</div><div class="gbl-dash-stat-lbl">Today</div></div>
            <div class="gbl-dash-stat-item"><div class="gbl-dash-stat-val" style="color:#22c55e">67%</div><div class="gbl-dash-stat-lbl">Win Rate</div></div>
            <div class="gbl-dash-stat-item"><div class="gbl-dash-stat-val">12</div><div class="gbl-dash-stat-lbl">Trades</div></div>
            <div class="gbl-dash-stat-item"><div class="gbl-dash-stat-val" style="color:#4f7df9">6</div><div class="gbl-dash-stat-lbl">Micro-Steps</div></div>
          </div>
        </div>

        <div class="gbl-onchain">🔗 All trades AI-Endorsed on Monad · Each micro-step verifiable on-chain</div>
        <div style="margin-top:14px;text-align:center;font-size:10px;color:#94a3b8">Powered by <b style="color:#4f7df9">Galeon Brain Link</b> v${VERSION} · <a href="https://galeon.world/#/brain" target="_blank" style="color:#4f7df9;text-decoration:none">Full Dashboard →</a></div>
      </div>
    `;

    // Bind events
    var toggleEl = el.querySelector('#gbl-toggle-auto');
    if (toggleEl) toggleEl.onclick = function () {
      ws.autoTradeOn = !ws.autoTradeOn;
      renderDashboard(container, data);
    };
    var connectBtn = el.querySelector('#gbl-connect');
    if (connectBtn) connectBtn.onclick = async function () {
      connectBtn.textContent = 'Connecting...';
      await window.GaleonBrainLink.connectWallet();
      renderDashboard(container, data);
    };
    var approveBtn = el.querySelector('#gbl-approve');
    if (approveBtn) approveBtn.onclick = async function () {
      approveBtn.textContent = 'Approving...';
      await window.GaleonBrainLink.enableAutoTrade(autoTradeConfig);
      renderDashboard(container, data);
    };
  }

  // ── Public API ──
  window.GaleonBrainLink = {
    version: VERSION,

    /**
     * Initialize SDK
     */
    init(opts) {
      config.apiUrl = (opts.apiUrl || '').replace(/\/$/, '');
      injectStyles();
      console.log('[GaleonBrainLink] SDK v' + VERSION + ' initialized. API: ' + config.apiUrl);
    },

    /**
     * Mode 1: Pre-trade check popup
     */
    async check(asset, amount, callback) {
      injectStyles();
      var loadEl = document.createElement('div');
      loadEl.className = 'gbl-overlay';
      loadEl.innerHTML = '<div class="gbl-popup"><div class="gbl-loading"><div class="gbl-spinner"></div>Brain is analyzing ' + asset + '...</div></div>';
      document.body.appendChild(loadEl);
      var results = await Promise.all([fetchDecision(asset), fetchAssessRisk(asset, amount)]);
      loadEl.remove();
      if (!results[0] || results[0].error) { callback && callback({ action: 'no_data', asset: asset }); return; }
      showCheckPopup(results[0], results[1], amount, callback);
    },

    /**
     * Mode 2: Connect wallet (MetaMask → Monad → Smart Account)
     */
    async connectWallet() {
      if (!window.ethereum) { alert('Please install MetaMask'); return false; }
      try {
        var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        walletState.address = accounts[0];
        walletState.connected = true;
        walletState.balance = '504.50'; // Mock for demo
        // TODO: Switch to Monad network, create Smart Account
        console.log('[GaleonBrainLink] Wallet connected:', walletState.address);
        return true;
      } catch (e) { console.error('[GaleonBrainLink] Connect failed:', e); return false; }
    },

    /**
     * Mode 2: Enable auto-trade (approve GaleonRouter)
     */
    async enableAutoTrade(opts) {
      autoTradeConfig = Object.assign(autoTradeConfig, opts || {});
      walletState.approved = true;
      walletState.autoTradeOn = true;
      // TODO: Call monadSmartAccount.approveRouter(maxPerTrade * validDays)
      console.log('[GaleonBrainLink] Auto-trade enabled:', autoTradeConfig);
      return true;
    },

    /**
     * Mode 2: Disable auto-trade
     */
    async disableAutoTrade() {
      walletState.autoTradeOn = false;
      console.log('[GaleonBrainLink] Auto-trade disabled');
    },

    /**
     * Mode 2: Render auto-trade dashboard
     */
    async renderDashboard(container, opts) {
      injectStyles();
      var el = typeof container === 'string' ? document.getElementById(container) : container;
      if (!el) return;
      el.innerHTML = '<div class="gbl-dash"><div class="gbl-loading"><div class="gbl-spinner"></div>Loading Brain dashboard...</div></div>';

      var results = await Promise.all([fetchActivity(), fetchAllDecisions()]);
      renderDashboard(container, { activities: results[0], decisions: results[1], positions: [] });

      // Auto-refresh
      if (!opts || opts.autoRefresh !== false) {
        setInterval(async function () {
          var a = await fetchActivity();
          var act = el.querySelector('#gbl-activity');
          if (act && a.length > 0) {
            act.innerHTML = a.map(function(item) {
              var dot = item.type === 'micro_step' ? 'blue' : item.type === 'risk_alert' ? 'amber' : item.type === 'combo_block' ? 'red' : 'green';
              return '<div class="gbl-dash-item"><div class="gbl-dash-dot ' + dot + '"></div><div class="gbl-dash-time">' + timeAgo(item.timestamp) + '</div><div class="gbl-dash-text">' + (item.asset ? '<b>' + item.asset + '</b> — ' : '') + item.message + '</div></div>';
            }).join('');
          }
        }, 5000);
      }
    },

    /**
     * Render simple widget (read-only, no wallet)
     */
    async render(container, opts) {
      injectStyles();
      var el = typeof container === 'string' ? document.getElementById(container) : container;
      if (!el) return;
      el.innerHTML = '<div class="gbl-widget"><div class="gbl-loading"><div class="gbl-spinner"></div>Loading...</div></div>';
      var d = await fetchDecision(opts.asset || 'MON');
      if (!d || d.error) { el.innerHTML = '<div class="gbl-widget"><div style="text-align:center;color:#94a3b8;padding:20px">No data</div></div>'; return; }
      var dir = d.direction || 'WAIT';
      var dirColor = dir === 'LONG' ? '#22c55e' : dir === 'SHORT' ? '#ef4444' : '#f59e0b';
      el.innerHTML = '<div class="gbl-widget"><div class="gbl-widget-header"><span class="gbl-widget-title">🧠 Brain — ' + (d.asset || '') + '</span><span class="gbl-widget-live">Live</span></div><div style="text-align:center;margin-bottom:14px"><div style="font-size:24px;font-weight:800;color:' + dirColor + '">' + dir + '</div><div style="font-size:12px;color:#64748b;margin-top:2px">' + (d.reasoning ? d.reasoning.substring(0, 60) : '') + '</div></div>' +
        [['Confidence', d.confidence + '%', '#4f7df9'], ['Win Rate', d.winRate + '%', '#22c55e'], ['Similar Setups', d.similarSetups, '#1e293b'], ['Risk', d.riskLevel || '—', d.riskLevel === 'HIGH' ? '#ef4444' : '#f59e0b']].map(function(r) {
          return '<div class="gbl-widget-row"><span class="gbl-widget-label">' + r[0] + '</span><span class="gbl-widget-val" style="color:' + r[2] + '">' + r[1] + '</span></div>';
        }).join('') +
        '<div style="margin-top:12px;text-align:center"><span style="font-size:10px;color:#94a3b8">Powered by <b style="color:#4f7df9">Galeon Brain Link</b></span></div></div>';
    },

    /** Get raw decision data */
    async getDecision(asset) { return fetchDecision(asset); },

    /** Get risk assessment */
    async assessRisk(asset, amount) { return fetchAssessRisk(asset, amount); },

    /** Get wallet state */
    getWalletState() { return Object.assign({}, walletState); },
  };
})();

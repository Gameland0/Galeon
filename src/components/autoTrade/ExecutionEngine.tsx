/**
 * ExecutionEngine Tab
 * Created: 2026-09-24
 */

import React, { useState, useEffect, useCallback } from 'react';
import HLAgentSetup from '../brainLink/HLAgentSetup';
import './ExecutionEngine.css';

interface HLConfig {
  connected: boolean;
  masterAddress?: string;
  hl_leverage?: number;
  stop_loss_pct?: number;
  take_profit_pct?: number;
  balance?: number;
  hl_trade_amount?: number | null;
  daily_loss_limit?: number;
}

interface BinanceKeyStatus {
  bound: boolean;
  apiKeyDisplay?: string;
  isValid?: boolean;
  createdAt?: string;
}

interface FeeSummary {
  feeWalletAddress?: string;
  bnbBalance?: number;
  totalBnbPaid?: number;
  totalTransactions?: number;
}

interface Props {
  userId: string;
  token: string;
  binanceKeyStatus: BinanceKeyStatus | null;
  feeSummary: FeeSummary | null;
  feeRecords: any[];
  stats?: any;
}

type EngineType = 'HL' | 'DEX';

const ExecutionEngine: React.FC<Props> = ({ userId, token, stats }) => {
  const [hlConfig, setHLConfig] = useState<HLConfig>({ connected: false });
  const [hlLoading, setHLLoading] = useState(true);
  const [showHLSetup, setShowHLSetup] = useState(false);
  const [expandedEngine, setExpandedEngine] = useState<EngineType | null>(null);
  const [hlDraft, setHLDraft] = useState({ hl_leverage: 3, stop_loss_pct: 7, take_profit_pct: 15, hl_trade_amount: 50, daily_loss_limit: -15 });
  const [tradeAmountInput, setTradeAmountInput] = useState('50');
  const [savingHL, setSavingHL] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [hlEditing, setHLEditing] = useState(false);

  const loadHLStatus = useCallback(async () => {
    if (!token) return;
    setHLLoading(true);
    try {
      const res = await fetch('/api/hl/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      // API returns { configured, hl_enabled, hl_master_wallet, hl_leverage, stop_loss_pct, take_profit_pct }
      const connected = !!(d.configured && d.hl_master_wallet);
      const tradeAmt = d.hl_trade_amount ?? null;
      const lossLimit = d.daily_loss_limit ?? -15;
      setHLConfig({
        connected,
        masterAddress: d.hl_master_wallet,
        hl_leverage: d.hl_leverage ?? 3,
        stop_loss_pct: d.stop_loss_pct ?? 7,
        take_profit_pct: d.take_profit_pct ?? 15,
        balance: 0,
        hl_trade_amount: tradeAmt,
        daily_loss_limit: lossLimit,
      });
      setHLDraft(prev => ({
        ...prev,
        hl_trade_amount: tradeAmt ?? 50,
        daily_loss_limit: lossLimit,
      }));
      setTradeAmountInput(tradeAmt != null ? String(tradeAmt) : '50');
      if (connected) setExpandedEngine('HL');
    } catch {}
    finally { setHLLoading(false); }
  }, [token]);

  useEffect(() => { loadHLStatus(); }, [loadHLStatus]);

  const saveHLConfig = async () => {
    const amt = parseFloat(tradeAmountInput);
    if (isNaN(amt) || amt < 5) {
      setSaveMsg('Per-trade amount must be ≥ $5');
      return;
    }
    setSavingHL(true);
    setSaveMsg('');
    try {
      const payload = { ...hlDraft, hl_trade_amount: amt };
      const res = await fetch('/api/hl/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setHLConfig(prev => ({ ...prev, ...payload }));
        setHLEditing(false);
        setSaveMsg('Saved successfully');
        setTimeout(() => setSaveMsg(''), 3000);
      } else {
        setSaveMsg('Failed: ' + (data.message || data.error || 'unknown error'));
      }
    } catch (e: any) {
      setSaveMsg('Error: ' + e.message);
    } finally {
      setSavingHL(false);
    }
  };

  const activeEngine: EngineType = hlConfig.connected ? 'HL' : 'DEX';

  const engineLabel: Record<EngineType, string> = {
    HL: 'Hyperliquid Perps',
    DEX: 'On-chain DEX',
  };

  const handleHLSetupComplete = (_masterAddress: string) => {
    setShowHLSetup(false);
    loadHLStatus();
  };

  const renderHLExpand = () => (
    <div className="ee-expand-panel">
      <div className="ee-expand-title">Hyperliquid Settings</div>

      <div className="ee-balance-row">
        <div>
          <div className="ee-bal-label">Connected Account</div>
          {hlConfig.masterAddress && (
            <div className="ee-bal-addr">
              {hlConfig.masterAddress.slice(0, 6)}...{hlConfig.masterAddress.slice(-4)}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="ee-bal-val" style={{ color: '#16a34a', fontSize: 13 }}>● Active</div>
          <div className="ee-bal-unit" style={{ fontSize: 12, color: '#6b7280' }}>Brain-managed</div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#6b7280', padding: '6px 0 12px' }}>
        Leverage, stop loss, and take profit are automatically managed by Galeon Brain.
      </div>

      {saveMsg && (
        <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, margin: '0 0 12px',
          background: saveMsg.includes('success') ? '#f0fdf4' : '#fef2f2',
          color: saveMsg.includes('success') ? '#16a34a' : '#dc2626' }}>
          {saveMsg}
        </div>
      )}

      {!hlEditing ? (
        /* ── View Mode ── */
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Per-Trade Amount</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>${hlConfig.hl_trade_amount ?? '—'} USDC</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Daily Loss Limit</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>{hlConfig.daily_loss_limit ?? -15}%</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="ee-btn-save-sm" onClick={() => setHLEditing(true)} style={{ flex: 1 }}>
              Edit Settings
            </button>
            <button
              className="ee-btn-save-sm"
              style={{ background: '#fee2e2', color: '#dc2626' }}
              onClick={() => setShowHLSetup(true)}
            >
              Re-authorize
            </button>
          </div>
        </>
      ) : (
        /* ── Edit Mode ── */
        <>
          <div className="ee-param-item">
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Per-Trade Amount (USDC)</label>
            <input
              type="number"
              min={5}
              step={5}
              value={tradeAmountInput}
              onChange={e => {
                setTradeAmountInput(e.target.value);
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) setHLDraft(d => ({ ...d, hl_trade_amount: v }));
              }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, marginTop: 6 }}
            />
            <div className="ee-param-hint">Amount per signal · Minimum $5</div>
          </div>

          <div className="ee-param-item" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Daily Loss Limit</label>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{hlDraft.daily_loss_limit}%</span>
            </div>
            <input
              type="range" min={-50} max={-1} step={1} value={hlDraft.daily_loss_limit}
              onChange={e => setHLDraft(d => ({ ...d, daily_loss_limit: parseFloat(e.target.value) }))}
              style={{ width: '100%', marginTop: 6 }}
            />
            <div className="ee-param-hint">Auto-pause trading if daily loss reaches this · Range −1% to −50%</div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="ee-btn-save-sm" onClick={saveHLConfig} disabled={savingHL} style={{ flex: 1 }}>
              {savingHL ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              className="ee-btn-save-sm"
              style={{ background: '#f3f4f6', color: '#374151' }}
              onClick={() => { setHLEditing(false); setSaveMsg(''); }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="ee-panel">

      {showHLSetup && (
        <div className="ee-modal-overlay" onClick={() => setShowHLSetup(false)}>
          <div onClick={e => e.stopPropagation()}>
            <HLAgentSetup
              onComplete={handleHLSetupComplete}
              onClose={() => setShowHLSetup(false)}
            />
          </div>
        </div>
      )}

      {/* Active Engine Banner */}
      <div className="ee-active-banner">
        <div className="ee-active-left">
          <div className="ee-active-dot" />
          <div>
            <div className="ee-active-label">Active Engine</div>
            <div className="ee-active-name">{engineLabel[activeEngine]}</div>
          </div>
        </div>
        <div className="ee-active-hint">Alpha signals will execute through this engine</div>
      </div>

      {/* Perp DEX */}
      <div className="ee-section-title">Perpetual DEX</div>
      <div className="ee-engine-list">

        {/* Hyperliquid */}
        <div>
          <div className={`ee-engine-card ${activeEngine === 'HL' ? 'card-active' : ''} ${hlConfig.connected ? 'card-connected' : ''}`}>
            <div className="ee-engine-icon icon-hl">🔷</div>
            <div className="ee-engine-info">
              <div className="ee-engine-name">Hyperliquid</div>
              <div className="ee-engine-desc">On-chain perps · Auto SL/TP · No gas required</div>
            </div>
            {hlLoading ? (
              <div className="ee-status status-idle">Loading...</div>
            ) : hlConfig.connected ? (
              <div className="ee-status status-active">● Active</div>
            ) : (
              <div className="ee-status status-idle">Not connected</div>
            )}
            <div className="ee-actions">
              {hlConfig.connected ? (
                <button
                  className="ee-btn-config"
                  onClick={() => setExpandedEngine(expandedEngine === 'HL' ? null : 'HL')}
                >
                  {expandedEngine === 'HL' ? 'Collapse' : 'Settings'}
                </button>
              ) : (
                <button className="ee-btn-connect" onClick={() => setShowHLSetup(true)}>
                  Connect
                </button>
              )}
            </div>
          </div>
          {expandedEngine === 'HL' && hlConfig.connected && renderHLExpand()}
        </div>

        {/* dYdX v4 */}
        <div className="ee-engine-card card-coming-soon">
          <div className="ee-engine-icon icon-dydx">〽️</div>
          <div className="ee-engine-info">
            <div className="ee-engine-name">dYdX v4</div>
            <div className="ee-engine-desc">Cosmos-based perps · Zero gas · Deep liquidity</div>
          </div>
          <div className="ee-status status-soon">Coming soon</div>
        </div>

        {/* GMX v2 */}
        <div className="ee-engine-card card-coming-soon">
          <div className="ee-engine-icon icon-gmx">🔵</div>
          <div className="ee-engine-info">
            <div className="ee-engine-name">GMX v2</div>
            <div className="ee-engine-desc">Arbitrum perps · GLP liquidity · Low slippage</div>
          </div>
          <div className="ee-status status-soon">Coming soon</div>
        </div>
      </div>

      {/* On-chain DEX */}
      <div className="ee-section-title">On-chain DEX (Default)</div>
      <div className="ee-engine-list">
        <div className={`ee-engine-card ${activeEngine === 'DEX' ? 'card-active' : ''}`}>
          <div className="ee-engine-icon icon-dex">⚡</div>
          <div className="ee-engine-info">
            <div className="ee-engine-name">DEX Spot</div>
            <div className="ee-engine-desc">BSC / Base · Wallet-signed · Direct Alpha signal execution</div>
          </div>
          <div className={`ee-status ${activeEngine === 'DEX' ? 'status-active' : 'status-idle'}`}>
            {activeEngine === 'DEX' ? '● Active' : 'Standby'}
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="ee-stats">
          <div className="ee-stat">
            <div className="ee-stat-label">Trades</div>
            <div className="ee-stat-val">{stats.totalTrades ?? '—'}</div>
          </div>
          <div className="ee-stat">
            <div className="ee-stat-label">Win Rate</div>
            <div className="ee-stat-val">{stats.winRate ? `${stats.winRate}%` : '—'}</div>
          </div>
          <div className="ee-stat">
            <div className="ee-stat-label">Total PnL</div>
            <div className={`ee-stat-val ${parseFloat(stats.totalProfit ?? 0) >= 0 ? 'val-green' : 'val-red'}`}>
              {parseFloat(stats.totalProfit ?? 0) >= 0 ? '+' : ''}${stats.totalProfit ?? '—'}
            </div>
          </div>
          <div className="ee-stat">
            <div className="ee-stat-label">Positions</div>
            <div className="ee-stat-val">{stats.currentPositions ?? 0}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ParamSlider: React.FC<{
  label: string; hint: string;
  value: number; min: number; max: number; step: number; suffix: string;
  onChange: (v: number) => void;
}> = ({ label, hint, value, min, max, step, suffix, onChange }) => (
  <div className="ee-param-item">
    <label>{label}</label>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
    />
    <div className="ee-param-val">{value}{suffix}</div>
    <div className="ee-param-hint">{hint}</div>
  </div>
);

export default ExecutionEngine;

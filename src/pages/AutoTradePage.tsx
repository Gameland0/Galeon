/**
 * Auto Trading Configuration页面
 * Features:
 * 1. 钱包管理
 * 2. 自动交易配置
 * 3. Positions管理
 * 4. Trade History
 */

import React, { useState, useEffect } from 'react';
import { useWallet } from '../contexts/PrivyWalletContext';
import { usePrivy } from '@privy-io/react-auth';
import WalletManager from '../components/autoTrade/WalletManager';
import PositionManager from '../components/autoTrade/PositionManager';
import TradeLogs from '../components/autoTrade/TradeLogs';
import ExecutionEngine from '../components/autoTrade/ExecutionEngine';
import { getBinanceKeyStatus, getFeeSummary, getFeeHistory } from '../services/api';
import './AutoTradePage.css';

interface AutoTradeConfig {
  enabled: boolean;
  maxTradeAmount: number;
  maxSlippage: number;
  maxPositions: number;
  dailyLossLimit: number;
  singleTokenMaxPercent: number;
  supportedChains: string[];
  takeProfitStrategy: 'ONE_TIME' | 'LADDERED';
}

export default function AutoTradePage() {
  const { isConnected, address } = useWallet();
  const { getAccessToken } = usePrivy();
  const [activeTab, setActiveTab] = useState<'wallet' | 'settings' | 'positions' | 'history' | 'engine'>('wallet');
  const [config, setConfig] = useState<AutoTradeConfig>({
    enabled: false,
    maxTradeAmount: 100,
    maxSlippage: 2.0,
    maxPositions: 3,
    dailyLossLimit: -10,
    singleTokenMaxPercent: 30,
    supportedChains: ['BSC'],
    takeProfitStrategy: 'ONE_TIME',
  });
  const [stats, setStats] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // CEX状态
  const [binanceKeyStatus, setBinanceKeyStatus] = useState<any>(null);
  const [feeSummary, setFeeSummary] = useState<any>(null);
  const [feeRecords, setFeeRecords] = useState<any[]>([]);
  const [feeLoading, setFeeLoading] = useState(false);

  /**
   * Loading用户配置和Statistics
   */
  useEffect(() => {
    if (isConnected && address) {
      loadUserConfig();
      loadUserStats();
      loadCexStatus();
      getAccessToken().then(t => setToken(t)).catch(() => {});
    }
  }, [isConnected, address]);

  const loadCexStatus = async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const [keyRes, feeRes, histRes] = await Promise.all([
        getBinanceKeyStatus(token),
        getFeeSummary(token),
        getFeeHistory(token, 1, 10)
      ]);
      if (keyRes.success) setBinanceKeyStatus(keyRes.data);
      if (feeRes.success) setFeeSummary(feeRes.data);
      if (histRes.success) setFeeRecords(histRes.data?.records || []);
    } catch (e) {
      // CEX数据加载失败不影响主页面
    }
  };

  const loadUserConfig = async () => {
    try {
      const response = await fetch(`/api/auto-trade/config/${address}`);
      const data = await response.json();

      if (data.success && data.data) {
        setConfig({
          enabled: data.data.enabled,
          maxTradeAmount: parseFloat(data.data.max_trade_amount),
          maxSlippage: parseFloat(data.data.max_slippage_percent),
          maxPositions: data.data.max_positions,
          dailyLossLimit: parseFloat(data.data.daily_loss_limit),
          singleTokenMaxPercent: parseFloat(data.data.single_token_max_percent),
          supportedChains: data.data.supported_chains || ['BSC'],
          takeProfitStrategy: data.data.take_profit_strategy || 'ONE_TIME',
        });
      }
    } catch (error) {
      // console.error('Loading配置失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserStats = async () => {
    try {
      const response = await fetch(`/api/auto-trade/stats/${address}`);
      const data = await response.json();

      if (data.success) {
        setStats(data.data.stats);
      }
    } catch (error) {
      // console.error('LoadingStatistics失败:', error);
    }
  };

  /**
   * Save Configuration
   */
  const handleSaveConfig = async () => {
    if (!address) return;

    setIsSaving(true);

    try {
      const response = await fetch('/api/auto-trade/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: address,
          max_trade_amount: config.maxTradeAmount,
          max_slippage_percent: config.maxSlippage,
          max_positions: config.maxPositions,
          daily_loss_limit: config.dailyLossLimit,
          single_token_max_percent: config.singleTokenMaxPercent,
          supported_chains: config.supportedChains,
          take_profit_strategy: config.takeProfitStrategy,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('配置Save成功!');
      } else {
        alert('Failed to save: ' + data.message);
      }
    } catch (error) {
      // console.error('Save Configuration失败:', error);
      alert('Failed to save，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 切换自动交易开关
   */
  const handleToggleAutoTrade = async () => {
    if (!address) return;

    const newEnabled = !config.enabled;

    try {
      const response = await fetch('/api/auto-trade/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: address,
          enabled: newEnabled,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setConfig({ ...config, enabled: newEnabled });
        alert(newEnabled ? '自动交易已Enabled!' : '自动交易已Disabled');
      } else {
        alert('Action失败: ' + data.message);
      }
    } catch (error) {
      // console.error('切换失败:', error);
      alert('Action失败，请重试');
    }
  };

  /**
   * Settings选项卡
   */
  const renderTabs = () => (
    <div className="tabs">
      <button
        className={`tab ${activeTab === 'wallet' ? 'active' : ''}`}
        onClick={() => setActiveTab('wallet')}
      >
        <span className="tab-icon">💼</span>
        <span>钱包管理</span>
      </button>
      <button
        className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => setActiveTab('settings')}
      >
        <span className="tab-icon">⚙️</span>
        <span>交易Settings</span>
      </button>
      <button
        className={`tab ${activeTab === 'positions' ? 'active' : ''}`}
        onClick={() => setActiveTab('positions')}
      >
        <span className="tab-icon">📊</span>
        <span>Positions管理</span>
        {stats && stats.currentPositions > 0 && (
          <span className="badge">{stats.currentPositions}</span>
        )}
      </button>
      <button
        className={`tab ${activeTab === 'history' ? 'active' : ''}`}
        onClick={() => setActiveTab('history')}
      >
        <span className="tab-icon">📜</span>
        <span>Trade History</span>
      </button>
      <button
        className={`tab ${activeTab === 'engine' ? 'active' : ''}`}
        onClick={() => setActiveTab('engine')}
      >
        <span className="tab-icon">🔌</span>
        <span>执行引擎</span>
      </button>
    </div>
  );

  /**
   * Settings面板
   */
  const renderSettings = () => (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Auto Trading Configuration</h2>
        <div className="auto-trade-toggle">
          <label className="switch">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={handleToggleAutoTrade}
            />
            <span className="slider"></span>
          </label>
          <span className={`toggle-label ${config.enabled ? 'enabled' : 'disabled'}`}>
            {config.enabled ? '已Enabled' : '已Disabled'}
          </span>
        </div>
      </div>

      {!config.enabled && (
        <div className="disabled-notice">
          <div className="notice-icon">⏸️</div>
          <p>自动交易当前已Disabled，开启后系统将根据 Alpha 信号自动执行交易</p>
        </div>
      )}

      <div className="settings-sections">
        {/* 基础Settings */}
        <div className="settings-section">
          <h3>基础Settings</h3>

          <div className="setting-item">
            <label>单笔最大金额 (USDT)</label>
            <input
              type="number"
              value={config.maxTradeAmount}
              onChange={(e) => setConfig({ ...config, maxTradeAmount: parseFloat(e.target.value) })}
              min="10"
              max="10000"
              step="10"
            />
            <p className="setting-hint">每次自动交易的最大金额</p>
          </div>

          <div className="setting-item">
            <label>最大滑点 (%)</label>
            <input
              type="number"
              value={config.maxSlippage}
              onChange={(e) => setConfig({ ...config, maxSlippage: parseFloat(e.target.value) })}
              min="0.5"
              max="10"
              step="0.1"
            />
            <p className="setting-hint">允许的最大价格滑点</p>
          </div>

          <div className="setting-item">
            <label>Max Positions</label>
            <input
              type="number"
              value={config.maxPositions}
              onChange={(e) => setConfig({ ...config, maxPositions: parseInt(e.target.value) })}
              min="1"
              max="10"
            />
            <p className="setting-hint">同时持有的最大Token数量</p>
          </div>
        </div>

        {/* 风控Settings */}
        <div className="settings-section">
          <h3>风险控制</h3>

          <div className="setting-item">
            <label>单日Loss限制 (%)</label>
            <input
              type="number"
              value={config.dailyLossLimit}
              onChange={(e) => setConfig({ ...config, dailyLossLimit: parseFloat(e.target.value) })}
              min="-50"
              max="-1"
              step="1"
            />
            <p className="setting-hint">单日Loss达到此比例时暂停交易</p>
          </div>

          <div className="setting-item">
            <label>单Token最大仓位 (%)</label>
            <input
              type="number"
              value={config.singleTokenMaxPercent}
              onChange={(e) => setConfig({ ...config, singleTokenMaxPercent: parseFloat(e.target.value) })}
              min="10"
              max="100"
              step="5"
            />
            <p className="setting-hint">单个Token占总资金的最大比例</p>
          </div>
        </div>

        {/* 高级Settings */}
        <div className="settings-section">
          <h3>高级Settings</h3>

          <div className="setting-item">
            <label>支持的Chain</label>
            <div className="chain-selector">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.supportedChains.includes('BSC')}
                  onChange={(e) => {
                    const chains = e.target.checked
                      ? [...config.supportedChains, 'BSC']
                      : config.supportedChains.filter(c => c !== 'BSC');
                    setConfig({ ...config, supportedChains: chains });
                  }}
                />
                <span>BSC (BNB Smart Chain)</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.supportedChains.includes('Base')}
                  onChange={(e) => {
                    const chains = e.target.checked
                      ? [...config.supportedChains, 'Base']
                      : config.supportedChains.filter(c => c !== 'Base');
                    setConfig({ ...config, supportedChains: chains });
                  }}
                />
                <span>Base (Coinbase L2)</span>
              </label>
            </div>
          </div>

          <div className="setting-item">
            <label>Take Profit策略</label>
            <select
              value={config.takeProfitStrategy}
              onChange={(e) => setConfig({ ...config, takeProfitStrategy: e.target.value as any })}
            >
              <option value="ONE_TIME">一次性Take Profit</option>
              <option value="LADDERED">阶梯Take Profit</option>
            </select>
            <p className="setting-hint">
              {config.takeProfitStrategy === 'ONE_TIME'
                ? '达到目标价格时All卖出'
                : '分批卖出，降低风险'}
            </p>
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button
          className="btn-save"
          onClick={handleSaveConfig}
          disabled={isSaving}
        >
          {isSaving ? 'Save中...' : 'SaveSettings'}
        </button>
        <button className="btn-reset" onClick={loadUserConfig}>
          重置
        </button>
      </div>

      {/* Statistics信息 */}
      {stats && (
        <div className="stats-summary">
          <h3>交易Statistics</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">总交易</div>
              <div className="stat-value">{stats.totalTrades}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">胜率</div>
              <div className="stat-value">{stats.winRate}%</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Total P&L</div>
              <div className={`stat-value ${parseFloat(stats.totalProfit) >= 0 ? 'profit' : 'loss'}`}>
                ${stats.totalProfit}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Current Positions</div>
              <div className="stat-value">{stats.currentPositions}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /**
   * CEX面板
   */
  const renderCex = () => (
    <div className="settings-panel">
      {/* 币安API Key状态 */}
      <div className="settings-section">
        <h3>🔑 币安API Key</h3>
        {binanceKeyStatus?.bound ? (
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">Key</div>
              <div className="stat-value" style={{ fontSize: '14px' }}>{binanceKeyStatus.apiKeyDisplay}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">状态</div>
              <div className={`stat-value ${binanceKeyStatus.isValid ? 'profit' : 'loss'}`}>
                {binanceKeyStatus.isValid ? '✅ 有效' : '❌ 已失效'}
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-label">绑定时间</div>
              <div className="stat-value" style={{ fontSize: '12px' }}>
                {binanceKeyStatus.createdAt ? new Date(binanceKeyStatus.createdAt).toLocaleDateString() : '—'}
              </div>
            </div>
          </div>
        ) : (
          <div className="disabled-notice">
            <div className="notice-icon">🔑</div>
            <p>未绑定币安API Key。请在Telegram Bot中使用 /bindkey 命令绑定。</p>
          </div>
        )}
      </div>

      {/* 手续费钱包 */}
      <div className="settings-section">
        <h3>💰 手续费钱包 (BNB)</h3>
        {feeSummary ? (
          <>
            {feeSummary.feeWalletAddress && (
              <div className="setting-item">
                <label>钱包地址</label>
                <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>{feeSummary.feeWalletAddress}</code>
              </div>
            )}
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-label">BNB余额</div>
                <div className="stat-value">{feeSummary.bnbBalance?.toFixed(6) || '0'}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">累计手续费</div>
                <div className="stat-value">{feeSummary.totalBnbPaid?.toFixed(6) || '0'} BNB</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">交易笔数</div>
                <div className="stat-value">{feeSummary.totalTransactions || 0}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">费率</div>
                <div className="stat-value">0.2%</div>
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: '#888' }}>暂无数据</p>
        )}
      </div>

      {/* 手续费记录 */}
      <div className="settings-section">
        <h3>📋 最近手续费记录</h3>
        {feeRecords.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333' }}>
                  <th style={{ padding: '8px 4px', textAlign: 'left' }}>时间</th>
                  <th style={{ padding: '8px 4px', textAlign: 'left' }}>币种</th>
                  <th style={{ padding: '8px 4px', textAlign: 'right' }}>交易额</th>
                  <th style={{ padding: '8px 4px', textAlign: 'right' }}>手续费</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center' }}>状态</th>
                </tr>
              </thead>
              <tbody>
                {feeRecords.map((r: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '6px 4px' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '—'}
                    </td>
                    <td style={{ padding: '6px 4px' }}>{r.binance_symbol || r.token_symbol || '—'}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                      ${parseFloat(r.trade_amount_usdt || 0).toFixed(0)}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                      {parseFloat(r.fee_amount || 0).toFixed(6)} BNB
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      {r.status === 'SUCCESS' ? '✅' : r.refund_tx_hash ? '↩️' : '❌'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: '#888' }}>暂无手续费记录。开启CEX自动交易后，每笔开仓会收取0.2%手续费。</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="auto-trade-page">
      <div className="page-header">
        <h1>自动交易</h1>
        <p className="page-description">
          基于 Alpha 信号的自动交易系统，支持 DEX 限价入场和Take ProfitStop Loss
        </p>
      </div>

      {renderTabs()}

      <div className="page-content">
        {activeTab === 'wallet' && <WalletManager />}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'positions' && address && <PositionManager userId={address} />}
        {activeTab === 'history' && address && <TradeLogs userId={address} />}
        {activeTab === 'engine' && address && (
          <ExecutionEngine
            userId={address}
            token={token || ''}
            binanceKeyStatus={binanceKeyStatus}
            feeSummary={feeSummary}
            feeRecords={feeRecords}
            stats={stats}
          />
        )}
      </div>
    </div>
  );
}

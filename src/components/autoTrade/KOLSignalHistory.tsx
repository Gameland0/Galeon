/**
 * KOL 信号历史弹窗组件
 * 功能:
 * 1. 显示所有 KOL 信号历史
 * 2. 统计信息 (总信号数、胜率、最佳 KOL)
 * 3. 过滤和排序
 * 4. 信号详情展示
 */

import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import * as twitterApi from '../../services/twitterSignalApi';
import './KOLSignalHistory.css';

interface KOLSignalHistoryProps {
  strategyId: number;
  onClose: () => void;
}

export function KOLSignalHistory({ strategyId, onClose }: KOLSignalHistoryProps) {
  const { getAccessToken } = usePrivy();

  const [signals, setSignals] = useState<twitterApi.TwitterSignal[]>([]);
  const [stats, setStats] = useState<twitterApi.SignalHistoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 过滤条件
  const [filter, setFilter] = useState({
    kolHandle: 'all',
    signalType: 'all',
    result: 'all'
  });

  // 加载信号历史
  useEffect(() => {
    loadSignalHistory();
  }, [strategyId]);

  const loadSignalHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError('Please login first');
        return;
      }

      const response = await twitterApi.getSignalHistory(strategyId, accessToken, {
        limit: 100,
        offset: 0
      });

      setSignals(response.history);
      setStats(response.stats);

    } catch (error: any) {
      console.error('Failed to load signal history:', error);
      setError(error.response?.data?.error || 'Failed to load signal history');
    } finally {
      setIsLoading(false);
    }
  };

  // 应用过滤
  const filteredSignals = signals.filter(signal => {
    if (filter.kolHandle !== 'all' && signal.kol_handle !== filter.kolHandle) return false;
    if (filter.signalType !== 'all' && signal.signal_type !== filter.signalType) return false;
    if (filter.result !== 'all' && signal.result !== filter.result) return false;
    return true;
  });

  // 获取所有唯一的 KOL
  const allKOLs = Array.from(new Set(signals.map(s => s.kol_handle)));

  // 计算最佳 KOL
  const bestKOL = allKOLs.map(handle => {
    const kolSignals = signals.filter(s => s.kol_handle === handle && s.executed && s.result !== 'OPEN');
    const wins = kolSignals.filter(s => s.result === 'WIN').length;
    const total = kolSignals.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    return { handle, winRate, total };
  }).sort((a, b) => b.winRate - a.winRate)[0];

  // 格式化时间
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content kol-signal-history" onClick={(e) => e.stopPropagation()}>
        <button className="btn-close" onClick={onClose}>✕</button>

        {/* Statistics Cards */}
        {stats && (
          <div className="stats-cards">
            <div className="stat-card">
              <div className="stat-icon">📢</div>
              <div className="stat-info">
                <span className="stat-label">Total Signals</span>
                <span className="stat-value">{stats.total_signals}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-info">
                <span className="stat-label">Executed</span>
                <span className="stat-value">{stats.executed_count}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🏆</div>
              <div className="stat-info">
                <span className="stat-label">Win Rate</span>
                <span className={`stat-value ${(stats.wins / (stats.wins + stats.losses)) * 100 >= 70 ? 'positive' : 'negative'}`}>
                  {stats.wins + stats.losses > 0
                    ? `${((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)}%`
                    : 'N/A'}
                </span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-info">
                <span className="stat-label">Total P&L</span>
                <span className={`stat-value ${parseFloat(String(stats.total_profit ?? 0)) >= 0 ? 'positive' : 'negative'}`}>
                  ${parseFloat(String(stats.total_profit ?? 0)).toFixed(2)}
                </span>
              </div>
            </div>

            {bestKOL && bestKOL.total > 0 && (
              <div className="stat-card">
                <div className="stat-icon">👑</div>
                <div className="stat-info">
                  <span className="stat-label">Best KOL</span>
                  <span className="stat-value">@{bestKOL.handle}</span>
                  <span className="stat-sublabel">{bestKOL.winRate.toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="filters">
          <div className="filter-group">
            <label>KOL:</label>
            <select value={filter.kolHandle} onChange={(e) => setFilter({ ...filter, kolHandle: e.target.value })}>
              <option value="all">All KOLs</option>
              {allKOLs.map(handle => (
                <option key={handle} value={handle}>@{handle}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Signal Type:</label>
            <select value={filter.signalType} onChange={(e) => setFilter({ ...filter, signalType: e.target.value })}>
              <option value="all">All</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Result:</label>
            <select value={filter.result} onChange={(e) => setFilter({ ...filter, result: e.target.value })}>
              <option value="all">All</option>
              <option value="OPEN">OPEN</option>
              <option value="WIN">WIN</option>
              <option value="LOSS">LOSS</option>
            </select>
          </div>

          <button className="btn-refresh" onClick={loadSignalHistory} disabled={isLoading}>
            {isLoading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error">
            ❌ {error}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading signal history...</p>
          </div>
        )}

        {/* Signal Table */}
        {!isLoading && filteredSignals.length === 0 && (
          <div className="empty-state">
            <p>No signals found</p>
          </div>
        )}

        {!isLoading && filteredSignals.length > 0 && (
          <div className="signal-table-container">
            <table className="signal-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>KOL</th>
                  <th>Token</th>
                  <th>Signal</th>
                  <th>Score</th>
                  <th>Executed</th>
                  <th>Result</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {filteredSignals.map(signal => (
                  <tr key={signal.id}>
                    <td className="time-cell" title={new Date(signal.detected_at).toLocaleString()}>
                      {formatDate(signal.detected_at)}
                    </td>
                    <td className="kol-cell">
                      <a
                        href={`https://twitter.com/${signal.kol_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="kol-link"
                      >
                        @{signal.kol_handle}
                      </a>
                    </td>
                    <td className="token-cell">{signal.token_symbol}</td>
                    <td className="signal-type-cell">
                      <span className={`signal-badge ${signal.signal_type.toLowerCase()}`}>
                        {signal.signal_type}
                      </span>
                    </td>
                    <td className="score-cell">{signal.final_score.toFixed(1)}</td>
                    <td className="executed-cell">
                      {signal.executed ? (
                        <span className="status-icon executed">✅</span>
                      ) : (
                        <span className="status-icon not-executed" title={signal.rejection_reason || 'Not executed'}>
                          ❌
                        </span>
                      )}
                    </td>
                    <td className="result-cell">
                      <span className={`result-badge ${signal.result.toLowerCase()}`}>
                        {signal.result}
                      </span>
                    </td>
                    <td className="pnl-cell">
                      {signal.profit_loss_usdt !== null ? (
                        <span className={signal.profit_loss_usdt >= 0 ? 'positive' : 'negative'}>
                          ${signal.profit_loss_usdt.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <p className="footer-text">
            Showing {filteredSignals.length} of {signals.length} signals
          </p>
        </div>
      </div>
    </div>
  );
}

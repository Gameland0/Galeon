/**
 * Telegram Signal History Modal Component
 * Displays Telegram group signal history using the correct telegram API
 */

import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import * as telegramApi from '../../services/telegramSignalApi';
import './KOLSignalHistory.css';

interface TelegramSignalHistoryProps {
  strategyId: number;
  onClose: () => void;
}

interface TelegramSignalData {
  signalId: string;
  chatId: number;
  chatTitle: string;
  messageText: string;
  tokens: Array<{ symbol: string; chain?: string; contractAddress?: string }>;
  aiScore: number;
  signalType: string;
  tradeExecuted: boolean;
  tradeResult?: string;
  createdAt: string;
  processedAt?: string;
}

export function TelegramSignalHistory({ strategyId, onClose }: TelegramSignalHistoryProps) {
  const { getAccessToken } = usePrivy();

  const [signals, setSignals] = useState<TelegramSignalData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Filters
  const [filter, setFilter] = useState({
    signalType: 'all',
    executed: 'all'
  });

  // Load signal history
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

      const response = await telegramApi.getSignalHistory(strategyId, accessToken, {
        limit: 100,
        offset: 0
      });

      setSignals(response.signals as TelegramSignalData[]);
      setTotal(response.total);

    } catch (error: any) {
      console.error('Failed to load Telegram signal history:', error);
      setError(error.response?.data?.error || 'Failed to load signal history');
    } finally {
      setIsLoading(false);
    }
  };

  // Apply filters
  const filteredSignals = signals.filter(signal => {
    if (filter.signalType !== 'all' && signal.signalType !== filter.signalType) return false;
    if (filter.executed !== 'all') {
      const executed = filter.executed === 'yes';
      if (signal.tradeExecuted !== executed) return false;
    }
    return true;
  });

  // Get unique groups for stats
  const uniqueGroups = Array.from(new Set(signals.map(s => s.chatTitle)));

  // Calculate stats
  const executedCount = signals.filter(s => s.tradeExecuted).length;
  const avgScore = signals.length > 0
    ? signals.reduce((sum, s) => sum + (s.aiScore || 0), 0) / signals.length
    : 0;

  // Format time
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Truncate message
  const truncateMessage = (text: string, maxLen: number = 100) => {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content kol-signal-history" onClick={(e) => e.stopPropagation()}>
        <button className="btn-close" onClick={onClose}>x</button>

        <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>Telegram Signal History</span>
        </h2>

        {/* Statistics Cards */}
        <div className="stats-cards">
          <div className="stat-card">
            <div className="stat-icon">📨</div>
            <div className="stat-info">
              <span className="stat-label">Total Signals</span>
              <span className="stat-value">{total}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-info">
              <span className="stat-label">Executed</span>
              <span className="stat-value">{executedCount}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-info">
              <span className="stat-label">Avg AI Score</span>
              <span className="stat-value">{avgScore.toFixed(1)}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💬</div>
            <div className="stat-info">
              <span className="stat-label">Groups</span>
              <span className="stat-value">{uniqueGroups.length}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters">
          <div className="filter-group">
            <label>Signal Type:</label>
            <select value={filter.signalType} onChange={(e) => setFilter({ ...filter, signalType: e.target.value })}>
              <option value="all">All</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Executed:</label>
            <select value={filter.executed} onChange={(e) => setFilter({ ...filter, executed: e.target.value })}>
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <button className="btn-refresh" onClick={loadSignalHistory} disabled={isLoading}>
            {isLoading ? '...' : 'Refresh'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error">
            {error}
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
                  <th>Group</th>
                  <th>Tokens</th>
                  <th>Signal</th>
                  <th>AI Score</th>
                  <th>Executed</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {filteredSignals.map(signal => (
                  <tr key={signal.signalId}>
                    <td className="time-cell" title={new Date(signal.createdAt).toLocaleString()}>
                      {formatDate(signal.createdAt)}
                    </td>
                    <td className="kol-cell" title={signal.chatTitle}>
                      {truncateMessage(signal.chatTitle, 20)}
                    </td>
                    <td className="token-cell">
                      {signal.tokens.map(t => t.symbol).join(', ') || '-'}
                    </td>
                    <td className="signal-type-cell">
                      <span className={`signal-badge ${signal.signalType?.toLowerCase()}`}>
                        {signal.signalType || 'N/A'}
                      </span>
                    </td>
                    <td className="score-cell">{signal.aiScore?.toFixed(1) || '-'}</td>
                    <td className="executed-cell">
                      {signal.tradeExecuted ? (
                        <span className="status-icon executed">Yes</span>
                      ) : (
                        <span className="status-icon not-executed">No</span>
                      )}
                    </td>
                    <td className="result-cell">
                      {signal.tradeResult ? (
                        <span className={`result-badge ${signal.tradeResult.toLowerCase()}`}>
                          {signal.tradeResult}
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

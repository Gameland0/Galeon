/**
 * Trade Logs Component
 * Features:
 * 1. Display trade history
 * 2. Filter and sort
 * 3. View trade details
 */

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './TradeLogs.css';

interface TradeLog {
  execution_id: string;
  token_symbol: string;
  chain: string;
  entry_price: number;
  exit_price: number;
  entry_amount_usdt: number;
  profit_loss_usdt: number;
  profit_loss_percent: number;
  exit_type: string;
  entry_executed_at: string;
  exit_executed_at: string;
  entry_tx_hash: string;
  exit_tx_hash: string;
}

interface TradeLogsProps {
  userId: string;
}

interface ReviewReport {
  period_trades: number;
  period_wins: number;
  period_losses: number;
  period_win_rate: number;
  period_pnl: number;
  avg_profit: number;
  avg_loss: number;
  profit_factor: number;
  avg_hold_seconds: number;
  sl_hit_count: number;
  tp_hit_count: number;
  consecutive_losses: number;
  problems: Array<{ code: string; severity: string; message: string }>;
  suggestions: Array<{ param: string; current?: number; suggested?: number; reason: string; action?: string; token?: string; applied?: boolean }>;
  ai_analysis: string | null;
  review_date: string;
  applied: number;
}

export default function TradeLogs({ userId }: TradeLogsProps) {
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'profit' | 'loss'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<TradeLog | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [review, setReview] = useState<ReviewReport | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [applyingParam, setApplyingParam] = useState<string | null>(null);
  // 🔧 新增: 从后端API获取完整统计数据
  const [stats, setStats] = useState({
    total: 0,
    profit: 0,
    loss: 0,
    totalPnL: 0,
  });

  /**
   * Load trade history
   */
  const loadTradeLogs = async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/auto-trade/history/${userId}?page=${page}&limit=20`);
      const data = await response.json();

      if (data.success) {
        setLogs(data.data.trades);
        setTotalPages(data.data.pagination.pages);
      }
    } catch (error) {
      // console.error('Failed to load history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 🔧 新增: 加载完整统计数据
   */
  const loadStats = async () => {
    try {
      const response = await fetch(`/api/auto-trade/stats/${userId}`);
      const data = await response.json();

      if (data.success && data.data.stats) {
        const apiStats = data.data.stats;
        setStats({
          total: apiStats.totalTrades || 0,
          profit: apiStats.winTrades || 0,
          loss: (apiStats.totalTrades || 0) - (apiStats.winTrades || 0),
          totalPnL: parseFloat(apiStats.totalProfit || 0),
        });
      }
    } catch (error) {
      // console.error('Failed to load stats:', error);
    }
  };

  /**
   * 加载复盘报告
   */
  const loadReview = async () => {
    setReviewLoading(true);
    try {
      const response = await fetch(`/api/trade-review/report/${userId}`);
      const data = await response.json();
      if (data.success && data.data) {
        setReview(data.data);
      }
    } catch (error) {
      // ignore
    } finally {
      setReviewLoading(false);
    }
  };

  /**
   * 触发AI深度分析
   */
  const triggerDeepAnalysis = async () => {
    setAiLoading(true);
    try {
      const response = await fetch('/api/trade-review/deep-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      if (data.success && data.data?.analysis) {
        setReview(prev => prev ? { ...prev, ai_analysis: data.data.analysis } : prev);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (error) {
      console.error('Deep analysis error:', error);
    } finally {
      setAiLoading(false);
    }
  };

  /**
   * 应用建议
   */
  const applySuggestion = async (suggestion: ReviewReport['suggestions'][0]) => {
    setApplyingParam(suggestion.param);
    try {
      const response = await fetch('/api/trade-review/apply-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, suggestion }),
      });
      const data = await response.json();
      if (data.success) {
        setReview(prev => prev ? {
          ...prev,
          suggestions: prev.suggestions.map(s =>
            s.param === suggestion.param && s.action === suggestion.action && s.token === suggestion.token
              ? { ...s, applied: true }
              : s
          )
        } : prev);
      }
    } catch (error) {
      alert('Failed to apply');
    } finally {
      setApplyingParam(null);
    }
  };

  /**
   * 打开策略诊断
   */
  const openReview = () => {
    setShowReview(true);
    if (!review) {
      loadReview();
    }
  };

  useEffect(() => {
    loadTradeLogs();
  }, [userId, page]);

  // 加载统计数据(只依赖 userId,不依赖 page)
  useEffect(() => {
    if (userId) {
      loadStats();
    }
  }, [userId]);

  /**
   * Format date
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Format exit type badges
   */
  const formatExitType = (exitType: string) => {
    const types: Record<string, string> = {
      STOP_LOSS: 'Stop Loss',
      PROFIT_PROTECT: 'Profit Protect',
      TAKE_PROFIT: 'Take Profit',
      TRAILING_STOP: 'Trailing Stop',
      MANUAL: 'Sell',
      MANUAL_SELL: 'Manual Sell',
      EXPIRED: 'Expired',
      PARTIAL_TP: 'Partial TP',
    };
    return types[exitType] || exitType;
  };

  /**
   * Shorten transaction hash
   */
  const shortHash = (hash: string) => {
    if (!hash) return '';
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  /**
   * Get explorer link
   */
  const getExplorerLink = (chain: string, txHash: string) => {
    const explorers: Record<string, string> = {
      BSC: 'https://bscscan.com/tx/',
      Base: 'https://basescan.org/tx/',
    };
    return (explorers[chain] || '') + txHash;
  };

  /**
   * Get display currency based on chain type
   */
  const getDisplayCurrency = (chain: string) => {
    return chain === 'Solana' ? 'SOL' : 'USDT';
  };

  /**
   * Format amount with correct currency based on chain
   */
  const formatAmount = (amount: number, chain: string, includeLabel: boolean = true) => {
    const currency = getDisplayCurrency(chain);
    const decimals = 2; // Both SOL and USDT use 2 decimals
    const formatted = amount.toFixed(decimals);

    if (currency === 'SOL') {
      return includeLabel ? `${formatted} ${currency}` : formatted;
    } else {
      return includeLabel ? `$${formatted}` : formatted;
    }
  };

  /**
   * Format P&L amount with +/- sign and currency
   */
  const formatPnL = (amount: number, chain: string) => {
    const currency = getDisplayCurrency(chain);
    const decimals = 2; // Both SOL and USDT use 2 decimals
    const sign = amount >= 0 ? '+' : '';
    const formatted = amount.toFixed(decimals);
    return `${sign}${formatted} ${currency}`;
  };

  /**
   * Filter logs
   */
  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    if (filter === 'profit') return log.profit_loss_usdt >= 0;
    if (filter === 'loss') return log.profit_loss_usdt < 0;
    return true;
  });

  if (isLoading) {
    return (
      <div className="trade-logs loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="trade-logs empty">
        <div className="empty-state">
          <div className="empty-icon">📜</div>
          <h3>No Trade Records</h3>
          <p>Trade history will be displayed here after enabling auto trading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trade-logs">
      <div className="logs-header">
        <h3>Trade History</h3>
        <div className="logs-stats">
          <div className="stat-chip">
            Total: {stats.total}
          </div>
          <div className="stat-chip profit">
            Profit: {stats.profit}
          </div>
          <div className="stat-chip loss">
            Loss: {stats.loss}
          </div>
          <div className={`stat-chip total ${stats.totalPnL >= 0 ? 'profit' : 'loss'}`}>
            Total P&L: {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)} USDT
          </div>
          <button className="btn-review" onClick={openReview}>
            Strategy Review
            {review && review.problems && review.problems.length > 0 && (
              <span className="review-badge">{review.problems.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className="logs-filters">
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-btn ${filter === 'profit' ? 'active' : ''}`}
            onClick={() => setFilter('profit')}
          >
            Profit
          </button>
          <button
            className={`filter-btn ${filter === 'loss' ? 'active' : ''}`}
            onClick={() => setFilter('loss')}
          >
            Loss
          </button>
        </div>
      </div>

      {/* Trade History Table */}
      <div className="logs-table">
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Chain</th>
              <th>Entry Price</th>
              <th>Exit Price</th>
              <th>Investment</th>
              <th>P&L</th>
              <th>Exit Type</th>
              <th>Time</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.execution_id}>
                <td className="token-cell">
                  <strong>{log.token_symbol}</strong>
                </td>
                <td>
                  <span className="chain-badge">{log.chain}</span>
                </td>
                <td>${log.entry_price.toFixed(6)}</td>
                <td>${log.exit_price.toFixed(6)}</td>
                <td>{formatAmount(log.entry_amount_usdt, log.chain)}</td>
                <td className={log.profit_loss_usdt >= 0 ? 'profit' : 'loss'}>
                  <div className="pnl-cell">
                    <span className="pnl-amount">
                      {formatPnL(log.profit_loss_usdt, log.chain)}
                    </span>
                    <span className="pnl-percent">
                      ({log.profit_loss_usdt >= 0 ? '+' : ''}{log.profit_loss_percent.toFixed(2)}%)
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`exit-type ${log.exit_type.toLowerCase()}`}>
                    {formatExitType(log.exit_type)}
                  </span>
                </td>
                <td className="time-cell">
                  {formatDate(log.exit_executed_at)}
                </td>
                <td>
                  <button
                    className="btn-details"
                    onClick={() => setSelectedLog(log)}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="logs-pagination">
          <button
            className="btn-page"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="page-info">
            {page} / {totalPages}
          </span>
          <button
            className="btn-page"
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      )}

      {/* Trade Details Modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Trade Details - {selectedLog.token_symbol}</h3>
              <button className="modal-close" onClick={() => setSelectedLog(null)}>×</button>
            </div>

            <div className="modal-body">
              <div className="detail-section">
                <h4>Entry Information</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="label">Entry Price</span>
                    <span className="value">${selectedLog.entry_price.toFixed(6)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Entry Time</span>
                    <span className="value">{formatDate(selectedLog.entry_executed_at)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Entry Transaction</span>
                    <a
                      href={getExplorerLink(selectedLog.chain, selectedLog.entry_tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-link"
                    >
                      {shortHash(selectedLog.entry_tx_hash)} 🔗
                    </a>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h4>Exit Information</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="label">Exit Price</span>
                    <span className="value">${selectedLog.exit_price.toFixed(6)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Exit Time</span>
                    <span className="value">{formatDate(selectedLog.exit_executed_at)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Exit Transaction</span>
                    <a
                      href={getExplorerLink(selectedLog.chain, selectedLog.exit_tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-link"
                    >
                      {shortHash(selectedLog.exit_tx_hash)} 🔗
                    </a>
                  </div>
                  <div className="detail-item">
                    <span className="label">Exit Type</span>
                    <span className="value">{formatExitType(selectedLog.exit_type)}</span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h4>P&L Summary</h4>
                <div className="pnl-summary">
                  <div className="summary-item">
                    <span className="label">Investment</span>
                    <span className="value">{formatAmount(selectedLog.entry_amount_usdt, selectedLog.chain)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">P&L Amount</span>
                    <span className={`value ${selectedLog.profit_loss_usdt >= 0 ? 'profit' : 'loss'}`}>
                      {formatPnL(selectedLog.profit_loss_usdt, selectedLog.chain)}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Return Rate</span>
                    <span className={`value ${selectedLog.profit_loss_percent >= 0 ? 'profit' : 'loss'}`}>
                      {selectedLog.profit_loss_percent >= 0 ? '+' : ''}{selectedLog.profit_loss_percent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Review Modal */}
      {showReview && (
        <div className="modal-overlay" onClick={() => setShowReview(false)}>
          <div className="modal-content review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Strategy Review</h3>
              <button className="modal-close" onClick={() => setShowReview(false)}>×</button>
            </div>

            <div className="modal-body">
              {reviewLoading ? (
                <div className="loading-spinner">Loading...</div>
              ) : review ? (
                <>
                  {/* 统计概览 */}
                  <div className="review-section">
                    <h4>Trading Overview (Last 60 Days)</h4>
                    <div className="review-stats-grid">
                      <div className="review-stat">
                        <span className="review-stat-label">Trades</span>
                        <span className="review-stat-value">{review.period_trades}</span>
                      </div>
                      <div className="review-stat">
                        <span className="review-stat-label">Win Rate</span>
                        <span className={`review-stat-value ${Number(review.period_win_rate) >= 50 ? 'profit' : 'loss'}`}>
                          {Number(review.period_win_rate).toFixed(1)}%
                        </span>
                      </div>
                      <div className="review-stat">
                        <span className="review-stat-label">P&L</span>
                        <span className={`review-stat-value ${Number(review.period_pnl) >= 0 ? 'profit' : 'loss'}`}>
                          {Number(review.period_pnl) >= 0 ? '+' : ''}{Number(review.period_pnl).toFixed(2)}
                        </span>
                      </div>
                      <div className="review-stat">
                        <span className="review-stat-label">Profit Factor</span>
                        <span className="review-stat-value">{Number(review.profit_factor).toFixed(2)}</span>
                      </div>
                      <div className="review-stat">
                        <span className="review-stat-label">SL / TP</span>
                        <span className="review-stat-value">{review.sl_hit_count} / {review.tp_hit_count}</span>
                      </div>
                      <div className="review-stat">
                        <span className="review-stat-label">Avg Hold</span>
                        <span className="review-stat-value">
                          {(Number(review.avg_hold_seconds) / 3600).toFixed(1)}h
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 问题检测 */}
                  {review.problems && review.problems.length > 0 && (
                    <div className="review-section">
                      <h4>Issues Detected ({review.problems.length})</h4>
                      <div className="review-problems">
                        {review.problems.map((p, i) => (
                          <div key={i} className={`review-problem ${p.severity.toLowerCase()}`}>
                            <span className={`severity-tag ${p.severity.toLowerCase()}`}>{p.severity}</span>
                            <span className="problem-message">{p.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 调整建议 */}
                  {review.suggestions && review.suggestions.length > 0 && (
                    <div className="review-section">
                      <h4>Suggestions</h4>
                      <div className="review-suggestions">
                        {review.suggestions.map((s, i) => (
                          <div key={i} className="review-suggestion">
                            <span className="suggestion-text">{s.reason}</span>
                            {s.applied ? (
                              <span className="btn-applied">✓ Applied</span>
                            ) : (
                              <button
                                className="btn-apply"
                                disabled={applyingParam === s.param}
                                onClick={() => applySuggestion(s)}
                              >
                                {applyingParam === s.param ? 'Applying...' : 'Apply'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 无问题时 */}
                  {(!review.problems || review.problems.length === 0) && (
                    <div className="review-section">
                      <div className="review-no-issues">
                        No issues detected. Your strategy is performing within normal parameters.
                      </div>
                    </div>
                  )}

                  {/* AI深度分析 */}
                  <div className="review-section">
                    <h4>AI Deep Analysis</h4>
                    {review.ai_analysis ? (
                      <div className="review-ai-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {review.ai_analysis}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <button
                        className="btn-ai-analysis"
                        onClick={triggerDeepAnalysis}
                        disabled={aiLoading}
                      >
                        {aiLoading ? 'Analyzing...' : 'Run AI Analysis'}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="review-empty">
                  Not enough trade data for review (minimum 5 trades required)
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowReview(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

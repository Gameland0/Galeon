/**
 * Position Manager Component
 * Features:
 * 1. Display current positions list
 * 2. Real-time P&L updates
 * 3. Manual exit functionality
 */

import React, { useState, useEffect } from 'react';
import './PositionManager.css';

interface Position {
  execution_id: string;
  token_symbol: string;
  chain: string;
  entry_price: number;
  entry_amount_usdt: number;
  entry_amount_token: number;
  stop_loss_price: number;
  take_profit_price: number;
  current_price: number;
  unrealized_pnl_usdt: number;
  unrealized_pnl_percent: number;
  status: string;
  created_at: string;
  // Dynamic Stop Loss fields
  stop_loss_type?: 'FIXED' | 'ATR' | 'TRAILING';
  // Partial Take Profit fields
  partial_sold_pct?: number;
  partial_sold_usdt?: number;
  atr_value?: number | null;
  highest_price?: number | null;
  trailing_stop_activated?: boolean;
  trailing_stop_price?: number | null;
  // Strategy info
  follow_strategy?: string;
  strategy_name?: string;
}

interface PositionManagerProps {
  userId: string;
}

export default function PositionManager({ userId }: PositionManagerProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);

  /**
   * Load positions list
   */
  const loadPositions = async () => {
    try {
      const response = await fetch(`/api/auto-trade/positions/${userId}`);
      const data = await response.json();

      if (data.success) {
        setPositions(data.data);
      }
    } catch (error) {
      // console.error('Failed to load positions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPositions();

    // Refresh every 15 seconds
    const interval = setInterval(loadPositions, 15000);
    return () => clearInterval(interval);
  }, [userId]);

  /**
   * Manual Exit
   */
  const handleManualExit = async (position: Position) => {
    if (!window.confirm(`Confirm manual exit for ${position.token_symbol}?`)) {
      return;
    }

    try {
      const response = await fetch('/api/auto-trade/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executionId: position.execution_id,
          reason: 'User manual exit',
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert('Exit request submitted!');
        loadPositions();
      } else {
        alert('Exit failed: ' + data.message);
      }
    } catch (error) {
      // console.error('Exit failed:', error);
      alert('Exit failed, please try again');
    }
  };

  /**
   * Get real-time P&L (using actual backend data)
   * Total P&L = Realized (from partial exits) + Unrealized (remaining position)
   */
  const getPnL = (position: Position) => {
    // Realized P&L from partial take profit exits
    const realizedPnl = position.partial_sold_usdt || 0;
    // Unrealized P&L from remaining position
    const unrealizedPnl = position.unrealized_pnl_usdt || 0;
    // Total P&L
    const totalPnl = realizedPnl + unrealizedPnl;

    // Calculate total P&L percentage based on original entry amount
    const totalPnlPercent = position.entry_amount_usdt > 0
      ? (totalPnl / position.entry_amount_usdt) * 100
      : 0;

    return {
      currentPrice: position.current_price || position.entry_price,
      pnl: totalPnl,
      pnlPercent: totalPnlPercent
    };
  };

  /**
   * Format date
   */
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
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

  if (isLoading) {
    return (
      <div className="position-manager loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="position-manager empty">
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No Positions</h3>
          <p>System will automatically open positions when Alpha signals trigger</p>
        </div>
      </div>
    );
  }

  return (
    <div className="position-manager">
      <div className="position-header">
        <h3>Current Positions ({positions.length})</h3>
        <button className="btn-refresh" onClick={loadPositions}>
          🔄 Refresh
        </button>
      </div>

      <div className="positions-grid">
        {positions.map((position) => {
          const { currentPrice, pnl, pnlPercent } = getPnL(position);

          return (
            <div key={position.execution_id} className="position-card">
              <div className="position-card-header">
                <div className="token-info">
                  <h4>{position.token_symbol}</h4>
                  <span className="chain-badge">{position.chain}</span>
                  {/* Strategy Badge */}
                  {position.strategy_name && (
                    <span style={{
                      marginLeft: '6px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '600',
                      backgroundColor: position.follow_strategy === 'TWITTER_KOL' ? '#e0f2fe' :
                                       position.follow_strategy === 'TELEGRAM' ? '#dbeafe' :
                                       position.follow_strategy === 'TOP_SIGNALS' ? '#dcfce7' :
                                       position.follow_strategy === 'MEME' ? '#fef9c3' : '#f3f4f6',
                      color: position.follow_strategy === 'TWITTER_KOL' ? '#0369a1' :
                             position.follow_strategy === 'TELEGRAM' ? '#1e40af' :
                             position.follow_strategy === 'TOP_SIGNALS' ? '#166534' :
                             position.follow_strategy === 'MEME' ? '#854d0e' : '#374151'
                    }}>
                      {position.strategy_name}
                    </span>
                  )}
                </div>
                <div className={`pnl ${pnl >= 0 ? 'profit' : 'loss'}`}>
                  {formatPnL(pnl, position.chain)}
                  <span className="pnl-percent">
                    ({pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className="position-details">
                <div className="detail-row">
                  <span className="label">Entry Price</span>
                  <span className="value">${position.entry_price.toFixed(6)}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Current Price</span>
                  <span className="value current-price">
                    ${currentPrice.toFixed(6)}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Position Amount</span>
                  <span className="value">{formatAmount(position.entry_amount_usdt, position.chain)}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Position Size</span>
                  <span className="value">{position.entry_amount_token?.toFixed(2) || 'N/A'}</span>
                </div>
              </div>

              <div className="price-targets">
                <div className="target-item stop-loss">
                  <span className="target-label">
                    Stop Loss
                    <span style={{
                      marginLeft: '6px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '600',
                      backgroundColor: position.stop_loss_type === 'TRAILING' ? '#dcfce7' :
                                       position.stop_loss_type === 'ATR' ? '#dbeafe' : '#f3f4f6',
                      color: position.stop_loss_type === 'TRAILING' ? '#166534' :
                             position.stop_loss_type === 'ATR' ? '#1e40af' : '#374151'
                    }}>
                      {position.stop_loss_type === 'TRAILING' && '📈 Trailing'}
                      {position.stop_loss_type === 'ATR' && '📊 ATR'}
                      {(!position.stop_loss_type || position.stop_loss_type === 'FIXED') && '📌 Fixed'}
                    </span>
                  </span>
                  <span className="target-value">
                    {position.stop_loss_price ? `$${position.stop_loss_price.toFixed(6)}` : 'N/A'}
                  </span>
                  <span className="target-distance">
                    {position.stop_loss_price
                      ? `${((position.stop_loss_price - position.entry_price) / position.entry_price * 100).toFixed(1)}%`
                      : '-'}
                  </span>
                </div>
                <div className="target-item take-profit">
                  <span className="target-label">Take Profit</span>
                  <span className="target-value">
                    {position.take_profit_price ? `$${position.take_profit_price.toFixed(6)}` : 'N/A'}
                  </span>
                  <span className="target-distance">
                    {position.take_profit_price
                      ? `+${((position.take_profit_price - position.entry_price) / position.entry_price * 100).toFixed(1)}%`
                      : '-'}
                  </span>
                </div>
              </div>

              {/* Trailing Stop Info (when activated) */}
              {position.trailing_stop_activated && position.highest_price && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  backgroundColor: '#ecfdf5',
                  borderRadius: '8px',
                  border: '1px solid #a7f3d0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#065f46', fontWeight: '600' }}>
                      📈 Trailing Stop Active
                    </span>
                    <span style={{ fontSize: '11px', color: '#047857' }}>
                      High: ${position.highest_price.toFixed(6)}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px' }}>
                    Stop follows {((position.highest_price - position.stop_loss_price) / position.highest_price * 100).toFixed(1)}% below peak
                  </div>
                </div>
              )}

              {/* Partial Take Profit Info (when partial sells have occurred) */}
              {(position.partial_sold_pct ?? 0) > 0 && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  backgroundColor: '#fef9c3',
                  borderRadius: '8px',
                  border: '1px solid #fde047'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#854d0e', fontWeight: '600' }}>
                      📊 Partial Take Profit
                    </span>
                    <span style={{ fontSize: '11px', color: '#a16207' }}>
                      Sold: {position.partial_sold_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#a16207', marginTop: '4px' }}>
                    Locked profit: {formatAmount(position.partial_sold_usdt || 0, position.chain)}
                  </div>
                </div>
              )}

              <div className="position-footer">
                <div className="position-time">
                  Holding: {formatTime(position.created_at)}
                </div>
                <button
                  className="btn-exit"
                  onClick={() => handleManualExit(position)}
                >
                  Sell
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

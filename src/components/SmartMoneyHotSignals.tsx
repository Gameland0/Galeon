/**
 * Smart Money Hot Signals Banner
 * 直接从 Binance Agent Skills Trading Signal API 获取活跃的 Smart Money 信号
 * 显示在 Alpha Signals 列表顶部
 */

import React, { useState, useEffect } from 'react';
import { alphaAgentService } from '../services/alphaAgentService';
import '../styles/SmartMoneyHotSignals.css';

interface TradingSignal {
  signalId: number;
  ticker: string;
  chainId: string;
  contractAddress: string;
  logoUrl?: string;
  isAlpha: boolean;
  smartMoneyCount: number;
  direction: 'buy' | 'sell';
  status: string;
  currentPrice: string;
  alertPrice: string;
  maxGain: string;
  exitRate: number;
  signalCount: number;
  tokenTag?: Record<string, any[]>;
}

interface Props {
  onViewDetail: (signalId: string) => void;
}

const SmartMoneyHotSignals: React.FC<Props> = ({ onViewDetail }) => {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetchTradingSignals();
  }, []);

  const fetchTradingSignals = async () => {
    try {
      setLoading(true);
      const response = await alphaAgentService.getSmartMoneySignals('56', 1, 30);

      if (response.success && response.signals.length > 0) {
        // 优先显示 valid 信号，也包含 timeout（仍有参考价值），按 smartMoneyCount 排序
        const filteredSignals = response.signals
          .filter((s: any) => (s.status === 'valid' || s.status === 'active' || s.status === 'timeout') && s.direction)
          .sort((a: any, b: any) => {
            // valid 优先，然后按 smartMoneyCount 排序
            if (a.status === 'valid' && b.status !== 'valid') return -1;
            if (b.status === 'valid' && a.status !== 'valid') return 1;
            return (b.smartMoneyCount || 0) - (a.smartMoneyCount || 0);
          })
          .slice(0, 8);
        setSignals(filteredSignals);
      }
    } catch (error) {
      console.error('[SmartMoneyHotSignals] Failed to fetch signals:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="sm-hot-signals-banner loading">
        <div className="sm-banner-header">
          <h3>Smart Money Hot Signals</h3>
          <span className="loading-text">Loading...</span>
        </div>
      </div>
    );
  }

  if (signals.length === 0) {
    return null;
  }

  const formatPrice = (price: string) => {
    const p = parseFloat(price);
    if (p < 0.0001) return '$' + p.toFixed(8);
    if (p < 0.01) return '$' + p.toFixed(6);
    if (p < 1) return '$' + p.toFixed(4);
    return '$' + p.toFixed(2);
  };

  const formatGain = (gain: string) => {
    const g = parseFloat(gain) * 100;
    return g > 0 ? `+${g.toFixed(1)}%` : `${g.toFixed(1)}%`;
  };

  const shortenAddress = (addr: string) => {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  };

  // 从 tokenTag 提取 Smart Money 和 Whale 状态
  const getSmartMoneyActivity = (signal: TradingSignal): 'accumulating' | 'reducing' | null => {
    const tags = signal.tokenTag;
    if (!tags) return null;
    const sensitive = tags['Sensitive Events'] || [];
    for (const t of sensitive) {
      if (t.tagName === 'Smart Money Add Holdings') return 'accumulating';
      if (t.tagName === 'Smart Money Remove Holdings') return 'reducing';
    }
    return null;
  };

  // direction + smartMoneyCount 作为 whale 活动指标
  const getWhaleActivity = (signal: TradingSignal): { action: 'buy' | 'sell'; count: number } => {
    return { action: signal.direction, count: signal.smartMoneyCount };
  };

  return (
    <div className={`sm-hot-signals-banner ${expanded ? 'expanded' : 'collapsed'}`}>
      {/* Header */}
      <div className="sm-banner-header">
        <div className="sm-header-left">
          <h3>Smart Money Hot Signals</h3>
          <span className="sm-count-badge">{signals.length} Active</span>
        </div>
        <button
          className="sm-toggle-btn"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '\u2212' : '+'}
        </button>
      </div>

      {/* Signals Grid */}
      {expanded && (
        <div className="sm-signals-grid">
          {signals.map((signal) => {
            const smActivity = getSmartMoneyActivity(signal);
            const whale = getWhaleActivity(signal);
            return (
            <div
              key={signal.signalId}
              className="sm-signal-card"
            >
              {/* Token Symbol + Direction */}
              <div className="sm-card-header">
                <span className="sm-token-symbol">{signal.ticker}</span>
                <span
                  className={`sm-direction-badge ${signal.direction}`}
                >
                  {signal.direction.toUpperCase()}
                </span>
              </div>

              {/* Contract Address - clickable to copy */}
              <div
                className="sm-contract-address"
                title="Click to copy"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(signal.contractAddress);
                  const el = e.currentTarget;
                  el.classList.add('copied');
                  setTimeout(() => el.classList.remove('copied'), 1500);
                }}
              >
                <span className="sm-address-text">{shortenAddress(signal.contractAddress)}</span>
                <span className="sm-copy-icon">&#x2398;</span>
                <span className="sm-copied-text">Copied!</span>
              </div>

              {/* Smart Money & Whale Activity */}
              <div className="sm-activity-row">
                <div className={`sm-activity-tag ${smActivity === 'accumulating' ? 'accumulating' : smActivity === 'reducing' ? 'reducing' : 'neutral'}`}>
                  <span className="sm-activity-icon">{smActivity === 'accumulating' ? '\u2191' : smActivity === 'reducing' ? '\u2193' : '\u2022'}</span>
                  <span>Smart Money {smActivity === 'accumulating' ? 'Accumulating' : smActivity === 'reducing' ? 'Reducing' : 'Holding'}</span>
                </div>
                <div className={`sm-activity-tag ${whale.action === 'buy' ? 'whale-buy' : 'whale-sell'}`}>
                  <span className="sm-activity-icon">{whale.action === 'buy' ? '\u{1F40B}' : '\u26A0'}</span>
                  <span>Whale {whale.action === 'buy' ? 'Buy' : 'Sell'}</span>
                </div>
              </div>

              {/* Metrics */}
              <div className="sm-card-body">
                <div className="sm-metric">
                  <span className="sm-metric-label">Smart Money</span>
                  <span className="sm-metric-value">
                    {signal.smartMoneyCount}
                  </span>
                </div>

                {/* Current Price */}
                <div className="sm-metric">
                  <span className="sm-metric-label">Price</span>
                  <span className="sm-metric-value">
                    {formatPrice(signal.currentPrice)}
                  </span>
                </div>

                {/* Max Gain */}
                {parseFloat(signal.maxGain) > 0 && (
                  <div className="sm-metric">
                    <span className="sm-metric-label">Max Gain</span>
                    <span className={`sm-metric-value ${parseFloat(signal.maxGain) > 0 ? 'positive' : 'negative'}`}>
                      {formatGain(signal.maxGain)}
                    </span>
                  </div>
                )}
              </div>

              {/* Tags */}
              <div className="sm-card-footer">
                {signal.isAlpha && <span className="sm-alpha-tag">Alpha</span>}
                <span className={`sm-status-tag ${signal.status}`}>{signal.status === 'valid' ? 'Active' : signal.status === 'timeout' ? 'Ended' : signal.status}</span>
                <span className="sm-signal-count">{signal.signalCount} signals</span>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Info Footer */}
      {expanded && (
        <div className="sm-banner-footer">
          <p className="sm-info-text">
            Real-time Smart Money trading signals from Binance Agent Skills.
          </p>
        </div>
      )}
    </div>
  );
};

export default SmartMoneyHotSignals;

import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import '../styles/SignalDetailPage.css';
import { alphaAgentService } from '../services/alphaAgentService';
import SignalPriceChart from './SignalPriceChart';
import TokenNewsFeed from './TokenNewsFeed';
import FlockInsightPanel from './FlockInsightPanel';

interface FlockInsight {
  source: string;
  similarCasesCount: number;
  analysis: string;
  adjustmentReason: string;
}

interface SignalDetail {
  signalId: string;
  tokenSymbol: string;
  signalType: 'LONG' | 'SHORT' | 'NEUTRAL' | 'BUY' | 'SELL';
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  currentPrice: number;
  signalPrice?: number;
  priceChangePercent?: number;
  status: 'ACTIVE' | 'HIT_TP' | 'HIT_SL' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
  entryZone: {
    min: number;
    max: number;
  };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  analysis: {
    oiChange24h: number;
    fundingRate: number;
    trend: string;
    pattern: string;
    volume: string;
    momentum?: string;
    volatility?: string;
    supportLevel?: number | null;
    resistanceLevel?: number | null;
    oiValue?: number | null;
    marketCap?: number | null;
    oiMcRatio?: number | null;
  };
  reasoning: string;
  modelVersion?: string;

  // FLock enhancement fields
  originalConfidence?: number;
  confidenceAdjustment?: number;
  flockInsight?: FlockInsight | null;
}

const SignalDetailPage: React.FC = () => {
  const { signalId } = useParams<{ signalId: string }>();
  const navigate = useNavigate();
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const account = getCurrentAccount();
  const [signal, setSignal] = useState<SignalDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'15m' | '1h' | '4h' | '1d'>('4h');
  const [error, setError] = useState<{ type: 'insufficient_credits' | 'not_found' | 'other', message: string } | null>(null);

  useEffect(() => {
    const fetchSignalDetail = async () => {
      if (!signalId) return;

      if (!account) {
        console.error('Account not found, please connect wallet');
        setError({ type: 'other', message: 'Please connect your wallet to view signal details' });
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await alphaAgentService.viewSignalDetail(account, signalId);
        setSignal(result.signal);
      } catch (error: any) {
        console.error('Failed to load signal detail:', error);

        if (error.response?.status === 402) {
          // 余额不足
          const errorData = error.response.data;
          setError({
            type: 'insufficient_credits',
            message: `Insufficient credits. Required: ${errorData.required || 8} credits, Current: ${errorData.current || 0} credits`
          });
        } else if (error.response?.status === 404) {
          // 信号不存在
          setError({
            type: 'not_found',
            message: 'Signal not found'
          });
        } else {
          // 其他错误
          setError({
            type: 'other',
            message: error.response?.data?.error || 'Failed to load signal detail'
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSignalDetail();
  }, [signalId, account]);

  useEffect(() => {
    if (!signal) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const expires = new Date(signal.expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setTimeRemaining('Expired');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining(`${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [signal]);

  const formatPrice = (price: number) => {
    return price.toFixed(3);
  };

  const copySignalPlan = () => {
    if (!signal) return;

    const text = `
🎯 Alpha Signal: ${signal.tokenSymbol}
${signal.signalType === 'LONG' ? '📈' : '📉'} Type: ${signal.signalType}
💯 Confidence: ${signal.confidence}%
⚠️ Risk: ${signal.riskLevel}

📍 Entry Zone: $${formatPrice(signal.entryZone.min)} - $${formatPrice(signal.entryZone.max)}
🛑 Stop Loss: $${formatPrice(signal.stopLoss)}
🎯 TP1: $${formatPrice(signal.takeProfit1)}
${signal.takeProfit2 ? `🎯 TP2: $${formatPrice(signal.takeProfit2)}` : ''}
${signal.takeProfit3 ? `🎯 TP3: $${formatPrice(signal.takeProfit3)}` : ''}

⏰ Valid until: ${new Date(signal.expiresAt).toLocaleString()}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getRiskPercent = () => {
    if (!signal) return 0;
    const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
    return (((entryMid - signal.stopLoss) / entryMid) * 100).toFixed(2);
  };

  const getRRRatio = (tp: number) => {
    if (!signal) return 0;
    const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
    const risk = entryMid - signal.stopLoss;
    const reward = tp - entryMid;
    return (reward / risk).toFixed(1);
  };

  const getMetricContribution = (metricName: string): number => {
    // Simulated contribution percentages based on confidence weights
    const contributions: Record<string, number> = {
      oi: 27,
      funding: 22,
      volume: 18,
      trend: 23,
      pattern: 10
    };
    return contributions[metricName] || 0;
  };

  if (loading) {
    return (
      <div className="signal-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading signal details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="signal-detail-error">
        <div className="error-icon">
          {error.type === 'insufficient_credits' ? '💳' : error.type === 'not_found' ? '🔍' : '⚠️'}
        </div>
        <h2>
          {error.type === 'insufficient_credits' ? 'Insufficient Credits' :
           error.type === 'not_found' ? 'Signal Not Found' :
           'Error Loading Signal'}
        </h2>
        <p className="error-message">{error.message}</p>
        <button className="primary-btn" onClick={() => navigate('/alpha-agent')}>
          Back to Signals
        </button>
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="signal-detail-error">
        <div className="error-icon">🔍</div>
        <h2>Signal not found</h2>
        <button className="primary-btn" onClick={() => navigate('/alpha-agent')}>Back to Signals</button>
      </div>
    );
  }

  return (
    <div className="signal-detail-page">
      {/* Sticky Header */}
      <div className="sticky-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate('/alpha-agent')}>
            ← Back
          </button>
          <div className="symbol-info">
            <h1>{signal.tokenSymbol}</h1>
            <span className={`signal-type ${signal.signalType.toLowerCase()}`}>
              {signal.signalType}
            </span>
            <span className={`status-badge ${signal.status.toLowerCase()}`}>
              {signal.status.replace('_', ' ')}
            </span>
            {signal.modelVersion && (
              <span className="model-badge">Model {signal.modelVersion}</span>
            )}
          </div>
        </div>

        <div className="header-center">
          <div className="key-metric">
            <span className="label">Confidence</span>
            <span className="value">{signal.confidence}%</span>
          </div>
          <div className="key-metric">
            <span className="label">Price</span>
            <span className="value">${formatPrice(signal.currentPrice)}</span>
          </div>
          <div className="key-metric">
            <span className="label">Entry</span>
            <span className="value">${formatPrice(signal.entryZone.min)} → ${formatPrice(signal.entryZone.max)}</span>
          </div>
          <div className="key-metric">
            <span className="label">SL</span>
            <span className="value">${formatPrice(signal.stopLoss)}</span>
          </div>
          <div className="key-metric">
            <span className="label">TP1</span>
            <span className="value">${formatPrice(signal.takeProfit1)}</span>
          </div>
          <div className="key-metric">
            <span className="label">Expires</span>
            <span className="value countdown">{timeRemaining}</span>
          </div>
        </div>

        <div className="header-right">
          <button className="btn-primary" onClick={() => window.open(`https://www.binance.com/en/trade/${signal.tokenSymbol}`, '_blank')}>
            Open on Exchange
          </button>
          <button className="btn-secondary" onClick={copySignalPlan}>
            {copied ? '✓ Copied' : 'Copy Plan'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="content-layout">
        <div className="main-content">
          {/* Market Chart Section */}
          <section className="chart-section">
            <div className="section-header">
              <h2>📈 Market Chart</h2>
              <div className="timeframe-selector">
                <button
                  className={selectedTimeframe === '15m' ? 'active' : ''}
                  onClick={() => setSelectedTimeframe('15m')}
                >
                  15min
                </button>
                <button
                  className={selectedTimeframe === '1h' ? 'active' : ''}
                  onClick={() => setSelectedTimeframe('1h')}
                >
                  1H
                </button>
                <button
                  className={selectedTimeframe === '4h' ? 'active' : ''}
                  onClick={() => setSelectedTimeframe('4h')}
                >
                  4H
                </button>
                <button
                  className={selectedTimeframe === '1d' ? 'active' : ''}
                  onClick={() => setSelectedTimeframe('1d')}
                >
                  1D
                </button>
              </div>
            </div>
            <SignalPriceChart
              tokenSymbol={signal.tokenSymbol}
              entryMin={signal.entryZone.min}
              entryMax={signal.entryZone.max}
              stopLoss={signal.stopLoss}
              takeProfit1={signal.takeProfit1}
              takeProfit2={signal.takeProfit2}
              takeProfit3={signal.takeProfit3}
              signalType={signal.signalType}
              currentPrice={signal.currentPrice}
              timeframe={selectedTimeframe}
            />
          </section>

          {/* Trade Plan Card */}
          <section className="trade-plan-card">
            <div className="card-header">
              <h3>🎯 Trade Plan</h3>
              <span className="subtitle">AI Strategy Recommendation</span>
            </div>

            <div className="plan-grid">
              <div className="plan-item">
                <div className="item-label">Entry Zone</div>
                <div className="entry-range">
                  <div className="range-value">
                    <span className="label">MIN</span>
                    <span className="value">${formatPrice(signal.entryZone.min)}</span>
                  </div>
                  <span className="arrow">→</span>
                  <div className="range-value">
                    <span className="label">MAX</span>
                    <span className="value">${formatPrice(signal.entryZone.max)}</span>
                  </div>
                </div>
              </div>

              <div className="plan-item">
                <div className="item-label">Stop Loss</div>
                <div className="item-value danger">${formatPrice(signal.stopLoss)}</div>
                <div className="item-note">Risk: {getRiskPercent()}% from mid-entry</div>
              </div>

              <div className="plan-item take-profits">
                <div className="item-label">Take Profit Targets</div>
                <div className="tp-grid">
                  <div className="tp-item">
                    <span className="tp-label">TP1</span>
                    <span className="tp-value">${formatPrice(signal.takeProfit1)}</span>
                    <span className="tp-percent">
                      +{(((signal.takeProfit1 - signal.currentPrice) / signal.currentPrice) * 100).toFixed(1)}%
                    </span>
                  </div>
                  {signal.takeProfit2 && (
                    <div className="tp-item">
                      <span className="tp-label">TP2</span>
                      <span className="tp-value">${formatPrice(signal.takeProfit2)}</span>
                      <span className="tp-percent">
                        +{(((signal.takeProfit2 - signal.currentPrice) / signal.currentPrice) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {signal.takeProfit3 && (
                    <div className="tp-item">
                      <span className="tp-label">TP3</span>
                      <span className="tp-value">${formatPrice(signal.takeProfit3)}</span>
                      <span className="tp-percent">
                        +{(((signal.takeProfit3 - signal.currentPrice) / signal.currentPrice) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="plan-item">
                <div className="item-label">Risk Level</div>
                <span className={`risk-badge ${signal.riskLevel.toLowerCase()}`}>
                  {signal.riskLevel}
                </span>
              </div>

              <div className="plan-item">
                <div className="item-label">R/R Ratio</div>
                <div className="rr-ratios">
                  <span className="rr-item">1:{getRRRatio(signal.takeProfit1)}</span>
                  {signal.takeProfit2 && <span className="rr-item">1:{getRRRatio(signal.takeProfit2)}</span>}
                  {signal.takeProfit3 && <span className="rr-item">1:{getRRRatio(signal.takeProfit3)}</span>}
                </div>
              </div>
            </div>

            <button className="copy-plan-btn" onClick={copySignalPlan}>
              {copied ? '✓ Plan Copied' : '📋 Copy Full Plan'}
            </button>
          </section>

          {/* Market Context Grid */}
          <section className="market-context">
            <div className="section-header">
              <h2>📊 Market Context</h2>
            </div>

            <div className="metrics-grid">
              {/* OI & Leverage */}
              <div className="metric-card oi">
                <div className="card-header-mini">
                  <span className="icon">📊</span>
                  <span className="title">Open Interest & OI/MC</span>
                  <span className="contribution">+{getMetricContribution('oi')}%</span>
                </div>
                <div className="metric-value">
                  <span className={signal.analysis.oiChange24h > 0 ? 'positive' : 'negative'}>
                    {signal.analysis.oiChange24h > 0 ? '↗' : '↘'} {signal.analysis.oiChange24h > 0 ? '+' : ''}{signal.analysis.oiChange24h.toFixed(2)}%
                  </span>
                  <span className="period">24h</span>
                </div>
                {signal.analysis.oiMcRatio && (
                  <div className="metric-details">
                    <div className="detail-row">
                      <span>OI/MC Ratio:</span>
                      <span className="highlight">{(signal.analysis.oiMcRatio * 100).toFixed(2)}%</span>
                    </div>
                    <div className="warning">
                      {signal.analysis.oiMcRatio >= 1 ? '⚠️ Extremely high leverage' :
                       signal.analysis.oiMcRatio >= 0.5 ? '⚠️ High leverage' :
                       '✅ Moderate leverage'}
                    </div>
                  </div>
                )}
                <div className="status-indicator positive">Positive</div>
              </div>

              {/* Funding Rate */}
              <div className="metric-card funding">
                <div className="card-header-mini">
                  <span className="icon">💰</span>
                  <span className="title">Funding Rate</span>
                  <span className="contribution">+{getMetricContribution('funding')}%</span>
                </div>
                <div className="metric-value">
                  <span className={signal.analysis.fundingRate > 0 ? 'positive' : 'negative'}>
                    {signal.analysis.fundingRate > 0 ? '+' : ''}{(signal.analysis.fundingRate * 100).toFixed(3)}%
                  </span>
                </div>
                <div className="metric-details">
                  <div className="detail-row">
                    <span>Bias:</span>
                    <span>{signal.analysis.fundingRate > 0 ? 'Long 📈' : 'Short 📉'}</span>
                  </div>
                </div>
                <div className={`status-indicator ${Math.abs(signal.analysis.fundingRate) < 0.0005 ? 'neutral' : 'positive'}`}>
                  {Math.abs(signal.analysis.fundingRate) > 0.001 ? 'High Rate' :
                   Math.abs(signal.analysis.fundingRate) > 0.0005 ? 'Normal' : 'Low Rate'}
                </div>
              </div>

              {/* Volume */}
              <div className="metric-card volume">
                <div className="card-header-mini">
                  <span className="icon">📊</span>
                  <span className="title">Volume</span>
                  <span className="contribution">+{getMetricContribution('volume')}%</span>
                </div>
                <div className="metric-value">
                  <span>{signal.analysis.volume}</span>
                </div>
                <div className="status-indicator positive">
                  {signal.analysis.volume.toLowerCase().includes('surge') ? '🔥 Surge' :
                   signal.analysis.volume.toLowerCase().includes('high') ? '✅ Active' :
                   '📊 Stable'}
                </div>
              </div>

              {/* Trend */}
              <div className="metric-card trend">
                <div className="card-header-mini">
                  <span className="icon">📈</span>
                  <span className="title">Trend</span>
                  <span className="contribution">+{getMetricContribution('trend')}%</span>
                </div>
                <div className="metric-value">
                  <span>{signal.analysis.trend}</span>
                </div>
                <div className="metric-details">
                  <div className="trend-strength">
                    <span>Bullish alignment</span>
                    <div className="strength-bar">
                      <div className="strength-fill" style={{ width: '75%' }}></div>
                    </div>
                  </div>
                </div>
                <div className="status-indicator positive">Strong</div>
              </div>

              {/* Pattern */}
              {signal.analysis.pattern && signal.analysis.pattern !== 'None' && (
                <div className="metric-card pattern">
                  <div className="card-header-mini">
                    <span className="icon">📉</span>
                    <span className="title">Pattern</span>
                    <span className="contribution">+{getMetricContribution('pattern')}%</span>
                  </div>
                  <div className="metric-value">
                    <span>{signal.analysis.pattern}</span>
                  </div>
                  <div className="metric-details">
                    <span className="timeframe">1H / 4H timeframe</span>
                  </div>
                  <div className="status-indicator positive">Detected</div>
                </div>
              )}
            </div>
          </section>

          {/* Key Levels */}
          {(signal.analysis.supportLevel || signal.analysis.resistanceLevel) && (
            <section className="key-levels">
              <div className="section-header">
                <h2>🔑 Key Levels</h2>
              </div>

              <div className="levels-grid">
                {signal.analysis.supportLevel && (
                  <div className="level-card support">
                    <div className="level-header">
                      <span className="icon">🟢</span>
                      <span>Support Level</span>
                    </div>
                    <div className="level-value">${formatPrice(signal.analysis.supportLevel)}</div>
                    <div className="level-distance">
                      Distance: {(((signal.currentPrice - signal.analysis.supportLevel) / signal.analysis.supportLevel) * 100).toFixed(2)}%
                    </div>
                    <div className="strength-indicator">
                      <span>Strength:</span>
                      <div className="strength-bar">
                        <div className="strength-fill" style={{ width: '80%' }}></div>
                      </div>
                    </div>
                  </div>
                )}

                {signal.analysis.resistanceLevel && (
                  <div className="level-card resistance">
                    <div className="level-header">
                      <span className="icon">🔴</span>
                      <span>Resistance Level</span>
                    </div>
                    <div className="level-value">${formatPrice(signal.analysis.resistanceLevel)}</div>
                    <div className="level-distance">
                      Distance: {(((signal.analysis.resistanceLevel - signal.currentPrice) / signal.currentPrice) * 100).toFixed(2)}%
                    </div>
                    <div className="strength-indicator">
                      <span>Strength:</span>
                      <div className="strength-bar">
                        <div className="strength-fill" style={{ width: '65%' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Signal Reasoning */}
          <section className="signal-reasoning">
            <div className="section-header">
              <h2>💡 Signal Reasoning</h2>
            </div>

            <div className="reasoning-content">
              <div className="reasoning-item">
                <div className="item-title">Core Logic</div>
                <div className="item-content">
                  {signal.signalType === 'LONG' ? '📈' : '📉'} {signal.signalType} setup based on {signal.analysis.pattern || 'technical analysis'} with {signal.confidence}% confidence
                </div>
              </div>

              <div className="reasoning-item">
                <div className="item-title">Key Triggers</div>
                <div className="item-content">
                  Entry zone: ${formatPrice(signal.entryZone.min)} - ${formatPrice(signal.entryZone.max)}
                  <br />
                  {signal.analysis.volume.toLowerCase().includes('surge') && 'Volume surge confirmation'}
                </div>
              </div>

              <div className="reasoning-item">
                <div className="item-title">Invalidation</div>
                <div className="item-content">
                  Close below ${formatPrice(signal.stopLoss)} invalidates the setup
                </div>
              </div>

              <div className="reasoning-item">
                <div className="item-title">Key Risk</div>
                <div className="item-content">
                  {signal.riskLevel} risk level
                  {signal.analysis.oiMcRatio && signal.analysis.oiMcRatio >= 0.5 && ' • High leverage environment'}
                </div>
              </div>

              <div className="reasoning-item">
                <div className="item-title">Full Analysis</div>
                <div
                  className="item-content full-analysis"
                  dangerouslySetInnerHTML={{
                    __html: signal.reasoning
                      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n\n/g, '<br/><br/>')
                      .replace(/\n/g, '<br/>')
                  }}
                />
              </div>
            </div>
          </section>

          {/* Audit & Outcome (for completed signals) */}
          {(signal.status === 'HIT_TP' || signal.status === 'HIT_SL' || signal.status === 'EXPIRED') && (
            <section className="audit-outcome">
              <div className="section-header">
                <h2>🧾 Audit & Outcome</h2>
              </div>

              <div className="timeline">
                <div className="timeline-item">
                  <span className="timestamp">Created</span>
                  <span className="date">{new Date(signal.createdAt).toLocaleString()}</span>
                </div>
                <div className="timeline-arrow">→</div>
                <div className="timeline-item">
                  <span className="timestamp">Outcome</span>
                  <span className={`outcome-badge ${signal.status.toLowerCase()}`}>
                    {signal.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="timeline-arrow">→</div>
                <div className="timeline-item">
                  <span className="timestamp">Expired</span>
                  <span className="date">{new Date(signal.expiresAt).toLocaleString()}</span>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Side Panel */}
        <aside className="side-panel">
          {/* Confidence Ring */}
          <div className="confidence-snapshot">
            <div className="confidence-ring">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#30363D" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#F8D264"
                  strokeWidth="8"
                  strokeDasharray={`${signal.confidence * 2.827} 282.7`}
                  transform="rotate(-90 50 50)"
                  strokeLinecap="round"
                />
              </svg>
              <div className="confidence-value">
                <span className="percentage">{signal.confidence}%</span>
                <span className="label">Confidence</span>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="quick-stats">
            <div className="stat-row">
              <span className="stat-label">Symbol</span>
              <span className="stat-value">{signal.tokenSymbol}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Current Price</span>
              <span className="stat-value">${formatPrice(signal.currentPrice)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Entry</span>
              <span className="stat-value">${formatPrice(signal.entryZone.min)}-${formatPrice(signal.entryZone.max)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Stop Loss</span>
              <span className="stat-value danger">${formatPrice(signal.stopLoss)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Take Profit</span>
              <span className="stat-value success">${formatPrice(signal.takeProfit1)}</span>
            </div>
          </div>

          {/* Related News */}
          <div className="related-news-sidebar">
            <h3 className="sidebar-section-title">📰 Related News</h3>
            <TokenNewsFeed
              tokenFilter={signal.tokenSymbol}
              limit={3}
              showFilters={false}
              autoRefresh={true}
            />
          </div>

          {/* Countdown */}
          <div className="countdown-box">
            <div className="countdown-label">Time Remaining</div>
            <div className="countdown-value">{timeRemaining}</div>
            <div className="expires-at">Expires: {new Date(signal.expiresAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</div>
          </div>

          {/* Model Info */}
          <div className="model-info">
            <div className="info-header">Model & Version</div>
            <div className="info-content">
              <div className="info-row">
                <span>Model:</span>
                <span className="value">{signal.modelVersion || 'v1.1-deepseek'}</span>
              </div>
            </div>
          </div>

          {/* FLock Historical Analysis Panel */}
          {/* Debug: Log FLock data */}
          {console.log('🔍 FLock Debug:', {
            originalConfidence: signal.originalConfidence,
            confidenceAdjustment: signal.confidenceAdjustment,
            flockInsight: signal.flockInsight,
            hasFlockData: !!(signal.flockInsight && signal.confidenceAdjustment !== undefined)
          })}
          <FlockInsightPanel
            originalConfidence={signal.originalConfidence}
            confidence={signal.confidence}
            confidenceAdjustment={signal.confidenceAdjustment}
            flockInsight={signal.flockInsight}
          />
        </aside>
      </div>
    </div>
  );
};

export default SignalDetailPage;

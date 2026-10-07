import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import '../styles/SignalDetailPage.css';
import { alphaAgentService } from '../services/alphaAgentService';
import SignalPriceChart from './SignalPriceChart';
import TokenNewsFeed from './TokenNewsFeed';
import FlockInsightPanel from './FlockInsightPanel';
import SmartMoneyInsightSection from './SmartMoneyInsightSection';
import { SmartMoneyData } from '../types/alphaSignal';

interface FlockInsight {
  source: string;
  similarCasesCount: number;
  analysis: string;
  adjustmentReason: string;
}

// 🆕 维度评分接口
interface DimensionScore {
  score: number;
  signal: string;
  description?: string;
  // 特定维度的额外数据
  rsi?: number;
  ratio?: number;
  buys?: number;
  sells?: number;
  flowVelocity?: number;
  avgSize?: number;
  totalTxns?: number;
  impact?: number;
  risk?: string;
}

interface DimensionScores {
  oiFunding?: DimensionScore;
  trend?: DimensionScore;
  pattern?: DimensionScore;
  volume?: DimensionScore;
  keyLevels?: DimensionScore;
  rsi?: DimensionScore;
  macd?: DimensionScore;
  pullbackRisk?: DimensionScore;
  liquidityRisk?: DimensionScore;
  volatilityRisk?: DimensionScore;
  liquidationRisk?: DimensionScore;
  newTokenRisk?: DimensionScore;
  volumePriceDivergence?: DimensionScore;
  // DexScreener 维度
  flowVelocity?: DimensionScore;
  buySellRatio?: DimensionScore;
  tradeSizeAvg?: DimensionScore;
  priceImpactRisk?: DimensionScore;
  // Smart Money 维度 (v2.2 Sintral)
  smartMoney?: DimensionScore & { smartMoneyCount?: number; proCount?: number; bnTraders?: number; hasActiveSignal?: boolean };
  holderDistribution?: DimensionScore & { kolPercent?: number; proPercent?: number; smartMoneyPercent?: number; bundlerPercent?: number; newWalletPercent?: number; holdersChange24h?: number };
  smartMoneyMomentum?: DimensionScore;
  // BN Sentiment 维度 (v3.0)
  binanceSentiment?: DimensionScore & { bnTraders?: number; bnNetBuy?: number; bnBuySellRatio?: number };
  multiTimeframeMomentum?: DimensionScore & { priceChange5m?: number; priceChange1h?: number; priceChange4h?: number };
  pricePosition?: DimensionScore & { positionPercent?: number; priceHigh24h?: number; priceLow24h?: number };
  // Social Hype 维度 (v3.1)
  socialHype?: DimensionScore & { socialHype?: number; hypeChange24h?: number };
  socialSentiment?: DimensionScore & { sentiment?: string };
  socialPriceCorrelation?: DimensionScore;
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

  // Binance Alpha exchange link fields
  contractAddress?: string;
  chain?: string;  // 'bsc' | 'eth' | 'solana' etc.

  // 🆕 14维度评分数据
  dimensionScores?: DimensionScores | null;
  vetoReasons?: string | null;

  // 🆕 v2.2: Smart Money 数据
  smartMoneyData?: SmartMoneyData;
}

const SignalDetailPage: React.FC = () => {
  const { signalId, tokenSymbol: tokenSymbolParam } = useParams<{ signalId?: string; tokenSymbol?: string }>();
  const navigate = useNavigate();
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const account = getCurrentAccount();
  const [signal, setSignal] = useState<SignalDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'15m' | '1h' | '4h' | '1d'>('4h');
  const [error, setError] = useState<{ type: 'insufficient_credits' | 'not_found' | 'other', message: string } | null>(null);
  const [liveTokenData, setLiveTokenData] = useState<any>(null);
  const [brainData, setBrainData] = useState<any>(null);

  useEffect(() => {
    const fetchSignalDetail = async () => {
      // [2026-09-02] 支持通过tokenSymbol进入: 先找该token最新信号的signalId
      let resolvedSignalId = signalId;
      if (!resolvedSignalId && tokenSymbolParam) {
        try {
          const searchResult = await alphaAgentService.getSignals({
            tokenSymbol: tokenSymbolParam,
            limit: 1,
            status: 'ACTIVE',
            sortBy: 'confidence',
          });
          if (searchResult.signals && searchResult.signals.length > 0) {
            resolvedSignalId = searchResult.signals[0].signalId;
          } else {
            setError({ type: 'not_found', message: `No active signals found for ${tokenSymbolParam}` });
            setLoading(false);
            return;
          }
        } catch (e: any) {
          setError({ type: 'other', message: `Failed to find signal for ${tokenSymbolParam}` });
          setLoading(false);
          return;
        }
      }

      if (!resolvedSignalId) return;

      if (!account) {
        console.error('Account not found, please connect wallet');
        setError({ type: 'other', message: 'Please connect your wallet to view signal details' });
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await alphaAgentService.viewSignalDetail(account, resolvedSignalId);
        setSignal(result.signal);
      } catch (error: any) {
        console.error('Failed to load signal detail:', error);

        if (error.response?.status === 404) {
          setError({
            type: 'not_found',
            message: 'Signal not found'
          });
        } else {
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

    // [2026-09-02] 获取Brain数据(如果有)
    const fetchBrainData = async () => {
      try {
        const data = await alphaAgentService.getBrainIntelligence();
        setBrainData(data);
      } catch (e) {}
    };
    fetchBrainData();
  }, [signalId, tokenSymbolParam, account]);

  // Fetch live Token Dynamic data from Binance Agent Skills
  useEffect(() => {
    if (!signal?.contractAddress) return;

    const fetchTokenDynamic = async () => {
      try {
        const chainMap: Record<string, string> = { bsc: '56', eth: '1', base: '8453', solana: 'CT_501' };
        const chainId = chainMap[(signal.chain || 'bsc').toLowerCase()] || '56';
        const result = await alphaAgentService.getTokenDynamicInfo(signal.contractAddress!, chainId);
        if (result.success && result.data) {
          setLiveTokenData(result.data);
        }
      } catch (err) {
        console.warn('Failed to fetch live token data:', err);
      }
    };

    fetchTokenDynamic();
  }, [signal?.contractAddress]);

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

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return 'N/A';
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

  // 从 dimensionScores 获取真实的评分（如果有），否则返回 null
  const getDimensionScore = (metricName: string): number | null => {
    if (!signal?.dimensionScores) return null;
    const ds = signal.dimensionScores;
    switch (metricName) {
      case 'oi': return ds.oiFunding?.score ?? null;
      case 'funding': return ds.oiFunding?.score ?? null; // OI和FR是合并计算的
      case 'volume': return ds.volume?.score ?? null;
      case 'trend': return ds.trend?.score ?? null;
      case 'pattern': return ds.pattern?.score ?? null;
      default: return null;
    }
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
          {error.type === 'not_found' ? '🔍' : '⚠️'}
        </div>
        <h2>
          {error.type === 'not_found' ? 'Signal Not Found' : 'Error Loading Signal'}
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
            <span className={`signal-type ${(signal.signalType || 'NEUTRAL').toLowerCase()}`}>
              {signal.signalType || 'NEUTRAL'}
            </span>
            <span className={`status-badge ${(signal.status || 'ACTIVE').toLowerCase()}`}>
              {(signal.status || 'ACTIVE').replace('_', ' ')}
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
          <button className="btn-primary" onClick={() => {
            if (signal.contractAddress && signal.chain && signal.chain !== null) {
              // Binance Alpha Token link (chain must be lowercase)
              const chainLower = signal.chain.toLowerCase();
              window.open(`https://www.binance.com/en/alpha/${chainLower}/${signal.contractAddress}`, '_blank');
            } else {
              // Fallback to Spot trading (for mainstream tokens)
              window.open(`https://www.binance.com/en/trade/${signal.tokenSymbol}`, '_blank');
            }
          }}>
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
              <h2>Market Chart</h2>
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
              <h3>Trade Plan</h3>
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
                <span className={`risk-badge ${(signal.riskLevel || 'MEDIUM').toLowerCase()}`}>
                  {signal.riskLevel || 'MEDIUM'}
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
              {copied ? 'Plan Copied' : 'Copy Full Plan'}
            </button>
          </section>

          {/* Market Context Grid */}
          <section className="market-context">
            <div className="section-header">
              <h2>Market Context</h2>
            </div>

            <div className="metrics-grid">
              {/* OI & Leverage */}
              <div className="metric-card oi">
                <div className="card-header-mini">
                  <span className="title">Open Interest & OI/MC</span>
                  {getDimensionScore('oi') !== null && (
                    <span className="contribution">Score: {getDimensionScore('oi')}</span>
                  )}
                </div>
                <div className="metric-value">
                  {signal.analysis.oiChange24h !== null && signal.analysis.oiChange24h !== undefined ? (
                    <>
                      <span className={signal.analysis.oiChange24h > 0 ? 'positive' : 'negative'}>
                        {signal.analysis.oiChange24h > 0 ? '↗' : '↘'} {signal.analysis.oiChange24h > 0 ? '+' : ''}{signal.analysis.oiChange24h.toFixed(2)}%
                      </span>
                      <span className="period">24h</span>
                    </>
                  ) : (
                    <span className="na-value">N/A (Spot/DEX)</span>
                  )}
                </div>
                {signal.analysis.oiMcRatio && (
                  <div className="metric-details">
                    <div className="detail-row">
                      <span>OI/MC Ratio:</span>
                      <span className="highlight">{(signal.analysis.oiMcRatio * 100).toFixed(2)}%</span>
                    </div>
                    <div className="warning">
                      {signal.analysis.oiMcRatio >= 1 ? 'Extremely high leverage' :
                       signal.analysis.oiMcRatio >= 0.5 ? 'High leverage' :
                       'Moderate leverage'}
                    </div>
                  </div>
                )}
                <div className="status-indicator positive">Positive</div>
              </div>

              {/* Funding Rate */}
              <div className="metric-card funding">
                <div className="card-header-mini">
                  <span className="title">Funding Rate</span>
                </div>
                <div className="metric-value">
                  {signal.analysis.fundingRate !== null && signal.analysis.fundingRate !== undefined ? (
                    <span className={signal.analysis.fundingRate > 0 ? 'positive' : 'negative'}>
                      {signal.analysis.fundingRate > 0 ? '+' : ''}{(signal.analysis.fundingRate * 100).toFixed(3)}%
                    </span>
                  ) : (
                    <span className="na-value">N/A (Spot/DEX)</span>
                  )}
                </div>
                {signal.analysis.fundingRate !== null && signal.analysis.fundingRate !== undefined && (
                  <>
                    <div className="metric-details">
                      <div className="detail-row">
                        <span>Bias:</span>
                        <span>{signal.analysis.fundingRate > 0 ? 'Long' : 'Short'}</span>
                      </div>
                    </div>
                    <div className={`status-indicator ${Math.abs(signal.analysis.fundingRate) < 0.0005 ? 'neutral' : 'positive'}`}>
                      {Math.abs(signal.analysis.fundingRate) > 0.001 ? 'High Rate' :
                       Math.abs(signal.analysis.fundingRate) > 0.0005 ? 'Normal' : 'Low Rate'}
                    </div>
                  </>
                )}
              </div>

              {/* Volume */}
              <div className="metric-card volume">
                <div className="card-header-mini">
                  <span className="title">Volume</span>
                  {getDimensionScore('volume') !== null && (
                    <span className="contribution">Score: {getDimensionScore('volume')}</span>
                  )}
                </div>
                {liveTokenData?.volume24h ? (
                  <>
                    <div className="metric-value">
                      <span>${parseFloat(liveTokenData.volume24h) >= 1000000
                        ? (parseFloat(liveTokenData.volume24h) / 1000000).toFixed(2) + 'M'
                        : parseFloat(liveTokenData.volume24h) >= 1000
                        ? (parseFloat(liveTokenData.volume24h) / 1000).toFixed(1) + 'K'
                        : parseFloat(liveTokenData.volume24h).toFixed(0)}</span>
                      <span className="period">24h</span>
                    </div>
                    <div className="metric-details">
                      <div className="detail-row">
                        <span>Buy:</span>
                        <span className="positive">${parseFloat(liveTokenData.volume24hBuy) >= 1000000
                          ? (parseFloat(liveTokenData.volume24hBuy) / 1000000).toFixed(2) + 'M'
                          : (parseFloat(liveTokenData.volume24hBuy) / 1000).toFixed(1) + 'K'}</span>
                      </div>
                      <div className="detail-row">
                        <span>Sell:</span>
                        <span className="negative">${parseFloat(liveTokenData.volume24hSell) >= 1000000
                          ? (parseFloat(liveTokenData.volume24hSell) / 1000000).toFixed(2) + 'M'
                          : (parseFloat(liveTokenData.volume24hSell) / 1000).toFixed(1) + 'K'}</span>
                      </div>
                      <div className="detail-row">
                        <span>Txns:</span>
                        <span>{parseInt(liveTokenData.count24h || '0').toLocaleString()}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="metric-value">
                    <span>{signal.analysis.volume || 'N/A'}</span>
                  </div>
                )}
                <div className={`status-indicator ${
                  liveTokenData?.volume24hBuy && liveTokenData?.volume24hSell
                    ? (parseFloat(liveTokenData.volume24hBuy) > parseFloat(liveTokenData.volume24hSell) ? 'positive' : 'negative')
                    : signal.analysis.volume && signal.analysis.volume.toLowerCase().includes('surge') ? 'positive' : 'neutral'
                }`}>
                  {liveTokenData?.volume24hBuy && liveTokenData?.volume24hSell
                    ? (parseFloat(liveTokenData.volume24hBuy) > parseFloat(liveTokenData.volume24hSell)
                      ? `Buy ${(parseFloat(liveTokenData.volume24hBuy) / (parseFloat(liveTokenData.volume24hBuy) + parseFloat(liveTokenData.volume24hSell)) * 100).toFixed(0)}%`
                      : `Sell ${(parseFloat(liveTokenData.volume24hSell) / (parseFloat(liveTokenData.volume24hBuy) + parseFloat(liveTokenData.volume24hSell)) * 100).toFixed(0)}%`)
                    : signal.analysis.volume && signal.analysis.volume.toLowerCase().includes('surge') ? 'Surge' :
                     signal.analysis.volume && signal.analysis.volume.toLowerCase().includes('high') ? 'Active' :
                     'Stable'}
                </div>
              </div>

              {/* Trend */}
              <div className="metric-card trend">
                <div className="card-header-mini">
                  <span className="title">Trend</span>
                  {getDimensionScore('trend') !== null && (
                    <span className="contribution">Score: {getDimensionScore('trend')}</span>
                  )}
                </div>
                <div className="metric-value">
                  <span>{signal.analysis.trend || 'N/A'}</span>
                </div>
                {signal.dimensionScores?.trend && (
                  <div className="metric-details">
                    <div className="trend-strength">
                      <span>{signal.dimensionScores.trend.signal === 'LONG' ? 'Bullish' : signal.dimensionScores.trend.signal === 'SHORT' ? 'Bearish' : 'Neutral'}</span>
                      <div className="strength-bar">
                        <div className="strength-fill" style={{ width: `${signal.dimensionScores.trend.score}%` }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div className={`status-indicator ${signal.dimensionScores?.trend?.score && signal.dimensionScores.trend.score >= 70 ? 'positive' : 'neutral'}`}>
                  {signal.dimensionScores?.trend?.score && signal.dimensionScores.trend.score >= 70 ? 'Strong' : 'Moderate'}
                </div>
              </div>

              {/* Pattern */}
              {signal.analysis.pattern && signal.analysis.pattern !== 'None' && (
                <div className="metric-card pattern">
                  <div className="card-header-mini">
                    <span className="title">Pattern</span>
                    {getDimensionScore('pattern') !== null && (
                      <span className="contribution">Score: {getDimensionScore('pattern')}</span>
                    )}
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
                <h2>Key Levels</h2>
              </div>

              <div className="levels-grid">
                {signal.analysis.supportLevel && (
                  <div className="level-card support">
                    <div className="level-header">
                      <span>Support Level</span>
                    </div>
                    <div className="level-value">${formatPrice(signal.analysis.supportLevel)}</div>
                    <div className="level-distance">
                      Distance: {signal.analysis.supportLevel ? (((signal.currentPrice - signal.analysis.supportLevel) / signal.analysis.supportLevel) * 100).toFixed(2) : 'N/A'}%
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
                      <span>Resistance Level</span>
                    </div>
                    <div className="level-value">${formatPrice(signal.analysis.resistanceLevel)}</div>
                    <div className="level-distance">
                      Distance: {signal.analysis.resistanceLevel && signal.currentPrice ? (((signal.analysis.resistanceLevel - signal.currentPrice) / signal.currentPrice) * 100).toFixed(2) : 'N/A'}%
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

          {/* 🆕 v2.2: Smart Money Insights (Sintral/Binance Agent Skills) */}
          {(signal.smartMoneyData || liveTokenData) && (
            <SmartMoneyInsightSection
              data={signal.smartMoneyData || {
                smartMoneyHolders: liveTokenData ? parseInt(liveTokenData.smartMoneyHolders) || 0 : null,
                smartMoneyDirection: null,
                holderDistribution: liveTokenData ? {
                  kol: parseFloat(liveTokenData.kolHoldingPercent || '0') * 100,
                  pro: parseFloat(liveTokenData.proHoldingPercent || '0') * 100,
                  smartMoney: parseFloat(liveTokenData.smartMoneyHoldingPercent || '0') * 100,
                  bundler: 0,
                  newWallet: 0
                } : null,
                auditBlacklist: null,
                smartMoneyBoost: null
              }}
              currentPrice={signal.currentPrice}
              dimensionScores={signal.dimensionScores}
              liveTokenData={liveTokenData}
            />
          )}

          {/* 🆕 Dimension Analysis - 14维度评分展示 */}
          {signal.dimensionScores && (
            <section className="dimension-analysis">
              <div className="section-header">
                <h2>Dimension Analysis</h2>
                <span className="subtitle">17 Factor Scoring System</span>
              </div>

              <div className="dimension-grid">
                {/* 基础维度 */}
                <div className="dimension-group">
                  <h4 className="group-title">Base Factors</h4>
                  <div className="dimension-cards">
                    {/* OI + Funding */}
                    {signal.dimensionScores.oiFunding && (
                      <div className={`dimension-card ${signal.dimensionScores.oiFunding.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">OI + FR</span>
                          <span className="dim-weight">14%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.oiFunding.score}</div>
                        <div className={`dim-signal ${signal.dimensionScores.oiFunding.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.oiFunding.signal}
                        </div>
                      </div>
                    )}

                    {/* Trend */}
                    {signal.dimensionScores.trend && (
                      <div className={`dimension-card ${signal.dimensionScores.trend.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">Trend</span>
                          <span className="dim-weight">14%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.trend.score}</div>
                        <div className={`dim-signal ${signal.dimensionScores.trend.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.trend.signal}
                        </div>
                      </div>
                    )}

                    {/* Pattern */}
                    {signal.dimensionScores.pattern && (
                      <div className={`dimension-card ${signal.dimensionScores.pattern.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">Pattern</span>
                          <span className="dim-weight">10%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.pattern.score}</div>
                        <div className={`dim-signal ${signal.dimensionScores.pattern.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.pattern.signal}
                        </div>
                      </div>
                    )}

                    {/* Volume */}
                    {signal.dimensionScores.volume && (
                      <div className={`dimension-card ${signal.dimensionScores.volume.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">Volume</span>
                          <span className="dim-weight">7%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.volume.score}</div>
                        <div className={`dim-signal ${signal.dimensionScores.volume.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.volume.signal}
                        </div>
                      </div>
                    )}

                    {/* Key Levels */}
                    {signal.dimensionScores.keyLevels && (
                      <div className={`dimension-card ${signal.dimensionScores.keyLevels.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">Key Levels</span>
                          <span className="dim-weight">5%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.keyLevels.score}</div>
                        <div className={`dim-signal ${signal.dimensionScores.keyLevels.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.keyLevels.signal}
                        </div>
                      </div>
                    )}

                    {/* RSI */}
                    {signal.dimensionScores.rsi && (
                      <div className={`dimension-card ${signal.dimensionScores.rsi.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">RSI</span>
                          <span className="dim-weight">7%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.rsi.score}</div>
                        <div className="dim-detail">RSI: {signal.dimensionScores.rsi.rsi?.toFixed(1) || 'N/A'}</div>
                        <div className={`dim-signal ${signal.dimensionScores.rsi.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.rsi.signal}
                        </div>
                      </div>
                    )}

                    {/* MACD */}
                    {signal.dimensionScores.macd && (
                      <div className={`dimension-card ${signal.dimensionScores.macd.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">MACD</span>
                          <span className="dim-weight">2%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.macd.score}</div>
                        <div className={`dim-signal ${signal.dimensionScores.macd.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.macd.signal}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 风险维度 */}
                <div className="dimension-group">
                  <h4 className="group-title">Risk Factors</h4>
                  <div className="dimension-cards">
                    {/* Pullback Risk */}
                    {signal.dimensionScores.pullbackRisk && (
                      <div className={`dimension-card risk ${signal.dimensionScores.pullbackRisk.risk?.toLowerCase() || ''}`}>
                        <div className="dim-header">
                          <span className="dim-name">Pullback</span>
                          <span className="dim-weight">-6%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.pullbackRisk.score}</div>
                        <div className={`dim-risk ${signal.dimensionScores.pullbackRisk.score > 50 ? 'high' : signal.dimensionScores.pullbackRisk.score > 30 ? 'medium' : 'low'}`}>
                          {signal.dimensionScores.pullbackRisk.score > 50 ? 'High' : signal.dimensionScores.pullbackRisk.score > 30 ? 'Medium' : 'Low'}
                        </div>
                      </div>
                    )}

                    {/* Liquidity Risk */}
                    {signal.dimensionScores.liquidityRisk && (
                      <div className={`dimension-card risk`}>
                        <div className="dim-header">
                          <span className="dim-name">Liquidity</span>
                          <span className="dim-weight">-8%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.liquidityRisk.score}</div>
                        <div className={`dim-risk ${signal.dimensionScores.liquidityRisk.score > 50 ? 'high' : signal.dimensionScores.liquidityRisk.score > 30 ? 'medium' : 'low'}`}>
                          {signal.dimensionScores.liquidityRisk.score > 50 ? 'High' : signal.dimensionScores.liquidityRisk.score > 30 ? 'Medium' : 'Low'}
                        </div>
                      </div>
                    )}

                    {/* Volatility Risk */}
                    {signal.dimensionScores.volatilityRisk && (
                      <div className={`dimension-card risk`}>
                        <div className="dim-header">
                          <span className="dim-name">Volatility</span>
                          <span className="dim-weight">-5%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.volatilityRisk.score}</div>
                        <div className={`dim-risk ${signal.dimensionScores.volatilityRisk.score > 50 ? 'high' : signal.dimensionScores.volatilityRisk.score > 30 ? 'medium' : 'low'}`}>
                          {signal.dimensionScores.volatilityRisk.score > 50 ? 'High' : signal.dimensionScores.volatilityRisk.score > 30 ? 'Medium' : 'Low'}
                        </div>
                      </div>
                    )}

                    {/* Liquidation Risk */}
                    {signal.dimensionScores.liquidationRisk && (
                      <div className={`dimension-card risk`}>
                        <div className="dim-header">
                          <span className="dim-name">Liquidation</span>
                          <span className="dim-weight">-3%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.liquidationRisk.score}</div>
                        <div className={`dim-risk ${signal.dimensionScores.liquidationRisk.score > 50 ? 'high' : signal.dimensionScores.liquidationRisk.score > 30 ? 'medium' : 'low'}`}>
                          {signal.dimensionScores.liquidationRisk.score > 50 ? 'High' : signal.dimensionScores.liquidationRisk.score > 30 ? 'Medium' : 'Low'}
                        </div>
                      </div>
                    )}

                    {/* New Token Risk */}
                    {signal.dimensionScores.newTokenRisk && (
                      <div className={`dimension-card risk`}>
                        <div className="dim-header">
                          <span className="dim-name">New Token</span>
                          <span className="dim-weight">-2%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.newTokenRisk.score}</div>
                        <div className={`dim-risk ${signal.dimensionScores.newTokenRisk.score > 50 ? 'high' : signal.dimensionScores.newTokenRisk.score > 30 ? 'medium' : 'low'}`}>
                          {signal.dimensionScores.newTokenRisk.score > 50 ? 'High' : signal.dimensionScores.newTokenRisk.score > 30 ? 'Medium' : 'Low'}
                        </div>
                      </div>
                    )}

                    {/* Holder Distribution (replaces Whale Risk in v2.2) */}
                    {signal.dimensionScores.holderDistribution && (
                      <div className={`dimension-card ${signal.dimensionScores.holderDistribution.score >= 50 ? '' : 'risk'}`}>
                        <div className="dim-header">
                          <span className="dim-name">Holders</span>
                          <span className="dim-weight">4%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.holderDistribution.score}</div>
                        <div className={`dim-risk ${signal.dimensionScores.holderDistribution.risk === 'LOW' ? 'low' : signal.dimensionScores.holderDistribution.risk === 'MEDIUM' ? 'medium' : 'high'}`}>
                          {signal.dimensionScores.holderDistribution.risk || 'MEDIUM'}
                        </div>
                      </div>
                    )}

                    {/* Smart Money */}
                    {signal.dimensionScores.smartMoney && (
                      <div className={`dimension-card ${signal.dimensionScores.smartMoney.score >= 50 ? '' : 'risk'}`}>
                        <div className="dim-header">
                          <span className="dim-name">Smart Money</span>
                          <span className="dim-weight">6%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.smartMoney.score}</div>
                        <div className={`dim-risk ${signal.dimensionScores.smartMoney.score >= 65 ? 'low' : signal.dimensionScores.smartMoney.score >= 40 ? 'medium' : 'high'}`}>
                          {signal.dimensionScores.smartMoney.hasActiveSignal ? 'Signal Active' : `SM:${signal.dimensionScores.smartMoney.smartMoneyCount || 0}`}
                        </div>
                      </div>
                    )}

                    {/* Smart Money Momentum */}
                    {signal.dimensionScores.smartMoneyMomentum && (
                      <div className={`dimension-card ${signal.dimensionScores.smartMoneyMomentum.score >= 50 ? '' : 'risk'}`}>
                        <div className="dim-header">
                          <span className="dim-name">SM Momentum</span>
                          <span className="dim-weight">5%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.smartMoneyMomentum.score}</div>
                        <div className={`dim-risk ${signal.dimensionScores.smartMoneyMomentum.signal === 'LONG' ? 'low' : signal.dimensionScores.smartMoneyMomentum.signal === 'SHORT' ? 'high' : 'medium'}`}>
                          {signal.dimensionScores.smartMoneyMomentum.signal}
                        </div>
                      </div>
                    )}

                    {/* Volume Price Divergence */}
                    {signal.dimensionScores.volumePriceDivergence && (
                      <div className={`dimension-card risk`}>
                        <div className="dim-header">
                          <span className="dim-name">Vol-Price Div</span>
                          <span className="dim-weight">-1%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.volumePriceDivergence.score}</div>
                        <div className={`dim-risk ${signal.dimensionScores.volumePriceDivergence.score > 50 ? 'high' : signal.dimensionScores.volumePriceDivergence.score > 30 ? 'medium' : 'low'}`}>
                          {signal.dimensionScores.volumePriceDivergence.score > 50 ? 'Divergence' : 'Normal'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 🆕 v3.1: Social Hype 维度 */}
                {(signal.dimensionScores.socialHype || signal.dimensionScores.socialSentiment || signal.dimensionScores.socialPriceCorrelation) && (
                <div className="dimension-group">
                  <h4 className="group-title">Social Hype</h4>
                  <div className="dimension-cards">
                    {signal.dimensionScores.socialHype && (
                      <div className={`dimension-card ${signal.dimensionScores.socialHype.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">Hype Score</span>
                          <span className="dim-weight">7%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.socialHype.score}</div>
                        <div className="dim-detail">{signal.dimensionScores.socialHype.description || 'N/A'}</div>
                        <div className={`dim-signal ${signal.dimensionScores.socialHype.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.socialHype.signal}
                        </div>
                      </div>
                    )}
                    {signal.dimensionScores.socialSentiment && (
                      <div className={`dimension-card ${signal.dimensionScores.socialSentiment.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">Sentiment</span>
                          <span className="dim-weight">5%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.socialSentiment.score}</div>
                        <div className="dim-detail">{signal.dimensionScores.socialSentiment.sentiment || 'N/A'}</div>
                        <div className={`dim-signal ${signal.dimensionScores.socialSentiment.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.socialSentiment.signal}
                        </div>
                      </div>
                    )}
                    {signal.dimensionScores.socialPriceCorrelation && (
                      <div className={`dimension-card ${signal.dimensionScores.socialPriceCorrelation.signal?.toLowerCase()}`}>
                        <div className="dim-header">
                          <span className="dim-name">Hype-Price</span>
                          <span className="dim-weight">4%</span>
                        </div>
                        <div className="dim-score">{signal.dimensionScores.socialPriceCorrelation.score}</div>
                        <div className="dim-detail">{signal.dimensionScores.socialPriceCorrelation.description || 'N/A'}</div>
                        <div className={`dim-signal ${signal.dimensionScores.socialPriceCorrelation.signal?.toLowerCase()}`}>
                          {signal.dimensionScores.socialPriceCorrelation.signal}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )}
              </div>
            </section>
          )}

          {/* 🆕 Market Activity Section - 显示新增的交易活跃度因子 */}
          {signal.dimensionScores && (signal.dimensionScores.flowVelocity || signal.dimensionScores.buySellRatio || signal.dimensionScores.tradeSizeAvg || signal.dimensionScores.priceImpactRisk) && (
            <section className="market-activity">
              <div className="section-header">
                <h2>Market Activity</h2>
                <span className="subtitle">24h Transaction Analysis</span>
              </div>

              <div className="activity-grid">
                {/* Flow Velocity */}
                {signal.dimensionScores.flowVelocity && (
                  <div className={`activity-card ${signal.dimensionScores.flowVelocity.signal?.toLowerCase()}`}>
                    <div className="activity-header">
                      <span className="activity-name">Flow Velocity</span>
                    </div>
                    <div className="activity-value">
                      {signal.dimensionScores.flowVelocity.flowVelocity?.toFixed(2) || '0'}x
                    </div>
                    <div className="activity-desc">
                      {signal.dimensionScores.flowVelocity.description}
                    </div>
                    <div className={`activity-signal ${signal.dimensionScores.flowVelocity.signal?.toLowerCase()}`}>
                      {signal.dimensionScores.flowVelocity.signal === 'LONG' ? 'Active' :
                       signal.dimensionScores.flowVelocity.signal === 'SHORT' ? 'Inactive' : 'Normal'}
                    </div>
                  </div>
                )}

                {/* Buy/Sell Ratio */}
                {signal.dimensionScores.buySellRatio && (
                  <div className={`activity-card ${signal.dimensionScores.buySellRatio.signal?.toLowerCase()}`}>
                    <div className="activity-header">
                      <span className="activity-name">Buy/Sell Ratio</span>
                    </div>
                    <div className="activity-value">
                      {signal.dimensionScores.buySellRatio.ratio?.toFixed(2) || '1.00'}
                    </div>
                    <div className="activity-detail">
                      Buy: {signal.dimensionScores.buySellRatio.buys?.toLocaleString() || 0} |
                      Sell: {signal.dimensionScores.buySellRatio.sells?.toLocaleString() || 0}
                    </div>
                    <div className={`activity-signal ${signal.dimensionScores.buySellRatio.signal?.toLowerCase()}`}>
                      {signal.dimensionScores.buySellRatio.signal === 'LONG' ? 'Bullish' :
                       signal.dimensionScores.buySellRatio.signal === 'SHORT' ? 'Bearish' : 'Neutral'}
                    </div>
                  </div>
                )}

                {/* Trade Size Average */}
                {signal.dimensionScores.tradeSizeAvg && (
                  <div className={`activity-card ${signal.dimensionScores.tradeSizeAvg.signal?.toLowerCase()}`}>
                    <div className="activity-header">
                      <span className="activity-name">Avg Trade Size</span>
                    </div>
                    <div className="activity-value">
                      ${signal.dimensionScores.tradeSizeAvg.avgSize?.toLocaleString(undefined, {maximumFractionDigits: 0}) || '0'}
                    </div>
                    <div className="activity-detail">
                      Total: {signal.dimensionScores.tradeSizeAvg.totalTxns?.toLocaleString() || 0} txns
                    </div>
                    <div className={`activity-signal ${signal.dimensionScores.tradeSizeAvg.signal?.toLowerCase()}`}>
                      {signal.dimensionScores.tradeSizeAvg.description}
                    </div>
                  </div>
                )}

                {/* Price Impact Risk */}
                {signal.dimensionScores.priceImpactRisk && (
                  <div className={`activity-card risk ${signal.dimensionScores.priceImpactRisk.score > 50 ? 'high' : signal.dimensionScores.priceImpactRisk.score > 30 ? 'medium' : 'low'}`}>
                    <div className="activity-header">
                      <span className="activity-name">Price Impact</span>
                    </div>
                    <div className="activity-value">
                      {signal.dimensionScores.priceImpactRisk.impact?.toFixed(2) || '0'}%
                    </div>
                    <div className="activity-desc">
                      {signal.dimensionScores.priceImpactRisk.description}
                    </div>
                    <div className={`activity-risk ${signal.dimensionScores.priceImpactRisk.score > 50 ? 'high' : signal.dimensionScores.priceImpactRisk.score > 30 ? 'medium' : 'low'}`}>
                      {signal.dimensionScores.priceImpactRisk.score > 50 ? 'High Risk' :
                       signal.dimensionScores.priceImpactRisk.score > 30 ? 'Medium' : 'Low Risk'}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Signal Reasoning */}
          <section className="signal-reasoning">
            <div className="section-header">
              <h2>Signal Reasoning</h2>
            </div>

            <div className="reasoning-content">
              <div className="reasoning-item">
                <div className="item-title">Core Logic</div>
                <div className="item-content">
                  {signal.signalType} setup based on {signal.analysis.pattern || 'technical analysis'} with {signal.confidence}% confidence
                </div>
              </div>

              <div className="reasoning-item">
                <div className="item-title">Key Triggers</div>
                <div className="item-content">
                  Entry zone: ${formatPrice(signal.entryZone.min)} - ${formatPrice(signal.entryZone.max)}
                  <br />
                  {signal.analysis.volume && signal.analysis.volume.toLowerCase().includes('surge') && 'Volume surge confirmation'}
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
                    __html: (signal.reasoning || '')
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
                <h2>Audit & Outcome</h2>
              </div>

              <div className="timeline">
                <div className="timeline-item">
                  <span className="timestamp">Created</span>
                  <span className="date">{new Date(signal.createdAt).toLocaleString()}</span>
                </div>
                <div className="timeline-arrow">→</div>
                <div className="timeline-item">
                  <span className="timestamp">Outcome</span>
                  <span className={`outcome-badge ${(signal.status || 'ACTIVE').toLowerCase()}`}>
                    {(signal.status || 'ACTIVE').replace('_', ' ')}
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
          <>
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
            <h3 className="sidebar-section-title">Related News</h3>
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
                <span className="value">{signal.modelVersion || 'deepseek v3'}</span>
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
          </>
        </aside>
      </div>
    </div>
  );
};

export default SignalDetailPage;

import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import '../styles/SignalDetailPage.css';
import { memeRadarService } from '../services/memeRadarService';
import { MemeRadarSignalFull, MemeRadarDimensionScores } from '../types/memeRadarSignal';

const MemeRadarDetailPage: React.FC = () => {
  const { signalId } = useParams<{ signalId: string }>();
  const navigate = useNavigate();
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const account = getCurrentAccount();

  const [signal, setSignal] = useState<MemeRadarSignalFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [error, setError] = useState<{ type: string; message: string } | null>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      if (!signalId || !account) {
        if (!account) setError({ type: 'other', message: 'Please connect your wallet to view signal details' });
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await memeRadarService.viewSignalDetail(account, signalId);
        setSignal(result.signal);
      } catch (error: any) {
        // if (error.response?.status === 402) {
        //   setError({ type: 'insufficient_credits', message: `Insufficient credits...` });
        // } else
        if (error.response?.status === 404) {
          setError({ type: 'not_found', message: 'Signal not found' });
        } else {
          setError({ type: 'other', message: error.response?.data?.error || 'Failed to load signal detail' });
        }
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [signalId, account]);

  // Countdown timer
  useEffect(() => {
    if (!signal) return;
    const updateCountdown = () => {
      const diff = new Date(signal.expiresAt).getTime() - Date.now();
      if (diff <= 0) { setTimeRemaining('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [signal]);

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return 'N/A';
    if (price === 0) return '0';
    if (price < 0.000001) {
      // 超小数用下标零格式: 0.0₅436
      const s = price.toFixed(12).replace(/0+$/, '');
      return s.length > 12 ? price.toPrecision(3) : s;
    }
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01)   return price.toFixed(6);
    if (price < 1)      return price.toFixed(5);
    if (price < 100)    return price.toFixed(4);
    return price.toFixed(2);
  };

  const formatNumber = (num: number | undefined | null) => {
    const n = num ?? 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#22c55e';
    if (score >= 40) return '#F8D264';
    return '#ef4444';
  };

  const getLevelConfig = (level: string) => {
    switch (level) {
      case 'STRONG_BUY': return { text: 'STRONG BUY', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
      case 'BUY': return { text: 'BUY', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
      case 'VETO': return { text: 'VETO', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
      default: return { text: 'WATCH', color: '#F8D264', bg: 'rgba(248,210,100,0.15)' };
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'WIN': return { text: 'Win', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
      case 'LOSS': return { text: 'Loss', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
      case 'EXPIRED': return { text: 'Expired', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
      default: return { text: 'Active', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
    }
  };

  const copySignalPlan = () => {
    if (!signal) return;
    const text = `
📡 Meme Radar: ${signal.tokenSymbol} (${signal.chain})
🎯 Level: ${signal.signalLevel}
💯 Radar Score: ${signal.radarScore}/100
💰 Price: $${formatPrice(signal.currentPrice)}
📊 MCap: $${formatNumber(signal.marketCap)}
${signal.tradingPlan ? `
📍 Entry: $${formatPrice(signal.tradingPlan.entryPrice)}
🛑 Stop Loss: $${formatPrice(signal.tradingPlan.stopLoss)}
🎯 TP1: $${formatPrice(signal.tradingPlan.takeProfit1)}
${signal.tradingPlan.takeProfit2 ? `🎯 TP2: $${formatPrice(signal.tradingPlan.takeProfit2)}` : ''}
R:R = 1:${signal.tradingPlan.riskRewardRatio?.toFixed(1) ?? 'N/A'}` : ''}
⏰ Valid until: ${new Date(signal.expiresAt).toLocaleString()}
    `.trim();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Loading
  if (loading) {
    return (
      <div className="signal-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading meme radar signal...</p>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="signal-detail-error">
        <div className="error-icon">
          {error.type === 'not_found' ? '🔍' : '⚠️'}
        </div>
        <h2>{error.type === 'not_found' ? 'Signal Not Found' : 'Error'}</h2>
        <p className="error-message">{error.message}</p>
        <button className="primary-btn" onClick={() => navigate('/alpha-agent')}>
          Back to Signals
        </button>
      </div>
    );
  }

  if (!signal) return null;

  const levelConfig = getLevelConfig(signal.signalLevel);
  const statusConfig = getStatusConfig(signal.status);

  // Dimension data for display
  const dimensionEntries: { key: keyof MemeRadarDimensionScores; label: string; icon: string; group: 'momentum' | 'safety' }[] = [
    { key: 'signalResonance', label: 'Signal Resonance', icon: '📡', group: 'momentum' },
    { key: 'smartMoney', label: 'Smart Money', icon: '🧠', group: 'momentum' },
    { key: 'whaleKol', label: 'Whale / KOL', icon: '🐋', group: 'momentum' },
    { key: 'smartMoneyQuality', label: 'SM Quality', icon: '💎', group: 'momentum' },
    { key: 'volumeMomentum', label: 'Volume Momentum', icon: '📊', group: 'momentum' },
    { key: 'priceTrend', label: 'Price Trend', icon: '📈', group: 'momentum' },
    { key: 'topTraderConfidence', label: 'Top Trader', icon: '👑', group: 'momentum' },
    { key: 'devSafety', label: 'Dev Safety', icon: '🛡️', group: 'safety' },
    { key: 'liquidity', label: 'Liquidity', icon: '💧', group: 'safety' },
    { key: 'social', label: 'Social', icon: '💬', group: 'safety' },
  ];

  return (
    <div className="signal-detail-page">
      {/* Sticky Header - same structure as SignalDetailPage */}
      <div className="sticky-header">
        <div className="header-content">
          <div className="header-left">
            <button className="back-btn" onClick={() => navigate('/alpha-agent')}>
              ← Back
            </button>
            <div className="symbol-info">
              <h1 className="token-symbol-large">{signal.tokenSymbol}</h1>
              <div className="signal-badges">
                {/* Chain Badge */}
                <span className="signal-type-badge" style={{
                  background: signal.chain === 'SOL' ? '#9945FF' : signal.chain === 'BSC' ? '#F0B90B' : signal.chain === 'ETH' ? '#627EEA' : '#0052FF'
                }}>
                  {signal.chain}
                </span>
                {/* Signal Level */}
                <span className="signal-type-badge" style={{ background: levelConfig.color }}>
                  {levelConfig.text}
                </span>
                {/* Status */}
                <span className="status-badge-header" style={{ background: statusConfig.bg, color: statusConfig.color, border: `1px solid ${statusConfig.color}` }}>
                  {statusConfig.text}
                </span>
              </div>
            </div>
          </div>

          <div className="header-metrics">
            <div className="metric-item">
              <span className="metric-label">Radar Score</span>
              <span className="metric-value" style={{ color: getScoreColor(signal.radarScore) }}>{signal.radarScore}/100</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Price</span>
              <span className="metric-value">${formatPrice(signal.currentPrice)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">1h Change</span>
              <span className="metric-value" style={{ color: signal.priceChange1h >= 0 ? '#22c55e' : '#ef4444' }}>
                {signal.priceChange1h >= 0 ? '+' : ''}{signal.priceChange1h.toFixed(1)}%
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Market Cap</span>
              <span className="metric-value">${formatNumber(signal.marketCap)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Time Left</span>
              <span className="metric-value countdown">{timeRemaining}</span>
            </div>
          </div>

          <div className="header-actions">
            <button className="action-btn copy" onClick={copySignalPlan}>
              {copied ? '✓ Copied' : '📋 Copy Plan'}
            </button>
          </div>
        </div>
      </div>

      {/* K-line Chart via DexScreener embed */}
      <div style={{ padding: '0 24px 0 24px', marginBottom: '0' }}>
        <iframe
          src={`https://dexscreener.com/${
            signal.chain === 'SOL' ? 'solana' :
            signal.chain === 'BSC' ? 'bsc' :
            signal.chain === 'BASE' ? 'base' : 'ethereum'
          }/${signal.contractAddress}?embed=1&theme=dark&trades=0&info=0`}
          style={{
            width: '100%', height: '360px', border: 'none',
            borderRadius: '12px', background: '#161B22',
          }}
          title="DexScreener Chart"
          allow="clipboard-write"
        />
      </div>

      {/* Content Layout - 2 column */}
      <div className="content-layout">
        {/* Main Content */}
        <div className="main-content">

          {/* Trading Plan (if STRONG_BUY) */}
          {signal.tradingPlan && (
            <div className="detail-card trade-plan-card">
              <h3 className="card-title">🎯 Trading Plan</h3>
              <div className="plan-grid">
                <div className="plan-item entry">
                  <div className="plan-label">Entry Price</div>
                  <div className="plan-value">${formatPrice(signal.tradingPlan.entryPrice)}</div>
                </div>
                <div className="plan-item stop-loss">
                  <div className="plan-label">Stop Loss</div>
                  <div className="plan-value danger">${formatPrice(signal.tradingPlan.stopLoss)}</div>
                </div>
                <div className="plan-item take-profit">
                  <div className="plan-label">Take Profit 1</div>
                  <div className="plan-value success">${formatPrice(signal.tradingPlan.takeProfit1)}</div>
                </div>
                {signal.tradingPlan.takeProfit2 && (
                  <div className="plan-item take-profit">
                    <div className="plan-label">Take Profit 2</div>
                    <div className="plan-value success">${formatPrice(signal.tradingPlan.takeProfit2)}</div>
                  </div>
                )}
                <div className="plan-item">
                  <div className="plan-label">Risk : Reward</div>
                  <div className="plan-value">1 : {signal.tradingPlan.riskRewardRatio?.toFixed(1) ?? 'N/A'}</div>
                </div>
              </div>
            </div>
          )}

          {/* On-Chain Data */}
          <div className="detail-card">
            <h3 className="card-title">📊 On-Chain Market Data</h3>
            {/* Price change summary row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {[
                { label: '1h', val: signal.priceChange1h },
                { label: '24h', val: signal.priceChange24h },
              ].map(({ label, val }) => (
                <div key={label} style={{
                  padding: '6px 14px', borderRadius: '8px',
                  background: val >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${val >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <span style={{ fontSize: '11px', color: '#8B949E' }}>{label}</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: val >= 0 ? '#22c55e' : '#ef4444' }}>
                    {val >= 0 ? '+' : ''}{val.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
            {(() => {
              const od = signal.onChainData;
              const totalVol = (od.buyVolume24h ?? 0) + (od.sellVolume24h ?? 0);
              const totalTxns = (od.buyTxCount24h ?? 0) + (od.sellTxCount24h ?? 0);
              const buyVolPct  = totalVol  > 0 ? (od.buyVolume24h  / totalVol  * 100) : 0;
              const sellVolPct = totalVol  > 0 ? (od.sellVolume24h / totalVol  * 100) : 0;
              const buyTxPct   = totalTxns > 0 ? (od.buyTxCount24h  / totalTxns * 100) : 0;
              const sellTxPct  = totalTxns > 0 ? (od.sellTxCount24h / totalTxns * 100) : 0;
              const netFlow    = od.netFlow24h ?? 0;
              // 1h volume momentum: compare avg 1h volume vs avg hourly over 24h
              const vol1h  = od.volume1H ?? 0;
              const vol24h = signal.volume24h ?? 0;
              const avgHourly = vol24h / 24;
              const volMomentumPct = avgHourly > 0 ? ((vol1h - avgHourly) / avgHourly * 100) : 0;
              // health labels
              const liq = signal.liquidity ?? 0;
              const liqColor = liq > 50000 ? '#22c55e' : liq > 10000 ? '#F8D264' : '#ef4444';
              const liqLabel = liq > 50000 ? 'Healthy' : liq > 10000 ? 'Low' : 'Risky';
              const top10 = od.top10HolderPercent ?? 0;
              const top10Color = top10 < 30 ? '#22c55e' : top10 < 50 ? '#F8D264' : '#ef4444';
              const holders = od.holderCount ?? 0;
              const holderColor = holders > 500 ? '#22c55e' : holders > 100 ? '#F8D264' : '#ef4444';

              const Tag = ({ val, label }: { val: number; label?: string }) => (
                <span style={{
                  fontSize: '11px', fontWeight: 600, marginTop: '3px',
                  color: val >= 0 ? '#22c55e' : '#ef4444',
                }}>
                  {label ?? `${val >= 0 ? '▲' : '▼'} ${Math.abs(val).toFixed(1)}%`}
                </span>
              );

              return (
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-card-label">Buy Volume (24h)</div>
                    <div className="metric-card-value positive">${formatNumber(od.buyVolume24h)}</div>
                    <Tag val={buyVolPct - 50} label={`▲ ${buyVolPct.toFixed(1)}% of total`} />
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Sell Volume (24h)</div>
                    <div className="metric-card-value negative">${formatNumber(od.sellVolume24h)}</div>
                    <Tag val={-(sellVolPct - 50)} label={`▼ ${sellVolPct.toFixed(1)}% of total`} />
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Buy Txns (24h)</div>
                    <div className="metric-card-value">{formatNumber(od.buyTxCount24h)}</div>
                    <Tag val={buyTxPct - 50} label={`▲ ${buyTxPct.toFixed(1)}% of txns`} />
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Sell Txns (24h)</div>
                    <div className="metric-card-value">{formatNumber(od.sellTxCount24h)}</div>
                    <Tag val={-(sellTxPct - 50)} label={`▼ ${sellTxPct.toFixed(1)}% of txns`} />
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Unique Buyers</div>
                    <div className="metric-card-value">{formatNumber(od.uniqueBuyers24h)}</div>
                    {od.uniqueSellers24h > 0 && (
                      <Tag val={od.uniqueBuyers24h - od.uniqueSellers24h}
                        label={`${od.uniqueBuyers24h > od.uniqueSellers24h ? '▲' : '▼'} vs ${formatNumber(od.uniqueSellers24h)} sellers`} />
                    )}
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Net Flow (24h)</div>
                    <div className={`metric-card-value ${netFlow >= 0 ? 'positive' : 'negative'}`}>
                      {netFlow >= 0 ? '+' : ''}${formatNumber(netFlow)}
                    </div>
                    <Tag val={netFlow} label={netFlow >= 0 ? '▲ Net Inflow' : '▼ Net Outflow'} />
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">24h Volume</div>
                    <div className="metric-card-value">${formatNumber(vol24h)}</div>
                    {vol1h > 0 && <Tag val={volMomentumPct} label={`${volMomentumPct >= 0 ? '▲' : '▼'} 1h momentum ${Math.abs(volMomentumPct).toFixed(0)}%`} />}
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Liquidity</div>
                    <div className="metric-card-value">${formatNumber(liq)}</div>
                    <span style={{ fontSize: '11px', fontWeight: 600, marginTop: '3px', color: liqColor }}>{liqLabel}</span>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Holder Count</div>
                    <div className="metric-card-value">{formatNumber(holders)}</div>
                    <span style={{ fontSize: '11px', fontWeight: 600, marginTop: '3px', color: holderColor }}>
                      {holders > 500 ? 'Active' : holders > 100 ? 'Growing' : 'Early'}
                    </span>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Top10 Holdings</div>
                    <div className="metric-card-value">{top10.toFixed(1)}%</div>
                    <span style={{ fontSize: '11px', fontWeight: 600, marginTop: '3px', color: top10Color }}>
                      {top10 < 30 ? '▲ Decentralized' : top10 < 50 ? '◆ Moderate' : '▼ Concentrated'}
                    </span>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">LP Locked</div>
                    <div className={`metric-card-value ${od.lpLocked ? 'positive' : 'negative'}`}>
                      {od.lpLocked ? `Yes (${od.lpLockedPercent ?? 0}%)` : 'No'}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 600, marginTop: '3px', color: od.lpLocked ? '#22c55e' : '#ef4444' }}>
                      {od.lpLocked ? '▲ Secured' : '▼ Unlocked'}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 10-Dimension Analysis */}
          <div className="detail-card">
            <h3 className="card-title">📡 10-Dimension Radar Analysis</h3>

            {/* Momentum Group */}
            <div className="dimension-group">
              <h4 className="dimension-group-title">Momentum Dimensions</h4>
              <div className="dimension-cards">
                {dimensionEntries.filter(d => d.group === 'momentum').map((dim) => {
                  const score = signal.dimensionScores[dim.key];
                  return (
                    <div key={dim.key} className="dimension-card">
                      <div className="dimension-header">
                        <span className="dimension-icon">{dim.icon}</span>
                        <span className="dimension-name">{dim.label}</span>
                        <span className="dimension-score" style={{ color: getScoreColor(score) }}>
                          {score}
                        </span>
                      </div>
                      <div className="dimension-bar">
                        <div
                          className="dimension-bar-fill"
                          style={{
                            width: `${score}%`,
                            background: getScoreColor(score)
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Safety Group */}
            <div className="dimension-group">
              <h4 className="dimension-group-title">Safety Dimensions</h4>
              <div className="dimension-cards">
                {dimensionEntries.filter(d => d.group === 'safety').map((dim) => {
                  const score = signal.dimensionScores[dim.key];
                  return (
                    <div key={dim.key} className="dimension-card">
                      <div className="dimension-header">
                        <span className="dimension-icon">{dim.icon}</span>
                        <span className="dimension-name">{dim.label}</span>
                        <span className="dimension-score" style={{ color: getScoreColor(score) }}>
                          {score}
                        </span>
                      </div>
                      <div className="dimension-bar">
                        <div
                          className="dimension-bar-fill"
                          style={{
                            width: `${score}%`,
                            background: getScoreColor(score)
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Smart Money Activity */}
          <div className="detail-card">
            <h3 className="card-title">🧠 Smart Money Activity</h3>
            <div className="activity-grid">
              <div className="activity-card">
                <div className="activity-icon">🧠</div>
                <div className="activity-label">Smart Money</div>
                <div className="activity-value">{signal.smartMoneyCount}</div>
                <div className="activity-detail">
                  Recent Buyers: {signal.smartMoneyDetail.recentBuyers} | Sellers: {signal.smartMoneyDetail.recentSellers}
                </div>
              </div>
              <div className="activity-card">
                <div className="activity-icon">🐋</div>
                <div className="activity-label">Whales</div>
                <div className="activity-value">{signal.whaleCount}</div>
              </div>
              <div className="activity-card">
                <div className="activity-icon">👑</div>
                <div className="activity-label">KOLs</div>
                <div className="activity-value">{signal.kolCount}</div>
              </div>
              <div className="activity-card">
                <div className="activity-icon">🏆</div>
                <div className="activity-label">Top Traders</div>
                <div className="activity-value">{signal.topTraderCount}</div>
              </div>
            </div>
            {/* SM Detail */}
            <div style={{
              marginTop: '16px', padding: '16px', background: '#161B22',
              borderRadius: '12px', border: '1px solid #30363D'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#8B949E', marginBottom: '4px' }}>Avg Entry Price</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#E6EDF3' }}>
                    ${formatPrice(signal.smartMoneyDetail.avgEntryPrice)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#8B949E', marginBottom: '4px' }}>Avg Hold Period</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#E6EDF3' }}>
                    {signal.smartMoneyDetail.avgHoldingPeriod}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#8B949E', marginBottom: '4px' }}>Profitable</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: signal.smartMoneyDetail.profitablePercent >= 50 ? '#22c55e' : '#ef4444' }}>
                    {(signal.smartMoneyDetail.profitablePercent ?? 0).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Signal Reasoning */}
          <div className="detail-card">
            <h3 className="card-title">💡 Signal Reasoning</h3>
            <div className="reasoning-content">
              <p>{signal.reasoning}</p>
            </div>
          </div>

          {/* Signal Outcome */}
          {signal.outcome && (
            <div className="detail-card">
              <h3 className="card-title">📋 Signal Outcome</h3>
              <div className="audit-timeline">
                <div className="timeline-item">
                  <div className="timeline-dot" style={{ background: '#3b82f6' }}></div>
                  <div className="timeline-content">
                    <div className="timeline-label">Signal Created</div>
                    <div className="timeline-value">{new Date(signal.createdAt).toLocaleString()}</div>
                  </div>
                </div>
                <div className="timeline-item">
                  <div className="timeline-dot" style={{ background: '#F8D264' }}></div>
                  <div className="timeline-content">
                    <div className="timeline-label">Entry Price</div>
                    <div className="timeline-value">${formatPrice(signal.outcome.entryPrice)}</div>
                  </div>
                </div>
                <div className="timeline-item">
                  <div className="timeline-dot" style={{ background: signal.outcome.result === 'WIN' ? '#22c55e' : '#ef4444' }}></div>
                  <div className="timeline-content">
                    <div className="timeline-label">Outcome: {signal.outcome.result}</div>
                    <div className="timeline-value">
                      Exit: ${formatPrice(signal.outcome.exitPrice)} ({(signal.outcome.pnlPct ?? signal.outcome.profitPercent ?? 0) >= 0 ? '+' : ''}{(signal.outcome.pnlPct ?? signal.outcome.profitPercent ?? 0).toFixed(2)}%)
                    </div>
                  </div>
                </div>
                <div className="timeline-item">
                  <div className="timeline-dot" style={{ background: '#6b7280' }}></div>
                  <div className="timeline-content">
                    <div className="timeline-label">Checked At</div>
                    <div className="timeline-value">{new Date(signal.outcome.evaluatedAt ?? signal.outcome.checkedAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className="side-panel">
          {/* Radar Score Ring */}
          <div className="detail-card confidence-card">
            <h4 className="side-card-title">Radar Score</h4>
            <div className="confidence-ring-container">
              <svg viewBox="0 0 120 120" className="confidence-ring">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#30363D" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={getScoreColor(signal.radarScore)}
                  strokeWidth="8"
                  strokeDasharray={`${(signal.radarScore / 100) * 327} 327`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div className="confidence-ring-value">
                <span className="confidence-number" style={{ color: getScoreColor(signal.radarScore) }}>
                  {signal.radarScore}
                </span>
                <span className="confidence-label-ring">/100</span>
              </div>
            </div>
            <div className="confidence-level" style={{ color: levelConfig.color }}>
              {levelConfig.text}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="detail-card">
            <h4 className="side-card-title">Quick Stats</h4>
            <div className="quick-stats">
              <div className="stat-row">
                <span className="stat-label">Chain</span>
                <span className="stat-value">{signal.chain}</span>
              </div>
              {signal.contractAddress && (
                <div className="stat-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                  <span className="stat-label">Contract</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <span style={{
                      fontSize: '11px', color: '#E6EDF3', wordBreak: 'break-all',
                      background: 'rgba(139,148,158,0.1)', padding: '6px 10px',
                      borderRadius: '6px', flex: 1, userSelect: 'all',
                      border: '1px solid rgba(139,148,158,0.2)',
                    }}>
                      {signal.contractAddress}
                    </span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(signal.contractAddress); }}
                      style={{
                        background: 'rgba(88,166,255,0.15)', border: '1px solid rgba(88,166,255,0.3)',
                        borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
                        color: '#58A6FF', fontSize: '12px', whiteSpace: 'nowrap',
                      }}
                    >Copy</button>
                  </div>
                </div>
              )}
              <div className="stat-row">
                <span className="stat-label">Price (24h)</span>
                <span className="stat-value" style={{ color: signal.priceChange24h >= 0 ? '#22c55e' : '#ef4444' }}>
                  {signal.priceChange24h >= 0 ? '+' : ''}{signal.priceChange24h.toFixed(1)}%
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Smart Money</span>
                <span className="stat-value">{signal.smartMoneyCount}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Whales</span>
                <span className="stat-value">{signal.whaleCount}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">KOLs</span>
                <span className="stat-value">{signal.kolCount}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Top Traders</span>
                <span className="stat-value">{signal.topTraderCount}</span>
              </div>
            </div>
          </div>

          {/* Dev Safety */}
          <div className="detail-card">
            <h4 className="side-card-title">🛡️ Dev Safety</h4>
            <div className="quick-stats">
              <div className="stat-row">
                <span className="stat-label">Renounced</span>
                <span className="stat-value" style={{ color: signal.devSafetyDetail.isRenounced ? '#22c55e' : '#ef4444' }}>
                  {signal.devSafetyDetail.isRenounced ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Mintable</span>
                <span className="stat-value" style={{ color: signal.devSafetyDetail.isMintable ? '#ef4444' : '#22c55e' }}>
                  {signal.devSafetyDetail.isMintable ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Proxy</span>
                <span className="stat-value" style={{ color: signal.devSafetyDetail.hasProxy ? '#F8D264' : '#22c55e' }}>
                  {signal.devSafetyDetail.hasProxy ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Honeypot Risk</span>
                <span className="stat-value" style={{
                  color: signal.devSafetyDetail.honeypotRisk === 'LOW' ? '#22c55e' :
                         signal.devSafetyDetail.honeypotRisk === 'MEDIUM' ? '#F8D264' : '#ef4444'
                }}>
                  {signal.devSafetyDetail.honeypotRisk}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Dev Holdings</span>
                <span className="stat-value">{(signal.devSafetyDetail.devHolderPercent ?? 0).toFixed(1)}%</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Audit Score</span>
                <span className="stat-value" style={{ color: getScoreColor(signal.devSafetyDetail.auditScore) }}>
                  {signal.devSafetyDetail.auditScore}/100
                </span>
              </div>
            </div>
          </div>

          {/* GMGN On-Chain Risk Analysis */}
          {signal.onChainData && (signal.onChainData.gmgnRugRatio != null || signal.onChainData.gmgnIsHoneypot != null) && (
          <div className="detail-card">
            <h4 className="side-card-title">🔍 On-Chain Risk Analysis</h4>
            <div className="quick-stats">
              <div className="stat-row">
                <span className="stat-label">Honeypot</span>
                <span className="stat-value" style={{ color: signal.onChainData.gmgnIsHoneypot ? '#ef4444' : '#22c55e' }}>
                  {signal.onChainData.gmgnIsHoneypot ? 'DETECTED' : 'Safe'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Wash Trading</span>
                <span className="stat-value" style={{ color: signal.onChainData.gmgnIsWashTrading ? '#ef4444' : '#22c55e' }}>
                  {signal.onChainData.gmgnIsWashTrading ? 'DETECTED' : 'Clean'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Rug Probability</span>
                <span className="stat-value" style={{
                  color: (signal.onChainData.gmgnRugRatio || 0) > 0.3 ? '#ef4444' :
                         (signal.onChainData.gmgnRugRatio || 0) > 0.1 ? '#F8D264' : '#22c55e'
                }}>
                  {((signal.onChainData.gmgnRugRatio || 0) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Insider Holdings</span>
                <span className="stat-value" style={{
                  color: (signal.onChainData.gmgnInsiderRate || 0) > 0.15 ? '#ef4444' :
                         (signal.onChainData.gmgnInsiderRate || 0) > 0.05 ? '#F8D264' : '#22c55e'
                }}>
                  {((signal.onChainData.gmgnInsiderRate || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Rat Traders</span>
                <span className="stat-value" style={{
                  color: (signal.onChainData.gmgnRatRate || 0) > 0.10 ? '#ef4444' :
                         (signal.onChainData.gmgnRatRate || 0) > 0.03 ? '#F8D264' : '#22c55e'
                }}>
                  {((signal.onChainData.gmgnRatRate || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Bundler Bots</span>
                <span className="stat-value" style={{
                  color: (signal.onChainData.gmgnBundlerRate || 0) > 0.15 ? '#ef4444' :
                         (signal.onChainData.gmgnBundlerRate || 0) > 0.05 ? '#F8D264' : '#22c55e'
                }}>
                  {((signal.onChainData.gmgnBundlerRate || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Entrapment Ratio</span>
                <span className="stat-value" style={{
                  color: (signal.onChainData.gmgnEntrapmentRatio || 0) > 0.30 ? '#ef4444' :
                         (signal.onChainData.gmgnEntrapmentRatio || 0) > 0.10 ? '#F8D264' : '#22c55e'
                }}>
                  {((signal.onChainData.gmgnEntrapmentRatio || 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
          )}

          {/* Signal Age / Countdown */}
          <div className="detail-card countdown-box">
            <h4 className="side-card-title">Signal Age</h4>
            <div className="countdown-value">{timeRemaining}</div>
            <div className="countdown-label">
              Created: {new Date(signal.createdAt).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </div>
          </div>

          {/* Engine Info */}
          <div className="detail-card">
            <h4 className="side-card-title">Engine Info</h4>
            <div className="quick-stats">
              <div className="stat-row">
                <span className="stat-label">Source</span>
                <span className="stat-value">Meme Radar v1.0</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Data</span>
                <span className="stat-value">Multi-Source On-Chain</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Signal ID</span>
                <span className="stat-value" style={{ fontSize: '10px', fontFamily: 'monospace' }}>
                  {signal.signalId.slice(0, 12)}...
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemeRadarDetailPage;

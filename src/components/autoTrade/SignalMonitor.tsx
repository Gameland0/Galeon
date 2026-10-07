/**
 * Signal Monitor Component
 * Unified signal feed from TG + Twitter + Meme Radar
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../../contexts/PrivyWalletContext';
import { getSignalFeed, Signal, SignalStats, TopGain, TopSignal } from '../../services/signalMonitorApi';
import './SignalMonitor.css';

export function SignalMonitor() {
  const { getAccessToken } = useWallet();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [topGains, setTopGains] = useState<TopGain[]>([]);
  const [topSignals, setTopSignals] = useState<TopSignal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [expandedPipelines, setExpandedPipelines] = useState<Set<string>>(new Set());
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState({
    source: 'all',
    status: 'all',
    chain: 'all'
  });

  const loadSignals = useCallback(async (append = false) => {
    try {
      setIsLoading(true);
      setError(null);
      const accessToken = await getAccessToken();
      if (!accessToken) { setError('Please login first'); return; }

      const response = await getSignalFeed(accessToken, {
        source: filters.source,
        status: filters.status,
        chain: filters.chain,
        limit: 50,
        offset: append ? signals.length : 0
      });

      if (response.success) {
        setSignals(prev => append ? [...prev, ...response.signals] : response.signals);
        setStats(response.stats);
        setTopGains(response.topGains || []);
        setTopSignals(response.topSignals || []);
        setHasMore(response.hasMore);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load signals');
    } finally {
      setIsLoading(false);
    }
  }, [filters, signals.length, getAccessToken]);

  const lastLoadRef = React.useRef<{ time: number; key: string }>({ time: 0, key: '' });
  useEffect(() => {
    const filterKey = `${filters.source}-${filters.status}-${filters.chain}`;
    const now = Date.now();
    // Skip if same filters loaded within 3 minutes
    if (lastLoadRef.current.key === filterKey && now - lastLoadRef.current.time < 180000 && signals.length > 0) return;
    lastLoadRef.current = { time: now, key: filterKey };
    loadSignals();
  }, [filters]);

  const togglePipeline = (id: string) => {
    setExpandedPipelines(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleMessage = (id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatMC = (val: number | null) => {
    if (!val) return null;
    if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
    return `$${val.toFixed(0)}`;
  };

  const decodeHtml = (text: string) => {
    return text.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  };

  const truncateAddr = (addr: string | null) => {
    if (!addr) return null;
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 2000);
  };

  const getScoreClass = (score: number | null) => {
    if (score === null) return '';
    if (score >= 0.6) return 'high';
    if (score >= 0.3) return 'medium';
    return 'low';
  };

  const getAnalysisTag = (signal: Signal) => {
    if (signal.claude_skip_reason === 'sarcasm') return { label: 'Sarcasm', cls: 'sarcasm' };
    if (signal.claude_skip_reason === 'report') return { label: 'Report', cls: 'report' };
    if (signal.claude_skip_reason === 'irrelevant') return { label: 'Irrelevant', cls: 'report' };
    if (signal.ai_score !== null && signal.ai_score < 0.15) return { label: 'Critical Risk', cls: 'risky' };
    if (signal.ai_score !== null && signal.ai_score < 0.4) return { label: 'High Risk', cls: 'warning' };
    if (signal.signal_type === 'STRONG_BUY') return { label: 'Strong Signal', cls: 'genuine' };
    if (signal.status !== 'skipped') return { label: 'Genuine Signal', cls: 'genuine' };
    return { label: 'Low Confidence', cls: 'warning' };
  };

  const renderPipeline = (signal: Signal) => {
    const steps: { label: string; status: string; desc: string; trade?: boolean; analysisData?: any }[] = [];

    // Step 1: Signal Agent
    if (signal.source === 'meme_radar') {
      steps.push({
        label: 'Radar Agent Scan',
        status: 'pass',
        desc: `Radar score ${signal.ai_score !== null ? (signal.ai_score * 100).toFixed(1) : 'N/A'} · ${signal.signal_type || 'WATCH'}`
      });
    } else {
      const extracted = signal.extraction_source === 'Claude' ? 'AI' : 'Keywords';
      if (signal.claude_skip_reason) {
        steps.push({
          label: 'Signal Agent',
          status: 'fail',
          desc: `${extracted} extraction: ${signal.claude_skip_reason} detected. Signal rejected.`
        });
        steps.push({ label: 'Result', status: 'skip', desc: `Signal rejected at extraction stage. No further processing.` });
        return steps;
      }
      steps.push({
        label: 'Signal Agent',
        status: 'pass',
        desc: `${extracted} extracted ${signal.token_symbol} as ${signal.signal_type || 'BUY'}`
      });
    }

    // Step 2: Signal Agent Analysis
    if (signal.ai_score !== null) {
      const passed = signal.claude_suggestion !== 'SKIP' && signal.ai_score >= 0.3;

      // Parse analysis data (could be JSON or plain text)
      let analysisData: any = null;
      if (signal.claude_analysis) {
        try { analysisData = JSON.parse(signal.claude_analysis); } catch (e) { /* plain text */ }
      }

      let desc = `Score ${signal.ai_score.toFixed(2)}`;
      if (signal.claude_suggestion) desc += ` · ${signal.claude_suggestion}`;

      // Add reason
      const reason = analysisData?.reason || (typeof signal.claude_analysis === 'string' && !analysisData ? signal.claude_analysis : '');
      if (reason) desc += ` · ${reason}`;

      steps.push({
        label: 'Signal Agent Analysis',
        status: passed ? 'pass' : 'fail',
        desc,
        analysisData // attach for rendering
      });

      if (!passed && signal.status === 'skipped') {
        steps.push({ label: 'Result', status: 'skip', desc: 'Skipped by Signal Agent. Score below threshold.' });
        return steps;
      }
    }

    // Step 3: Risk Agent Check
    if (signal.status === 'skipped' && !signal.claude_skip_reason) {
      const reason = signal.trade?.error_message ||
        (signal.ai_score !== null && signal.ai_score > 0.3
          ? 'Insufficient wallet balance or risk check failed. No execution record created.'
          : 'Trade blocked by risk controller.');
      steps.push({ label: 'Risk Agent Check', status: 'fail', desc: reason });
      steps.push({ label: 'Result', status: 'skip', desc: 'Signal passed analysis but was not executed.' });
      return steps;
    }

    if (signal.trade) {
      steps.push({ label: 'Risk Agent Check', status: 'pass', desc: 'All risk checks passed.' });

      // Step 4: Execution Agent
      steps.push({
        label: 'Execution Agent',
        status: 'pass',
        desc: `Entry: $${signal.trade.entry_price?.toFixed(6) || 'N/A'} · Amount: $${signal.trade.entry_amount?.toFixed(2) || 'N/A'}`,
        trade: false
      });

      // Step 5: Portfolio Agent
      const pnlColor = (signal.trade.pnl_usdt || 0) >= 0 ? '#2FBF7A' : '#FF6464';
      const pnlText = signal.trade.pnl_usdt !== null
        ? `$${signal.trade.pnl_usdt >= 0 ? '+' : ''}${signal.trade.pnl_usdt.toFixed(2)} (${signal.trade.pnl_percent !== null ? (signal.trade.pnl_percent >= 0 ? '+' : '') + signal.trade.pnl_percent.toFixed(2) + '%' : ''})`
        : 'Monitoring...';
      steps.push({
        label: 'Portfolio Agent',
        status: 'pass',
        desc: `${signal.status === 'holding' ? 'Position monitoring active' : 'Position closed'} · TP: +${signal.trade.take_profit || '?'}% · SL: -${signal.trade.stop_loss || '?'}% · P&L: ${pnlText}`,
        trade: true
      });
    }

    return steps;
  };

  return (
    <div className="signal-monitor">
      {/* Stats */}
      {stats && (
        <div className="sm-stats">
          <div className="sm-stat-card">
            <div className="sm-stat-icon sm-total">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1463FF" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div className="sm-stat-info">
              <span className="sm-stat-label">Total Signals</span>
              <span className="sm-stat-value">{stats.total}</span>
            </div>
          </div>
          <div className="sm-stat-card">
            <div className="sm-stat-icon sm-traded">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2FBF7A" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div className="sm-stat-info">
              <span className="sm-stat-label">Active</span>
              <span className="sm-stat-value sm-positive">{stats.holding + stats.exited + stats.pending}</span>
            </div>
          </div>
          <div className="sm-stat-card">
            <div className="sm-stat-icon sm-skipped">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </div>
            <div className="sm-stat-info">
              <span className="sm-stat-label">Skipped</span>
              <span className="sm-stat-value">{stats.skipped}</span>
            </div>
          </div>
          <div className="sm-stat-card">
            <div className="sm-stat-icon sm-holding">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1463FF" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            </div>
            <div className="sm-stat-info">
              <span className="sm-stat-label">Holding</span>
              <span className="sm-stat-value">{stats.holding}</span>
            </div>
          </div>
        </div>
      )}

      {/* Top Gains & Top Signals */}
      {(topGains.length > 0 || topSignals.length > 0) && (
        <div className="sm-top-row">
          {topGains.length > 0 && (
            <div className="sm-top-gains">
              <div className="sm-top-gains-title">Recent Top Gains</div>
              <div className="sm-top-gains-list">
                {topGains.map((g, i) => (
                  <div className="sm-top-gain-item" key={i}>
                    <span className="sm-top-gain-rank">{i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}</span>
                    <span className="sm-top-gain-token">${g.token}</span>
                    <span className="sm-top-gain-percent">+{g.gain_percent.toFixed(1)}%</span>
                    <span className="sm-top-gain-time">{formatTime(g.time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {topSignals.length > 0 && (
            <div className="sm-top-signals">
              <div className="sm-top-gains-title">Top Signal Calls</div>
              <div className="sm-top-gains-list">
                {topSignals.map((s, i) => (
                  <div className="sm-top-gain-item" key={i}>
                    <span className="sm-top-gain-rank">{i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}</span>
                    <span className="sm-top-gain-token">${s.token}</span>
                    <span className="sm-top-gain-percent">{s.gain}x</span>
                    <span className="sm-top-gain-time">{formatTime(s.time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="sm-filters">
        <div className="sm-filter-group">
          <label>Source:</label>
          <select value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}>
            <option value="all">All Sources</option>
            <option value="telegram">Telegram</option>
            <option value="twitter">Twitter</option>
            <option value="meme_radar">Meme Radar</option>
            <option value="alpha">Alpha Signals</option>
          </select>
        </div>
        <div className="sm-filter-group">
          <label>Status:</label>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="all">All</option>
            <option value="holding">Holding</option>
            <option value="exited">Exited</option>
            <option value="pending">Pending</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
        <div className="sm-filter-group">
          <label>Chain:</label>
          <select value={filters.chain} onChange={e => setFilters(f => ({ ...f, chain: e.target.value }))}>
            <option value="all">All Chains</option>
            <option value="SOL">Solana</option>
            <option value="BSC">BSC</option>
            <option value="ETH">ETH</option>
            <option value="BASE">Base</option>
          </select>
        </div>
        <button className="sm-btn-refresh" onClick={() => loadSignals()} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && <div className="sm-error">{error}</div>}

      {/* Loading */}
      {isLoading && signals.length === 0 && (
        <div className="sm-loading"><div className="sm-spinner"></div><p>Loading signals...</p></div>
      )}

      {/* Empty */}
      {!isLoading && signals.length === 0 && !error && (
        <div className="sm-empty"><p>No signals found. Configure Telegram groups or Twitter KOLs in Strategy tab.</p></div>
      )}

      {/* Signal List */}
      <div className="sm-signal-list">
        {signals.map(signal => {
          const tag = getAnalysisTag(signal);
          const scoreClass = getScoreClass(signal.ai_score);
          const pipelineOpen = expandedPipelines.has(signal.signal_id);
          const messageExpanded = expandedMessages.has(signal.signal_id);

          return (
            <div className="sm-card" key={signal.signal_id}>
              {/* Header */}
              <div className="sm-card-header">
                <div className="sm-source">
                  <span className={`sm-source-badge ${signal.source}`}>
                    {signal.source === 'telegram' ? 'TG' : signal.source === 'twitter' ? 'X' : signal.source === 'alpha' ? 'Alpha' : 'Radar'}
                  </span>
                  {signal.source_url ? (
                    <a className="sm-source-link" href={signal.source_url} target="_blank" rel="noopener noreferrer">{signal.source_name}</a>
                  ) : (
                    <span className="sm-source-name">{signal.source_name}</span>
                  )}
                </div>
                <span className="sm-time">{formatTime(signal.created_at)}</span>
              </div>

              {/* Token Row */}
              <div className="sm-token-row">
                <span className="sm-token-symbol">${signal.token_symbol}</span>
                {signal.signal_type && signal.signal_type !== 'NONE' && (
                  <span className={`sm-signal-badge ${signal.signal_type === 'SELL' ? 'sell' : 'buy'}`}>
                    {signal.signal_type}
                  </span>
                )}
                {signal.chain && <span className={`sm-chain-badge ${signal.chain.toLowerCase()}`}>{signal.chain}</span>}
                {signal.market_cap && <span className="sm-meta">MC {formatMC(signal.market_cap)}</span>}
                {signal.liquidity && <span className="sm-meta">Liq {formatMC(signal.liquidity)}</span>}
                {signal.contract_address && (
                  <span className={`sm-contract ${copiedAddr === signal.contract_address ? 'copied' : ''}`} onClick={() => copyAddress(signal.contract_address!)} title="Click to copy full address" style={{ cursor: 'pointer' }}>
                    {copiedAddr === signal.contract_address ? '✓ Copied!' : truncateAddr(signal.contract_address)}
                    {copiedAddr !== signal.contract_address && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.6 }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
                  </span>
                )}
                {signal.price_change_30m != null && (
                  <span className={`sm-meta ${signal.price_change_30m >= 0 ? 'sm-positive' : 'sm-negative'}`} title="Price change 30 min after signal">
                    30m: {signal.price_change_30m >= 0 ? '+' : ''}{signal.price_change_30m.toFixed(1)}%
                  </span>
                )}
                {signal.price_change_1h != null && (
                  <span className={`sm-meta ${signal.price_change_1h >= 0 ? 'sm-positive' : 'sm-negative'}`} title="Price change 1 hour after signal">
                    1h: {signal.price_change_1h >= 0 ? '+' : ''}{signal.price_change_1h.toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="sm-card-body">
                <div className="sm-main">
                  {signal.message && (
                    <div className={`sm-message ${messageExpanded ? 'expanded' : ''}`}>
                      {decodeHtml(signal.message)}
                    </div>
                  )}
                  {signal.message && signal.message.length > 120 && (
                    <button className="sm-btn-expand" onClick={() => toggleMessage(signal.signal_id)}>
                      {messageExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                  <div className="sm-analysis">
                    <span className={`sm-analysis-tag ${tag.cls}`}>{tag.label}</span>
                    {signal.claude_analysis && (
                      <span className="sm-analysis-reason">{signal.claude_analysis.substring(0, 80)}</span>
                    )}
                  </div>

                  {/* Pipeline Toggle */}
                  <button className={`sm-pipeline-toggle ${pipelineOpen ? 'open' : ''}`} onClick={() => togglePipeline(signal.signal_id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    Processing details
                  </button>
                  {pipelineOpen && (
                    <div className="sm-pipeline">
                      {renderPipeline(signal).map((step: any, i: number) => (
                        <div className="sm-step" key={i}>
                          <div className={`sm-step-ind ${step.status}`}>{step.status === 'skip' ? '-' : i + 1}</div>
                          <div className="sm-step-content">
                            <div className="sm-step-label">{step.label}</div>
                            <div className="sm-step-desc">{step.desc}</div>
                            {step.analysisData && step.analysisData.price && (
                              <div className="sm-market-data">
                                <div className="sm-market-row">
                                  <span className="sm-market-item">Price: <strong>${step.analysisData.price < 0.01 ? step.analysisData.price.toFixed(8) : step.analysisData.price.toFixed(4)}</strong></span>
                                  {step.analysisData.marketCap && <span className="sm-market-item">MC: <strong>{formatMC(step.analysisData.marketCap)}</strong></span>}
                                  {step.analysisData.liquidity && <span className="sm-market-item">Liq: <strong>{formatMC(step.analysisData.liquidity)}</strong></span>}
                                  {step.analysisData.volume24h && <span className="sm-market-item">Vol 24h: <strong>{formatMC(step.analysisData.volume24h)}</strong></span>}
                                </div>
                                {(step.analysisData.priceChange1h != null || step.analysisData.priceChange24h != null) && (
                                  <div className="sm-market-row">
                                    {step.analysisData.priceChange1h != null && <span className={`sm-market-change ${step.analysisData.priceChange1h >= 0 ? 'positive' : 'negative'}`}>1h: {step.analysisData.priceChange1h >= 0 ? '+' : ''}{step.analysisData.priceChange1h.toFixed(2)}%</span>}
                                    {step.analysisData.priceChange6h != null && <span className={`sm-market-change ${step.analysisData.priceChange6h >= 0 ? 'positive' : 'negative'}`}>6h: {step.analysisData.priceChange6h >= 0 ? '+' : ''}{step.analysisData.priceChange6h.toFixed(2)}%</span>}
                                    {step.analysisData.priceChange24h != null && <span className={`sm-market-change ${step.analysisData.priceChange24h >= 0 ? 'positive' : 'negative'}`}>24h: {step.analysisData.priceChange24h >= 0 ? '+' : ''}{step.analysisData.priceChange24h.toFixed(2)}%</span>}
                                    {step.analysisData.holders && <span className="sm-market-item">Holders: <strong>{step.analysisData.holders.toLocaleString()}</strong></span>}
                                  </div>
                                )}
                                {step.analysisData.contract && (
                                  <div className="sm-market-row">
                                    <span className="sm-market-item sm-contract-inline" onClick={() => copyAddress(step.analysisData.contract)} title="Click to copy">
                                      {step.analysisData.chain}: {truncateAddr(step.analysisData.contract)}
                                    </span>
                                    {step.analysisData.dex && <span className="sm-market-item">DEX: {step.analysisData.dex}</span>}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status Column */}
                <div className="sm-status-col">
                  <span className={`sm-status-badge ${signal.status}`}>
                    {signal.status === 'holding' ? 'Holding' : signal.status === 'exited' ? 'Exited' : signal.status === 'pending' ? 'Pending' : 'Skipped'}
                  </span>
                  {signal.trade?.pnl_usdt != null && (
                    <span className={`sm-pnl ${signal.trade.pnl_usdt >= 0 ? 'positive' : 'negative'}`}>
                      {signal.trade.pnl_usdt >= 0 ? '+' : ''}${signal.trade.pnl_usdt.toFixed(2)}
                    </span>
                  )}
                  {signal.ai_score !== null && (
                    <div className="sm-score">
                      <div className="sm-score-bar"><div className={`sm-score-fill ${scoreClass}`} style={{ width: `${Math.max(3, signal.ai_score * 100)}%` }}></div></div>
                      <span className={`sm-score-text ${scoreClass}`}>{signal.ai_score.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="sm-load-more">
          <button className="sm-btn-load-more" onClick={() => loadSignals(true)} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {signals.length > 0 && (
        <div className="sm-footer">
          <p>Showing {signals.length}{stats ? ` of ${stats.total}` : ''} signals</p>
        </div>
      )}
    </div>
  );
}

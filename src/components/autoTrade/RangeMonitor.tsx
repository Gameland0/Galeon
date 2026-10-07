/**
 * Range Trading Monitor Component
 * 显示 Range Trading 监控数据
 *
 * Features:
 * 1. 总览面板 - 投资金额、当前价值、总盈亏
 * 2. 监控列表 - Token 状态、Range Score、RSI、支撑/阻力位
 * 3. 服务状态 - 扫描状态、最后更新时间
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../../contexts/PrivyWalletContext';

interface MonitoredToken {
  symbol: string;
  contractAddress: string;
  chain: string;
  source: 'ALPHA' | 'MANUAL';
  rangeScore: number;
  rangePosition: number;
  status: 'BUY_ZONE' | 'NEUTRAL' | 'WATCH' | 'PAUSED' | 'SOLD';
  currentPrice: number;
  support7d: number;
  resistance7d: number;
  rsi14: number;
  volumeRatio: number;
  positionUsdt: number;
  lastUpdated: string;
}

interface RangeOverview {
  config: {
    enabled: boolean;
    mode: 'ALPHA' | 'MEME' | 'BOTH';
    capitalUsdt: number;
    maxPositions: number;
    minRangeScore: number;
  };
  overview: {
    totalInvested: number;
    currentValue: number;
    totalPnl: number;
    totalPnlPercent: number;
  };
  monitoredTokens: MonitoredToken[];
  positions: any[];
  recentTrades: any[];
}

interface RangeServiceStatus {
  initialized: boolean;
  scanning: boolean;
  lastScanTime: string;
  config: {
    scanIntervalMs: number;
    filter: any;
    entry: any;
    scoring: any;
  };
}

interface RangeMonitorProps {
  onClose?: () => void;
}

export function RangeMonitor({ onClose }: RangeMonitorProps) {
  const { privyUserId, getAccessToken } = useWallet();

  const [overview, setOverview] = useState<RangeOverview | null>(null);
  const [tokens, setTokens] = useState<MonitoredToken[]>([]);
  const [serviceStatus, setServiceStatus] = useState<RangeServiceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Auto refresh interval
  const [autoRefresh, setAutoRefresh] = useState(true);
  const REFRESH_INTERVAL = 30000; // 30 seconds

  // Fetch data from API
  const fetchData = useCallback(async () => {
    if (!privyUserId) {
      console.log('⚠️ [RangeMonitor] privyUserId is null, skipping fetch');
      return;
    }

    try {
      const accessToken = await getAccessToken();
      console.log('🔐 [RangeMonitor] Access Token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'NULL');

      if (!accessToken) {
        console.error('❌ [RangeMonitor] getAccessToken() returned null!');
        setError('Authentication failed: No access token');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      };

      // Fetch all data in parallel
      const [overviewRes, tokensRes, statusRes] = await Promise.all([
        fetch('/api/auto-trade/range/overview', { headers }),
        fetch('/api/auto-trade/range/monitored-tokens', { headers }),
        fetch('/api/auto-trade/range/status')
      ]);

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        if (data.success) {
          setOverview(data.data);
        }
      }

      if (tokensRes.ok) {
        const data = await tokensRes.json();
        if (data.success) {
          setTokens(data.data || []);
        }
      }

      if (statusRes.ok) {
        const data = await statusRes.json();
        if (data.success) {
          setServiceStatus(data.data);
        }
      }

      setLastRefresh(new Date());
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [privyUserId, getAccessToken]);

  // Initial load and auto refresh
  useEffect(() => {
    fetchData();

    if (autoRefresh) {
      const interval = setInterval(fetchData, REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh]);

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'BUY_ZONE': return { bg: '#dcfce7', text: '#16a34a', label: 'BUY ZONE' };
      case 'WATCH': return { bg: '#fef9c3', text: '#ca8a04', label: 'WATCH' };
      case 'NEUTRAL': return { bg: '#f3f4f6', text: '#6b7280', label: 'NEUTRAL' };
      case 'PAUSED': return { bg: '#fee2e2', text: '#dc2626', label: 'PAUSED' };
      case 'SOLD': return { bg: '#e0e7ff', text: '#4f46e5', label: 'SOLD' };
      default: return { bg: '#f3f4f6', text: '#6b7280', label: status };
    }
  };

  // Get Range Score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#16a34a'; // Green
    if (score >= 65) return '#ca8a04'; // Yellow
    if (score >= 50) return '#ea580c'; // Orange
    return '#dc2626'; // Red
  };

  // Get RSI indicator
  const getRSIIndicator = (rsi: number) => {
    if (rsi <= 30) return { text: 'Oversold', color: '#16a34a' };
    if (rsi <= 40) return { text: 'Low', color: '#22c55e' };
    if (rsi >= 70) return { text: 'Overbought', color: '#dc2626' };
    if (rsi >= 60) return { text: 'High', color: '#ea580c' };
    return { text: 'Neutral', color: '#6b7280' };
  };

  // Format price
  const formatPrice = (price: number) => {
    if (price === 0) return '-';
    if (price < 0.0001) return `$${price.toExponential(2)}`;
    if (price < 1) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(4)}`;
  };

  // Format time
  const formatTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>Loading Range Monitor...</div>
        <div style={{ color: '#6b7280' }}>Fetching latest data...</div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#f9fafb',
      borderRadius: '12px',
      minHeight: '400px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
            Range Trading Monitor
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
            Last updated: {lastRefresh.toLocaleTimeString()}
            {serviceStatus?.scanning && <span style={{ color: '#16a34a', marginLeft: '8px' }}>Scanning...</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto Refresh
          </label>
          <button
            onClick={fetchData}
            style={{
              padding: '8px 16px',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fee2e2',
          color: '#dc2626',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {/* Overview Cards */}
      {overview && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Total Invested</div>
            <div style={{ fontSize: '24px', fontWeight: '600', color: '#1f2937' }}>
              ${overview.overview.totalInvested.toFixed(2)}
            </div>
          </div>
          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Current Value</div>
            <div style={{ fontSize: '24px', fontWeight: '600', color: '#1f2937' }}>
              ${overview.overview.currentValue.toFixed(2)}
            </div>
          </div>
          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Total P&L</div>
            <div style={{
              fontSize: '24px',
              fontWeight: '600',
              color: overview.overview.totalPnl >= 0 ? '#16a34a' : '#dc2626'
            }}>
              {overview.overview.totalPnl >= 0 ? '+' : ''}${overview.overview.totalPnl.toFixed(2)}
              <span style={{ fontSize: '14px', marginLeft: '4px' }}>
                ({overview.overview.totalPnlPercent >= 0 ? '+' : ''}{overview.overview.totalPnlPercent.toFixed(1)}%)
              </span>
            </div>
          </div>
          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Monitored Tokens</div>
            <div style={{ fontSize: '24px', fontWeight: '600', color: '#1f2937' }}>
              {tokens.length}
              <span style={{ fontSize: '14px', color: '#6b7280', marginLeft: '8px' }}>
                / {overview.config.maxPositions} max
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Service Status */}
      {serviceStatus && (
        <div style={{
          backgroundColor: 'white',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
            Service Status
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px' }}>
            <div>
              <span style={{ color: '#6b7280' }}>Status: </span>
              <span style={{
                color: serviceStatus.scanning ? '#16a34a' : '#ca8a04',
                fontWeight: '500'
              }}>
                {serviceStatus.scanning ? 'Running' : 'Idle'}
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Min Score: </span>
              <span style={{ fontWeight: '500' }}>{serviceStatus.config?.scoring?.minEntryScore || 65}</span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Scan Interval: </span>
              <span style={{ fontWeight: '500' }}>{(serviceStatus.config?.scanIntervalMs || 300000) / 60000} min</span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Filter: </span>
              <span style={{ fontWeight: '500' }}>
                MC ≥${(serviceStatus.config?.filter?.minMarketCap || 5000000) / 1000000}M,
                Vol ≥${(serviceStatus.config?.filter?.minVolume24h || 500000) / 1000}K
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Token List */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
            Monitored Tokens
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            Showing {tokens.length} tokens
          </div>
        </div>

        {tokens.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '16px', marginBottom: '12px' }}>No tokens being monitored</div>
            <p>Add tokens from your Range Trading strategy to start monitoring</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Token</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Range Score</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Position</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#374151' }}>RSI</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Price</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Support</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Resistance</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Vol Ratio</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token, idx) => {
                  const statusStyle = getStatusColor(token.status);
                  const rsiInfo = getRSIIndicator(token.rsi14);

                  return (
                    <tr
                      key={token.symbol + token.chain + idx}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        backgroundColor: token.status === 'BUY_ZONE' ? '#f0fdf4' : 'white'
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            backgroundColor: '#ede9fe',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '600',
                            color: '#7c3aed',
                            fontSize: '12px'
                          }}>
                            {token.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', color: '#1f2937' }}>{token.symbol}</div>
                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                              {token.chain} | {token.source}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.text,
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <div style={{
                            width: '40px',
                            height: '6px',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '3px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${token.rangeScore}%`,
                              height: '100%',
                              backgroundColor: getScoreColor(token.rangeScore),
                              borderRadius: '3px'
                            }} />
                          </div>
                          <span style={{
                            fontWeight: '600',
                            color: getScoreColor(token.rangeScore)
                          }}>
                            {token.rangeScore}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}>
                          <div style={{
                            width: '60px',
                            height: '8px',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '4px',
                            position: 'relative'
                          }}>
                            <div style={{
                              position: 'absolute',
                              left: `${Math.min(100, Math.max(0, token.rangePosition))}%`,
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: '10px',
                              height: '10px',
                              backgroundColor: token.rangePosition <= 35 ? '#16a34a' : token.rangePosition >= 75 ? '#dc2626' : '#f59e0b',
                              borderRadius: '50%',
                              border: '2px solid white',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                            }} />
                          </div>
                          <span style={{ fontSize: '11px', color: '#6b7280', minWidth: '35px' }}>
                            {token.rangePosition.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ color: rsiInfo.color, fontWeight: '500' }}>
                          {token.rsi14.toFixed(0)}
                        </span>
                        <span style={{ fontSize: '10px', color: rsiInfo.color, display: 'block' }}>
                          {rsiInfo.text}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '500' }}>
                        {formatPrice(token.currentPrice)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#16a34a' }}>
                        {formatPrice(token.support7d)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#dc2626' }}>
                        {formatPrice(token.resistance7d)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          color: token.volumeRatio >= 1.5 ? '#16a34a' : '#6b7280',
                          fontWeight: token.volumeRatio >= 1.5 ? '600' : '400'
                        }}>
                          {token.volumeRatio.toFixed(2)}x
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                        {formatTime(token.lastUpdated)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        marginTop: '16px',
        padding: '12px 16px',
        backgroundColor: 'white',
        borderRadius: '8px',
        display: 'flex',
        gap: '24px',
        fontSize: '12px',
        color: '#6b7280'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            padding: '2px 6px',
            backgroundColor: '#dcfce7',
            color: '#16a34a',
            borderRadius: '4px',
            fontWeight: '600'
          }}>BUY ZONE</span>
          <span>Score ≥ 80, Position ≤ 25%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            padding: '2px 6px',
            backgroundColor: '#fef9c3',
            color: '#ca8a04',
            borderRadius: '4px',
            fontWeight: '600'
          }}>WATCH</span>
          <span>Score ≥ 65, Position ≤ 35%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: '600', color: '#16a34a' }}>RSI ≤ 30</span>
          <span>Oversold (Buy Signal)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: '600', color: '#16a34a' }}>Vol ≥ 1.5x</span>
          <span>Volume Surge</span>
        </div>
      </div>
    </div>
  );
}

export default RangeMonitor;

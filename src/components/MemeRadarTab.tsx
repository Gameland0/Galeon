import React, { useState, useEffect, useContext } from 'react';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { memeRadarService } from '../services/memeRadarService';
import MemeRadarSignalCard from './MemeRadarSignalCard';
import {
  MemeRadarSignalPreview,
  MemeRadarStats,
  MemeRadarUsageInfo,
  MemeRadarChain,
  MemeRadarSignalLevel,
} from '../types/memeRadarSignal';

const MemeRadarTab: React.FC = () => {
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const account = getCurrentAccount();

  const [signals, setSignals] = useState<MemeRadarSignalPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<MemeRadarStats | null>(null);
  const [usage, setUsage] = useState<MemeRadarUsageInfo | null>(null);

  // Filters
  const [chainFilter, setChainFilter] = useState<MemeRadarChain | 'all'>('all');
  const [levelFilter, setLevelFilter] = useState<MemeRadarSignalLevel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'all'>('ACTIVE');
  const [searchToken, setSearchToken] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'radarScore' | 'smartMoney' | 'volume'>('radarScore');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalSignals, setTotalSignals] = useState(0);
  const signalsPerPage = 20;

  useEffect(() => {
    if (account) fetchUsage();
    fetchSignals();
    fetchStats();
  }, [account]);

  useEffect(() => {
    setCurrentPage(1);
    fetchSignals();
  }, [chainFilter, levelFilter, statusFilter, searchToken]);

  useEffect(() => {
    fetchSignals();
  }, [currentPage, sortBy]);

  // Auto-refresh every 60s
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const startAutoRefresh = () => {
      fetchSignals();
      interval = setInterval(() => fetchSignals(), 60000);
    };

    const stopAutoRefresh = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) stopAutoRefresh();
      else startAutoRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!document.hidden) startAutoRefresh();

    return () => {
      stopAutoRefresh();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [chainFilter, levelFilter, statusFilter, searchToken, currentPage, sortBy]);

  const fetchUsage = async () => {
    if (!account) return;
    try {
      const data = await memeRadarService.getUsage(account);
      setUsage(data);
    } catch (error) {
      console.error('Error fetching meme radar usage:', error);
    }
  };

  const fetchSignals = async () => {
    setLoading(true);
    try {
      const response = await memeRadarService.getSignals({
        limit: signalsPerPage,
        offset: (currentPage - 1) * signalsPerPage,
        chain: chainFilter === 'all' ? undefined : chainFilter,
        signalLevel: levelFilter === 'all' ? undefined : levelFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        tokenSymbol: searchToken || undefined,
        sortBy,
      });
      setSignals(response.signals);
      setTotalSignals(response.total);
    } catch (error) {
      console.error('Error fetching meme radar signals:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await memeRadarService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching meme radar stats:', error);
    }
  };

  const totalPages = Math.ceil(totalSignals / signalsPerPage);

  return (
    <>
      {/* Stats Cards - 3 column grid */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {/* Card 1: Total Signals */}
          <div style={{
            background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
            borderRadius: '20px',
            padding: '20px',
            boxShadow: '0 4px 16px rgba(59, 130, 246, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 0 30px rgba(59, 130, 246, 0.4), 0 8px 24px rgba(59, 130, 246, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '20px' }}>📡</span>
              <div style={{
                fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)',
                fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px'
              }}>
                Total Signals
              </div>
            </div>
            <div style={{
              fontSize: '36px', fontWeight: '700', color: 'white',
              marginBottom: '8px', letterSpacing: '-1px'
            }}>
              {stats.totalSignals.toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)', fontWeight: '500' }}>
              Today: {stats.signalsToday} | Week: {stats.signalsThisWeek}
            </div>
          </div>

          {/* Card 2: Win Rate */}
          {stats.totalBacktested > 0 ? (
            <div style={{
              background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 4px 16px rgba(124, 58, 237, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(124, 58, 237, 0.4), 0 8px 24px rgba(124, 58, 237, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(124, 58, 237, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '20px' }}>🎯</span>
                <div style={{
                  fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)',
                  fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px'
                }}>
                  Win Rate
                </div>
              </div>
              <div style={{
                fontSize: '36px', fontWeight: '700', color: 'white',
                marginBottom: '8px', letterSpacing: '-1px'
              }}>
                {stats.winRate.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)', fontWeight: '500' }}>
                Win: {stats.winCount} | Loss: {stats.lossCount}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.65)', marginTop: '4px' }}>
                {stats.totalBacktested} backtested
              </div>
            </div>
          ) : (
            <div style={{
              background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
              borderRadius: '20px', padding: '20px',
              boxShadow: '0 4px 16px rgba(124, 58, 237, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'
            }}>
              <span style={{ fontSize: '32px', marginBottom: '8px' }}>⏳</span>
              <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: '600' }}>
                Win rate available after<br/>backtesting completes
              </div>
            </div>
          )}

          {/* Card 3: Strong Buy Signals */}
          <div style={{
            background: 'linear-gradient(135deg, #1E293B 0%, #475569 100%)',
            borderRadius: '20px',
            padding: '20px',
            boxShadow: '0 4px 16px rgba(30, 41, 59, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 0 30px rgba(71, 85, 105, 0.5), 0 8px 24px rgba(30, 41, 59, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(30, 41, 59, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '20px' }}>🚀</span>
              <div style={{
                fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)',
                fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px'
              }}>
                Strong Buy
              </div>
            </div>
            <div style={{
              fontSize: '36px', fontWeight: '700', color: 'white',
              marginBottom: '8px', letterSpacing: '-1px'
            }}>
              {stats.strongBuyCount}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)', fontWeight: '500' }}>
              Watch: {stats.watchCount} | Veto: {stats.vetoCount}
            </div>
          </div>
        </div>
      )}

      {/* Main Content - page-content grid layout */}
      <div className="page-content">
        {/* Left Column - Info */}
        <div className="left-column">
          {/* Meme Radar Info Card */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            borderRadius: '20px',
            padding: '24px',
            boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '14px',
                background: 'linear-gradient(135deg, #5A6AE6 0%, #3A4FE0 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '24px'
              }}>
                📡
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1E293B' }}>
                  Meme Radar
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                  AI-Powered Meme Token Scanner
                </p>
              </div>
            </div>
            <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#475569', margin: 0 }}>
              Real-time monitoring of on-chain meme token activity across multiple chains.
              10-dimension scoring system powered by on-chain data, Smart Money tracking,
              and whale/KOL activity analysis.
            </p>
            <div style={{
              marginTop: '16px', padding: '12px', background: '#F1F5F9',
              borderRadius: '12px', fontSize: '12px', color: '#64748B'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '8px', color: '#334155' }}>Scoring Dimensions:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {['Signal Resonance', 'Smart Money', 'Whale/KOL', 'SM Quality',
                  'Volume Momentum', 'Price Trend', 'Dev Safety', 'Liquidity',
                  'Social', 'Top Trader'].map(dim => (
                  <span key={dim}>• {dim}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Risk Warning */}
          <div className="warning-card" style={{ marginTop: '24px' }}>
            <h4 className="warning-title">⚠️ Risk Warning</h4>
            <p className="warning-text">
              Meme tokens are extremely volatile and high-risk. Radar signals are for
              informational purposes only. Always DYOR and never invest more than you
              can afford to lose.
            </p>
          </div>
        </div>

        {/* Right Column - Signals */}
        <div className="right-column">
          {/* Filter Panel */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            padding: '24px',
            marginBottom: '32px',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)'
          }}>
            {/* Row 1: Search + Reset */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 auto', minWidth: '200px', maxWidth: '100%' }}>
                <input
                  type="text"
                  placeholder="🔍 Search token..."
                  value={searchToken}
                  onChange={(e) => setSearchToken(e.target.value.toUpperCase())}
                  style={{
                    width: '100%', height: '44px', padding: '0 16px', fontSize: '14px',
                    border: '1px solid #CBD5E1', borderRadius: '12px', outline: 'none',
                    background: 'white', color: '#1E293B', fontWeight: '500',
                    transition: 'all 0.2s ease', boxSizing: 'border-box'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#5A6AE6';
                    e.target.style.boxShadow = '0 0 0 3px rgba(90, 106, 230, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#CBD5E1';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
              <button
                onClick={() => {
                  setSearchToken('');
                  setChainFilter('all');
                  setLevelFilter('all');
                  setStatusFilter('ACTIVE');
                  setSortBy('radarScore');
                }}
                style={{
                  height: '44px', padding: '0 20px', fontSize: '14px', fontWeight: '600',
                  border: '1px solid #CBD5E1', borderRadius: '12px', background: 'white',
                  color: '#64748B', cursor: 'pointer', transition: 'all 0.2s ease',
                  display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}
              >
                Reset 🔄
              </button>
            </div>

            {/* Row 2: Chain Filter */}
            <div style={{
              display: 'inline-flex', gap: '6px', padding: '4px',
              background: '#F1F5F9', borderRadius: '9999px', marginBottom: '16px'
            }}>
              {(['all', 'SOL', 'BSC', 'ETH', 'BASE'] as const).map((chain) => (
                <button
                  key={chain}
                  onClick={() => setChainFilter(chain as MemeRadarChain | 'all')}
                  style={{
                    height: '36px', padding: '0 16px', fontSize: '13px', fontWeight: '600',
                    border: 'none', borderRadius: '9999px',
                    background: chainFilter === chain ? '#6366F1' : 'transparent',
                    color: chainFilter === chain ? 'white' : '#64748B',
                    cursor: 'pointer', transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (chainFilter !== chain) {
                      e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                      e.currentTarget.style.color = '#6366F1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (chainFilter !== chain) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#64748B';
                    }
                  }}
                >
                  {chain === 'all' ? 'All Chains' : chain}
                </button>
              ))}
            </div>

            {/* Row 3: Level + Status + Sort */}
            <div style={{
              display: 'flex', justifyContent: 'flex-start', gap: '24px',
              alignItems: 'center', flexWrap: 'wrap'
            }}>
              {/* Signal Level */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', letterSpacing: '0.5px' }}>
                  Level:
                </span>
                {(['all', 'STRONG_BUY', 'BUY', 'WATCH', 'VETO'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setLevelFilter(level as MemeRadarSignalLevel | 'all')}
                    style={{
                      height: '36px', padding: '0 16px', fontSize: '13px', fontWeight: '600',
                      border: levelFilter === level ? 'none' : '1px solid #CBD5E1',
                      borderRadius: '9999px',
                      background: levelFilter === level ? '#6366F1' : 'white',
                      color: levelFilter === level ? 'white' : '#64748B',
                      cursor: 'pointer', transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (levelFilter !== level) {
                        e.currentTarget.style.background = '#F1F5F9';
                        e.currentTarget.style.color = '#6366F1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (levelFilter !== level) {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.color = '#64748B';
                      }
                    }}
                  >
                    {level === 'all' ? 'All' : level === 'STRONG_BUY' ? 'Strong Buy' : level === 'BUY' ? 'Buy' : level}
                  </button>
                ))}
              </div>

              {/* Status */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', letterSpacing: '0.5px' }}>
                  Status:
                </span>
                {(['ACTIVE', 'all'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status as 'ACTIVE' | 'all')}
                    style={{
                      height: '36px', padding: '0 16px', fontSize: '13px', fontWeight: '600',
                      border: statusFilter === status ? 'none' : '1px solid #CBD5E1',
                      borderRadius: '9999px',
                      background: statusFilter === status ? '#6366F1' : 'white',
                      color: statusFilter === status ? 'white' : '#64748B',
                      cursor: 'pointer', transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (statusFilter !== status) {
                        e.currentTarget.style.background = '#F1F5F9';
                        e.currentTarget.style.color = '#6366F1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (statusFilter !== status) {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.color = '#64748B';
                      }
                    }}
                  >
                    {status === 'ACTIVE' ? 'Active' : 'All'}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', letterSpacing: '0.5px' }}>
                  Sort:
                </span>
                {(['radarScore', 'time', 'smartMoney', 'volume'] as const).map((sort) => (
                  <button
                    key={sort}
                    onClick={() => setSortBy(sort)}
                    style={{
                      height: '36px', padding: '0 16px', fontSize: '13px', fontWeight: '600',
                      border: sortBy === sort ? 'none' : '1px solid #CBD5E1',
                      borderRadius: '9999px',
                      background: sortBy === sort ? '#6366F1' : 'white',
                      color: sortBy === sort ? 'white' : '#64748B',
                      cursor: 'pointer', transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (sortBy !== sort) {
                        e.currentTarget.style.background = '#F1F5F9';
                        e.currentTarget.style.color = '#6366F1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (sortBy !== sort) {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.color = '#64748B';
                      }
                    }}
                  >
                    {sort === 'radarScore' ? 'Radar Score' :
                     sort === 'time' ? 'Latest ▼' :
                     sort === 'smartMoney' ? 'Smart Money' : 'Volume'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Signal List */}
          <div className="signals-section">
            {loading && signals.length === 0 ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading meme radar signals...</p>
              </div>
            ) : signals.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📡</div>
                <h3>No Signals Yet</h3>
                <p>
                  {statusFilter === 'ACTIVE'
                    ? 'No active meme radar signals at the moment. Scanning in progress...'
                    : 'No signals match your filters.'}
                </p>
              </div>
            ) : (
              <>
                <div className="signals-list">
                  {signals.map((signal) => (
                    <MemeRadarSignalCard
                      key={signal.signalId}
                      signal={signal}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalSignals > signalsPerPage && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '16px', marginTop: '32px', padding: '24px',
                    background: 'linear-gradient(to bottom, rgba(249, 250, 251, 0.5) 0%, transparent 100%)',
                    borderTop: '1px solid #e5e7eb'
                  }}>
                    {/* Page Info */}
                    <div style={{
                      fontSize: '14px', color: '#6b7280', fontWeight: '500',
                      display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                      <span style={{ color: '#111827', fontWeight: '700', fontSize: '16px' }}>
                        Page {currentPage}
                      </span>
                      <span>of</span>
                      <span style={{ color: '#111827', fontWeight: '700', fontSize: '16px' }}>
                        {totalPages}
                      </span>
                      <span style={{
                        marginLeft: '12px', padding: '4px 10px',
                        background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6',
                        borderRadius: '12px', fontSize: '12px', fontWeight: '600'
                      }}>
                        {totalSignals} signals
                      </span>
                    </div>

                    {/* Pagination Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* First */}
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        style={{
                          padding: '10px 16px', fontSize: '14px', fontWeight: '600',
                          border: 'none', borderRadius: '8px',
                          background: currentPage === 1 ? 'rgba(0,0,0,0.05)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                          color: currentPage === 1 ? '#9ca3af' : 'white',
                          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                          opacity: currentPage === 1 ? 0.5 : 1
                        }}
                      >
                        ⏮ First
                      </button>

                      {/* Prev */}
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        style={{
                          padding: '10px 20px', fontSize: '14px', fontWeight: '600',
                          border: 'none', borderRadius: '8px',
                          background: currentPage === 1 ? 'rgba(0,0,0,0.05)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                          color: currentPage === 1 ? '#9ca3af' : 'white',
                          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                          opacity: currentPage === 1 ? 0.5 : 1
                        }}
                      >
                        ← Prev
                      </button>

                      {/* Page Numbers */}
                      {(() => {
                        const pageNumbers = [];
                        const maxVisible = 5;
                        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
                        if (endPage - startPage + 1 < maxVisible) {
                          startPage = Math.max(1, endPage - maxVisible + 1);
                        }
                        for (let i = startPage; i <= endPage; i++) {
                          pageNumbers.push(
                            <button
                              key={i}
                              onClick={() => setCurrentPage(i)}
                              style={{
                                width: '40px', height: '40px', fontSize: '14px', fontWeight: '700',
                                border: i === currentPage ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                                borderRadius: '8px',
                                background: i === currentPage ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'white',
                                color: i === currentPage ? 'white' : '#374151',
                                cursor: 'pointer'
                              }}
                            >
                              {i}
                            </button>
                          );
                        }
                        return pageNumbers;
                      })()}

                      {/* Next */}
                      <button
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        disabled={currentPage >= totalPages}
                        style={{
                          padding: '10px 20px', fontSize: '14px', fontWeight: '600',
                          border: 'none', borderRadius: '8px',
                          background: currentPage >= totalPages ? 'rgba(0,0,0,0.05)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                          color: currentPage >= totalPages ? '#9ca3af' : 'white',
                          cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                          opacity: currentPage >= totalPages ? 0.5 : 1
                        }}
                      >
                        Next →
                      </button>

                      {/* Last */}
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage >= totalPages}
                        style={{
                          padding: '10px 16px', fontSize: '14px', fontWeight: '600',
                          border: 'none', borderRadius: '8px',
                          background: currentPage >= totalPages ? 'rgba(0,0,0,0.05)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                          color: currentPage >= totalPages ? '#9ca3af' : 'white',
                          cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                          opacity: currentPage >= totalPages ? 0.5 : 1
                        }}
                      >
                        Last ⏭
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default MemeRadarTab;

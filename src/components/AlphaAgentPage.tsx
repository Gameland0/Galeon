import React, { useState, useEffect, useContext } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { alphaAgentService } from '../services/alphaAgentService';
import AlphaSignalCard from './AlphaSignalCard';
import AlphaAgentCard from './AlphaAgentCard';
import TokenNewsFeed from './TokenNewsFeed';
import AutoTradeTab from './autoTrade/AutoTradeTab';
import SmartMoneyHotSignals from './SmartMoneyHotSignals';
import MemeRadarTab from './MemeRadarTab';
import { WalletProvider as PrivyWalletProvider } from '../contexts/PrivyWalletContext'; // 🔧 添加 Privy Provider
import '../styles/AlphaAgentPage.css';

interface AlphaSignalPreview {
  signalId: string;
  tokenSymbol: string;
  signalType: 'LONG' | 'SHORT' | 'NEUTRAL' | 'BUY' | 'SELL';
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  currentPrice: number;
  priceChangePercent?: number;
  status: 'ACTIVE' | 'HIT_TP' | 'HIT_SL' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
  tokenWinRate?: number;
  smartMoneyData?: {
    smartMoneyDirection?: string | null;
    smartMoneyHolders?: number | null;
  } | null;
  eventData?: {
    oiChange24h?: number | null;
    fundingRate?: number | null;
    trend?: string | null;
    pattern?: string | null;
  };
}

interface UsageInfo {
  remainingFreeViews: number;
  isFreeUser: boolean;
}

interface StatsInfo {
  totalSignals: number;
  signalsToday: number;
  signalsThisWeek: number;
  totalAudited: number;
  totalTriggered: number;  // TP+SL总数（用于Win Rate计算）
  hitTP: number;
  hitSL: number;
  winRate: number;
  avgAccuracy: string;
  signalDistribution: {
    [key: string]: {
      count: number;
      avgConfidence: string;
    };
  };
  currentModelVersion: string;
  lastUpdated: string;
}

const AlphaAgentPage: React.FC = () => {
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const account = getCurrentAccount();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = 'auto-trade';
  const [activeTab, setActiveTab] = useState<'signals' | 'meme-radar' | 'auto-trade'>(initialTab);

  const [signals, setSignals] = useState<AlphaSignalPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter] = useState<'all' | 'LONG' | 'SHORT' | 'BUY' | 'SELL'>('all');
  const [statusFilter] = useState<'ACTIVE' | 'all'>('ACTIVE');
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [stats, setStats] = useState<StatsInfo | null>(null);
  const [searchToken, setSearchToken] = useState('');
  const [sortBy] = useState<'time' | 'confidence' | 'winRate'>('confidence');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalSignals, setTotalSignals] = useState(0);
  const signalsPerPage = 20;
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [btcChange, setBtcChange] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    signalId: string;
    cost: number;
    onConfirm: (detail: any) => void;
  } | null>(null);

  // Sync activeTab when URL query param changes
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'meme-radar' || tab === 'auto-trade') {
      setActiveTab(tab);
    } else if (tab === 'signals') {
      setActiveTab('signals');
    }
  }, [searchParams]);

  useEffect(() => {
    if (account) {
      fetchUsage();
    }
    fetchSignals();
    fetchStats();
  }, [account]);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
    fetchSignals();
  }, [filter, statusFilter, searchToken]);

  useEffect(() => {
    fetchSignals();
  }, [currentPage, sortBy]);

  const fetchBtcPrice = async () => {
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
      const data = await res.json();
      setBtcPrice(parseFloat(data.lastPrice));
      setBtcChange(parseFloat(data.priceChangePercent));
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchBtcPrice();
    const t = setInterval(fetchBtcPrice, 60000);
    return () => clearInterval(t);
  }, []);

  // 智能自动刷新：每60秒自动更新价格，页面隐藏时停止
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const startAutoRefresh = () => {
      // 立即刷新一次
      fetchSignals();
      fetchStats();
      // 启动定时器
      interval = setInterval(() => {
        fetchSignals();
        fetchStats();
      }, 60000); // 60秒
    };

    const stopAutoRefresh = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    // 页面可见性变化监听
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // console.log('⏸️ Page hidden, stopping auto-refresh');
        stopAutoRefresh();
      } else {
        // console.log('▶️ Page visible, starting auto-refresh');
        startAutoRefresh();
      }
    };

    // 添加监听器
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 初始启动（如果页面可见）
    if (!document.hidden) {
      startAutoRefresh();
    }

    // 清理函数
    return () => {
      stopAutoRefresh();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [filter, statusFilter, searchToken, currentPage, sortBy]); // 当筛选条件变化时重启定时器


  const fetchUsage = async () => {
    if (!account) {
      console.log('⚠️ No account, skipping usage fetch');
      return;
    }
    try {
      const data = await alphaAgentService.getUsage(account);
      setUsage(data);
    } catch (error) {
      console.error('Error fetching usage:', error);
    }
  };

  const fetchSignals = async () => {
    setLoading(true);
    // console.log('🔍 Fetching signals with filters:', {
    //   filter,
    //   statusFilter,
    //   searchToken,
    //   sortBy,
    //   currentPage
    // });
    try {
      const apiParams = {
        limit: signalsPerPage,
        offset: (currentPage - 1) * signalsPerPage,
        signalType: filter === 'all' ? undefined : filter as any,
        status: statusFilter === 'all' ? undefined : statusFilter,
        tokenSymbol: searchToken || undefined,
        sortBy: sortBy, // 传递排序参数给后端
      };
      // console.log('📤 API Request params:', apiParams);

      const response = await alphaAgentService.getSignals(apiParams);

      // console.log('✅ Received signals:', response.signals.length, 'Total:', response.total);
      // console.log('📊 Signal types:', response.signals.map(s => s.signalType).slice(0, 5));

      // 过滤 NEUTRAL 信号，只展示有方向性的信号
      const filtered = response.signals.filter((s: any) => s.signalType !== 'NEUTRAL');
      setSignals(filtered);
      setTotalSignals(response.total);

      // console.log('✅ State updated - signals count:', response.signals.length);
    } catch (error) {
      console.error('Error fetching signals:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await alphaAgentService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleViewDetail = async (signalId: string): Promise<any> => {
    if (!account) {
      alert('Please connect your wallet first');
      return null;
    }
    return await viewSignalDetail(signalId);
  };

  const viewSignalDetail = async (signalId: string) => {
    try {
      const result = await alphaAgentService.viewSignalDetail(account, signalId);
      return result.signal;
    } catch (error: any) {
      // if (error.response?.status === 402) {
      //   const data = error.response.data;
      //   alert(`Insufficient credits!\n\nRequired: ${data.required} credits\nCurrent: ${data.current} credits\n\nPlease purchase more credits to continue.`);
      // } else {
        alert('Failed to load signal detail: ' + (error.message || 'Unknown error'));
      // }
      return null;
    }
  };

  // const handleConfirmView = async () => { ... };
  // const handleCancelView = () => { ... };

  return (
    // 🔧 在最外层包裹 PrivyWalletProvider，避免 AutoTradeTab 内部重复创建
    <PrivyWalletProvider>
      <div className="alpha-agent-page">
        <div className="page-container">
        {/* Main Tab Navigation - 一级Tab */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '48px',
          marginBottom: '32px',
          borderBottom: '2px solid rgba(229, 231, 235, 0.3)',
          padding: '0',
        }}>
          <button
            onClick={() => setActiveTab('auto-trade')}
            style={{
              padding: '12px 0',
              fontSize: '20px',
              fontWeight: '600',
              border: 'none',
              background: 'none',
              color: '#1877F2',
              borderBottom: '2px solid #1877F2',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              marginBottom: '-2px',
            }}
          >
            Auto Trade
          </button>
        </div>

        {/* Signals Tab Content */}
        {activeTab === 'signals' && (
          <>
        {/* ===== Intelligence Header ===== */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: '20px 28px',
          marginBottom: '12px',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'Inter, system-ui, sans-serif',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          {/* Left: Brand + live */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.7)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                Alpha Signals
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500', marginTop: '2px' }}>
                {totalSignals > 0 ? totalSignals : (stats?.totalSignals ?? '—')} signals · live
              </div>
            </div>
          </div>

          {/* Center: BTC market block — always visible */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '20px',
            padding: '12px 24px',
            background: 'rgba(248,250,252,0.8)',
            borderRadius: '16px',
            border: '1px solid rgba(226,232,240,0.8)',
            flex: 1,
            maxWidth: '480px',
          }}>
            {/* BTC Price */}
            <div style={{ minWidth: '120px' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Bitcoin</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.5px', lineHeight: 1 }}>
                {btcPrice ? `$${btcPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : <span style={{ color: '#cbd5e1' }}>Loading...</span>}
              </div>
            </div>

            <div style={{ width: '1px', height: '36px', background: 'rgba(226,232,240,0.8)', flexShrink: 0 }} />

            {/* 24h Change */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>24h Change</div>
              <div style={{
                fontSize: '18px', fontWeight: '700', lineHeight: 1,
                color: btcChange == null ? '#94a3b8' : btcChange >= 0 ? '#16a34a' : '#dc2626',
              }}>
                {btcChange != null ? `${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(2)}%` : '--'}
              </div>
            </div>

            <div style={{ width: '1px', height: '36px', background: 'rgba(226,232,240,0.8)', flexShrink: 0 }} />

            {/* Market Trend */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>Market</div>
              {btcChange != null ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '8px',
                  color: btcChange >= 2 ? '#16a34a' : btcChange <= -2 ? '#dc2626' : '#64748b',
                  background: btcChange >= 2 ? 'rgba(22,163,74,0.12)' : btcChange <= -2 ? 'rgba(220,38,38,0.12)' : 'rgba(100,116,139,0.1)',
                  letterSpacing: '0.5px',
                }}>
                  {btcChange >= 2 ? '▲' : btcChange <= -2 ? '▼' : '→'}
                  {btcChange >= 2 ? ' BULL' : btcChange <= -2 ? ' BEAR' : ' NEUTRAL'}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: '600' }}>--</div>
              )}
            </div>
          </div>

          {/* Right: Search */}
          <input
            type="text"
            placeholder="Search token..."
            value={searchToken}
            onChange={(e) => setSearchToken(e.target.value.toUpperCase())}
            style={{
              height: '38px',
              padding: '0 16px',
              fontSize: '13px',
              border: '1px solid rgba(203,213,225,0.8)',
              borderRadius: '12px',
              outline: 'none',
              background: 'rgba(248,250,252,0.9)',
              color: '#0f172a',
              fontWeight: '500',
              width: '160px',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          />
        </div>

        {/* ===== Signal List ===== */}
        <div style={{ width: '100%' }}>
          <div style={{
            background: 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            border: '1px solid rgba(226,232,240,0.9)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {/* Table header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 20px 10px 39px',
              borderBottom: '1px solid rgba(226,232,240,0.8)',
              background: 'rgba(248,250,252,0.6)',
            }}>
              <div style={{ width: '108px', flexShrink: 0, fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Token</div>
              <div style={{ width: '64px', flexShrink: 0, fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Dir</div>
              <div style={{ flex: 1, fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Market Signal</div>
              <div style={{ width: '44px', flexShrink: 0, fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', textAlign: 'right' }}>Conf</div>
              <div style={{ width: '44px', flexShrink: 0, fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', textAlign: 'right' }}>WR</div>
              <div style={{ width: '56px', flexShrink: 0, fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', textAlign: 'right' }}>Age</div>
            </div>

            {loading && signals.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                加载中...
              </div>
            ) : signals.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>暂无信号</div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>稍后再来查看</div>
              </div>
            ) : (
              <>
                <div>
                  {signals.map((signal) => (
                    <AlphaSignalCard
                      key={signal.signalId}
                      signal={signal}
                      onViewDetail={handleViewDetail}
                    />
                  ))}
                </div>

                  {/* Pagination */}
                  {totalSignals > signalsPerPage && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '16px',
                      marginTop: '32px',
                      padding: '24px',
                      background: 'linear-gradient(to bottom, rgba(249, 250, 251, 0.5) 0%, transparent 100%)',
                      borderTop: '1px solid #e5e7eb'
                    }}>
                      {/* Page Info */}
                      <div style={{
                        fontSize: '14px',
                        color: '#6b7280',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <span style={{ color: '#111827', fontWeight: '700', fontSize: '16px' }}>
                          Page {currentPage}
                        </span>
                        <span>of</span>
                        <span style={{ color: '#111827', fontWeight: '700', fontSize: '16px' }}>
                          {Math.ceil(totalSignals / signalsPerPage)}
                        </span>
                        <span style={{
                          marginLeft: '12px',
                          padding: '4px 10px',
                          background: 'rgba(59, 130, 246, 0.1)',
                          color: '#3b82f6',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {totalSignals} signals
                        </span>
                      </div>

                      {/* Pagination Controls */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
                        {/* First Page Button */}
                        <button
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                          style={{
                            padding: '10px 16px',
                            fontSize: '14px',
                            fontWeight: '600',
                            border: 'none',
                            borderRadius: '8px',
                            background: currentPage === 1
                              ? 'rgba(0, 0, 0, 0.05)'
                              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: currentPage === 1 ? '#9ca3af' : 'white',
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: currentPage === 1 ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)',
                            opacity: currentPage === 1 ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (currentPage !== 1) {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = currentPage === 1 ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)';
                          }}
                        >
                          First
                        </button>

                        {/* Previous Button */}
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          style={{
                            padding: '10px 20px',
                            fontSize: '14px',
                            fontWeight: '600',
                            border: 'none',
                            borderRadius: '8px',
                            background: currentPage === 1
                              ? 'rgba(0, 0, 0, 0.05)'
                              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: currentPage === 1 ? '#9ca3af' : 'white',
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: currentPage === 1 ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)',
                            opacity: currentPage === 1 ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (currentPage !== 1) {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = currentPage === 1 ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)';
                          }}
                        >
                          Previous
                        </button>

                        {/* Page Numbers */}
                        {(() => {
                          const totalPages = Math.ceil(totalSignals / signalsPerPage);
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
                                  width: '40px',
                                  height: '40px',
                                  fontSize: '14px',
                                  fontWeight: '700',
                                  border: i === currentPage ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                                  borderRadius: '8px',
                                  background: i === currentPage
                                    ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                                    : 'white',
                                  color: i === currentPage ? 'white' : '#374151',
                                  cursor: 'pointer',
                                  transition: 'all 0.3s ease',
                                  boxShadow: i === currentPage ? '0 2px 8px rgba(59, 130, 246, 0.3)' : 'none'
                                }}
                                onMouseEnter={(e) => {
                                  if (i !== currentPage) {
                                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                                    e.currentTarget.style.borderColor = '#3b82f6';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (i !== currentPage) {
                                    e.currentTarget.style.background = 'white';
                                    e.currentTarget.style.borderColor = '#e5e7eb';
                                  }
                                }}
                              >
                                {i}
                              </button>
                            );
                          }
                          return pageNumbers;
                        })()}

                        {/* Next Button */}
                        <button
                          onClick={() => setCurrentPage(prev => prev + 1)}
                          disabled={currentPage >= Math.ceil(totalSignals / signalsPerPage)}
                          style={{
                            padding: '10px 20px',
                            fontSize: '14px',
                            fontWeight: '600',
                            border: 'none',
                            borderRadius: '8px',
                            background: currentPage >= Math.ceil(totalSignals / signalsPerPage)
                              ? 'rgba(0, 0, 0, 0.05)'
                              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: currentPage >= Math.ceil(totalSignals / signalsPerPage) ? '#9ca3af' : 'white',
                            cursor: currentPage >= Math.ceil(totalSignals / signalsPerPage) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: currentPage >= Math.ceil(totalSignals / signalsPerPage) ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)',
                            opacity: currentPage >= Math.ceil(totalSignals / signalsPerPage) ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (currentPage < Math.ceil(totalSignals / signalsPerPage)) {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = currentPage >= Math.ceil(totalSignals / signalsPerPage) ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)';
                          }}
                        >
                          Next
                        </button>

                        {/* Last Page Button */}
                        <button
                          onClick={() => setCurrentPage(Math.ceil(totalSignals / signalsPerPage))}
                          disabled={currentPage >= Math.ceil(totalSignals / signalsPerPage)}
                          style={{
                            padding: '10px 16px',
                            fontSize: '14px',
                            fontWeight: '600',
                            border: 'none',
                            borderRadius: '8px',
                            background: currentPage >= Math.ceil(totalSignals / signalsPerPage)
                              ? 'rgba(0, 0, 0, 0.05)'
                              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: currentPage >= Math.ceil(totalSignals / signalsPerPage) ? '#9ca3af' : 'white',
                            cursor: currentPage >= Math.ceil(totalSignals / signalsPerPage) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: currentPage >= Math.ceil(totalSignals / signalsPerPage) ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)',
                            opacity: currentPage >= Math.ceil(totalSignals / signalsPerPage) ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (currentPage < Math.ceil(totalSignals / signalsPerPage)) {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = currentPage >= Math.ceil(totalSignals / signalsPerPage) ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)';
                          }}
                        >
                          Last
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
        </div>
        </>
        )}

        {/* Meme Radar Tab Content */}
        {activeTab === 'meme-radar' && (
          <MemeRadarTab />
        )}

        {/* Auto Trade Tab Content */}
        {activeTab === 'auto-trade' && (
          <AutoTradeTab />
        )}
      </div>

      {/* Confirmation Modal - removed (signals are now free) */}
      </div>
    </PrivyWalletProvider>
  );
};

export default AlphaAgentPage;

import React, { useState, useEffect, useCallback } from 'react';
import { FireOutlined, CheckCircleOutlined, UserOutlined, TrophyOutlined, GiftOutlined, ShareAltOutlined } from '@ant-design/icons';

import EventCard from '../components/prediction/EventCard';
import SettlementCard from '../components/prediction/SettlementCard';
import BetForm from '../components/prediction/BetForm';
import MyPredictions from '../components/prediction/MyPredictions';
import Leaderboard from '../components/prediction/Leaderboard';
import SeasonPage from '../components/prediction/SeasonPage';
import ReferralPage from '../components/prediction/ReferralPage';

import * as predictionApi from '../services/predictionMarketService';
import type { PredictionEvent, PlaceBetRequest } from '../types/prediction';
import { usePredictionBet } from '../hooks/usePredictionBet';
import { usePredictionWS } from '../hooks/usePredictionWS';
import './PredictionMarketPage.css';

const POLL_INTERVAL = 15_000;

type TabKey = 'open' | 'settled' | 'my' | 'leaderboard' | 'season' | 'referral';

const PredictionMarketPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const [openEvents, setOpenEvents] = useState<PredictionEvent[]>([]);
  const [recentSettled, setRecentSettled] = useState<PredictionEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [platformStats, setPlatformStats] = useState<{ total_users: number; total_volume: number }>({ total_users: 0, total_volume: 0 });
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [settledPage, setSettledPage] = useState(1);
  const SETTLED_PER_PAGE = 10;
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // 获取钱包地址（用于 WebSocket 认证）
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    eth.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      if (accounts[0]) setWalletAddress(accounts[0]);
    }).catch(() => {});
    const onAccountsChanged = (accounts: string[]) => setWalletAddress(accounts[0] || null);
    eth.on('accountsChanged', onAccountsChanged);
    return () => eth.removeListener?.('accountsChanged', onAccountsChanged);
  }, []);

  // WebSocket 实时积分更新
  usePredictionWS(walletAddress, {
    onPointsUpdate: (balance) => setPointsBalance(balance),
  });

  const { step, placeBetOnChain, reset: resetBetStep } = usePredictionBet();

  const showToast = (text: string, type: 'success' | 'error') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const loadOpenEvents = useCallback(async () => {
    try {
      const events = await predictionApi.getOpenEvents();
      setOpenEvents(events);
    } catch (err) {
      console.error('Failed to load open events:', err);
    }
  }, []);

  const loadRecentSettled = useCallback(async () => {
    try {
      const events = await predictionApi.getRecentSettled(100);
      setRecentSettled(events);
    } catch (err) {
      console.error('Failed to load recent settled:', err);
    }
  }, []);

  useEffect(() => {
    loadOpenEvents();
    loadRecentSettled();
    predictionApi.getPlatformStats().then(setPlatformStats).catch(() => {});
    // 加载积分余额
    const loadPoints = async () => {
      try {
        const data = await predictionApi.getPointsBalance();
        if (data?.balance != null) setPointsBalance(data.balance);
      } catch {}
    };
    loadPoints();
    const timer = setInterval(() => {
      if (activeTab === 'open') loadOpenEvents();
      if (activeTab === 'settled') loadRecentSettled();
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [activeTab, loadOpenEvents, loadRecentSettled]);

  const handlePlaceBet = async (data: PlaceBetRequest) => {
    setLoading(true);
    try {
      if (data.betType === 'POINTS') {
        // 积分下注：钱包签名 + API调用
        const eth = (window as any).ethereum;
        if (!eth) throw new Error('NO_WALLET');
        const accounts = await eth.request({ method: 'eth_requestAccounts' });
        const address = accounts[0];
        const timestamp = Date.now();
        const message = `Galeon Prediction Bet\nEvent: ${data.eventId}\nAmount: ${data.betAmount} PTS\nPrediction: ${data.predictedPnlPct}%\nTimestamp: ${timestamp}`;
        const signature = await eth.request({
          method: 'personal_sign',
          params: [message, address],
        });
        await predictionApi.placeBet({ ...data, signature, signTimestamp: timestamp } as any);
        showToast('Points bet placed!', 'success');
        // 刷新积分余额
        try { const d = await predictionApi.getPointsBalance(); setPointsBalance(d.balance); } catch {}
        setTimeout(() => { setSelectedEvent(null); resetBetStep(); loadOpenEvents(); }, 2000);
      } else {
        // USDC下注：链上操作
        const event = openEvents.find(e => e.event_id === data.eventId);
        const contractEventId = (event as any)?.contract_event_id;
        if (!contractEventId) throw new Error('CONTRACT_EVENT_NOT_FOUND');

        const txHash = await placeBetOnChain({
          contractEventId,
          predictedPnlPct: data.predictedPnlPct,
          betAmountUSDC: data.betAmount,
        });
        await predictionApi.placeBet({ ...data, txHash });
        showToast('Bet placed! Written on-chain.', 'success');
        setTimeout(() => { setSelectedEvent(null); resetBetStep(); loadOpenEvents(); }, 2000);
      }
    } catch (err: any) {
      const errorMap: Record<string, string> = {
        NO_WALLET: 'Please install MetaMask or another wallet first.',
        CONTRACT_EVENT_NOT_FOUND: 'This prediction event is not yet on-chain. Please try again shortly.',
        EVENT_NOT_AVAILABLE: 'This event is closed or not visible.',
        INVALID_BET_AMOUNT: 'Bet amount must be between $1 and $500.',
        INVALID_PREDICTION: 'Prediction must be between -20% and +200%.',
        ALREADY_BET: 'You have already placed a bet on this event.',
        INSUFFICIENT_POINTS: 'Not enough points. Your balance is too low.',
        NOT_OPEN: 'This position is closed. Prediction period has ended.',
        POSITION_CLOSED: 'This position has already closed. Betting is locked.',
        TX_FAILED: 'On-chain transaction failed. Please try again.',
        WRONG_CHAIN: 'Please switch to Base network in your wallet.',
      };
      const errKey = err.reason || err.message || '';
      if (errKey.startsWith('INSUFFICIENT_USDC:')) {
        showToast(`Insufficient USDC. Balance: $${errKey.split(':')[1]}`, 'error');
      } else if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        showToast('Transaction cancelled.', 'error');
      } else {
        showToast(errorMap[errKey] || errorMap[err.message] || `Bet failed: ${errKey}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEvent = (eventId: string) => {
    if (loading) return; // 投注进行中不允许切换
    resetBetStep();
    setSelectedEvent(eventId);
  };

  const totalPool = openEvents.reduce((s, e) => s + Number(e.total_pool || 0), 0);
  const totalPlayers = openEvents.reduce((s, e) => s + (e.participant_count || 0), 0);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'open',        label: 'Live',        icon: <FireOutlined />,        count: openEvents.length || undefined },
    { key: 'settled',     label: 'Settled',     icon: <CheckCircleOutlined /> },
    { key: 'my',          label: 'My Bets',     icon: <UserOutlined /> },
    { key: 'leaderboard', label: 'Leaderboard', icon: <TrophyOutlined /> },
    { key: 'season',      label: 'Season',      icon: <GiftOutlined /> },
    { key: 'referral',    label: 'Referral',    icon: <ShareAltOutlined /> },
  ];

  return (
    <div className="pm-page">
      {toastMsg && (
        <div className={`pm-toast ${toastMsg.type}`}>{toastMsg.text}</div>
      )}

      {/* Clean page header */}
      <div className="pm-header">
        <div className="pm-header-top">
          <div>
            <div className="pm-header-title">Trade Prediction Market</div>
            <div className="pm-header-sub">Predict the final PnL% of live positions — closest predictions split the pool</div>
          </div>
          <div className="pm-header-stats">
            <div className="pm-stat-card">
              <div className="pm-stat-card-val">{openEvents.length}</div>
              <div className="pm-stat-card-label">Live Events</div>
            </div>
            <div className="pm-stat-card">
              <div className="pm-stat-card-val">{platformStats.total_users}</div>
              <div className="pm-stat-card-label">Total Users</div>
            </div>
            <div className="pm-stat-card">
              <div className="pm-stat-card-val">${Number(platformStats.total_volume).toFixed(0)}</div>
              <div className="pm-stat-card-label">Total Volume</div>
            </div>
            <div className="pm-stat-card" style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe', cursor: pointsBalance === null ? 'pointer' : 'default' }}
              onClick={async () => {
                if (pointsBalance !== null) return;
                try {
                  const data = await predictionApi.getPointsBalance();
                  if (data?.balance != null) { setPointsBalance(data.balance); showToast(`Welcome! You received ${data.balance.toLocaleString()} points!`, 'success'); }
                } catch { showToast('Connect wallet first', 'error'); }
              }}
            >
              <div className="pm-stat-card-val" style={{ color: '#6366f1' }}>
                {pointsBalance !== null
                  ? (pointsBalance >= 1000 ? `${(pointsBalance / 1000).toFixed(1)}K` : pointsBalance.toFixed(0))
                  : '🎁 Claim'}
              </div>
              <div className="pm-stat-card-label">{pointsBalance !== null ? 'My Points' : 'Free Points'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pm-main">
        {/* Segment tabs */}
        <div className="pm-tabs-bar">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`pm-tab-btn${activeTab === t.key ? ' active' : ''}`}
              onClick={() => { setActiveTab(t.key); if (t.key === 'settled') setSettledPage(1); }}
            >
              {t.icon}
              {t.label}
              {t.count != null && (
                <span className="pm-tab-count">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'open' && (
          <div className="pm-tab-content">
            {openEvents.length === 0 ? (
              <div className="pm-empty">
                <div className="pm-empty-icon">📊</div>
                <div>No active predictions right now</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>New events appear when paper trade positions open</div>
              </div>
            ) : (
              openEvents.map(event => (
                <div key={event.event_id}>
                  <EventCard
                    event={event}
                    onBet={() => handleSelectEvent(event.event_id)}
                    expanded={selectedEvent === event.event_id}
                  />
                  {selectedEvent === event.event_id && (
                    <BetForm
                      event={event}
                      onSubmit={handlePlaceBet}
                      onCancel={() => { setSelectedEvent(null); resetBetStep(); }}
                      loading={loading}
                      step={step}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'settled' && (() => {
          const sorted = [...recentSettled].sort((a, b) => new Date(b.settled_at || 0).getTime() - new Date(a.settled_at || 0).getTime());
          const totalPages = Math.ceil(sorted.length / SETTLED_PER_PAGE);
          const pageItems = sorted.slice((settledPage - 1) * SETTLED_PER_PAGE, settledPage * SETTLED_PER_PAGE);

          return (
            <div className="pm-tab-content">
              {sorted.length === 0 ? (
                <div className="pm-empty">
                  <div className="pm-empty-icon">🏁</div>
                  <div>No settled events yet</div>
                </div>
              ) : (
                <>
                  {pageItems.map(event => (
                    <SettlementCard key={event.event_id} event={event} />
                  ))}
                  {totalPages > 1 && (
                    <div style={{
                      display: 'flex', justifyContent: 'center', alignItems: 'center',
                      gap: 6, padding: '16px 0 8px',
                    }}>
                      <button
                        onClick={() => setSettledPage(p => Math.max(1, p - 1))}
                        disabled={settledPage <= 1}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                          background: settledPage <= 1 ? '#f9fafb' : '#fff', color: settledPage <= 1 ? '#d1d5db' : '#374151',
                          cursor: settledPage <= 1 ? 'default' : 'pointer', fontSize: 13, fontWeight: 500,
                        }}
                      >
                        Prev
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - settledPage) <= 1)
                        .reduce<(number | string)[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          typeof p === 'string' ? (
                            <span key={`dot-${i}`} style={{ color: '#9ca3af', fontSize: 12 }}>{p}</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setSettledPage(p)}
                              style={{
                                width: 32, height: 32, borderRadius: 8, border: 'none',
                                background: p === settledPage ? '#4f46e5' : 'transparent',
                                color: p === settledPage ? '#fff' : '#6b7280',
                                cursor: 'pointer', fontSize: 13, fontWeight: p === settledPage ? 600 : 400,
                              }}
                            >
                              {p}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => setSettledPage(p => Math.min(totalPages, p + 1))}
                        disabled={settledPage >= totalPages}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                          background: settledPage >= totalPages ? '#f9fafb' : '#fff', color: settledPage >= totalPages ? '#d1d5db' : '#374151',
                          cursor: settledPage >= totalPages ? 'default' : 'pointer', fontSize: 13, fontWeight: 500,
                        }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {activeTab === 'my' && (
          <div className="pm-tab-content">
            <MyPredictions />
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="pm-tab-content">
            <Leaderboard />
          </div>
        )}

        {activeTab === 'season' && (
          <div className="pm-tab-content">
            <SeasonPage />
          </div>
        )}

        {activeTab === 'referral' && (
          <div className="pm-tab-content">
            <ReferralPage />
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictionMarketPage;

import React, { useState, useEffect, useCallback } from 'react';
import { InfoCircleOutlined, TrophyOutlined, FireOutlined, ThunderboltOutlined, AimOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import * as predictionApi from '../../services/predictionMarketService';

type SeasonTab = 'weekly' | 'season' | 'accuracy' | 'monthly';

const REWARD_TOOLTIPS: Record<string, string> = {
  'Daily Participation': 'Every day, 888,889 points are split among all participants based on activity weight (Predictions x 10 x Amount Multiplier). More bets and higher amounts = larger share. Total: 80M points.',
  'Weekly Bonus': 'Each week, Top 20 users by weekly points share 750,000 bonus points. Final 6 days: Top 20 share 1,000,000 bonus points. 13 rounds total, 10M points.',
  'Accuracy Bonus': 'Top 200 users with the lowest average prediction error earn bonus points at season end. Total: 10M points.',
};

const SeasonPage: React.FC = () => {
  const [seasonInfo, setSeasonInfo] = useState<any>(null);
  const [myStats, setMyStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<SeasonTab>('weekly');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    predictionApi.getSeasonInfo().then(setSeasonInfo).catch(() => {});
    predictionApi.getMySeasonStats().then(setMyStats).catch(() => {});
  }, []);

  const loadLeaderboard = useCallback(async (tab: SeasonTab) => {
    try {
      let data: any[] = [];
      switch (tab) {
        case 'weekly': data = await predictionApi.getWeeklyLeaderboard(); break;
        case 'season': data = await predictionApi.getSeasonLeaderboard(); break;
        case 'accuracy': data = await predictionApi.getAccuracyLeaderboard(); break;
        case 'monthly': data = await predictionApi.getMonthlyProfitLeaderboard(); break;
      }
      setLeaderboard(data);
    } catch { setLeaderboard([]); }
  }, []);

  useEffect(() => { loadLeaderboard(activeTab); }, [activeTab, loadLeaderboard]);

  const formatAddr = (addr: string) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
  const formatPts = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toFixed(0);

  if (!seasonInfo) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>No Active Season</div>
        <div style={{ marginTop: 8, fontSize: 14 }}>Season 1 is coming soon. Stay tuned!</div>
      </div>
    );
  }

  const config = seasonInfo.config || {};
  const now = new Date();
  const seasonStart = new Date(seasonInfo.start_at);
  const daysSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24));
  const currentMonth = Math.floor(daysSinceStart / 30);
  const nextDistDay = (currentMonth + 1) * 30;
  const daysUntilDist = Math.max(0, nextDistDay - daysSinceStart);
  const progressPct = Math.min(100, (daysSinceStart / 90) * 100);

  return (
    <div className="season-page">
      {/* Inline CSS for animations */}
      <style>{`
        @keyframes season-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes season-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes season-pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.3); }
          70% { box-shadow: 0 0 0 12px rgba(255,255,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
        }
        @keyframes season-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: none; }
        }
        .season-card-hover { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .season-card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.1) !important; }
        .season-row-hover { transition: background 0.15s ease; }
        .season-row-hover:hover { background: #f8fafc !important; }
      `}</style>

      {/* ============ HERO SECTION ============ */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 40%, #a855f7 70%, #c084fc 100%)',
        borderRadius: 20, padding: '32px 28px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(79,70,229,0.3)',
      }}>
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 160, height: 160,
          borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
        }} />
        <div style={{
          position: 'absolute', bottom: -20, right: 80, width: 100, height: 100,
          borderRadius: '50%', background: 'rgba(255,255,255,0.04)',
        }} />
        <div style={{
          position: 'absolute', top: 20, right: 160, width: 60, height: 60,
          borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
        }} />

        {/* Title row */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, animation: 'season-float 3s ease-in-out infinite',
            }}>🏆</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                {seasonInfo.name}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 600, color: 'transparent', letterSpacing: '0.5px',
                background: 'linear-gradient(90deg, #fde68a, #fbbf24, #fde68a)',
                backgroundSize: '200% 100%',
                WebkitBackgroundClip: 'text',
                animation: 'season-shimmer 3s linear infinite',
              }}>
                100,000,000 POINTS + MONTHLY USDC REWARDS
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 18, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Season Progress
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                Day {daysSinceStart} / 90
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)' }}>
              <div style={{
                height: '100%', borderRadius: 3, width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { val: `${seasonInfo.remaining_days}d`, label: 'Remaining', icon: '⏳' },
              { val: seasonInfo.stats?.total_users || 0, label: 'Participants', icon: '👥' },
              { val: `$${(seasonInfo.reserve_pool_onchain ?? 0).toFixed(2)}`, label: 'Reserve Pool', icon: '💰' },
              { val: `${daysUntilDist}d`, label: 'Next USDC Drop', icon: '🎁' },
            ].map((s, i) => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
                borderRadius: 12, padding: '12px 10px', textAlign: 'center',
                border: '1px solid rgba(255,255,255,0.1)',
                animation: `season-fade-in 0.4s ease ${i * 0.1}s both`,
              }}>
                <div style={{ fontSize: 14, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ REWARD POOL CARDS ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Daily Participation', points: Math.round((config.daily_participation || 2400000) / 90), who: 'All Users / Per Day', color: '#6366f1', icon: <FireOutlined />, gradient: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' },
          { label: 'Weekly Bonus', points: config.weekly_bonus || 300000, who: 'Top 20 / Round', color: '#f97316', icon: <ThunderboltOutlined />, gradient: 'linear-gradient(135deg, #fff7ed, #ffedd5)' },
          { label: 'Accuracy Bonus', points: config.accuracy_bonus || 300000, who: 'Top 200 / Season End', color: '#22c55e', icon: <AimOutlined />, gradient: 'linear-gradient(135deg, #f0fdf4, #dcfce7)' },
        ].map((r, i) => (
          <div key={r.label} className="season-card-hover" style={{
            background: r.gradient, borderRadius: 16, padding: '18px 16px',
            border: '1px solid rgba(0,0,0,0.04)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            animation: `season-fade-in 0.4s ease ${i * 0.1 + 0.3}s both`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, color: r.color }}>{r.icon}</span>
                <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{r.label}</span>
              </div>
              <Tooltip title={REWARD_TOOLTIPS[r.label] || ''}>
                <InfoCircleOutlined style={{ fontSize: 12, color: '#9ca3af', cursor: 'pointer' }} />
              </Tooltip>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: r.color, lineHeight: 1 }}>
              {formatPts(r.points)}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, fontWeight: 500 }}>{r.who}</div>
          </div>
        ))}
      </div>

      {/* ============ MY STATS ============ */}
      {myStats && myStats.total_points > 0 && (
        <div className="season-card-hover" style={{
          background: 'linear-gradient(135deg, #fefce8, #fef9c3)', borderRadius: 16, padding: '20px',
          marginBottom: 24, border: '1.5px solid #fde68a',
          boxShadow: '0 2px 12px rgba(253,230,138,0.3)',
          animation: 'season-fade-in 0.4s ease 0.6s both',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TrophyOutlined style={{ fontSize: 16, color: '#d97706' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>My Season Stats</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
            {[
              { label: 'Total Points', val: myStats.total_points.toFixed(0), color: '#6366f1', bold: true },
              { label: 'Participation', val: myStats.participation_points.toFixed(0), color: '#6b7280' },
              { label: 'Weekly', val: myStats.weekly_points.toFixed(0), color: '#6b7280' },
              { label: 'Predictions', val: myStats.valid_predictions, color: '#6b7280' },
              { label: 'Volume', val: `$${myStats.total_volume.toFixed(0)}`, color: '#6b7280' },
              { label: 'Net P&L', val: `$${myStats.net_pnl.toFixed(2)}`, color: myStats.net_pnl >= 0 ? '#16a34a' : '#dc2626' },
              { label: 'Active Days', val: myStats.active_days, color: '#6b7280' },
              { label: 'Season Rank', val: myStats.ranks?.season ? `#${myStats.ranks.season}` : '-', color: '#d97706', bold: true },
            ].map(s => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.6)', borderRadius: 10, padding: '8px 10px',
              }}>
                <div style={{ fontSize: (s as any).bold ? 18 : 15, fontWeight: (s as any).bold ? 800 : 600, color: s.color }}>
                  {s.val}
                </div>
                <div style={{ fontSize: 10, color: '#92400e', marginTop: 2, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ LEADERBOARD TABS ============ */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12 }}>
        Season Leaderboards
      </div>
      <div style={{
        display: 'flex', gap: 3, background: 'white', borderRadius: 14, padding: 5,
        border: '1px solid #ebebf0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16
      }}>
        {([
          { key: 'weekly', label: 'Weekly' },
          { key: 'monthly', label: 'Monthly' },
          { key: 'accuracy', label: 'Accuracy' },
          { key: 'season', label: 'Season' },
        ] as { key: SeasonTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeTab === t.key ? 600 : 500, whiteSpace: 'nowrap',
              background: activeTab === t.key ? '#6366f1' : 'transparent',
              color: activeTab === t.key ? '#fff' : '#6b7280',
              boxShadow: activeTab === t.key ? '0 2px 10px rgba(99,102,241,0.32)' : 'none',
              transition: 'all 0.2s ease',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ LEADERBOARD TABLE ============ */}
      <div style={{
        background: 'white', borderRadius: 16, border: '1px solid #f0f0f5',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden'
      }}>
        {leaderboard.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280' }}>No data yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Start predicting to appear on the leaderboard</div>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr 100px 48px 80px 16px 90px',
              padding: '10px 20px', background: '#f8fafc',
              borderBottom: '1px solid #f1f5f9',
              fontSize: 10, fontWeight: 600,
              color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>
              <div>#</div>
              <div>Player</div>
              {activeTab === 'accuracy' ? <div style={{ textAlign: 'right' }}>Error</div> : <div style={{ textAlign: 'right' }}>USDC P&L</div>}
              {activeTab === 'accuracy' ? <div style={{ textAlign: 'right' }}>Preds</div> : <div style={{ textAlign: 'right' }}>Bets</div>}
              <div style={{ textAlign: 'right' }}>Staked</div>
              <div />
              <div style={{ textAlign: 'center' }}>Season Pts</div>
            </div>
            {/* Rows */}
            {leaderboard.map((entry, i) => {
              const usdcPnl = entry.usdc_pnl ?? 0;
              const ptsPnl = entry.pts_pnl ?? 0;
              const usdcVol = entry.usdc_volume ?? 0;
              const ptsVol = entry.pts_volume ?? 0;
              const bets = entry.weekly_bets ?? entry.monthly_bets ?? entry.valid_predictions ?? 0;
              const pts = activeTab === 'weekly' ? (entry.weekly_points ?? 0)
                : activeTab === 'monthly' ? (entry.monthly_points ?? 0)
                : (entry.total_points ?? 0);

              return (
                <div key={entry.user_address} className="season-row-hover" style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 100px 48px 80px 16px 90px',
                  padding: '12px 20px',
                  borderBottom: i < leaderboard.length - 1 ? '1px solid #f9fafb' : 'none',
                  alignItems: 'center',
                  animation: `season-fade-in 0.3s ease ${i * 0.03}s both`,
                }}>
                  <div style={{
                    fontSize: i < 3 ? 18 : 13,
                    fontWeight: 600,
                    color: i < 3 ? '#f59e0b' : '#94a3b8',
                  }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${entry.rank}`}
                  </div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12, color: '#374151', fontWeight: 600,
                  }}>
                    {formatAddr(entry.user_address)}
                  </div>
                  {activeTab === 'accuracy' ? (
                    <div style={{ textAlign: 'right', fontSize: 12, color: '#6366f1', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                      {entry.avg_error?.toFixed(2)}%
                    </div>
                  ) : (
                    <div style={{
                      textAlign: 'right', fontSize: 12, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: usdcPnl > 0 ? '#16a34a' : usdcPnl < 0 ? '#dc2626' : '#9ca3af',
                    }}>
                      {usdcPnl !== 0 ? `${usdcPnl >= 0 ? '+' : ''}$${Math.abs(usdcPnl).toFixed(1)}` : '-'}
                    </div>
                  )}
                  <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
                    {activeTab === 'accuracy' ? entry.valid_predictions : bets}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                    {usdcVol > 0 && <div style={{ color: '#374151', fontWeight: 600 }}>${usdcVol.toFixed(0)}</div>}
                    {ptsVol > 0 && <div style={{ color: '#9ca3af' }}>{formatPts(ptsVol)} pts</div>}
                    {usdcVol === 0 && ptsVol === 0 && <div style={{ color: '#9ca3af' }}>-</div>}
                  </div>
                  <div />
                  <div style={{
                    textAlign: 'center', fontSize: 12, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: '#6366f1',
                    background: i < 3 ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.05)',
                    borderRadius: 8, padding: '5px 8px',
                  }}>
                    {formatPts(pts)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============ HOW IT WORKS ============ */}
      <div style={{
        marginTop: 24, background: 'white', borderRadius: 16, padding: '20px 20px',
        border: '1px solid #ebebf0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        fontSize: 13, color: '#6b7280', lineHeight: 2
      }}>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: 10, fontSize: 14 }}>How It Works</div>
        <div>1. Every day, <strong style={{ color: '#6366f1' }}>888,889 points</strong> are distributed to all participants based on prediction activity weight</div>
        <div>2. Predict more and with higher amounts to earn a larger share of the daily pool</div>
        <div>3. Weekly leaderboard — <strong style={{ color: '#f97316' }}>Top 20</strong> by weekly points earn bonus points each round</div>
        <div>4. Accuracy bonus — <strong style={{ color: '#22c55e' }}>Top 200</strong> most accurate predictors earn bonus points at season end</div>
        <div>5. All points count toward future Galeon ecosystem rewards</div>
        <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
          <strong style={{ color: '#16a34a' }}>Monthly USDC:</strong> Every 30 days, 50% of Reserve Pool is distributed.
          Top 100 by monthly points share 70%. 50 random bonus winners from remaining participants share 30%.
        </div>
      </div>
    </div>
  );
};

export default SeasonPage;

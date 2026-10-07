import React, { useState, useEffect } from 'react';
import { CopyOutlined, CheckOutlined, ShareAltOutlined, TeamOutlined, DollarOutlined } from '@ant-design/icons';
import { message } from 'antd';
import * as predictionApi from '../../services/predictionMarketService';

const ReferralPage: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, h] = await Promise.all([
          predictionApi.getReferralStats(),
          predictionApi.getReferralHistory(),
        ]);
        setStats(s);
        setHistory(h);
      } catch (err) {
        console.error('Referral load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const copyLink = () => {
    if (!stats?.referral_link) return;
    navigator.clipboard.writeText(stats.referral_link).then(() => {
      setCopied(true);
      message.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const copyCode = () => {
    if (!stats?.referral_code) return;
    navigator.clipboard.writeText(stats.referral_code).then(() => {
      message.success('Code copied!');
    });
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading...</div>;
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Connect Wallet</div>
        <div style={{ marginTop: 8 }}>Connect your wallet to get your referral link</div>
      </div>
    );
  }

  return (
    <div>
      <style>{`
        @keyframes ref-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: none; }
        }
        .ref-card-hover { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .ref-card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.1) !important; }
      `}</style>

      {/* Referral Link Card */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
        borderRadius: 20, padding: '28px 24px', marginBottom: 20,
        boxShadow: '0 8px 32px rgba(79,70,229,0.3)',
        position: 'relative', overflow: 'hidden',
        animation: 'ref-fade-in 0.4s ease',
      }}>
        <div style={{
          position: 'absolute', top: -30, right: -30, width: 120, height: 120,
          borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <ShareAltOutlined style={{ fontSize: 20, color: '#fff' }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Invite Friends & Earn</span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 16, lineHeight: 1.6 }}>
            Share your referral link. When your friends predict, you earn <strong style={{ color: '#fbbf24' }}>20% of their trading fees</strong> as commission.
          </div>

          {/* Referral Code */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Your Code
            </div>
            <div
              onClick={copyCode}
              style={{
                background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 14px',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700,
                color: '#fbbf24', letterSpacing: '2px', cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              {stats.referral_code}
            </div>
          </div>

          {/* Referral Link + Copy */}
          <div style={{
            display: 'flex', gap: 8, alignItems: 'stretch',
          }}>
            <div style={{
              flex: 1, background: 'rgba(255,255,255,0.1)', borderRadius: 10,
              padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, color: 'rgba(255,255,255,0.8)', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              {stats.referral_link}
            </div>
            <button
              onClick={copyLink}
              style={{
                background: copied ? '#22c55e' : '#fbbf24',
                border: 'none', borderRadius: 10, padding: '10px 20px',
                color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? <CheckOutlined /> : <CopyOutlined />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Referrals', val: stats.total_referrals, icon: <TeamOutlined />, color: '#6366f1', gradient: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' },
          { label: 'Total Commission', val: `$${stats.total_commission.toFixed(2)}`, icon: <DollarOutlined />, color: '#22c55e', gradient: 'linear-gradient(135deg, #f0fdf4, #dcfce7)' },
          { label: 'Pending Payout', val: `$${stats.pending_commission.toFixed(2)}`, icon: <DollarOutlined />, color: '#f97316', gradient: 'linear-gradient(135deg, #fff7ed, #ffedd5)' },
        ].map((s, i) => (
          <div key={s.label} className="ref-card-hover" style={{
            background: s.gradient, borderRadius: 16, padding: '18px 16px',
            border: '1px solid rgba(0,0,0,0.04)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            animation: `ref-fade-in 0.4s ease ${i * 0.1 + 0.2}s both`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 14, color: s.color }}>{s.icon}</span>
              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Extra Stats */}
      <div style={{
        background: 'white', borderRadius: 16, padding: '16px 20px', marginBottom: 20,
        border: '1px solid #ebebf0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
        animation: 'ref-fade-in 0.4s ease 0.5s both',
      }}>
        {[
          { label: 'Trades by Referrals', val: stats.total_trades },
          { label: 'Total Volume', val: `$${stats.total_volume.toFixed(0)}` },
          { label: 'Total Fees Generated', val: `$${stats.total_fees.toFixed(2)}` },
          { label: 'Commission Rate', val: `${(stats.commission_rate * 100).toFixed(0)}%` },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#374151' }}>{s.val}</div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* My Referrer */}
      {stats.my_referrer && (
        <div style={{
          background: '#f0fdf4', borderRadius: 12, padding: '12px 16px', marginBottom: 20,
          border: '1px solid #bbf7d0', fontSize: 13, color: '#16a34a',
        }}>
          You were referred by <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {stats.my_referrer.address.slice(0, 6)}...{stats.my_referrer.address.slice(-4)}
          </strong> (code: {stats.my_referrer.code})
        </div>
      )}

      {/* Commission History */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12 }}>
        Commission History
      </div>
      <div style={{
        background: 'white', borderRadius: 16, border: '1px solid #f0f0f5',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden',
      }}>
        {history.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>No commissions yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Share your link to start earning</div>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 70px 100px',
              padding: '10px 20px', background: '#f8fafc',
              borderBottom: '1px solid #f1f5f9',
              fontSize: 10, fontWeight: 600, color: '#94a3b8',
              textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>
              <div>User</div>
              <div style={{ textAlign: 'right' }}>Bet</div>
              <div style={{ textAlign: 'right' }}>Fee</div>
              <div style={{ textAlign: 'right' }}>Commission</div>
              <div style={{ textAlign: 'right' }}>Status</div>
              <div style={{ textAlign: 'right' }}>Time</div>
            </div>
            {/* Rows */}
            {history.map((row, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 70px 100px',
                padding: '12px 20px', alignItems: 'center',
                borderBottom: i < history.length - 1 ? '1px solid #f9fafb' : 'none',
                fontSize: 13,
              }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#374151', fontWeight: 600 }}>
                  {row.referee_address.slice(0, 6)}...{row.referee_address.slice(-4)}
                </div>
                <div style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: '#374151' }}>
                  ${row.bet_amount.toFixed(0)}
                </div>
                <div style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: '#64748b' }}>
                  ${row.fee_amount.toFixed(2)}
                </div>
                <div style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: '#22c55e', fontWeight: 700 }}>
                  +${row.commission_amount.toFixed(2)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    background: row.status === 'PAID' ? '#f0fdf4' : '#fef9c3',
                    color: row.status === 'PAID' ? '#16a34a' : '#a16207',
                  }}>
                    {row.status}
                  </span>
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: '#9ca3af' }}>
                  {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div style={{
        marginTop: 20, background: 'white', borderRadius: 16, padding: '20px',
        border: '1px solid #ebebf0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        fontSize: 13, color: '#6b7280', lineHeight: 2,
      }}>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: 8, fontSize: 14 }}>How Referral Works</div>
        <div>1. Share your unique referral link with friends</div>
        <div>2. When they connect their wallet through your link, they are permanently bound to you</div>
        <div>3. Every time they place a prediction bet, you earn <strong style={{ color: '#22c55e' }}>20%</strong> of the platform's 2% trading fee</div>
        <div>4. Commissions are tracked in real-time and paid out periodically</div>
        <div style={{ marginTop: 10, padding: '10px 14px', background: '#eef2ff', borderRadius: 10, border: '1px solid #c7d2fe' }}>
          <strong style={{ color: '#6366f1' }}>Example:</strong> Your friend bets $100 → Platform fee $2 → You earn $0.40
        </div>
      </div>
    </div>
  );
};

export default ReferralPage;

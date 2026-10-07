import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { requestWithdrawal, getWithdrawalHistory, getUserCredit } from '../services/api';
import '../styles/CreatorDashboard.css';

interface Withdrawal {
  id: string;
  amount: number;
  usdt_amount: number;
  fee_amount: number;
  wallet_address: string;
  chain: string;
  status: string;
  created_at: string;
  locked_until: string;
  tx_hash?: string;
  completed_at?: string;
}

const WithdrawalManagement: React.FC = () => {
  const navigate = useNavigate();
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const currentAccount = getCurrentAccount();

  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState(currentAccount || '');
  const [chain, setChain] = useState<'Polygon' | 'BSC' | 'ETH'>('Polygon');
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);

  useEffect(() => {
    if (currentAccount) {
      setWalletAddress(currentAccount);
      fetchWithdrawalHistory();
      fetchTotalEarnings();
    }
  }, [currentAccount]);

  const fetchWithdrawalHistory = async () => {
    try {
      const response = await getWithdrawalHistory();
      setWithdrawals(response.withdrawals || []);
    } catch (error) {
      console.error('Failed to fetch withdrawal history:', error);
    }
  };

  const fetchTotalEarnings = async () => {
    try {
      const response = await fetch(`${window.location.origin.includes('testai.galeon.world') ? 'https://testaiservice.galeon.world/api' : window.location.origin.includes('testai.gameland.network') ? 'https://testaiservice.gameland.network/api' : 'http://localhost:8080/api'}/credits/creator/earnings`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setTotalEarnings(data.totalEarnings || 0);
    } catch (error) {
      console.error('Failed to fetch earnings:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amountNum = parseInt(amount);
    if (amountNum < 100) {
      alert('Minimum withdrawal: 100 Credits');
      return;
    }
    if (amountNum > totalEarnings) {
      alert(`Insufficient earnings! Available: ${totalEarnings} Credits`);
      return;
    }

    setLoading(true);
    try {
      const result = await requestWithdrawal(amountNum, walletAddress, chain);
      alert(`Request submitted! Expected payout: ${result.usdtAmount} USDT (Fee: ${result.fee} USDT)`);
      setAmount('');
      fetchWithdrawalHistory();
      fetchTotalEarnings();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Withdrawal request failed');
    } finally {
      setLoading(false);
    }
  };

  const calculateUSDT = (credits: number) => {
    const usdtBeforeFee = credits * 0.03;
    const fee = usdtBeforeFee * 0.05;
    return {
      total: (usdtBeforeFee - fee).toFixed(2),
      fee: fee.toFixed(2)
    };
  };

  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      pending: '⏳ Locked',
      processing: '🔄 Processing',
      completed: '✅ Completed',
      failed: '❌ Failed'
    };
    return statusMap[status] || status;
  };

  return (
    <div className="creator-dashboard">
      <div className="dashboard-header">
        <button onClick={() => navigate('/creator/dashboard')} className="back-button">
          ← Back to Creator Center
        </button>
      </div>

      <div className="dashboard-content">
        {/* Available Earnings Card */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '30px'
        }}>
          <div style={{
            backgroundColor: '#fff',
            padding: '30px 40px',
            borderRadius: '12px',
            border: '2px solid #e8e8e8',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            minWidth: '400px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '14px',
              color: '#999',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: '600'
            }}>
              Available Earnings
            </div>
            <div style={{
              fontSize: '48px',
              fontWeight: '700',
              color: '#52c41a',
              marginBottom: '8px',
              lineHeight: '1.2'
            }}>
              {totalEarnings}
              <span style={{ fontSize: '24px', color: '#999', marginLeft: '8px' }}>Credits</span>
            </div>
            <div style={{
              fontSize: '16px',
              color: '#666',
              padding: '8px 16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '20px',
              display: 'inline-block'
            }}>
              ≈ <strong>{(totalEarnings * 0.03 * 0.95).toFixed(2)} USDT</strong> (after 5% fee)
            </div>
          </div>
        </div>

        {/* Withdrawal Request Form */}
        <div style={{ marginTop: '30px', backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>Submit Withdrawal Request</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Amount (Credits)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Minimum 100 Credits"
                min="100"
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '6px'
                }}
                required
              />
              {amount && parseInt(amount) >= 100 && (
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>
                  💰 Expected payout: <strong>{calculateUSDT(parseInt(amount)).total} USDT</strong>
                  (Fee: {calculateUSDT(parseInt(amount)).fee} USDT)
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Receiving Wallet Address
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontFamily: 'monospace'
                }}
                required
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Network
              </label>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="Polygon"
                    checked={chain === 'Polygon'}
                    onChange={(e) => setChain(e.target.value as 'Polygon' | 'BSC' | 'ETH')}
                    style={{ marginRight: '6px' }}
                  />
                  Polygon (USDT)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="BSC"
                    checked={chain === 'BSC'}
                    onChange={(e) => setChain(e.target.value as 'Polygon' | 'BSC' | 'ETH')}
                    style={{ marginRight: '6px' }}
                  />
                  BNB Smart Chain (USDT)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="ETH"
                    checked={chain === 'ETH'}
                    onChange={(e) => setChain(e.target.value as 'Polygon' | 'BSC' | 'ETH')}
                    style={{ marginRight: '6px' }}
                  />
                  Ethereum (USDT)
                </label>
              </div>
            </div>

            <div style={{
              padding: '12px',
              backgroundColor: '#fff7e6',
              border: '1px solid #ffd591',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '16px',
              lineHeight: '1.6'
            }}>
              <strong>⚠️ Important:</strong><br/>
              • Exchange rate: 1 Credit = 0.03 USDT (fixed)<br/>
              • Platform fee: 5% (deducted from USDT)<br/>
              • Lock period: 7 days (non-cancellable)<br/>
              • Payout time: After admin approval
            </div>

            <button
              type="submit"
              disabled={loading}
              className="Train-Agent"
              style={{ width: '100%' }}
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>

        {/* Withdrawal History */}
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>Withdrawal History</h2>
          {withdrawals.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              backgroundColor: '#fff',
              borderRadius: '8px',
              border: '1px solid #ddd'
            }}>
              <p style={{ color: '#999' }}>No withdrawal records</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {withdrawals.map((w) => (
                <div
                  key={w.id}
                  style={{
                    padding: '16px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    border: '1px solid #ddd'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                        {w.amount} Credits → {w.usdt_amount} USDT
                      </div>
                      <div style={{ fontSize: '12px', color: '#999' }}>
                        {new Date(w.created_at).toLocaleString('en-US')}
                      </div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>
                      {getStatusText(w.status)}
                    </div>
                  </div>

                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                    <div>Network: {w.chain}</div>
                    <div>Receiving address: {w.wallet_address.substring(0, 8)}...{w.wallet_address.substring(w.wallet_address.length - 6)}</div>
                    {w.status === 'pending' && (
                      <div style={{ color: '#ff9800', marginTop: '4px' }}>
                        🔒 Locked until: {new Date(w.locked_until).toLocaleString('en-US')}
                      </div>
                    )}
                    {w.tx_hash && (
                      <div style={{ marginTop: '4px' }}>
                        Transaction hash:
                        <a
                          href={
                            w.chain === 'Polygon'
                              ? `https://polygonscan.com/tx/${w.tx_hash}`
                              : w.chain === 'BSC'
                              ? `https://bscscan.com/tx/${w.tx_hash}`
                              : `https://etherscan.io/tx/${w.tx_hash}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#1890ff', textDecoration: 'underline', marginLeft: '4px' }}
                        >
                          {w.tx_hash.substring(0, 10)}...
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WithdrawalManagement;

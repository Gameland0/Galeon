import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { getAdminWithdrawals, completeWithdrawal, getAdminPurchases } from '../services/api';
import Web3 from 'web3';
import '../styles/CreatorDashboard.css';

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  usdt_amount: number;
  wallet_address: string;
  chain: string;
  status: string;
  created_at: string;
  locked_until: string;
  username?: string;
}

interface Purchase {
  id: string;
  user_id: string;
  credits: number;
  price: number;
  plan_id: string;
  transaction_hash: string;
  purchase_type: string;
  created_at: string;
  username?: string;
  chain_type: string;
}

interface PurchaseStats {
  totalPurchases: number;
  totalCredits: number;
  totalAmount: number;
  last24Hours: number;
}

// USDT合约地址
const USDT_CONTRACTS = {
  Polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  BSC: '0x55d398326f99059fF775485246999027B3197955'
};

// ERC20 ABI（仅包含transfer方法）
const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  }
];

const AdminWithdrawalPanel: React.FC = () => {
  const navigate = useNavigate();
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const currentAccount = getCurrentAccount();

  // Tab state
  const [activeTab, setActiveTab] = useState<'withdrawals' | 'purchases'>('withdrawals');

  // Withdrawal states
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Purchase states
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [purchaseStats, setPurchaseStats] = useState<PurchaseStats>({
    totalPurchases: 0,
    totalCredits: 0,
    totalAmount: 0,
    last24Hours: 0
  });
  const [purchaseFilters, setPurchaseFilters] = useState({
    days: 30,
    chain: 'all',
    search: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // 检查管理员权限
  const ADMIN_ADDRESS = process.env.REACT_APP_ADMIN_WALLET_ADDRESS?.toLowerCase();
  const isAdmin = currentAccount?.toLowerCase() === ADMIN_ADDRESS;

  useEffect(() => {
    if (isAdmin) {
      if (activeTab === 'withdrawals') {
        fetchWithdrawals();
      } else {
        fetchPurchases();
      }
    }
  }, [isAdmin, activeTab, purchaseFilters, pagination.page]);

  const fetchWithdrawals = async () => {
    setLoadingWithdrawals(true);
    try {
      const response = await getAdminWithdrawals();
      setWithdrawals(response.withdrawals || []);
    } catch (error: any) {
      console.error('获取待处理列表失败:', error);
      if (error.response?.status === 403) {
        alert('权限不足：仅限管理员访问');
      } else {
        alert('获取待处理列表失败');
      }
    } finally {
      setLoadingWithdrawals(false);
    }
  };

  const fetchPurchases = async () => {
    setLoadingPurchases(true);
    try {
      const response = await getAdminPurchases({
        page: pagination.page,
        limit: pagination.limit,
        days: purchaseFilters.days,
        chain: purchaseFilters.chain,
        search: purchaseFilters.search
      });
      setPurchases(response.purchases || []);
      setPurchaseStats(response.stats || {
        totalPurchases: 0,
        totalCredits: 0,
        totalAmount: 0,
        last24Hours: 0
      });
      setPagination(prev => ({
        ...prev,
        total: response.pagination.total,
        totalPages: response.pagination.totalPages
      }));
    } catch (error: any) {
      console.error('获取购买记录失败:', error);
      if (error.response?.status === 403) {
        alert('权限不足：仅限管理员访问');
      } else {
        alert('获取购买记录失败');
      }
    } finally {
      setLoadingPurchases(false);
    }
  };

  const handlePay = async (withdrawal: Withdrawal) => {
    if (!window.ethereum) {
      alert('请安装MetaMask钱包');
      return;
    }

    setProcessingId(withdrawal.id);

    try {
      const web3 = new Web3(window.ethereum as any);
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      const chainId = await web3.eth.getChainId();
      const expectedChainId = withdrawal.chain === 'Polygon' ? 137 : 56;

      if (Number(chainId) !== expectedChainId) {
        const chainName = withdrawal.chain === 'Polygon' ? 'Polygon Mainnet' : 'BNB Smart Chain';
        alert(`请切换到${chainName}网络\n\nPolygon Chain ID: 137\nBSC Chain ID: 56\n\n当前Chain ID: ${chainId}`);
        setProcessingId(null);
        return;
      }

      const contractAddress = USDT_CONTRACTS[withdrawal.chain as keyof typeof USDT_CONTRACTS];
      const usdtContract = new web3.eth.Contract(ERC20_ABI as any, contractAddress);
      const amountInWei = Math.floor(withdrawal.usdt_amount * 1e6).toString();

      console.log(`准备发送交易:
        合约地址: ${contractAddress}
        收款地址: ${withdrawal.wallet_address}
        金额: ${withdrawal.usdt_amount} USDT (${amountInWei} wei)
        链: ${withdrawal.chain}
      `);

      try {
        const balance = await usdtContract.methods.balanceOf(currentAccount).call();
        const balanceUSDT = Number(balance) / 1e6;
        console.log(`当前USDT余额: ${balanceUSDT} USDT`);

        if (balanceUSDT < withdrawal.usdt_amount) {
          alert(`USDT余额不足！\n当前余额: ${balanceUSDT} USDT\n需要支付: ${withdrawal.usdt_amount} USDT`);
          setProcessingId(null);
          return;
        }
      } catch (error) {
        console.error('检查余额失败:', error);
      }

      const tx = await usdtContract.methods
        .transfer(withdrawal.wallet_address, amountInWei)
        .send({ from: currentAccount });

      console.log('交易成功:', tx.transactionHash);

      await completeWithdrawal(withdrawal.id, tx.transactionHash);

      alert('✅ 支付成功！\n交易哈希：' + tx.transactionHash);
      fetchWithdrawals();

    } catch (error: any) {
      console.error('支付失败:', error);

      let errorMessage = '支付失败';
      if (error.message) {
        if (error.message.includes('User denied')) {
          errorMessage = '用户取消了交易';
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Gas费不足或USDT余额不足';
        } else {
          errorMessage = error.message;
        }
      }

      alert(errorMessage);
    } finally {
      setProcessingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <h2 style={{ marginBottom: '20px', color: '#ff4d4f' }}>⚠️ 仅限管理员访问</h2>
        <p style={{ color: '#666', marginBottom: '30px' }}>
          当前钱包：{currentAccount || '未连接'}<br/>
          管理员地址：{ADMIN_ADDRESS || '未配置'}
        </p>
        <button
          onClick={() => navigate('/creator/dashboard')}
          className="Train-Agent"
        >
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="creator-dashboard">
      <div className="dashboard-header">
        <button onClick={() => navigate('/creator/dashboard')} className="back-button">
          ← 返回
        </button>
        <h1>管理员面板</h1>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '20px',
        borderBottom: '2px solid #e0e0e0',
        padding: '0 20px'
      }}>
        <button
          onClick={() => setActiveTab('withdrawals')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: activeTab === 'withdrawals' ? '600' : '400',
            color: activeTab === 'withdrawals' ? '#1890ff' : '#666',
            borderBottom: activeTab === 'withdrawals' ? '3px solid #1890ff' : 'none',
            marginBottom: '-2px',
            transition: 'all 0.3s'
          }}
        >
          💰 提现审核 {withdrawals.length > 0 && `(${withdrawals.length})`}
        </button>
        <button
          onClick={() => setActiveTab('purchases')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: activeTab === 'purchases' ? '600' : '400',
            color: activeTab === 'purchases' ? '#1890ff' : '#666',
            borderBottom: activeTab === 'purchases' ? '3px solid #1890ff' : 'none',
            marginBottom: '-2px',
            transition: 'all 0.3s'
          }}
        >
          📊 购买记录
        </button>
      </div>

      <div className="dashboard-content">
        {/* Withdrawals Tab */}
        {activeTab === 'withdrawals' && (
          <>
            <div style={{
              padding: '16px',
              backgroundColor: '#e6f7ff',
              border: '1px solid #91d5ff',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '14px',
              lineHeight: '1.8'
            }}>
              <strong>💡 操作说明：</strong><br/>
              1. 点击"Pay"按钮会自动调起MetaMask<br/>
              2. 请确保已切换到正确的网络（Polygon或BSC）<br/>
              3. 确认交易后，系统自动记录链上交易哈希<br/>
              4. Gas费用由平台（您的钱包）承担<br/>
              5. 仅显示已过7天锁定期的申请
            </div>

            {loadingWithdrawals ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '16px', color: '#666' }}>加载中...</div>
              </div>
            ) : withdrawals.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                backgroundColor: '#fff',
                borderRadius: '8px',
                border: '1px solid #ddd'
              }}>
                <p style={{ color: '#999', margin: 0 }}>暂无待处理的提现申请</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {withdrawals.map((w) => (
                  <div
                    key={w.id}
                    style={{
                      padding: '20px',
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      border: '2px solid #ffa940',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>
                          💰 {w.usdt_amount} USDT ({w.chain})
                        </div>
                        <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.8' }}>
                          <div><strong>用户：</strong>{w.username || w.user_id.substring(0, 10) + '...'}</div>
                          <div><strong>兑换：</strong>{w.amount} Credits</div>
                          <div><strong>收款地址：</strong>
                            <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                              {w.wallet_address}
                            </span>
                          </div>
                          <div><strong>申请时间：</strong>{new Date(w.created_at).toLocaleString('zh-CN')}</div>
                          <div><strong>解锁时间：</strong>{new Date(w.locked_until).toLocaleString('zh-CN')}</div>
                          <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#fff7e6', borderRadius: '4px' }}>
                            <strong>USDT合约地址：</strong><br/>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                              {USDT_CONTRACTS[w.chain as keyof typeof USDT_CONTRACTS]}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginLeft: '20px' }}>
                        <button
                          onClick={() => handlePay(w)}
                          disabled={processingId === w.id}
                          className="Train-Agent"
                          style={{
                            minWidth: '120px',
                            fontSize: '16px',
                            padding: '12px 24px'
                          }}
                        >
                          {processingId === w.id ? '处理中...' : '💳 Pay'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Purchases Tab */}
        {activeTab === 'purchases' && (
          <>
            {/* Statistics Summary */}
            <div style={{
              padding: '20px',
              backgroundColor: '#f0f5ff',
              border: '1px solid #adc6ff',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#1890ff' }}>📊 统计摘要</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '14px', color: '#666' }}>总购买笔数</div>
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#1890ff' }}>
                    {purchaseStats.totalPurchases}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', color: '#666' }}>总Credits</div>
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#52c41a' }}>
                    {purchaseStats.totalCredits.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', color: '#666' }}>总金额</div>
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#fa8c16' }}>
                    ${purchaseStats.totalAmount.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', color: '#666' }}>最近24小时</div>
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#722ed1' }}>
                    {purchaseStats.last24Hours}
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div style={{
              padding: '16px',
              backgroundColor: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontWeight: '600', fontSize: '14px' }}>🔍 筛选：</span>

              <select
                value={purchaseFilters.days}
                onChange={(e) => {
                  setPurchaseFilters({ ...purchaseFilters, days: parseInt(e.target.value) });
                  setPagination({ ...pagination, page: 1 });
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid #d9d9d9',
                  fontSize: '14px'
                }}
              >
                <option value={7}>最近7天</option>
                <option value={30}>最近30天</option>
                <option value={90}>最近90天</option>
                <option value={365}>最近1年</option>
              </select>

              <select
                value={purchaseFilters.chain}
                onChange={(e) => {
                  setPurchaseFilters({ ...purchaseFilters, chain: e.target.value });
                  setPagination({ ...pagination, page: 1 });
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid #d9d9d9',
                  fontSize: '14px'
                }}
              >
                <option value="all">所有链</option>
                <option value="EVM">EVM (Polygon/BSC)</option>
                <option value="Solana">Solana</option>
              </select>

              <input
                type="text"
                placeholder="搜索地址或用户名..."
                value={purchaseFilters.search}
                onChange={(e) => {
                  setPurchaseFilters({ ...purchaseFilters, search: e.target.value });
                  setPagination({ ...pagination, page: 1 });
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid #d9d9d9',
                  fontSize: '14px',
                  flex: 1,
                  minWidth: '200px'
                }}
              />
            </div>

            {/* Purchase Records Table */}
            {loadingPurchases ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '16px', color: '#666' }}>加载中...</div>
              </div>
            ) : purchases.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                backgroundColor: '#fff',
                borderRadius: '8px',
                border: '1px solid #ddd'
              }}>
                <p style={{ color: '#999', margin: 0 }}>暂无购买记录</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {purchases.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: '16px',
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        border: '1px solid #d9d9d9',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#1890ff' }}>
                            {p.credits} Credits - ${p.price}
                          </div>
                          <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.6' }}>
                            <div>
                              <strong>日期：</strong>
                              {new Date(p.created_at).toLocaleString('zh-CN')}
                            </div>
                            <div>
                              <strong>用户：</strong>
                              <span style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                                {p.username || p.user_id}
                              </span>
                            </div>
                            <div>
                              <strong>套餐：</strong>
                              <span style={{
                                padding: '2px 8px',
                                backgroundColor: '#f0f5ff',
                                borderRadius: '4px',
                                fontSize: '12px',
                                marginLeft: '4px'
                              }}>
                                {p.plan_id}
                              </span>
                            </div>
                            <div>
                              <strong>区块链：</strong>
                              <span style={{
                                padding: '2px 8px',
                                backgroundColor: p.chain_type === 'Solana' ? '#fff7e6' : '#e6f7ff',
                                borderRadius: '4px',
                                fontSize: '12px',
                                marginLeft: '4px'
                              }}>
                                {p.chain_type}
                              </span>
                            </div>
                            <div>
                              <strong>TX：</strong>
                              {p.transaction_hash && !p.transaction_hash.startsWith('0x000000000000000000000000000000000000000000000000000000000000') && !p.transaction_hash.startsWith('block-') ? (
                                <a
                                  href={`https://polygonscan.com/tx/${p.transaction_hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: '11px',
                                    color: '#1890ff',
                                    textDecoration: 'underline',
                                    wordBreak: 'break-all'
                                  }}
                                >
                                  {p.transaction_hash}
                                </a>
                              ) : (
                                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#999' }}>
                                  {p.transaction_hash || '等待链上确认'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '12px',
                    marginTop: '24px',
                    padding: '16px'
                  }}>
                    <button
                      onClick={() => setPagination({ ...pagination, page: Math.max(1, pagination.page - 1) })}
                      disabled={pagination.page === 1}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '4px',
                        border: '1px solid #d9d9d9',
                        background: pagination.page === 1 ? '#f5f5f5' : '#fff',
                        cursor: pagination.page === 1 ? 'not-allowed' : 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      ← 上一页
                    </button>
                    <span style={{ fontSize: '14px', color: '#666' }}>
                      第 {pagination.page} / {pagination.totalPages} 页 (共 {pagination.total} 条)
                    </span>
                    <button
                      onClick={() => setPagination({ ...pagination, page: Math.min(pagination.totalPages, pagination.page + 1) })}
                      disabled={pagination.page === pagination.totalPages}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '4px',
                        border: '1px solid #d9d9d9',
                        background: pagination.page === pagination.totalPages ? '#f5f5f5' : '#fff',
                        cursor: pagination.page === pagination.totalPages ? 'not-allowed' : 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      下一页 →
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminWithdrawalPanel;

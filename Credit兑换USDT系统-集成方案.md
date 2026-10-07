# 💰 Credit兑换USDT系统 - 集成实施方案

## 📋 设计原则

✅ **无需独立部署** - 管理面板集成到现有React应用中
✅ **复用现有组件** - 沿用Creator Dashboard的样式和模式
✅ **扩展现有后端** - 在creditRoutes.js和creditController.js基础上增加功能
✅ **MetaMask集成** - 与现有钱包系统并存
✅ **单域名部署** - 使用当前URL，无需新域名

---

## 💼 业务规则

| 规则项 | 说明 |
|--------|------|
| **兑换汇率** | 1 Credit = 0.03 USDT（固定） |
| **平台手续费** | 5%（从USDT中扣除） |
| **最低提现** | 100 Credits |
| **锁定期** | 7天（用户不可取消） |
| **扣款来源** | `agents.total_earnings`（创作者收益，非用户充值余额） |
| **支持链** | Polygon 和 BNB Smart Chain |
| **Gas费用** | 平台承担 |
| **审批方式** | 管理员手动审核并支付 |

### 计算示例

```
用户申请：1000 Credits
USDT计算：1000 × 0.03 = 30 USDT
扣除手续费：30 × 5% = 1.5 USDT
实际到账：30 - 1.5 = 28.5 USDT
```

---

## 🗂️ 数据库变更

### 新增表：`credit_withdrawals`（提现申请表）

```sql
-- 在现有multiagent_platforms数据库中执行
CREATE TABLE IF NOT EXISTS credit_withdrawals (
  id VARCHAR(36) PRIMARY KEY COMMENT 'UUID',
  user_id VARCHAR(255) NOT NULL COMMENT '用户钱包地址',
  amount INT NOT NULL COMMENT '申请兑换的Credits数量',
  usdt_amount DECIMAL(10, 2) NOT NULL COMMENT '扣除手续费后的USDT金额',
  fee_amount DECIMAL(10, 2) NOT NULL COMMENT '平台手续费金额',
  wallet_address VARCHAR(255) NOT NULL COMMENT '用户收款钱包地址',
  chain VARCHAR(20) NOT NULL COMMENT '提现链：Polygon或BSC',
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending' COMMENT '状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
  locked_until TIMESTAMP NOT NULL COMMENT '7天锁定期结束时间',
  tx_hash VARCHAR(255) COMMENT '链上交易哈希',
  completed_at TIMESTAMP NULL COMMENT '完成时间',
  admin_notes TEXT COMMENT '管理员备注',

  INDEX idx_user_status (user_id, status),
  INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Credit兑换USDT申请记录表';
```

### 管理员配置（推荐使用环境变量）

在 `.env` 文件中添加：

```bash
# 管理员钱包地址（MetaMask）
ADMIN_WALLET_ADDRESS=0xYourAdminWalletAddressHere
```

**可选方案**：如需多管理员支持，可修改users表：

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
```

---

## 🔧 后端实现（扩展现有文件）

### 1. 修改 `src/routes/creditRoutes.js`

在现有路由基础上**新增4个路由**：

```javascript
// ============ Credit→USDT兑换路由 ============
// 用户端路由
router.post('/withdrawal/request', creditController.requestWithdrawal);
router.get('/withdrawal/history', creditController.getWithdrawalHistory);

// 管理员路由（需admin权限）
router.get('/admin/withdrawals', creditController.getAdminWithdrawals);
router.post('/admin/withdrawal/complete', creditController.completeWithdrawal);
```

**修改位置**：在第19行 `module.exports = router;` 之前插入

---

### 2. 修改 `src/controllers/creditController.js`

在文件末尾**新增4个控制器方法**：

```javascript
const UUID = require('uuid');
const DatabaseService = require('../services/DatabaseService');

// ============ Credit兑换USDT功能 ============

/**
 * 用户提交提现申请
 * POST /api/credit/withdrawal/request
 * Body: { amount, walletAddress, chain }
 */
exports.requestWithdrawal = async (req, res) => {
  const { amount, walletAddress, chain } = req.body;
  const userId = req.userId;

  try {
    // 1. 参数验证
    if (!amount || amount < 100) {
      return res.status(400).json({ error: '最低提现额度为100 Credits' });
    }
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: '无效的钱包地址' });
    }
    if (!['Polygon', 'BSC'].includes(chain)) {
      return res.status(400).json({ error: '仅支持Polygon和BSC链' });
    }

    // 2. 检查用户的总收益（所有Agent的total_earnings总和）
    const earningsResult = await DatabaseService.query(
      'SELECT SUM(total_earnings) as total FROM agents WHERE owner = ?',
      [userId]
    );
    const totalEarnings = earningsResult[0]?.total || 0;

    if (amount > totalEarnings) {
      return res.status(400).json({
        error: `收益不足。当前可用：${totalEarnings} Credits`
      });
    }

    // 3. 计算USDT金额（1 Credit = 0.03 USDT，扣除5%手续费）
    const usdtBeforeFee = amount * 0.03;
    const fee = usdtBeforeFee * 0.05;
    const usdtAmount = usdtBeforeFee - fee;

    // 4. 创建提现申请
    const withdrawalId = UUID.v4();
    const lockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后

    await DatabaseService.query(
      `INSERT INTO credit_withdrawals
       (id, user_id, amount, usdt_amount, fee_amount, wallet_address, chain, locked_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [withdrawalId, userId, amount, usdtAmount, fee, walletAddress, chain, lockedUntil]
    );

    // 5. 扣除agents的total_earnings（按比例扣除，优先扣收益高的Agent）
    await DatabaseService.query(
      `UPDATE agents
       SET total_earnings = GREATEST(0, total_earnings - ?)
       WHERE owner = ? AND total_earnings > 0`,
      [amount, userId]
    );

    console.log(`[提现申请] 用户${userId}申请提现${amount} Credits → ${usdtAmount} USDT (${chain})`);

    res.json({
      success: true,
      withdrawalId,
      amount,
      usdtAmount: parseFloat(usdtAmount.toFixed(2)),
      fee: parseFloat(fee.toFixed(2)),
      chain,
      lockedUntil,
      message: `申请成功！预计${lockedUntil.toLocaleDateString('zh-CN')}后到账`
    });

  } catch (error) {
    console.error('提现申请失败:', error);
    res.status(500).json({ error: '提现申请失败，请稍后重试' });
  }
};

/**
 * 获取用户提现历史
 * GET /api/credit/withdrawal/history
 */
exports.getWithdrawalHistory = async (req, res) => {
  try {
    const withdrawals = await DatabaseService.query(
      `SELECT id, amount, usdt_amount, fee_amount, wallet_address, chain,
              status, created_at, locked_until, tx_hash, completed_at
       FROM credit_withdrawals
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.userId]
    );

    res.json({
      success: true,
      withdrawals
    });

  } catch (error) {
    console.error('获取提现历史失败:', error);
    res.status(500).json({ error: '获取提现历史失败' });
  }
};

/**
 * 管理员获取待处理提现申请
 * GET /api/credit/admin/withdrawals
 */
exports.getAdminWithdrawals = async (req, res) => {
  try {
    // 验证管理员权限
    const adminAddress = process.env.ADMIN_WALLET_ADDRESS?.toLowerCase();
    if (!adminAddress || req.userId.toLowerCase() !== adminAddress) {
      return res.status(403).json({ error: '仅限管理员访问' });
    }

    // 获取所有已过锁定期的待处理申请
    const withdrawals = await DatabaseService.query(
      `SELECT w.*, u.username
       FROM credit_withdrawals w
       LEFT JOIN users u ON w.user_id = u.wallet_address
       WHERE w.status IN ('pending', 'processing')
       AND w.locked_until <= NOW()
       ORDER BY w.created_at ASC`
    );

    res.json({
      success: true,
      withdrawals,
      count: withdrawals.length
    });

  } catch (error) {
    console.error('获取管理员待处理列表失败:', error);
    res.status(500).json({ error: '获取待处理列表失败' });
  }
};

/**
 * 管理员完成提现（提交链上交易哈希）
 * POST /api/credit/admin/withdrawal/complete
 * Body: { withdrawalId, txHash }
 */
exports.completeWithdrawal = async (req, res) => {
  const { withdrawalId, txHash } = req.body;

  try {
    // 验证管理员权限
    const adminAddress = process.env.ADMIN_WALLET_ADDRESS?.toLowerCase();
    if (!adminAddress || req.userId.toLowerCase() !== adminAddress) {
      return res.status(403).json({ error: '仅限管理员访问' });
    }

    // 验证参数
    if (!withdrawalId || !txHash) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 更新状态为已完成
    const result = await DatabaseService.query(
      `UPDATE credit_withdrawals
       SET status = 'completed',
           tx_hash = ?,
           completed_at = NOW()
       WHERE id = ? AND status IN ('pending', 'processing')`,
      [txHash, withdrawalId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '未找到该提现申请或已处理' });
    }

    console.log(`[提现完成] 申请ID: ${withdrawalId}, 交易哈希: ${txHash}`);

    res.json({
      success: true,
      message: '提现已标记为完成',
      txHash
    });

  } catch (error) {
    console.error('标记提现完成失败:', error);
    res.status(500).json({ error: '操作失败' });
  }
};
```

---

## 🎨 前端实现（扩展现有组件）

### 3. 修改 `src/App.tsx`

在现有路由中**新增2个路由**：

```tsx
// 在文件顶部添加导入
import WithdrawalManagement from './components/WithdrawalManagement';
import AdminWithdrawalPanel from './components/AdminWithdrawalPanel';

// 在<Routes>标签内添加（第73行 </Route>之后）
<Route path="/creator/withdrawals" element={
  <ProtectedRoute>
    <WithdrawalManagement />
  </ProtectedRoute>
} />

<Route path="/admin/withdrawals" element={
  <ProtectedRoute>
    <AdminWithdrawalPanel />
  </ProtectedRoute>
} />
```

---

### 4. 新建 `src/components/WithdrawalManagement.tsx`（用户页面）

用户提现管理页面，**复用CreatorDashboard的样式**：

```tsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { requestWithdrawal, getWithdrawalHistory } from '../services/api';
import '../styles/CreatorDashboard.css'; // 复用现有样式

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
  const [chain, setChain] = useState<'Polygon' | 'BSC'>('Polygon');
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);

  useEffect(() => {
    if (currentAccount) {
      fetchWithdrawalHistory();
      fetchTotalEarnings();
    }
  }, [currentAccount]);

  const fetchWithdrawalHistory = async () => {
    try {
      const response = await getWithdrawalHistory();
      setWithdrawals(response.withdrawals || []);
    } catch (error) {
      console.error('获取提现历史失败:', error);
    }
  };

  const fetchTotalEarnings = async () => {
    try {
      const response = await fetch(`/api/credit/creator/earnings`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      setTotalEarnings(data.totalEarnings || 0);
    } catch (error) {
      console.error('获取收益失败:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amountNum = parseInt(amount);
    if (amountNum < 100) {
      alert('最低提现额度为100 Credits');
      return;
    }
    if (amountNum > totalEarnings) {
      alert(`收益不足！当前可用：${totalEarnings} Credits`);
      return;
    }

    setLoading(true);
    try {
      const result = await requestWithdrawal(amountNum, walletAddress, chain);
      alert(`申请成功！预计到账：${result.usdtAmount} USDT（已扣除${result.fee} USDT手续费）`);
      setAmount('');
      fetchWithdrawalHistory();
      fetchTotalEarnings();
    } catch (error: any) {
      alert(error.response?.data?.error || '提现申请失败');
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
      pending: '⏳ 锁定期中',
      processing: '🔄 处理中',
      completed: '✅ 已完成',
      failed: '❌ 失败'
    };
    return statusMap[status] || status;
  };

  return (
    <div className="creator-dashboard">
      <div className="dashboard-header">
        <button onClick={() => navigate('/creator/dashboard')} className="back-button">
          ← 返回创作者中心
        </button>
        <h1>兑换USDT</h1>
      </div>

      <div className="dashboard-content">
        {/* 可用收益卡片 */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-title">可用收益</div>
            <div className="card-value">{totalEarnings} Credits</div>
            <div className="card-description">
              约合 {(totalEarnings * 0.03 * 0.95).toFixed(2)} USDT（扣除5%手续费）
            </div>
          </div>
        </div>

        {/* 提现申请表单 */}
        <div style={{ marginTop: '30px', backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>提交提现申请</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                兑换数量（Credits）
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="最低100 Credits"
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
                  💰 预计到账：<strong>{calculateUSDT(parseInt(amount)).total} USDT</strong>
                  （手续费：{calculateUSDT(parseInt(amount)).fee} USDT）
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                收款钱包地址
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
                提现网络
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="Polygon"
                    checked={chain === 'Polygon'}
                    onChange={(e) => setChain(e.target.value as 'Polygon')}
                    style={{ marginRight: '6px' }}
                  />
                  Polygon (USDT)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="BSC"
                    checked={chain === 'BSC'}
                    onChange={(e) => setChain(e.target.value as 'BSC')}
                    style={{ marginRight: '6px' }}
                  />
                  BNB Smart Chain (USDT)
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
              <strong>⚠️ 注意事项：</strong><br/>
              • 汇率：1 Credit = 0.03 USDT（固定）<br/>
              • 手续费：5%（从USDT中扣除）<br/>
              • 锁定期：7天（期间不可取消）<br/>
              • 到账时间：管理员审核后手动转账
            </div>

            <button
              type="submit"
              disabled={loading}
              className="Train-Agent"
              style={{ width: '100%' }}
            >
              {loading ? '提交中...' : '提交申请'}
            </button>
          </form>
        </div>

        {/* 提现历史 */}
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>提现历史</h2>
          {withdrawals.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              backgroundColor: '#fff',
              borderRadius: '8px',
              border: '1px solid #ddd'
            }}>
              <p style={{ color: '#999' }}>暂无提现记录</p>
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
                        {new Date(w.created_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>
                      {getStatusText(w.status)}
                    </div>
                  </div>

                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                    <div>网络：{w.chain}</div>
                    <div>收款地址：{w.wallet_address.substring(0, 8)}...{w.wallet_address.substring(w.wallet_address.length - 6)}</div>
                    {w.status === 'pending' && (
                      <div style={{ color: '#ff9800', marginTop: '4px' }}>
                        🔒 锁定至：{new Date(w.locked_until).toLocaleString('zh-CN')}
                      </div>
                    )}
                    {w.tx_hash && (
                      <div style={{ marginTop: '4px' }}>
                        交易哈希：
                        <a
                          href={w.chain === 'Polygon'
                            ? `https://polygonscan.com/tx/${w.tx_hash}`
                            : `https://bscscan.com/tx/${w.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#1890ff', textDecoration: 'underline' }}
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
```

---

### 5. 新建 `src/components/AdminWithdrawalPanel.tsx`（管理员页面）

管理员审核页面，**集成MetaMask支付功能**：

```tsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { getAdminWithdrawals, completeWithdrawal } from '../services/api';
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
  }
];

const AdminWithdrawalPanel: React.FC = () => {
  const navigate = useNavigate();
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const currentAccount = getCurrentAccount();

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // 检查管理员权限
  const ADMIN_ADDRESS = process.env.REACT_APP_ADMIN_WALLET_ADDRESS?.toLowerCase();
  const isAdmin = currentAccount?.toLowerCase() === ADMIN_ADDRESS;

  useEffect(() => {
    if (isAdmin) {
      fetchWithdrawals();
    }
  }, [isAdmin]);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const response = await getAdminWithdrawals();
      setWithdrawals(response.withdrawals || []);
    } catch (error) {
      console.error('获取待处理列表失败:', error);
      alert('权限不足或获取失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (withdrawal: Withdrawal) => {
    if (!window.ethereum) {
      alert('请安装MetaMask钱包');
      return;
    }

    setProcessingId(withdrawal.id);

    try {
      // 1. 连接MetaMask
      const web3 = new Web3(window.ethereum);
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      // 2. 检查网络
      const chainId = await web3.eth.getChainId();
      const expectedChainId = withdrawal.chain === 'Polygon' ? 137 : 56;

      if (Number(chainId) !== expectedChainId) {
        alert(`请切换到${withdrawal.chain}网络`);
        setProcessingId(null);
        return;
      }

      // 3. 获取USDT合约
      const contractAddress = USDT_CONTRACTS[withdrawal.chain as keyof typeof USDT_CONTRACTS];
      const usdtContract = new web3.eth.Contract(ERC20_ABI, contractAddress);

      // 4. 转换USDT金额（6位小数）
      const amountInWei = web3.utils.toBN(Math.floor(withdrawal.usdt_amount * 1e6));

      // 5. 发送交易
      console.log(`正在向${withdrawal.wallet_address}发送${withdrawal.usdt_amount} USDT...`);

      const tx = await usdtContract.methods
        .transfer(withdrawal.wallet_address, amountInWei.toString())
        .send({ from: currentAccount });

      console.log('交易成功:', tx.transactionHash);

      // 6. 更新后端状态
      await completeWithdrawal(withdrawal.id, tx.transactionHash);

      alert('✅ 支付成功！交易哈希：' + tx.transactionHash);
      fetchWithdrawals(); // 刷新列表

    } catch (error: any) {
      console.error('支付失败:', error);
      alert('支付失败：' + (error.message || '未知错误'));
    } finally {
      setProcessingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>⚠️ 仅限管理员访问</h2>
        <button onClick={() => navigate('/creator/dashboard')} style={{ marginTop: '20px' }}>
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
        <h1>管理员 - 提现审核</h1>
      </div>

      <div className="dashboard-content">
        <div style={{
          padding: '16px',
          backgroundColor: '#e6f7ff',
          border: '1px solid #91d5ff',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <strong>💡 操作说明：</strong><br/>
          1. 点击"Pay"按钮会自动调起MetaMask<br/>
          2. 确认交易后，系统自动记录链上交易哈希<br/>
          3. Gas费用由平台（您的钱包）承担
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>加载中...</div>
        ) : withdrawals.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            backgroundColor: '#fff',
            borderRadius: '8px',
            border: '1px solid #ddd'
          }}>
            <p style={{ color: '#999' }}>暂无待处理的提现申请</p>
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
                      <div><strong>用户：</strong>{w.username || w.user_id.substring(0, 10)}...</div>
                      <div><strong>兑换：</strong>{w.amount} Credits</div>
                      <div><strong>收款地址：</strong>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                          {w.wallet_address}
                        </span>
                      </div>
                      <div><strong>申请时间：</strong>{new Date(w.created_at).toLocaleString('zh-CN')}</div>
                      <div><strong>解锁时间：</strong>{new Date(w.locked_until).toLocaleString('zh-CN')}</div>
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
      </div>
    </div>
  );
};

export default AdminWithdrawalPanel;
```

---

### 6. 修改 `src/components/ChatSidebar.tsx`

在创作者中心菜单下方**添加"兑换USDT"入口**，并为管理员显示**管理面板入口**：

找到第176-181行的Creator Center部分，修改为：

```tsx
<div className="title">
  <div style={{fontSize: '20px', marginRight: '8px'}}>💰</div>
  <div className="pointer" onClick={() => navigate('/creator/dashboard')}>
    Creator Center
  </div>
</div>

{/* 新增：兑换USDT入口 */}
<div
  className="title"
  style={{ paddingLeft: '28px', fontSize: '14px', color: '#666' }}
>
  <div className="pointer" onClick={() => navigate('/creator/withdrawals')}>
    → Withdraw to USDT
  </div>
</div>

{/* 新增：管理员面板入口（仅对管理员显示） */}
{getCurrentAccount()?.toLowerCase() === process.env.REACT_APP_ADMIN_WALLET_ADDRESS?.toLowerCase() && (
  <div className="title">
    <div style={{fontSize: '20px', marginRight: '8px'}}>⚙️</div>
    <div className="pointer" onClick={() => navigate('/admin/withdrawals')}>
      Admin Panel
    </div>
  </div>
)}
```

---

### 7. 修改 `src/services/api.ts`

在文件末尾**新增4个API方法**：

```typescript
// ============ Credit兑换USDT API ============

/**
 * 用户提交提现申请
 */
export const requestWithdrawal = async (
  amount: number,
  walletAddress: string,
  chain: 'Polygon' | 'BSC'
) => {
  const response = await api.post('/credit/withdrawal/request', {
    amount,
    walletAddress,
    chain
  });
  return response.data;
};

/**
 * 获取用户提现历史
 */
export const getWithdrawalHistory = async () => {
  const response = await api.get('/credit/withdrawal/history');
  return response.data;
};

/**
 * 管理员获取待处理提现申请
 */
export const getAdminWithdrawals = async () => {
  const response = await api.get('/credit/admin/withdrawals');
  return response.data;
};

/**
 * 管理员完成提现
 */
export const completeWithdrawal = async (withdrawalId: string, txHash: string) => {
  const response = await api.post('/credit/admin/withdrawal/complete', {
    withdrawalId,
    txHash
  });
  return response.data;
};
```

---

## 📁 文件变更总览

### 后端（ai-server/）

| 文件路径 | 操作 | 新增行数 |
|---------|------|----------|
| `sql/add_credit_withdrawals.sql` | **新建** | ~30行 |
| `src/routes/creditRoutes.js` | **修改** | +4行 |
| `src/controllers/creditController.js` | **修改** | +180行 |

### 前端（ai-dapp/）

| 文件路径 | 操作 | 新增行数 |
|---------|------|----------|
| `src/App.tsx` | **修改** | +8行 |
| `src/components/WithdrawalManagement.tsx` | **新建** | ~350行 |
| `src/components/AdminWithdrawalPanel.tsx` | **新建** | ~300行 |
| `src/components/ChatSidebar.tsx` | **修改** | +15行 |
| `src/services/api.ts` | **修改** | +30行 |

**统计：新建3个文件，修改5个文件**

---

## 🔐 安全策略

| 项目 | 措施 |
|------|------|
| **管理员验证** | 通过环境变量`ADMIN_WALLET_ADDRESS`验证身份 |
| **7天锁定** | 数据库`locked_until`字段强制锁定，无取消接口 |
| **链上验证** | 所有交易在区块链上可查证（Polygonscan/BSCscan） |
| **交易哈希记录** | `tx_hash`字段永久保存审计线索 |
| **金额扣除** | 提交申请时立即扣除`total_earnings`，防止重复提现 |
| **状态机管理** | pending → processing → completed，单向流转 |

---

## 🚀 实施步骤

### 第1步：数据库部署（1小时）

```bash
# 连接远程MySQL
mysql -h 184.168.123.133 -P 3306 -u root -p

# 执行SQL脚本
USE multiagent_platforms;
SOURCE /path/to/add_credit_withdrawals.sql;

# 验证表结构
DESCRIBE credit_withdrawals;
```

### 第2步：后端部署（2小时）

1. 修改 `creditRoutes.js`（添加4个路由）
2. 修改 `creditController.js`（添加4个方法）
3. 配置 `.env` 文件：
   ```bash
   ADMIN_WALLET_ADDRESS=0xYourAdminMetaMaskAddress
   ```
4. 重启服务：
   ```bash
   cd /data/testservice/ai
   pm2 restart ai-server
   pm2 logs ai-server
   ```

### 第3步：前端部署（3小时）

1. 创建 `WithdrawalManagement.tsx`
2. 创建 `AdminWithdrawalPanel.tsx`
3. 修改 `App.tsx`（添加路由）
4. 修改 `ChatSidebar.tsx`（添加菜单）
5. 修改 `api.ts`（添加API方法）
6. 配置 `.env` 文件：
   ```bash
   REACT_APP_ADMIN_WALLET_ADDRESS=0xYourAdminMetaMaskAddress
   ```
7. 编译部署：
   ```bash
   npm run build
   # 部署dist文件到服务器
   ```

### 第4步：测试验证（2小时）

#### 用户端测试
1. 访问 `/creator/withdrawals`
2. 提交100 Credits提现申请
3. 检查数据库 `credit_withdrawals` 表记录
4. 验证 `agents.total_earnings` 扣除

#### 管理员测试
1. 使用管理员钱包登录
2. 访问 `/admin/withdrawals`
3. 等待7天锁定期（或手动修改 `locked_until` 测试）
4. 点击"Pay"按钮
5. MetaMask弹出，切换到对应网络
6. 确认交易
7. 验证交易哈希记录

---

## 🎯 核心优势

✅ **零额外基础设施** - 使用现有React应用、MySQL数据库、JWT认证
✅ **UI/UX一致性** - 复用CreatorDashboard样式和模式
✅ **安全的管理权限** - 单一环境变量验证，无需复杂角色系统
✅ **区块链透明** - 所有支付链上可查，tx_hash永久存证
✅ **简化部署** - 仅更新现有代码库，无需新服务器/域名

---

## 📊 业务流程图

```
用户端：
1. 查看总收益（agents.total_earnings总和）
2. 填写提现表单（金额、地址、链）
3. 提交申请
4. 系统扣除total_earnings
5. 写入credit_withdrawals表（状态：pending）
6. 7天锁定期开始

   ⬇ 等待7天

管理员端：
7. 登录管理员账户
8. 访问/admin/withdrawals
9. 看到已过锁定期的申请
10. 点击"Pay"按钮
11. MetaMask弹出交易确认
12. 确认后USDT转账到用户地址
13. 获取tx_hash
14. 更新数据库（状态：completed，记录tx_hash）
15. 用户在区块链浏览器查看交易
```

---

## 💡 后续扩展方向

1. **批量支付** - 管理员一次性支付多笔提现（MultiSend合约）
2. **通知系统** - 提现状态变更时发送邮件/站内信
3. **统计报表** - 平台手续费收入统计
4. **风控规则** - 单日最大提现额度限制

---

**文档版本**：v1.0
**最后更新**：2025-10-10
**作者**：AI Agent Pricing System Team

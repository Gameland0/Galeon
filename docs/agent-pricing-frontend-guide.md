# Agent定价系统 - 前端实现指南

## 📋 概述

基于已完成的后端实现，本文档指导如何在前端实现Agent定价系统的用户界面。

**后端状态**: ✅ 100% 完成
**前端状态**: ⏳ 待实现

---

## 🎯 需要实现的功能模块

### 1. AgentDetails页面扩展 (优先级: 高)
- **路由**: 已存在 `/agent/:agentId`
- **文件**: [src/components/AgentDetails.tsx](src/components/AgentDetails.tsx)
- **功能**:
  - 显示Agent价格
  - Owner可以设置价格
  - 显示调用统计和收益

### 2. Creator Dashboard页面 (优先级: 中)
- **路由**: 需要新建 `/creator/dashboard`
- **文件**: 需要创建 `src/components/CreatorDashboard.tsx`
- **功能**:
  - 展示所有Agent的收益
  - 提现功能
  - 收益历史

### 3. ChatSidebar导航扩展 (优先级: 低)
- **文件**: `src/components/ChatSidebar.tsx`
- **功能**:
  - 添加"创建者中心"菜单项

---

## 🔧 第一步: 扩展API Service

### 文件: `src/services/api.ts`

在现有的API方法后添加:

```typescript
// ============ Agent定价系统API ============

/**
 * 设置Agent价格 (Owner Only)
 * @param agentId Agent ID
 * @param price 价格 (credits)
 */
export const setAgentPrice = async (agentId: number, price: number) => {
  const response = await fetch(`${API_BASE_URL}/agents/${agentId}/price`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}` // 假设有getToken函数
    },
    body: JSON.stringify({ price })
  });
  return response.json();
};

/**
 * 获取Agent价格
 * @param agentId Agent ID
 */
export const getAgentPrice = async (agentId: number) => {
  const response = await fetch(`${API_BASE_URL}/agents/${agentId}/price`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });
  return response.json();
};

/**
 * 获取Agent统计信息 (调用次数、收益)
 * @param agentId Agent ID
 */
export const getAgentStats = async (agentId: number) => {
  const response = await fetch(`${API_BASE_URL}/agents/${agentId}/stats`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });
  return response.json();
};

/**
 * 获取创建者总收益
 */
export const getCreatorEarnings = async () => {
  const response = await fetch(`${API_BASE_URL}/credit/creator/earnings`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });
  return response.json();
};

/**
 * 提现收益到buyBalance
 * @param amount 提现金额 (credits)
 */
export const withdrawEarnings = async (amount: number) => {
  const response = await fetch(`${API_BASE_URL}/credit/creator/withdraw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({ amount })
  });
  return response.json();
};
```

---

## 📱 第二步: 扩展AgentDetails页面

### 文件: `src/components/AgentDetails.tsx`

#### 2.1 添加State和数据获取

在现有代码基础上添加:

```typescript
// 在组件顶部添加新的state
const [agentPrice, setAgentPrice] = useState<number>(0);
const [agentStats, setAgentStats] = useState<{ total_calls: number; total_earnings: number }>({
  total_calls: 0,
  total_earnings: 0
});
const [isPriceEditing, setIsPriceEditing] = useState(false);
const [tempPrice, setTempPrice] = useState<string>('0');

// 在 fetchAgentDetails 中添加价格和统计获取
const fetchAgentDetails = async () => {
  if (agentId) {
    try {
      const chainIdRaw = await web3Instance.eth.getChainId();
      const chainId = Number(chainIdRaw);
      const details = await getAgentDetails(Number(agentId), chainId);
      setAgent(details);
      setEditedAgent(details);
      setMcpEnabled(details.mcp_enabled || false);

      // 新增: 获取价格和统计
      const priceData = await getAgentPrice(Number(agentId));
      setAgentPrice(priceData.price || 0);

      const statsData = await getAgentStats(Number(agentId));
      setAgentStats(statsData);
    } catch (error) {
      console.error('Error fetching agent details:', error);
    }
  }
};
```

#### 2.2 添加价格设置UI

在Agent信息显示区域添加价格管理UI:

```tsx
{/* 在现有的Agent信息展示区域内添加 */}
<div className="flex align-items" style={{marginTop: '20px'}}>
  <div><strong style={{marginRight: '8px'}}>价格:</strong></div>
  {isPriceEditing && agent.owner?.toLowerCase() === currentAccount?.toLowerCase() ? (
    <div className="flex align-items">
      <input
        type="number"
        min="0"
        value={tempPrice}
        onChange={(e) => setTempPrice(e.target.value)}
        className="price-input"
        style={{width: '100px', marginRight: '8px'}}
        disabled={isLoading}
      />
      <span style={{marginRight: '8px'}}>Credits</span>
      <button
        className="Save-button"
        disabled={isLoading}
        onClick={handleSavePrice}
        style={{marginRight: '8px', padding: '5px 10px'}}
      >
        保存
      </button>
      <button
        className="Cancel-button"
        disabled={isLoading}
        onClick={() => {
          setIsPriceEditing(false);
          setTempPrice(agentPrice.toString());
        }}
        style={{padding: '5px 10px'}}
      >
        取消
      </button>
    </div>
  ) : (
    <div className="flex align-items">
      <span style={{
        color: agentPrice > 0 ? '#FF6B00' : '#666',
        fontWeight: agentPrice > 0 ? 'bold' : 'normal'
      }}>
        {agentPrice > 0 ? `${agentPrice} Credits/调用` : '免费'}
      </span>
      {agent.owner?.toLowerCase() === currentAccount?.toLowerCase() && (
        <button
          className="edit-price-button"
          onClick={() => {
            setIsPriceEditing(true);
            setTempPrice(agentPrice.toString());
          }}
          disabled={isLoading}
          style={{marginLeft: '10px', padding: '5px 10px'}}
        >
          设置价格
        </button>
      )}
    </div>
  )}
</div>

{/* 添加统计信息显示 */}
{agent.owner?.toLowerCase() === currentAccount?.toLowerCase() && (
  <div style={{marginTop: '30px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px'}}>
    <div style={{fontWeight: 'bold', fontSize: '18px', marginBottom: '10px'}}>
      收益统计
    </div>
    <div className="flex" style={{justifyContent: 'space-around'}}>
      <div className="stat-item" style={{textAlign: 'center'}}>
        <div style={{fontSize: '24px', fontWeight: 'bold', color: '#1890ff'}}>
          {agentStats.total_calls}
        </div>
        <div style={{fontSize: '14px', color: '#666'}}>总调用次数</div>
      </div>
      <div className="stat-item" style={{textAlign: 'center'}}>
        <div style={{fontSize: '24px', fontWeight: 'bold', color: '#52c41a'}}>
          {agentStats.total_earnings}
        </div>
        <div style={{fontSize: '14px', color: '#666'}}>总收益 (Credits)</div>
      </div>
      {agentPrice > 0 && agentStats.total_calls > 0 && (
        <div className="stat-item" style={{textAlign: 'center'}}>
          <div style={{fontSize: '24px', fontWeight: 'bold', color: '#faad14'}}>
            {(agentStats.total_earnings / agentStats.total_calls).toFixed(2)}
          </div>
          <div style={{fontSize: '14px', color: '#666'}}>平均收益/次</div>
        </div>
      )}
    </div>
  </div>
)}
```

#### 2.3 添加价格保存逻辑

```typescript
const handleSavePrice = async () => {
  if (!agent) return;
  setIsLoading(true);

  try {
    const newPrice = parseInt(tempPrice);

    if (isNaN(newPrice) || newPrice < 0) {
      alert('请输入有效的价格（非负整数）');
      setIsLoading(false);
      return;
    }

    // 调用API设置价格
    await setAgentPrice(agent.id, newPrice);

    // 更新本地状态
    setAgentPrice(newPrice);
    setIsPriceEditing(false);

    alert('价格设置成功！');
    setIsLoading(false);
  } catch (error) {
    console.error('Error setting agent price:', error);
    alert('设置价格失败，请重试');
    setIsLoading(false);
  }
};
```

#### 2.4 添加CSS样式

在 `src/styles/AgentDetails.css` 中添加:

```css
.price-input {
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 14px;
}

.price-input:focus {
  border-color: #1890ff;
  outline: none;
}

.edit-price-button {
  background-color: #f0f0f0;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.edit-price-button:hover {
  background-color: #e6e6e6;
  border-color: #40a9ff;
}

.stat-item {
  padding: 10px;
  min-width: 120px;
}
```

---

## 🏠 第三步: 创建Creator Dashboard页面

### 文件: `src/components/CreatorDashboard.tsx`

```tsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { getCreatorEarnings, withdrawEarnings } from '../services/api';
import '../styles/CreatorDashboard.css';

interface AgentEarning {
  id: number;
  name: string;
  price: number;
  totalCalls: number;
  totalEarnings: number;
}

interface EarningsData {
  totalEarnings: number;
  totalCalls: number;
  agents: AgentEarning[];
}

const CreatorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const currentAccount = getCurrentAccount();

  const [earningsData, setEarningsData] = useState<EarningsData>({
    totalEarnings: 0,
    totalCalls: 0,
    agents: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      const data = await getCreatorEarnings();
      setEarningsData(data);
    } catch (error) {
      console.error('Error fetching creator earnings:', error);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseInt(withdrawAmount);

    if (isNaN(amount) || amount <= 0) {
      alert('请输入有效的提现金额');
      return;
    }

    if (amount > earningsData.totalEarnings) {
      alert(`提现金额不能超过总收益 (${earningsData.totalEarnings} Credits)`);
      return;
    }

    setIsLoading(true);

    try {
      const result = await withdrawEarnings(amount);

      if (result.success) {
        alert(`成功提现 ${amount} Credits 到您的账户！`);
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        fetchEarnings(); // 刷新收益数据
      }
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      alert(error.message || '提现失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="creator-dashboard">
      <div className="dashboard-header">
        <Link to="/chat" className="back-button">
          ← 返回聊天
        </Link>
        <h1>创建者中心</h1>
      </div>

      {/* 收益总览 */}
      <div className="earnings-summary">
        <div className="summary-card">
          <div className="card-title">总收益</div>
          <div className="card-value">{earningsData.totalEarnings} Credits</div>
        </div>
        <div className="summary-card">
          <div className="card-title">总调用次数</div>
          <div className="card-value">{earningsData.totalCalls}</div>
        </div>
        <div className="summary-card">
          <div className="card-title">Agent数量</div>
          <div className="card-value">{earningsData.agents.length}</div>
        </div>
      </div>

      {/* 提现按钮 */}
      {earningsData.totalEarnings > 0 && (
        <div className="withdraw-section">
          <button
            className="withdraw-button"
            onClick={() => setShowWithdrawModal(true)}
            disabled={isLoading}
          >
            💰 提现到账户
          </button>
        </div>
      )}

      {/* Agent收益列表 */}
      <div className="agents-earnings-list">
        <h2>各Agent收益明细</h2>
        {earningsData.agents.length === 0 ? (
          <div className="no-earnings">
            <p>您还没有创建任何Agent</p>
            <Link to="/marketplace" className="create-agent-link">
              创建第一个Agent →
            </Link>
          </div>
        ) : (
          <table className="earnings-table">
            <thead>
              <tr>
                <th>Agent名称</th>
                <th>价格</th>
                <th>调用次数</th>
                <th>总收益</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {earningsData.agents.map((agent) => (
                <tr key={agent.id}>
                  <td>{agent.name}</td>
                  <td>
                    {agent.price > 0
                      ? `${agent.price} Credits`
                      : '免费'}
                  </td>
                  <td>{agent.totalCalls}</td>
                  <td className="earnings-amount">
                    {agent.totalEarnings} Credits
                  </td>
                  <td>
                    <Link
                      to={`/agent/${agent.id}`}
                      className="view-details-link"
                    >
                      查看详情 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 提现模态框 */}
      {showWithdrawModal && (
        <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>提现收益</h3>
            <div className="modal-body">
              <p>可提现余额: <strong>{earningsData.totalEarnings} Credits</strong></p>
              <input
                type="number"
                min="1"
                max={earningsData.totalEarnings}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="输入提现金额"
                className="withdraw-input"
                disabled={isLoading}
              />
            </div>
            <div className="modal-footer">
              <button
                className="confirm-button"
                onClick={handleWithdraw}
                disabled={isLoading}
              >
                {isLoading ? '处理中...' : '确认提现'}
              </button>
              <button
                className="cancel-button"
                onClick={() => setShowWithdrawModal(false)}
                disabled={isLoading}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatorDashboard;
```

---

### 文件: `src/styles/CreatorDashboard.css`

```css
.creator-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.dashboard-header {
  display: flex;
  align-items: center;
  margin-bottom: 30px;
}

.dashboard-header h1 {
  margin-left: 20px;
  font-size: 28px;
  font-weight: bold;
}

.back-button {
  padding: 8px 16px;
  background-color: #f0f0f0;
  border-radius: 4px;
  text-decoration: none;
  color: #333;
}

.back-button:hover {
  background-color: #e6e6e6;
}

/* 收益总览卡片 */
.earnings-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.summary-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.summary-card:nth-child(2) {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.summary-card:nth-child(3) {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.card-title {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 10px;
}

.card-value {
  font-size: 36px;
  font-weight: bold;
}

/* 提现按钮 */
.withdraw-section {
  text-align: center;
  margin-bottom: 40px;
}

.withdraw-button {
  background-color: #52c41a;
  color: white;
  border: none;
  padding: 15px 40px;
  font-size: 18px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.withdraw-button:hover {
  background-color: #45a617;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(82, 196, 26, 0.4);
}

.withdraw-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
  transform: none;
}

/* Agent收益列表 */
.agents-earnings-list h2 {
  font-size: 22px;
  margin-bottom: 20px;
}

.no-earnings {
  text-align: center;
  padding: 60px 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.no-earnings p {
  font-size: 18px;
  color: #666;
  margin-bottom: 20px;
}

.create-agent-link {
  display: inline-block;
  padding: 12px 24px;
  background-color: #1890ff;
  color: white;
  text-decoration: none;
  border-radius: 4px;
}

.create-agent-link:hover {
  background-color: #40a9ff;
}

/* 收益表格 */
.earnings-table {
  width: 100%;
  border-collapse: collapse;
  background-color: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.earnings-table thead {
  background-color: #fafafa;
}

.earnings-table th {
  padding: 16px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e8e8e8;
}

.earnings-table td {
  padding: 16px;
  border-bottom: 1px solid #e8e8e8;
}

.earnings-table tbody tr:hover {
  background-color: #f5f5f5;
}

.earnings-amount {
  font-weight: bold;
  color: #52c41a;
}

.view-details-link {
  color: #1890ff;
  text-decoration: none;
}

.view-details-link:hover {
  text-decoration: underline;
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  padding: 30px;
  border-radius: 12px;
  min-width: 400px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-content h3 {
  margin-bottom: 20px;
  font-size: 22px;
}

.modal-body {
  margin-bottom: 25px;
}

.modal-body p {
  margin-bottom: 15px;
  font-size: 16px;
}

.withdraw-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 16px;
}

.withdraw-input:focus {
  border-color: #1890ff;
  outline: none;
}

.modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.confirm-button,
.cancel-button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
}

.confirm-button {
  background-color: #52c41a;
  color: white;
}

.confirm-button:hover {
  background-color: #45a617;
}

.confirm-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.cancel-button {
  background-color: #f0f0f0;
  color: #333;
}

.cancel-button:hover {
  background-color: #e6e6e6;
}
```

---

## 🛣️ 第四步: 添加路由

### 文件: `src/App.tsx`

在Routes中添加Creator Dashboard路由:

```tsx
import CreatorDashboard from './components/CreatorDashboard';

// 在Routes内添加
<Route path="/creator/dashboard" element={
  <ProtectedRoute>
    <CreatorDashboard />
  </ProtectedRoute>
} />
```

---

## 📍 第五步: 添加导航入口 (可选)

### 文件: `src/components/ChatSidebar.tsx`

在现有导航菜单中添加:

```tsx
{/* 在现有菜单项后添加 */}
<Link to="/creator/dashboard" className="menu-item">
  <div className="menu-icon">💰</div>
  <div className="menu-text">创建者中心</div>
</Link>
```

---

## 🎨 UI/UX设计建议

### 1. 价格显示规范

```tsx
// 免费Agent
<span style={{color: '#52c41a'}}>免费</span>

// 付费Agent
<span style={{color: '#FF6B00', fontWeight: 'bold'}}>
  {price} Credits/调用
</span>
```

### 2. 收益展示颜色

- 总收益: `#52c41a` (绿色)
- 调用次数: `#1890ff` (蓝色)
- 平均收益: `#faad14` (橙色)

### 3. 用户提示

```tsx
// 设置价格时
{agentPrice > 0 && (
  <div className="price-tip">
    💡 提示: 用户需要使用购买的Credits才能调用付费Agent
  </div>
)}

// 提现时
{earningsData.totalEarnings > 0 && (
  <div className="withdraw-tip">
    ℹ️ 提现后的Credits将添加到您的buyBalance，可用于购买或调用付费Agent
  </div>
)}
```

---

## ✅ 实现检查清单

### AgentDetails页面
- [ ] 显示Agent价格（所有用户可见）
- [ ] Owner可以编辑价格
- [ ] 显示调用统计（total_calls）
- [ ] 显示总收益（total_earnings）
- [ ] 价格设置时的验证（非负整数）
- [ ] 加载状态和错误处理

### Creator Dashboard页面
- [ ] 显示总收益
- [ ] 显示总调用次数
- [ ] 显示所有Agent列表
- [ ] 每个Agent的收益明细
- [ ] 提现功能
- [ ] 提现金额验证
- [ ] 提现成功后刷新数据

### ChatSidebar导航
- [ ] 添加"创建者中心"菜单项
- [ ] 菜单项链接到 `/creator/dashboard`

### API集成
- [ ] setAgentPrice 调用成功
- [ ] getAgentPrice 正确显示
- [ ] getAgentStats 正确显示
- [ ] getCreatorEarnings 正确获取
- [ ] withdrawEarnings 正确提现

---

## 🧪 测试用例

### 测试1: 设置Agent价格

1. 作为Agent owner登录
2. 访问 `/agent/1`
3. 点击"设置价格"
4. 输入 `10`
5. 点击"保存"
6. 验证价格显示为 "10 Credits/调用"

### 测试2: 查看收益统计

1. 创建一个价格为5的Agent
2. 让其他用户调用该Agent 3次
3. 访问 `/agent/:agentId`
4. 验证统计:
   - 总调用次数: 3
   - 总收益: 15 Credits

### 测试3: 提现收益

1. 访问 `/creator/dashboard`
2. 验证总收益显示正确
3. 点击"提现到账户"
4. 输入提现金额
5. 确认提现
6. 验证buyBalance增加

---

## 🚀 部署建议

1. **逐步发布**:
   - 第一阶段: 只发布AgentDetails价格显示
   - 第二阶段: 添加价格设置功能
   - 第三阶段: 发布Creator Dashboard

2. **A/B测试**:
   - 对比有定价功能和无定价功能的Agent使用率
   - 收集用户反馈

3. **监控指标**:
   - 付费Agent的数量
   - 平均价格
   - 提现频率
   - 创建者收益分布

---

## 📞 常见问题

### Q: 如何获取JWT Token?

A: 通常在登录时保存到localStorage:
```typescript
const getToken = () => localStorage.getItem('authToken');
```

### Q: API调用失败怎么办?

A: 添加错误处理:
```typescript
try {
  const result = await setAgentPrice(agentId, price);
} catch (error) {
  if (error.status === 403) {
    alert('只有Agent所有者可以设置价格');
  } else if (error.status === 400) {
    alert('价格无效');
  } else {
    alert('设置失败，请重试');
  }
}
```

---

**文档版本**: v1.0
**最后更新**: 2025-01-09

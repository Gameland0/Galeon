# Agent定价系统 - 实际项目实施方案

> 基于现有项目代码结构的完整实施指南

---

## 📊 项目现状分析

### 当前路由结构（App.tsx）
```typescript
/login              → Login组件
/                   → 重定向到 /chat
/chat               → Chat组件（主页面，包含ChatSidebar）
/marketplace        → AgentMarketplace组件
/agent/:agentId     → AgentDetails组件（查看/编辑Agent）
/team-management    → TeamManagement组件
/game-marketplace   → GameMarketplace组件
/game/:gameId       → GameDetail组件
```

### 现有页面架构分析

#### 1. Chat页面（主界面）
```
/chat
├── ChatSidebar（左侧边栏）
│   ├── Logo
│   ├── 钱包状态（MetaMask/Phantom）
│   ├── Your Agents（用户的Agent列表）
│   ├── Show Marketplace（市场切换）
│   ├── Game Marketplace（游戏市场）
│   └── Your Teams（团队列表）
├── ChatMessages（聊天消息区）
└── ChatInput（输入框）
```

**关键发现**：
- ❌ **没有独立的用户Dashboard页面**
- ❌ **没有个人中心或收益管理入口**
- ✅ ChatSidebar只显示钱包连接状态，没有用户信息管理
- ✅ 所有导航都在ChatSidebar中完成

#### 2. AgentDetails页面（Agent详情）
```
/agent/:agentId
├── Back to Chat按钮
├── Agent信息展示区
│   ├── 头像、名称
│   ├── Description
│   ├── Public状态
│   ├── Type、Model、Chain
│   └── 智能检索状态（RAG）
├── 操作按钮（仅Owner可见）
│   ├── Make Public/Private
│   ├── Delete Agent
│   ├── Edit Agent（切换编辑模式）
│   └── Train Agent
├── Training History（训练历史）
└── MCP Configuration（MCP配置）
```

**关键发现**：
- ✅ AgentDetails页面已有完整的Agent信息展示
- ✅ 已有编辑模式（isEditing状态）
- ✅ Owner权限判断：`agent.owner?.toLowerCase() === currentAccount?.toLowerCase()`
- ❌ **没有价格设置功能**
- ❌ **没有收益统计展示**

---

## 🎯 功能设计方案

### 方案1: 扩展AgentDetails页面（推荐）

**优势**：
- 符合现有代码架构
- 无需新建页面和路由
- 用户习惯：在Agent详情页设置价格最自然

**实施方案**：

#### 1.1 在AgentDetails页面添加定价区块

```typescript
// AgentDetails.tsx 新增部分

// 添加状态
const [agentPrice, setAgentPrice] = useState<number>(0);
const [isEditingPrice, setIsEditingPrice] = useState(false);
const [tempPrice, setTempPrice] = useState<number>(0);

// 在Agent信息展示区添加价格展示
<div className="agent-info">
  {/* ...现有的Agent信息... */}

  {/* 新增：价格展示 */}
  <div className="flex align-items" style={{marginTop: '20px'}}>
    <div><strong style={{marginRight: '8px'}}>价格:</strong>
      {agentPrice > 0 ? (
        <span>{agentPrice} credits/次 (≈ ${(agentPrice * 0.04).toFixed(2)} USD)</span>
      ) : (
        <span style={{color: '#52c41a'}}>🎁 免费</span>
      )}
    </div>
  </div>

  {/* 新增：收益统计（仅Owner可见）*/}
  {agent.owner?.toLowerCase() === currentAccount?.toLowerCase() && (
    <div style={{
      background: '#f6ffed',
      border: '1px solid #b7eb8f',
      borderRadius: '8px',
      padding: '16px',
      marginTop: '20px'
    }}>
      <div style={{fontWeight: 'bold', marginBottom: '8px'}}>💰 收益统计</div>
      <div>总调用次数: {agent.total_calls || 0}</div>
      <div>总收益: {agent.total_earnings || 0} credits (≈ ${((agent.total_earnings || 0) * 0.03).toFixed(2)} USDT)</div>
    </div>
  )}
</div>

{/* Owner操作区：添加"设置价格"按钮 */}
{agent.owner?.toLowerCase() === currentAccount?.toLowerCase() && (
  <div className="button-group">
    {/* ...现有按钮... */}
    <button
      disabled={isLoading}
      onClick={() => setIsEditingPrice(true)}
      className={isLoading? 'edit-button disabled':'edit-button'}
    >
      设置价格
    </button>
  </div>
)}

{/* 价格编辑Modal */}
{isEditingPrice && (
  <div className="modal-overlay">
    <div className="modal-content">
      <h3>设置Agent价格</h3>

      <div style={{marginBottom: '16px'}}>
        <label>调用价格（credits/次）</label>
        <input
          type="number"
          value={tempPrice}
          onChange={(e) => setTempPrice(parseInt(e.target.value) || 0)}
          min={0}
          placeholder="输入价格（0表示免费）"
        />
      </div>

      <div style={{marginBottom: '16px'}}>
        <label>
          <input
            type="radio"
            checked={tempPrice === 0}
            onChange={() => setTempPrice(0)}
          />
          免费Agent (0 credits)
        </label>
        <label>
          <input
            type="radio"
            checked={tempPrice > 0}
            onChange={() => setTempPrice(10)}
          />
          付费Agent
        </label>
      </div>

      {tempPrice > 0 && (
        <div style={{background: '#fff7e6', padding: '12px', borderRadius: '4px', marginBottom: '16px'}}>
          用户需支付: {tempPrice} credits (≈ ${(tempPrice * 0.04).toFixed(2)} USD)<br/>
          您将获得: {tempPrice} credits (≈ ${(tempPrice * 0.03).toFixed(2)} USDT提现)
        </div>
      )}

      <div style={{display: 'flex', gap: '8px'}}>
        <button onClick={handleSavePrice}>保存</button>
        <button onClick={() => setIsEditingPrice(false)}>取消</button>
      </div>
    </div>
  </div>
)}
```

---

### 方案2: 新建Creator Dashboard页面（推荐用于收益管理）

**为什么需要Dashboard**：
- AgentDetails页面适合单个Agent的价格设置
- 但创建者需要一个统一的收益管理中心
- 查看所有Agent的收益、申请提现等

**新增路由**：
```typescript
// App.tsx
<Route path="/creator/dashboard" element={
  <ProtectedRoute>
    <CreatorDashboard />
  </ProtectedRoute>
} />
```

**在ChatSidebar添加入口**：
```typescript
// ChatSidebar.tsx

<div className="title">
  <img src={icon_Creator} alt="" />
  <div className="pointer" onClick={() => navigate('/creator/dashboard')}>
    创建者中心
  </div>
</div>
```

#### Dashboard页面结构

```typescript
// CreatorDashboard.tsx

const CreatorDashboard: React.FC = () => {
  return (
    <div className="creator-dashboard">
      {/* 顶部导航 */}
      <div className="dashboard-header">
        <Link to="/chat" className="back-button">← Back to Chat</Link>
        <h2>创建者中心</h2>
      </div>

      {/* 收益概览卡片 */}
      <div className="earnings-overview">
        <div className="stat-card">
          <div className="stat-label">总收益</div>
          <div className="stat-value">12,580 credits</div>
          <div className="stat-sub">≈ $377.40 USDT</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">可提现</div>
          <div className="stat-value">8,420 credits</div>
          <button className="withdraw-btn">提现</button>
        </div>
        <div className="stat-card">
          <div className="stat-label">提现中</div>
          <div className="stat-value">2,000 credits</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">已提现</div>
          <div className="stat-value">2,160 credits</div>
        </div>
      </div>

      {/* 我的Agent列表（带收益） */}
      <div className="my-agents-section">
        <h3>我的Agents</h3>
        <table className="agents-table">
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
            {myAgents.map(agent => (
              <tr key={agent.id}>
                <td>{agent.name}</td>
                <td>{agent.price > 0 ? `${agent.price} credits` : '免费'}</td>
                <td>{agent.total_calls}</td>
                <td>{agent.total_earnings} credits</td>
                <td>
                  <Link to={`/agent/${agent.id}`}>详情</Link>
                  <button onClick={() => handleEditPrice(agent.id)}>设置价格</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 收益明细 */}
      <div className="earnings-transactions">
        <h3>收益明细</h3>
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>Agent</th>
              <th>用户</th>
              <th>金额</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id}>
                <td>{new Date(tx.created_at).toLocaleString()}</td>
                <td>{tx.agentName}</td>
                <td>{tx.userId.slice(0,6)}...{tx.userId.slice(-4)}</td>
                <td>+{tx.amount} credits</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 提现记录 */}
      <div className="withdrawal-history">
        <h3>提现记录</h3>
        <table>
          <thead>
            <tr>
              <th>申请时间</th>
              <th>Credits</th>
              <th>USDT金额</th>
              <th>状态</th>
              <th>完成时间</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.map(w => (
              <tr key={w.id}>
                <td>{new Date(w.created_at).toLocaleString()}</td>
                <td>{w.amount}</td>
                <td>${w.usdtAmount.toFixed(2)}</td>
                <td>
                  <span className={`status-${w.status}`}>
                    {statusMap[w.status]}
                  </span>
                </td>
                <td>{w.completed_at ? new Date(w.completed_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

---

## 📁 完整文件清单

### 后端新增/修改文件

#### 新增文件（6个）
```
ai-server/
├── migrations/
│   └── 001_add_pricing_system.sql         # 数据库迁移脚本
├── src/
│   ├── services/
│   │   └── creatorService.js              # 创建者服务（收益、提现）
│   ├── controllers/
│   │   └── creatorController.js           # 创建者控制器
│   └── routes/
│       └── creatorRoutes.js               # 创建者路由
```

#### 修改文件（5个）
```
ai-server/src/
├── services/
│   ├── agentService.js                    # 添加setAgentPrice、getAgentPrice方法
│   ├── creditService.js                   # 添加consumeForAgent方法
│   └── databaseService.js                 # 已有consumeCredits，需扩展支持agent_id
├── controllers/
│   ├── agentController.js                 # 添加setAgentPrice方法
│   └── chatController.js                  # 修改sendMessage集成付费逻辑
├── routes/
│   └── agentRoutes.js                     # 添加PUT /:agentId/price路由
└── app.js (或server.js)                   # 注册creatorRoutes
```

### 前端新增/修改文件

#### 新增文件（2个）
```
ai-dapp/src/
├── components/
│   └── CreatorDashboard.tsx               # 创建者Dashboard页面
└── styles/
    └── CreatorDashboard.css               # Dashboard样式
```

#### 修改文件（5个）
```
ai-dapp/src/
├── App.tsx                                # 添加/creator/dashboard路由
├── components/
│   ├── ChatSidebar.tsx                    # 添加"创建者中心"导航入口
│   ├── AgentDetails.tsx                   # 添加价格设置功能、收益统计
│   └── Chat.tsx (或ChatMessages.tsx)      # 修改消息发送处理余额不足
└── services/
    └── api.ts                             # 添加Creator相关API接口
```

---

## 🔧 详细实施步骤

### Phase 1: 数据库（第1周）

#### Step 1.1: 执行数据库迁移
```bash
cd /Users/css/Desktop/gameland/源码/ai-server
mysql -u root -p your_database < migrations/001_add_pricing_system.sql
```

#### Step 1.2: 验证表结构
```sql
-- 检查agents表是否添加了price字段
DESC agents;

-- 检查新表是否创建成功
SHOW TABLES LIKE 'creator_%';
SHOW TABLES LIKE 'withdrawals';

-- 检查索引
SHOW INDEX FROM agents WHERE Key_name = 'idx_agents_price';
```

---

### Phase 2: 后端Service层（第2周）

#### Step 2.1: 创建creatorService.js
**位置**: `ai-server/src/services/creatorService.js`

**核心方法**：
```javascript
class CreatorService {
  // 1. 初始化创建者账户
  async initializeCreatorAccount(creatorId)

  // 2. 获取创建者账户信息
  async getCreatorAccount(creatorId)

  // 3. 分配收益（事务）
  async allocateEarnings(creatorId, agentId, amount, userId, conversationId)

  // 4. 获取收益概览
  async getEarningsOverview(creatorId)

  // 5. 获取收益明细
  async getEarningsTransactions(creatorId, { page, pageSize, agentId, startDate, endDate })

  // 6. 申请提现
  async requestWithdrawal(creatorId, { amount, usdtAddress, network })

  // 7. 获取提现记录
  async getWithdrawalHistory(creatorId, { page, pageSize })

  // 8. 管理员处理提现
  async processWithdrawal(withdrawalId, txHash)

  // 9. 管理员拒绝提现
  async rejectWithdrawal(withdrawalId, adminNote)
}
```

**完整代码**：见开发计划文档中的`Phase 1: 数据库和Service层 → 1.2 创建CreatorService`

#### Step 2.2: 扩展agentService.js
**位置**: `ai-server/src/services/agentService.js`

**添加方法**：
```javascript
// 在现有AgentService类中添加

// 设置Agent价格
async setAgentPrice(agentId, ownerId, price) {
  const dbOwnerId = this.generateDatabaseUserId(ownerId);

  // 验证所有权
  const agent = await this.query(
    'SELECT * FROM agents WHERE id = ? AND owner = ?',
    [agentId, dbOwnerId]
  );

  if (agent.length === 0) {
    throw new Error('Agent not found or unauthorized');
  }

  // 价格验证
  if (price < 0 || !Number.isInteger(price)) {
    throw new Error('Price must be a non-negative integer');
  }

  await this.query(
    'UPDATE agents SET price = ?, updated_at = NOW() WHERE id = ?',
    [price, agentId]
  );

  console.log(`Agent price updated: agentId=${agentId}, price=${price}`);

  return {
    agentId,
    price,
    updatedAt: new Date().toISOString()
  };
}

// 获取Agent价格
async getAgentPrice(agentId) {
  const result = await this.query(
    'SELECT price FROM agents WHERE id = ?',
    [agentId]
  );

  return result[0]?.price || 0;
}

// 生成数据库用户ID（与creditService保持一致）
generateDatabaseUserId(userId) {
  if (userId.toLowerCase().startsWith('0x')) {
    return userId.toLowerCase();
  }
  if (userId.length > 40) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
    return `sol_${hash}`;
  }
  return userId.toLowerCase();
}

// 添加query方法（如果不存在）
async query(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}
```

**注意**：需要在文件顶部添加：
```javascript
const db = require('../config/database');
const UUID = require('uuid');
```

#### Step 2.3: 扩展creditService.js
**位置**: `ai-server/src/services/creditService.js`

**添加方法**：
```javascript
// 在现有CreditService类中添加

// Agent调用扣费（支持价格）
async consumeForAgent(userId, agentId, price, conversationId) {
  const dbUserId = this.generateDatabaseUserId(userId);

  try {
    await this.query('START TRANSACTION');

    if (price > 0) {
      // 付费Agent：必须使用buyBalance
      const buyBalance = await this.getBuyCredit(userId);

      if (buyBalance < price) {
        throw new Error('INSUFFICIENT_BUY_BALANCE');
      }

      // 扣除buyBalance
      const updateResult = await this.query(
        `UPDATE user_credits
         SET buy_balance = buy_balance - ?,
             last_used_at = NOW()
         WHERE user_id = ? AND buy_balance >= ?`,
        [price, dbUserId, price]
      );

      if (updateResult.affectedRows === 0) {
        throw new Error('INSUFFICIENT_BUY_BALANCE');
      }

      // 记录消费
      await this.query(
        `INSERT INTO credit_consumption (
          id, user_id, amount, type, agent_id, price,
          conversation_id, balance_type, created_at
        ) VALUES (?, ?, ?, 'agent', ?, ?, ?, 'buyBalance', NOW())`,
        [UUID.v4(), dbUserId, price, agentId, price, conversationId]
      );

    } else {
      // 免费Agent：优先buyBalance，其次creditBalance
      const buyBalance = await this.getBuyCredit(userId);
      const creditBalance = await this.getCreditbyId(userId);

      if (buyBalance >= 1) {
        await this.query(
          `UPDATE user_credits
           SET buy_balance = buy_balance - 1,
               last_used_at = NOW()
           WHERE user_id = ?`,
          [dbUserId]
        );

        await this.query(
          `INSERT INTO credit_consumption (
            id, user_id, amount, type, agent_id, price,
            conversation_id, balance_type, created_at
          ) VALUES (?, ?, 1, 'agent', ?, 0, ?, 'buyBalance', NOW())`,
          [UUID.v4(), dbUserId, agentId, conversationId]
        );

      } else if (creditBalance >= 1) {
        await this.query(
          `UPDATE user_credits
           SET credit_balance = credit_balance - 1,
               last_used_at = NOW()
           WHERE user_id = ?`,
          [dbUserId]
        );

        await this.query(
          `INSERT INTO credit_consumption (
            id, user_id, amount, type, agent_id, price,
            conversation_id, balance_type, created_at
          ) VALUES (?, ?, 1, 'agent', ?, 0, ?, 'creditBalance', NOW())`,
          [UUID.v4(), dbUserId, agentId, conversationId]
        );

      } else {
        throw new Error('INSUFFICIENT_CREDITS');
      }
    }

    await this.query('COMMIT');
    console.log(`Credit consumed: user=${dbUserId}, agent=${agentId}, price=${price}`);
    return true;

  } catch (error) {
    await this.query('ROLLBACK');
    console.error('Agent credit consumption failed:', error);
    throw error;
  }
}
```

---

### Phase 3: 后端Controller和Router层（第3周）

#### Step 3.1: 创建creatorController.js
**位置**: `ai-server/src/controllers/creatorController.js`

**完整代码**：见开发计划文档中的`Phase 2: Controller和Router层 → 2.1 创建CreatorController`

#### Step 3.2: 扩展agentController.js
**位置**: `ai-server/src/controllers/agentController.js`

**在文件末尾添加**：
```javascript
// 设置Agent价格
exports.setAgentPrice = async (req, res) => {
  const { agentId } = req.params;
  const { price } = req.body;

  try {
    if (price === undefined || price === null) {
      return res.status(400).json({ error: 'Price is required' });
    }

    const agentService = require('../services/agentService');
    const result = await agentService.setAgentPrice(
      parseInt(agentId),
      req.userId,
      parseInt(price)
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error setting agent price:', error);
    res.status(400).json({ error: error.message });
  }
};
```

#### Step 3.3: 修改chatController.js
**位置**: `ai-server/src/controllers/chatController.js`

**找到`exports.sendMessage`方法，在Agent调用前添加扣费逻辑**：

```javascript
exports.sendMessage = async (req, res) => {
  const { message, agentId, conversationId, chainid } = req.body;
  const userId = req.userId;

  try {
    if (!agentId) {
      // 如果没有选择Agent，使用默认逻辑
      // ... 原有代码
      return;
    }

    // 1. 获取Agent信息和价格
    const agentService = require('../services/agentService');
    const agent = await agentService.getAgentById(agentId);
    const price = agent.price || 0;

    // 2. 扣费（根据价格判断使用哪个balance）
    const CreditService = require('../services/creditService');
    try {
      await CreditService.consumeForAgent(userId, agentId, price, conversationId);
    } catch (creditError) {
      // 余额不足，返回特定错误
      if (creditError.message === 'INSUFFICIENT_BUY_BALANCE') {
        return res.status(402).json({
          error: 'Insufficient buyBalance',
          errorCode: 'INSUFFICIENT_BUY_BALANCE',
          requiredBalance: price
        });
      }
      if (creditError.message === 'INSUFFICIENT_CREDITS') {
        return res.status(402).json({
          error: 'Insufficient credits',
          errorCode: 'INSUFFICIENT_CREDITS'
        });
      }
      throw creditError;
    }

    // 3. 如果是付费Agent，分配收益给创建者
    if (price > 0) {
      const CreatorService = require('../services/creatorService');
      await CreatorService.allocateEarnings(
        agent.owner,
        agentId,
        price,
        userId,
        conversationId
      );
    }

    // 4. 调用Agent（原有逻辑）
    const AIService = require('../services/aiService');
    const response = await AIService.getAgentResponse(agentId, message, context);

    // 5. 保存对话记录（原有逻辑）
    const DatabaseService = require('../services/databaseService');
    await DatabaseService.saveConversation(userId, conversationId, agentId, 'user', message);
    await DatabaseService.saveConversation(userId, conversationId, agentId, 'assistant', response);

    res.json({ success: true, response });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};
```

#### Step 3.4: 创建creatorRoutes.js
**位置**: `ai-server/src/routes/creatorRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const creatorController = require('../controllers/creatorController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// 创建者收益管理
router.get('/earnings/overview', creatorController.getEarningsOverview);
router.get('/earnings/transactions', creatorController.getEarningsTransactions);

// 提现管理
router.post('/withdraw', creatorController.requestWithdrawal);
router.get('/withdraw/history', creatorController.getWithdrawalHistory);

// 管理员接口（需要额外的admin权限中间件）
router.post('/admin/withdraw/process', creatorController.processWithdrawal);
router.post('/admin/withdraw/reject', creatorController.rejectWithdrawal);

module.exports = router;
```

#### Step 3.5: 修改agentRoutes.js
**位置**: `ai-server/src/routes/agentRoutes.js`

**在现有路由后添加**：
```javascript
// 设置Agent价格
router.put('/:agentId/price', agentController.setAgentPrice);
```

#### Step 3.6: 注册路由
**位置**: `ai-server/src/app.js` 或 `server.js`

**找到路由注册区域，添加**：
```javascript
// 注册Creator路由
const creatorRoutes = require('./routes/creatorRoutes');
app.use('/api/creator', creatorRoutes);
```

---

### Phase 4: 前端API层（第4周）

#### Step 4.1: 扩展api.ts
**位置**: `ai-dapp/src/services/api.ts`

**在文件中添加接口定义和方法**：

```typescript
// ============ 类型定义 ============

// 扩展现有Agent接口
export interface AgentWithPrice extends Agent {
  price: number;
  total_calls?: number;
  total_earnings?: number;
}

// 创建者收益概览
export interface CreatorEarningsOverview {
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  totalWithdrawn: number;
  topAgents: Array<{
    agentId: number;
    agentName: string;
    earnings: number;
    callCount: number;
  }>;
}

// 收益交易记录
export interface EarningsTransaction {
  id: string;
  agentId: number;
  agentName: string;
  userId: string;
  amount: number;
  conversationId: string;
  created_at: string;
}

// 提现记录
export interface WithdrawalRecord {
  id: string;
  amount: number;
  usdtAmount: number;
  fee: number;
  usdtAddress: string;
  network: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  txHash?: string;
  created_at: string;
  completed_at?: string;
}

// ============ Agent价格相关API ============

// 设置Agent价格
export const setAgentPrice = async (agentId: number, price: number) => {
  const response = await api.put(`/agents/${agentId}/price`, { price });
  return response.data;
};

// 获取Agent价格（从getAgentDetails中获取，无需单独接口）

// ============ Creator收益相关API ============

// 获取创建者收益概览
export const getCreatorEarningsOverview = async (): Promise<CreatorEarningsOverview> => {
  const response = await api.get('/creator/earnings/overview');
  return response.data.data;
};

// 获取收益明细
export const getCreatorEarningsTransactions = async (params: {
  page?: number;
  pageSize?: number;
  agentId?: number;
  startDate?: string;
  endDate?: string;
}) => {
  const response = await api.get('/creator/earnings/transactions', { params });
  return response.data.data;
};

// 申请提现
export const requestWithdrawal = async (data: {
  amount: number;
  usdtAddress: string;
  network?: string;
}) => {
  const response = await api.post('/creator/withdraw', data);
  return response.data.data;
};

// 获取提现记录
export const getWithdrawalHistory = async (params: {
  page?: number;
  pageSize?: number;
}) => {
  const response = await api.get('/creator/withdraw/history', { params });
  return response.data.data;
};
```

---

### Phase 5: 前端页面开发（第5-6周）

#### Step 5.1: 修改AgentDetails.tsx（添加价格设置）
**位置**: `ai-dapp/src/components/AgentDetails.tsx`

**步骤**：

1. **添加状态变量**（在组件开头）：
```typescript
const [agentPrice, setAgentPrice] = useState<number>(0);
const [isEditingPrice, setIsEditingPrice] = useState(false);
const [tempPrice, setTempPrice] = useState<number>(0);
```

2. **在fetchAgentDetails中获取价格**：
```typescript
const fetchAgentDetails = async () => {
  if (agentId) {
    try {
      const chainIdRaw = await web3Instance.eth.getChainId();
      const chainId = Number(chainIdRaw);
      const details = await getAgentDetails(Number(agentId), chainId);
      setAgent(details);
      setEditedAgent(details);
      setMcpEnabled(details.mcp_enabled || false);

      // 新增：设置价格
      setAgentPrice(details.price || 0);
      setTempPrice(details.price || 0);

    } catch (error) {
      console.error('Error fetching agent details:', error);
    }
  }
};
```

3. **添加价格保存方法**：
```typescript
const handleSavePrice = async () => {
  if (!agent) return;

  try {
    setIsLoading(true);
    await setAgentPrice(agent.id, tempPrice);
    setAgentPrice(tempPrice);
    setIsEditingPrice(false);
    alert('价格设置成功！');
    fetchAgentDetails(); // 刷新数据
  } catch (error: any) {
    console.error('Error setting price:', error);
    alert(error.message || '价格设置失败');
  } finally {
    setIsLoading(false);
  }
};
```

4. **在Agent信息展示区添加价格显示**（找到`<div className="agent-info">`）：

在Model显示之后添加：
```typescript
{/* 价格显示 */}
<div className="flex align-items" style={{marginTop: '20px'}}>
  <div>
    <strong style={{marginRight: '8px'}}>价格:</strong>
    {agentPrice > 0 ? (
      <span style={{color: '#fa8c16'}}>
        {agentPrice} credits/次 (≈ ${(agentPrice * 0.04).toFixed(2)} USD)
      </span>
    ) : (
      <span style={{color: '#52c41a'}}>🎁 免费</span>
    )}
  </div>
</div>

{/* 收益统计（仅Owner可见）*/}
{agent.owner?.toLowerCase() === currentAccount?.toLowerCase() && (
  <div style={{
    background: '#f0f9ff',
    border: '1px solid #91d5ff',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '20px'
  }}>
    <div style={{fontWeight: 'bold', marginBottom: '12px', color: '#0050b3'}}>
      💰 收益统计
    </div>
    <div style={{marginBottom: '8px'}}>
      <strong>总调用次数:</strong> {agent.total_calls || 0}
    </div>
    <div>
      <strong>总收益:</strong> {agent.total_earnings || 0} credits
      <span style={{color: '#666', marginLeft: '8px'}}>
        (≈ ${((agent.total_earnings || 0) * 0.03).toFixed(2)} USDT)
      </span>
    </div>
  </div>
)}
```

5. **在button-group中添加"设置价格"按钮**（找到`<div className="button-group">`）：

在现有按钮之后添加：
```typescript
<button
  disabled={isLoading}
  onClick={() => {
    setTempPrice(agentPrice);
    setIsEditingPrice(true);
  }}
  className={isLoading? 'edit-button disabled':'edit-button'}
>
  设置价格
</button>
```

6. **添加价格编辑Modal**（在return的JSX最后，MCP Configuration之后）：

```typescript
{/* 价格设置Modal */}
{isEditingPrice && (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}
    onClick={() => setIsEditingPrice(false)}
  >
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 style={{marginBottom: '20px'}}>设置Agent价格</h3>

      <div style={{marginBottom: '20px'}}>
        <label style={{display: 'block', marginBottom: '8px', fontWeight: 'bold'}}>
          调用价格（credits/次）
        </label>
        <input
          type="number"
          value={tempPrice}
          onChange={(e) => setTempPrice(parseInt(e.target.value) || 0)}
          min={0}
          placeholder="输入价格（0表示免费）"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
      </div>

      <div style={{marginBottom: '20px'}}>
        <div style={{marginBottom: '12px'}}>
          <label style={{display: 'block', marginBottom: '8px'}}>
            <input
              type="radio"
              checked={tempPrice === 0}
              onChange={() => setTempPrice(0)}
              style={{marginRight: '8px'}}
            />
            免费Agent (0 credits)
          </label>
        </div>
        <div>
          <label style={{display: 'block'}}>
            <input
              type="radio"
              checked={tempPrice > 0}
              onChange={() => setTempPrice(10)}
              style={{marginRight: '8px'}}
            />
            付费Agent
          </label>
        </div>
      </div>

      {tempPrice > 0 && (
        <div style={{
          background: '#fff7e6',
          border: '1px solid #ffd591',
          borderRadius: '4px',
          padding: '12px',
          marginBottom: '20px',
          fontSize: '13px'
        }}>
          <div style={{marginBottom: '4px'}}>
            💳 用户需支付: <strong>{tempPrice} credits</strong> (≈ ${(tempPrice * 0.04).toFixed(2)} USD)
          </div>
          <div>
            💰 您将获得: <strong>{tempPrice} credits</strong> (≈ ${(tempPrice * 0.03).toFixed(2)} USDT提现)
          </div>
        </div>
      )}

      <div style={{
        background: '#f0f2f5',
        padding: '12px',
        borderRadius: '4px',
        marginBottom: '20px',
        fontSize: '12px',
        color: '#666'
      }}>
        💡 说明：<br />
        • 设置为0即为免费Agent<br />
        • 付费Agent只能使用buyBalance<br />
        • 价格为整数，建议1-1000 credits
      </div>

      <div style={{display: 'flex', gap: '12px'}}>
        <button
          onClick={handleSavePrice}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '10px',
            background: '#1890ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.6 : 1
          }}
        >
          {isLoading ? '保存中...' : '保存'}
        </button>
        <button
          onClick={() => setIsEditingPrice(false)}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '10px',
            background: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          取消
        </button>
      </div>
    </div>
  </div>
)}
```

7. **导入新的API方法**（在文件顶部import区域）：
```typescript
import {
  getAgentDetails,
  updateAgent,
  getAgentKnowledge,
  deleteAgent,
  toggleAgentPublicity,
  getAgentEnhancedInfo,
  setAgentPrice  // 新增
} from '../services/api';
```

#### Step 5.2: 创建CreatorDashboard.tsx
**位置**: `ai-dapp/src/components/CreatorDashboard.tsx`

**完整代码**：（篇幅较长，见附录A）

#### Step 5.3: 修改ChatSidebar.tsx（添加导航入口）
**位置**: `ai-dapp/src/components/ChatSidebar.tsx`

**步骤**：

1. **导入useNavigate**（如果未导入）：
```typescript
import { Link, useNavigate } from 'react-router-dom';
```

2. **添加图标导入**（在现有图标导入后）：
```typescript
import icon_Creator from '../image/icon_Creator.png'; // 需要准备图标
```

3. **在sidebar中添加"创建者中心"入口**（在Game Marketplace之后）：

```typescript
{/* 创建者中心入口 */}
<div className="title">
  <img src={icon_Creator} alt="" />
  <div className="pointer" onClick={() => !isLoading && navigate('/creator/dashboard')}>
    创建者中心
  </div>
</div>
```

#### Step 5.4: 修改App.tsx（添加路由）
**位置**: `ai-dapp/src/App.tsx`

**步骤**：

1. **导入CreatorDashboard组件**：
```typescript
import CreatorDashboard from './components/CreatorDashboard';
```

2. **在Routes中添加路由**（在现有路由之后）：
```typescript
<Route path="/creator/dashboard" element={
  <ProtectedRoute>
    <CreatorDashboard />
  </ProtectedRoute>
} />
```

#### Step 5.5: 修改ChatMessages或Chat组件（处理余额不足）
**位置**: `ai-dapp/src/components/ChatMessages.tsx` 或 `ChatInput.tsx`

**找到发送消息的方法，添加错误处理**：

```typescript
const handleSendMessage = async () => {
  try {
    setLoading(true);
    const response = await sendMessage(message, chainId, selectedAgentId, conversationId);
    // ... 处理响应
  } catch (error: any) {
    // 处理余额不足错误
    if (error.response?.status === 402) {
      const errorCode = error.response.data.errorCode;

      if (errorCode === 'INSUFFICIENT_BUY_BALANCE') {
        const requiredBalance = error.response.data.requiredBalance;

        if (window.confirm(
          `余额不足！\n\n` +
          `需要：${requiredBalance} credits\n` +
          `当前buyBalance不足\n\n` +
          `是否前往充值？`
        )) {
          // 跳转到充值页面（如果有）或提示
          window.open('/pricing', '_blank'); // 根据实际充值页面路径调整
        }
      } else if (errorCode === 'INSUFFICIENT_CREDITS') {
        alert('Credits余额不足，请充值');
      }
    } else {
      console.error('Error sending message:', error);
      alert(error.message || '发送失败');
    }
  } finally {
    setLoading(false);
  }
};
```

---

## 📅 开发时间表

| 周次 | 任务 | 交付物 |
|------|------|--------|
| **Week 1** | 数据库迁移 | 6个表创建完成、索引建立 |
| **Week 2** | 后端Service层 | creatorService.js、扩展agentService.js、扩展creditService.js |
| **Week 3** | 后端Controller和Router | 3个Controller、3个Router、路由注册 |
| **Week 4** | 前端API层 | api.ts扩展、TypeScript类型定义 |
| **Week 5** | 前端AgentDetails页面 | 价格设置功能、收益统计展示 |
| **Week 6** | 前端Dashboard页面 | CreatorDashboard组件、路由配置、导航入口 |
| **Week 7** | 测试和优化 | 端到端测试、性能优化、Bug修复 |
| **Week 8** | 上线部署 | 生产环境部署、监控配置 |

---

## 🧪 测试清单

### 后端测试

- [ ] Agent价格设置：非Owner无法设置
- [ ] Agent价格设置：价格为负数时报错
- [ ] 免费Agent调用：优先扣除buyBalance
- [ ] 免费Agent调用：buyBalance不足时扣除creditBalance
- [ ] 付费Agent调用：buyBalance充足时扣费成功
- [ ] 付费Agent调用：buyBalance不足时返回402错误
- [ ] 付费Agent调用：创建者收益实时到账
- [ ] 提现申请：少于100 credits时失败
- [ ] 提现申请：余额不足时失败
- [ ] 提现申请：成功后余额锁定
- [ ] 数据库事务：扣费失败时回滚

### 前端测试

- [ ] AgentDetails：价格显示正确
- [ ] AgentDetails：收益统计仅Owner可见
- [ ] AgentDetails：非Owner看不到"设置价格"按钮
- [ ] 价格设置Modal：输入验证
- [ ] 价格设置Modal：保存成功后刷新显示
- [ ] Dashboard：收益概览数据正确
- [ ] Dashboard：我的Agent列表完整
- [ ] Dashboard：收益明细分页正常
- [ ] 提现Modal：最低金额验证
- [ ] 提现Modal：地址格式验证
- [ ] ChatSidebar："创建者中心"入口正常跳转
- [ ] Chat：余额不足时弹窗提示

---

## 📦 部署清单

### 数据库
- [ ] 生产数据库备份
- [ ] 执行迁移脚本
- [ ] 验证表结构和索引
- [ ] 初始化创建者账户（现有Agent创建者）

### 后端
- [ ] 代码合并到主分支
- [ ] 环境变量配置检查
- [ ] 依赖包安装
- [ ] 服务重启
- [ ] API健康检查
- [ ] 日志监控配置

### 前端
- [ ] 准备icon_Creator.png图标
- [ ] 代码构建（npm run build）
- [ ] 上传到服务器/CDN
- [ ] 清除浏览器缓存
- [ ] 页面功能验证

---

## 🚨 关键注意事项

### 1. 与现有代码的集成点

**AgentDetails页面**：
- ✅ 已有Owner权限判断逻辑，直接复用
- ✅ 已有编辑模式和保存逻辑，参考实现价格保存
- ✅ 已有MCP Configuration区块，价格设置放在Agent信息区即可

**ChatController**：
- ⚠️ 需要确认现有sendMessage方法的签名和逻辑
- ⚠️ 确保不破坏现有的Team调用逻辑
- ⚠️ 扣费应该在AI调用之前，失败不应该调用AI

**CreditService**：
- ✅ 已有generateDatabaseUserId方法，直接复用
- ✅ 已有事务处理逻辑，参考实现
- ⚠️ consumeForAgent和现有useCredit方法的关系需要明确

### 2. 数据一致性保证

**事务边界**：
```
开始事务
├── 扣除用户buyBalance
├── 创建收益记录
├── 更新创建者账户
├── 更新Agent统计
└── 提交事务
```

**失败回滚**：任何一步失败都必须回滚整个事务

### 3. 性能优化建议

- Agent列表查询时一次性获取price字段，避免N+1查询
- Dashboard统计数据考虑Redis缓存（5分钟）
- 收益明细分页大小建议20-50条
- 提现记录考虑只查询最近6个月

---

## 📝 附录

### 附录A: CreatorDashboard完整代码

见下一条消息（代码过长）

### 附录B: 数据库迁移SQL

见开发计划文档中的`数据库改造方案`章节

### 附录C: 图标准备清单

需要准备的图标文件：
- `icon_Creator.png` - 创建者中心图标（建议使用💰或👨‍💻emoji导出）

---

**文档版本**: v2.0（基于实际项目代码架构）
**最后更新**: 2025-01-15
**下次审查**: 开发完成后

# Agent定价功能文档

## 1. 功能概述

Agent定价功能允许创建者为自己创建的Agent设置使用价格，用户在调用付费Agent时需要消耗相应的credits（buyBalance），创建者可以获得收益并提现。

## 2. 核心规则

### 2.1 定价规则
- 创建者可以自由设置Agent价格（整数credits）
- 价格范围：0或正整数（0表示免费，>0表示付费）
- 不限制定价上限，由市场调节
- 价格单位：credits/次调用

### 2.2 支付规则
- **免费Agent（price = 0）**：
  - 优先使用buyBalance（1 credit）
  - buyBalance不足时使用creditBalance（1 credit）

- **付费Agent（price > 0）**：
  - **必须使用buyBalance**
  - 不允许使用creditBalance
  - buyBalance不足时调用失败，提示充值

### 2.3 收益规则
- 用户调用付费Agent时，创建者实时获得credits收益
- 收益100%进入创建者账户（平台不从调用中抽成）
- 创建者可以将credits提现为USDT

### 2.4 提现规则
- 兑换比例：1 credit = 0.03 USDT
- 平台手续费：2%
- 最低提现：100 credits
- 结算周期：T+7（申请后7天到账）
- 提现方式：USDT（链上转账）

## 3. 功能模块

### 3.1 创建者端功能

#### 3.1.1 设置Agent价格
**入口**：Agent管理页面 → 编辑Agent → 定价设置

**界面设计**：
```
┌─────────────────────────────────────┐
│ Agent定价设置                        │
├─────────────────────────────────────┤
│                                     │
│ 调用价格                             │
│ ┌─────────────┐                     │
│ │    10       │ credits/次          │
│ └─────────────┘                     │
│                                     │
│ ○ 免费Agent（0 credits）            │
│ ● 付费Agent                         │
│                                     │
│ 💡 说明：                            │
│ • 设置为0即为免费Agent               │
│ • 付费Agent只能使用buyBalance        │
│ • 价格为整数，建议1-1000 credits     │
│                                     │
│ [ 取消 ]  [ 保存价格 ]               │
└─────────────────────────────────────┘
```

**API接口**：
```typescript
// 设置Agent价格
PUT /api/agents/:agentId/price
Request: {
  price: number  // 整数，0或正整数
}
Response: {
  success: true,
  data: {
    agentId: string,
    price: number,
    updatedAt: string
  }
}
```

#### 3.1.2 收益管理
**入口**：个人中心 → 创建者收益

**界面设计**：
```
┌─────────────────────────────────────┐
│ 我的创建者收益                       │
├─────────────────────────────────────┤
│                                     │
│ 总收益                               │
│ 12,580 credits                      │
│ ≈ $377.40 USDT                      │
│                                     │
│ 可提现                               │
│ 8,420 credits                       │
│ ≈ $252.60 USDT                      │
│                                     │
│ [ 提现 ]                             │
│                                     │
├─────────────────────────────────────┤
│ 收益Agent排行                        │
├─────────────────────────────────────┤
│ 1. AI Code Assistant                │
│    5,230 credits  |  2,145次调用    │
│                                     │
│ 2. 小红书文案大师                     │
│    2,890 credits  |  1,423次调用    │
│                                     │
│ 3. Excel数据分析                     │
│    1,460 credits  |  365次调用      │
└─────────────────────────────────────┘
```

**API接口**：
```typescript
// 获取创建者收益概览
GET /api/creator/earnings/overview
Response: {
  success: true,
  data: {
    totalEarnings: number,      // 总收益
    availableBalance: number,   // 可提现余额
    pendingBalance: number,     // 提现中
    totalWithdrawn: number,     // 已提现
    topAgents: [{
      agentId: string,
      agentName: string,
      earnings: number,
      callCount: number
    }]
  }
}

// 获取收益明细
GET /api/creator/earnings/transactions
Query: {
  page: number,
  pageSize: number,
  agentId?: string,
  startDate?: string,
  endDate?: string
}
Response: {
  success: true,
  data: {
    total: number,
    transactions: [{
      id: string,
      agentId: string,
      agentName: string,
      userId: string,
      amount: number,
      timestamp: string,
      conversationId: string
    }]
  }
}
```

#### 3.1.3 提现功能
**入口**：创建者收益 → 提现

**界面设计**：
```
┌─────────────────────────────────────┐
│ 提现到USDT                           │
├─────────────────────────────────────┤
│                                     │
│ 可提现余额                           │
│ 8,420 credits                       │
│                                     │
│ 提现数量                             │
│ ┌─────────────┐                     │
│ │    5000     │ credits             │
│ └─────────────┘                     │
│                                     │
│ 到账金额                             │
│ 147.00 USDT（扣除2%手续费）          │
│                                     │
│ USDT接收地址（TRC20）                │
│ ┌───────────────────────────────┐  │
│ │ TXxx...xxxx                    │  │
│ └───────────────────────────────┘  │
│                                     │
│ 💡 说明：                            │
│ • 兑换比例：1 credit = 0.03 USDT    │
│ • 平台手续费：2%                     │
│ • 最低提现：100 credits             │
│ • 到账时间：申请后7个工作日          │
│                                     │
│ [ 取消 ]  [ 确认提现 ]               │
└─────────────────────────────────────┘
```

**API接口**：
```typescript
// 申请提现
POST /api/creator/withdraw
Request: {
  amount: number,        // 提现credits数量
  usdtAddress: string,   // USDT接收地址（TRC20）
  network: 'TRC20'       // 网络类型
}
Response: {
  success: true,
  data: {
    withdrawId: string,
    amount: number,
    usdtAmount: number,    // 实际到账USDT
    fee: number,           // 手续费
    status: 'pending',     // 状态：pending/processing/completed/failed
    createdAt: string,
    estimatedArrival: string  // 预计到账时间
  }
}

// 查询提现记录
GET /api/creator/withdraw/history
Response: {
  success: true,
  data: {
    withdrawals: [{
      id: string,
      amount: number,
      usdtAmount: number,
      fee: number,
      usdtAddress: string,
      status: string,
      createdAt: string,
      completedAt?: string,
      txHash?: string  // 链上交易哈希
    }]
  }
}
```

### 3.2 用户端功能

#### 3.2.1 查看Agent价格
**展示位置**：
- Agent列表页：显示价格标签
- Agent详情页：显示详细价格信息
- 对话页面：顶部显示当前Agent价格

**界面设计（Agent卡片）**：
```
┌─────────────────────────────────────┐
│ 🤖 AI Code Assistant                │
│                                     │
│ 帮你写代码、debug、代码审查          │
│                                     │
│ 👤 creator123  |  ⭐ 4.8  |  1.2k用 │
│                                     │
│ 💳 10 credits/次                    │
│ ≈ $0.4 USDT                         │
│                                     │
│ [ 立即使用 ]                         │
└─────────────────────────────────────┘
```

**界面设计（对话页面）**：
```
┌─────────────────────────────────────┐
│ ← AI Code Assistant                 │
│ 💳 10 credits/次  |  余额: 850 ▼    │
├─────────────────────────────────────┤
│                                     │
│ 对话内容...                          │
│                                     │
└─────────────────────────────────────┘
```

#### 3.2.2 调用付费Agent
**流程**：
1. 用户点击发送消息
2. 系统检查buyBalance是否充足
3. 充足：扣费 → 调用Agent → 返回结果
4. 不足：弹窗提示充值

**余额不足提示**：
```
┌─────────────────────────────────────┐
│ ⚠️  余额不足                         │
├─────────────────────────────────────┤
│                                     │
│ 当前余额：5 credits                  │
│ 需要：10 credits                     │
│ 差额：5 credits                      │
│                                     │
│ 请充值buyBalance后继续使用           │
│                                     │
│ [ 稍后 ]  [ 去充值 ]                 │
└─────────────────────────────────────┘
```

**API接口**：
```typescript
// 调用Agent（内部逻辑）
POST /api/agents/:agentId/invoke
Request: {
  message: string,
  conversationId?: string
}

// 内部处理流程：
async function invokeAgent(userId, agentId, message) {
  // 1. 获取Agent信息
  const agent = await getAgent(agentId);
  const price = agent.price;

  // 2. 获取用户余额
  const userCredit = await getUserCredit(userId);

  // 3. 根据价格判断扣费逻辑
  if (price > 0) {
    // 付费Agent：必须使用buyBalance
    if (userCredit.buyBalance < price) {
      throw new Error('INSUFFICIENT_BUY_BALANCE');
    }
    // 扣除buyBalance
    await deductBuyBalance(userId, price);

    // 分配收益给创建者
    await allocateEarnings(agent.creatorId, agentId, price, userId);

  } else {
    // 免费Agent：优先buyBalance，其次creditBalance
    if (userCredit.buyBalance >= 1) {
      await deductBuyBalance(userId, 1);
    } else if (userCredit.creditBalance >= 1) {
      await deductCreditBalance(userId, 1);
    } else {
      throw new Error('INSUFFICIENT_CREDITS');
    }
  }

  // 4. 调用Agent
  const response = await callAgentAPI(agent, message);

  // 5. 记录调用
  await recordUsage(userId, agentId, price, conversationId);

  return response;
}
```

#### 3.2.3 消费记录
**入口**：个人中心 → 消费记录

**界面设计**：
```
┌─────────────────────────────────────┐
│ 我的消费记录                         │
├─────────────────────────────────────┤
│ 筛选：[全部] [付费] [免费]           │
├─────────────────────────────────────┤
│ 2024-01-15 14:30                    │
│ AI Code Assistant                   │
│ -10 credits (buyBalance)            │
│                                     │
│ 2024-01-15 12:15                    │
│ 小红书文案大师                       │
│ -5 credits (buyBalance)             │
│                                     │
│ 2024-01-15 09:20                    │
│ 免费聊天助手                         │
│ -1 credit (creditBalance)           │
│                                     │
│ [ 加载更多 ]                         │
└─────────────────────────────────────┘
```

**API接口**：
```typescript
// 获取消费记录
GET /api/user/usage-history
Query: {
  page: number,
  pageSize: number,
  type?: 'paid' | 'free',
  startDate?: string,
  endDate?: string
}
Response: {
  success: true,
  data: {
    total: number,
    records: [{
      id: string,
      agentId: string,
      agentName: string,
      price: number,
      balanceType: 'buyBalance' | 'creditBalance',
      timestamp: string,
      conversationId: string
    }]
  }
}
```

## 4. 数据库设计

### 4.1 Agent表扩展
```sql
-- 在现有agents表中添加price字段
ALTER TABLE agents ADD COLUMN price INTEGER DEFAULT 0;

-- 添加索引
CREATE INDEX idx_agents_price ON agents(price);
CREATE INDEX idx_agents_creator_price ON agents(creator_id, price);
```

### 4.2 创建者收益表
```sql
CREATE TABLE creator_earnings (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(36) NOT NULL,
  agent_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  amount INTEGER NOT NULL,
  conversation_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (creator_id) REFERENCES users(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_creator_earnings_creator (creator_id, created_at),
  INDEX idx_creator_earnings_agent (agent_id, created_at)
);
```

### 4.3 创建者账户表
```sql
CREATE TABLE creator_accounts (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(36) UNIQUE NOT NULL,
  total_earnings INTEGER DEFAULT 0,
  available_balance INTEGER DEFAULT 0,
  pending_balance INTEGER DEFAULT 0,
  total_withdrawn INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (creator_id) REFERENCES users(id)
);
```

### 4.4 提现记录表
```sql
CREATE TABLE withdrawals (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(36) NOT NULL,
  amount INTEGER NOT NULL,
  usdt_amount DECIMAL(10, 2) NOT NULL,
  fee DECIMAL(10, 2) NOT NULL,
  usdt_address VARCHAR(100) NOT NULL,
  network VARCHAR(20) DEFAULT 'TRC20',
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  tx_hash VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  FOREIGN KEY (creator_id) REFERENCES users(id),
  INDEX idx_withdrawals_creator (creator_id, created_at),
  INDEX idx_withdrawals_status (status, created_at)
);
```

### 4.5 调用记录表扩展
```sql
-- 在现有usage_logs表中添加价格字段
ALTER TABLE usage_logs ADD COLUMN price INTEGER DEFAULT 0;
ALTER TABLE usage_logs ADD COLUMN balance_type ENUM('buyBalance', 'creditBalance') DEFAULT 'buyBalance';

-- 添加索引
CREATE INDEX idx_usage_logs_user_time ON usage_logs(user_id, created_at);
CREATE INDEX idx_usage_logs_agent_time ON usage_logs(agent_id, created_at);
```

## 5. 业务流程

### 5.1 定价流程
```
创建者设置价格
     ↓
验证价格（整数，≥0）
     ↓
更新Agent价格
     ↓
前端实时更新显示
```

### 5.2 付费调用流程
```
用户发送消息
     ↓
检查Agent价格
     ↓
price > 0？
     ├─ 是 → 检查buyBalance
     │         ↓
     │      充足？
     │      ├─ 是 → 扣除buyBalance
     │      │        ↓
     │      │     分配收益给创建者
     │      │        ↓
     │      │     调用Agent
     │      │        ↓
     │      │     返回结果
     │      │
     │      └─ 否 → 提示充值
     │
     └─ 否 → 检查余额
               ↓
            buyBalance ≥ 1？
            ├─ 是 → 扣buyBalance(1)
            └─ 否 → 扣creditBalance(1)
                     ↓
                  调用Agent
                     ↓
                  返回结果
```

### 5.3 收益分配流程
```
用户调用付费Agent
     ↓
扣除用户buyBalance
     ↓
创建收益记录
     ↓
更新创建者账户
  - total_earnings += amount
  - available_balance += amount
     ↓
实时到账完成
```

### 5.4 提现流程
```
创建者申请提现
     ↓
验证提现条件
  - 金额≥100 credits
  - available_balance充足
  - USDT地址格式正确
     ↓
创建提现记录（pending）
     ↓
锁定余额
  - available_balance -= amount
  - pending_balance += amount
     ↓
后台审核（1-2工作日）
     ↓
审核通过 → 状态改为processing
     ↓
链上转账USDT
     ↓
转账成功
  - 状态改为completed
  - pending_balance -= amount
  - total_withdrawn += amount
  - 记录tx_hash
     ↓
用户收到USDT（T+7）
```

## 6. 风险控制

### 6.1 防止套利
**风险**：用户购买credits后自己调用自己的Agent套现
**控制措施**：
- 提现比例（0.03 USDT/credit）低于购买成本（~0.04-0.05 USDT/credit）
- 提现2%手续费
- T+7结算周期
- 监控异常调用模式（自己调用自己）

### 6.2 防止刷量
**风险**：创建者通过机器人刷调用量虚增收益
**控制措施**：
- 监控调用频率异常
- 检测同IP/设备重复调用
- 人工审核大额提现
- 设置单日提现上限

### 6.3 防止滥用免费credits
**风险**：用户用免费creditBalance调用付费Agent
**控制措施**：
- 严格规则：price > 0必须用buyBalance
- 代码层面强制校验
- 前端明确提示

### 6.4 价格审核
**措施**：
- 不限制定价上限（市场调节）
- 监控异常高价Agent（如>1000 credits）
- 用户评价和举报机制
- 保留平台下架权利

## 7. 关键指标（KPI）

### 7.1 创建者指标
- 付费Agent数量
- 平均定价
- 总收益
- 提现率
- 收益Top Agent

### 7.2 用户指标
- 付费Agent调用次数
- 付费转化率（免费→付费）
- 人均消费credits
- 复购率

### 7.3 平台指标
- GMV（总交易额）
- 提现手续费收入
- 付费Agent占比
- 平台利润率

## 8. 开发计划

### Phase 1：基础功能（2周）
- [ ] Agent价格设置功能
- [ ] 付费调用逻辑
- [ ] 收益分配系统
- [ ] 数据库设计和迁移

### Phase 2：创建者功能（2周）
- [ ] 创建者收益管理页面
- [ ] 收益明细查询
- [ ] 提现申请功能
- [ ] 提现记录查询

### Phase 3：用户体验（1周）
- [ ] Agent价格展示优化
- [ ] 余额不足提示
- [ ] 消费记录页面
- [ ] 价格筛选和排序

### Phase 4：风控和运营（1周）
- [ ] 异常监控系统
- [ ] 提现审核后台
- [ ] 数据统计Dashboard
- [ ] 测试和上线

**总计：6周**

## 9. 技术要点

### 9.1 原子性保证
```javascript
// 使用数据库事务确保扣费和分配收益的原子性
async function chargeAndAllocate(userId, agentId, price) {
  const transaction = await db.beginTransaction();

  try {
    // 1. 扣除用户buyBalance
    await deductBuyBalance(userId, price, transaction);

    // 2. 增加创建者收益
    await allocateEarnings(creatorId, agentId, price, userId, transaction);

    // 3. 记录调用日志
    await recordUsage(userId, agentId, price, transaction);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

### 9.2 并发控制
```javascript
// 使用乐观锁防止余额并发问题
UPDATE creator_accounts
SET available_balance = available_balance + ${amount},
    version = version + 1
WHERE creator_id = ${creatorId}
  AND version = ${currentVersion};

// 影响行数为0说明version已变化，需要重试
```

### 9.3 缓存策略
```javascript
// Agent价格缓存（Redis）
const cacheKey = `agent:${agentId}:price`;
const cachedPrice = await redis.get(cacheKey);

if (cachedPrice !== null) {
  return parseInt(cachedPrice);
}

const price = await db.query('SELECT price FROM agents WHERE id = ?', [agentId]);
await redis.setex(cacheKey, 3600, price); // 缓存1小时
return price;
```

## 10. FAQ

### Q1: 为什么付费Agent不能用creditBalance？
**A**: 防止用户用免费credits调用付费Agent，导致平台补贴创建者收益，造成亏损。

### Q2: 提现比例为什么是0.03而不是0.1？
**A**:
- 用户购买成本：~0.04-0.05 USDT/credit
- 提现比例0.1会导致套利（买0.05卖0.1）
- 提现比例0.03确保平台和用户都不亏损

### Q3: 为什么提现要T+7？
**A**:
- 防止恶意刷量后立即提现
- 给平台审核和风控时间
- 减少资金压力

### Q4: 创建者收益何时到账？
**A**: 用户调用付费Agent时，收益实时到达创建者账户的available_balance，可随时申请提现。

### Q5: 免费Agent消费1 credit是扣创建者的吗？
**A**: 不是。免费Agent的credit成本由平台承担（用户的buyBalance或creditBalance），创建者不获得收益。

---

**文档版本**: v1.0
**最后更新**: 2024-01-15
**维护者**: Product Team

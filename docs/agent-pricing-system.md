# Agent创建者定价系统 - 产品功能文档

**版本：** V1.0
**日期：** 2025-10-08
**状态：** 待开发

---

## 📋 目录

1. [产品概述](#产品概述)
2. [核心设计原则](#核心设计原则)
3. [功能模块详细设计](#功能模块详细设计)
4. [数据库设计](#数据库设计)
5. [API接口规范](#api接口规范)
6. [前端页面设计](#前端页面设计)
7. [业务流程](#业务流程)
8. [风险控制](#风险控制)
9. [技术架构](#技术架构)
10. [开发计划](#开发计划)
11. [关键指标](#关键指标)

---

## 产品概述

### 1.1 产品目标

构建一个完整的Agent创造者经济生态系统，让开发者可以：
- 自由为Agent设置价格
- 获得用户使用收益
- 将收益提现为USDT

让用户可以：
- 使用优质付费Agent
- 清晰了解消费明细
- 安全便捷的支付体验

### 1.2 核心价值主张

**对开发者：**
- 💰 创造价值即获得收益
- 🎯 完全自主的定价权
- 💵 收益直接变现USDT

**对用户：**
- ✨ 使用高质量付费Agent
- 🔒 严格的支付保障机制
- 📊 透明的消费记录

**对平台：**
- 💼 可持续的商业模式（2%提现手续费）
- 📈 激活创造者生态
- 🛡️ 完善的风控体系

### 1.3 商业模式

```
【资金流转】
用户充值 → buyBalance → 使用Agent → 创建者收益 → 提现USDT

【平台收入】
- 提现手续费：2%
- 充值套餐差价（可选）

【汇率体系】
用户购买：
- Basic: 100 credits = $4.99 (≈$0.05/credit)
- Pro: 500 credits = $19.99 (≈$0.04/credit)
- Dev: 1,500 credits = $49.99 (≈$0.033/credit)

开发者提现：
- 1 credit = $0.03 USDT
- 扣除2%手续费后到账
```

---

## 核心设计原则

### 2.1 定价规则

```
✅ 完全自由定价
- 开发者可设置任意价格（整数credits）
- 范围：0 ~ 999,999 credits
- 随时修改，立即生效
- 平台不干预定价（除非恶意）
```

### 2.2 支付规则（核心防护）

```
🔒 严格的支付规则（防薅羊毛）

price > 0 的Agent：
→ 必须100% buyBalance支付
→ buyBalance不足 → 拒绝使用
→ 禁止使用免费creditBalance

price = 0 的Agent：
→ 优先扣buyBalance
→ buyBalance不足时扣creditBalance
→ 开发者无收益

【设计原因】
防止用户用免费额度使用付费Agent套利
保护开发者收益来源
确保平台可持续运营
```

### 2.3 余额体系

```
📊 双余额系统

buyBalance（购买额度）：
- 用户充值获得
- 可用于所有Agent
- 付费Agent必须用此支付
- 不会重置

creditBalance（免费额度）：
- 每周自动发放20
- 仅能用于免费Agent
- 每周一重置为20
- 不可提现
```

### 2.4 收益分配

```
💰 实时结算

用户使用付费Agent：
1. 用户支付 X credits (buyBalance)
2. 创建者立即到账 X credits
3. 平台不抽成（消费环节）
4. 记录收益明细

创建者提现：
1. credits → USDT（1 credit = $0.03）
2. 扣除2%手续费
3. 转账到钱包地址
4. T+1或T+7到账
```

---

## 功能模块详细设计

### 3.1 Agent定价管理

#### 3.1.1 创建者定价权限

**功能描述：**
Agent所有者可以自由设置和修改Agent价格

**功能点：**
- ✅ 创建Agent时设置初始价格（默认0）
- ✅ 随时修改价格，立即生效
- ✅ 价格必须为整数credits
- ✅ 价格历史记录追踪
- ✅ 定价参考建议（显示同类Agent平均价）

**界面设计：**

创建/编辑Agent页面：
```
┌─────────────────────────────┐
│ 设置Agent定价               │
├─────────────────────────────┤
│ 价格（credits/次）：        │
│ [5] credits                 │
│                             │
│ 💡 定价建议                 │
│ 同类Agent平均价格: 3       │
│ 市场价格区间: 1-10         │
│                             │
│ ⚠️ 注意事项                │
│ • 价格必须为整数            │
│ • 修改后立即生效            │
│ • 可随时调整                │
│                             │
│ [保存] [取消]               │
└─────────────────────────────┘
```

价格历史页面：
```
┌─────────────────────────────┐
│ 📈 价格调整历史             │
├─────────────────────────────┐
│ 2025-10-08 14:30           │
│ 5 credits → 3 credits      │
│                             │
│ 2025-10-05 09:15           │
│ 8 credits → 5 credits      │
│                             │
│ 2025-10-01 10:00           │
│ 创建Agent: 8 credits       │
└─────────────────────────────┘
```

**API接口：**
```javascript
// 设置价格
PUT /api/agents/:agentId/price
{
  "price": 5
}

// 查询价格
GET /api/agents/:agentId/price
Response: {
  "price": 5,
  "currency": "credits"
}

// 价格历史
GET /api/agents/:agentId/price-history
Response: {
  "history": [
    {
      "oldPrice": 5,
      "newPrice": 3,
      "changedAt": "2025-10-08T14:30:00Z"
    }
  ]
}
```

#### 3.1.2 价格展示

**Marketplace列表展示：**
```
免费Agent：
┌─────────────────────┐
│ 📝 AI翻译助手       │
│ 快速准确的翻译服务  │
│ 🎁 免费             │
│ ⭐ 4.8 | 1.2k使用  │
└─────────────────────┘

付费Agent：
┌─────────────────────┐
│ 🔍 代码审查专家     │
│ 专业的代码质量分析  │
│ 💰 5 credits       │
│ ⭐ 4.9 | 856使用   │
└─────────────────────┘
```

**Agent详情页展示：**
```
┌─────────────────────────────┐
│ 🔍 AI代码审查专家           │
├─────────────────────────────┤
│ 💰 价格: 5 credits/次       │
│                             │
│ 📊 使用统计                 │
│ • 总使用次数: 856          │
│ • 本周使用: 127            │
│ • 用户满意度: 4.9/5        │
│                             │
│ ✨ 功能特点                 │
│ • 代码质量深度分析          │
│ • 安全漏洞检测              │
│ • 性能优化建议              │
│                             │
│ [开始使用 - 5 credits]     │
└─────────────────────────────┘
```

### 3.2 严格支付系统

#### 3.2.1 支付前检查

**检查流程：**
```
用户点击发送消息
    ↓
前端调用检查API
    ↓
查询Agent价格
    ↓
检查用户buyBalance
    ↓
price > 0 且 buyBalance < price？
    ↓ Yes                ↓ No
弹出余额不足提示    弹出确认使用
```

**余额不足提示：**
```
┌─────────────────────────────┐
│ ⚠️ buyBalance余额不足       │
├─────────────────────────────┤
│ 使用此Agent需要：           │
│ 💰 5 buyBalance            │
│                             │
│ 你的当前余额：              │
│ 💰 2 buyBalance ❌         │
│ 🎁 18 creditBalance        │
│   （免费额度不可用于付费    │
│    Agent）                  │
│                             │
│ 💡 提示                     │
│ 付费Agent必须使用购买额度   │
│                             │
│ [立即购买Credits]           │
│ [返回选择免费Agent]         │
└─────────────────────────────┘
```

**确认使用弹窗：**
```
┌─────────────────────────────┐
│ 💬 确认使用Agent            │
├─────────────────────────────┤
│ Agent: AI代码审查专家       │
│ 价格: 5 credits            │
│                             │
│ 💰 你的余额                 │
│ buyBalance: 15 credits     │
│                             │
│ 📊 使用后余额               │
│ buyBalance: 10 credits     │
│                             │
│ [确认使用] [取消]           │
└─────────────────────────────┘
```

#### 3.2.2 后端扣费逻辑

**核心代码逻辑：**
```javascript
async function chargeForAgent(userId, agentId, conversationId) {
  // 1. 开始事务
  await db.beginTransaction();

  try {
    // 2. 查询Agent价格
    const agent = await getAgentById(agentId);
    const price = agent.price;

    // 3. 查询用户余额
    const credits = await getUserCredit(userId);

    // 4. 根据价格执行不同逻辑
    if (price > 0) {
      // 付费Agent：严格检查buyBalance
      if (credits.buyBalance < price) {
        throw new Error('Insufficient buyBalance');
      }

      // 扣除buyBalance
      await deductBuyBalance(userId, price);

      // 分配收益给创建者
      await allocateEarnings(agent.owner, agentId, price, userId, conversationId);

    } else {
      // 免费Agent：优先buyBalance
      if (credits.buyBalance >= 1) {
        await deductBuyBalance(userId, 1);
      } else if (credits.creditBalance >= 1) {
        await deductCreditBalance(userId, 1);
      } else {
        throw new Error('Insufficient credits');
      }
    }

    // 5. 记录使用
    await recordUsage({
      userId,
      agentId,
      price,
      paymentType: price > 0 ? 'buyBalance' : 'mixed',
      conversationId
    });

    // 6. 提交事务
    await db.commit();

    return { success: true };

  } catch (error) {
    // 回滚事务
    await db.rollback();
    throw error;
  }
}

// 分配收益函数
async function allocateEarnings(creatorId, agentId, amount, sourceUserId, conversationId) {
  const earningId = UUID.v4();

  // 记录创建者收益
  await db.query(`
    INSERT INTO creator_earnings
    (id, agent_id, creator_id, amount, source_user_id, conversation_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `, [earningId, agentId, creatorId, amount, sourceUserId, conversationId]);

  console.log(`Earnings allocated: creator=${creatorId}, amount=${amount}`);
}
```

#### 3.2.3 支付安全保障

**余额锁定机制：**
```javascript
async function useAgentWithLock(userId, agentId, message) {
  const price = await getAgentPrice(agentId);

  // 1. 锁定余额
  const lockId = await lockCredits(userId, price);

  try {
    // 2. 调用AI处理
    const response = await callAI(agentId, message);

    // 3. AI成功，正式扣费
    await deductCredits(userId, price);
    await allocateEarnings(creatorId, price);

    // 4. 释放锁
    await unlockCredits(lockId);

    return response;

  } catch (error) {
    // AI失败，释放锁定（不扣费）
    await unlockCredits(lockId);
    throw error;
  }
}
```

### 3.3 用户消费体验

#### 3.3.1 余额展示

**顶部导航栏（简化版）：**
```
┌────────────────────────────────────┐
│ 🏠 Logo    💰 25 credits  👤 User │
└────────────────────────────────────┘
点击展开：
┌─────────────────────┐
│ 💰 我的Credits      │
├─────────────────────┤
│ buyBalance: 15     │
│ creditBalance: 10  │
│                     │
│ [充值] [明细]      │
└─────────────────────┘
```

**个人中心（完整版）：**
```
┌─────────────────────────────┐
│ 💰 我的Credits余额          │
├─────────────────────────────┤
│ 购买额度                    │
│ 💰 15 buyBalance           │
│ • 可用于所有Agent           │
│ • 付费Agent必须使用此余额   │
│                             │
│ 免费额度                    │
│ 🎁 10 creditBalance        │
│ • 每周一重置为20            │
│ • 仅可用于免费Agent         │
│ • 剩余5天重置               │
│                             │
│ [购买Credits]               │
│ [查看使用记录]              │
└─────────────────────────────┘
```

#### 3.3.2 消费记录

**记录列表页：**
```
┌─────────────────────────────────────┐
│ 📋 消费记录                         │
│ [全部] [付费] [免费] [导出]        │
├─────────────────────────────────────┤
│ 2025-10-08 14:30                   │
│ 🔍 AI代码审查专家                  │
│ 💰 消费: 5 buyBalance              │
│ 对话ID: #abc123 [查看对话]        │
├─────────────────────────────────────┤
│ 2025-10-08 10:15                   │
│ 📝 AI翻译助手（免费）              │
│ 🎁 消费: 1 creditBalance           │
│ 对话ID: #def456 [查看对话]        │
├─────────────────────────────────────┤
│ 2025-10-07 16:20                   │
│ ✍️ 文案生成器                      │
│ 💰 消费: 3 buyBalance              │
│ 对话ID: #ghi789 [查看对话]        │
└─────────────────────────────────────┘

统计汇总：
本月消费: 128 credits
- buyBalance: 95 credits
- creditBalance: 33 credits
```

**记录详情：**
```
┌─────────────────────────────┐
│ 消费详情 #abc123            │
├─────────────────────────────┤
│ Agent信息                   │
│ 名称: AI代码审查专家        │
│ 创建者: 0x1234...5678      │
│                             │
│ 消费信息                    │
│ 价格: 5 credits            │
│ 支付方式: buyBalance       │
│ 时间: 2025-10-08 14:30     │
│                             │
│ 对话内容                    │
│ 用户: 请帮我审查这段代码... │
│ AI: 代码分析如下...        │
│                             │
│ [返回] [举报问题]          │
└─────────────────────────────┘
```

#### 3.3.3 余额预警

**低余额横幅提示：**
```
buyBalance < 10 时显示：
┌─────────────────────────────────────┐
│ ⚠️ 你的buyBalance仅剩8 credits      │
│ 充值后可继续使用付费Agent           │
│ [立即充值] [暂不]                   │
└─────────────────────────────────────┘
```

**余额耗尽弹窗：**
```
buyBalance = 0 时：
┌─────────────────────────────┐
│ 💰 buyBalance已用完         │
├─────────────────────────────┤
│ 你还有 15 creditBalance    │
│ 可继续使用免费Agent         │
│                             │
│ 充值后可使用付费Agent       │
│                             │
│ [充值] [仅用免费Agent]     │
└─────────────────────────────┘
```

### 3.4 创建者收益管理

#### 3.4.1 收益实时分配

**分配逻辑：**
```
用户使用付费Agent
    ↓
扣除用户buyBalance
    ↓
立即分配到创建者账户
    ↓
记录收益明细
```

**数据流：**
```javascript
// 用户支付5 credits
userBuyBalance: 10 → 5

// 创建者收益
creatorEarnings: +5 credits

// 收益记录
{
  id: "uuid",
  agentId: 123,
  creatorId: "0x1234...5678",
  amount: 5,
  sourceUserId: "0xabcd...ef",
  conversationId: "abc123",
  createdAt: "2025-10-08T14:30:00Z"
}
```

#### 3.4.2 创建者仪表板

**首页概览：**
```
┌─────────────────────────────────────┐
│ 📊 创建者仪表板                     │
├─────────────────────────────────────┤
│ 💰 总收益                           │
│    12,580 credits                  │
│    ≈ $377 USDT (提现汇率)          │
│                                     │
│ 📈 今日收益                         │
│    +135 credits                    │
│    📊 较昨日 +23%                   │
│                                     │
│ 📊 本周收益                         │
│    +890 credits                    │
│    📊 较上周 +15%                   │
│                                     │
│ 🔢 总使用次数                       │
│    2,560 次                        │
│                                     │
│ 👥 活跃用户                         │
│    187 人                          │
│                                     │
│ [💸 提现] [📊 详细统计]            │
└─────────────────────────────────────┘
```

**收益趋势图：**
```
┌─────────────────────────────┐
│ 📈 7日收益趋势              │
├─────────────────────────────┤
│ Credits                     │
│ 200│     ▄                  │
│    │    ▄█▄   ▄             │
│ 150│   ▄███  ▄█▄            │
│    │  ▄████ ▄███▄           │
│ 100│ ▄█████▄█████           │
│    │▄███████████████        │
│  50│████████████████▄       │
│    └─────────────────       │
│     Mo Tu We Th Fr Sa Su    │
└─────────────────────────────┘
```

**Agent收益排行：**
```
┌─────────────────────────────┐
│ 🏆 收益排行（本月）         │
├─────────────────────────────┤
│ 1. AI代码审查专家           │
│    💰 3,250 credits        │
│    📊 650次使用             │
│                             │
│ 2. 智能文案生成器           │
│    💰 2,180 credits        │
│    📊 436次使用             │
│                             │
│ 3. 数据分析助手             │
│    💰 1,840 credits        │
│    📊 368次使用             │
└─────────────────────────────┘
```

#### 3.4.3 收益明细

**明细列表：**
```
┌─────────────────────────────────────┐
│ 💸 收益明细                         │
│ [全部] [按Agent] [按时间] [导出]   │
├─────────────────────────────────────┤
│ 2025-10-08 14:30                   │
│ Agent: AI代码审查专家              │
│ 用户: 0xabcd...ef01                │
│ +5 credits                         │
│ 对话: #abc123                      │
├─────────────────────────────────────┤
│ 2025-10-08 12:15                   │
│ Agent: AI代码审查专家              │
│ 用户: 0x7890...1234                │
│ +5 credits                         │
│ 对话: #def456                      │
├─────────────────────────────────────┤
│ 2025-10-08 09:45                   │
│ Agent: 智能文案生成器              │
│ 用户: 0x5678...9abc                │
│ +3 credits                         │
│ 对话: #ghi789                      │
└─────────────────────────────────────┘
```

**筛选功能：**
```
┌─────────────────────────────┐
│ 🔍 筛选收益                 │
├─────────────────────────────┤
│ Agent:                      │
│ [全部Agent ▼]              │
│                             │
│ 时间范围:                   │
│ [2025-10-01] 至 [今天]     │
│                             │
│ 排序:                       │
│ ○ 时间倒序                 │
│ ● 金额从高到低             │
│ ○ 金额从低到高             │
│                             │
│ [应用] [重置]              │
└─────────────────────────────┘
```

#### 3.4.4 提现功能

**提现申请页面：**
```
┌─────────────────────────────────────┐
│ 💸 提现USDT                         │
├─────────────────────────────────────┤
│ 可提现余额                          │
│ 💰 12,580 credits                  │
│                                     │
│ 提现数量                            │
│ [10000] credits                    │
│ [最多12,580] [全部提现]            │
│                                     │
│ ━━━━━━━━━━━━━━━━━━━                 │
│                                     │
│ 💱 汇率计算                         │
│ 1 credit = $0.03 USDT              │
│                                     │
│ 提现价值: $300.00                   │
│ 手续费(2%): -$6.00                 │
│ 实际到账: $294.00 USDT              │
│                                     │
│ ━━━━━━━━━━━━━━━━━━━                 │
│                                     │
│ 接收地址                            │
│ [0x1234567890abcdef...]            │
│ [从钱包粘贴]                        │
│                                     │
│ ⚠️ 提现说明                         │
│ • 最低提现: 100 credits            │
│ • 到账时间: T+7工作日               │
│ • 手续费: 2%                       │
│ • 仅支持USDT (ERC20)               │
│                                     │
│ [确认提现]                          │
└─────────────────────────────────────┘
```

**提现记录：**
```
┌─────────────────────────────────────┐
│ 📜 提现记录                         │
├─────────────────────────────────────┤
│ 2025-10-05 10:30                   │
│ 💰 5,000 credits                   │
│ 💵 $150 → $147 USDT (扣2%手续费)   │
│ 📍 0x1234...5678                   │
│ ✅ 已完成                           │
│ 🔗 TxHash: 0xabcd...ef01           │
│                                     │
│ 2025-09-28 15:20                   │
│ 💰 8,000 credits                   │
│ 💵 $240 → $235.20 USDT             │
│ 📍 0x1234...5678                   │
│ ⏳ 处理中 (预计10月2日到账)        │
│                                     │
│ 2025-09-20 09:15                   │
│ 💰 3,500 credits                   │
│ 💵 $105 → $102.90 USDT             │
│ 📍 0x1234...5678                   │
│ ✅ 已完成                           │
│ 🔗 TxHash: 0x7890...1234           │
└─────────────────────────────────────┘
```

**提现状态追踪：**
```
┌─────────────────────────────┐
│ 📍 提现进度追踪             │
│ 申请编号: WD20251008001     │
├─────────────────────────────┤
│ ✅ 2025-10-08 10:30        │
│    提交申请                 │
│                             │
│ ✅ 2025-10-08 11:00        │
│    平台审核通过             │
│                             │
│ ⏳ 2025-10-15 (预计)       │
│    USDT转账中...           │
│                             │
│ ⏹️ 待到账                  │
│    预计10月15日             │
└─────────────────────────────┘
```

### 3.5 平台管理功能

#### 3.5.1 定价策略支持

**定价参考系统：**
```
创建者设置价格时显示：

┌─────────────────────────────┐
│ 💡 定价建议                 │
├─────────────────────────────┤
│ 你的Agent类型: 代码工具     │
│                             │
│ 市场参考数据:               │
│ • 同类Agent平均价: 5 credits│
│ • 价格中位数: 3 credits     │
│ • 热门价格区间: 2-8         │
│                             │
│ 📊 定价影响预测:            │
│ 定价1: 预计使用量高         │
│ 定价5: 预计使用量中         │
│ 定价20: 预计使用量低        │
└─────────────────────────────┘
```

**价格分布统计（管理后台）：**
```
┌─────────────────────────────┐
│ 📊 市场价格分布             │
├─────────────────────────────┤
│ 免费Agent                   │
│ ████████████ 1,250 (45%)   │
│                             │
│ 1-5 credits                │
│ ████████ 800 (29%)         │
│                             │
│ 6-10 credits               │
│ █████ 450 (16%)            │
│                             │
│ 11-20 credits              │
│ ██ 200 (7%)                │
│                             │
│ 20+ credits                │
│ █ 80 (3%)                  │
│                             │
│ 平均价格: 3.2 credits       │
│ 中位数: 2 credits           │
└─────────────────────────────┘
```

**异常定价预警：**
```
┌─────────────────────────────────────┐
│ ⚠️ 异常定价监控                     │
├─────────────────────────────────────┤
│ 高价低使用 (价格>50 且 使用<10)     │
│                                     │
│ 1. "超级AI助手"                     │
│    价格: 500 credits               │
│    使用: 2次                        │
│    创建者: 0x1234...                │
│    [发送调价提醒] [查看详情]        │
│                                     │
│ 2. "万能助手"                       │
│    价格: 100 credits               │
│    使用: 5次                        │
│    创建者: 0xabcd...                │
│    [发送调价提醒] [查看详情]        │
└─────────────────────────────────────┘
```

#### 3.5.2 运营数据大屏

**核心指标看板：**
```
┌────────────────────────────────────────────┐
│ 📊 平台运营数据看板                        │
├────────────────────────────────────────────┤
│ 今日实时数据                               │
│                                            │
│ 💰 总交易额                                │
│    $1,458                                 │
│    📈 +23% vs 昨日                        │
│                                            │
│ 🔢 交易次数                                │
│    3,456次                                │
│    📈 +15% vs 昨日                        │
│                                            │
│ 👥 活跃用户                                │
│    892人                                  │
│    📊 付费用户: 234 (26%)                 │
│                                            │
│ 💸 手续费收入                              │
│    $12.50                                 │
│    (2%提现手续费)                          │
└────────────────────────────────────────────┘

本月累计
━━━━━━━━━━━━━━━━━━━
GMV: $42,580
提现手续费: $385.20
付费Agent数: 1,350
活跃创建者: 267
```

**用户消费分析：**
```
┌─────────────────────────────┐
│ 👥 用户消费画像             │
├─────────────────────────────┤
│ 大R用户 (月消费>$50)        │
│ 👤 45人 | 贡献GMV: 68%      │
│                             │
│ 中R用户 (月消费$5-50)       │
│ 👥 234人 | 贡献GMV: 25%     │
│                             │
│ 小R用户 (月消费<$5)         │
│ 👥👥 567人 | 贡献GMV: 7%    │
│                             │
│ 白嫖用户 (仅用免费)         │
│ 👥👥👥 1,234人              │
│                             │
│ 📊 付费转化率: 18.5%        │
│ 📊 人均消费: $8.2           │
│ 📊 复购率: 45%              │
└─────────────────────────────┘
```

**创建者收益分析：**
```
┌─────────────────────────────┐
│ 💰 创建者收益分布           │
├─────────────────────────────┤
│ Top 10创建者                │
│ 🏆 收入占比: 60%            │
│ 💰 人均收益: $2,340         │
│                             │
│ 中部创建者 (11-100名)       │
│ 📊 收入占比: 30%            │
│ 💰 人均收益: $156           │
│                             │
│ 长尾创建者 (100+名)         │
│ 📊 收入占比: 10%            │
│ 💰 人均收益: $23            │
│                             │
│ ⚠️ 0收益创建者              │
│ 😢 567人 (45%)              │
│ [查看原因] [发送帮助]       │
└─────────────────────────────┘
```

---

## 数据库设计

### 4.1 核心表结构

#### agents表（修改）
```sql
ALTER TABLE agents
ADD COLUMN price DECIMAL(10,0) NOT NULL DEFAULT 0
COMMENT 'Agent价格(整数credits)';

-- 现有字段
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(255) NOT NULL
description TEXT
type VARCHAR(50)
role TEXT
goal TEXT
ipfs_hash VARCHAR(255)
transaction_hash VARCHAR(255)
owner VARCHAR(255) NOT NULL
chainid INT NOT NULL
image_url VARCHAR(255)
is_public BOOLEAN DEFAULT FALSE
mcp_enabled BOOLEAN DEFAULT FALSE
vector_enabled BOOLEAN DEFAULT FALSE
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

-- 索引
INDEX idx_owner (owner)
INDEX idx_price (price)
INDEX idx_is_public (is_public)
```

#### agent_price_history表（新增）
```sql
CREATE TABLE agent_price_history (
  id VARCHAR(36) PRIMARY KEY,
  agent_id INT NOT NULL,
  old_price DECIMAL(10,0),
  new_price DECIMAL(10,0) NOT NULL,
  changed_by VARCHAR(255) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  INDEX idx_agent_id (agent_id),
  INDEX idx_changed_at (changed_at)
) COMMENT='Agent价格调整历史';
```

#### creator_earnings表（新增）
```sql
CREATE TABLE creator_earnings (
  id VARCHAR(36) PRIMARY KEY,
  agent_id INT NOT NULL,
  creator_id VARCHAR(255) NOT NULL,
  amount DECIMAL(10,0) NOT NULL,
  source_user_id VARCHAR(255),
  conversation_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  INDEX idx_creator_id (creator_id),
  INDEX idx_agent_id (agent_id),
  INDEX idx_created_at (created_at)
) COMMENT='创建者收益记录';
```

#### agent_usage_records表（新增）
```sql
CREATE TABLE agent_usage_records (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  agent_id INT NOT NULL,
  price_charged DECIMAL(10,0) NOT NULL,
  payment_type ENUM('buyBalance', 'creditBalance', 'mixed') NOT NULL,
  conversation_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_agent_id (agent_id),
  INDEX idx_created_at (created_at),
  INDEX idx_conversation_id (conversation_id)
) COMMENT='Agent使用记录';
```

#### withdrawal_records表（新增）
```sql
CREATE TABLE withdrawal_records (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(255) NOT NULL,
  credits_amount DECIMAL(10,0) NOT NULL,
  usdt_amount DECIMAL(10,2) NOT NULL COMMENT '扣除手续费后的实际到账金额',
  fee_amount DECIMAL(10,2) NOT NULL COMMENT '手续费金额',
  wallet_address VARCHAR(255) NOT NULL,
  tx_hash VARCHAR(255),
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,

  INDEX idx_creator_id (creator_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_tx_hash (tx_hash)
) COMMENT='提现记录';
```

#### dispute_records表（新增）
```sql
CREATE TABLE dispute_records (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  creator_id VARCHAR(255) NOT NULL,
  agent_id INT NOT NULL,
  amount DECIMAL(10,0) NOT NULL,
  reason TEXT NOT NULL,
  conversation_id VARCHAR(255),
  status ENUM('pending', 'investigating', 'approved', 'rejected') DEFAULT 'pending',
  evidence TEXT COMMENT 'JSON格式存储证据',
  resolution TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  resolved_by VARCHAR(255),

  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_creator_id (creator_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) COMMENT='争议处理记录';
```

### 4.2 现有表（保持）

#### user_credits表
```sql
-- 已存在，无需修改
id VARCHAR(36) PRIMARY KEY
user_id VARCHAR(255) NOT NULL
credit_balance INT NOT NULL DEFAULT 20
buy_balance INT NOT NULL DEFAULT 0
last_used_at TIMESTAMP
last_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

#### credit_purchases表
```sql
-- 已存在，无需修改
id VARCHAR(36) PRIMARY KEY
user_id VARCHAR(255) NOT NULL
plan_id VARCHAR(50) NOT NULL
credits INT NOT NULL
price DECIMAL(10, 6) NOT NULL
transaction_hash VARCHAR(66) NOT NULL UNIQUE
purchase_type ENUM('CONTRACT_SYNC', 'MANUAL') DEFAULT 'CONTRACT_SYNC'
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

---

## API接口规范

### 5.1 用户端API

#### 5.1.1 Credits管理

**查询余额**
```
GET /api/credits

Response:
{
  "creditBalance": 10,
  "buyBalance": 15,
  "lastUsedAt": "2025-10-08T14:30:00Z",
  "lastResetAt": "2025-10-07T00:00:00Z"
}
```

**购买Credits**
```
POST /api/credits/purchase

Request:
{
  "planId": "DEV",
  "transactionHash": "0xabcd...ef01"
}

Response:
{
  "success": true,
  "credits": 1500,
  "buyBalance": 1515,
  "message": "Credits purchased successfully"
}
```

**使用记录**
```
GET /api/credits/usage-records?page=1&limit=20

Response:
{
  "records": [
    {
      "id": "uuid",
      "agentId": 123,
      "agentName": "AI代码审查",
      "price": 5,
      "paymentType": "buyBalance",
      "conversationId": "abc123",
      "createdAt": "2025-10-08T14:30:00Z"
    }
  ],
  "total": 156,
  "page": 1,
  "totalPages": 8
}
```

#### 5.1.2 Agent使用

**查询Agent价格**
```
GET /api/agents/:agentId/price

Response:
{
  "agentId": 123,
  "price": 5,
  "currency": "credits"
}
```

**检查余额充足性**
```
POST /api/agents/:agentId/check-balance

Response:
{
  "sufficient": true,
  "price": 5,
  "buyBalance": 15,
  "creditBalance": 10,
  "canUse": true,
  "message": "余额充足"
}

// 或余额不足时
{
  "sufficient": false,
  "price": 5,
  "buyBalance": 2,
  "creditBalance": 10,
  "canUse": false,
  "message": "buyBalance不足，付费Agent必须使用buyBalance支付"
}
```

**发送消息（含扣费）**
```
POST /api/chat

Request:
{
  "agentId": 123,
  "message": "请帮我审查代码",
  "conversationId": "abc123"
}

Response:
{
  "success": true,
  "charged": 5,
  "paymentType": "buyBalance",
  "remainingBalance": {
    "buyBalance": 10,
    "creditBalance": 10
  },
  "response": "AI回复内容...",
  "conversationId": "abc123"
}
```

### 5.2 创建者端API

#### 5.2.1 定价管理

**设置价格**
```
PUT /api/agents/:agentId/price

Request:
{
  "price": 5
}

Response:
{
  "success": true,
  "agentId": 123,
  "oldPrice": 3,
  "newPrice": 5,
  "changedAt": "2025-10-08T14:30:00Z"
}
```

**价格历史**
```
GET /api/agents/:agentId/price-history

Response:
{
  "history": [
    {
      "id": "uuid",
      "oldPrice": 8,
      "newPrice": 5,
      "changedAt": "2025-10-05T09:15:00Z"
    },
    {
      "id": "uuid",
      "oldPrice": 5,
      "newPrice": 3,
      "changedAt": "2025-10-01T10:00:00Z"
    }
  ]
}
```

#### 5.2.2 收益管理

**收益汇总**
```
GET /api/creator/earnings/summary

Response:
{
  "totalEarnings": 12580,
  "todayEarnings": 135,
  "weekEarnings": 890,
  "monthEarnings": 3420,
  "totalUsageCount": 2560,
  "activeUsers": 187,
  "availableForWithdrawal": 12580
}
```

**收益明细**
```
GET /api/creator/earnings/details?agentId=123&startDate=2025-10-01&endDate=2025-10-08&page=1

Response:
{
  "details": [
    {
      "id": "uuid",
      "agentId": 123,
      "agentName": "AI代码审查",
      "amount": 5,
      "sourceUserId": "0xabcd...ef",
      "conversationId": "abc123",
      "createdAt": "2025-10-08T14:30:00Z"
    }
  ],
  "total": 256,
  "page": 1,
  "totalPages": 13
}
```

**仪表板数据**
```
GET /api/creator/dashboard

Response:
{
  "summary": {
    "totalEarnings": 12580,
    "todayEarnings": 135,
    "weekEarnings": 890
  },
  "trends": [
    { "date": "2025-10-08", "earnings": 135 },
    { "date": "2025-10-07", "earnings": 142 },
    ...
  ],
  "topAgents": [
    {
      "agentId": 123,
      "name": "AI代码审查",
      "earnings": 3250,
      "usageCount": 650
    }
  ]
}
```

#### 5.2.3 提现管理

**发起提现**
```
POST /api/creator/withdraw

Request:
{
  "creditsAmount": 10000,
  "walletAddress": "0x1234567890abcdef..."
}

Response:
{
  "success": true,
  "withdrawalId": "WD20251008001",
  "creditsAmount": 10000,
  "usdtAmount": 294,
  "feeAmount": 6,
  "estimatedCompletionDate": "2025-10-15",
  "status": "pending"
}
```

**提现记录**
```
GET /api/creator/withdrawals?page=1

Response:
{
  "withdrawals": [
    {
      "id": "uuid",
      "creditsAmount": 10000,
      "usdtAmount": 294,
      "feeAmount": 6,
      "walletAddress": "0x1234...5678",
      "txHash": "0xabcd...ef01",
      "status": "completed",
      "createdAt": "2025-10-05T10:30:00Z",
      "completedAt": "2025-10-12T15:20:00Z"
    }
  ],
  "total": 12,
  "page": 1
}
```

**提现详情**
```
GET /api/creator/withdrawal/:withdrawalId

Response:
{
  "id": "uuid",
  "withdrawalId": "WD20251008001",
  "creditsAmount": 10000,
  "exchangeRate": 0.03,
  "grossAmount": 300,
  "feeRate": 0.02,
  "feeAmount": 6,
  "netAmount": 294,
  "walletAddress": "0x1234...5678",
  "txHash": "0xabcd...ef01",
  "status": "processing",
  "timeline": [
    {
      "status": "pending",
      "timestamp": "2025-10-08T10:30:00Z",
      "description": "提交申请"
    },
    {
      "status": "approved",
      "timestamp": "2025-10-08T11:00:00Z",
      "description": "平台审核通过"
    },
    {
      "status": "processing",
      "timestamp": "2025-10-08T14:00:00Z",
      "description": "USDT转账中"
    }
  ],
  "estimatedCompletionDate": "2025-10-15"
}
```

### 5.3 平台管理API

#### 5.3.1 运营数据

**市场统计**
```
GET /api/admin/market-stats?period=today

Response:
{
  "period": "today",
  "gmv": 1458,
  "transactionCount": 3456,
  "activeUsers": 892,
  "paidUsers": 234,
  "feeIncome": 12.5,
  "paidAgentCount": 1350,
  "activeCreators": 267
}
```

**价格分布**
```
GET /api/admin/pricing-distribution

Response:
{
  "distribution": [
    { "range": "free", "count": 1250, "percentage": 45 },
    { "range": "1-5", "count": 800, "percentage": 29 },
    { "range": "6-10", "count": 450, "percentage": 16 },
    { "range": "11-20", "count": 200, "percentage": 7 },
    { "range": "20+", "count": 80, "percentage": 3 }
  ],
  "avgPrice": 3.2,
  "medianPrice": 2
}
```

**创建者排行**
```
GET /api/admin/creator-rankings?period=month&limit=100

Response:
{
  "rankings": [
    {
      "rank": 1,
      "creatorId": "0x1234...5678",
      "earnings": 23400,
      "agentCount": 12,
      "usageCount": 4680
    }
  ]
}
```

#### 5.3.2 风控管理

**争议列表**
```
GET /api/admin/disputes?status=pending

Response:
{
  "disputes": [
    {
      "id": "uuid",
      "userId": "0xabcd...ef",
      "creatorId": "0x1234...5678",
      "agentId": 123,
      "amount": 5,
      "reason": "AI回复质量差",
      "conversationId": "abc123",
      "status": "pending",
      "createdAt": "2025-10-08T14:30:00Z"
    }
  ],
  "total": 15
}
```

**处理争议**
```
PUT /api/admin/disputes/:disputeId

Request:
{
  "action": "approve", // or "reject"
  "resolution": "经审核，确认AI回复质量不达标，批准退款"
}

Response:
{
  "success": true,
  "disputeId": "uuid",
  "status": "approved",
  "refundedAmount": 5,
  "resolvedAt": "2025-10-08T16:00:00Z"
}
```

**作弊检测**
```
GET /api/admin/fraud-detection

Response:
{
  "suspiciousActivities": [
    {
      "type": "self_usage",
      "creatorId": "0x1234...5678",
      "agentId": 123,
      "count": 15,
      "amount": 75,
      "riskLevel": "high"
    },
    {
      "type": "related_accounts",
      "accounts": ["0xabcd...ef", "0x7890...12"],
      "mutualUsage": 50,
      "riskLevel": "medium"
    }
  ]
}
```

**封禁用户**
```
POST /api/admin/ban-user

Request:
{
  "userId": "0x1234...5678",
  "reason": "恶意刷单",
  "duration": "permanent" // or "7days", "30days"
}

Response:
{
  "success": true,
  "userId": "0x1234...5678",
  "bannedUntil": null, // permanent
  "createdAt": "2025-10-08T16:00:00Z"
}
```

---

## 前端页面设计

### 6.1 用户端页面

#### 6.1.1 Marketplace（市场）

**路由：** `/marketplace`

**功能：**
- Agent列表展示（含价格标签）
- 免费/付费筛选
- 价格区间筛选
- 价格排序（从低到高/从高到低）
- 搜索功能

**布局：**
```
┌──────────────────────────────────────┐
│ 🔍 搜索Agent...          [筛选▼]     │
├──────────────────────────────────────┤
│ [全部] [免费] [1-5] [6-10] [10+]    │
│ 排序: [最新] [最热] [价格↑] [价格↓] │
├──────────────────────────────────────┤
│ ┌────────┐  ┌────────┐  ┌────────┐  │
│ │Agent 1 │  │Agent 2 │  │Agent 3 │  │
│ │🎁 免费 │  │💰 3    │  │💰 5    │  │
│ └────────┘  └────────┘  └────────┘  │
└──────────────────────────────────────┘
```

#### 6.1.2 Agent详情页

**路由：** `/agent/:agentId`

**功能：**
- Agent基本信息
- 价格显示
- 创建者信息
- 使用统计
- 评价列表
- [开始使用]按钮

**关键交互：**
1. 用户点击[开始使用]
2. 检查价格和余额
3. 弹出确认/不足提示
4. 确认后进入对话

#### 6.1.3 个人中心

**路由：** `/profile`

**功能模块：**
- Credits余额展示
- 购买Credits入口
- 消费记录入口
- 账户设置

#### 6.1.4 消费记录页

**路由：** `/usage-records`

**功能：**
- 消费记录列表
- 筛选（全部/付费/免费）
- 时间筛选
- 导出CSV
- 查看对话详情

### 6.2 创建者端页面

#### 6.2.1 Agent管理页

**路由：** `/creator/agents`

**功能：**
- Agent列表
- 设置/修改价格
- 查看收益
- 查看使用统计

**价格设置交互：**
```
点击[设置价格] → 弹窗输入 → 保存 → 立即生效
```

#### 6.2.2 创建者仪表板

**路由：** `/creator/dashboard`

**功能模块：**
- 收益概览卡片
  - 总收益
  - 今日收益
  - 本周收益
- 收益趋势图（7日/30日）
- Agent收益排行
- 用户来源分析
- [提现]快捷入口

**图表组件：**
- 折线图：收益趋势
- 柱状图：各Agent收益对比
- 饼图：用户来源分布

#### 6.2.3 收益明细页

**路由：** `/creator/earnings`

**功能：**
- 收益记录列表
- 筛选（按Agent/时间）
- 导出数据
- 查看对话详情

#### 6.2.4 提现管理页

**路由：** `/creator/withdraw`

**Tab标签：**
- [发起提现]
- [提现记录]

**提现流程：**
1. 输入提现数量
2. 输入钱包地址
3. 显示汇率计算
4. 确认提交
5. 查看进度

### 6.3 平台管理端页面

#### 6.3.1 运营数据大屏

**路由：** `/admin/dashboard`

**模块：**
- 实时指标卡片
- 交易趋势图
- 用户分析图
- 创建者分析图

#### 6.3.2 价格管理后台

**路由：** `/admin/pricing`

**功能：**
- 价格分布统计
- 异常定价监控
- 发送调价建议
- 市场价格趋势

#### 6.3.3 争议处理中心

**路由：** `/admin/disputes`

**功能：**
- 待处理争议列表
- 查看争议详情
- 审核对话内容
- 批准/驳回操作
- 批量处理工具

#### 6.3.4 风控管理后台

**路由：** `/admin/fraud`

**功能：**
- 作弊检测列表
- 异常账户监控
- 封禁/解封操作
- 风控规则配置

---

## 业务流程

### 7.1 用户使用付费Agent

```
开始
  ↓
用户选择Agent
  ↓
前端查询Agent价格
  ↓
检查用户buyBalance
  ↓
price > 0 且 buyBalance < price?
  ↓ Yes                    ↓ No
弹出余额不足提示        弹出确认使用弹窗
  ↓                         ↓
[购买Credits]           用户点击[确认]
[选择免费Agent]            ↓
                      调用后端API
                          ↓
                      后端再次验证
                          ↓
                      扣除buyBalance
                          ↓
                      分配创建者收益
                          ↓
                      记录使用明细
                          ↓
                      调用AI处理
                          ↓
                      返回AI响应
                          ↓
                      更新前端余额
                          ↓
                        结束
```

### 7.2 创建者设置价格

```
开始
  ↓
创建者进入Agent管理页
  ↓
点击[设置价格]
  ↓
弹出定价输入框
  ↓
显示定价建议
  ↓
创建者输入价格（整数）
  ↓
前端验证（必须整数）
  ↓
调用后端API
  ↓
后端验证权限（owner）
  ↓
更新agents.price
  ↓
记录price_history
  ↓
返回成功
  ↓
前端更新显示
  ↓
价格立即生效
  ↓
结束
```

### 7.3 创建者提现流程

```
开始
  ↓
创建者点击[提现]
  ↓
输入提现数量
  ↓
输入钱包地址
  ↓
前端计算汇率和手续费
  ↓
显示实际到账金额
  ↓
创建者确认提交
  ↓
调用后端API
  ↓
后端验证：
- 余额充足?
- 地址格式?
- 最低提现额?
  ↓
创建withdrawal_record
  ↓
锁定credits
  ↓
status: pending
  ↓
平台审核（可自动化）
  ↓
status: processing
  ↓
调用智能合约/转账
  ↓
获取txHash
  ↓
status: completed
  ↓
记录completed_at
  ↓
发送通知（邮件/站内信）
  ↓
创建者查看到账
  ↓
结束
```

### 7.4 争议处理流程

```
开始
  ↓
用户发起退款申诉
  ↓
填写申诉原因
  ↓
提交证据（对话截图）
  ↓
创建dispute_record
  ↓
status: pending
  ↓
平台收到通知
  ↓
人工审核：
- 查看对话内容
- 评估Agent质量
- 查看历史评价
  ↓
status: investigating
  ↓
做出裁决
  ↓
批准退款?
  ↓ Yes                ↓ No
credits返还用户     status: rejected
创建者扣除收益      通知双方原因
status: approved       ↓
  ↓                  结束
双方评分系统
  ↓
记录resolution
  ↓
通知双方结果
  ↓
结束
```

---

## 风险控制

### 8.1 防止恶意定价

#### 8.1.1 三级防控体系

**Level 1: 软性引导**
```
触发条件: price > 50

提示内容:
"⚠️ 你设置的价格较高(50+ credits)
建议参考市场价: 同类Agent平均5 credits
高价可能导致使用量降低"

[确认继续] [调整价格]
```

**Level 2: 社区监督**
```
功能:
- 用户可举报"过度收费"
- 显示"性价比"评分
  性价比 = (满意度评分 × 10) / 价格
- 低性价比Agent降低推荐权重

举报流程:
用户点击[举报] → 选择原因 → 提交 → 平台审核
```

**Level 3: 平台干预**
```
触发条件:
- 投诉数 > 10 且 使用次数 < 5

处理措施:
1. 自动下架Agent
2. 通知创建者调整价格
3. 人工审核
4. 决定: 恢复/永久封禁

恶意定价惩罚:
- 第1次: 警告+强制调价
- 第2次: 冻结提现7天
- 第3次: 永久禁止定价权
```

### 8.2 防刷单机制

#### 8.2.1 异常检测模式

**检测1: 自己使用自己的Agent**
```sql
-- 检测逻辑
SELECT COUNT(*) as self_usage_count
FROM agent_usage_records
WHERE user_id = (
  SELECT owner FROM agents WHERE id = agent_id
)
AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY);

-- 触发阈值: self_usage_count > 10

-- 处理:
- 标记异常
- 扣除异常收益
- 警告创建者
```

**检测2: 关联账户互刷**
```
检测方式:
- 同IP地址多账户
- 同设备指纹
- 账户间频繁互相使用

机器学习特征:
- 注册时间接近
- 使用模式相似
- 仅互相使用，无其他交互

处理:
- 关联账户全部封禁
- 扣除全部异常收益
- 加入黑名单
```

**检测3: 批量小号刷单**
```
检测特征:
- 新注册账户(<7天)
- 立即使用付费Agent
- 仅使用特定创建者的Agent

防范措施:
- 新账户前3天仅能用免费Agent
- 或新账户使用付费Agent需额外验证

已有防范:
✅ 付费Agent不能用免费creditBalance
   → 小号必须充值才能刷单
   → 成本高，不划算
```

### 8.3 支付安全保障

#### 8.3.1 余额锁定机制

**实现逻辑：**
```javascript
// 锁定表
CREATE TABLE credit_locks (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  amount DECIMAL(10,0) NOT NULL,
  reason VARCHAR(50),
  locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  released BOOLEAN DEFAULT FALSE,

  INDEX idx_user_id (user_id),
  INDEX idx_released (released)
);

// 锁定函数
async function lockCredits(userId, amount) {
  const lockId = UUID.v4();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟

  await db.query(`
    INSERT INTO credit_locks
    (id, user_id, amount, reason, expires_at)
    VALUES (?, ?, ?, 'agent_usage', ?)
  `, [lockId, userId, amount, expiresAt]);

  return lockId;
}

// 释放函数
async function unlockCredits(lockId) {
  await db.query(`
    UPDATE credit_locks
    SET released = TRUE
    WHERE id = ?
  `, [lockId]);
}

// 计算可用余额
async function getAvailableBalance(userId) {
  const [balance, locks] = await Promise.all([
    getUserCredit(userId),
    db.query(`
      SELECT SUM(amount) as locked_amount
      FROM credit_locks
      WHERE user_id = ?
      AND released = FALSE
      AND expires_at > NOW()
    `, [userId])
  ]);

  const lockedAmount = locks[0]?.locked_amount || 0;

  return {
    buyBalance: balance.buyBalance - lockedAmount,
    creditBalance: balance.creditBalance
  };
}
```

#### 8.3.2 失败回退机制

**AI调用失败处理：**
```javascript
async function useAgentWithRollback(userId, agentId, message) {
  const price = await getAgentPrice(agentId);
  const lockId = await lockCredits(userId, price);

  try {
    // 调用AI
    const aiResponse = await callAI(agentId, message, {
      timeout: 30000 // 30秒超时
    });

    // AI成功，正式扣费
    await deductCredits(userId, price);
    await allocateEarnings(creatorId, price);
    await unlockCredits(lockId);

    return {
      success: true,
      response: aiResponse,
      charged: price
    };

  } catch (error) {
    // AI失败，释放锁定
    await unlockCredits(lockId);

    // 记录失败原因
    await logAIFailure({
      userId,
      agentId,
      error: error.message,
      timestamp: new Date()
    });

    throw new Error('AI调用失败，未扣费');
  }
}
```

#### 8.3.3 透明记账

**审计日志：**
```sql
CREATE TABLE audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  details TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);

-- 记录所有关键操作
INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details)
VALUES (
  UUID(),
  '0x1234...5678',
  'AGENT_USAGE',
  'agent',
  '123',
  '{"price": 5, "paymentType": "buyBalance", "conversationId": "abc123"}'
);
```

**用户可查询：**
- 所有消费记录
- 每笔交易详情
- 余额变动历史

**创建者可查询：**
- 所有收益记录
- 收益来源用户
- 提现历史

### 8.4 争议处理系统

#### 8.4.1 用户申诉流程

**申诉入口：**
```
消费记录详情页 → [申诉退款]
```

**申诉表单：**
```
┌─────────────────────────────┐
│ 📝 申诉退款                 │
├─────────────────────────────┤
│ 消费记录:                   │
│ Agent: AI代码审查           │
│ 金额: 5 credits            │
│ 时间: 2025-10-08 14:30     │
│                             │
│ 申诉原因:                   │
│ ○ AI回复质量差             │
│ ○ Agent功能不符描述        │
│ ○ 价格误导                 │
│ ● 其他: [请描述...]        │
│                             │
│ 详细说明:                   │
│ [文本框 500字以内]         │
│                             │
│ 上传证据:                   │
│ [对话截图.png] [上传]      │
│                             │
│ ⚠️ 申诉说明                │
│ • 24小时内可申诉           │
│ • 平台将在3个工作日内处理   │
│ • 恶意申诉将受处罚          │
│                             │
│ [提交申诉] [取消]          │
└─────────────────────────────┘
```

#### 8.4.2 平台审核流程

**审核界面（管理后台）：**
```
┌─────────────────────────────────────┐
│ 🔍 争议详情 #DP20251008001         │
├─────────────────────────────────────┤
│ 申诉方: 0xabcd...ef                │
│ 被申诉方: 0x1234...5678 (创建者)   │
│ Agent: AI代码审查专家 (#123)       │
│ 金额: 5 credits                    │
│ 申诉时间: 2025-10-08 15:00         │
│                                     │
│ 申诉原因: AI回复质量差              │
│ 详细说明:                           │
│ "AI的代码审查完全不专业，           │
│  只是简单复述了代码逻辑..."         │
│                                     │
│ 证据材料:                           │
│ [查看对话记录] [查看截图]          │
│                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━         │
│                                     │
│ 📊 历史数据参考:                   │
│ • 此Agent总使用: 856次             │
│ • 平均评分: 4.9/5                  │
│ • 历史争议: 2次(均驳回)            │
│                                     │
│ • 此用户总使用: 34次               │
│ • 发起争议: 1次(本次)              │
│                                     │
│ 🤖 AI辅助判断:                     │
│ 基于对话内容分析，AI回复质量正常    │
│ 建议: 驳回申诉                     │
│                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━         │
│                                     │
│ 审核意见:                           │
│ [文本框]                           │
│                                     │
│ [批准退款] [驳回申诉]              │
└─────────────────────────────────────┘
```

**审核标准：**
```
批准退款条件（满足任一）：
✅ AI回复明显质量低下
✅ Agent功能与描述严重不符
✅ 价格欺诈（隐藏真实价格）
✅ 技术故障导致服务异常

驳回申诉条件：
❌ 主观不满意（AI回复符合预期）
❌ 用户误解Agent功能
❌ 价格透明，用户已确认
❌ 恶意申诉（历史记录显示）
```

#### 8.4.3 双方评分机制

**处理完成后：**
```
┌─────────────────────────────┐
│ ⭐ 对本次争议处理评分       │
├─────────────────────────────┤
│ 你对平台处理的满意度:       │
│ ⭐⭐⭐⭐⭐ (5星)           │
│                             │
│ 对创建者/用户的评价:        │
│ ⭐⭐⭐☆☆ (3星)             │
│                             │
│ 补充说明(可选):             │
│ [虽然退款了，但希望...]     │
│                             │
│ [提交评价]                  │
└─────────────────────────────┘

评分作用:
- 影响信用分
- 多次恶意申诉 → 降低申诉优先级
- 多次被申诉成功 → 降低Agent推荐权重
```

---

## 技术架构

### 9.1 系统架构图

```
┌─────────────────────────────────────┐
│           前端应用层                 │
│  React + TypeScript + Ant Design    │
│  - Marketplace                      │
│  - Creator Dashboard                │
│  - Admin Panel                      │
└─────────────────────────────────────┘
              ↓ HTTPS/WSS
┌─────────────────────────────────────┐
│           API网关��                  │
│  - 认证鉴权                         │
│  - 限流熔断                         │
│  - 日志审计                         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│          业务服务层                  │
│  - Agent Service                    │
│  - Payment Service                  │
│  - Earnings Service                 │
│  - Withdrawal Service               │
│  - Dispute Service                  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│          数据存储层                  │
│  - MySQL (主数据)                   │
│  - Redis (缓存+锁)                  │
│  - ElasticSearch (日志+搜索)        │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│        区块链/第三方服务              │
│  - Smart Contract (提现)            │
│  - AI Models (GPT/Claude)           │
│  - IPFS (存储)                      │
└─────────────────────────────────────┘
```

### 9.2 关键技术选型

#### 9.2.1 后端技术栈

**框架：** Node.js + Express
```
选择理由：
✅ 与现有项目一致
✅ 异步I/O适合高并发
✅ npm生态丰富
```

**数据库：** MySQL 8.0+
```
选择理由：
✅ 事务支持完善（ACID）
✅ 金融级可靠性
✅ 团队熟悉
```

**缓存：** Redis
```
用途：
- 用户余额缓存
- Agent价格缓存
- 分布式锁
- 限流计数器
```

**消息队列：** Bull (Redis-based)
```
用途：
- 异步扣费处理
- 收益分配队列
- 提现处理队列
- 通知发送队列
```

#### 9.2.2 前端技术栈

**框架：** React 18 + TypeScript
```
已使用，保持一致
```

**UI库：** Ant Design
```
已使用，扩展组件：
- 价格输入组件
- 余额展示组件
- 收益图表组件
```

**状态管理：** Zustand/Redux
```
管理：
- 用户余额状态
- Agent价格缓存
- 购物车/确认弹窗状态
```

**图表库：** Chart.js / Recharts
```
用于：
- 收益趋势图
- 价格分布图
- 数据分析大屏
```

#### 9.2.3 区块链集成

**提现方案：**
```
方案A: 智能合约自动化
- 部署提现合约
- 平台预充USDT池
- 用户申请 → 合约自动转账
- 优点: 去中心化、透明
- 缺点: Gas费成本、开发复杂

方案B: 平台托管账户
- 平台热钱包管理
- 批量打包转账
- 优点: 成本低、灵活
- 缺点: 中心化风险

推荐: MVP用方案B，后期升级方案A
```

### 9.3 性能优化

#### 9.3.1 支付检查优化

**目标：** <100ms响应

**优化措施：**
```
1. Redis缓存余额
   - TTL: 60s
   - 更新时主动刷新

2. Agent价格缓存
   - 价格修改时invalidate
   - 热门Agent预加载

3. 数据库索引
   - user_id索引
   - agent_id索引
   - 复合索引优化

4. 连接池
   - MySQL连接池: 20-50
   - Redis连接池: 10-20
```

**代码示例：**
```javascript
// 缓存优化
async function getAgentPrice(agentId) {
  // 1. 尝试从Redis读取
  const cached = await redis.get(`agent:${agentId}:price`);
  if (cached !== null) {
    return parseInt(cached);
  }

  // 2. 从数据库读取
  const agent = await db.query(
    'SELECT price FROM agents WHERE id = ?',
    [agentId]
  );

  // 3. 写入缓存
  await redis.setex(
    `agent:${agentId}:price`,
    3600, // 1小时
    agent.price
  );

  return agent.price;
}
```

#### 9.3.2 大量并发支持

**场景：** 1000+ 并发扣费请求

**解决方案：**
```
1. 消息队列削峰
   用户请求 → MQ → 工作进程批处理

2. 数据库事务优化
   - 读写分离
   - 批量提交
   - 乐观锁

3. 微服务拆分
   - Payment Service独立部署
   - 水平扩展

4. 限流保护
   - 用户级: 10次/秒
   - IP级: 100次/秒
   - 全局: 10000次/秒
```

#### 9.3.3 统计数据优化

**问题：** 创建者收益统计查询慢

**解决方案：**
```
1. 预聚合表
CREATE TABLE earnings_daily_summary (
  creator_id VARCHAR(255),
  date DATE,
  total_earnings DECIMAL(10,0),
  usage_count INT,
  PRIMARY KEY (creator_id, date)
);

-- 定时任务每日聚合
INSERT INTO earnings_daily_summary
SELECT
  creator_id,
  DATE(created_at) as date,
  SUM(amount) as total_earnings,
  COUNT(*) as usage_count
FROM creator_earnings
WHERE DATE(created_at) = CURDATE() - INTERVAL 1 DAY
GROUP BY creator_id, DATE(created_at);

2. ElasticSearch
   - 明细数据写入ES
   - 复杂查询用ES
   - 聚合分析更快

3. 物化视图
   - MySQL 8.0不支持
   - 用定时任务模拟
```

### 9.4 安全措施

#### 9.4.1 API安全

**认证：**
```
JWT Token
- 有效期: 24小时
- Refresh Token: 30天
- 签名算法: RS256
```

**鉴权：**
```
基于角色的访问控制(RBAC):
- user: 基础功能
- creator: 创建者功能
- admin: 平台管理
```

**防护：**
```
1. XSS防护
   - 输入过滤
   - 输出转义
   - CSP头

2. CSRF防护
   - Double Submit Cookie
   - SameSite Cookie

3. SQL注入防护
   - 参数化查询
   - ORM使用

4. 限流
   - 滑动窗口算法
   - Redis实现
```

#### 9.4.2 资金安全

**多重验证：**
```
提现时：
1. 密码验证
2. 邮箱验证码
3. 2FA验证(可选)
4. 大额人工审核(>$1000)
```

**风控规则：**
```
1. 异常检测
   - 短时间大额提现
   - 异地登录提现
   - 新账户提现

2. 冷却期
   - 修改钱包地址后24小时不能提现
   - 新注册用户7天后可提现

3. 限额
   - 单次最高: $10,000
   - 日累计: $50,000
   - 月累计: $200,000
```

---

## 开发计划

### 10.1 开发阶段划分

#### Phase 1 - MVP核心功能（4-6周）

**Week 1-2: 数据库+后端核心**
```
□ 数据库设计实施
  - agents表加price字段
  - 创建新表(earnings, usage, price_history)
  - 索引优化

□ 支付逻辑开发
  - 价格查询API
  - 余额检查API
  - 动态扣费逻辑
  - 收益分配逻辑

□ 单元测试
  - 扣费逻辑测试
  - 边界条件测试
```

**Week 3-4: 前端核心界面**
```
□ 价格展示
  - Marketplace价格标签
  - Agent详情页价格
  - 价格筛选/排序

□ 支付确认流程
  - 余额检查弹窗
  - 余额不足提示
  - 确认使用弹窗

□ 创建者定价
  - 设置价格界面
  - 修改价格界面
  - 价格历史查看
```

**Week 5-6: 收益+集成测试**
```
□ 创建者收益
  - 收益概览页面
  - 收益明细列表
  - 简单统计图表

□ 集成测试
  - 完整流程测试
  - 并发压力测试
  - 安全测试

□ Bug修复
```

**交付物：**
- ✅ 用户可使用付费Agent
- ✅ 创建者可设置价格和查看收益
- ✅ 严格的buyBalance支付规则
- ✅ 基础数据统计

---

#### Phase 2 - 提现+增强功能（2-3周）

**Week 7-8: 提现系统**
```
□ 提现后端
  - 提现申请API
  - 汇率计算逻辑
  - 手续费计算
  - 提现记录管理

□ 提现前端
  - 提现申请界面
  - 提现记录页面
  - 进度追踪

□ 区块链集成
  - 智能合约对接
  - 或托管账户转账
  - 交易哈希记录
```

**Week 9: 数据增强**
```
□ 创建者仪表板
  - 收益趋势图
  - Agent收益排行
  - 用户来源分析

□ 消费记录增强
  - 详细记录页
  - 筛选导出功能
  - 对话关联查看

□ 价格历史
  - 调价记录追踪
  - 价格效果分析
```

**交付物：**
- ✅ 完整提现流程
- ✅ 丰富的数据统计
- ✅ 优化的用户体验

---

#### Phase 3 - 风控+平台管理（2-4周）

**Week 10-11: 风控系统**
```
□ 争议处理
  - 用户申诉流程
  - 管理员审核界面
  - 退款逻辑
  - 双方评分

□ 作弊检测
  - 自刷检测算法
  - 关联账户识别
  - 异常预警
  - 封禁机制
```

**Week 12-13: 平台管理**
```
□ 运营数据大屏
  - 实时指标展示
  - 趋势分析图表
  - 导出报表

□ 价格监控
  - 价格分布统计
  - 异常定价预警
  - 调价建议工具

□ 用户管理
  - 用户画像分析
  - 黑名单管理
  - 批量操作工具
```

**交付物：**
- ✅ 完善的风控体系
- ✅ 强大的运营工具
- ✅ 平台健康运行

---

### 10.2 团队分工建议

**后端开发（2人）**
```
开发1:
- 支付系统
- 收益分配
- 数据库设计

开发2:
- 提现系统
- 风控系统
- API开发
```

**前端开发（2人）**
```
开发1:
- 用户端界面
- 支付流程
- 消费记录

开发2:
- 创建者端界面
- 仪表板图表
- 管理后台
```

**测试（1人）**
```
- 功能测试
- 安全测试
- 性能测试
- 自动化测试
```

**产品+运营（1人）**
```
- 需求细化
- 原型设计
- 验收测试
- 运营策略
```

### 10.3 里程碑

**M1 - MVP上线（Week 6）**
```
✅ 核心支付流程
✅ 基础收益查看
✅ 价格设置功能
→ 灰度测试20%用户
```

**M2 - 提现功能（Week 9）**
```
✅ 完整提现流程
✅ 数据统计增强
✅ 用户体验优化
→ 全量上线
```

**M3 - 风控完善（Week 13）**
```
✅ 争议处理系统
✅ 作弊检测
✅ 平台管理工具
→ 稳定运营
```

---

## 关键指标

### 11.1 业务指标

#### 11.1.1 交易指标

**GMV（总交易额）**
```
定义: 所有付费Agent使用的总金额
计算: SUM(price) WHERE price > 0
目标:
- Day 1: $500
- Week 1: $5,000
- Month 1: $50,000
```

**交易次数**
```
定义: 付费Agent使用次数
计算: COUNT(*) WHERE price > 0
目标:
- Day 1: 100次
- Week 1: 1,000次
- Month 1: 10,000次
```

**客单价**
```
定义: 平均每次交易金额
计算: GMV / 交易次数
目标: $3-5
```

#### 11.1.2 用户指标

**付费转化率**
```
定义: 使用付费Agent的用户占比
计算: 付费用户数 / 总用户数
目标: >15%
```

**复购率**
```
定义: 多次使用付费Agent的用户占比
计算: 使用≥2次的用户 / 付费用户总数
目标: >40%
```

**ARPU（人均收入）**
```
定义: 平均每用户贡献金额
计算: GMV / 活跃用户数
目标: $8-12
```

**用户留存**
```
次日留存: >60%
7日留存: >40%
30日留存: >25%
```

#### 11.1.3 创建者指标

**创建者人均收益**
```
定义: 平均每个创建者的收益
计算: 总收益 / 活跃创建者数
目标:
- 中位数: $50/月
- 平均数: $150/月
- Top 10%: $1,000+/月
```

**收益分布**
```
目标健康比例:
- Top 10: 40-50%
- 中部: 30-40%
- 长尾: 10-20%
- 0收益: <30%
```

**Agent定价合理性**
```
指标: 性价比分数
计算: (满意度 × 10) / 价格
目标: 平均 >15
```

### 11.2 运营指标

#### 11.2.1 平台收入

**手续费收入**
```
定义: 提现手续费2%
计算: SUM(提现金额 × 0.02)
目标:
- Week 1: $50
- Month 1: $500
- Month 3: $2,000
```

**充值套餐差价（可选）**
```
如果采用差价模式:
目标: GMV的5-10%
```

#### 11.2.2 健康度指标

**争议率**
```
定义: 发起争议的交易占比
计算: 争议数 / 总交易数
目标: <2%
```

**退款率**
```
定义: 批准退款的交易占比
计算: 退款数 / 总交易数
目标: <1%
```

**作弊检出率**
```
定义: 检出作弊行为的比例
监控: 每日异常交易数
目标: 检出>80%，误报<5%
```

### 11.3 技术指标

#### 11.3.1 性能指标

**API响应时间**
```
价格查询: <50ms (P95)
余额检查: <100ms (P95)
扣费接口: <200ms (P95)
收益查询: <500ms (P95)
```

**并发能力**
```
支付QPS: >1,000
查询QPS: >5,000
数据库连接: <80%
```

**可用性**
```
SLA: 99.9%
月度故障时间: <43分钟
```

#### 11.3.2 安全指标

**漏洞数**
```
严重漏洞: 0
高危漏洞: 0
中危漏洞: <3
```

**异常登录**
```
检出率: >95%
误报率: <3%
```

### 11.4 数据监控Dashboard

**实时大屏（每5分钟刷新）**
```
┌─────────────────────────────┐
│ 📊 实时运营数据             │
├─────────────────────────────┤
│ 今日GMV: $1,458            │
│ 交易次数: 3,456            │
│ 在线用户: 892              │
│ 并发支付: 23               │
│                             │
│ 📈 趋势（对比昨日）         │
│ GMV: +23% ↑                │
│ 交易: +15% ↑               │
│ 用户: +8% ↑                │
│                             │
│ ⚠️ 预警                    │
│ • API响应慢: 2个           │
│ • 争议待处理: 5个          │
│ • 异常定价: 3个            │
└─────────────────────────────┘
```

**告警规则**
```
立即告警:
- API错误率 >1%
- 响应时间 >1s
- 数据库连接 >90%
- 资金异常变动

每日报告:
- GMV统计
- 用户增长
- 收益排行
- 争议汇总
```

---

## 附录

### A. 术语表

| 术语 | 定义 |
|------|------|
| buyBalance | 购买额度，用户充值获得，可用于所有Agent |
| creditBalance | 免费额度，每周发放20，仅能用于免费Agent |
| GMV | Gross Merchandise Volume，总交易额 |
| ARPU | Average Revenue Per User，人均收入 |
| SLA | Service Level Agreement，服务等级协议 |
| QPS | Queries Per Second，每秒查询数 |

### B. 汇率说明

**用户购买汇率：**
- Basic: $4.99 / 100 = $0.0499/credit
- Pro: $19.99 / 500 = $0.0399/credit
- Dev: $49.99 / 1,500 = $0.0333/credit

**开发者提现汇率：**
- 1 credit = $0.03 USDT
- 手续费：2%

**示例计算：**
```
开发者收益10,000 credits：
1. 换算: 10,000 × 0.03 = $300
2. 手续费: $300 × 2% = $6
3. 实际到账: $300 - $6 = $294 USDT
```

### C. FAQ

**Q1: 为什么付费Agent必须用buyBalance？**
> 防止用户用免费额度薅羊毛，保护创建者收益。

**Q2: 创建者可以设置小数价格吗？**
> 不可以，只能设置整数credits，简化用户理解。

**Q3: 提现多久到账？**
> MVP阶段T+7，后续优化到T+1或T+0。

**Q4: 手续费可以减免吗？**
> 暂不支持，统一2%。后续可考虑VIP等级减免。

**Q5: 争议处理周期？**
> 承诺3个工作日内处理完成。

**Q6: 最低提现额度？**
> 100 credits（约$3 USDT）。

---

## 文档变更记录

| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|----------|--------|
| V1.0 | 2025-10-08 | 初始版本创建 | - |

---

**文档结束**

如有疑问，请联系产品团队。

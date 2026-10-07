# 链上 Credit 系统流程图

## 📊 完整系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户前端 (React)                          │
│                                                                   │
│  • 查看余额                                                       │
│  • 调用Agent                                                      │
│  • 提现收益                                                       │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        │ HTTPS/WSS
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                    后端 API 服务器 (Node.js)                      │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           AgentEarningsService                            │   │
│  │  • registerAgent()         // 注册Agent                   │   │
│  │  • recordAgentCall()       // 记录调用                    │   │
│  │  • addCredits()            // 添加Credits                │   │
│  │  • getUserBalances()       // 查询余额                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                        │                                          │
│                        │ Web3.js                                  │
│                        ↓                                          │
└─────────────────────────────────────────────────────────────────┘
                        │
                        │ JSON-RPC
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│              区块链网络 (BSC/Polygon/Arbitrum)                    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │        AgentEarningsManager.sol (智能合约)                │   │
│  │                                                            │   │
│  │  💰 状态变量:                                             │   │
│  │    • mapping(address => uint256) creditBalance           │   │
│  │    • mapping(address => uint256) earningsBalance         │   │
│  │    • mapping(uint256 => AgentInfo) agents                │   │
│  │    • mapping(uint256 => AgentCall[]) callHistory         │   │
│  │                                                            │   │
│  │  🔧 核心函数:                                             │   │
│  │    • registerAgent()           // 注册Agent               │   │
│  │    • recordAgentCall()         // 记录调用并分配收益      │   │
│  │    • requestWithdrawal()       // 请求提现                │   │
│  │    • processWithdrawal()       // 处理提现                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                        │
                        │ 事件监听
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                     数据库 (MySQL)                                │
│                                                                   │
│  • agents (缓存Agent信息)                                         │
│  • user_credits (缓存余额，定期同步)                              │
│  • agent_calls (调用历史，用于查询优化)                          │
│  • credit_withdrawals (提现记录)                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 核心业务流程

### 1️⃣ 用户购买 Credits

```
用户前端
   ↓
[点击购买 100 Credits，支付 10 USDT]
   ↓
调用 CreditsPayment.purchaseCredits()
   ↓
┌──────────────────────────────────┐
│  CreditsPayment.sol              │
│  • 转账 USDT 到 Treasury         │
│  • 触发事件 CreditsPurchased     │
└──────────────────────────────────┘
   ↓
后端监听事件
   ↓
调用 AgentEarningsManager.addCredits()
   ↓
┌──────────────────────────────────┐
│  AgentEarningsManager.sol        │
│  creditBalance[用户] += 100      │
│  触发 CreditsAdded 事件          │
└──────────────────────────────────┘
   ↓
用户余额更新: 100 Credits ✅
```

### 2️⃣ 用户调用付费 Agent

```
用户前端
   ↓
[发送消息给 Agent #5 (价格: 10 Credits)]
   ↓
POST /api/chat
   {
     message: "Hello",
     agentId: 5,
     chainId: 97
   }
   ↓
后端 API 处理
   ↓
┌──────────────────────────────────────────────────┐
│  1. 验证用户登录                                  │
│  2. 查询 Agent 价格                               │
│  3. 调用智能合约                                  │
│                                                    │
│  earningsService.recordAgentCall(                 │
│    agentId: 5,                                    │
│    caller: "0xUser...",                          │
│    sessionId: "conv-123-456"                     │
│  )                                                │
└──────────────────────────────────────────────────┘
   ↓
智能合约执行
   ↓
┌─────────────────────────────────────────────────────────┐
│  AgentEarningsManager.recordAgentCall()                  │
│                                                           │
│  Step 1: 检查余额                                        │
│    creditBalance[0xUser...] >= 10? ✅                   │
│                                                           │
│  Step 2: 扣除调用者 Credits                              │
│    creditBalance[0xUser...] -= 10                       │
│    (100 → 90)                                            │
│    触发事件: CreditsConsumed                             │
│                                                           │
│  Step 3: 增加创建者收益                                  │
│    earningsBalance[0xAgentOwner...] += 10               │
│    (0 → 10)                                              │
│    触发事件: EarningsAccrued                             │
│                                                           │
│  Step 4: 更新统计                                        │
│    agentTotalCalls[5]++                                  │
│    agentTotalEarnings[5] += 10                          │
│                                                           │
│  Step 5: 记录历史                                        │
│    agentCallHistory[5].push(...)                        │
│    userCallHistory[0xUser...].push(...)                 │
│                                                           │
│  触发事件: AgentCalled                                   │
└─────────────────────────────────────────────────────────┘
   ↓
返回交易哈希
   ↓
后端继续处理
   ↓
调用 AI Agent 处理消息
   ↓
返回 AI 响应给用户 ✅
```

### 3️⃣ 创建者提现收益

```
创建者前端
   ↓
[点击提现 50 Credits]
   ↓
前端调用智能合约
   ↓
┌──────────────────────────────────────────────────┐
│  contract.methods.requestWithdrawal(50)          │
│    .send({ from: "0xCreator..." })              │
└──────────────────────────────────────────────────┘
   ↓
智能合约执行
   ↓
┌─────────────────────────────────────────────────────────┐
│  AgentEarningsManager.requestWithdrawal()                │
│                                                           │
│  Step 1: 检查收益余额                                    │
│    earningsBalance[0xCreator...] >= 50? ✅              │
│                                                           │
│  Step 2: 扣除收益（锁定）                                │
│    earningsBalance[0xCreator...] -= 50                  │
│    (100 → 50)                                            │
│                                                           │
│  Step 3: 创建提现请求                                    │
│    withdrawalRequests[requestId] = {                     │
│      user: 0xCreator...,                                │
│      amount: 50,                                         │
│      processed: false                                    │
│    }                                                     │
│                                                           │
│  触发事件: WithdrawalRequested                           │
│  返回: requestId = 123                                   │
└─────────────────────────────────────────────────────────┘
   ↓
后端监听事件
   ↓
创建数据库记录
   ↓
┌──────────────────────────────────────────────────┐
│  INSERT INTO credit_withdrawals                  │
│  (request_id, user_id, amount, status)          │
│  VALUES (123, '0xCreator...', 50, 'pending')    │
└──────────────────────────────────────────────────┘
   ↓
管理员审核
   ↓
管理员转账 USDT
   ↓
调用智能合约处理
   ↓
┌─────────────────────────────────────────────────────────┐
│  AgentEarningsManager.processWithdrawal()                │
│    (requestId: 123, usdtTxHash: 0xABC...)               │
│                                                           │
│  Step 1: 验证请求未处理                                  │
│    withdrawalRequests[123].processed == false ✅        │
│                                                           │
│  Step 2: 标记已处理                                      │
│    withdrawalRequests[123].processed = true             │
│    withdrawalRequests[123].txHash = 0xABC...            │
│                                                           │
│  触发事件: WithdrawalProcessed                           │
└─────────────────────────────────────────────────────────┘
   ↓
更新数据库
   ↓
提现完成 ✅
创建者收到 USDT 💰
```

---

## 🔍 与 Agent Credit 绑定的关键点

### 绑定机制

```
┌─────────────────────────────────────────────────────────┐
│  1. Agent 创建时注册到链上                               │
│                                                           │
│  CREATE AGENT (数据库)                                   │
│    ↓                                                      │
│  registerAgent() (链上)                                  │
│    agents[agentId] = {                                   │
│      agentId: 5,                                         │
│      owner: 0xCreator...,                               │
│      price: 10,                                          │
│      isActive: true                                      │
│    }                                                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  2. Agent 调用时自动关联                                 │
│                                                           │
│  用户调用 Agent #5                                       │
│    ↓                                                      │
│  recordAgentCall(agentId: 5, caller: 0xUser...)         │
│    ↓                                                      │
│  智能合约自动查询:                                        │
│    agent = agents[5]                                     │
│    price = agent.price (10 Credits)                     │
│    owner = agent.owner (0xCreator...)                   │
│    ↓                                                      │
│  自动执行:                                                │
│    creditBalance[0xUser...] -= 10                       │
│    earningsBalance[0xCreator...] += 10                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  3. 收益自动归属创建者                                    │
│                                                           │
│  每次调用 Agent                                           │
│    ↓                                                      │
│  收益自动累积到:                                          │
│    earningsBalance[agent.owner]                          │
│    ↓                                                      │
│  创建者可以随时查询和提现                                 │
└─────────────────────────────────────────────────────────┘
```

### 数据一致性保证

```
┌────────────────────────────────────────┐
│  链上数据 (Source of Truth)            │
│  • creditBalance[用户]                 │
│  • earningsBalance[创建者]             │
│  • agentTotalCalls[agentId]           │
│  • agentTotalEarnings[agentId]        │
└────────────┬───────────────────────────┘
             │
             │ 定期同步 (每5分钟)
             ↓
┌────────────────────────────────────────┐
│  数据库 (缓存)                          │
│  • user_credits.credit_balance         │
│  • user_credits.buy_balance            │
│  • agents.total_calls                  │
│  • agents.total_earnings               │
└────────────────────────────────────────┘
```

---

## 🎯 关键优势总结

### 1. **不可篡改性**
```
数据库被黑 ❌
   ↓
黑客修改 buy_balance = 999999
   ↓
提现时验证失败:
   链上 earningsBalance = 10 (真实值)
   数据库 buy_balance = 999999 (被篡改)
   ↓
❌ 提现失败，黑客无法得逞
```

### 2. **自动化分配**
```
无需人工干预
   ↓
智能合约自动执行:
   扣费 → 分配收益 → 记录历史
   ↓
✅ 100% 准确，0% 人为错误
```

### 3. **完全透明**
```
所有交易可追溯
   ↓
任何人可以验证:
   • Agent 被调用了多少次
   • 创建者赚了多少钱
   • 每笔收益来自哪个用户
   ↓
✅ 建立信任，提升平台价值
```

### 4. **降低成本**
```
无需复杂的审计系统
   ↓
区块链自带审计功能
   ↓
✅ 降低运营成本
```

---

## 📝 实施检查清单

- [ ] 1. 部署 `AgentEarningsManager.sol` 合约
- [ ] 2. 配置后端服务器私钥和合约地址
- [ ] 3. 创建 `AgentEarningsService` 服务类
- [ ] 4. 修改 `/api/chat` 接口集成链上支付
- [ ] 5. 迁移现有 Agent 数据到链上
- [ ] 6. 迁移用户余额到链上
- [ ] 7. 启动定期同步服务
- [ ] 8. 更新前端显示链上余额
- [ ] 9. 实现提现流程
- [ ] 10. 测试完整流程
- [ ] 11. 监控系统上线

---

## 🚀 下一步

1. **立即部署测试网**
   - BSC Testnet 部署合约
   - 测试基本功能

2. **数据迁移**
   - 迁移 10 个测试 Agent
   - 迁移 20 个测试用户

3. **压力测试**
   - 模拟 100 次并发调用
   - 验证 gas 费用

4. **主网部署**
   - 完整安全审计
   - 正式上线

有任何问题随时问我！ 🎉

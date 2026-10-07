# 🚀 链上Credit系统部署指南

本指南将引导您完成从合约部署到系统集成的完整流程。

---

## 📋 部署前检查清单

- [ ] Node.js 16+ 已安装
- [ ] 钱包中有足够的测试币（BSC Testnet BNB）
- [ ] MySQL数据库已配置
- [ ] 准备好私钥和RPC节点

---

## 🔧 环境配置

### 1. 安装依赖

```bash
# 进入ai-server目录
cd /Users/css/Desktop/gameland/源码/ai-server

# 安装必要的npm包
npm install web3@latest
npm install dotenv
```

### 2. 配置环境变量

创建或更新 `.env` 文件：

```bash
# 区块链配置
BLOCKCHAIN_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545  # BSC Testnet
AGENT_EARNINGS_CONTRACT_ADDRESS=                                      # 部署后填写
SERVER_PRIVATE_KEY=                                                   # 服务器私钥（需要有权限）

# 数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=your_database
```

⚠️ **安全提示：**
- 永远不要将 `.env` 文件提交到Git
- 确保 `.env` 在 `.gitignore` 中

---

## 📜 合约部署

### 步骤1：安装Hardhat

```bash
cd /Users/css/Desktop/gameland/源码/ai-server/contracts
npm install --save-dev hardhat @nomiclabs/hardhat-waffle ethereum-waffle chai @nomiclabs/hardhat-ethers ethers
```

### 步骤2：初始化Hardhat项目

```bash
npx hardhat
# 选择 "Create a basic sample project"
```

### 步骤3：配置Hardhat

创建 `hardhat.config.js`：

```javascript
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require('dotenv').config();

module.exports = {
  solidity: "0.8.0",
  networks: {
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY]
    },
    bscMainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY]
    }
  }
};
```

### 步骤4：创建部署脚本

创建 `scripts/deploy-earnings-manager.js`：

```javascript
const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying AgentEarningsManager...");

  // 如果有CreditsPayment合约，填入地址；否则用零地址
  const creditPaymentAddress = process.env.CREDITS_PAYMENT_ADDRESS || "0x0000000000000000000000000000000000000000";

  const AgentEarningsManager = await hre.ethers.getContractFactory("AgentEarningsManager");
  const contract = await AgentEarningsManager.deploy(creditPaymentAddress);

  await contract.deployed();

  console.log("✅ AgentEarningsManager deployed to:", contract.address);
  console.log("");
  console.log("📝 Please update your .env file:");
  console.log(`AGENT_EARNINGS_CONTRACT_ADDRESS=${contract.address}`);
  console.log("");
  console.log("🔑 Next steps:");
  console.log("1. Add this address to your .env file");
  console.log("2. Run: node scripts/authorize-server.js");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### 步骤5：部署到测试网

```bash
# 复制合约到Hardhat项目
cp ../AgentEarningsManager.sol contracts/

# 部署
npx hardhat run scripts/deploy-earnings-manager.js --network bscTestnet
```

**预期输出：**
```
🚀 Deploying AgentEarningsManager...
✅ AgentEarningsManager deployed to: 0x1234567890abcdef1234567890abcdef12345678

📝 Please update your .env file:
AGENT_EARNINGS_CONTRACT_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
```

### 步骤6：授权后端服务器

创建 `scripts/authorize-server.js`：

```javascript
const hre = require("hardhat");
require('dotenv').config();

async function main() {
  const contractAddress = process.env.AGENT_EARNINGS_CONTRACT_ADDRESS;
  const serverAddress = process.env.SERVER_ADDRESS; // 后端服务器的地址

  if (!contractAddress || !serverAddress) {
    console.error("❌ Missing contract or server address in .env");
    process.exit(1);
  }

  console.log(`📝 Authorizing server ${serverAddress}...`);

  const AgentEarningsManager = await hre.ethers.getContractFactory("AgentEarningsManager");
  const contract = AgentEarningsManager.attach(contractAddress);

  const tx = await contract.addAuthorizedServer(serverAddress);
  await tx.wait();

  console.log(`✅ Server authorized! TX: ${tx.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

运行：
```bash
npx hardhat run scripts/authorize-server.js --network bscTestnet
```

---

## 🗄️ 数据库迁移

### 步骤1：添加链上标记字段

```sql
-- 为agents表添加链上标记
ALTER TABLE agents
ADD COLUMN on_chain BOOLEAN DEFAULT FALSE,
ADD COLUMN chain_tx_hash VARCHAR(66);

-- 为user_credits表添加同步时间戳
ALTER TABLE user_credits
ADD COLUMN last_sync_at TIMESTAMP;

-- 为credit_withdrawals表添加链上交易字段
ALTER TABLE credit_withdrawals
ADD COLUMN request_id INT,
ADD COLUMN processed_tx_hash VARCHAR(66);

-- 为credit_consumption表添加交易哈希
ALTER TABLE credit_consumption
ADD COLUMN tx_hash VARCHAR(66);
```

### 步骤2：迁移现有Agent到链上

创建 `scripts/migrate-agents.js`：

```javascript
const AgentEarningsService = require('../src/services/AgentEarningsService');

async function main() {
  console.log('🔄 Starting agent migration to blockchain...\n');

  await AgentEarningsService.initialize();

  const results = await AgentEarningsService.migrateExistingAgents();

  console.log('\n📊 Migration Summary:');
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);

  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\n❌ Failed agents:');
    failed.forEach(f => {
      console.log(`   Agent ${f.agentId}: ${f.error}`);
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
```

运行：
```bash
cd /Users/css/Desktop/gameland/源码/ai-server
node scripts/migrate-agents.js
```

---

## 🔗 后端集成

### 步骤1：更新Agent创建逻辑

修改 `/Users/css/Desktop/gameland/源码/ai-server/src/services/agentService.js`：

```javascript
const AgentEarningsService = require('./AgentEarningsService');

// 在创建Agent后添加链上注册
async function createAgent(agentData) {
  // ... 原有创建逻辑 ...

  // 🔗 链上注册Agent
  try {
    await AgentEarningsService.registerAgent(
      agent.id,
      agent.owner,
      agent.price || 0
    );
  } catch (error) {
    console.error('Failed to register agent on-chain:', error);
    // 根据业务需求决定是否回滚数据库操作
  }

  return agent;
}
```

### 步骤2：更新消息处理逻辑

修改 `/Users/css/Desktop/gameland/源码/ai-server/src/services/messageProcessingService.js`：

```javascript
const AgentEarningsService = require('./AgentEarningsService');

async function processAgentMessage(agentId, userId, message, conversationId) {
  // ... 获取Agent信息 ...

  // 如果是付费Agent，使用链上支付
  if (agent.price > 0 && agent.on_chain) {
    try {
      // 🔗 链上记录调用和支付
      await AgentEarningsService.recordAgentCall(
        agentId,
        userId,
        conversationId
      );
    } catch (error) {
      // 余额不足或其他错误
      return {
        error: true,
        message: error.message
      };
    }
  } else {
    // 免费Agent或未上链Agent，使用原有逻辑
    await creditService.consumeForAgent(userId, agentId, agent.price || 0, conversationId);
  }

  // ... 继续处理AI响应 ...
}
```

### 步骤3：创建提现API

创建 `/Users/css/Desktop/gameland/源码/ai-server/src/routes/withdrawal.js`：

```javascript
const express = require('express');
const router = express.Router();
const AgentEarningsService = require('../services/AgentEarningsService');
const authMiddleware = require('../middleware/auth');

/**
 * 请求提现
 * POST /api/withdrawal/request
 */
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const userAddress = req.user.address;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const result = await AgentEarningsService.requestWithdrawal(userAddress, amount);

    res.json({
      success: true,
      requestId: result.requestId,
      transactionHash: result.transactionHash,
      message: 'Withdrawal request created. Pending admin approval.'
    });

  } catch (error) {
    console.error('Withdrawal request failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 处理提现（管理员）
 * POST /api/withdrawal/process
 */
router.post('/process', authMiddleware, async (req, res) => {
  try {
    // TODO: 添加管理员权限验证
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { requestId, usdtTxHash } = req.body;

    if (!requestId || !usdtTxHash) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await AgentEarningsService.processWithdrawal(requestId, usdtTxHash);

    res.json({
      success: true,
      message: 'Withdrawal processed successfully',
      transactionHash: result.transactionHash
    });

  } catch (error) {
    console.error('Withdrawal processing failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取用户余额（从链上查询）
 * GET /api/withdrawal/balance
 */
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const userAddress = req.user.address;

    const balances = await AgentEarningsService.getUserBalances(userAddress);

    res.json({
      success: true,
      creditBalance: balances.creditBalance,
      earningsBalance: balances.earningsBalance
    });

  } catch (error) {
    console.error('Failed to get balances:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

注册路由（在 `app.js` 或 `server.js` 中）：

```javascript
const withdrawalRoutes = require('./routes/withdrawal');
app.use('/api/withdrawal', withdrawalRoutes);
```

---

## 🔄 定时同步服务

创建 `/Users/css/Desktop/gameland/源码/ai-server/src/services/syncService.js`：

```javascript
const cron = require('node-cron');
const AgentEarningsService = require('./AgentEarningsService');

class SyncService {
  constructor() {
    this.running = false;
  }

  /**
   * 启动定时同步
   */
  start() {
    if (this.running) {
      console.log('Sync service already running');
      return;
    }

    console.log('🔄 Starting sync service...');

    // 每5分钟同步一次余额
    cron.schedule('*/5 * * * *', async () => {
      console.log('🔄 Running scheduled balance sync...');
      try {
        await AgentEarningsService.syncBalancesFromChain();
        console.log('✅ Balance sync completed');
      } catch (error) {
        console.error('❌ Balance sync failed:', error);
      }
    });

    this.running = true;
    console.log('✅ Sync service started');
  }

  /**
   * 手动触发同步
   */
  async triggerSync() {
    console.log('🔄 Manually triggering balance sync...');
    try {
      const result = await AgentEarningsService.syncBalancesFromChain();
      console.log(`✅ Sync completed: ${result.syncCount} users, ${result.mismatchCount} mismatches`);
      return result;
    } catch (error) {
      console.error('❌ Manual sync failed:', error);
      throw error;
    }
  }
}

module.exports = new SyncService();
```

在 `server.js` 中启动：

```javascript
const syncService = require('./services/syncService');

// 服务器启动后初始化同步服务
syncService.start();
```

---

## ✅ 测试验证

### 1. 测试Agent注册

```bash
curl -X POST http://localhost:3000/api/agents/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Test Agent",
    "description": "Test",
    "price": 10
  }'
```

### 2. 测试Agent调用

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "agentId": 1,
    "message": "Hello",
    "chainId": 97
  }'
```

### 3. 测试余额查询

```bash
curl -X GET http://localhost:3000/api/withdrawal/balance \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. 测试提现

```bash
# 请求提现
curl -X POST http://localhost:3000/api/withdrawal/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": 50
  }'
```

---

## 📊 监控和日志

### 查看链上事件

使用BSCScan Testnet查看合约事件：
```
https://testnet.bscscan.com/address/YOUR_CONTRACT_ADDRESS#events
```

### 查看同步日志

```bash
tail -f logs/sync.log
```

### 数据库验证查询

```sql
-- 检查链上状态
SELECT COUNT(*) as total_agents,
       SUM(CASE WHEN on_chain = TRUE THEN 1 ELSE 0 END) as on_chain_agents
FROM agents;

-- 检查余额一致性
SELECT
  u.user_id,
  u.credit_balance as db_balance,
  u.last_sync_at
FROM user_credits u
WHERE last_sync_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE);
```

---

## 🚨 故障排除

### 问题1：Gas费用过高

**解决方案：**
```javascript
// 在AgentEarningsService.js中调整gas限制
const tx = await contract.methods.XXX().send({
  from: this.serverAccount.address,
  gas: 200000,  // 降低gas限制
  gasPrice: await this.web3.eth.getGasPrice()  // 使用当前gas价格
});
```

### 问题2：交易失败 - "Insufficient credits"

**原因：** 链上余额不足

**解决方案：**
1. 检查链上余额：`contract.methods.creditBalance(userAddress).call()`
2. 手动添加credits：`contract.methods.addCredits(userAddress, amount, "manual").send()`

### 问题3：合约未授权

**错误：** "Not authorized"

**解决方案：**
```bash
npx hardhat run scripts/authorize-server.js --network bscTestnet
```

---

## 🔐 安全检查清单

部署前必须完成：

- [ ] 服务器私钥已安全存储（不在Git中）
- [ ] 合约所有者地址已确认
- [ ] 后端服务器地址已授权
- [ ] 数据库访问权限最小化
- [ ] 启用了同步服务
- [ ] 配置了告警通知（数据库篡改检测）
- [ ] 提现审核流程已建立
- [ ] 备份了合约地址和ABI

---

## 📞 支持

如有问题，请查看：
- [链上Credit系统流程图](./onchain-credit-flow-diagram.md)
- [安全分析文档](./credit-security-analysis.md)
- [真实安全解决方案](./real-security-solution.md)

---

## 🎉 部署完成！

恭喜！您的链上Credit系统已经部署完成。系统现在具备：

✅ **不可篡改性** - 所有收益数据都在区块链上
✅ **自动化分配** - 智能合约自动处理收益
✅ **完全透明** - 所有交易公开可查
✅ **三层验证** - 提现时多重安全检查
✅ **实时监控** - 自动检测数据库篡改

现在可以安全地运营您的Agent平台了！ 🚀

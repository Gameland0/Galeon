# Agent Credit 链上集成完整方案

## 📋 目录

1. [系统架构](#系统架构)
2. [智能合约部署](#智能合约部署)
3. [后端集成](#后端集成)
4. [前端调用流程](#前端调用流程)
5. [数据迁移](#数据迁移)
6. [测试方案](#测试方案)

---

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────┐
│   用户前端   │
└──────┬──────┘
       │
       │ 1. 调用Agent请求
       ↓
┌─────────────────────┐
│    后端API服务器     │
│  (Node.js/Express)  │
└──────┬──────────────┘
       │
       │ 2. 验证请求
       │ 3. 调用智能合约
       ↓
┌──────────────────────────────┐
│  AgentEarningsManager.sol    │
│  (智能合约 - 链上)            │
│  • creditBalance[用户]        │
│  • earningsBalance[创建者]    │
│  • recordAgentCall()         │
└──────┬───────────────────────┘
       │
       │ 4. 事件触发
       │ 5. 返回交易哈希
       ↓
┌─────────────────────┐
│   数据库 (MySQL)    │
│  (缓存和查询优化)    │
└─────────────────────┘
```

### 1.2 数据流向

**用户调用Agent：**
```
用户 → 前端 → 后端API → 智能合约.recordAgentCall()
    ↓
智能合约自动执行：
1. 扣除调用者的 creditBalance
2. 增加创建者的 earningsBalance
3. 记录调用历史
4. 触发事件

后端监听事件 → 同步到数据库（缓存）
```

---

## 2. 智能合约部署

### 2.1 部署步骤

```bash
# 1. 编译合约
cd /Users/css/Desktop/gameland/源码/ai-server/contracts
npx hardhat compile

# 2. 部署脚本
npx hardhat run scripts/deploy-agent-earnings.js --network bsc-testnet
```

### 2.2 部署脚本

创建 `scripts/deploy-agent-earnings.js`：

```javascript
const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying AgentEarningsManager...");

  // CreditsPayment合约地址（如果已部署）
  const creditPaymentAddress = "0x..."; // 替换为实际地址

  const AgentEarningsManager = await hre.ethers.getContractFactory("AgentEarningsManager");
  const contract = await AgentEarningsManager.deploy(creditPaymentAddress);

  await contract.deployed();

  console.log("✅ AgentEarningsManager deployed to:", contract.address);

  // 添加授权服务器
  const backendServerAddress = "0x..."; // 后端服务器地址
  await contract.addAuthorizedServer(backendServerAddress);
  console.log("✅ Backend server authorized");

  return contract.address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### 2.3 合约地址配置

在 `.env` 中添加：

```env
# AgentEarningsManager合约地址
AGENT_EARNINGS_CONTRACT_BSC_TESTNET=0x...
AGENT_EARNINGS_CONTRACT_BSC_MAINNET=0x...
AGENT_EARNINGS_CONTRACT_POLYGON=0x...
AGENT_EARNINGS_CONTRACT_ARBITRUM=0x...
```

---

## 3. 后端集成

### 3.1 创建合约服务

创建 `services/agentEarningsService.ts`：

```typescript
import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
import AgentEarningsManagerABI from '../contracts/abi/AgentEarningsManager.json';

const contractAddresses: { [key: number]: string } = {
  97: process.env.AGENT_EARNINGS_CONTRACT_BSC_TESTNET!,
  56: process.env.AGENT_EARNINGS_CONTRACT_BSC_MAINNET!,
  137: process.env.AGENT_EARNINGS_CONTRACT_POLYGON!,
  42161: process.env.AGENT_EARNINGS_CONTRACT_ARBITRUM!,
};

export class AgentEarningsService {
  private web3: Web3;
  private contract: any;
  private chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.web3 = new Web3(process.env.RPC_URL!);

    const contractAddress = contractAddresses[chainId];
    if (!contractAddress) {
      throw new Error(`Contract not deployed on chain ${chainId}`);
    }

    this.contract = new this.web3.eth.Contract(
      AgentEarningsManagerABI as AbiItem[],
      contractAddress
    );
  }

  /**
   * 注册Agent到链上
   */
  async registerAgent(
    agentId: number,
    ownerAddress: string,
    price: number
  ): Promise<string> {
    const serverAccount = this.web3.eth.accounts.privateKeyToAccount(
      process.env.SERVER_PRIVATE_KEY!
    );

    const tx = await this.contract.methods
      .registerAgent(agentId, ownerAddress, price)
      .send({
        from: serverAccount.address,
        gas: 200000,
      });

    return tx.transactionHash;
  }

  /**
   * 记录Agent调用（核心函数）
   */
  async recordAgentCall(
    agentId: number,
    callerAddress: string,
    sessionId: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const serverAccount = this.web3.eth.accounts.privateKeyToAccount(
        process.env.SERVER_PRIVATE_KEY!
      );

      // 1. 检查用户余额
      const userBalance = await this.getCreditBalance(callerAddress);
      const agentPrice = await this.getAgentPrice(agentId);

      if (agentPrice > 0 && userBalance < agentPrice) {
        return {
          success: false,
          error: 'Insufficient credits'
        };
      }

      // 2. 调用智能合约
      const tx = await this.contract.methods
        .recordAgentCall(agentId, callerAddress, sessionId)
        .send({
          from: serverAccount.address,
          gas: 300000,
        });

      console.log(`✅ Agent call recorded on-chain: ${tx.transactionHash}`);

      return {
        success: true,
        txHash: tx.transactionHash
      };

    } catch (error: any) {
      console.error('❌ Error recording agent call:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 添加Credits（用户购买后调用）
   */
  async addCredits(
    userAddress: string,
    amount: number,
    source: string = 'purchase'
  ): Promise<string> {
    const serverAccount = this.web3.eth.accounts.privateKeyToAccount(
      process.env.SERVER_PRIVATE_KEY!
    );

    const tx = await this.contract.methods
      .addCredits(userAddress, amount, source)
      .send({
        from: serverAccount.address,
        gas: 150000,
      });

    return tx.transactionHash;
  }

  /**
   * 请求提现
   */
  async requestWithdrawal(
    userAddress: string,
    amount: number
  ): Promise<{ requestId: number; txHash: string }> {
    // 用户需要自己签名调用
    const tx = await this.contract.methods
      .requestWithdrawal(amount)
      .send({
        from: userAddress,
        gas: 200000,
      });

    const requestId = tx.events.WithdrawalRequested.returnValues.requestId;

    return {
      requestId: Number(requestId),
      txHash: tx.transactionHash
    };
  }

  /**
   * 处理提现（管理员在转账USDT后调用）
   */
  async processWithdrawal(
    requestId: number,
    usdtTxHash: string
  ): Promise<string> {
    const ownerAccount = this.web3.eth.accounts.privateKeyToAccount(
      process.env.OWNER_PRIVATE_KEY!
    );

    const txHashBytes32 = this.web3.utils.padLeft(usdtTxHash, 64);

    const tx = await this.contract.methods
      .processWithdrawal(requestId, txHashBytes32)
      .send({
        from: ownerAccount.address,
        gas: 150000,
      });

    return tx.transactionHash;
  }

  // ============ 查询函数 ============

  /**
   * 获取用户余额
   */
  async getUserBalances(userAddress: string): Promise<{
    credits: number;
    earnings: number;
  }> {
    const balances = await this.contract.methods
      .getUserBalances(userAddress)
      .call();

    return {
      credits: Number(balances.credits),
      earnings: Number(balances.earnings)
    };
  }

  /**
   * 获取Credit余额
   */
  async getCreditBalance(userAddress: string): Promise<number> {
    const balance = await this.contract.methods
      .creditBalance(userAddress)
      .call();

    return Number(balance);
  }

  /**
   * 获取收益余额
   */
  async getEarningsBalance(userAddress: string): Promise<number> {
    const balance = await this.contract.methods
      .earningsBalance(userAddress)
      .call();

    return Number(balance);
  }

  /**
   * 获取Agent价格
   */
  async getAgentPrice(agentId: number): Promise<number> {
    const agent = await this.contract.methods
      .agents(agentId)
      .call();

    return Number(agent.price);
  }

  /**
   * 获取Agent统计
   */
  async getAgentStats(agentId: number): Promise<{
    totalCalls: number;
    totalEarnings: number;
    price: number;
    owner: string;
  }> {
    const stats = await this.contract.methods
      .getAgentStats(agentId)
      .call();

    return {
      totalCalls: Number(stats.totalCalls),
      totalEarnings: Number(stats.totalEarnings),
      price: Number(stats.price),
      owner: stats.agentOwner
    };
  }

  /**
   * 同步链上数据到数据库
   */
  async syncToDatabase(userAddress: string): Promise<void> {
    const balances = await this.getUserBalances(userAddress);

    await db.query(`
      UPDATE user_credits
      SET
        credit_balance = ?,
        buy_balance = ?,
        last_sync_at = NOW()
      WHERE user_id = ?
    `, [balances.credits, balances.earnings, userAddress]);
  }
}
```

### 3.2 更新 API 路由

修改 `routes/chatRoutes.ts`：

```typescript
import { AgentEarningsService } from '../services/agentEarningsService';

router.post('/chat', async (req, res) => {
  const { message, agentId, conversationId, chainid, walletInfo } = req.body;

  try {
    // 1. 验证用户登录
    const userAddress = req.user.address;

    // 2. 获取Agent信息
    const agent = await getAgentDetails(agentId, chainid);

    // 3. 如果是付费Agent，记录链上调用
    if (agent.price > 0) {
      const earningsService = new AgentEarningsService(chainid);

      // 生成sessionId
      const sessionId = `${conversationId}-${Date.now()}`;

      // 调用链上合约
      const result = await earningsService.recordAgentCall(
        agentId,
        userAddress,
        sessionId
      );

      if (!result.success) {
        return res.status(402).json({
          error: 'Payment required',
          message: result.error
        });
      }

      console.log(`✅ Payment processed on-chain: ${result.txHash}`);
    }

    // 4. 调用AI Agent处理消息
    const aiResponse = await processAgentMessage(agentId, message);

    // 5. 返回响应
    res.json({
      response: aiResponse,
      agentId,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### 3.3 定期同步服务

创建 `services/chainSyncService.ts`：

```typescript
import { AgentEarningsService } from './agentEarningsService';
import cron from 'node-cron';

/**
 * 定期从链上同步数据到数据库
 */
export function startChainSyncService() {
  // 每5分钟同步一次
  cron.schedule('*/5 * * * *', async () => {
    console.log('🔄 Starting chain sync...');

    try {
      // 获取所有活跃用户
      const users = await db.query(`
        SELECT DISTINCT user_id
        FROM user_credits
        WHERE updated_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
      `);

      const earningsService = new AgentEarningsService(97); // BSC Testnet

      for (const user of users) {
        await earningsService.syncToDatabase(user.user_id);
      }

      console.log(`✅ Synced ${users.length} users from chain`);

    } catch (error) {
      console.error('❌ Chain sync error:', error);
    }
  });
}
```

---

## 4. 前端调用流程

### 4.1 用户调用Agent

```typescript
// components/ChatInput.tsx

const handleSendMessage = async (message: string) => {
  try {
    // 1. 检查用户余额（可选，后端也会检查）
    const balance = await getUserCredit();

    if (selectedAgent.price > 0 && balance < selectedAgent.price) {
      alert(`Insufficient credits. You need ${selectedAgent.price} credits.`);
      return;
    }

    // 2. 发送消息（后端会自动处理链上支付）
    const response = await sendMessage(
      message,
      chainId,
      selectedAgent.id,
      conversationId
    );

    // 3. 显示响应
    addMessage({
      role: 'assistant',
      content: response.response,
      timestamp: new Date()
    });

    // 4. 刷新余额
    await refreshUserBalance();

  } catch (error: any) {
    if (error.response?.status === 402) {
      alert('Payment failed: ' + error.response.data.message);
    } else {
      alert('Error: ' + error.message);
    }
  }
};
```

### 4.2 查看余额

```typescript
// services/api.ts

/**
 * 获取用户链上余额
 */
export const getUserOnChainBalances = async (chainId: number) => {
  const response = await api.get(`/credits/onchain-balances?chainId=${chainId}`);
  return response.data;
};
```

后端 API：

```typescript
// routes/creditRoutes.ts

router.get('/onchain-balances', async (req, res) => {
  const { chainId } = req.query;
  const userAddress = req.user.address;

  const earningsService = new AgentEarningsService(Number(chainId));
  const balances = await earningsService.getUserBalances(userAddress);

  res.json({
    creditBalance: balances.credits,
    earningsBalance: balances.earnings,
    source: 'blockchain'
  });
});
```

### 4.3 提现流程

```typescript
// components/CreatorDashboard.tsx

const handleWithdraw = async (amount: number) => {
  try {
    // 1. 用户签名请求提现
    const web3 = new Web3(window.ethereum);
    const accounts = await web3.eth.getAccounts();

    // 调用智能合约
    const contract = new web3.eth.Contract(
      AgentEarningsManagerABI,
      contractAddress
    );

    const tx = await contract.methods
      .requestWithdrawal(amount)
      .send({ from: accounts[0] });

    const requestId = tx.events.WithdrawalRequested.returnValues.requestId;

    // 2. 通知后端创建提现记录
    await api.post('/credits/withdrawal/on-chain', {
      requestId,
      amount,
      txHash: tx.transactionHash
    });

    alert(`Withdrawal request submitted! Request ID: ${requestId}`);

  } catch (error: any) {
    alert('Withdrawal failed: ' + error.message);
  }
};
```

---

## 5. 数据迁移

### 5.1 迁移现有数据到链上

创建迁移脚本 `scripts/migrate-to-chain.ts`：

```typescript
import { AgentEarningsService } from '../services/agentEarningsService';

async function migrateToChain() {
  console.log('🚀 Starting data migration to blockchain...');

  const chainId = 97; // BSC Testnet
  const earningsService = new AgentEarningsService(chainId);

  // 1. 迁移所有Agent
  const agents = await db.query('SELECT id, owner, price FROM agents WHERE price >= 0');

  console.log(`📦 Migrating ${agents.length} agents...`);

  for (const agent of agents) {
    try {
      const txHash = await earningsService.registerAgent(
        agent.id,
        agent.owner,
        agent.price || 0
      );

      console.log(`✅ Agent ${agent.id} migrated: ${txHash}`);

      await db.query(`
        UPDATE agents
        SET on_chain_tx_hash = ?
        WHERE id = ?
      `, [txHash, agent.id]);

      // 等待避免 nonce 冲突
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`❌ Failed to migrate agent ${agent.id}:`, error);
    }
  }

  // 2. 迁移用户余额
  const users = await db.query(`
    SELECT user_id, credit_balance, buy_balance
    FROM user_credits
    WHERE credit_balance > 0 OR buy_balance > 0
  `);

  console.log(`📦 Migrating ${users.length} user balances...`);

  // 批量添加credits
  const batchSize = 50;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    const addresses = batch.map(u => u.user_id);
    const amounts = batch.map(u => u.credit_balance || 0);

    try {
      await earningsService.contract.methods
        .batchAddCredits(addresses, amounts)
        .send({ from: serverAccount, gas: 5000000 });

      console.log(`✅ Batch ${i / batchSize + 1} migrated`);

    } catch (error) {
      console.error(`❌ Batch ${i / batchSize + 1} failed:`, error);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log('✅ Migration completed!');
}

migrateToChain()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
```

---

## 6. 测试方案

### 6.1 单元测试

创建 `test/AgentEarningsManager.test.js`：

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentEarningsManager", function () {
  let contract;
  let owner, user1, user2, agent1Owner;

  beforeEach(async function () {
    [owner, user1, user2, agent1Owner] = await ethers.getSigners();

    const AgentEarningsManager = await ethers.getContractFactory("AgentEarningsManager");
    contract = await AgentEarningsManager.deploy(ethers.constants.AddressZero);
    await contract.deployed();
  });

  it("Should register an agent", async function () {
    await contract.registerAgent(1, agent1Owner.address, 10);

    const agent = await contract.agents(1);
    expect(agent.owner).to.equal(agent1Owner.address);
    expect(agent.price).to.equal(10);
  });

  it("Should record agent call and distribute earnings", async function () {
    // Register agent
    await contract.registerAgent(1, agent1Owner.address, 10);

    // Add credits to user
    await contract.addCredits(user1.address, 100, "test");

    // Record agent call
    await contract.recordAgentCall(1, user1.address, "session-1");

    // Check balances
    const userBalance = await contract.creditBalance(user1.address);
    const ownerEarnings = await contract.earningsBalance(agent1Owner.address);

    expect(userBalance).to.equal(90); // 100 - 10
    expect(ownerEarnings).to.equal(10);
  });

  it("Should handle withdrawal request", async function () {
    // Add earnings to user
    await contract.addCredits(agent1Owner.address, 100, "test");

    // Manually set earnings
    // (In real scenario, earnings come from agent calls)

    // Request withdrawal
    await contract.connect(agent1Owner).requestWithdrawal(50);

    const withdrawalRequest = await contract.withdrawalRequests(1);
    expect(withdrawalRequest.amount).to.equal(50);
    expect(withdrawalRequest.processed).to.equal(false);
  });
});
```

运行测试：

```bash
npx hardhat test
```

---

## 7. 总结

### 7.1 优势

✅ **安全性**
- 数据存储在区块链上，不可篡改
- 黑客无法通过数据库修改余额

✅ **透明性**
- 所有交易可追溯
- 收益分配公开透明

✅ **去中心化**
- 符合Web3精神
- 用户信任度高

### 7.2 部署顺序

1. ✅ 部署智能合约
2. ✅ 配置后端服务
3. ✅ 数据迁移
4. ✅ 前端集成
5. ✅ 测试验证
6. ✅ 正式上线

### 7.3 维护

- 定期监控链上数据
- 同步数据库缓存
- 处理提现请求
- 安全审计

---

## 📞 支持

如有问题，请参考：
- [Hardhat文档](https://hardhat.org/)
- [Web3.js文档](https://web3js.readthedocs.io/)
- [Solidity文档](https://docs.soliditylang.org/)

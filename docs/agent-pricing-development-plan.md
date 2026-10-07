# Agent定价系统 - 完整开发流程方案

## 📋 项目架构分析

### 1.1 前端技术栈（ai-dapp）
```
框架: React 18.2.0 + TypeScript 4.9.4
UI库: Ant Design 5.21.4
路由: React Router DOM 6.6.2
状态管理: Context API
HTTP客户端: Axios 0.27.2
区块链:
  - Web3.js 1.95.4
  - Solana Web3.js + Wallet Adapter
  - Ethers.js 6.13.4
构建工具: React Scripts 5.0.1
端口: 3000
代理: http://localhost:8080
```

**现有关键文件**：
- `src/services/api.ts` - API接口定义（已有CreditInfo接口）
- `src/components/AgentMarketplace.tsx` - Agent市场页面
- `src/components/Chat.tsx` - 对话页面
- `src/components/Marketplace.tsx` - 市场组件

### 1.2 后端技术栈（ai-server）
```
框架: Express.js 4.17.1
数据库: MySQL2 2.3.0
认证: JWT (jsonwebtoken 8.5.1)
AI服务:
  - OpenAI 4.56.0
  - Anthropic SDK 0.32.1
  - Google Generative AI 0.21.0
区块链:
  - Web3 1.5.2
  - Solana Web3.js 1.95.4
  - Anchor 0.26.0
任务调度: node-cron 3.0.3
文件上传: multer 1.4.5
端口: 8080
```

**现有关键模块**：
- `src/services/creditService.js` - Credit服务（已实现双余额系统）
- `src/controllers/creditController.js` - Credit控制器
- `src/controllers/agentController.js` - Agent控制器
- `src/services/databaseService.js` - 数据库服务
- `src/routes/agentRoutes.js` - Agent路由
- `src/routes/creditRoutes.js` - Credit路由

### 1.3 现有数据库表结构

**已有表**：
```sql
-- 用户Credits表（已存在）
CREATE TABLE user_credits (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(42) UNIQUE NOT NULL,
  credit_balance INT DEFAULT 20,        -- 免费credits
  buy_balance INT DEFAULT 0,            -- 购买的credits
  last_used_at TIMESTAMP,
  last_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agents表（已存在，需扩展）
CREATE TABLE agents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50),
  is_public BOOLEAN DEFAULT false,
  owner VARCHAR(42) NOT NULL,
  imageUrl VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 需要添加: price INT DEFAULT 0
);

-- Credit购买记录（已存在）
CREATE TABLE credit_purchases (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(42) NOT NULL,
  plan_id VARCHAR(50),
  credits INT NOT NULL,
  price DECIMAL(10, 2),
  transaction_hash VARCHAR(100),
  purchase_type VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credit消费记录（已存在）
CREATE TABLE credit_consumption (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(42) NOT NULL,
  amount INT NOT NULL,
  type VARCHAR(20),
  use_id VARCHAR(36),
  conversation_id VARCHAR(36),
  message_type VARCHAR(50),
  task_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 对话历史（已存在）
CREATE TABLE chat_history (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(42) NOT NULL,
  agent_id INT,
  role VARCHAR(20),
  content MEDIUMTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📊 数据库改造方案

### Phase 1: 核心表扩展和新增

#### 1.1 扩展agents表
```sql
-- 添加价格字段
ALTER TABLE agents ADD COLUMN price INT DEFAULT 0 COMMENT '每次调用价格(credits)';
ALTER TABLE agents ADD COLUMN total_calls INT DEFAULT 0 COMMENT '总调用次数';
ALTER TABLE agents ADD COLUMN total_earnings INT DEFAULT 0 COMMENT '总收益(credits)';
ALTER TABLE agents ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 添加索引
CREATE INDEX idx_agents_price ON agents(price);
CREATE INDEX idx_agents_owner ON agents(owner);
CREATE INDEX idx_agents_public_price ON agents(is_public, price);
```

#### 1.2 创建创建者账户表
```sql
CREATE TABLE creator_accounts (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(42) UNIQUE NOT NULL COMMENT '创建者钱包地址',
  total_earnings INT DEFAULT 0 COMMENT '总收益(credits)',
  available_balance INT DEFAULT 0 COMMENT '可提现余额',
  pending_balance INT DEFAULT 0 COMMENT '提现处理中',
  total_withdrawn INT DEFAULT 0 COMMENT '已提现总额',
  withdrawn_usdt DECIMAL(10, 2) DEFAULT 0 COMMENT '已提现USDT总额',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_creator_id (creator_id),
  INDEX idx_available_balance (available_balance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='创建者账户表';
```

#### 1.3 创建收益记录表
```sql
CREATE TABLE creator_earnings (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(42) NOT NULL COMMENT '创建者地址',
  agent_id INT NOT NULL COMMENT 'Agent ID',
  user_id VARCHAR(42) NOT NULL COMMENT '付费用户地址',
  amount INT NOT NULL COMMENT '收益金额(credits)',
  conversation_id VARCHAR(36) COMMENT '对话ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_creator_time (creator_id, created_at),
  INDEX idx_agent_time (agent_id, created_at),
  INDEX idx_user_time (user_id, created_at),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='创建者收益明细表';
```

#### 1.4 创建提现记录表
```sql
CREATE TABLE withdrawals (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(42) NOT NULL COMMENT '创建者地址',
  amount INT NOT NULL COMMENT '提现credits数量',
  usdt_amount DECIMAL(10, 2) NOT NULL COMMENT '实际USDT金额',
  fee DECIMAL(10, 2) NOT NULL COMMENT '手续费(USDT)',
  exchange_rate DECIMAL(10, 4) NOT NULL DEFAULT 0.03 COMMENT '兑换比例(USDT/credit)',
  usdt_address VARCHAR(100) NOT NULL COMMENT 'USDT接收地址',
  network VARCHAR(20) DEFAULT 'TRC20' COMMENT '网络类型',
  status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  tx_hash VARCHAR(100) COMMENT '链上交易哈希',
  admin_note TEXT COMMENT '管理员备注',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL COMMENT '处理时间',
  completed_at TIMESTAMP NULL COMMENT '完成时间',

  INDEX idx_creator_status (creator_id, status),
  INDEX idx_status_time (status, created_at),
  INDEX idx_tx_hash (tx_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提现记录表';
```

#### 1.5 扩展调用记录表
```sql
-- 扩展credit_consumption表，增加Agent相关字段
ALTER TABLE credit_consumption ADD COLUMN agent_id INT COMMENT 'Agent ID';
ALTER TABLE credit_consumption ADD COLUMN price INT DEFAULT 0 COMMENT 'Agent价格';
ALTER TABLE credit_consumption ADD COLUMN balance_type ENUM('buyBalance', 'creditBalance') DEFAULT 'buyBalance' COMMENT '扣费类型';

-- 添加索引
CREATE INDEX idx_consumption_agent (agent_id, created_at);
CREATE INDEX idx_consumption_user_agent (user_id, agent_id);
```

#### 1.6 创建Agent调用统计表
```sql
CREATE TABLE agent_call_stats (
  id VARCHAR(36) PRIMARY KEY,
  agent_id INT NOT NULL COMMENT 'Agent ID',
  date DATE NOT NULL COMMENT '统计日期',
  call_count INT DEFAULT 0 COMMENT '调用次数',
  unique_users INT DEFAULT 0 COMMENT '独立用户数',
  total_earnings INT DEFAULT 0 COMMENT '当日收益',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_agent_date (agent_id, date),
  INDEX idx_agent_date (agent_id, date),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent每日调用统计';
```

### Phase 2: 数据迁移脚本

```sql
-- 迁移脚本: 初始化创建者账户
INSERT INTO creator_accounts (id, creator_id, total_earnings, available_balance)
SELECT
  UUID() as id,
  owner as creator_id,
  0 as total_earnings,
  0 as available_balance
FROM agents
WHERE owner NOT IN (SELECT creator_id FROM creator_accounts)
GROUP BY owner;

-- 迁移脚本: 初始化Agent统计数据
INSERT INTO agent_call_stats (id, agent_id, date, call_count, unique_users, total_earnings)
SELECT
  UUID() as id,
  agent_id,
  DATE(created_at) as date,
  COUNT(*) as call_count,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(amount) as total_earnings
FROM credit_consumption
WHERE agent_id IS NOT NULL
GROUP BY agent_id, DATE(created_at)
ON DUPLICATE KEY UPDATE
  call_count = VALUES(call_count),
  unique_users = VALUES(unique_users),
  total_earnings = VALUES(total_earnings);
```

---

## 🔧 后端开发方案

### Phase 1: 数据库和Service层（第1-2周）

#### 1.1 执行数据库迁移
**文件**: `ai-server/migrations/001_add_pricing_system.sql`
```sql
-- 见上述"数据库改造方案"中的所有SQL语句
```

**执行方式**:
```bash
cd ai-server
mysql -u root -p gameland_db < migrations/001_add_pricing_system.sql
```

#### 1.2 创建CreatorService
**文件**: `ai-server/src/services/creatorService.js`

```javascript
const UUID = require('uuid');
const db = require('../config/database');

class CreatorService {

  async query(sql, params) {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (error, results) => {
        if (error) reject(error);
        else resolve(results);
      });
    });
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

  // 初始化创建者账户
  async initializeCreatorAccount(creatorId) {
    const dbCreatorId = this.generateDatabaseUserId(creatorId);
    const existing = await this.query(
      'SELECT * FROM creator_accounts WHERE creator_id = ?',
      [dbCreatorId]
    );

    if (existing.length === 0) {
      await this.query(
        `INSERT INTO creator_accounts (id, creator_id) VALUES (?, ?)`,
        [UUID.v4(), dbCreatorId]
      );
    }
  }

  // 获取创建者账户信息
  async getCreatorAccount(creatorId) {
    const dbCreatorId = this.generateDatabaseUserId(creatorId);
    await this.initializeCreatorAccount(creatorId);

    const results = await this.query(
      `SELECT * FROM creator_accounts WHERE creator_id = ?`,
      [dbCreatorId]
    );

    return results[0];
  }

  // 分配收益给创建者（事务）
  async allocateEarnings(creatorId, agentId, amount, userId, conversationId) {
    const dbCreatorId = this.generateDatabaseUserId(creatorId);
    const dbUserId = this.generateDatabaseUserId(userId);

    try {
      await this.query('START TRANSACTION');

      // 1. 创建收益记录
      await this.query(
        `INSERT INTO creator_earnings (id, creator_id, agent_id, user_id, amount, conversation_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [UUID.v4(), dbCreatorId, agentId, dbUserId, amount, conversationId]
      );

      // 2. 更新创建者账户
      await this.query(
        `UPDATE creator_accounts
         SET total_earnings = total_earnings + ?,
             available_balance = available_balance + ?
         WHERE creator_id = ?`,
        [amount, amount, dbCreatorId]
      );

      // 3. 更新Agent统计
      await this.query(
        `UPDATE agents
         SET total_calls = total_calls + 1,
             total_earnings = total_earnings + ?
         WHERE id = ?`,
        [amount, agentId]
      );

      // 4. 更新每日统计
      await this.query(
        `INSERT INTO agent_call_stats (id, agent_id, date, call_count, unique_users, total_earnings)
         VALUES (?, ?, CURDATE(), 1, 1, ?)
         ON DUPLICATE KEY UPDATE
           call_count = call_count + 1,
           total_earnings = total_earnings + ?`,
        [UUID.v4(), agentId, amount, amount]
      );

      await this.query('COMMIT');
      console.log(`Earnings allocated: creator=${dbCreatorId}, agent=${agentId}, amount=${amount}`);

    } catch (error) {
      await this.query('ROLLBACK');
      console.error('Earnings allocation failed:', error);
      throw error;
    }
  }

  // 获取收益明细
  async getEarningsTransactions(creatorId, { page = 1, pageSize = 20, agentId, startDate, endDate }) {
    const dbCreatorId = this.generateDatabaseUserId(creatorId);
    const offset = (page - 1) * pageSize;

    let whereClauses = ['ce.creator_id = ?'];
    let params = [dbCreatorId];

    if (agentId) {
      whereClauses.push('ce.agent_id = ?');
      params.push(agentId);
    }
    if (startDate) {
      whereClauses.push('ce.created_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push('ce.created_at <= ?');
      params.push(endDate);
    }

    const whereClause = whereClauses.join(' AND ');

    const [transactions, countResult] = await Promise.all([
      this.query(
        `SELECT ce.*, a.name as agent_name
         FROM creator_earnings ce
         LEFT JOIN agents a ON ce.agent_id = a.id
         WHERE ${whereClause}
         ORDER BY ce.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      ),
      this.query(
        `SELECT COUNT(*) as total FROM creator_earnings ce WHERE ${whereClause}`,
        params
      )
    ]);

    return {
      total: countResult[0].total,
      transactions
    };
  }

  // 获取收益概览
  async getEarningsOverview(creatorId) {
    const dbCreatorId = this.generateDatabaseUserId(creatorId);
    const account = await this.getCreatorAccount(creatorId);

    // 获取Top Agents
    const topAgents = await this.query(
      `SELECT
         a.id as agentId,
         a.name as agentName,
         a.total_earnings as earnings,
         a.total_calls as callCount
       FROM agents a
       WHERE a.owner = ?
       ORDER BY a.total_earnings DESC
       LIMIT 5`,
      [dbCreatorId]
    );

    return {
      totalEarnings: account.total_earnings,
      availableBalance: account.available_balance,
      pendingBalance: account.pending_balance,
      totalWithdrawn: account.total_withdrawn,
      topAgents
    };
  }

  // 申请提现
  async requestWithdrawal(creatorId, { amount, usdtAddress, network = 'TRC20' }) {
    const dbCreatorId = this.generateDatabaseUserId(creatorId);

    // 参数验证
    if (amount < 100) {
      throw new Error('Minimum withdrawal is 100 credits');
    }

    const account = await this.getCreatorAccount(creatorId);

    if (account.available_balance < amount) {
      throw new Error('Insufficient available balance');
    }

    const exchangeRate = 0.03; // 1 credit = 0.03 USDT
    const feeRate = 0.02; // 2% fee
    const usdtAmount = amount * exchangeRate;
    const fee = usdtAmount * feeRate;
    const finalAmount = usdtAmount - fee;

    try {
      await this.query('START TRANSACTION');

      // 1. 创建提现记录
      const withdrawalId = UUID.v4();
      await this.query(
        `INSERT INTO withdrawals (
          id, creator_id, amount, usdt_amount, fee, exchange_rate,
          usdt_address, network, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [withdrawalId, dbCreatorId, amount, finalAmount, fee, exchangeRate, usdtAddress, network]
      );

      // 2. 锁定余额
      await this.query(
        `UPDATE creator_accounts
         SET available_balance = available_balance - ?,
             pending_balance = pending_balance + ?
         WHERE creator_id = ? AND available_balance >= ?`,
        [amount, amount, dbCreatorId, amount]
      );

      await this.query('COMMIT');

      return {
        withdrawalId,
        amount,
        usdtAmount: finalAmount,
        fee,
        status: 'pending',
        estimatedArrival: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };

    } catch (error) {
      await this.query('ROLLBACK');
      throw error;
    }
  }

  // 获取提现记录
  async getWithdrawalHistory(creatorId, { page = 1, pageSize = 20 }) {
    const dbCreatorId = this.generateDatabaseUserId(creatorId);
    const offset = (page - 1) * pageSize;

    const [withdrawals, countResult] = await Promise.all([
      this.query(
        `SELECT * FROM withdrawals
         WHERE creator_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [dbCreatorId, pageSize, offset]
      ),
      this.query(
        `SELECT COUNT(*) as total FROM withdrawals WHERE creator_id = ?`,
        [dbCreatorId]
      )
    ]);

    return {
      total: countResult[0].total,
      withdrawals
    };
  }

  // 管理员：处理提现（审核通过）
  async processWithdrawal(withdrawalId, txHash) {
    const withdrawal = await this.query(
      'SELECT * FROM withdrawals WHERE id = ?',
      [withdrawalId]
    );

    if (withdrawal.length === 0) {
      throw new Error('Withdrawal not found');
    }

    if (withdrawal[0].status !== 'pending') {
      throw new Error('Withdrawal already processed');
    }

    try {
      await this.query('START TRANSACTION');

      // 1. 更新提现状态
      await this.query(
        `UPDATE withdrawals
         SET status = 'completed',
             tx_hash = ?,
             processed_at = NOW(),
             completed_at = NOW()
         WHERE id = ?`,
        [txHash, withdrawalId]
      );

      // 2. 更新创建者账户
      await this.query(
        `UPDATE creator_accounts
         SET pending_balance = pending_balance - ?,
             total_withdrawn = total_withdrawn + ?,
             withdrawn_usdt = withdrawn_usdt + ?
         WHERE creator_id = ?`,
        [withdrawal[0].amount, withdrawal[0].amount, withdrawal[0].usdt_amount, withdrawal[0].creator_id]
      );

      await this.query('COMMIT');
      console.log(`Withdrawal completed: ${withdrawalId}, tx=${txHash}`);

    } catch (error) {
      await this.query('ROLLBACK');
      throw error;
    }
  }

  // 管理员：拒绝提现
  async rejectWithdrawal(withdrawalId, adminNote) {
    const withdrawal = await this.query(
      'SELECT * FROM withdrawals WHERE id = ?',
      [withdrawalId]
    );

    if (withdrawal.length === 0) {
      throw new Error('Withdrawal not found');
    }

    try {
      await this.query('START TRANSACTION');

      // 1. 更新提现状态
      await this.query(
        `UPDATE withdrawals
         SET status = 'failed',
             admin_note = ?,
             processed_at = NOW()
         WHERE id = ?`,
        [adminNote, withdrawalId]
      );

      // 2. 退回余额
      await this.query(
        `UPDATE creator_accounts
         SET available_balance = available_balance + ?,
             pending_balance = pending_balance - ?
         WHERE creator_id = ?`,
        [withdrawal[0].amount, withdrawal[0].amount, withdrawal[0].creator_id]
      );

      await this.query('COMMIT');

    } catch (error) {
      await this.query('ROLLBACK');
      throw error;
    }
  }
}

module.exports = new CreatorService();
```

#### 1.3 修改AgentService
**文件**: `ai-server/src/services/agentService.js` (扩展现有文件)

添加以下方法：
```javascript
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

  return { agentId, price, updatedAt: new Date().toISOString() };
}

// 获取Agent价格
async getAgentPrice(agentId) {
  const result = await this.query(
    'SELECT price FROM agents WHERE id = ?',
    [agentId]
  );

  return result[0]?.price || 0;
}
```

#### 1.4 修改CreditService - 添加Agent调用扣费
**文件**: `ai-server/src/services/creditService.js` (扩展现有文件)

添加方法：
```javascript
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
      await this.query(
        `UPDATE user_credits
         SET buy_balance = buy_balance - ?,
             last_used_at = NOW()
         WHERE user_id = ? AND buy_balance >= ?`,
        [price, dbUserId, price]
      );

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
    return true;

  } catch (error) {
    await this.query('ROLLBACK');
    throw error;
  }
}
```

### Phase 2: Controller和Router层（第3周）

#### 2.1 创建CreatorController
**文件**: `ai-server/src/controllers/creatorController.js`

```javascript
const CreatorService = require('../services/creatorService');

// 获取创建者收益概览
exports.getEarningsOverview = async (req, res) => {
  try {
    const overview = await CreatorService.getEarningsOverview(req.userId);
    res.json({ success: true, data: overview });
  } catch (error) {
    console.error('Error getting earnings overview:', error);
    res.status(500).json({ error: 'Failed to get earnings overview' });
  }
};

// 获取收益明细
exports.getEarningsTransactions = async (req, res) => {
  try {
    const { page, pageSize, agentId, startDate, endDate } = req.query;
    const result = await CreatorService.getEarningsTransactions(req.userId, {
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20,
      agentId,
      startDate,
      endDate
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting earnings transactions:', error);
    res.status(500).json({ error: 'Failed to get earnings transactions' });
  }
};

// 申请提现
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, usdtAddress, network } = req.body;

    if (!amount || !usdtAddress) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const result = await CreatorService.requestWithdrawal(req.userId, {
      amount: parseInt(amount),
      usdtAddress,
      network: network || 'TRC20'
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error requesting withdrawal:', error);
    res.status(400).json({ error: error.message });
  }
};

// 获取提现记录
exports.getWithdrawalHistory = async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await CreatorService.getWithdrawalHistory(req.userId, {
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting withdrawal history:', error);
    res.status(500).json({ error: 'Failed to get withdrawal history' });
  }
};

// 管理员：处理提现
exports.processWithdrawal = async (req, res) => {
  try {
    // TODO: 添加管理员权限验证
    const { withdrawalId, txHash } = req.body;
    await CreatorService.processWithdrawal(withdrawalId, txHash);
    res.json({ success: true, message: 'Withdrawal processed successfully' });
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(400).json({ error: error.message });
  }
};

// 管理员：拒绝提现
exports.rejectWithdrawal = async (req, res) => {
  try {
    // TODO: 添加管理员权限验证
    const { withdrawalId, adminNote } = req.body;
    await CreatorService.rejectWithdrawal(withdrawalId, adminNote);
    res.json({ success: true, message: 'Withdrawal rejected' });
  } catch (error) {
    console.error('Error rejecting withdrawal:', error);
    res.status(400).json({ error: error.message });
  }
};
```

#### 2.2 扩展AgentController
**文件**: `ai-server/src/controllers/agentController.js` (添加方法)

```javascript
// 设置Agent价格
exports.setAgentPrice = async (req, res) => {
  const { agentId } = req.params;
  const { price } = req.body;

  try {
    if (price === undefined || price === null) {
      return res.status(400).json({ error: 'Price is required' });
    }

    const AgentService = require('../services/agentService');
    const result = await AgentService.setAgentPrice(
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

#### 2.3 修改ChatController - 集成付费逻辑
**文件**: `ai-server/src/controllers/chatController.js` (修改现有sendMessage方法)

```javascript
exports.sendMessage = async (req, res) => {
  const { message, agentId, conversationId, chainid } = req.body;
  const userId = req.userId;

  try {
    // 1. 获取Agent信息和价格
    const AgentService = require('../services/agentService');
    const agent = await AgentService.getAgentDetails(agentId);
    const price = agent.price || 0;

    // 2. 扣费（根据价格判断使用哪个balance）
    const CreditService = require('../services/creditService');
    await CreditService.consumeForAgent(userId, agentId, price, conversationId);

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

    // 5. 保存对话记录
    const DatabaseService = require('../services/databaseService');
    await DatabaseService.saveConversation(userId, conversationId, agentId, 'user', message);
    await DatabaseService.saveConversation(userId, conversationId, agentId, 'assistant', response);

    res.json({ success: true, response });

  } catch (error) {
    console.error('Error sending message:', error);

    // 针对余额不足返回特定错误码
    if (error.message === 'INSUFFICIENT_BUY_BALANCE') {
      return res.status(402).json({
        error: 'Insufficient buyBalance',
        errorCode: 'INSUFFICIENT_BUY_BALANCE',
        requiredBalance: price
      });
    }

    if (error.message === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({
        error: 'Insufficient credits',
        errorCode: 'INSUFFICIENT_CREDITS'
      });
    }

    res.status(500).json({ error: 'Failed to send message' });
  }
};
```

#### 2.4 创建CreatorRoutes
**文件**: `ai-server/src/routes/creatorRoutes.js`

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

// 管理员接口
router.post('/admin/withdraw/process', creatorController.processWithdrawal);
router.post('/admin/withdraw/reject', creatorController.rejectWithdrawal);

module.exports = router;
```

#### 2.5 扩展AgentRoutes
**文件**: `ai-server/src/routes/agentRoutes.js` (添加路由)

```javascript
// 在现有路由基础上添加：
router.put('/:agentId/price', agentController.setAgentPrice);
```

#### 2.6 注册路由到主应用
**文件**: `ai-server/src/app.js` (或 `server.js`)

```javascript
// 添加创建者路由
const creatorRoutes = require('./routes/creatorRoutes');
app.use('/api/creator', creatorRoutes);
```

---

## 🎨 前端开发方案

### Phase 1: API接口层（第4周）

#### 1.1 扩展API接口定义
**文件**: `ai-dapp/src/services/api.ts` (扩展现有文件)

```typescript
// ============ Creator相关接口 ============

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

export interface EarningsTransaction {
  id: string;
  agentId: number;
  agentName: string;
  userId: string;
  amount: number;
  conversationId: string;
  created_at: string;
}

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

// 设置Agent价格
export const setAgentPrice = async (agentId: number, price: number) => {
  const response = await api.put(`/agents/${agentId}/price`, { price });
  return response.data;
};

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

// 扩展Agent接口
export interface AgentWithPrice extends Agent {
  price: number;
  total_calls: number;
  total_earnings: number;
}
```

### Phase 2: UI组件开发（第5-6周）

#### 2.1 创建Agent定价设置组件
**文件**: `ai-dapp/src/components/AgentPricingModal.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Modal, InputNumber, Radio, message, Space, Typography } from 'antd';
import { setAgentPrice } from '../services/api';

const { Text } = Typography;

interface AgentPricingModalProps {
  visible: boolean;
  agentId: number;
  currentPrice: number;
  onClose: () => void;
  onSuccess: () => void;
}

const AgentPricingModal: React.FC<AgentPricingModalProps> = ({
  visible,
  agentId,
  currentPrice,
  onClose,
  onSuccess
}) => {
  const [price, setPrice] = useState<number>(currentPrice);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPrice(currentPrice);
  }, [currentPrice]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      await setAgentPrice(agentId, price);
      message.success('价格设置成功');
      onSuccess();
      onClose();
    } catch (error: any) {
      message.error(error.message || '价格设置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="设置Agent价格"
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={loading}
      okText="保存"
      cancelText="取消"
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Text strong>调用价格</Text>
          <InputNumber
            value={price}
            onChange={(val) => setPrice(val || 0)}
            min={0}
            precision={0}
            style={{ width: '100%', marginTop: 8 }}
            addonAfter="credits/次"
          />
        </div>

        <Radio.Group
          value={price > 0 ? 'paid' : 'free'}
          onChange={(e) => setPrice(e.target.value === 'free' ? 0 : 10)}
        >
          <Space direction="vertical">
            <Radio value="free">免费Agent (0 credits)</Radio>
            <Radio value="paid">付费Agent</Radio>
          </Space>
        </Radio.Group>

        <div style={{ background: '#f0f2f5', padding: 12, borderRadius: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            💡 说明：<br />
            • 设置为0即为免费Agent<br />
            • 付费Agent只能使用buyBalance<br />
            • 价格为整数，建议1-1000 credits
          </Text>
        </div>
      </Space>
    </Modal>
  );
};

export default AgentPricingModal;
```

#### 2.2 修改AgentMarketplace显示价格
**文件**: `ai-dapp/src/components/AgentMarketplace.tsx` (扩展现有文件)

在Agent卡片中添加价格显示：
```typescript
<div className="agent-card">
  <h3>{agent.name}</h3>
  <p>{agent.description}</p>

  {/* 新增：价格显示 */}
  <div style={{
    background: agent.price > 0 ? '#fff7e6' : '#f6ffed',
    padding: '8px 12px',
    borderRadius: '4px',
    marginBottom: '12px'
  }}>
    {agent.price > 0 ? (
      <>
        <Text strong style={{ color: '#fa8c16', fontSize: 16 }}>
          💳 {agent.price} credits/次
        </Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>
          ≈ ${(agent.price * 0.04).toFixed(2)} USD
        </Text>
      </>
    ) : (
      <Text strong style={{ color: '#52c41a' }}>
        🎁 免费使用
      </Text>
    )}
  </div>

  {/* 原有的按钮... */}
</div>
```

#### 2.3 创建创建者收益页面
**文件**: `ai-dapp/src/components/CreatorEarnings.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Card, Statistic, Row, Col, Table, Button, message, Modal, Input, Select } from 'antd';
import {
  getCreatorEarningsOverview,
  getCreatorEarningsTransactions,
  requestWithdrawal,
  getWithdrawalHistory
} from '../services/api';
import type { CreatorEarningsOverview, EarningsTransaction, WithdrawalRecord } from '../services/api';

const CreatorEarnings: React.FC = () => {
  const [overview, setOverview] = useState<CreatorEarningsOverview | null>(null);
  const [transactions, setTransactions] = useState<EarningsTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [usdtAddress, setUsdtAddress] = useState<string>('');

  useEffect(() => {
    fetchOverview();
    fetchTransactions();
    fetchWithdrawals();
  }, []);

  const fetchOverview = async () => {
    try {
      const data = await getCreatorEarningsOverview();
      setOverview(data);
    } catch (error) {
      message.error('获取收益概览失败');
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const result = await getCreatorEarningsTransactions({ page: 1, pageSize: 20 });
      setTransactions(result.transactions);
    } catch (error) {
      message.error('获取收益明细失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchWithdrawals = async () => {
    try {
      const result = await getWithdrawalHistory({ page: 1, pageSize: 10 });
      setWithdrawals(result.withdrawals);
    } catch (error) {
      message.error('获取提现记录失败');
    }
  };

  const handleWithdraw = async () => {
    if (!usdtAddress || withdrawAmount < 100) {
      message.error('请填写正确的提现信息（最低100 credits）');
      return;
    }

    try {
      await requestWithdrawal({
        amount: withdrawAmount,
        usdtAddress,
        network: 'TRC20'
      });
      message.success('提现申请已提交');
      setWithdrawModalVisible(false);
      fetchOverview();
      fetchWithdrawals();
    } catch (error: any) {
      message.error(error.message || '提现申请失败');
    }
  };

  const transactionColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString()
    },
    {
      title: 'Agent',
      dataIndex: 'agentName',
      key: 'agentName'
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `+${amount} credits`
    },
    {
      title: '用户',
      dataIndex: 'userId',
      key: 'userId',
      render: (text: string) => `${text.substring(0, 6)}...${text.substring(text.length - 4)}`
    }
  ];

  const withdrawalColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString()
    },
    {
      title: 'Credits',
      dataIndex: 'amount',
      key: 'amount'
    },
    {
      title: 'USDT金额',
      dataIndex: 'usdtAmount',
      key: 'usdtAmount',
      render: (amount: number) => `$${amount.toFixed(2)}`
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: any = {
          pending: { text: '待处理', color: 'orange' },
          processing: { text: '处理中', color: 'blue' },
          completed: { text: '已完成', color: 'green' },
          failed: { text: '已失败', color: 'red' }
        };
        return <span style={{ color: statusMap[status]?.color }}>{statusMap[status]?.text}</span>;
      }
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2>创建者收益</h2>

      {/* 收益概览 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总收益"
              value={overview?.totalEarnings || 0}
              suffix="credits"
            />
            <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              ≈ ${((overview?.totalEarnings || 0) * 0.03).toFixed(2)} USDT
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="可提现"
              value={overview?.availableBalance || 0}
              suffix="credits"
              valueStyle={{ color: '#3f8600' }}
            />
            <Button
              type="primary"
              style={{ marginTop: 12 }}
              onClick={() => setWithdrawModalVisible(true)}
              disabled={(overview?.availableBalance || 0) < 100}
            >
              提现
            </Button>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="提现中"
              value={overview?.pendingBalance || 0}
              suffix="credits"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已提现"
              value={overview?.totalWithdrawn || 0}
              suffix="credits"
            />
          </Card>
        </Col>
      </Row>

      {/* Top Agents */}
      <Card title="收益排行" style={{ marginBottom: 24 }}>
        {overview?.topAgents.map((agent, index) => (
          <div key={agent.agentId} style={{
            padding: '12px 0',
            borderBottom: index < overview.topAgents.length - 1 ? '1px solid #f0f0f0' : 'none'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{index + 1}. {agent.agentName}</span>
              <span>
                <strong>{agent.earnings} credits</strong> | {agent.callCount}次调用
              </span>
            </div>
          </div>
        ))}
      </Card>

      {/* 收益明细 */}
      <Card title="收益明细" style={{ marginBottom: 24 }}>
        <Table
          columns={transactionColumns}
          dataSource={transactions}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 提现记录 */}
      <Card title="提现记录">
        <Table
          columns={withdrawalColumns}
          dataSource={withdrawals}
          rowKey="id"
          pagination={false}
        />
      </Card>

      {/* 提现Modal */}
      <Modal
        title="提现到USDT"
        open={withdrawModalVisible}
        onOk={handleWithdraw}
        onCancel={() => setWithdrawModalVisible(false)}
        okText="确认提现"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>可提现余额</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>
            {overview?.availableBalance || 0} credits
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>提现数量（最低100）</div>
          <InputNumber
            value={withdrawAmount}
            onChange={(val) => setWithdrawAmount(val || 0)}
            min={100}
            max={overview?.availableBalance || 0}
            style={{ width: '100%' }}
            addonAfter="credits"
          />
        </div>

        {withdrawAmount > 0 && (
          <div style={{ marginBottom: 16, background: '#f0f2f5', padding: 12, borderRadius: 4 }}>
            <div>到账金额：${(withdrawAmount * 0.03 * 0.98).toFixed(2)} USDT（扣除2%手续费）</div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>USDT接收地址（TRC20）</div>
          <Input
            value={usdtAddress}
            onChange={(e) => setUsdtAddress(e.target.value)}
            placeholder="请输入TRC20 USDT地址"
          />
        </div>

        <div style={{ fontSize: 12, color: '#888' }}>
          💡 说明：<br />
          • 兑换比例：1 credit = 0.03 USDT<br />
          • 平台手续费：2%<br />
          • 到账时间：申请后7个工作日
        </div>
      </Modal>
    </div>
  );
};

export default CreatorEarnings;
```

#### 2.4 修改Chat组件处理余额不足
**文件**: `ai-dapp/src/components/Chat.tsx` (修改sendMessage方法)

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
        Modal.confirm({
          title: '余额不足',
          content: (
            <div>
              <p>当前余额不足以使用此付费Agent</p>
              <p>需要：{error.response.data.requiredBalance} credits</p>
              <p>您的buyBalance余额不足</p>
            </div>
          ),
          okText: '去充值',
          cancelText: '取消',
          onOk: () => {
            // 跳转到充值页面
            window.location.href = '/pricing';
          }
        });
      } else if (errorCode === 'INSUFFICIENT_CREDITS') {
        message.error('Credits余额不足，请充值');
      }
    } else {
      message.error(error.message || '发送失败');
    }
  } finally {
    setLoading(false);
  }
};
```

#### 2.5 添加路由
**文件**: `ai-dapp/src/App.tsx` (或路由配置文件)

```typescript
import CreatorEarnings from './components/CreatorEarnings';

// 在路由配置中添加
<Route path="/creator/earnings" element={<CreatorEarnings />} />
```

---

## 📅 完整开发时间表

### Week 1-2: 数据库和后端Service层
- [ ] 执行数据库迁移脚本
- [ ] 创建CreatorService.js
- [ ] 扩展AgentService.js（价格相关）
- [ ] 扩展CreditService.js（Agent调用扣费）
- [ ] 单元测试

### Week 3: 后端Controller和Router层
- [ ] 创建CreatorController.js
- [ ] 扩展AgentController.js
- [ ] 修改ChatController.js（集成付费逻辑）
- [ ] 创建CreatorRoutes.js
- [ ] 扩展AgentRoutes.js
- [ ] 注册路由到主应用
- [ ] API集成测试

### Week 4: 前端API层
- [ ] 扩展api.ts接口定义
- [ ] 添加TypeScript类型
- [ ] API接口测试

### Week 5: 前端UI组件（第一批）
- [ ] AgentPricingModal组件
- [ ] 修改AgentMarketplace显示价格
- [ ] 修改Chat组件处理余额不足
- [ ] 组件单元测试

### Week 6: 前端UI组件（第二批）
- [ ] CreatorEarnings完整页面
- [ ] 提现Modal
- [ ] 收益明细表格
- [ ] 添加路由配置
- [ ] 前端集成测试

### Week 7: 管理员后台（可选）
- [ ] 管理员权限中间件
- [ ] 提现审核页面
- [ ] 平台数据统计Dashboard
- [ ] 异常监控和告警

### Week 8: 测试和上线
- [ ] 端到端测试
- [ ] 性能测试
- [ ] 安全测试
- [ ] 生产环境部署
- [ ] 监控和日志配置

---

## 🔍 测试方案

### 单元测试
```javascript
// 示例：测试CreatorService
describe('CreatorService', () => {
  test('allocateEarnings should update creator account', async () => {
    const result = await CreatorService.allocateEarnings(
      'creator_address',
      1, // agentId
      10, // amount
      'user_address',
      'conversation_id'
    );
    // 验证数据库状态
  });

  test('requestWithdrawal should fail if amount < 100', async () => {
    await expect(
      CreatorService.requestWithdrawal('creator_address', {
        amount: 50,
        usdtAddress: 'TXxx...'
      })
    ).rejects.toThrow('Minimum withdrawal is 100 credits');
  });
});
```

### 集成测试
```javascript
// 测试完整付费流程
describe('Paid Agent Flow', () => {
  test('User can call paid agent and creator receives earnings', async () => {
    // 1. 设置Agent价格
    // 2. 用户调用Agent
    // 3. 验证用户余额扣除
    // 4. 验证创建者收益增加
  });
});
```

---

## 📦 部署清单

### 数据库
- [ ] 备份生产数据库
- [ ] 执行迁移脚本
- [ ] 验证表结构
- [ ] 创建索引

### 后端
- [ ] 更新依赖包
- [ ] 环境变量配置
- [ ] 代码部署
- [ ] 重启服务
- [ ] 健康检查

### 前端
- [ ] 构建生产版本
- [ ] 上传到CDN/服务器
- [ ] 清除缓存
- [ ] 验证页面加载

### 监控
- [ ] 配置错误日志
- [ ] 配置性能监控
- [ ] 配置数据库慢查询监控
- [ ] 配置提现异常告警

---

## 🚨 风险控制

### 1. 技术风险
- **数据库事务**：确保扣费和分配收益的原子性
- **并发控制**：使用数据库锁防止余额并发问题
- **错误回滚**：失败时正确回滚credits

### 2. 业务风险
- **套利防范**：提现比例（0.03）< 购买成本（0.04-0.05）
- **刷量监控**：检测异常调用模式
- **提现审核**：人工审核大额提现

### 3. 数据风险
- **定期备份**：每日备份数据库
- **数据一致性**：定期对账creator_accounts和creator_earnings

---

## 📝 文档维护

**开发负责人**: [待指定]
**文档版本**: v1.0
**最后更新**: 2025-01-15
**下次审查**: 开发完成后

---

**附录**：
- [Agent定价功能需求文档](./agent-pricing-feature.md)
- [完整系统需求文档](./agent-pricing-system.md)

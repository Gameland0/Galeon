# 现有数据库表结构分析

## 已确认的数据库表

### 1. **agents** 表（已存在）
**现有字段**（从代码推断）：
```sql
- id (AUTO_INCREMENT PRIMARY KEY)
- name VARCHAR
- description TEXT
- type VARCHAR
- role VARCHAR
- goal TEXT
- ipfs_hash VARCHAR
- transaction_hash VARCHAR
- owner VARCHAR(255) -- 已支持Solana地址（44字符）
- chainid INT
- image_url VARCHAR
- is_public BOOLEAN
- created_at TIMESTAMP
- vector_enabled BOOLEAN -- RAG功能
- mcp_enabled BOOLEAN -- MCP功能
```

**需要添加的字段**：
```sql
ALTER TABLE agents ADD COLUMN price INT DEFAULT 0 COMMENT '每次调用价格(credits)';
ALTER TABLE agents ADD COLUMN total_calls INT DEFAULT 0 COMMENT '总调用次数';
ALTER TABLE agents ADD COLUMN total_earnings INT DEFAULT 0 COMMENT '总收益(credits)';
ALTER TABLE agents ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX idx_agents_price ON agents(price);
CREATE INDEX idx_agents_owner_price ON agents(owner, price);
```

---

### 2. **user_credits** 表（已存在）
**现有字段**：
```sql
- id VARCHAR(36) PRIMARY KEY
- user_id VARCHAR(255) UNIQUE NOT NULL
- credit_balance INT DEFAULT 20
- buy_balance INT DEFAULT 0
- last_used_at TIMESTAMP
- last_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**无需修改** ✅

---

### 3. **credit_purchases** 表（已存在）
**现有字段**：
```sql
- id VARCHAR(36) PRIMARY KEY
- user_id VARCHAR(255) NOT NULL
- plan_id VARCHAR(50) NOT NULL
- credits INT NOT NULL
- price DECIMAL(10, 6) NOT NULL
- transaction_hash VARCHAR(66) NOT NULL UNIQUE
- purchase_type ENUM('CONTRACT_SYNC', 'MANUAL')
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**无需修改** ✅

---

### 4. **credit_consumption** 表（已存在）
**现有字段**：
```sql
- id VARCHAR(36) PRIMARY KEY
- user_id VARCHAR(42) NOT NULL
- amount INT NOT NULL
- type VARCHAR(20)
- use_id VARCHAR(36)
- conversation_id VARCHAR(36)
- message_type VARCHAR(50)
- task_count INT DEFAULT 0
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**需要添加的字段**：
```sql
ALTER TABLE credit_consumption ADD COLUMN agent_id INT COMMENT 'Agent ID';
ALTER TABLE credit_consumption ADD COLUMN price INT DEFAULT 0 COMMENT 'Agent价格';
ALTER TABLE credit_consumption ADD COLUMN balance_type ENUM('buyBalance', 'creditBalance') DEFAULT 'buyBalance' COMMENT '扣费类型';

CREATE INDEX idx_consumption_agent ON credit_consumption(agent_id, created_at);
CREATE INDEX idx_consumption_user_agent ON credit_consumption(user_id, agent_id);
```

---

### 5. **chat_history** 表（已存在）
**现有字段**：
```sql
- id VARCHAR(36) PRIMARY KEY
- conversation_id VARCHAR(36) NOT NULL
- user_id VARCHAR(42) NOT NULL
- agent_id INT
- role VARCHAR(20)
- content MEDIUMTEXT
- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**无需修改** ✅

---

### 6. **teams** 表（已存在）
**现有字段**：
```sql
- id INT AUTO_INCREMENT PRIMARY KEY
- teamid VARCHAR(36)
- name VARCHAR(255)
- description TEXT
- owner VARCHAR(42)
- created_at TIMESTAMP
```

**无需修改** ✅

---

### 7. **agent_training** 表（已存在）
**现有字段**：
```sql
- id INT AUTO_INCREMENT PRIMARY KEY
- agent_id INT
- ipfs_hash VARCHAR
- trained_at TIMESTAMP
- user_address VARCHAR
```

**无需修改** ✅

---

### 8. **agent_knowledge** 表（已存在）
**现有字段**：
```sql
- id INT AUTO_INCREMENT PRIMARY KEY
- agent_id INT
- key_phrase VARCHAR
- content TEXT
- created_at TIMESTAMP
```

**无需修改** ✅

---

### 9. **workflow_tasks** 表（已存在）
**现有字段**：
```sql
- id VARCHAR(36) PRIMARY KEY
- workflow_id VARCHAR(36)
- agent_id INT
- task_description TEXT
- status VARCHAR
- result TEXT
- order INT
- created_at TIMESTAMP
```

**无需修改** ✅

---

### 10. **agent_mcp_capabilities** 表（已存在）
**现有字段**：
```sql
- id INT AUTO_INCREMENT PRIMARY KEY
- agent_id INT
- capability_name VARCHAR
- enabled BOOLEAN
- created_at TIMESTAMP
```

**无需修改** ✅

---

## 需要新建的表

### 1. **creator_accounts** 表（新建）
```sql
CREATE TABLE creator_accounts (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(255) UNIQUE NOT NULL COMMENT '创建者钱包地址',
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

### 2. **creator_earnings** 表（新建）
```sql
CREATE TABLE creator_earnings (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(255) NOT NULL COMMENT '创建者地址',
  agent_id INT NOT NULL COMMENT 'Agent ID',
  user_id VARCHAR(255) NOT NULL COMMENT '付费用户地址',
  amount INT NOT NULL COMMENT '收益金额(credits)',
  conversation_id VARCHAR(36) COMMENT '对话ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_creator_time (creator_id, created_at),
  INDEX idx_agent_time (agent_id, created_at),
  INDEX idx_user_time (user_id, created_at),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='创建者收益明细表';
```

### 3. **withdrawals** 表（新建）
```sql
CREATE TABLE withdrawals (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(255) NOT NULL COMMENT '创建者地址',
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

### 4. **agent_call_stats** 表（新建，可选）
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

---

## 数据库改造SQL脚本汇总

### 完整的SQL迁移文件

创建文件：`/Users/css/Desktop/gameland/源码/ai-server/sql/add_agent_pricing_system.sql`

```sql
-- ============================================
-- Agent定价系统数据库改造脚本
-- 执行前请备份数据库！
-- ============================================

-- 1. 扩展agents表
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS price INT DEFAULT 0 COMMENT '每次调用价格(credits)',
  ADD COLUMN IF NOT EXISTS total_calls INT DEFAULT 0 COMMENT '总调用次数',
  ADD COLUMN IF NOT EXISTS total_earnings INT DEFAULT 0 COMMENT '总收益(credits)',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_agents_price ON agents(price);
CREATE INDEX IF NOT EXISTS idx_agents_owner_price ON agents(owner, price);

-- 2. 扩展credit_consumption表
ALTER TABLE credit_consumption
  ADD COLUMN IF NOT EXISTS agent_id INT COMMENT 'Agent ID',
  ADD COLUMN IF NOT EXISTS price INT DEFAULT 0 COMMENT 'Agent价格',
  ADD COLUMN IF NOT EXISTS balance_type ENUM('buyBalance', 'creditBalance') DEFAULT 'buyBalance' COMMENT '扣费类型';

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_consumption_agent ON credit_consumption(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_consumption_user_agent ON credit_consumption(user_id, agent_id);

-- 3. 创建creator_accounts表
CREATE TABLE IF NOT EXISTS creator_accounts (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(255) UNIQUE NOT NULL COMMENT '创建者钱包地址',
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

-- 4. 创建creator_earnings表
CREATE TABLE IF NOT EXISTS creator_earnings (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(255) NOT NULL COMMENT '创建者地址',
  agent_id INT NOT NULL COMMENT 'Agent ID',
  user_id VARCHAR(255) NOT NULL COMMENT '付费用户地址',
  amount INT NOT NULL COMMENT '收益金额(credits)',
  conversation_id VARCHAR(36) COMMENT '对话ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_creator_time (creator_id, created_at),
  INDEX idx_agent_time (agent_id, created_at),
  INDEX idx_user_time (user_id, created_at),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='创建者收益明细表';

-- 5. 创建withdrawals表
CREATE TABLE IF NOT EXISTS withdrawals (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(255) NOT NULL COMMENT '创建者地址',
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

-- 6. 创建agent_call_stats表（可选）
CREATE TABLE IF NOT EXISTS agent_call_stats (
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

-- 7. 初始化现有Agent创建者的账户
INSERT INTO creator_accounts (id, creator_id, total_earnings, available_balance)
SELECT
  UUID() as id,
  owner as creator_id,
  0 as total_earnings,
  0 as available_balance
FROM agents
WHERE owner NOT IN (SELECT creator_id FROM creator_accounts)
GROUP BY owner;

-- 完成
SELECT 'Agent定价系统数据库改造完成！' as status;
```

---

## 执行步骤

### 1. 备份数据库
```bash
mysqldump -u root -p your_database > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. 执行迁移脚本
```bash
cd /Users/css/Desktop/gameland/源码/ai-server/sql
mysql -u root -p your_database < add_agent_pricing_system.sql
```

### 3. 验证表结构
```sql
-- 验证agents表新字段
DESC agents;

-- 验证新表
SHOW TABLES LIKE 'creator_%';
SHOW TABLES LIKE 'withdrawals';

-- 检查索引
SHOW INDEX FROM agents WHERE Key_name LIKE 'idx_agents_price%';
SHOW INDEX FROM credit_consumption WHERE Key_name LIKE 'idx_consumption%';
```

---

## 总结

### 已存在的表（10个）
✅ agents, user_credits, credit_purchases, credit_consumption, chat_history, teams, agent_training, agent_knowledge, workflow_tasks, agent_mcp_capabilities

### 需要修改的表（2个）
- ✏️ agents（添加4个字段 + 2个索引）
- ✏️ credit_consumption（添加3个字段 + 2个索引）

### 需要新建的表（4个）
- ➕ creator_accounts
- ➕ creator_earnings
- ➕ withdrawals
- ➕ agent_call_stats（可选）

### 数据迁移
- 为现有Agent创建者初始化creator_accounts记录

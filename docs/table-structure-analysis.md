# 数据库表结构分析 - 定价系统需求

## 📋 第一步：备份数据库

### 方法1：完整备份（推荐）
```bash
# 备份整个数据库
mysqldump -u root -p multiagent_platforms > backup_multiagent_platforms_$(date +%Y%m%d_%H%M%S).sql

# 验证备份文件
ls -lh backup_multiagent_platforms_*.sql
```

### 方法2：只备份相关表
```bash
# 只备份需要修改的表
mysqldump -u root -p multiagent_platforms \
  agents \
  credit_consumption \
  > backup_pricing_tables_$(date +%Y%m%d_%H%M%S).sql
```

### 方法3：创建表结构快照
```bash
# 只备份表结构（不包含数据）
mysqldump -u root -p --no-data multiagent_platforms \
  agents \
  credit_consumption \
  > backup_table_structure_$(date +%Y%m%d_%H%M%S).sql
```

---

## 🔍 第二步：分析现有表结构

### 需要查看的表

#### 1. agents表
**当前已知字段**（从代码推断）：
```sql
- id (PRIMARY KEY)
- name
- description
- type
- role
- goal
- ipfs_hash
- transaction_hash
- owner (VARCHAR(255)) -- 已支持Solana地址
- chainid
- image_url
- is_public
- vector_enabled
- mcp_enabled (可能存在)
- created_at (可能存在)
```

**需要确认的字段**：
```bash
# 执行以下命令查看完整结构
mysql -u root -p multiagent_platforms -e "DESCRIBE agents;"
```

**可能需要添加的字段**：
```sql
-- 如果这些字段不存在，才需要添加
price INT DEFAULT 0 COMMENT '每次调用价格(credits)'
total_calls INT DEFAULT 0 COMMENT '总调用次数'
total_earnings INT DEFAULT 0 COMMENT '总收益(credits)'
```

---

#### 2. credit_consumption表
**当前已知字段**（从代码推断）：
```sql
- id (VARCHAR(36) PRIMARY KEY)
- user_id
- amount
- type
- use_id
- conversation_id
- message_type (VARCHAR(20))
- task_count
- created_at
```

**需要确认的字段**：
```bash
# 执行以下命令查看完整结构
mysql -u root -p multiagent_platforms -e "DESCRIBE credit_consumption;"
```

**可能需要添加的字段**：
```sql
-- 如果这些字段不存在，才需要添加
agent_id INT COMMENT 'Agent ID'
price INT DEFAULT 0 COMMENT '本次消费的Agent价格'
balance_type ENUM('buyBalance', 'creditBalance') DEFAULT 'buyBalance' COMMENT '扣费类型'
```

---

#### 3. user_credits表
**当前已知字段**（从代码推断）：
```sql
- id (VARCHAR(36) PRIMARY KEY)
- user_id (VARCHAR(255) UNIQUE)
- credit_balance INT DEFAULT 20
- buy_balance INT DEFAULT 0
- last_used_at TIMESTAMP
- last_reset_at TIMESTAMP
```

**需要确认**：
```bash
# 查看完整结构
mysql -u root -p multiagent_platforms -e "DESCRIBE user_credits;"
```

**分析**：这个表应该不需要修改 ✅

---

#### 4. credit_purchases表
**当前已知字段**（从SQL文件）：
```sql
- id VARCHAR(36) PRIMARY KEY
- user_id VARCHAR(255)
- plan_id VARCHAR(50)
- credits INT
- price DECIMAL(10, 6)
- transaction_hash VARCHAR(66) UNIQUE
- purchase_type ENUM('CONTRACT_SYNC', 'MANUAL')
- created_at TIMESTAMP
```

**分析**：这个表应该不需要修改 ✅

---

## 📊 第三步：检查是否已有相关字段

### 执行查询脚本
创建文件 `/tmp/check_existing_fields.sql`：

```sql
-- 检查agents表是否已有price相关字段
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'multiagent_platforms'
  AND TABLE_NAME = 'agents'
  AND COLUMN_NAME IN ('price', 'total_calls', 'total_earnings', 'updated_at');

-- 检查credit_consumption表是否已有agent相关字段
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'multiagent_platforms'
  AND TABLE_NAME = 'credit_consumption'
  AND COLUMN_NAME IN ('agent_id', 'price', 'balance_type');

-- 查看agents表所有字段
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'multiagent_platforms'
  AND TABLE_NAME = 'agents'
ORDER BY ORDINAL_POSITION;

-- 查看credit_consumption表所有字段
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'multiagent_platforms'
  AND TABLE_NAME = 'credit_consumption'
ORDER BY ORDINAL_POSITION;
```

执行：
```bash
mysql -u root -p multiagent_platforms < /tmp/check_existing_fields.sql
```

---

## 🎯 第四步：确定需要添加的字段

### 基于检查结果，确定需要执行的SQL

#### 情况A：agents表缺少price字段
```sql
-- 添加price相关字段到agents表
ALTER TABLE agents
ADD COLUMN price INT DEFAULT 0 COMMENT '每次调用价格(credits)' AFTER image_url,
ADD COLUMN total_calls INT DEFAULT 0 COMMENT '总调用次数' AFTER price,
ADD COLUMN total_earnings INT DEFAULT 0 COMMENT '总收益(credits)' AFTER total_calls;

-- 添加索引
CREATE INDEX idx_agents_price ON agents(price);
```

#### 情况B：credit_consumption表缺少agent_id字段
```sql
-- 添加agent相关字段到credit_consumption表
ALTER TABLE credit_consumption
ADD COLUMN agent_id INT COMMENT 'Agent ID' AFTER conversation_id,
ADD COLUMN price INT DEFAULT 0 COMMENT '本次消费的Agent价格' AFTER agent_id,
ADD COLUMN balance_type ENUM('buyBalance', 'creditBalance') DEFAULT 'buyBalance' COMMENT '扣费类型' AFTER price;

-- 添加索引
CREATE INDEX idx_consumption_agent ON credit_consumption(agent_id, created_at);
```

---

## ⚠️ 第五步：验证添加字段的安全性

### 检查现有INSERT语句是否会受影响

#### agents表的INSERT语句（从代码中）
```javascript
// agentService.js 第29行
INSERT INTO agents (name, description, type, role, goal, ipfs_hash, transaction_hash, owner, chainid, image_url)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

**分析**：
- ✅ 使用列名明确指定，不受新字段影响
- ✅ 新字段有DEFAULT值，会自动填充
- ✅ **完全安全**

#### credit_consumption表的INSERT语句（从代码中）
```javascript
// databaseService.js 第147行
INSERT INTO credit_consumption (
  id, user_id, amount, type, use_id, conversation_id, message_type, task_count, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
```

**分析**：
- ✅ 使用列名明确指定，不受新字段影响
- ✅ 新字段有DEFAULT值，会自动填充
- ✅ **完全安全**

---

## 📝 第六步：需要的新表（可选）

### 基于现有68个表，检查是否需要新表

查看是否已有类似的表：
```bash
# 检查是否有creator相关的表
mysql -u root -p multiagent_platforms -e "SHOW TABLES LIKE '%creator%';"

# 检查是否有earnings/withdraw相关的表
mysql -u root -p multiagent_platforms -e "SHOW TABLES LIKE '%earning%';"
mysql -u root -p multiagent_platforms -e "SHOW TABLES LIKE '%withdraw%';"
```

### 如果没有，需要创建的新表

#### creator_accounts表（创建者账户）
```sql
CREATE TABLE IF NOT EXISTS creator_accounts (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(255) UNIQUE NOT NULL COMMENT '创建者钱包地址',
  total_earnings INT DEFAULT 0 COMMENT '总收益(credits)',
  available_balance INT DEFAULT 0 COMMENT '可提现余额',
  pending_balance INT DEFAULT 0 COMMENT '提现处理中',
  total_withdrawn INT DEFAULT 0 COMMENT '已提现总额',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_creator_id (creator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='创建者账户表';
```

#### creator_earnings表（收益明细）
```sql
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
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='创建者收益明细表';
```

#### withdrawals表（提现记录）
```sql
CREATE TABLE IF NOT EXISTS withdrawals (
  id VARCHAR(36) PRIMARY KEY,
  creator_id VARCHAR(255) NOT NULL COMMENT '创建者地址',
  amount INT NOT NULL COMMENT '提现credits数量',
  usdt_amount DECIMAL(10, 2) NOT NULL COMMENT '实际USDT金额',
  fee DECIMAL(10, 2) NOT NULL COMMENT '手续费(USDT)',
  usdt_address VARCHAR(100) NOT NULL COMMENT 'USDT接收地址',
  network VARCHAR(20) DEFAULT 'TRC20' COMMENT '网络类型',
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  tx_hash VARCHAR(100) COMMENT '链上交易哈希',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,

  INDEX idx_creator_status (creator_id, status),
  INDEX idx_tx_hash (tx_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提现记录表';
```

---

## 🔄 第七步：完整执行流程

### 1. 备份
```bash
mysqldump -u root -p multiagent_platforms > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. 检查现有字段
```bash
mysql -u root -p multiagent_platforms < /tmp/check_existing_fields.sql > /tmp/field_check_result.txt
cat /tmp/field_check_result.txt
```

### 3. 根据检查结果，执行相应的ALTER TABLE语句
```bash
# 创建SQL文件
nano /tmp/add_pricing_fields.sql

# 粘贴需要的ALTER TABLE语句

# 执行
mysql -u root -p multiagent_platforms < /tmp/add_pricing_fields.sql
```

### 4. 验证
```bash
mysql -u root -p multiagent_platforms -e "DESCRIBE agents;" | grep -E "price|total_calls|total_earnings"
mysql -u root -p multiagent_platforms -e "DESCRIBE credit_consumption;" | grep -E "agent_id|price|balance_type"
```

---

## 📌 总结：需要你做的事

### 立即执行：
1. ✅ **备份数据库**
   ```bash
   mysqldump -u root -p multiagent_platforms > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. ✅ **查看agents表结构**
   ```bash
   mysql -u root -p multiagent_platforms -e "DESCRIBE agents;"
   ```

3. ✅ **查看credit_consumption表结构**
   ```bash
   mysql -u root -p multiagent_platforms -e "DESCRIBE credit_consumption;"
   ```

4. ✅ **检查是否已有price相关字段**
   ```bash
   mysql -u root -p multiagent_platforms < /tmp/check_existing_fields.sql
   ```

### 然后告诉我：
- agents表目前有哪些字段？
- credit_consumption表目前有哪些字段？
- 是否已经有price、total_calls、total_earnings字段？
- 是否已经有agent_id、balance_type字段？

**我会根据你的反馈，提供精确的SQL语句！**

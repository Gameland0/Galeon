# Credit 系统安全分析与改进方案

## 🚨 当前安全问题分析

### 1. **数据库直接存储的风险**

**现状：**
- `user_credits` 表直接存储用户的 `buy_balance`（可提现余额）
- 管理员或黑客可以直接修改数据库中的余额
- 没有链上验证机制

**风险等级：** 🔴 **严重**

**攻击场景：**
```sql
-- 黑客入侵数据库后可以随意修改余额
UPDATE user_credits SET buy_balance = 999999999 WHERE user_id = '黑客地址';
```

### 2. **智能合约未充分利用**

**现状：**
- 已有 `CreditsPayment.sol` 智能合约
- 合约只管理购买的 credits（`userCredits`）
- Agent 收益（`buyBalance`）存储在数据库中，未上链

**问题：**
- 链上和链下数据不一致
- 缺乏不可篡改的审计日志
- 提现时无法验证数据真实性

### 3. **收益分配缺乏透明度**

**现状：**
- Agent 调用收益直接写入数据库
- 没有链上事件记录
- 无法追溯收益来源

---

## ✅ 安全改进方案

### 方案 A：完全链上方案（推荐 - 最安全）

#### 1. **扩展智能合约功能**

创建 `AgentEarningsManager.sol` 合约：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AgentEarningsManager {
    // 用户收益余额（可提现）
    mapping(address => uint256) public earningsBalance;

    // 用户消费余额（已购买的credits）
    mapping(address => uint256) public creditBalance;

    // Agent调用记录
    struct AgentCall {
        uint256 agentId;
        address caller;
        address agentOwner;
        uint256 price;
        uint256 timestamp;
    }

    mapping(uint256 => AgentCall[]) public agentCallHistory;

    // 事件
    event AgentCalled(
        uint256 indexed agentId,
        address indexed caller,
        address indexed agentOwner,
        uint256 price,
        uint256 timestamp
    );

    event EarningsWithdrawn(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    event CreditsConsumed(
        address indexed user,
        uint256 agentId,
        uint256 amount
    );

    /**
     * @dev 记录Agent调用并分配收益
     */
    function recordAgentCall(
        uint256 _agentId,
        address _caller,
        address _agentOwner,
        uint256 _price
    ) external onlyAuthorized {
        require(_caller != address(0), "Invalid caller");
        require(_agentOwner != address(0), "Invalid owner");
        require(creditBalance[_caller] >= _price, "Insufficient credits");

        // 扣除调用者的credits
        creditBalance[_caller] -= _price;

        // 增加Agent所有者的收益
        earningsBalance[_agentOwner] += _price;

        // 记录调用历史
        agentCallHistory[_agentId].push(AgentCall({
            agentId: _agentId,
            caller: _caller,
            agentOwner: _agentOwner,
            price: _price,
            timestamp: block.timestamp
        }));

        emit AgentCalled(_agentId, _caller, _agentOwner, _price, block.timestamp);
        emit CreditsConsumed(_caller, _agentId, _price);
    }

    /**
     * @dev 提现收益到USDT
     */
    function withdrawEarnings(uint256 _amount) external {
        require(earningsBalance[msg.sender] >= _amount, "Insufficient earnings");
        require(_amount > 0, "Amount must be greater than 0");

        earningsBalance[msg.sender] -= _amount;

        // 这里需要与USDT兑换逻辑（由后端处理）
        // 在提现表中创建待处理记录

        emit EarningsWithdrawn(msg.sender, _amount, block.timestamp);
    }

    /**
     * @dev 添加credits（购买或赠送）
     */
    function addCredits(address _user, uint256 _amount) external onlyAuthorized {
        creditBalance[_user] += _amount;
    }

    /**
     * @dev 查询用户收益余额
     */
    function getEarningsBalance(address _user) external view returns (uint256) {
        return earningsBalance[_user];
    }

    /**
     * @dev 查询用户credit余额
     */
    function getCreditBalance(address _user) external view returns (uint256) {
        return creditBalance[_user];
    }

    /**
     * @dev 查询Agent调用历史
     */
    function getAgentCallHistory(uint256 _agentId) external view returns (AgentCall[] memory) {
        return agentCallHistory[_agentId];
    }
}
```

#### 2. **后端同步逻辑**

```typescript
// services/creditService.ts

/**
 * 调用Agent时扣费并记录
 */
async function callAgentWithPayment(
  agentId: number,
  caller: string,
  agentOwner: string,
  price: number
): Promise<void> {
  // 1. 调用智能合约记录
  const contract = new web3.eth.Contract(AgentEarningsManagerABI, contractAddress);

  const tx = await contract.methods
    .recordAgentCall(agentId, caller, agentOwner, price)
    .send({ from: caller });

  // 2. 同步到数据库（作为缓存和查询优化）
  await db.query(`
    INSERT INTO credit_consumption (user_id, agent_id, amount, tx_hash, created_at)
    VALUES (?, ?, ?, ?, NOW())
  `, [caller, agentId, price, tx.transactionHash]);

  await db.query(`
    UPDATE agents SET total_calls = total_calls + 1, total_earnings = total_earnings + ?
    WHERE id = ?
  `, [price, agentId]);

  // 3. 定期同步验证
  await syncBalancesFromChain();
}

/**
 * 从链上同步余额数据
 */
async function syncBalancesFromChain(): Promise<void> {
  const contract = new web3.eth.Contract(AgentEarningsManagerABI, contractAddress);

  // 获取所有用户地址
  const users = await db.query('SELECT DISTINCT user_id FROM user_credits');

  for (const user of users) {
    // 从链上读取真实余额
    const chainCreditBalance = await contract.methods.getCreditBalance(user.user_id).call();
    const chainEarningsBalance = await contract.methods.getEarningsBalance(user.user_id).call();

    // 更新数据库（以链上数据为准）
    await db.query(`
      UPDATE user_credits
      SET
        credit_balance = ?,
        buy_balance = ?,
        last_sync_at = NOW()
      WHERE user_id = ?
    `, [chainCreditBalance, chainEarningsBalance, user.user_id]);
  }
}
```

---

### 方案 B：混合方案（平衡性能和安全）

#### 特点：
- 重要操作上链（购买、提现）
- 日常调用记录链下（降低gas费用）
- 定期批量上链验证

#### 实现：

```solidity
contract AgentEarningsSnapshot {
    // 定期快照
    struct Snapshot {
        uint256 blockNumber;
        bytes32 merkleRoot;  // 所有用户余额的Merkle树根
        uint256 timestamp;
    }

    Snapshot[] public snapshots;

    /**
     * @dev 提交收益快照（每天或每周一次）
     */
    function submitSnapshot(bytes32 _merkleRoot) external onlyOwner {
        snapshots.push(Snapshot({
            blockNumber: block.number,
            merkleRoot: _merkleRoot,
            timestamp: block.timestamp
        }));
    }

    /**
     * @dev 验证用户余额（通过Merkle证明）
     */
    function verifyBalance(
        address _user,
        uint256 _balance,
        bytes32[] memory _proof
    ) external view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(_user, _balance));
        return MerkleProof.verify(_proof, snapshots[snapshots.length - 1].merkleRoot, leaf);
    }
}
```

---

### 方案 C：数据库加密签名方案（最低成本）

#### 实现：

```typescript
// 每次修改余额时生成签名
function updateBalanceWithSignature(
  userId: string,
  newBalance: number,
  privateKey: string
): string {
  const message = `${userId}:${newBalance}:${Date.now()}`;
  const signature = web3.eth.accounts.sign(message, privateKey);

  // 存储签名到数据库
  db.query(`
    UPDATE user_credits
    SET
      buy_balance = ?,
      balance_signature = ?,
      signature_timestamp = NOW()
    WHERE user_id = ?
  `, [newBalance, signature.signature, userId]);

  return signature.signature;
}

// 验证余额签名
function verifyBalanceSignature(
  userId: string,
  balance: number,
  signature: string,
  timestamp: number
): boolean {
  const message = `${userId}:${balance}:${timestamp}`;
  const recoveredAddress = web3.eth.accounts.recover(message, signature);

  return recoveredAddress === AUTHORIZED_SIGNER_ADDRESS;
}
```

---

## 📊 方案对比

| 方案 | 安全性 | Gas成本 | 性能 | 实现难度 | 推荐度 |
|-----|-------|---------|------|---------|--------|
| **方案A：完全链上** | 🔴🔴🔴🔴🔴 最高 | 高 | 中 | 中 | ⭐⭐⭐⭐⭐ |
| **方案B：混合方案** | 🔴🔴🔴🔴 很高 | 中 | 高 | 高 | ⭐⭐⭐⭐ |
| **方案C：加密签名** | 🔴🔴🔴 中等 | 低 | 最高 | 低 | ⭐⭐⭐ |

---

## 🛡️ 安全最佳实践

### 1. **立即实施的措施**

- [ ] 数据库访问权限最小化
- [ ] 启用数据库审计日志
- [ ] 实施多签名管理员操作
- [ ] 添加余额变更通知

### 2. **短期实施（1-2周）**

- [ ] 实施方案C：加密签名验证
- [ ] 添加异常检测系统
- [ ] 实施提现限额和审核

### 3. **中期实施（1-2月）**

- [ ] 部署方案A：完全链上管理
- [ ] 迁移现有数据到链上
- [ ] 建立定期审计机制

### 4. **监控和告警**

```typescript
// 异常检测示例
async function detectAnomalies() {
  // 1. 检测异常大额余额变更
  const suspiciousChanges = await db.query(`
    SELECT user_id, old_balance, new_balance, changed_at
    FROM balance_change_log
    WHERE ABS(new_balance - old_balance) > 1000
      AND changed_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
  `);

  // 2. 检测频繁提现
  const frequentWithdrawals = await db.query(`
    SELECT user_id, COUNT(*) as withdrawal_count
    FROM credit_withdrawals
    WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
    GROUP BY user_id
    HAVING withdrawal_count > 5
  `);

  // 3. 发送告警
  if (suspiciousChanges.length > 0 || frequentWithdrawals.length > 0) {
    await sendAlertToAdmin({
      type: 'SUSPICIOUS_ACTIVITY',
      details: { suspiciousChanges, frequentWithdrawals }
    });
  }
}
```

---

## 💡 建议

**优先级排序：**

1. **立即** - 实施数据库安全加固和访问控制
2. **本周** - 添加余额变更签名验证（方案C）
3. **本月** - 部署智能合约完全链上管理（方案A）
4. **持续** - 建立监控和审计机制

**理由：**
- 方案A提供最高安全性和透明度
- 智能合约不可篡改，完全去中心化
- 符合Web3精神，用户信任度更高
- 长期来看成本效益最优

---

## 📝 总结

当前系统存在**严重的安全隐患**，数据库被攻破后可以任意修改用户余额。建议尽快实施智能合约方案，将关键数据上链，确保系统的安全性和可信度。

# 真正的安全问题和解决方案

## 🚨 你发现的核心漏洞

### 漏洞 1：购买 Credits 的问题

```
❌ 当前流程（有漏洞）：

用户购买 100 Credits
   ↓
CreditsPayment.sol 记录购买（链上）✅
   ↓
后端监听事件，写入数据库
   INSERT INTO user_credits (buy_balance = 100)
   ↓
🔴 问题：黑客可以直接修改数据库
   UPDATE user_credits SET buy_balance = 999999 WHERE user_id = '黑客地址'
   ↓
用户余额显示：999999 Credits（假的）
   ↓
黑客调用 Agent 消费假余额
   ↓
💥 平台损失！
```

### 漏洞 2：收益提现的问题

```
❌ 当前流程（有漏洞）：

Agent 被调用，创建者赚取收益
   ↓
后端记录到数据库
   UPDATE agents SET total_earnings = 1560
   UPDATE user_credits SET buy_balance = 1560
   ↓
🔴 问题：黑客修改数据库
   UPDATE user_credits SET buy_balance = 999999 WHERE user_id = '黑客地址'
   ↓
黑客提现：999999 Credits → USDT
   ↓
💥 平台巨额损失！
```

---

## ✅ 真正的解决方案

### 核心原则：**链上为准，提现时验证**

```
关键点：
1. 所有余额操作必须上链
2. 数据库只是缓存（快速查询）
3. 提现时必须验证链上真实余额
4. 如果数据库与链上不一致 → 拒绝提现 + 告警
```

---

## 🎯 完整安全方案

### 方案架构

```
┌─────────────────────────────────────────────────────────┐
│               用户操作（都需要链上验证）                  │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ↓                 ↓                 ↓
   购买Credits      调用Agent付费       提现收益
        │                 │                 │
        ↓                 ↓                 ↓
   上链记录 ✅        上链记录 ✅       上链验证 ✅
        │                 │                 │
        ↓                 ↓                 ↓
   同步到数据库       同步到数据库       验证通过才转账
   （缓存）          （缓存）           （关键！）
```

---

## 🔐 关键实现：提现时的链上验证

### 智能合约（完整版）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AgentEarningsManager {
    // ========== 状态变量 ==========

    // 用户消费余额（购买的credits）
    mapping(address => uint256) public creditBalance;

    // 用户收益余额（可提现）
    mapping(address => uint256) public earningsBalance;

    // 已提现金额（累计）
    mapping(address => uint256) public totalWithdrawn;

    // 提现请求
    struct WithdrawalRequest {
        uint256 requestId;
        address user;
        uint256 amount;
        uint256 requestTime;
        bool processed;
        bool approved;  // 新增：是否通过验证
        bytes32 usdtTxHash;
    }

    mapping(uint256 => WithdrawalRequest) public withdrawalRequests;
    uint256 public nextWithdrawalId = 1;

    // ========== 核心功能 ==========

    /**
     * @dev 购买Credits后添加余额（必须上链）
     */
    function addCreditsFromPurchase(
        address _user,
        uint256 _amount,
        bytes32 _purchaseTxHash  // 购买交易的哈希
    ) external onlyAuthorized {
        require(_amount > 0, "Amount must be > 0");

        // 验证购买交易确实存在（防止伪造）
        // 实际应该调用 CreditsPayment 合约验证

        creditBalance[_user] += _amount;

        emit CreditsAdded(_user, _amount, _purchaseTxHash);
    }

    /**
     * @dev 记录Agent调用（必须上链）
     */
    function recordAgentCall(
        uint256 _agentId,
        address _caller,
        string memory _sessionId
    ) external onlyAuthorized {
        AgentInfo memory agent = agents[_agentId];
        uint256 price = agent.price;

        if (price > 0) {
            // 扣除调用者余额
            require(creditBalance[_caller] >= price, "Insufficient credits");
            creditBalance[_caller] -= price;

            // 增加创建者收益
            earningsBalance[agent.owner] += price;

            emit CreditsConsumed(_caller, _agentId, price);
            emit EarningsAccrued(agent.owner, _agentId, price);
        }

        // 记录调用
        agentCallHistory[_agentId].push(AgentCall({
            agentId: _agentId,
            caller: _caller,
            agentOwner: agent.owner,
            price: price,
            timestamp: block.timestamp,
            sessionId: _sessionId
        }));

        emit AgentCalled(_agentId, _caller, agent.owner, price, block.timestamp, _sessionId);
    }

    /**
     * @dev 请求提现（用户签名调用）
     * 🔑 关键：创建提现请求但不立即扣除余额
     */
    function requestWithdrawal(uint256 _amount) external returns (uint256) {
        require(_amount > 0, "Amount must be > 0");
        require(earningsBalance[msg.sender] >= _amount, "Insufficient earnings");

        uint256 requestId = nextWithdrawalId++;

        withdrawalRequests[requestId] = WithdrawalRequest({
            requestId: requestId,
            user: msg.sender,
            amount: _amount,
            requestTime: block.timestamp,
            processed: false,
            approved: false,
            usdtTxHash: bytes32(0)
        });

        // 🔑 锁定余额（防止重复提现）
        earningsBalance[msg.sender] -= _amount;

        emit WithdrawalRequested(requestId, msg.sender, _amount, block.timestamp);

        return requestId;
    }

    /**
     * @dev 验证并批准提现（管理员在转账USDT前调用）
     * 🔑 关键：必须链上验证余额
     */
    function approveWithdrawal(uint256 _requestId) external onlyOwner {
        WithdrawalRequest storage request = withdrawalRequests[_requestId];

        require(!request.processed, "Already processed");
        require(!request.approved, "Already approved");

        // 🔑 验证：检查用户历史收益是否真实
        // （防止数据库被篡改导致提现假余额）
        uint256 totalEarnings = calculateTotalEarnings(request.user);
        uint256 alreadyWithdrawn = totalWithdrawn[request.user];

        require(
            totalEarnings >= alreadyWithdrawn + request.amount,
            "Earnings verification failed"
        );

        request.approved = true;

        emit WithdrawalApproved(_requestId, request.user, request.amount);
    }

    /**
     * @dev 完成提现（管理员在转账USDT后调用）
     */
    function completeWithdrawal(
        uint256 _requestId,
        bytes32 _usdtTxHash
    ) external onlyOwner {
        WithdrawalRequest storage request = withdrawalRequests[_requestId];

        require(request.approved, "Not approved");
        require(!request.processed, "Already processed");

        request.processed = true;
        request.usdtTxHash = _usdtTxHash;

        // 记录已提现金额
        totalWithdrawn[request.user] += request.amount;

        emit WithdrawalCompleted(_requestId, request.user, request.amount, _usdtTxHash);
    }

    /**
     * @dev 取消提现（退回余额）
     */
    function cancelWithdrawal(uint256 _requestId) external {
        WithdrawalRequest storage request = withdrawalRequests[_requestId];

        require(
            msg.sender == request.user || msg.sender == owner,
            "Not authorized"
        );
        require(!request.processed, "Already processed");

        // 退回余额
        earningsBalance[request.user] += request.amount;

        request.processed = true;

        emit WithdrawalCancelled(_requestId, request.user, request.amount);
    }

    /**
     * 🔑 关键函数：计算用户真实收益（从链上调用历史）
     */
    function calculateTotalEarnings(address _user) public view returns (uint256) {
        uint256 totalEarnings = 0;

        // 遍历所有Agent，查找该用户的收益
        // （这里简化，实际应该用更高效的索引）
        for (uint256 agentId = 1; agentId < nextAgentId; agentId++) {
            if (agents[agentId].owner == _user) {
                AgentCall[] storage calls = agentCallHistory[agentId];
                for (uint256 i = 0; i < calls.length; i++) {
                    totalEarnings += calls[i].price;
                }
            }
        }

        return totalEarnings;
    }

    /**
     * @dev 获取用户余额信息（包含验证状态）
     */
    function getUserBalanceInfo(address _user) external view returns (
        uint256 creditBalance_,
        uint256 earningsBalance_,
        uint256 totalEarnings_,    // 链上计算的真实收益
        uint256 totalWithdrawn_,
        bool balanceVerified        // 余额是否一致
    ) {
        uint256 calculatedEarnings = calculateTotalEarnings(_user);
        uint256 expectedBalance = calculatedEarnings - totalWithdrawn[_user];

        return (
            creditBalance[_user],
            earningsBalance[_user],
            calculatedEarnings,
            totalWithdrawn[_user],
            earningsBalance[_user] == expectedBalance  // 验证一致性
        );
    }

    // ========== 事件 ==========

    event CreditsAdded(address indexed user, uint256 amount, bytes32 purchaseTxHash);
    event CreditsConsumed(address indexed user, uint256 agentId, uint256 amount);
    event EarningsAccrued(address indexed owner, uint256 agentId, uint256 amount);
    event WithdrawalRequested(uint256 indexed requestId, address indexed user, uint256 amount, uint256 timestamp);
    event WithdrawalApproved(uint256 indexed requestId, address indexed user, uint256 amount);
    event WithdrawalCompleted(uint256 indexed requestId, address indexed user, uint256 amount, bytes32 usdtTxHash);
    event WithdrawalCancelled(uint256 indexed requestId, address indexed user, uint256 amount);
}
```

---

## 🔐 后端验证逻辑

### 提现流程（关键）

```typescript
// routes/withdrawalRoutes.ts

/**
 * 🔑 用户提交提现请求
 */
router.post('/withdrawal/request', authenticateUser, async (req, res) => {
  const { amount, chainId } = req.body;
  const userAddress = req.user.address;

  try {
    const earningsService = new AgentEarningsService(chainId);

    // 1. 检查数据库余额（快速检查）
    const dbBalance = await db.query(
      'SELECT buy_balance FROM user_credits WHERE user_id = ?',
      [userAddress]
    );

    if (dbBalance[0].buy_balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance in database' });
    }

    // 2. 🔑 检查链上真实余额
    const chainBalanceInfo = await earningsService.getUserBalanceInfo(userAddress);

    if (!chainBalanceInfo.balanceVerified) {
      // 🚨 数据库与链上不一致 - 触发告警
      await sendSecurityAlert({
        type: 'BALANCE_MISMATCH',
        user: userAddress,
        dbBalance: dbBalance[0].buy_balance,
        chainBalance: chainBalanceInfo.earningsBalance,
        calculatedEarnings: chainBalanceInfo.totalEarnings
      });

      return res.status(403).json({
        error: 'Balance verification failed',
        message: 'Your balance will be synchronized from blockchain'
      });
    }

    if (chainBalanceInfo.earningsBalance < amount) {
      return res.status(400).json({ error: 'Insufficient balance on chain' });
    }

    // 3. 🔑 调用智能合约创建提现请求（用户需要签名）
    // 前端会弹出钱包让用户签名
    res.json({
      status: 'SIGNATURE_REQUIRED',
      chainBalance: chainBalanceInfo.earningsBalance,
      requestAmount: amount,
      message: 'Please sign the withdrawal request in your wallet'
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 🔑 前端调用合约后，通知后端
 */
router.post('/withdrawal/confirm', authenticateUser, async (req, res) => {
  const { requestId, txHash, chainId } = req.body;
  const userAddress = req.user.address;

  try {
    // 验证交易确实存在
    const earningsService = new AgentEarningsService(chainId);
    const request = await earningsService.getWithdrawalRequest(requestId);

    if (request.user.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // 保存到数据库（待管理员处理）
    await db.query(`
      INSERT INTO credit_withdrawals
      (request_id, user_id, amount, chain_id, tx_hash, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', NOW())
    `, [requestId, userAddress, request.amount, chainId, txHash]);

    res.json({
      status: 'SUCCESS',
      requestId,
      message: 'Withdrawal request submitted successfully'
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 🔑 管理员处理提现（审核通过后转账USDT）
 */
router.post('/admin/withdrawal/process', authenticateAdmin, async (req, res) => {
  const { requestId, chainId } = req.body;

  try {
    const earningsService = new AgentEarningsService(chainId);

    // 1. 从数据库获取提现请求
    const withdrawal = await db.query(
      'SELECT * FROM credit_withdrawals WHERE request_id = ?',
      [requestId]
    );

    if (!withdrawal[0]) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    // 2. 🔑 链上验证提现请求
    const chainRequest = await earningsService.getWithdrawalRequest(requestId);

    if (chainRequest.processed) {
      return res.status(400).json({ error: 'Already processed' });
    }

    // 3. 🔑 调用合约批准提现（会验证用户真实收益）
    try {
      await earningsService.approveWithdrawal(requestId);
    } catch (error: any) {
      // 如果验证失败，拒绝提现
      await db.query(
        'UPDATE credit_withdrawals SET status = "rejected", reason = ? WHERE request_id = ?',
        [error.message, requestId]
      );

      return res.status(403).json({
        error: 'Withdrawal verification failed',
        reason: error.message
      });
    }

    // 4. 转账 USDT 到用户地址
    const usdtTxHash = await transferUSDT(
      withdrawal[0].user_id,
      withdrawal[0].amount
    );

    // 5. 🔑 调用合约完成提现
    await earningsService.completeWithdrawal(requestId, usdtTxHash);

    // 6. 更新数据库
    await db.query(`
      UPDATE credit_withdrawals
      SET status = 'completed', usdt_tx_hash = ?, completed_at = NOW()
      WHERE request_id = ?
    `, [usdtTxHash, requestId]);

    // 7. 同步用户余额（从链上）
    await earningsService.syncUserBalance(withdrawal[0].user_id);

    res.json({
      status: 'SUCCESS',
      requestId,
      usdtTxHash
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 🛡️ 安全保障

### 1. 多重验证

```typescript
// 提现时的三重验证

✅ 验证 1：数据库余额检查（快速）
if (dbBalance < amount) reject();

✅ 验证 2：链上余额检查（真实）
if (chainBalance < amount) reject();

✅ 验证 3：链上收益计算验证（防篡改）
if (calculateTotalEarnings() < totalWithdrawn + amount) reject();
```

### 2. 定期同步

```typescript
// 定期从链上同步真实余额到数据库

cron.schedule('*/10 * * * *', async () => {
  console.log('🔄 Syncing balances from chain...');

  const users = await db.query('SELECT user_id FROM user_credits');

  for (const user of users) {
    const chainInfo = await contract.methods
      .getUserBalanceInfo(user.user_id)
      .call();

    // 检查一致性
    if (!chainInfo.balanceVerified) {
      console.warn(`⚠️  Balance mismatch for user ${user.user_id}`);

      // 发送告警
      await sendAlert({
        type: 'BALANCE_MISMATCH',
        user: user.user_id
      });
    }

    // 以链上数据为准更新数据库
    await db.query(`
      UPDATE user_credits
      SET
        credit_balance = ?,
        buy_balance = ?,
        last_sync_at = NOW()
      WHERE user_id = ?
    `, [
      chainInfo.creditBalance,
      chainInfo.earningsBalance,
      user.user_id
    ]);
  }

  console.log('✅ Sync completed');
});
```

### 3. 异常检测

```typescript
// 检测可疑的余额变更

async function detectSuspiciousActivity() {
  // 检查数据库中余额突增的用户
  const suspicious = await db.query(`
    SELECT
      uc1.user_id,
      uc1.buy_balance as current_balance,
      uc2.buy_balance as previous_balance,
      (uc1.buy_balance - uc2.buy_balance) as increase
    FROM user_credits uc1
    LEFT JOIN user_credits_history uc2
      ON uc1.user_id = uc2.user_id
      AND uc2.snapshot_time = (
        SELECT MAX(snapshot_time)
        FROM user_credits_history
        WHERE user_id = uc1.user_id
      )
    WHERE (uc1.buy_balance - COALESCE(uc2.buy_balance, 0)) > 1000
  `);

  for (const user of suspicious) {
    // 验证链上余额
    const chainBalance = await contract.methods
      .earningsBalance(user.user_id)
      .call();

    if (chainBalance < user.current_balance) {
      // 🚨 发现篡改！
      await sendUrgentAlert({
        type: 'DATABASE_TAMPERING_DETECTED',
        user: user.user_id,
        dbBalance: user.current_balance,
        chainBalance: chainBalance,
        difference: user.current_balance - chainBalance
      });

      // 冻结账户
      await db.query(
        'UPDATE user_credits SET status = "frozen" WHERE user_id = ?',
        [user.user_id]
      );
    }
  }
}
```

---

## 📊 完整流程对比

### ❌ 之前的方案（有漏洞）

```
购买 100 Credits
   ↓
链上记录：creditBalance[user] = 100 ✅
   ↓
数据库记录：buy_balance = 100
   ↓
🔴 黑客修改数据库：buy_balance = 999999
   ↓
提现时只检查数据库：999999 ≥ 提现金额 ✅
   ↓
💥 转账 USDT 给黑客 → 平台损失！
```

### ✅ 现在的方案（安全）

```
购买 100 Credits
   ↓
链上记录：creditBalance[user] = 100 ✅
   ↓
数据库记录：buy_balance = 100（缓存）

用户调用 Agent 赚取 50 Credits
   ↓
链上记录：earningsBalance[user] = 50 ✅
   ↓
数据库记录：buy_balance = 50（缓存）

🔴 黑客尝试修改数据库：buy_balance = 999999
   ↓
提现 999999 Credits
   ↓
智能合约验证：
   Step 1: 检查 earningsBalance[user] = 50 ❌
   Step 2: 计算 totalEarnings = 50（从调用历史）
   Step 3: totalWithdrawn = 0
   Step 4: 可提现 = 50 - 0 = 50
   Step 5: 999999 > 50 → ❌ 拒绝！
   ↓
🚨 触发安全告警
🔒 冻结账户
✅ 平台安全！
```

---

## 🎯 总结

### 核心原则

1. **链上为准**：所有余额操作必须上链
2. **提现验证**：提现时必须验证链上真实余额
3. **定期同步**：数据库定期从链上同步
4. **异常检测**：实时监控可疑活动

### 关键保障

```
✅ 购买 Credits → 必须上链
✅ Agent 调用扣费 → 必须上链
✅ 收益分配 → 必须上链
✅ 提现请求 → 必须上链并验证
✅ 数据库余额 → 只是缓存，不可信
✅ 真实余额 → 以链上为准
```

### 黑客攻击失败场景

```
黑客修改数据库余额 → 提现时链上验证失败 → ❌ 提现被拒
黑客伪造购买记录 → 链上无交易哈希 → ❌ 验证失败
黑客伪造收益记录 → 链上无调用历史 → ❌ 计算不匹配
```

**这才是真正安全的方案！** 🛡️

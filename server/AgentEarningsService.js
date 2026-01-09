const Web3 = require('web3');
const db = require('../config/database');
const UUID = require('uuid');

// AgentEarningsManager合约ABI
const AGENT_EARNINGS_MANAGER_ABI = require('../contracts/AgentEarningsManager.json');

/**
 * AgentEarningsService - 链上收益和Credit管理服务
 * 🔒 安全性：所有关键操作都上链，数据库仅作为缓存
 */
class AgentEarningsService {
    constructor() {
        this.web3 = null;
        this.contract = null;
        this.serverAccount = null;
        this.initialized = false;

        // 批量上链队列
        this.callQueue = [];
        this.batchInterval = parseInt(process.env.BATCH_INTERVAL) || 300000; // 默认5分钟
        this.maxBatchSize = parseInt(process.env.MAX_BATCH_SIZE) || 100; // 每批最多100条
        this.isBatchProcessing = false;
        this.batchTimer = null;

        // 智能批量策略
        this.minBatchSize = parseInt(process.env.MIN_BATCH_SIZE) || 10; // 最少积累10条
        this.urgentBatchSize = parseInt(process.env.URGENT_BATCH_SIZE) || 50; // 达到50条立即上链

        // 自适应流量控制（防止高流量时频繁上链）
        this.lastBatchTime = 0;  // 上次上链时间戳
        this.minBatchInterval = parseInt(process.env.MIN_BATCH_INTERVAL) || 60000; // 最小上链间隔: 1分钟
        this.adaptiveMode = process.env.ADAPTIVE_MODE !== 'false'; // 是否启用自适应模式，默认开启
    }

    /**
     * 初始化Web3和智能合约连接
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // 从环境变量加载配置
            const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
            const CONTRACT_ADDRESS = process.env.AGENT_EARNINGS_CONTRACT || '0x10b2582f52f43D1789DAD5a374dC12Fb828f5431';
            const SERVER_PRIVATE_KEY = process.env.PRIVATE_KEY;

            if (!CONTRACT_ADDRESS) {
                throw new Error('AGENT_EARNINGS_CONTRACT_ADDRESS not configured');
            }

            if (!SERVER_PRIVATE_KEY) {
                throw new Error('SERVER_PRIVATE_KEY not configured');
            }

            // 初始化Web3
            this.web3 = new Web3(RPC_URL);

            // 加载服务器账户
            this.serverAccount = this.web3.eth.accounts.privateKeyToAccount(SERVER_PRIVATE_KEY);
            this.web3.eth.accounts.wallet.add(this.serverAccount);
            this.web3.eth.defaultAccount = this.serverAccount.address;

            // 初始化合约
            this.contract = new this.web3.eth.Contract(
                AGENT_EARNINGS_MANAGER_ABI,
                CONTRACT_ADDRESS
            );

            console.log('✅ AgentEarningsService initialized');
            console.log(`   Contract: ${CONTRACT_ADDRESS}`);
            console.log(`   Server Account: ${this.serverAccount.address}`);

            this.initialized = true;

            // 🔧 启动时加载数据库中待上链的记录到队列
            await this.loadPendingRecords();

            // 启动批量上链定时器
            this.startBatchProcessor();
        } catch (error) {
            console.error('❌ Failed to initialize AgentEarningsService:', error);
            throw error;
        }
    }

    /**
     * 确保服务已初始化
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * 数据库查询辅助函数
     */
    async query(sql, params) {
        return new Promise((resolve, reject) => {
            db.query(sql, params, (error, results) => {
                if (error) reject(error);
                else resolve(results);
            });
        });
    }

    /**
     * 生成数据库用户ID
     */
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

    // ============ Agent管理 ============

    /**
     * 注册Agent到链上
     * @param {number} agentId - Agent ID
     * @param {string} ownerAddress - Agent所有者地址
     * @param {number} price - Agent价格（credits）
     */
    async registerAgent(agentId, ownerAddress, price) {
        await this.ensureInitialized();

        try {
            console.log(`📝 Registering agent ${agentId} on-chain...`);

            // 调用智能合约
            const tx = await this.contract.methods
                .registerAgent(agentId, ownerAddress, price)
                .send({
                    from: this.serverAccount.address,
                    gas: 500000
                });

            console.log(`✅ Agent ${agentId} registered on-chain: ${tx.transactionHash}`);

            // 更新数据库（缓存）
            await this.query(
                `UPDATE agents
                 SET on_chain = TRUE,
                     chain_tx_hash = ?,
                     updated_at = NOW()
                 WHERE id = ?`,
                [tx.transactionHash, agentId]
            );

            return {
                success: true,
                transactionHash: tx.transactionHash,
                agentId
            };

        } catch (error) {
            console.error(`❌ Failed to register agent ${agentId}:`, error);
            throw error;
        }
    }

    /**
     * 批量注册现有Agent到链上（数据迁移）
     */
    async migrateExistingAgents() {
        await this.ensureInitialized();

        try {
            // 获取所有未上链的Agent
            const agents = await this.query(
                'SELECT id, owner, price FROM agents WHERE on_chain = FALSE OR on_chain IS NULL'
            );

            console.log(`📦 Migrating ${agents.length} agents to blockchain...`);

            const results = [];
            for (const agent of agents) {
                try {
                    const result = await this.registerAgent(agent.id, agent.owner, agent.price || 0);
                    results.push({ agentId: agent.id, success: true, tx: result.transactionHash });

                    // 避免过快发送交易
                    await new Promise(resolve => setTimeout(resolve, 2000));

                } catch (error) {
                    console.error(`Failed to migrate agent ${agent.id}:`, error);
                    results.push({ agentId: agent.id, success: false, error: error.message });
                }
            }

            return results;

        } catch (error) {
            console.error('Agent migration failed:', error);
            throw error;
        }
    }

    // ============ Credit管理 ============

    /**
     * 添加Credits（购买后调用）
     * @param {string} userAddress - 用户地址
     * @param {number} amount - Credits数量
     * @param {string} source - 来源标识
     */
    async addCredits(userAddress, amount, source = 'purchase') {
        await this.ensureInitialized();

        try {
            console.log(`💳 Adding ${amount} credits to ${userAddress}...`);

            // 调用智能合约
            const tx = await this.contract.methods
                .addCredits(userAddress, amount, source)
                .send({
                    from: this.serverAccount.address,
                    gas: 200000
                });

            console.log(`✅ Credits added on-chain: ${tx.transactionHash}`);

            // 同步到数据库（缓存）
            const dbUserId = this.generateDatabaseUserId(userAddress);
            await this.query(
                `UPDATE user_credits
                 SET credit_balance = credit_balance + ?,
                     updated_at = NOW()
                 WHERE user_id = ?`,
                [amount, dbUserId]
            );

            return {
                success: true,
                transactionHash: tx.transactionHash,
                amount
            };

        } catch (error) {
            console.error('Failed to add credits:', error);
            throw error;
        }
    }

    // ============ 批量上链处理 ============

    /**
     * 启动时从数据库加载待上链的记录到队列
     */
    async loadPendingRecords() {
        try {
            const pendingRecords = await this.query(
                `SELECT id, agent_id, user_id, amount, created_at, record_hash, server_signature
                 FROM credit_consumption
                 WHERE status = 'pending' AND agent_id IS NOT NULL
                 ORDER BY created_at ASC`
            );

            if (pendingRecords.length === 0) {
                console.log('📭 No pending records to load');
                return;
            }

            console.log(`📥 Loading ${pendingRecords.length} pending records into queue...`);

            let validCount = 0;
            let tamperedCount = 0;

            for (const record of pendingRecords) {
                // 🔒 验证签名
                const isValid = await this.verifyRecordSignature(record);

                if (!isValid) {
                    console.error(`🚨 TAMPERED RECORD DETECTED: ${record.id}`);
                    tamperedCount++;

                    // 标记为篡改
                    await this.query(
                        `UPDATE credit_consumption SET status = 'tampered', updated_at = NOW() WHERE id = ?`,
                        [record.id]
                    );
                    continue; // 跳过这条记录
                }

                // 验证通过，加入队列
                const call = {
                    agentId: String(record.agent_id),
                    userAddress: record.user_id,
                    credits: record.amount,
                    timestamp: new Date(record.created_at).getTime(),
                    id: record.id,
                    hash: record.record_hash
                };
                this.callQueue.push(call);
                validCount++;
            }

            console.log(`✅ Loaded ${validCount} valid records, ${tamperedCount} tampered records filtered, queue size: ${this.callQueue.length}`);

            if (tamperedCount > 0) {
                console.error(`🚨 SECURITY ALERT: ${tamperedCount} tampered records detected and blocked!`);
                // TODO: 发送告警通知
            }

            // 如果队列数量达到紧急阈值，立即处理
            if (this.callQueue.length >= this.urgentBatchSize) {
                console.log(`🚨 Queue size (${this.callQueue.length}) >= urgent size (${this.urgentBatchSize}), will process immediately after startup`);
            }

        } catch (error) {
            console.error('❌ Failed to load pending records:', error);
            // 不抛出错误，允许服务继续启动
        }
    }

    /**
     * 启动批量上链处理器
     */
    startBatchProcessor() {
        if (this.batchTimer) {
            return; // 已经在运行
        }

        console.log(`🚀 Starting batch processor (interval: ${this.batchInterval}ms, max batch: ${this.maxBatchSize})`);

        // 启动定时器
        this.batchTimer = setInterval(async () => {
            await this.processBatch();
        }, this.batchInterval);

        // 🔧 启动时如果队列已有足够数据，立即触发一次处理
        if (this.callQueue.length >= this.minBatchSize) {
            console.log(`🚀 Queue has ${this.callQueue.length} records, triggering immediate batch processing...`);
            setImmediate(() => this.processBatch());
        }
    }

    /**
     * 停止批量处理器
     */
    stopBatchProcessor() {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
            console.log('⏸️ Batch processor stopped');
        }
    }

    /**
     * 添加调用到队列（不立即上链）
     * @param {string} agentId - Agent ID
     * @param {string} userAddress - 用户地址
     * @param {number} credits - 消耗的 credits
     * @returns {Object} 队列状态
     */
    async queueAgentCall(agentId, userAddress, credits) {
        const call = {
            agentId: String(agentId),
            userAddress,
            credits,
            timestamp: Date.now(),
            id: UUID.v4()
        };

        this.callQueue.push(call);

        // 🔧 修复：不再重复扣费和插入记录，creditService已经处理了
        // 这里只是加入队列等待批量上链
        console.log(`📝 Queued agent call for batch upload: agent=${agentId}, user=${userAddress}, credits=${credits}, queue size=${this.callQueue.length}`);

        // 紧急上链策略：如果队列达到紧急阈值，立即触发批量处理
        if (this.callQueue.length >= this.urgentBatchSize) {
            console.log(`🚨 Queue reached urgent size (${this.callQueue.length} >= ${this.urgentBatchSize}), triggering immediate batch processing...`);
            // 异步触发，不阻塞当前请求
            setImmediate(() => this.processBatch());
        }

        return {
            success: true,
            queued: true,
            queueSize: this.callQueue.length,
            callId: call.id
        };
    }

    /**
     * 处理批量上链
     */
    async processBatch() {
        if (this.isBatchProcessing) {
            console.log('⏭️ Batch processing already in progress, skipping...');
            return;
        }

        if (this.callQueue.length === 0) {
            return; // 队列为空
        }

        // 智能批量策略：如果队列太小，跳过本次（等待积累更多）
        if (this.callQueue.length < this.minBatchSize) {
            console.log(`⏭️ Queue too small (${this.callQueue.length} < ${this.minBatchSize}), waiting for more calls...`);
            return;
        }

        // 🔥 自适应流量控制：防止高流量时频繁上链
        if (this.adaptiveMode) {
            const now = Date.now();
            const timeSinceLastBatch = now - this.lastBatchTime;

            // 如果距离上次上链时间太短，等待一下（除非是紧急情况）
            if (timeSinceLastBatch < this.minBatchInterval) {
                // 检查是否是紧急情况（队列堆积严重）
                const urgentThreshold = this.urgentBatchSize * 2; // 100条（2倍紧急阈值）

                if (this.callQueue.length < urgentThreshold) {
                    const waitTime = Math.round((this.minBatchInterval - timeSinceLastBatch) / 1000);
                    console.log(`⏸️ Too soon since last batch (${Math.round(timeSinceLastBatch/1000)}s ago), waiting ${waitTime}s... (queue: ${this.callQueue.length})`);
                    return;
                } else {
                    console.log(`🚨 URGENT: Queue critical (${this.callQueue.length} >= ${urgentThreshold}), processing despite time limit!`);
                }
            }
        }

        this.isBatchProcessing = true;

        try {
            await this.ensureInitialized();

            // 取出一批数据
            const batch = this.callQueue.splice(0, this.maxBatchSize);

            console.log(`📦 Processing batch: ${batch.length} calls`);

            const results = [];
            let successCount = 0;
            let failCount = 0;

            // 逐个上链（快速连续发送）
            for (const call of batch) {
                try {
                    // 🔒 从数据库重新读取记录，验证数据完整性，同时获取 agent owner 和 price
                    const dbRecord = await this.query(
                        `SELECT cc.id, cc.agent_id, cc.user_id, cc.amount, cc.created_at, cc.record_hash, cc.server_signature,
                                a.owner as agent_owner_id, a.price as agent_price, u.wallet_address as agent_owner_wallet
                         FROM credit_consumption cc
                         LEFT JOIN agents a ON cc.agent_id = a.id
                         LEFT JOIN users u ON a.owner = u.id
                         WHERE cc.id = ?`,
                        [call.id]
                    );

                    if (!dbRecord || dbRecord.length === 0) {
                        console.error(`🚨 Record ${call.id} not found in DB, skipping...`);
                        failCount++;
                        continue;
                    }

                    const record = dbRecord[0];

                    // 验证必要的字段存在
                    if (!record.agent_owner_wallet) {
                        console.error(`🚨 Record ${call.id} missing agent owner wallet address, skipping...`);
                        failCount++;
                        continue;
                    }

                    // 🔒 再次验证签名
                    const isValid = await this.verifyRecordSignature(record);
                    if (!isValid) {
                        console.error(`🚨 Record ${call.id} failed signature verification, marking as tampered`);
                        await this.query(
                            `UPDATE credit_consumption SET status = 'tampered', updated_at = NOW() WHERE id = ?`,
                            [call.id]
                        );
                        failCount++;
                        continue;
                    }

                    // 🔒 验证金额是否被篡改
                    if (record.amount !== call.credits) {
                        console.error(`🚨 Amount tampered for record ${call.id}: DB=${record.amount}, Queue=${call.credits}`);
                        await this.query(
                            `UPDATE credit_consumption SET status = 'tampered', updated_at = NOW() WHERE id = ?`,
                            [call.id]
                        );
                        failCount++;
                        continue;
                    }

                    // 验证通过，调用智能合约记录单个 Agent 调用
                    // 新合约需要传入: agentId, caller, agentOwner, price, sessionId
                    const tx = await this.contract.methods
                        .recordAgentCall(
                            parseInt(call.agentId),
                            call.userAddress,
                            record.agent_owner_wallet,
                            String(record.amount),  // price (amount consumed)
                            call.id  // 使用 call.id 作为 sessionId
                        )
                        .send({
                            from: this.serverAccount.address,
                            gas: 500000,
                            maxPriorityFeePerGas: '30000000000',  // 30 Gwei
                            maxFeePerGas: '100000000000'  // 100 Gwei
                        });

                    console.log(`   ✅ Call recorded: agent=${call.agentId}, tx=${tx.transactionHash.substring(0, 10)}...`);

                    // 更新数据库中的状态
                    await this.query(
                        `UPDATE credit_consumption
                         SET status = 'completed',
                             tx_hash = ?,
                             updated_at = NOW()
                         WHERE id = ?`,
                        [tx.transactionHash, call.id]
                    );

                    // 更新 Agent 统计
                    await this.query(
                        `UPDATE agents
                         SET total_calls = total_calls + 1,
                             total_earnings = total_earnings + ?,
                             updated_at = NOW()
                         WHERE id = ?`,
                        [call.credits, call.agentId]
                    );

                    results.push({ success: true, call, tx: tx.transactionHash });
                    successCount++;

                } catch (error) {
                    console.error(`   ❌ Failed to record call ${call.id}:`, error.message);

                    // 标记为失败
                    await this.query(
                        `UPDATE credit_consumption
                         SET status = 'failed',
                         updated_at = NOW()
                         WHERE id = ?`,
                        [call.id]
                    );

                    results.push({ success: false, call, error: error.message });
                    failCount++;
                }
            }

            console.log(`✅ Batch processing completed`);
            console.log(`   - Processed: ${batch.length}`);
            console.log(`   - Success: ${successCount}`);
            console.log(`   - Failed: ${failCount}`);
            console.log(`   - Remaining queue: ${this.callQueue.length}`);

            // 记录本次上链时间（用于自适应流量控制）
            this.lastBatchTime = Date.now();

            return {
                success: true,
                batchSize: batch.length,
                successCount,
                failCount,
                results
            };

        } catch (error) {
            console.error('❌ Batch processing failed:', error);

            // 处理失败时，将这批数据放回队列头部
            // this.callQueue.unshift(...batch); // 可选：根据需求决定是否重试

            throw error;
        } finally {
            this.isBatchProcessing = false;
        }
    }

    /**
     * 手动触发批量上链（用于测试或强制上链）
     */
    async flushQueue() {
        console.log(`🔄 Manually flushing queue (${this.callQueue.length} calls)...`);

        while (this.callQueue.length > 0) {
            await this.processBatch();
            // 避免过快连续发送交易
            if (this.callQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log('✅ Queue flushed');
    }

    /**
     * 获取队列状态
     */
    getQueueStatus() {
        return {
            queueSize: this.callQueue.length,
            isProcessing: this.isBatchProcessing,
            batchInterval: this.batchInterval,
            maxBatchSize: this.maxBatchSize
        };
    }

    // ============ Agent调用和收益分配 ============

    /**
     * 记录Agent调用并分配收益（关键函数）
     * 🔒 安全性：此函数是收益分配的核心，所有数据上链
     *
     * @param {number} agentId - Agent ID
     * @param {string} callerAddress - 调用者地址
     * @param {string} sessionId - 会话ID
     * @returns {Object} 调用结果
     *
     * @deprecated 使用 queueAgentCall 代替，以实现批量上链优化
     */
    async recordAgentCall(agentId, callerAddress, sessionId) {
        await this.ensureInitialized();

        try {
            console.log(`📞 Recording agent call: agent=${agentId}, caller=${callerAddress}`);

            // 调用智能合约记录
            const tx = await this.contract.methods
                .recordAgentCall(agentId, callerAddress, sessionId)
                .send({
                    from: this.serverAccount.address,
                    gas: 500000
                });

            console.log(`✅ Agent call recorded on-chain: ${tx.transactionHash}`);

            // 从事件中提取信息
            const events = tx.events;
            const agentCalledEvent = events.AgentCalled;

            const price = agentCalledEvent?.returnValues?.price || 0;
            const agentOwner = agentCalledEvent?.returnValues?.agentOwner;

            // 同步到数据库（缓存）
            const dbUserId = this.generateDatabaseUserId(callerAddress);
            const consumptionId = UUID.v4();

            // 更新用户余额缓存
            if (price > 0) {
                await this.query(
                    `UPDATE user_credits
                     SET credit_balance = credit_balance - ?,
                         last_used_at = NOW()
                     WHERE user_id = ?`,
                    [price, dbUserId]
                );
            }

            // 记录消费历史
            await this.query(
                `INSERT INTO credit_consumption (
                    id, user_id, conversation_id, agent_id, price, balance_type,
                    amount, message_type, tx_hash, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [consumptionId, dbUserId, sessionId, agentId, price, 'creditBalance', price, 'AGENT_CALL', tx.transactionHash]
            );

            // 更新Agent统计（缓存）
            await this.query(
                `UPDATE agents
                 SET total_calls = total_calls + 1,
                     total_earnings = total_earnings + ?,
                     updated_at = NOW()
                 WHERE id = ?`,
                [price, agentId]
            );

            return {
                success: true,
                transactionHash: tx.transactionHash,
                price,
                agentOwner
            };

        } catch (error) {
            console.error('Failed to record agent call:', error);
            throw error;
        }
    }

    // ============ 提现管理 ============

    /**
     * 请求提现
     * @param {string} userAddress - 用户地址
     * @param {number} amount - 提现金额
     */
    async requestWithdrawal(userAddress, amount) {
        await this.ensureInitialized();

        try {
            console.log(`💰 User ${userAddress} requesting withdrawal of ${amount} credits...`);

            // 🔒 关键安全检查：验证链上余额
            const chainBalance = await this.contract.methods.earningsBalance(userAddress).call();

            if (parseInt(chainBalance) < amount) {
                throw new Error(`Insufficient on-chain balance. Available: ${chainBalance}, Requested: ${amount}`);
            }

            // 调用智能合约创建提现请求
            const tx = await this.contract.methods
                .requestWithdrawal(amount)
                .send({
                    from: userAddress,
                    gas: 300000
                });

            const requestId = tx.events.WithdrawalRequested?.returnValues?.requestId;

            console.log(`✅ Withdrawal request created: requestId=${requestId}, tx=${tx.transactionHash}`);

            // 记录到数据库
            const dbUserId = this.generateDatabaseUserId(userAddress);
            const id = UUID.v4();

            await this.query(
                `INSERT INTO credit_withdrawals (
                    id, request_id, user_id, amount, status, tx_hash, created_at
                ) VALUES (?, ?, ?, ?, 'pending', ?, NOW())`,
                [id, requestId, dbUserId, amount, tx.transactionHash]
            );

            return {
                success: true,
                requestId,
                transactionHash: tx.transactionHash
            };

        } catch (error) {
            console.error('Withdrawal request failed:', error);
            throw error;
        }
    }

    /**
     * 处理提现（管理员审核后）
     * 🔒 关键安全函数：包含三层验证
     *
     * @param {number} requestId - 提现请求ID
     * @param {string} usdtTxHash - USDT转账交易哈希
     */
    async processWithdrawal(requestId, usdtTxHash) {
        await this.ensureInitialized();

        try {
            console.log(`🔍 Processing withdrawal request ${requestId}...`);

            // 获取提现请求信息
            const request = await this.contract.methods.withdrawalRequests(requestId).call();
            const userAddress = request.user;
            const amount = parseInt(request.amount);

            // 🔒 三层安全验证
            console.log('🔒 Security Check 1: Calculate actual total earnings from chain...');
            const actualTotalEarnings = await this.contract.methods.calculateTotalEarnings(userAddress).call();

            console.log('🔒 Security Check 2: Verify available balance...');
            const totalWithdrawn = await this.contract.methods.totalWithdrawn(userAddress).call();
            const availableToWithdraw = parseInt(actualTotalEarnings) - parseInt(totalWithdrawn);

            console.log(`   Actual Total Earnings: ${actualTotalEarnings}`);
            console.log(`   Total Withdrawn: ${totalWithdrawn}`);
            console.log(`   Available: ${availableToWithdraw}`);
            console.log(`   Requested: ${amount}`);

            if (amount > availableToWithdraw) {
                throw new Error(`⚠️ SECURITY ALERT: Withdrawal amount exceeds actual earnings! Possible database tampering detected.`);
            }

            console.log('🔒 Security Check 3: Verify with database balance...');
            const dbUserId = this.generateDatabaseUserId(userAddress);
            const dbBalance = await this.query(
                'SELECT buy_balance FROM user_credits WHERE user_id = ?',
                [dbUserId]
            );

            const databaseBalance = dbBalance[0]?.buy_balance || 0;
            if (Math.abs(databaseBalance - availableToWithdraw) > 100) {
                console.warn(`⚠️ WARNING: Database balance (${databaseBalance}) differs from chain balance (${availableToWithdraw})!`);
                // 发送告警（这里可以集成告警系统）
                await this.sendTamperingAlert(userAddress, databaseBalance, availableToWithdraw);
            }

            console.log('✅ All security checks passed. Processing withdrawal...');

            // 调用智能合约处理提现
            const txHashBytes32 = this.web3.utils.padLeft(usdtTxHash, 64);

            const tx = await this.contract.methods
                .processWithdrawal(requestId, txHashBytes32)
                .send({
                    from: this.serverAccount.address,
                    gas: 300000
                });

            console.log(`✅ Withdrawal processed: ${tx.transactionHash}`);

            // 更新数据库状态
            await this.query(
                `UPDATE credit_withdrawals
                 SET status = 'completed',
                     usdt_tx_hash = ?,
                     processed_tx_hash = ?,
                     completed_at = NOW()
                 WHERE request_id = ?`,
                [usdtTxHash, tx.transactionHash, requestId]
            );

            // 更新用户余额缓存
            await this.query(
                `UPDATE user_credits
                 SET buy_balance = buy_balance - ?
                 WHERE user_id = ?`,
                [amount, dbUserId]
            );

            return {
                success: true,
                requestId,
                transactionHash: tx.transactionHash,
                amount
            };

        } catch (error) {
            console.error('❌ Withdrawal processing failed:', error);

            // 更新数据库标记失败
            await this.query(
                `UPDATE credit_withdrawals
                 SET status = 'failed',
                     error_message = ?
                 WHERE request_id = ?`,
                [error.message, requestId]
            );

            throw error;
        }
    }

    /**
     * 发送数据库篡改告警
     */
    async sendTamperingAlert(userAddress, databaseBalance, chainBalance) {
        console.error(`
🚨 SECURITY ALERT: DATABASE TAMPERING DETECTED 🚨
─────────────────────────────────────────────────
User: ${userAddress}
Database Balance: ${databaseBalance} credits
Chain Balance: ${chainBalance} credits
Difference: ${Math.abs(databaseBalance - chainBalance)} credits
Timestamp: ${new Date().toISOString()}
─────────────────────────────────────────────────
⚠️ Immediate action required!
        `);

        // TODO: 集成告警系统（邮件/Telegram/Discord等）
        // await sendEmailAlert(...);
        // await sendTelegramAlert(...);
    }

    // ============ 查询函数 ============

    /**
     * 获取用户余额（从链上查询）
     */
    async getUserBalances(userAddress) {
        await this.ensureInitialized();

        try {
            const balances = await this.contract.methods.getUserBalances(userAddress).call();

            return {
                creditBalance: parseInt(balances.credits),
                earningsBalance: parseInt(balances.earnings)
            };

        } catch (error) {
            console.error('Failed to get user balances:', error);
            throw error;
        }
    }

    /**
     * 获取Agent统计（从链上查询）
     */
    async getAgentStats(agentId) {
        await this.ensureInitialized();

        try {
            const stats = await this.contract.methods.getAgentStats(agentId).call();

            return {
                totalCalls: parseInt(stats.totalCalls),
                totalEarnings: parseInt(stats.totalEarnings),
                price: parseInt(stats.price),
                owner: stats.agentOwner
            };

        } catch (error) {
            console.error('Failed to get agent stats:', error);
            throw error;
        }
    }

    /**
     * 计算用户实际总收益（从链上历史计算）
     * 🔒 关键安全函数：用于验证数据库是否被篡改
     */
    async calculateTotalEarnings(userAddress) {
        await this.ensureInitialized();

        try {
            const totalEarnings = await this.contract.methods.calculateTotalEarnings(userAddress).call();
            return parseInt(totalEarnings);

        } catch (error) {
            console.error('Failed to calculate total earnings:', error);
            throw error;
        }
    }

    // ============ 记录签名与验证 ============

    /**
     * 生成记录哈希和签名
     * @param {Object} recordData - 记录数据
     * @returns {Object} {hash, signature}
     */
    generateRecordSignature(recordData) {
        const { id, agent_id, user_id, amount, timestamp } = recordData;

        // 生成记录哈希
        const recordHash = this.web3.utils.keccak256(
            this.web3.eth.abi.encodeParameters(
                ['string', 'uint256', 'address', 'uint256', 'uint256'],
                [id, parseInt(agent_id), user_id, parseInt(amount), parseInt(timestamp)]
            )
        );

        // 服务器私钥签名
        const signature = this.web3.eth.accounts.sign(recordHash, this.serverAccount.privateKey);

        return {
            hash: recordHash,
            signature: signature.signature
        };
    }

    /**
     * 验证记录签名
     * @param {Object} record - 数据库记录
     * @returns {boolean} 是否合法
     */
    async verifyRecordSignature(record) {
        try {
            const { id, agent_id, user_id, amount, created_at, record_hash, server_signature } = record;

            // 如果记录没有签名，说明是旧记录（在签名功能之前创建的）
            if (!record_hash || !server_signature) {
                console.warn(`⚠️ Record ${id} has no signature (legacy record)`);
                return true; // 旧记录暂时允许通过
            }

            // 重新计算哈希
            const timestamp = new Date(created_at).getTime();
            const expectedHash = this.web3.utils.keccak256(
                this.web3.eth.abi.encodeParameters(
                    ['string', 'uint256', 'address', 'uint256', 'uint256'],
                    [id, parseInt(agent_id), user_id, parseInt(amount), timestamp]
                )
            );

            // 验证哈希是否匹配
            if (expectedHash !== record_hash) {
                console.error(`🚨 Hash mismatch for record ${id}:`);
                console.error(`   Expected: ${expectedHash}`);
                console.error(`   Got: ${record_hash}`);
                return false;
            }

            // 验证签名
            const recoveredAddress = this.web3.eth.accounts.recover(
                record_hash,
                server_signature
            );

            // 检查是否是服务器账户签名的
            if (recoveredAddress.toLowerCase() !== this.serverAccount.address.toLowerCase()) {
                console.error(`🚨 Invalid signature for record ${id}:`);
                console.error(`   Recovered: ${recoveredAddress}`);
                console.error(`   Expected: ${this.serverAccount.address}`);
                return false;
            }

            return true;

        } catch (error) {
            console.error(`❌ Signature verification failed for record ${record.id}:`, error.message);
            return false;
        }
    }

    // ============ 同步服务 ============

    /**
     * 从链上同步余额到数据库（定期执行）
     */
    async syncBalancesFromChain() {
        await this.ensureInitialized();

        try {
            console.log('🔄 Syncing balances from blockchain...');

            // 获取所有用户地址
            const users = await this.query('SELECT DISTINCT user_id FROM user_credits');

            let syncCount = 0;
            let mismatchCount = 0;

            for (const user of users) {
                try {
                    const userId = user.user_id;

                    // 跳过非EVM地址
                    if (!userId.startsWith('0x')) continue;

                    // 从链上获取余额
                    const chainBalances = await this.getUserBalances(userId);

                    // 获取数据库余额
                    const dbBalance = await this.query(
                        'SELECT credit_balance, buy_balance FROM user_credits WHERE user_id = ?',
                        [userId]
                    );

                    const dbCreditBalance = dbBalance[0]?.credit_balance || 0;
                    const dbBuyBalance = dbBalance[0]?.buy_balance || 0;

                    // 检查是否有差异
                    if (Math.abs(chainBalances.creditBalance - dbCreditBalance) > 10 ||
                        Math.abs(chainBalances.earningsBalance - dbBuyBalance) > 10) {

                        console.warn(`⚠️ Balance mismatch for ${userId}:`);
                        console.warn(`   DB: credit=${dbCreditBalance}, buy=${dbBuyBalance}`);
                        console.warn(`   Chain: credit=${chainBalances.creditBalance}, earnings=${chainBalances.earningsBalance}`);

                        mismatchCount++;

                        // 以链上数据为准进行更新
                        await this.query(
                            `UPDATE user_credits
                             SET credit_balance = ?,
                                 buy_balance = ?,
                                 last_sync_at = NOW()
                             WHERE user_id = ?`,
                            [chainBalances.creditBalance, chainBalances.earningsBalance, userId]
                        );
                    }

                    syncCount++;

                    // 避免过快查询
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`Failed to sync balance for ${user.user_id}:`, error);
                }
            }

            console.log(`✅ Sync completed: ${syncCount} users processed, ${mismatchCount} mismatches corrected`);

            // 🔒 新增：验证 Agent 收益（防止数据库篡改）
            console.log('🔄 Verifying agent earnings...');
            const earningsMismatchCount = await this.verifyAgentEarnings();
            console.log(`✅ Agent earnings verified: ${earningsMismatchCount} mismatches corrected`);

            return {
                syncCount,
                mismatchCount,
                earningsMismatchCount
            };

        } catch (error) {
            console.error('Balance sync failed:', error);
            throw error;
        }
    }

    /**
     * 🔒 验证 Agent 收益（防止数据库篡改）
     * 对比数据库的 total_earnings 和链上的 agentTotalEarnings
     */
    async verifyAgentEarnings() {
        await this.ensureInitialized();

        try {
            // 获取所有有收益的 Agent
            const agents = await this.query(
                'SELECT id, owner, total_earnings FROM agents WHERE total_earnings > 0'
            );

            let mismatchCount = 0;

            for (const agent of agents) {
                try {
                    // 跳过非EVM地址
                    if (!agent.owner.startsWith('0x')) continue;

                    // 从链上获取该 Agent 的真实收益
                    const chainEarnings = await this.contract.methods
                        .agentTotalEarnings(agent.id)
                        .call();

                    const dbEarnings = agent.total_earnings;
                    const chainEarningsInt = parseInt(chainEarnings);

                    // 检查是否有差异（允许10个credit误差）
                    if (Math.abs(chainEarningsInt - dbEarnings) > 10) {
                        console.error(`🚨 Agent earnings tampering detected!`);
                        console.error(`   Agent ID: ${agent.id}, Owner: ${agent.owner}`);
                        console.error(`   DB earnings: ${dbEarnings}`);
                        console.error(`   Chain earnings: ${chainEarningsInt}`);
                        console.error(`   Difference: ${Math.abs(chainEarningsInt - dbEarnings)}`);

                        mismatchCount++;

                        // 🔒 以链上数据为准进行修正
                        await this.query(
                            'UPDATE agents SET total_earnings = ?, updated_at = NOW() WHERE id = ?',
                            [chainEarningsInt, agent.id]
                        );

                        console.log(`   ✅ Corrected: ${dbEarnings} → ${chainEarningsInt}`);

                        // 发送警报
                        await this.sendTamperingAlert(
                            agent.owner,
                            `Agent ${agent.id} earnings`,
                            dbEarnings,
                            chainEarningsInt
                        );
                    }

                    // 避免过快查询
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`Failed to verify earnings for agent ${agent.id}:`, error.message);
                }
            }

            return mismatchCount;

        } catch (error) {
            console.error('Agent earnings verification failed:', error);
            throw error;
        }
    }
}

module.exports = new AgentEarningsService();

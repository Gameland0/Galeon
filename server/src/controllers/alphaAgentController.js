/**
 * Alpha Agent Controller
 * 处理Alpha Auto Agent相关的API请求
 *
 * API端点:
 * - GET    /api/agents/alpha/usage/:userId        查询使用次数
 * - POST   /api/agents/alpha/signals/view        查看信号详情(扣费)
 * - GET    /api/agents/alpha/signals             获取信号列表(免费浏览)
 * - GET    /api/agents/alpha/signals/new         获取新信号(轮询)
 * - GET    /api/agents/alpha/stats               获取统计数据
 * - GET    /api/agents/alpha/watchlist           获取监控代币列表
 * - POST   /api/agents/alpha/monitor/trigger     手动触发监控(测试用)
 *
 * 计费规则:
 * - 前5次免费体验
 * - 第6次起每次查看详情消耗8 credits
 *
 * 创建时间: 2025-10-22
 * Phase: 0 (MVP-Lite) - Updated for per-view billing
 */

const DatabaseService = require('../services/databaseService');
const BinanceAlphaService = require('../services/BinanceAlphaService');
const alphaMonitorTask = require('../tasks/alphaMonitorTask');
const creditService = require('../services/creditService');
const TokenLearningService = require('../services/TokenLearningService');
const LearningEngine = require('../services/LearningEngine');

/**
 * GET /api/agents/alpha/usage/:userId
 * 查询用户使用次数
 */
exports.getUsage = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    // 查询或创建用户使用记录
    let usage = await DatabaseService.query(
      'SELECT * FROM alpha_agent_subscriptions WHERE user_id = ?',
      [userId]
    );

    if (usage.length === 0) {
      // 首次使用，创建记录
      await DatabaseService.query(
        `INSERT INTO alpha_agent_subscriptions (user_id, free_usage_count, total_paid_usage)
         VALUES (?, 0, 0)`,
        [userId]
      );

      return res.json({
        userId,
        freeUsageCount: 0,
        totalPaidUsage: 0,
        remainingFreeViews: 5,
        isFreeUser: true
      });
    }

    const u = usage[0];
    const freeUsageCount = u.free_usage_count || 0;
    const totalPaidUsage = u.total_paid_usage || 0;
    const remainingFreeViews = Math.max(0, 5 - freeUsageCount);

    res.json({
      userId,
      freeUsageCount,
      totalPaidUsage,
      remainingFreeViews,
      isFreeUser: freeUsageCount < 5,
      totalViews: freeUsageCount + totalPaidUsage
    });

  } catch (error) {
    console.error('❌ Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage', details: error.message });
  }
};

/**
 * POST /api/agents/alpha/signals/view
 * 查看信号详情 - 按次计费
 * 前5次免费，之后每次8 credits
 */
exports.viewSignalDetail = async (req, res) => {
  const { userId, signalId } = req.body;

  if (!userId || !signalId) {
    return res.status(400).json({ error: 'userId and signalId are required' });
  }

  try {
    console.log(`👁️ View signal request: ${userId} - ${signalId}`);

    // 1. 检查信号是否存在
    const signals = await DatabaseService.query(
      'SELECT * FROM alpha_signals WHERE signal_id = ?',
      [signalId]
    );

    if (signals.length === 0) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    // 2. 检查是否当天已购买过该信号
    const todayPurchase = await DatabaseService.query(
      `SELECT * FROM user_received_signals
       WHERE user_id = ?
         AND signal_id = ?
         AND purchase_date = CURDATE()`,
      [userId, signalId]
    );

    if (todayPurchase.length > 0) {
      // 当天已购买,直接返回,不扣费
      console.log(`✅ Already purchased today: ${userId} - ${signalId}`);

      return res.json({
        success: true,
        charged: false,
        alreadyPurchased: true,
        purchasedAt: todayPurchase[0].purchased_at,
        signal: formatSignal(signals[0])
      });
    }

    // 3. 检查是否曾经免费查看过该信号 (无论哪天)
    const freeViewedSignal = await DatabaseService.query(
      `SELECT * FROM user_received_signals
       WHERE user_id = ?
         AND signal_id = ?
         AND purchased_at IS NULL`,
      [userId, signalId]
    );

    if (freeViewedSignal.length > 0) {
      // 之前免费查看过,直接返回,不扣费
      console.log(`✅ Already free viewed: ${userId} - ${signalId}`);

      return res.json({
        success: true,
        charged: false,
        freeViewed: true,
        signal: formatSignal(signals[0])
      });
    }

    // 4. 检查免费查看次数 (统计免费查看过的不同信号数量)
    const freeViewCount = await DatabaseService.query(
      `SELECT COUNT(DISTINCT signal_id) as count
       FROM user_received_signals
       WHERE user_id = ?
         AND purchased_at IS NULL`,
      [userId]
    );

    const currentFreeCount = freeViewCount[0]?.count || 0;

    // 5. 判断是否可以免费查看
    if (currentFreeCount < 5) {
      // 记录免费查看
      await DatabaseService.query(
        `INSERT INTO user_received_signals
         (user_id, signal_id, received_at, is_read, purchased_at, purchase_date, cost)
         VALUES (?, ?, NOW(), TRUE, NULL, NULL, 0)`,
        [userId, signalId]
      );

      console.log(`✅ Free view (${currentFreeCount + 1}/5): ${userId} - ${signalId}`);

      return res.json({
        success: true,
        charged: false,
        remainingFreeViews: 4 - currentFreeCount,
        signal: formatSignal(signals[0])
      });

    } else {
      // 5. 需要扣除 8 credits - 使用事务确保原子性
      const COST = 8;
      const UUID = require('uuid');
      const db = require('../config/database');

      // 使用数据库事务处理扣费
      db.getConnection((err, connection) => {
        if (err) {
          console.error('Failed to get database connection:', err);
          return res.status(500).json({ error: 'Database connection failed' });
        }

        connection.beginTransaction(async (transErr) => {
          if (transErr) {
            connection.release();
            return res.status(500).json({ error: 'Transaction failed to start' });
          }

          try {
            // 1. 查询用户余额 (FOR UPDATE 锁定)
            const userBalance = await new Promise((resolve, reject) => {
              connection.query(
                'SELECT credit_balance, buy_balance FROM user_credits WHERE user_id = ? FOR UPDATE',
                [userId],
                (error, results) => {
                  if (error) reject(error);
                  else resolve(results);
                }
              );
            });

            if (userBalance.length === 0) {
              return connection.rollback(() => {
                connection.release();
                return res.status(402).json({
                  error: 'User credits record not found',
                  required: COST
                });
              });
            }

            const { credit_balance, buy_balance } = userBalance[0];
            const totalCredits = (credit_balance || 0) + (buy_balance || 0);

            if (totalCredits < COST) {
              return connection.rollback(() => {
                connection.release();
                return res.status(402).json({
                  error: 'Insufficient credits',
                  required: COST,
                  current: totalCredits
                });
              });
            }

            // 2. 扣除 credits（优先扣除 credit_balance (免费积分)，然后扣除 buy_balance）
            let balanceType = 'creditBalance';

            if (credit_balance >= COST) {
              // 完全从 credit_balance 扣除
              await new Promise((resolve, reject) => {
                connection.query(
                  'UPDATE user_credits SET credit_balance = credit_balance - ?, last_used_at = NOW() WHERE user_id = ?',
                  [COST, userId],
                  (error, results) => {
                    if (error) reject(error);
                    else resolve(results);
                  }
                );
              });
              balanceType = 'creditBalance';
            } else if (credit_balance > 0) {
              // 先扣完 credit_balance，剩余从 buy_balance 扣除
              const remainingCost = COST - credit_balance;
              await new Promise((resolve, reject) => {
                connection.query(
                  'UPDATE user_credits SET credit_balance = 0, buy_balance = buy_balance - ?, last_used_at = NOW() WHERE user_id = ?',
                  [remainingCost, userId],
                  (error, results) => {
                    if (error) reject(error);
                    else resolve(results);
                  }
                );
              });
              // 混合扣费时记录为 buyBalance（因为大部分从 buy_balance 扣除）
              balanceType = 'buyBalance';
            } else {
              // 完全从 buy_balance 扣除
              await new Promise((resolve, reject) => {
                connection.query(
                  'UPDATE user_credits SET buy_balance = buy_balance - ?, last_used_at = NOW() WHERE user_id = ?',
                  [COST, userId],
                  (error, results) => {
                    if (error) reject(error);
                    else resolve(results);
                  }
                );
              });
              balanceType = 'buyBalance';
            }

            // 3. 记录购买信息到 user_received_signals
            await new Promise((resolve, reject) => {
              connection.query(
                `INSERT INTO user_received_signals
                 (user_id, signal_id, received_at, is_read, purchased_at, purchase_date, cost)
                 VALUES (?, ?, NOW(), TRUE, NOW(), CURDATE(), ?)`,
                [userId, signalId, COST],
                (error, results) => {
                  if (error) reject(error);
                  else resolve(results);
                }
              );
            });

            // 4. 记录积分消耗到 credit_consumption 表
            const consumptionId = UUID.v4();
            await new Promise((resolve, reject) => {
              connection.query(
                `INSERT INTO credit_consumption
                 (id, user_id, amount, type, balance_type, message_type, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [consumptionId, userId, COST, 'alpha_agent', balanceType, 'signal_view'],
                (error, results) => {
                  if (error) reject(error);
                  else resolve(results);
                }
              );
            });

            // 5. 提交事务
            connection.commit((commitErr) => {
              if (commitErr) {
                return connection.rollback(() => {
                  connection.release();
                  console.error('Transaction commit failed:', commitErr);
                  return res.status(500).json({ error: 'Failed to process payment' });
                });
              }

              connection.release();
              console.log(`💳 Paid view (${COST} credits): ${userId} - ${signalId}`);

              return res.json({
                success: true,
                charged: true,
                cost: COST,
                remainingFreeViews: 0,
                signal: formatSignal(signals[0])
              });
            });

          } catch (error) {
            connection.rollback(() => {
              connection.release();
              console.error('❌ Error in transaction:', error);
              return res.status(500).json({ error: 'Failed to process payment', details: error.message });
            });
          }
        });
      });

      // 注意：这里不能有 return，因为异步回调会处理响应
      return;
    }

  } catch (error) {
    console.error('❌ Error viewing signal:', error);
    res.status(500).json({ error: 'Failed to view signal', details: error.message });
  }
};

/**
 * GET /api/agents/alpha/signals
 * 获取信号列表（免费浏览，不包含详细信息）
 */
exports.getSignals = async (req, res) => {
  const {
    userId,
    status = 'ACTIVE',
    tokenSymbol,
    signalType,  // 新增：信号类型筛选 (LONG, SHORT, BUY, SELL)
    limit = 20,
    offset = 0,
    sortBy = 'confidence'  // time 或 confidence (默认按最新时间范围内的 confidence 排序)
  } = req.query;

  try {
    console.log('🔍 getSignals called with filters:', { status, tokenSymbol, signalType, sortBy });

    // 每个token只返回最新的一个信号（去重）
    // 特殊处理：当有tokenSymbol搜索时，只返回全局最新的信号（避免RECALL和RECALLUSDT都返回）
    const params = [];

    if (tokenSymbol) {
      // 有搜索词时：先获取每个token的最新信号，然后只返回时间最新的几条
      // 第一步：获取所有匹配的token的最新信号
      let innerQuery = `
        SELECT s1.*
        FROM alpha_signals s1
        INNER JOIN (
          SELECT token_symbol, MAX(created_at) as max_created
          FROM alpha_signals
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
      `;
      const innerParams = [];

      if (status && status !== 'ALL') {
        innerQuery += ' AND status = ?';
        innerParams.push(status);
      }

      innerQuery += ' AND token_symbol LIKE ?';
      innerParams.push(`%${tokenSymbol}%`);

      if (signalType) {
        innerQuery += ' AND signal_type = ?';
        innerParams.push(signalType);
      }

      innerQuery += `
          GROUP BY token_symbol
        ) s2 ON s1.token_symbol = s2.token_symbol AND s1.created_at = s2.max_created
        WHERE 1=1
      `;

      if (status && status !== 'ALL') {
        innerQuery += ' AND s1.status = ?';
        innerParams.push(status);
      }

      innerQuery += ' AND s1.token_symbol LIKE ?';
      innerParams.push(`%${tokenSymbol}%`);

      if (signalType) {
        innerQuery += ' AND s1.signal_type = ?';
        innerParams.push(signalType);
      }

      // 第二步：从每个token的最新信号中，按时间排序取最新的N条
      if (sortBy === 'confidence') {
        innerQuery += ' ORDER BY s1.confidence_score DESC, s1.created_at DESC LIMIT ? OFFSET ?';
      } else {
        innerQuery += ' ORDER BY s1.created_at DESC LIMIT ? OFFSET ?';
      }
      innerParams.push(parseInt(limit), parseInt(offset));

      const signals = await DatabaseService.query(innerQuery, innerParams);

      // 获取总数（匹配的不同token数量）
      let countQuery = `SELECT COUNT(DISTINCT token_symbol) as total FROM alpha_signals WHERE 1=1`;
      const countParams = [];

      if (status && status !== 'ALL') {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      countQuery += ' AND token_symbol LIKE ?';
      countParams.push(`%${tokenSymbol}%`);

      if (signalType) {
        countQuery += ' AND signal_type = ?';
        countParams.push(signalType);
      }

      const countResult = await DatabaseService.query(countQuery, countParams);
      const total = countResult[0].total;

      console.log('✅ Query result (with search):', signals.length, 'signals, Total unique tokens:', total);

      // 批量获取实时价格
      const BinanceAlphaService = require('../services/BinanceAlphaService');
      const cexTokenSymbols = signals
        .map(s => s.token_symbol)
        .filter(symbol => symbol.includes('USDT') || symbol.includes('BTC'));
      const realtimePrices = await BinanceAlphaService.getBatchRealtimePrices(cexTokenSymbols);

      return res.json({
        signals: signals.map(s => formatSignalPreview(s, realtimePrices[s.token_symbol])),
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + signals.length < total
      });

    } else {
      // 没有搜索词时：按token分组，每个token返回最新的
      let query = `
        SELECT s1.*
        FROM alpha_signals s1
        INNER JOIN (
          SELECT token_symbol, MAX(created_at) as max_created
          FROM alpha_signals
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
      `;

      // 子查询应用筛选条件
      if (status && status !== 'ALL') {
        query += ' AND status = ?';
        params.push(status);
      }

      if (signalType) {
        query += ' AND signal_type = ?';
        params.push(signalType);
      }

      query += `
          GROUP BY token_symbol
        ) s2 ON s1.token_symbol = s2.token_symbol
             AND s1.created_at = s2.max_created
        WHERE 1=1
      `;

      // 主查询应用筛选条件
      if (status && status !== 'ALL') {
        query += ' AND s1.status = ?';
        params.push(status);
      }

      if (signalType) {
        query += ' AND s1.signal_type = ?';
        params.push(signalType);
      }

      // 根据sortBy参数选择排序方式
      if (sortBy === 'confidence') {
        query += ' ORDER BY s1.confidence_score DESC, s1.created_at DESC LIMIT ? OFFSET ?';
      } else {
        query += ' ORDER BY s1.created_at DESC LIMIT ? OFFSET ?';
      }
      params.push(parseInt(limit), parseInt(offset));

      const signals = await DatabaseService.query(query, params);

      // 获取总数
      let countQuery = `SELECT COUNT(DISTINCT token_symbol) as total FROM alpha_signals WHERE 1=1`;
      const countParams = [];

      if (status && status !== 'ALL') {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      if (signalType) {
        countQuery += ' AND signal_type = ?';
        countParams.push(signalType);
      }

      const countResult = await DatabaseService.query(countQuery, countParams);
      const total = countResult[0].total;

      console.log('✅ Query result (no search):', signals.length, 'signals, Total:', total);

      // 批量获取实时价格
      const BinanceAlphaService = require('../services/BinanceAlphaService');
      const cexTokenSymbols = signals
        .map(s => s.token_symbol)
        .filter(symbol => symbol.includes('USDT') || symbol.includes('BTC'));
      const realtimePrices = await BinanceAlphaService.getBatchRealtimePrices(cexTokenSymbols);

      // 返回精简版信号列表
      res.json({
        signals: signals.map(s => formatSignalPreview(s, realtimePrices[s.token_symbol])),
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + signals.length < total
      });
    }

  } catch (error) {
    console.error('❌ Error fetching signals:', error);
    res.status(500).json({ error: 'Failed to fetch signals', details: error.message });
  }
};

/**
 * GET /api/agents/alpha/signals/new
 * 获取新信号(用于轮询)
 */
exports.getNewSignals = async (req, res) => {
  const { userId, since } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    // 检查订阅状态
    const subscription = await DatabaseService.query(
      'SELECT * FROM alpha_agent_subscriptions WHERE user_id = ? AND status = "active"',
      [userId]
    );

    if (subscription.length === 0) {
      return res.json({ newSignals: [], count: 0, message: 'Not subscribed' });
    }

    // 获取新信号
    let query = `
      SELECT * FROM alpha_signals
      WHERE status = 'ACTIVE'
      AND created_at > (
        SELECT COALESCE(MAX(received_at), DATE_SUB(NOW(), INTERVAL 1 HOUR))
        FROM user_received_signals
        WHERE user_id = ?
      )
      ORDER BY created_at DESC
      LIMIT 10
    `;

    if (since) {
      query = `
        SELECT * FROM alpha_signals
        WHERE id > ? AND status = 'ACTIVE'
        ORDER BY created_at DESC
        LIMIT 10
      `;
    }

    const params = since ? [since] : [userId];
    const newSignals = await DatabaseService.query(query, params);

    // 记录用户收到信号
    for (const signal of newSignals) {
      await DatabaseService.query(
        `INSERT INTO user_received_signals (user_id, signal_id, received_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE received_at = NOW()`,
        [userId, signal.signal_id]
      );
    }

    // 更新订阅统计
    if (newSignals.length > 0) {
      await DatabaseService.query(
        `UPDATE alpha_agent_subscriptions
         SET total_received_signals = total_received_signals + ?
         WHERE user_id = ? AND status = 'active'`,
        [newSignals.length, userId]
      );
    }

    res.json({
      newSignals: newSignals.map(s => formatSignal(s)),
      count: newSignals.length
    });

  } catch (error) {
    console.error('❌ Error fetching new signals:', error);
    res.status(500).json({ error: 'Failed to fetch new signals', details: error.message });
  }
};

// getSignalDetail 已被 viewSignalDetail (POST) 替代

/**
 * GET /api/agents/alpha/stats
 * 获取Agent统计数据
 */
exports.getStats = async (req, res) => {
  try {
    // Get real-time stats from database
    const totalSignalsResult = await DatabaseService.query(
      'SELECT COUNT(*) as count FROM alpha_signals'
    );
    const totalSignals = totalSignalsResult[0].count;

    // Get signals today
    const signalsTodayResult = await DatabaseService.query(
      'SELECT COUNT(*) as count FROM alpha_signals WHERE DATE(created_at) = CURDATE()'
    );
    const signalsToday = signalsTodayResult[0].count;

    // Get signals this week
    const signalsWeekResult = await DatabaseService.query(
      'SELECT COUNT(*) as count FROM alpha_signals WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );
    const signalsThisWeek = signalsWeekResult[0].count;

    // Calculate win rate from audited signals (排除NEUTRAL，只统计可操作信号)
    // 统计最近7天的数据，反映最新表现
    const winRateResult = await DatabaseService.query(`
      SELECT
        COUNT(*) as total_audited,
        SUM(CASE WHEN status = 'HIT_TP' THEN 1 ELSE 0 END) as hit_tp,
        SUM(CASE WHEN status = 'HIT_SL' THEN 1 ELSE 0 END) as hit_sl,
        AVG(CASE WHEN prediction_accuracy IS NOT NULL THEN prediction_accuracy ELSE NULL END) as avg_accuracy
      FROM alpha_signals
      WHERE learned_at IS NOT NULL
        AND signal_type IN ('LONG', 'SHORT', 'BUY', 'SELL')
        AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);

    const auditData = winRateResult[0];
    const totalAudited = parseInt(auditData.total_audited) || 0;
    const hitTP = parseInt(auditData.hit_tp) || 0;
    const hitSL = parseInt(auditData.hit_sl) || 0;
    const avgAccuracy = parseFloat(auditData.avg_accuracy) || 0;

    // Win Rate = TP / (TP + SL)，只计算可操作信号（LONG/SHORT/BUY/SELL），排除NEUTRAL
    const totalTriggered = hitTP + hitSL;  // Now both are integers, will add correctly
    const winRate = totalTriggered > 0 ? ((hitTP / totalTriggered) * 100).toFixed(2) : '0.00';

    // Get signal type distribution
    const signalTypeResult = await DatabaseService.query(`
      SELECT
        signal_type,
        COUNT(*) as count,
        AVG(confidence_score) as avg_confidence
      FROM alpha_signals
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY signal_type
    `);

    const signalDistribution = {};
    signalTypeResult.forEach(row => {
      signalDistribution[row.signal_type] = {
        count: row.count,
        avgConfidence: parseFloat(row.avg_confidence || 0).toFixed(2)
      };
    });

    res.json({
      totalSignals,
      signalsToday,
      signalsThisWeek,
      totalAudited,           // 总审核数（包含EXPIRED）
      totalTriggered,         // 触发数（TP+SL，用于Win Rate计算）
      hitTP,
      hitSL,
      winRate: parseFloat(winRate),
      avgAccuracy: parseFloat(avgAccuracy).toFixed(2),
      signalDistribution,
      currentModelVersion: 'v1.0-deepseek',
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
};

/**
 * GET /api/agents/alpha/watchlist
 * 获取监控代币列表
 */
exports.getWatchlist = async (req, res) => {
  try {
    const tokens = await DatabaseService.query(
      `SELECT * FROM binance_alpha_tokens
       WHERE has_futures = true AND is_monitored = true
       ORDER BY volume_24h DESC
       LIMIT 50`
    );

    // 获取每个代币的最新信号
    const watchlist = [];

    for (const token of tokens) {
      const latestSignal = await DatabaseService.query(
        `SELECT * FROM alpha_signals
         WHERE token_symbol = ? AND status = 'ACTIVE'
         ORDER BY created_at DESC
         LIMIT 1`,
        [token.futures_symbol]
      );

      watchlist.push({
        symbol: token.token_symbol,
        futuresSymbol: token.futures_symbol,
        price: parseFloat(token.current_price || 0),
        volume24h: parseInt(token.volume_24h || 0),
        lastAnalyzed: token.last_analyzed_at,
        hasSignal: latestSignal.length > 0,
        signal: latestSignal.length > 0 ? {
          type: latestSignal[0].signal_type,
          confidence: parseFloat(latestSignal[0].confidence_score)
        } : null
      });
    }

    res.json({
      watchlist,
      count: watchlist.length
    });

  } catch (error) {
    console.error('❌ Error fetching watchlist:', error);
    res.status(500).json({ error: 'Failed to fetch watchlist', details: error.message });
  }
};

/**
 * POST /api/agents/alpha/monitor/trigger
 * 手动触发监控任务(仅用于测试)
 */
exports.triggerMonitor = async (req, res) => {
  try {
    console.log('🔧 Manual monitor trigger requested');

    // 异步运行，立即返回
    alphaMonitorTask.runNow();

    res.json({
      success: true,
      message: 'Monitor task triggered',
      status: alphaMonitorTask.getStatus()
    });

  } catch (error) {
    console.error('❌ Error triggering monitor:', error);
    res.status(500).json({ error: 'Failed to trigger monitor', details: error.message });
  }
};

/**
 * GET /api/agents/alpha/monitor/status
 * 获取监控任务状态
 */
exports.getMonitorStatus = async (req, res) => {
  try {
    const status = alphaMonitorTask.getStatus();

    res.json({
      success: true,
      status
    });

  } catch (error) {
    console.error('❌ Error fetching monitor status:', error);
    res.status(500).json({ error: 'Failed to fetch monitor status', details: error.message });
  }
};

// ==================== Token Learning Stats ====================

/**
 * GET /api/agents/alpha/tokens/:tokenSymbol/stats
 * 获取单个代币的学习统计
 */
exports.getTokenStats = async (req, res) => {
  const { tokenSymbol } = req.params;

  if (!tokenSymbol) {
    return res.status(400).json({ error: 'tokenSymbol is required' });
  }

  try {
    const stats = await TokenLearningService.getTokenStats(tokenSymbol);

    if (!stats) {
      return res.status(404).json({ error: 'Token stats not found' });
    }

    res.json({
      success: true,
      tokenSymbol,
      stats: {
        totalSignals: stats.total_signals,
        signalsToday: stats.signals_today,
        signalsThisWeek: stats.signals_this_week,
        totalAudited: stats.total_audited,
        hitTPCount: stats.hit_tp_count,
        hitSLCount: stats.hit_sl_count,
        expiredCount: stats.expired_count,
        winRate: parseFloat(stats.win_rate),
        avgAccuracy: parseFloat(stats.avg_accuracy),
        avgReturn: parseFloat(stats.avg_return),
        signalDistribution: {
          buy: stats.buy_signal_count,
          sell: stats.sell_signal_count,
          neutral: stats.neutral_signal_count
        },
        bestReturn: stats.best_return ? parseFloat(stats.best_return) : null,
        worstReturn: stats.worst_return ? parseFloat(stats.worst_return) : null,
        bestSignalId: stats.best_signal_id,
        worstSignalId: stats.worst_signal_id,
        lastSignalAt: stats.last_signal_at,
        lastUpdated: stats.last_updated
      }
    });

  } catch (error) {
    console.error(`❌ Error fetching token stats for ${tokenSymbol}:`, error);
    res.status(500).json({ error: 'Failed to fetch token stats', details: error.message });
  }
};

/**
 * GET /api/agents/alpha/tokens/leaderboard
 * 获取代币排行榜（最佳/最差表现）
 * Query参数:
 * - type: 'top' | 'bottom' (default: 'top')
 * - limit: 数量限制 (default: 10)
 */
exports.getTokenLeaderboard = async (req, res) => {
  const { type = 'top', limit = 10 } = req.query;

  try {
    const limitNum = Math.min(parseInt(limit) || 10, 50); // 最多50个
    let tokens;

    if (type === 'bottom') {
      tokens = await TokenLearningService.getBottomPerformingTokens(limitNum);
    } else {
      tokens = await TokenLearningService.getTopPerformingTokens(limitNum);
    }

    const leaderboard = tokens.map((token, index) => ({
      rank: index + 1,
      tokenSymbol: token.token_symbol,
      totalSignals: token.total_signals,
      totalAudited: token.total_audited,
      hitTPCount: token.hit_tp_count,
      hitSLCount: token.hit_sl_count,
      winRate: parseFloat(token.win_rate),
      avgAccuracy: parseFloat(token.avg_accuracy),
      avgReturn: parseFloat(token.avg_return),
      bestReturn: type === 'top' && token.best_return ? parseFloat(token.best_return) : undefined,
      worstReturn: type === 'bottom' && token.worst_return ? parseFloat(token.worst_return) : undefined,
      lastSignalAt: token.last_signal_at
    }));

    res.json({
      success: true,
      type,
      count: leaderboard.length,
      leaderboard
    });

  } catch (error) {
    console.error('❌ Error fetching token leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch token leaderboard', details: error.message });
  }
};

/**
 * POST /api/agents/alpha/tokens/stats/refresh
 * 手动刷新所有代币的学习统计（管理员功能）
 */
exports.refreshAllTokenStats = async (req, res) => {
  try {
    console.log('🔄 Manual refresh of all token stats requested');

    // 异步运行，立即返回
    TokenLearningService.updateAllTokenStats().catch(err => {
      console.error('❌ Error in background token stats refresh:', err);
    });

    res.json({
      success: true,
      message: 'Token stats refresh triggered in background'
    });

  } catch (error) {
    console.error('❌ Error triggering token stats refresh:', error);
    res.status(500).json({ error: 'Failed to trigger refresh', details: error.message });
  }
};

/**
 * GET /api/agents/alpha/tokens/overview
 * 获取所有代币的统计概览
 */
exports.getTokensOverview = async (req, res) => {
  try {
    const overallStats = await TokenLearningService.getOverallStats();

    res.json({
      success: true,
      overview: {
        totalTokens: overallStats.totalTokens || 0,
        totalSignals: overallStats.totalSignalsAllTokens || 0,
        totalAudited: overallStats.totalAuditedAllTokens || 0,
        totalHitTP: overallStats.totalHitTP || 0,
        totalHitSL: overallStats.totalHitSL || 0,
        avgWinRate: parseFloat(overallStats.avgWinRate || 0).toFixed(2),
        avgAccuracy: parseFloat(overallStats.avgAccuracy || 0).toFixed(2),
        avgReturn: parseFloat(overallStats.avgReturn || 0).toFixed(2)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching tokens overview:', error);
    res.status(500).json({ error: 'Failed to fetch overview', details: error.message });
  }
};

// ==================== Auto-Learning ====================

/**
 * POST /api/agents/alpha/learning/run
 * 手动触发学习循环
 */
exports.runLearningCycle = async (req, res) => {
  try {
    console.log('🧠 Manual learning cycle requested');

    // Run learning in background
    LearningEngine.runLearningCycle('MANUAL').then(result => {
      console.log('✅ Learning cycle completed:', result);
    }).catch(err => {
      console.error('❌ Learning cycle failed:', err);
    });

    res.json({
      success: true,
      message: 'Learning cycle started in background'
    });

  } catch (error) {
    console.error('❌ Error triggering learning:', error);
    res.status(500).json({ error: 'Failed to trigger learning', details: error.message });
  }
};

/**
 * GET /api/agents/alpha/learning/history
 * 获取学习历史
 */
exports.getLearningHistory = async (req, res) => {
  const { limit = 10 } = req.query;

  try {
    const history = await LearningEngine.getLearningHistory(parseInt(limit));

    const formattedHistory = history.map(h => ({
      learningRunId: h.learning_run_id,
      previousConfig: {
        name: h.previous_config_name,
        version: h.previous_version
      },
      newConfig: {
        name: h.new_config_name,
        version: h.new_version
      },
      signalsAnalyzed: h.signals_analyzed,
      timePeriodDays: h.time_period_days,
      previousWinRate: parseFloat(h.previous_win_rate),
      newWinRate: parseFloat(h.new_win_rate),
      previousAvgReturn: parseFloat(h.previous_avg_return),
      newAvgReturn: parseFloat(h.new_avg_return),
      weightChanges: h.weight_changes ? JSON.parse(h.weight_changes) : null,
      algorithm: h.algorithm_used,
      learningRate: parseFloat(h.learning_rate),
      improvementPercentage: parseFloat(h.improvement_percentage),
      triggeredBy: h.triggered_by,
      status: h.status,
      notes: h.notes,
      createdAt: h.created_at
    }));

    res.json({
      success: true,
      history: formattedHistory
    });

  } catch (error) {
    console.error('❌ Error fetching learning history:', error);
    res.status(500).json({ error: 'Failed to fetch learning history', details: error.message });
  }
};

/**
 * GET /api/agents/alpha/learning/config
 * 获取当前激活的配置
 */
exports.getActiveConfig = async (req, res) => {
  try {
    const weightsConfig = await LearningEngine.getActiveConfig('WEIGHTS');
    const thresholdsConfig = await LearningEngine.getActiveConfig('THRESHOLDS');

    res.json({
      success: true,
      config: {
        weights: {
          name: weightsConfig.config_name,
          version: weightsConfig.version,
          oiFunding: parseFloat(weightsConfig.oi_funding_weight),
          trend: parseFloat(weightsConfig.trend_weight),
          pattern: parseFloat(weightsConfig.pattern_weight),
          volume: parseFloat(weightsConfig.volume_weight),
          keyLevels: parseFloat(weightsConfig.key_levels_weight),
          rsi: parseFloat(weightsConfig.rsi_weight),
          macd: parseFloat(weightsConfig.macd_weight),
          performance: {
            totalSignals: weightsConfig.total_signals,
            winRate: parseFloat(weightsConfig.win_rate),
            avgReturn: parseFloat(weightsConfig.avg_return)
          },
          activatedAt: weightsConfig.activated_at
        },
        thresholds: {
          name: thresholdsConfig.config_name,
          version: thresholdsConfig.version,
          minConfidence: parseFloat(thresholdsConfig.min_confidence),
          minOiChange: parseFloat(thresholdsConfig.min_oi_change),
          minFundingRate: parseFloat(thresholdsConfig.min_funding_rate)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching active config:', error);
    res.status(500).json({ error: 'Failed to fetch active config', details: error.message });
  }
};

/**
 * POST /api/agents/alpha/learning/rollback
 * 回滚到之前的配置
 */
exports.rollbackLearning = async (req, res) => {
  const { learningRunId } = req.body;

  if (!learningRunId) {
    return res.status(400).json({ error: 'learningRunId is required' });
  }

  try {
    const result = await LearningEngine.rollbackToPreviousConfig(learningRunId);

    res.json({
      success: true,
      message: 'Successfully rolled back to previous configuration',
      result
    });

  } catch (error) {
    console.error('❌ Error rolling back:', error);
    res.status(500).json({ error: 'Failed to rollback', details: error.message });
  }
};

// ==================== 辅助函数 ====================

/**
 * 格式化信号预览（列表用，包含基本预览信息）
 * @param {Object} signal - 信号数据
 * @param {Number} realtimePrice - 实时价格（可选）
 */
function formatSignalPreview(signal, realtimePrice) {
  const signalPrice = parseFloat(signal.current_price);
  const currentPrice = realtimePrice || signalPrice;

  // 计算价格变化百分比
  let priceChangePercent = 0;
  if (realtimePrice && signalPrice > 0) {
    priceChangePercent = ((realtimePrice - signalPrice) / signalPrice * 100);
  }

  return {
    signalId: signal.signal_id,
    tokenSymbol: signal.token_symbol,
    signalType: signal.signal_type,
    confidence: parseFloat(signal.confidence_score),
    riskLevel: signal.risk_level,
    currentPrice: currentPrice,                    // 实时价格
    signalPrice: signalPrice,                      // 信号生成时的价格
    priceChangePercent: parseFloat(priceChangePercent.toFixed(2)), // 价格变化%
    status: signal.status,
    createdAt: signal.created_at,
    expiresAt: signal.expires_at,
    // 预览信息（免费显示，帮助用户判断是否值得查看详情）
    entryMin: signal.entry_min ? parseFloat(signal.entry_min) : undefined,
    entryMax: signal.entry_max ? parseFloat(signal.entry_max) : undefined,
    stopLoss: signal.stop_loss ? parseFloat(signal.stop_loss) : undefined,
    takeProfit1: signal.take_profit_1 ? parseFloat(signal.take_profit_1) : undefined,
    // FLock enhancement fields (for hackathon demo)
    originalConfidence: signal.original_confidence ? parseFloat(signal.original_confidence) : undefined,
    confidenceAdjustment: signal.confidence_adjustment !== null && signal.confidence_adjustment !== undefined ? parseInt(signal.confidence_adjustment) : undefined,
    flockInsight: (signal.flock_source || signal.flock_similar_cases !== null || signal.flock_analysis) ? {
      source: signal.flock_source || 'Unknown',
      similarCasesCount: signal.flock_similar_cases !== null ? parseInt(signal.flock_similar_cases) : 0,
      analysis: signal.flock_analysis || 'No analysis available',
      adjustmentReason: signal.flock_adjustment_reason || 'UNKNOWN'
    } : null,
    // 不包含详细分析、reasoning 等信息
  };
}

/**
 * 格式化信号对象（完整版，用于付费查看）
 */
function formatSignal(signal) {
  return {
    signalId: signal.signal_id,
    tokenSymbol: signal.token_symbol,
    signalType: signal.signal_type,
    confidence: parseFloat(signal.confidence_score),
    riskLevel: signal.risk_level,

    currentPrice: parseFloat(signal.current_price),
    entryZone: {
      min: parseFloat(signal.entry_min),
      max: parseFloat(signal.entry_max)
    },
    stopLoss: parseFloat(signal.stop_loss),
    takeProfit1: parseFloat(signal.take_profit_1),
    takeProfit2: signal.take_profit_2 ? parseFloat(signal.take_profit_2) : null,
    takeProfit3: signal.take_profit_3 ? parseFloat(signal.take_profit_3) : null,

    analysis: {
      oiChange24h: parseFloat(signal.oi_change_24h || 0),
      fundingRate: parseFloat(signal.funding_rate || 0),
      trend: signal.trend_analysis,
      pattern: signal.pattern_detected,
      volume: signal.volume_analysis,
      // 新增字段
      supportLevel: signal.support_level ? parseFloat(signal.support_level) : null,
      resistanceLevel: signal.resistance_level ? parseFloat(signal.resistance_level) : null,
      oiValue: signal.oi_value ? parseFloat(signal.oi_value) : null,
      marketCap: signal.market_cap ? parseFloat(signal.market_cap) : null,
      oiMcRatio: signal.oi_mc_ratio ? parseFloat(signal.oi_mc_ratio) : null
    },

    reasoning: signal.reasoning,
    riskLevel: signal.risk_level,

    status: signal.status,
    createdAt: signal.created_at,
    expiresAt: signal.expires_at,

    // Phase 1+: 结果数据
    actualHighPrice: signal.actual_high_price ? parseFloat(signal.actual_high_price) : null,
    actualLowPrice: signal.actual_low_price ? parseFloat(signal.actual_low_price) : null,
    actualReturn: signal.actual_return_percent ? parseFloat(signal.actual_return_percent) : null,

    // 模型版本
    modelVersion: (() => {
      try {
        if (!signal.generation_params) return 'v1.0';
        const params = typeof signal.generation_params === 'string'
          ? JSON.parse(signal.generation_params)
          : signal.generation_params;
        return params.version || 'v1.0';
      } catch (e) {
        return 'v1.0';
      }
    })(),

    // FLock enhancement fields
    originalConfidence: signal.original_confidence ? parseFloat(signal.original_confidence) : undefined,
    confidenceAdjustment: signal.confidence_adjustment !== null && signal.confidence_adjustment !== undefined ? parseInt(signal.confidence_adjustment) : undefined,
    flockInsight: (signal.flock_source || signal.flock_similar_cases !== null || signal.flock_analysis) ? {
      source: signal.flock_source || 'Unknown',
      similarCasesCount: signal.flock_similar_cases !== null ? parseInt(signal.flock_similar_cases) : 0,
      analysis: signal.flock_analysis || 'No analysis available',
      adjustmentReason: signal.flock_adjustment_reason || 'UNKNOWN'
    } : null
  };
}

/**
 * POST /api/agents/alpha/test/trigger-signal
 * 测试接口：手动触发自动交易信号处理
 */
exports.triggerTestSignal = async (req, res) => {
  try {
    const { token_symbol, chain, signal_type, confidence_score, current_price, entry_min, entry_max, stop_loss, take_profit_1, contract_address } = req.body;

    if (!token_symbol || !chain || !signal_type) {
      return res.status(400).json({ error: 'token_symbol, chain, signal_type are required' });
    }

    console.log('🧪 [Test] Triggering auto-trade signal:', token_symbol);

    const AutoTradeService = require('../services/autoTrade/AutoTradeService');

    // 确保服务已初始化
    if (!AutoTradeService.initialized) {
      await AutoTradeService.initialize();
    }

    // 生成测试信号ID
    const signal_id = `TEST_${Date.now()}`;

    // 触发自动交易处理
    await AutoTradeService.handleNewSignal({
      signal_id,
      token_symbol,
      chain,
      signal_type,
      confidence_score: confidence_score || 85,
      current_price: current_price || 0,
      entry_min: entry_min || 0,
      entry_max: entry_max || 0,
      stop_loss: stop_loss || 0,
      take_profit_1: take_profit_1 || 0,
      contract_address: contract_address || null
    });

    res.json({
      success: true,
      message: 'Test signal triggered',
      signal_id
    });

  } catch (error) {
    console.error('❌ Error triggering test signal:', error);
    res.status(500).json({ error: 'Failed to trigger test signal', details: error.message });
  }
};

module.exports = exports;

/**
 * PredictionMarketService — 预测市场主服务
 *
 * 职责:
 *   1. 监听PT开仓 → 创建预测事件（延迟5分钟公开）
 *   2. 监听PT平仓 → 触发结算流程
 *   3. 管理事件生命周期 (OPEN → SETTLED / CANCELLED / NO_WINNER)
 *   4. 数据库读写 + 链上交互
 *
 * 集成点:
 *   - PaperTradeService: 通过 hook 回调接收开仓/平仓信号
 *   - SettlementEngine: 纯计算，传入 bets + actualPnl 返回结算结果
 *   - 智能合约: 通过 ethers.js 调用 createEvent / settle / cancelEvent
 *
 * 不修改 PaperTradeService 源码，通过外部注册 hook 的方式集成。
 */

const { v4: uuidv4 } = require('uuid');
const { ethers } = require('ethers');
const { settle: runSettlement, CONFIG } = require('./SettlementEngine');

const VISIBILITY_DELAY_MS = 5 * 60 * 1000; // 5分钟延迟

// Sibyl Memory 集成 (非阻塞，仅在 LEARNING_STORAGE=sibyl 时生效)
let _sibylStorage = null;
function _getSibylStorage(env) {
  if (_sibylStorage) return _sibylStorage;
  try {
    const { createStorage } = require('../autoTrade/storage/StorageFactory');
    const s = createStorage(env, 'stable');
    if (s && s.type === 'sibyl') _sibylStorage = s;
  } catch (e) { /* not configured */ }
  return _sibylStorage;
}

class PredictionMarketService {
  /**
   * @param {Object} deps
   * @param {Object} deps.db - MySQL pool (promise wrapper)
   * @param {Object} deps.paperTradeService - PT服务实例（用于注册hook）
   * @param {Object} deps.contractConfig - { rpcUrl, contractAddress, privateKey, usdcAddress }
   */
  constructor(deps) {
    this.db = deps.db;
    this.pts = deps.paperTradeService;
    this.contractConfig = deps.contractConfig;

    // 环境区分: testnet / mainnet
    this.env = process.env.PAPER_TRADE_ENV || 'mainnet';

    // 链上合约实例（延迟初始化）
    this.provider = null;
    this.wallet = null;
    this.contract = null;

    // Season 积分引擎
    this.pointsEngine = deps.pointsEngine || null;
    this.seasonService = deps.seasonService || null;

    // 推广佣金
    this.referralService = deps.referralService || null;

    // 积分余额
    this.pointsBalanceService = deps.pointsBalanceService || null;

    // 运行状态
    this.initialized = false;
  }

  // ============ 初始化 ============

  async initialize() {
    if (this.initialized) return;

    // 初始化链上连接
    if (this.contractConfig && this.contractConfig.rpcUrl) {
      try {
        this.provider = new ethers.JsonRpcProvider(this.contractConfig.rpcUrl);
        this.wallet = new ethers.Wallet(this.contractConfig.privateKey, this.provider);

        const artifact = require('../../contracts/PredictionMarket.json');
        const abi = Array.isArray(artifact) ? artifact : artifact.abi;
        this.contract = new ethers.Contract(
          this.contractConfig.contractAddress,
          abi,
          this.wallet
        );
        console.log('[PredictionMarket] Contract connected:', this.contractConfig.contractAddress);
      } catch (err) {
        console.error('[PredictionMarket] Contract init failed:', err.message);
        // 合约连接失败不阻止服务启动，降级为仅数据库模式
      }
    }

    // 注册PT回调
    this._registerPTHooks();

    // 启动兜底扫描：每5分钟检查OPEN事件对应的PT是否已平仓
    this._startStaleEventScanner();

    this.initialized = true;
    console.log('[PredictionMarket] Service initialized');
  }

  // ============ PT Hook 集成 ============

  /**
   * 注册到 PaperTradeService 的事件回调
   * 不修改 PTS 源码，通过其已有的 hook/event 机制接入
   */
  _registerPTHooks() {
    if (!this.pts) {
      console.warn('[PredictionMarket] No PaperTradeService provided, running standalone');
      return;
    }

    // TODO: 根据PTS实际的hook机制接入
    // 方案A: PTS有EventEmitter → this.pts.on('positionOpened', ...)
    // 方案B: PTS有hook注册 → this.pts.registerHook('onOpen', ...)
    // 方案C: 需要给PTS加hook → 届时先备份PTS再改
    //
    // 暂时提供手动调用接口:
    //   predictionMarketService.onPTOpen(position)
    //   predictionMarketService.onPTClose(trade)
    console.log('[PredictionMarket] PT hooks: manual mode (call onPTOpen/onPTClose)');
  }

  // ============ 兜底扫描：修复未结算的遗漏事件 ============

  _startStaleEventScanner() {
    const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 每5分钟
    const scan = async () => {
      try {
        // 查找所有OPEN状态、创建超过10分钟、且对应PT已平仓的事件
        const [staleEvents] = await this.db.execute(
          `SELECT e.event_id, e.pt_trade_id
           FROM prediction_events e
           WHERE e.status = 'OPEN'
             AND e.env = ?
             AND e.created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
             AND NOT EXISTS (
               SELECT 1 FROM paper_trade_positions p
               WHERE p.id = e.pt_trade_id
             )`,
          [this.env]
        );

        for (const event of staleEvents) {
          // 查历史平仓记录
          const [history] = await this.db.execute(
            'SELECT * FROM paper_trade_history WHERE id = ?',
            [event.pt_trade_id]
          );

          if (history.length > 0) {
            const trade = history[0];
            console.log(`[PredictionMarket] Stale scanner: recovering settlement for ${event.event_id} (PT=${event.pt_trade_id})`);
            await this.onPTClose(trade);
          } else {
            // PT记录彻底找不到，直接cancel
            console.log(`[PredictionMarket] Stale scanner: cancelling orphan event ${event.event_id}`);
            const [bets] = await this.db.execute(
              'SELECT * FROM prediction_bets WHERE event_id = ?',
              [event.event_id]
            );
            await this._cancelEvent({ event_id: event.event_id, contract_event_id: null }, bets);
          }
        }
      } catch (err) {
        console.error('[PredictionMarket] Stale scanner error:', err.message);
      }
    };

    // 启动时立即扫一次，然后每5分钟
    setTimeout(scan, 30_000); // 30秒后首次执行，等服务完全启动
    setInterval(scan, SCAN_INTERVAL_MS);
    console.log('[PredictionMarket] Stale event scanner started (interval=5min)');
  }

  // ============ 事件生命周期 ============

  /**
   * PT开仓回调 → 创建预测事件
   * @param {Object} position - PT持仓对象
   */
  async onPTOpen(position) {
    try {
      // 防重复：同一 pt_trade_id + env 只允许创建一个事件
      const [existing] = await this.db.execute(
        'SELECT event_id FROM prediction_events WHERE pt_trade_id = ? AND env = ? LIMIT 1',
        [position.id, this.env]
      );
      if (existing.length > 0) {
        console.log(`[PredictionMarket] Event already exists for pt_trade_id=${position.id}, skip`);
        return existing[0].event_id;
      }

      const eventId = uuidv4();
      const now = new Date();
      const visibleAt = new Date(now.getTime() + VISIBILITY_DELAY_MS);

      const isLoss = false; // 开仓时未知
      const gate = CONFIG.GATE_LONG; // 默认做多，结算时根据实际PnL调整

      // 获取当前 active season
      let seasonId = null;
      if (this.seasonService) {
        try {
          const activeSeason = await this.seasonService.getActiveSeason();
          if (activeSeason) seasonId = activeSeason.season_id;
        } catch (e) { /* ignore */ }
      }

      await this.db.execute(
        `INSERT INTO prediction_events
         (event_id, pt_trade_id, symbol, direction, entry_price, leverage,
          stop_loss_pct, status, pt_opened_at, visible_at, threshold_t,
          qualification_gate, max_winners, env, season_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          position.id,
          position.symbol,
          position.direction,
          position.entry_price || position.entryPrice,
          position.leverage || 1,
          position.stop_loss_pct || -20,
          now,
          visibleAt,
          CONFIG.THRESHOLD_LONG,
          gate,
          0, // max_winners 在结算时根据实际参与人数计算
          this.env,
          seasonId,
        ]
      );

      // 链上创建事件（如果合约已连接）
      if (this.contract) {
        try {
          const eventIdBytes = ethers.id(eventId);
          const tx = await this.contract.createEvent(eventIdBytes);
          await this.db.execute(
            'UPDATE prediction_events SET contract_event_id = ?, create_tx_hash = ? WHERE event_id = ?',
            [eventIdBytes, tx.hash, eventId]
          );
        } catch (err) {
          console.error('[PredictionMarket] On-chain createEvent failed:', err.message);
        }
      }

      console.log(`[PredictionMarket] Event created: ${eventId} for ${position.symbol} ${position.direction}`);
      return eventId;
    } catch (err) {
      console.error('[PredictionMarket] onPTOpen error:', err.message);
    }
  }

  /**
   * PT平仓回调 → 触发结算
   * @param {Object} trade - PT已平仓交易对象
   */
  async onPTClose(trade) {
    try {
      const ptTradeId = trade.id;
      const actualPnlPct = parseFloat(trade.total_pnl_pct || trade.totalPnlPct);

      // 查找对应的预测事件
      const [events] = await this.db.execute(
        'SELECT * FROM prediction_events WHERE pt_trade_id = ? AND status = ? AND env = ?',
        [ptTradeId, 'OPEN', this.env]
      );

      if (events.length === 0) {
        // 可能是5分钟内就平仓了，没创建事件
        return;
      }

      const event = events[0];

      // 立即标记 closed_at，阻止60s窗口期内的新下注
      await this.db.execute(
        'UPDATE prediction_events SET closed_at = NOW() WHERE event_id = ?',
        [event.event_id]
      );

      // 等待 60 秒：让正在进行中的 approve+placeBet tx 有时间落链
      // 新的 placeBet 调用会因 closed_at 非空而被拒绝
      console.log(`[PredictionMarket] PT closed, closed_at set. Waiting 60s before settling ${event.event_id}...`);
      await new Promise(resolve => setTimeout(resolve, 60_000));

      // ── 链上 bet 补录：防止用户 on-chain 成功但 API 未记录 ──────────────────
      // 读取合约中的实际下注，把 DB 里缺失的补进来
      if (this.contract && event.contract_event_id) {
        try {
          const betCount = Number(await this.contract.getBetCount(event.contract_event_id));
          console.log(`[PredictionMarket] On-chain bet count: ${betCount}`);

          const [dbBets] = await this.db.execute(
            'SELECT user_address FROM prediction_bets WHERE event_id = ?',
            [event.event_id]
          );
          const dbAddrs = new Set(dbBets.map(b => b.user_address.toLowerCase()));

          for (let i = 0; i < betCount; i++) {
            const [user, pnlBps, amount] = await this.contract.getBet(event.contract_event_id, i);
            if (!dbAddrs.has(user.toLowerCase())) {
              const predictedPnlPct = Number(pnlBps) / 100;
              const betAmount = Number(amount) / 1e6;
              await this.db.execute(
                `INSERT INTO prediction_bets
                 (event_id, user_address, predicted_pnl_pct, bet_amount, created_at)
                 VALUES (?, ?, ?, ?, NOW())`,
                [event.event_id, user, predictedPnlPct, betAmount]
              );
              await this.db.execute(
                `UPDATE prediction_events
                 SET participant_count = participant_count + 1, total_pool = total_pool + ?
                 WHERE event_id = ?`,
                [betAmount, event.event_id]
              );
              console.log(`[PredictionMarket] Recovered missing bet: ${user} predict=${predictedPnlPct}% amount=$${betAmount}`);
            }
          }
        } catch (err) {
          console.error('[PredictionMarket] On-chain bet sync failed:', err.message);
        }
      }

      // 查询所有下注（补录后的完整数据）
      const [allBets] = await this.db.execute(
        'SELECT * FROM prediction_bets WHERE event_id = ?',
        [event.event_id]
      );

      // 按 bet_type 分池
      const usdcBets = allBets.filter(b => b.bet_type === 'USDC');
      const pointsBets = allBets.filter(b => b.bet_type === 'POINTS');

      // ── USDC 池结算 ──
      if (usdcBets.length >= CONFIG.MIN_PARTICIPANTS) {
        const usdcPool = usdcBets.reduce((sum, b) => sum + parseFloat(b.bet_amount), 0);
        if (usdcPool >= CONFIG.MIN_POOL) {
          const betInputs = usdcBets.map(b => ({
            userAddress: b.user_address,
            predictedPnlPct: parseFloat(b.predicted_pnl_pct),
            betAmount: parseFloat(b.bet_amount),
          }));
          const result = runSettlement(betInputs, actualPnlPct);
          await this._persistSettlement(event, result, actualPnlPct);
          await this._settleOnChain(event, result);
          console.log(
            `[PredictionMarket] USDC settled ${event.event_id}: ` +
            `PnL=${actualPnlPct}%, winners=${result.counts.winners}/${result.counts.participants}, ` +
            `payout=$${result.pool.totalPayout}`
          );
          this._writePredictionToSibyl(event, result, actualPnlPct).catch(() => {});
        } else {
          await this._cancelBets(event, usdcBets, 'USDC');
        }
      } else if (usdcBets.length > 0) {
        await this._cancelBets(event, usdcBets, 'USDC');
      }

      // ── 积分池结算 ──
      if (pointsBets.length >= CONFIG.MIN_PARTICIPANTS) {
        const betInputs = pointsBets.map(b => ({
          userAddress: b.user_address,
          predictedPnlPct: parseFloat(b.predicted_pnl_pct),
          betAmount: parseFloat(b.bet_amount),
        }));
        const result = runSettlement(betInputs, actualPnlPct);
        await this._persistPointsSettlement(event, result, actualPnlPct);
        console.log(
          `[PredictionMarket] POINTS settled ${event.event_id}: ` +
          `PnL=${actualPnlPct}%, winners=${result.counts.winners}/${result.counts.participants}, ` +
          `payout=${result.pool.totalPayout} pts`
        );
        this._writePredictionToSibyl(event, result, actualPnlPct).catch(() => {});
      } else if (pointsBets.length > 0) {
        await this._cancelBets(event, pointsBets, 'POINTS');
      }

      // 如果两个池都没有足够参与者，取消整个事件
      if (usdcBets.length < CONFIG.MIN_PARTICIPANTS && pointsBets.length < CONFIG.MIN_PARTICIPANTS) {
        await this.db.execute(
          "UPDATE prediction_events SET status = 'CANCELLED', closed_at = COALESCE(closed_at, NOW()) WHERE event_id = ?",
          [event.event_id]
        );
      } else {
        // 至少有一个池结算了，标记事件为SETTLED
        await this.db.execute(
          "UPDATE prediction_events SET status = 'SETTLED', settled_at = NOW() WHERE event_id = ? AND status != 'SETTLED'",
          [event.event_id]
        );
      }
    } catch (err) {
      console.error('[PredictionMarket] onPTClose error:', err.message);
    }
  }

  // ============ Sibyl Memory 集成 ============

  /**
   * 结算完成后，把社区预测结果写入 Sibyl Memory
   * LearningEngine 下次遇到同一 token 时可通过 search() 召回
   * 完全非阻塞，不影响主流程
   */
  async _writePredictionToSibyl(event, result, actualPnlPct) {
    try {
      const storage = _getSibylStorage(this.env);
      if (!storage) return;
      const key = `${event.symbol}_${event.event_id.slice(0, 8)}`;
      const communityWinRate = result.counts.participants > 0
        ? result.counts.winners / result.counts.participants : 0;
      await storage.set('prediction_outcome', key, {
        symbol: event.symbol,
        direction: event.direction,
        actualPnlPct,
        communityWinRate,
        participants: result.counts.participants,
        winners: result.counts.winners,
        settledAt: Date.now(),
      });
      console.log(`[PredictionMarket] 🔮 Sibyl: ${event.symbol} outcome saved (community WR=${(communityWinRate * 100).toFixed(0)}%, ${result.counts.participants} participants, Base chain)`);
    } catch (e) { /* non-blocking */ }
  }

  // ============ 内部方法: 持久化 ============

  async _persistSettlement(event, result, actualPnlPct) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      // 更新事件
      await conn.execute(
        `UPDATE prediction_events SET
          status = ?, actual_pnl_pct = ?, is_loss = ?,
          threshold_t = ?, qualification_gate = ?,
          total_pool = ?, platform_fee = ?, available_pool = ?,
          total_payout = ?, reserve_amount = ?,
          participant_count = ?, qualified_count = ?,
          winner_count = ?, max_winners = ?,
          closed_at = NOW(), settled_at = NOW()
         WHERE event_id = ?`,
        [
          result.status,
          actualPnlPct,
          result.isLoss ? 1 : 0,
          result.threshold,
          result.gate,
          result.pool.totalPool,
          result.pool.platformFee,
          result.pool.availablePool,
          result.pool.totalPayout,
          result.pool.reserveAmount,
          result.counts.participants,
          result.counts.qualified,
          result.counts.winners,
          result.counts.maxWinners,
          event.event_id,
        ]
      );

      // 更新每个参与者的结算结果
      for (const p of result.participants) {
        await conn.execute(
          `UPDATE prediction_bets SET
            distance = ?, rate = ?, rank_position = ?,
            rank_weight = ?, effective_weight = ?,
            is_qualified = ?, is_winner = ?,
            payout = ?, net_pnl = ?
           WHERE event_id = ? AND user_address = ?`,
          [
            p.distance,
            p.rate || null,
            p.rankPosition,
            p.rankWeight || null,
            p.effectiveWeight || null,
            p.isQualified ? 1 : 0,
            p.isWinner ? 1 : 0,
            p.payout,
            p.netPnl,
            event.event_id,
            p.userAddress,
          ]
        );

        // 更新用户统计
        await this._updateUserStats(conn, p);
      }

      // Season 积分计算
      if (this.pointsEngine && this.seasonService) {
        try {
          const season = await this.seasonService.getActiveSeason();
          if (season) {
            const betsForPoints = result.participants.map(p => ({
              user_address: p.userAddress,
              bet_amount: p.betAmount,
              distance: p.distance,
              net_pnl: p.netPnl,
              is_qualified: p.isQualified,
            }));
            await this.pointsEngine.onSettlement(conn, season.season_id, event.event_id, betsForPoints);

            // 更新 event 和 bets 的 season_id
            await conn.execute(
              `UPDATE prediction_events SET season_id = ? WHERE event_id = ?`,
              [season.season_id, event.event_id]
            );
            await conn.execute(
              `UPDATE prediction_bets SET season_id = ? WHERE event_id = ?`,
              [season.season_id, event.event_id]
            );
          }
        } catch (pointsErr) {
          console.warn('[PredictionMarket] Points calculation failed (non-fatal):', pointsErr.message);
        }
      }

      // 储备池入账
      if (result.pool.reserveAmount > 0) {
        const [balRows] = await conn.execute(
          'SELECT COALESCE(SUM(CASE WHEN direction="IN" THEN amount ELSE -amount END), 0) AS balance FROM prediction_reserve_ledger'
        );
        const currentBalance = parseFloat(balRows[0].balance);
        const newBalance = currentBalance + result.pool.reserveAmount;

        await conn.execute(
          `INSERT INTO prediction_reserve_ledger
           (event_id, amount, direction, type, description, balance_after)
           VALUES (?, ?, 'IN', ?, ?, ?)`,
          [
            event.event_id,
            result.pool.reserveAmount,
            result.status === 'NO_WINNER' ? 'NO_WINNER' : 'SETTLEMENT_SURPLUS',
            `Event ${event.event_id} settlement`,
            newBalance,
          ]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async _updateUserStats(conn, participant) {
    const isWin = participant.isWinner ? 1 : 0;
    const rankBucket =
      participant.rankPosition === 1 ? 'win_as_1st' :
      participant.rankPosition === 2 ? 'win_as_2nd' :
      participant.rankPosition === 3 ? 'win_as_3rd' :
      participant.rankPosition ? 'win_as_other' : null;

    await conn.execute(
      `INSERT INTO prediction_user_stats
       (user_address, total_bets, total_wins, ${rankBucket ? rankBucket + ',' : ''}
        total_qualified, total_bet_amount, total_payout, net_pnl,
        best_distance, current_win_streak, best_win_streak)
       VALUES (?, 1, ?, ${rankBucket ? '?,' : ''} ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        total_bets = total_bets + 1,
        total_wins = total_wins + ?,
        ${rankBucket ? rankBucket + ' = ' + rankBucket + ' + ?,' : ''}
        total_qualified = total_qualified + ?,
        total_bet_amount = total_bet_amount + ?,
        total_payout = total_payout + ?,
        net_pnl = net_pnl + ?,
        best_distance = CASE WHEN ? < COALESCE(best_distance, 999) THEN ? ELSE best_distance END,
        current_win_streak = CASE WHEN ? = 1 THEN current_win_streak + 1 ELSE 0 END,
        best_win_streak = GREATEST(best_win_streak, CASE WHEN ? = 1 THEN current_win_streak + 1 ELSE 0 END)`,
      [
        // INSERT values
        participant.userAddress,
        isWin,
        ...(rankBucket ? [isWin] : []),
        participant.isQualified ? 1 : 0,
        participant.betAmount,
        participant.payout,
        participant.netPnl,
        participant.isQualified ? participant.distance : null,
        isWin,
        isWin,
        // ON DUPLICATE UPDATE values
        isWin,
        ...(rankBucket ? [isWin] : []),
        participant.isQualified ? 1 : 0,
        participant.betAmount,
        participant.payout,
        participant.netPnl,
        participant.isQualified ? participant.distance : 999,
        participant.isQualified ? participant.distance : 999,
        isWin,
        isWin,
      ]
    );
  }

  async _cancelEvent(event, bets) {
    await this.db.execute(
      "UPDATE prediction_events SET status = 'CANCELLED', closed_at = NOW() WHERE event_id = ?",
      [event.event_id]
    );

    // 链上退款
    if (this.contract && event.contract_event_id) {
      try {
        const tx = await this.contract.cancelEvent(event.contract_event_id);
        await tx.wait();
      } catch (err) {
        console.error('[PredictionMarket] On-chain cancel failed:', err.message);
      }
    }

    console.log(`[PredictionMarket] Event cancelled: ${event.event_id} (${bets.length} participants refunded)`);
  }

  /**
   * 取消某个池的下注（退款，不影响另一个池）
   */
  async _cancelBets(event, bets, betType) {
    if (betType === 'POINTS' && this.pointsBalanceService) {
      await this.pointsBalanceService.refundBets(bets, event.event_id);
    }
    // USDC退款走链上cancelEvent（在_cancelEvent里已处理）
    console.log(`[PredictionMarket] ${betType} pool cancelled for ${event.event_id} (${bets.length} bets refunded)`);
  }

  /**
   * 积分池结算（纯数据库，不上链）
   */
  async _persistPointsSettlement(event, result, actualPnlPct) {
    // 更新每个积分参与者的结算结果
    for (const p of result.participants) {
      await this.db.execute(
        `UPDATE prediction_bets SET
          distance = ?, rate = ?, rank_position = ?,
          is_qualified = ?, is_winner = ?,
          payout = ?, net_pnl = ?
         WHERE event_id = ? AND user_address = ? AND bet_type = 'POINTS'`,
        [
          p.distance, p.rate, p.rankPosition,
          p.isQualified ? 1 : 0, p.isWinner ? 1 : 0,
          Math.round(p.payout), Math.round(p.netPnl),
          event.event_id, p.userAddress,
        ]
      );
    }

    // 发放积分给赢家
    if (this.pointsBalanceService) {
      await this.pointsBalanceService.settlePoints(result.participants.filter(p => p.payout > 0), event.event_id);
    }

    // 更新事件积分池统计
    await this.db.execute(
      `UPDATE prediction_events SET
        points_total_payout = ?,
        points_winner_count = ?,
        actual_pnl_pct = COALESCE(actual_pnl_pct, ?)
       WHERE event_id = ?`,
      [
        Math.round(result.pool.totalPayout),
        result.counts.winners,
        actualPnlPct,
        event.event_id,
      ]
    );

    // Season 积分计算（积分下注也计入Season排行榜）
    if (this.pointsEngine && this.seasonService) {
      try {
        const season = await this.seasonService.getActiveSeason();
        if (season) {
          const betsForPoints = result.participants.map(p => ({
            user_address: p.userAddress,
            bet_amount: p.betAmount,
            distance: p.distance,
            net_pnl: p.netPnl,
            is_qualified: p.isQualified,
          }));
          await this.pointsEngine.onSettlement(this.db, season.season_id, event.event_id, betsForPoints);
        }
      } catch (pointsErr) {
        console.warn('[PredictionMarket] Points pool season calculation failed (non-fatal):', pointsErr.message);
      }
    }
  }

  // ============ 内部方法: 链上结算 ============

  async _settleOnChain(event, result) {
    if (!this.contract || !event.contract_event_id) return;

    try {
      const actualPnlBps = Math.round(result.actualPnlPct * 100); // % → bps

      if (result.status === 'NO_WINNER' || result.winners.length === 0) {
        // 无赢家 — 合约验证确实全员超资格线
        const tx = await this.contract.settleNoWinner(
          event.contract_event_id,
          actualPnlBps
        );
        await this.db.execute(
          'UPDATE prediction_events SET settle_tx_hash = ? WHERE event_id = ?',
          [tx.hash, event.event_id]
        );
        await tx.wait();
      } else {
        // 有赢家 — 从链上读真实 index，避免 DB 顺序与链上不一致
        const betCount = Number(await this.contract.getBetCount(event.contract_event_id));
        const onChainIndexMap = {};
        for (let i = 0; i < betCount; i++) {
          const [user] = await this.contract.getBet(event.contract_event_id, i);
          onChainIndexMap[user.toLowerCase()] = i;
        }

        const winnerIndices = result.winners.map(w => {
          const idx = onChainIndexMap[w.userAddress.toLowerCase()];
          if (idx === undefined) throw new Error(`Winner ${w.userAddress} not found on-chain`);
          return idx;
        });

        const payouts = result.winners.map(w =>
          ethers.parseUnits(w.payout.toFixed(6), 6)
        );

        const tx = await this.contract.settle(
          event.contract_event_id,
          actualPnlBps,
          winnerIndices,
          payouts
        );

        await this.db.execute(
          'UPDATE prediction_events SET settle_tx_hash = ? WHERE event_id = ?',
          [tx.hash, event.event_id]
        );
        await tx.wait();
      }
    } catch (err) {
      console.error('[PredictionMarket] On-chain settle failed:', err.message);
    }
  }

  // ============ 查询接口（供 Routes 调用）============

  /**
   * 获取当前可见的 OPEN 事件列表
   */
  async getOpenEvents() {
    const [rows] = await this.db.execute(
      `SELECT e.*,
        (SELECT COUNT(*) FROM prediction_bets WHERE event_id = e.event_id) AS bet_count,
        p.mark_price AS current_price,
        p.health AS position_health,
        CASE
          WHEN e.direction = 'LONG' THEN ROUND((p.mark_price - e.entry_price) / e.entry_price * e.leverage * 100, 2)
          WHEN e.direction = 'SHORT' THEN ROUND((e.entry_price - p.mark_price) / e.entry_price * e.leverage * 100, 2)
          ELSE NULL
        END AS current_pnl_pct
       FROM prediction_events e
       LEFT JOIN paper_trade_positions p ON p.id = e.pt_trade_id
       WHERE e.status = 'OPEN' AND e.visible_at <= NOW() AND e.env = ?
       ORDER BY e.visible_at DESC`,
      [this.env]
    );
    return rows;
  }

  /**
   * 获取事件详情（含参与人数和总池，不暴露其他人的预测值）
   */
  async getEventDetail(eventId) {
    const [events] = await this.db.execute(
      'SELECT * FROM prediction_events WHERE event_id = ? AND env = ?',
      [eventId, this.env]
    );
    if (events.length === 0) return null;
    return events[0];
  }

  /**
   * 获取事件的结算结果（仅已结算事件）
   */
  async getEventSettlement(eventId) {
    const [events] = await this.db.execute(
      'SELECT * FROM prediction_events WHERE event_id = ? AND status IN ("SETTLED", "NO_WINNER") AND env = ?',
      [eventId, this.env]
    );
    if (events.length === 0) return null;

    const [bets] = await this.db.execute(
      `SELECT user_address, predicted_pnl_pct, bet_amount, bet_type, distance, rate,
              rank_position, is_qualified, is_winner, payout, net_pnl
       FROM prediction_bets WHERE event_id = ?
       ORDER BY COALESCE(rank_position, 9999), distance`,
      [eventId]
    );

    return { event: events[0], bets };
  }

  /**
   * 用户下注
   * @param {string} betType - 'USDC' | 'POINTS'
   */
  async placeBet(eventId, userAddress, predictedPnlPct, betAmount, txHash = null, betType = 'USDC') {
    // 校验事件状态
    const [events] = await this.db.execute(
      "SELECT * FROM prediction_events WHERE event_id = ? AND status = 'OPEN' AND visible_at <= NOW() AND env = ?",
      [eventId, this.env]
    );
    if (events.length === 0) {
      throw new Error('EVENT_NOT_AVAILABLE');
    }

    const event = events[0];

    // 校验仓位是否已平仓（60s结算窗口期内拒绝新下注）
    if (event.closed_at) {
      throw new Error('POSITION_CLOSED');
    }

    const isPoints = betType === 'POINTS';

    // 验证链上交易（仅USDC需要）
    if (!isPoints && txHash && this.contract) {
      try {
        const provider = this.contract.runner.provider;
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
          throw new Error('TX_FAILED');
        }
      } catch (err) {
        if (err.message === 'TX_FAILED') throw err;
        console.warn('[PredictionMarket] txHash verification skipped:', err.message);
      }
    }

    // 校验参数
    if (isPoints) {
      // 积分下注: 最少100积分，最多50000积分
      if (betAmount < 100 || betAmount > 50000) {
        throw new Error('INVALID_BET_AMOUNT');
      }
      betAmount = Math.round(betAmount); // 积分必须整数
    } else {
      if (betAmount < CONFIG.MIN_BET || betAmount > CONFIG.MAX_BET) {
        throw new Error('INVALID_BET_AMOUNT');
      }
    }
    if (predictedPnlPct < CONFIG.PREDICT_MIN || predictedPnlPct > CONFIG.PREDICT_MAX) {
      throw new Error('INVALID_PREDICTION');
    }

    // 校验重复（同一事件同一用户同一bet_type只能下注一次）
    const [existing] = await this.db.execute(
      'SELECT id FROM prediction_bets WHERE event_id = ? AND user_address = ? AND bet_type = ?',
      [eventId, userAddress, betType]
    );
    if (existing.length > 0) {
      throw new Error('ALREADY_BET');
    }

    // 积分模式：扣减积分
    if (isPoints) {
      await this.pointsBalanceService.deduct(userAddress, betAmount, eventId);
    }

    // 插入下注记录
    await this.db.execute(
      `INSERT INTO prediction_bets (event_id, user_address, predicted_pnl_pct, bet_amount, bet_type, bet_tx_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventId, userAddress, predictedPnlPct, betAmount, betType, isPoints ? null : txHash]
    );

    // 更新事件池子
    if (isPoints) {
      await this.db.execute(
        `UPDATE prediction_events
         SET points_pool = points_pool + ?, points_participant_count = points_participant_count + 1
         WHERE event_id = ?`,
        [betAmount, eventId]
      );
    } else {
      await this.db.execute(
        `UPDATE prediction_events
         SET total_pool = total_pool + ?, participant_count = participant_count + 1
         WHERE event_id = ?`,
        [betAmount, eventId]
      );
    }

    // 记录推广佣金（仅USDC）
    if (!isPoints && this.referralService) {
      try {
        await this.referralService.recordCommission(userAddress, eventId, betAmount);
      } catch (err) {
        console.warn('[Referral] Commission record failed (non-fatal):', err.message);
      }
    }

    return { success: true, betType };
  }

  /**
   * 查看用户自己的下注（不暴露别人的预测值）
   */
  async getUserBet(eventId, userAddress) {
    const [rows] = await this.db.execute(
      'SELECT * FROM prediction_bets WHERE event_id = ? AND user_address = ?',
      [eventId, userAddress]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * 用户历史记录
   */
  async getUserHistory(userAddress, limit = 50, offset = 0) {
    const safeLimit = parseInt(limit) || 50;
    const safeOffset = parseInt(offset) || 0;
    const [rows] = await this.db.execute(
      `SELECT b.*, e.symbol, e.direction, e.actual_pnl_pct, e.status AS event_status,
              e.settled_at, e.participant_count, e.winner_count
       FROM prediction_bets b
       JOIN prediction_events e ON b.event_id = e.event_id
       WHERE b.user_address = ? AND e.env = ?
       ORDER BY b.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [userAddress, this.env]
    );
    return rows;
  }

  /**
   * 用户统计
   */
  async getUserStats(userAddress) {
    const [rows] = await this.db.execute(
      `SELECT
        ? AS user_address,
        COUNT(*) AS total_bets,
        SUM(CASE WHEN b.is_winner = 1 THEN 1 ELSE 0 END) AS total_wins,
        SUM(CASE WHEN b.bet_type='USDC' THEN b.bet_amount ELSE 0 END) AS usdc_staked,
        SUM(CASE WHEN b.bet_type='POINTS' THEN b.bet_amount ELSE 0 END) AS pts_staked,
        SUM(CASE WHEN b.bet_type='USDC' THEN b.payout ELSE 0 END) AS usdc_payout,
        SUM(CASE WHEN b.bet_type='POINTS' THEN b.payout ELSE 0 END) AS pts_payout,
        SUM(CASE WHEN b.bet_type='USDC' THEN b.net_pnl ELSE 0 END) AS usdc_net_pnl,
        SUM(CASE WHEN b.bet_type='POINTS' THEN b.net_pnl ELSE 0 END) AS pts_net_pnl,
        SUM(b.bet_amount) AS total_bet_amount,
        SUM(b.payout) AS total_payout,
        SUM(b.net_pnl) AS net_pnl,
        ROUND(SUM(CASE WHEN b.is_winner = 1 THEN 1 ELSE 0 END) / GREATEST(COUNT(*), 1) * 100, 1) AS win_rate,
        MIN(CASE WHEN b.is_qualified = 1 THEN b.distance ELSE NULL END) AS best_distance,
        MAX(CASE WHEN b.is_winner = 1 THEN b.rank_position ELSE NULL END) AS best_rank
       FROM prediction_bets b
       JOIN prediction_events e ON b.event_id = e.event_id
       WHERE b.user_address = ? AND e.env = ?`,
      [userAddress, userAddress, this.env]
    );
    return (rows.length > 0 && rows[0].total_bets > 0) ? rows[0] : null;
  }

  /**
   * 排行榜
   */
  async getLeaderboard(limit = 20, betType = 'USDC') {
    const safeLimit = parseInt(limit) || 20;
    const type = betType === 'POINTS' ? 'POINTS' : 'USDC';
    const [rows] = await this.db.execute(
      `SELECT b.user_address,
              COUNT(*) AS total_bets,
              SUM(CASE WHEN b.is_winner = 1 THEN 1 ELSE 0 END) AS total_wins,
              SUM(b.bet_amount) AS total_bet_amount,
              SUM(b.payout) AS total_payout,
              SUM(b.net_pnl) AS net_pnl,
              ROUND(SUM(CASE WHEN b.is_winner = 1 THEN 1 ELSE 0 END) / GREATEST(COUNT(*), 1) * 100, 1) AS win_rate
       FROM prediction_bets b
       JOIN prediction_events e ON b.event_id = e.event_id
       WHERE e.env = ? AND e.status IN ('SETTLED', 'NO_WINNER') AND b.bet_type = ?
       GROUP BY b.user_address
       HAVING total_bets >= 1
       ORDER BY net_pnl DESC
       LIMIT ${safeLimit}`,
      [this.env, type]
    );
    return rows;
  }

  /**
   * 最近已结算事件
   */
  async getRecentSettled(limit = 20) {
    const safeLimit = parseInt(limit) || 20;
    const [rows] = await this.db.execute(
      `SELECT event_id, symbol, direction, actual_pnl_pct,
              participant_count, qualified_count, winner_count,
              total_pool, total_payout, reserve_amount, settled_at,
              points_participant_count, points_winner_count, points_pool
       FROM prediction_events
       WHERE status IN ('SETTLED', 'NO_WINNER') AND env = ?
       ORDER BY settled_at DESC
       LIMIT ${safeLimit}`,
      [this.env]
    );
    return rows;
  }

  /**
   * 平台统计（总数据）
   * total_volume = 所有事件的 total_pool 之和（即实际下注总额）
   */
  async getPlatformStats() {
    const [rows] = await this.db.execute(
      `SELECT
        COALESCE(SUM(total_pool), 0) AS total_volume,
        COUNT(*) AS total_events,
        COALESCE(SUM(participant_count), 0) AS total_bets
       FROM prediction_events WHERE env = ?`,
      [this.env]
    );
    const [userRows] = await this.db.execute(
      `SELECT COUNT(DISTINCT b.user_address) AS total_users
       FROM prediction_bets b
       JOIN prediction_events e ON b.event_id = e.event_id
       WHERE e.env = ?`,
      [this.env]
    );
    return {
      total_volume: parseFloat(rows[0].total_volume) || 0,
      total_events: rows[0].total_events || 0,
      total_bets: rows[0].total_bets || 0,
      total_users: userRows[0].total_users || 0,
    };
  }

  /**
   * 储备池余额
   */
  async getReserveBalance() {
    const [rows] = await this.db.execute(
      `SELECT
        COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END), 0) AS balance,
        COUNT(CASE WHEN direction='IN' THEN 1 END) AS total_in_count,
        COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE 0 END), 0) AS total_in,
        COUNT(CASE WHEN direction='OUT' THEN 1 END) AS total_out_count,
        COALESCE(SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END), 0) AS total_out
       FROM prediction_reserve_ledger`
    );
    return rows[0];
  }
  /**
   * 获取事件预测分布（按区间分组）
   * 返回每个区间的参与人数和占比
   */
  async getEventDistribution(eventId) {
    const [rows] = await this.db.execute(
      'SELECT predicted_pnl_pct FROM prediction_bets WHERE event_id = ?',
      [eventId]
    );

    const buckets = [
      { label: '< 0%',    min: -Infinity, max: 0  },
      { label: '0–5%',    min: 0,         max: 5  },
      { label: '5–10%',   min: 5,         max: 10 },
      { label: '10–20%',  min: 10,        max: 20 },
      { label: '20–35%',  min: 20,        max: 35 },
      { label: '> 35%',   min: 35,        max: Infinity },
    ].map(b => ({ ...b, count: 0 }));

    for (const row of rows) {
      const v = parseFloat(row.predicted_pnl_pct);
      for (const b of buckets) {
        if (v >= b.min && v < b.max) { b.count++; break; }
      }
    }

    const total = rows.length;
    return buckets.map(({ label, count }) => ({
      label,
      count,
      pct: total > 0 ? Math.round(count / total * 100) : 0,
    }));
  }
}

module.exports = PredictionMarketService;

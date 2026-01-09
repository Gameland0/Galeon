/**
 * KOL 绩效管理服务
 * 功能:
 * 1. 计算 KOL 历史胜率 (30天)
 * 2. 动态调整 KOL 权重
 * 3. 定时任务: 每日自动调整权重
 * 4. KOL 绩效排名
 */

const DatabaseService = require('../databaseService');

class KOLPerformanceService {
  constructor() {
    this.adjustmentRules = {
      minTrades: 10,              // 最少交易次数 (才进行调整)
      highWinRateThreshold: 70,   // 高胜率阈值 (%)
      lowWinRateThreshold: 50,    // 低胜率阈值 (%)
      weightIncrement: 10,        // 权重增量
      weightDecrement: 20,        // 权重减量
      maxWeight: 100,             // 最大权重
      minWeight: 40,              // 最小权重
    };

    console.log('✅ KOLPerformanceService initialized');
  }

  /**
   * 计算 KOL 在指定策略下的 30 天胜率
   * @param {number} strategyId - 策略ID
   * @param {string} kolHandle - KOL 用户名
   * @returns {Promise<Object>} - { winRate, totalTrades, wins, losses }
   */
  async calculateWinRate(strategyId, kolHandle) {
    try {
      const stats = await DatabaseService.query(`
        SELECT
          COUNT(*) as total_trades,
          SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
          COALESCE(SUM(profit_loss_usdt), 0) as total_profit,
          COALESCE(AVG(profit_loss_percent), 0) as avg_profit_percent
        FROM twitter_signal_history
        WHERE strategy_id = ? AND kol_handle = ?
          AND executed = TRUE
          AND result IN ('WIN', 'LOSS')
          AND detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `, [strategyId, kolHandle]);

      const { total_trades, wins, losses, total_profit, avg_profit_percent } = stats[0];

      const winRate = total_trades > 0 ? (wins / total_trades) * 100 : 0;

      return {
        winRate: parseFloat(winRate.toFixed(2)),
        totalTrades: total_trades,
        wins: wins,
        losses: losses,
        totalProfit: parseFloat(total_profit),
        avgProfitPercent: parseFloat(avg_profit_percent)
      };

    } catch (error) {
      console.error(`   ❌ 计算胜率失败: ${error.message}`);
      return {
        winRate: 0,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalProfit: 0,
        avgProfitPercent: 0
      };
    }
  }

  /**
   * 动态调整 KOL 权重
   * @param {number} strategyId - 策略ID
   * @param {string} kolHandle - KOL 用户名
   * @param {number} currentWeight - 当前权重
   * @returns {Promise<Object>} - { newWeight, reason, winRate, totalTrades }
   */
  async adjustKOLWeight(strategyId, kolHandle, currentWeight) {
    console.log(`\n📊 调整 KOL 权重: ${kolHandle} (当前权重: ${currentWeight})`);

    try {
      // 1. 计算 30 天胜率
      const stats = await this.calculateWinRate(strategyId, kolHandle);

      console.log(`   📈 30天统计: 胜率=${stats.winRate}%, 交易数=${stats.totalTrades}, 盈亏=$${stats.totalProfit.toFixed(2)}`);

      // 2. 数据不足,不调整
      if (stats.totalTrades < this.adjustmentRules.minTrades) {
        console.log(`   ℹ️ 交易数不足 ${this.adjustmentRules.minTrades} 笔,暂不调整`);
        return {
          newWeight: currentWeight,
          reason: `INSUFFICIENT_DATA (${stats.totalTrades}/${this.adjustmentRules.minTrades})`,
          winRate: stats.winRate,
          totalTrades: stats.totalTrades,
          adjusted: false
        };
      }

      let newWeight = currentWeight;
      let reason = '';

      // 3. 高胜率 → 增加权重
      if (stats.winRate >= this.adjustmentRules.highWinRateThreshold) {
        newWeight = Math.min(
          currentWeight + this.adjustmentRules.weightIncrement,
          this.adjustmentRules.maxWeight
        );
        reason = `HIGH_WIN_RATE (${stats.winRate}% >= ${this.adjustmentRules.highWinRateThreshold}%)`;
        console.log(`   ✅ 胜率优秀,权重 ${currentWeight} → ${newWeight}`);
      }
      // 4. 低胜率 → 降低权重
      else if (stats.winRate < this.adjustmentRules.lowWinRateThreshold) {
        newWeight = Math.max(
          currentWeight - this.adjustmentRules.weightDecrement,
          this.adjustmentRules.minWeight
        );
        reason = `LOW_WIN_RATE (${stats.winRate}% < ${this.adjustmentRules.lowWinRateThreshold}%)`;
        console.log(`   ⚠️ 胜率较低,权重 ${currentWeight} → ${newWeight}`);
      }
      // 5. 中等胜率 → 保持权重
      else {
        reason = `KEEP_WEIGHT (${stats.winRate}% in normal range)`;
        console.log(`   ✅ 胜率正常,保持权重 ${currentWeight}`);
      }

      // 6. 更新数据库
      if (newWeight !== currentWeight) {
        await DatabaseService.query(`
          UPDATE twitter_kol_config
          SET kol_weight = ?,
              win_rate_30d = ?,
              last_weight_adjustment = NOW(),
              updated_at = NOW()
          WHERE strategy_id = ? AND kol_handle = ?
        `, [newWeight, stats.winRate, strategyId, kolHandle]);

        console.log(`   ✅ 数据库已更新`);
      } else {
        // 即使不调整权重,也更新胜率统计
        await DatabaseService.query(`
          UPDATE twitter_kol_config
          SET win_rate_30d = ?,
              updated_at = NOW()
          WHERE strategy_id = ? AND kol_handle = ?
        `, [stats.winRate, strategyId, kolHandle]);
      }

      return {
        newWeight: newWeight,
        oldWeight: currentWeight,
        reason: reason,
        winRate: stats.winRate,
        totalTrades: stats.totalTrades,
        totalProfit: stats.totalProfit,
        adjusted: newWeight !== currentWeight
      };

    } catch (error) {
      console.error(`   ❌ 调整权重失败: ${error.message}`);
      return {
        newWeight: currentWeight,
        reason: `ERROR: ${error.message}`,
        winRate: 0,
        totalTrades: 0,
        adjusted: false
      };
    }
  }

  /**
   * 批量调整所有 KOL 的权重 (定时任务)
   */
  async runDailyAdjustment() {
    console.log(`\n🔧 开始每日 KOL 权重调整任务...`);

    try {
      // 查询所有启用的 KOL
      const kols = await DatabaseService.query(`
        SELECT
          id,
          strategy_id,
          kol_handle,
          kol_weight,
          original_weight,
          last_weight_adjustment
        FROM twitter_kol_config
        WHERE enabled = TRUE
      `);

      console.log(`   找到 ${kols.length} 个启用的 KOL`);

      const results = [];

      for (const kol of kols) {
        try {
          const result = await this.adjustKOLWeight(
            kol.strategy_id,
            kol.kol_handle,
            kol.kol_weight
          );

          results.push({
            kolHandle: kol.kol_handle,
            ...result
          });

        } catch (error) {
          console.error(`   ❌ 调整 ${kol.kol_handle} 失败: ${error.message}`);
        }
      }

      // 统计调整结果
      const adjusted = results.filter(r => r.adjusted);
      const increased = adjusted.filter(r => r.newWeight > r.oldWeight);
      const decreased = adjusted.filter(r => r.newWeight < r.oldWeight);

      console.log(`\n   ✅ 调整完成:`);
      console.log(`      总数: ${results.length}`);
      console.log(`      已调整: ${adjusted.length} (上调: ${increased.length}, 下调: ${decreased.length})`);
      console.log(`      未调整: ${results.length - adjusted.length}`);

      return {
        total: results.length,
        adjusted: adjusted.length,
        increased: increased.length,
        decreased: decreased.length,
        details: results
      };

    } catch (error) {
      console.error(`   ❌ 每日调整任务失败: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * 获取 KOL 绩效排名 (某个策略或全局)
   * @param {number} strategyId - 策略ID (可选,null=全局排名)
   * @param {number} limit - 返回数量
   * @returns {Promise<Array>} - KOL 排名数组
   */
  async getKOLRanking(strategyId = null, limit = 10) {
    try {
      let query = `
        SELECT
          k.kol_handle,
          k.kol_weight,
          k.win_rate_30d,
          COUNT(s.id) as total_signals,
          SUM(CASE WHEN s.executed = TRUE THEN 1 ELSE 0 END) as executed_count,
          SUM(CASE WHEN s.result = 'WIN' THEN 1 ELSE 0 END) as win_count,
          SUM(CASE WHEN s.result = 'LOSS' THEN 1 ELSE 0 END) as loss_count,
          COALESCE(SUM(s.profit_loss_usdt), 0) as total_profit,
          COALESCE(AVG(s.profit_loss_percent), 0) as avg_profit_percent
        FROM twitter_kol_config k
        LEFT JOIN twitter_signal_history s
          ON k.strategy_id = s.strategy_id AND k.kol_handle = s.kol_handle
          AND s.detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        WHERE k.enabled = TRUE
      `;

      const params = [];

      if (strategyId) {
        query += ` AND k.strategy_id = ?`;
        params.push(strategyId);
      }

      query += `
        GROUP BY k.id, k.kol_handle, k.kol_weight, k.win_rate_30d
        ORDER BY total_profit DESC, k.win_rate_30d DESC
        LIMIT ?
      `;

      params.push(limit);

      const ranking = await DatabaseService.query(query, params);

      return ranking.map((kol, index) => ({
        rank: index + 1,
        kolHandle: kol.kol_handle,
        weight: kol.kol_weight,
        winRate30d: parseFloat(kol.win_rate_30d || 0),
        totalSignals: kol.total_signals,
        executedCount: kol.executed_count,
        winCount: kol.win_count,
        lossCount: kol.loss_count,
        totalProfit: parseFloat(kol.total_profit),
        avgProfitPercent: parseFloat(kol.avg_profit_percent)
      }));

    } catch (error) {
      console.error(`   ❌ 获取排名失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取 KOL 详细绩效统计
   * @param {number} strategyId - 策略ID
   * @param {string} kolHandle - KOL 用户名
   * @returns {Promise<Object>} - 详细统计对象
   */
  async getKOLDetailedStats(strategyId, kolHandle) {
    try {
      // 1. 基础统计
      const basicStats = await this.calculateWinRate(strategyId, kolHandle);

      // 2. 最近 10 次交易
      const recentTrades = await DatabaseService.query(`
        SELECT
          token_symbol,
          signal_type,
          detected_at,
          executed,
          result,
          profit_loss_usdt,
          profit_loss_percent
        FROM twitter_signal_history
        WHERE strategy_id = ? AND kol_handle = ?
        ORDER BY detected_at DESC
        LIMIT 10
      `, [strategyId, kolHandle]);

      // 3. 代币分布统计
      const tokenDistribution = await DatabaseService.query(`
        SELECT
          token_symbol,
          COUNT(*) as signal_count,
          SUM(CASE WHEN executed = TRUE THEN 1 ELSE 0 END) as executed_count,
          SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as win_count,
          COALESCE(SUM(profit_loss_usdt), 0) as total_profit
        FROM twitter_signal_history
        WHERE strategy_id = ? AND kol_handle = ?
          AND detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY token_symbol
        ORDER BY signal_count DESC
        LIMIT 5
      `, [strategyId, kolHandle]);

      // 4. 权重调整历史 (模拟,后续可以新增专门的历史表)
      const config = await DatabaseService.query(`
        SELECT
          kol_weight,
          original_weight,
          last_weight_adjustment
        FROM twitter_kol_config
        WHERE strategy_id = ? AND kol_handle = ?
      `, [strategyId, kolHandle]);

      return {
        basicStats: basicStats,
        recentTrades: recentTrades,
        tokenDistribution: tokenDistribution,
        weightInfo: config.length > 0 ? {
          currentWeight: config[0].kol_weight,
          originalWeight: config[0].original_weight,
          lastAdjustment: config[0].last_weight_adjustment
        } : null
      };

    } catch (error) {
      console.error(`   ❌ 获取详细统计失败: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * 启动定时任务 (每日凌晨 2 点执行)
   */
  startScheduledAdjustment() {
    console.log('⏰ 启动 KOL 权重调整定时任务 (每日 02:00)');

    // 计算距离下一次凌晨 2 点的时间
    const now = new Date();
    const next2AM = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + (now.getHours() >= 2 ? 1 : 0),
      2, 0, 0, 0
    );

    const msUntilNext2AM = next2AM.getTime() - now.getTime();

    console.log(`   下次执行时间: ${next2AM.toLocaleString()}`);

    // 首次执行
    setTimeout(() => {
      this.runDailyAdjustment();

      // 后续每 24 小时执行一次
      setInterval(() => {
        this.runDailyAdjustment();
      }, 24 * 60 * 60 * 1000);

    }, msUntilNext2AM);
  }
}

module.exports = new KOLPerformanceService();

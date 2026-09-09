/**
 * MySQLStorageAdapter — LearningEngine 的 MySQL 存储实现
 *
 * 把原来散落在 LearningEngine 里的所有 db.query 调用集中到这里。
 * 实现与 SibylStorageAdapter 相同的接口，通过 LEARNING_STORAGE 配置切换。
 */

const DatabaseService = require('../../databaseService');

class MySQLStorageAdapter {
  constructor(env, strategy) {
    this.env = env;
    this.strategy = strategy;
    this.type = 'mysql';
  }

  // ─── 通用 learning 数据读写 ─────────────────────────────────────────

  async get(category, key) {
    try {
      const rows = await DatabaseService.query(
        `SELECT data FROM paper_trade_learning WHERE env = ? AND strategy = ? AND category = ? AND key_name = ?`,
        [this.env, this.strategy, category, key]
      );
      if (!rows || rows.length === 0) return null;
      const raw = rows[0].data;
      if (!raw) return null;
      if (typeof raw === 'object') return raw;
      try { return JSON.parse(raw); } catch { return null; }
    } catch (e) {
      console.error(`[MySQLAdapter] get(${category}, ${key}) error:`, e.message);
      return null;
    }
  }

  async set(category, key, data) {
    try {
      await DatabaseService.query(
        `INSERT INTO paper_trade_learning (env, strategy, category, key_name, data)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
        [this.env, this.strategy, category, key, JSON.stringify(data)]
      );
    } catch (e) {
      console.error(`[MySQLAdapter] set(${category}, ${key}) error:`, e.message);
    }
  }

  async list(category, { limit = 100 } = {}) {
    try {
      const rows = await DatabaseService.query(
        `SELECT key_name, data FROM paper_trade_learning
         WHERE env = ? AND strategy = ? AND category = ?
         ORDER BY updated_at DESC LIMIT ?`,
        [this.env, this.strategy, category, limit]
      );
      return (rows || []).map(r => ({
        key: r.key_name,
        data: typeof r.data === 'object' ? r.data : (() => { try { return JSON.parse(r.data); } catch { return null; } })()
      }));
    } catch (e) {
      console.error(`[MySQLAdapter] list(${category}) error:`, e.message);
      return [];
    }
  }

  // ─── 维度权重 ───────────────────────────────────────────────────────

  async loadWeights() {
    try {
      const rows = await DatabaseService.query(
        'SELECT dimension, weight, accuracy, sample_count FROM voting_dim_weights WHERE env = ? AND strategy = ?',
        [this.env, this.strategy]
      );
      const weights = {};
      for (const row of rows) {
        weights[row.dimension] = {
          weight: parseFloat(row.weight),
          accuracy: parseFloat(row.accuracy),
          sampleCount: row.sample_count
        };
      }
      return weights;
    } catch (e) {
      console.error(`[MySQLAdapter] loadWeights error:`, e.message);
      return {};
    }
  }

  async saveWeight(dimension, weight, accuracy, sampleCount) {
    try {
      await DatabaseService.query(
        `INSERT INTO voting_dim_weights (dimension, env, strategy, weight, accuracy, sample_count)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE weight=VALUES(weight), accuracy=VALUES(accuracy),
           sample_count=VALUES(sample_count), updated_at=NOW()`,
        [dimension, this.env, this.strategy, weight, accuracy, sampleCount]
      );
    } catch (e) {
      console.error(`[MySQLAdapter] saveWeight(${dimension}) error:`, e.message);
    }
  }

  // ─── 最近交易历史（autoAdjustRules 用） ────────────────────────────

  async getRecentTrades(days = 30) {
    try {
      const rows = await DatabaseService.query(
        `SELECT entry_data, direction, total_pnl_pct FROM paper_trade_history
         WHERE env = ? AND strategy = ? AND entry_data IS NOT NULL
           AND total_pnl_pct IS NOT NULL
           AND closed_at > DATE_SUB(NOW(), INTERVAL ? DAY)
           AND JSON_EXTRACT(entry_data, '$.votes') IS NOT NULL`,
        [this.env, this.strategy, days]
      );
      return rows || [];
    } catch (e) {
      console.error(`[MySQLAdapter] getRecentTrades error:`, e.message);
      return [];
    }
  }

  // ─── 搜索（MySQL 用 LIKE 降级实现，Sibyl 版本用全文搜索）────────────

  async search(query, category = 'trade_lesson', limit = 5) {
    try {
      const terms = query.trim().split(/\s+/).filter(Boolean);
      // 搜索 symbol 字段 + data JSON 里的关键词
      const rows = await DatabaseService.query(
        `SELECT key_name, data FROM paper_trade_learning
         WHERE env = ? AND strategy = ? AND category = ?
           AND (key_name LIKE ? OR CAST(data AS CHAR) LIKE ?)
         ORDER BY updated_at DESC LIMIT ?`,
        [this.env, this.strategy, category, `%${terms[0]}%`, `%${terms[0]}%`, limit]
      );
      return (rows || []).map(r => ({
        key: r.key_name,
        category,
        data: typeof r.data === 'object' ? r.data : (() => { try { return JSON.parse(r.data); } catch { return null; } })()
      }));
    } catch (e) {
      console.error(`[MySQLAdapter] search error:`, e.message);
      return [];
    }
  }

  // ─── 简单信息 ───────────────────────────────────────────────────────

  async getStats() {
    try {
      const rows = await DatabaseService.query(
        `SELECT category, COUNT(*) as cnt FROM paper_trade_learning
         WHERE env = ? AND strategy = ? GROUP BY category`,
        [this.env, this.strategy]
      );
      return (rows || []).reduce((acc, r) => { acc[r.category] = r.cnt; return acc; }, {});
    } catch (e) {
      return {};
    }
  }
}

module.exports = MySQLStorageAdapter;

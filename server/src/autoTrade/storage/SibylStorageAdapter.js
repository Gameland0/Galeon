/**
 * SibylStorageAdapter — LearningEngine 的 Sibyl Memory 存储实现
 *
 * 使用 Sibyl Memory 作为 LearningEngine 的持久化层。
 * 实现与 MySQLStorageAdapter 完全相同的接口。
 *
 * Sibyl Memory 五层存储映射:
 *   entity   → 交易教训、维度准确率、市场模式、combo统计、频繁获益者
 *   state    → 维度权重（热数据，频繁更新）
 *   reference → 维度权重快照（稳定版本）
 *
 * 黑客松结束后回退: 把 LEARNING_STORAGE 改回 'mysql' 即可
 */

const path = require('path');
const os = require('os');

// Sibyl Memory Python SDK 通过 child_process 调用
// Node.js 直接调 Python SDK (spawn)
const { execFileSync } = require('child_process');

const SIBYL_PYTHON = path.join(os.homedir(), '.sibyl-memory', 'venv', 'bin', 'python3');
const SIBYL_DB = path.join(os.homedir(), '.sibyl-memory', 'memory.db');

/**
 * 通过 Python 执行 Sibyl Memory 操作
 * 用 inline Python 脚本避免额外文件依赖
 */
function sibylExec(script) {
  try {
    const result = execFileSync(SIBYL_PYTHON, ['-c', script], {
      timeout: 5000,
      encoding: 'utf8'
    });
    return result.trim();
  } catch (e) {
    throw new Error(`Sibyl exec error: ${e.message}`);
  }
}

function sibylGet(category, name) {
  const script = `
import sys, json
sys.path.insert(0, '${path.join(os.homedir(), '.sibyl-memory', 'venv', 'lib')}')
from sibyl_memory_client import Storage, MemoryClient
storage = Storage('${SIBYL_DB}')
client = MemoryClient(storage)
try:
    r = client.get_entity(${JSON.stringify(category)}, ${JSON.stringify(name)})
    print(json.dumps(r['body']))
except Exception as e:
    if 'NotFound' in str(type(e)):
        print('null')
    else:
        print('null', file=sys.stderr)
`;
  const raw = sibylExec(script);
  if (!raw || raw === 'null') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function sibylSet(category, name, body) {
  const bodyJson = JSON.stringify(body).replace(/'/g, "\\'");
  const script = `
import sys, json
from sibyl_memory_client import Storage, MemoryClient
storage = Storage('${SIBYL_DB}')
client = MemoryClient(storage)
client.set_entity(${JSON.stringify(category)}, ${JSON.stringify(name)}, json.loads(${JSON.stringify(JSON.stringify(body))}))
print('ok')
`;
  sibylExec(script);
}

function sibylList(category, limit = 100) {
  const script = `
import sys, json
from sibyl_memory_client import Storage, MemoryClient
storage = Storage('${SIBYL_DB}')
client = MemoryClient(storage)
items = client.list_entities(${JSON.stringify(category)}, limit=${limit})
print(json.dumps([{'key': i['name'], 'data': i['body']} for i in items]))
`;
  const raw = sibylExec(script);
  try { return JSON.parse(raw) || []; } catch { return []; }
}

function sibylSearch(query, category = null, limit = 50) {
  const catArg = category ? `, category=${JSON.stringify(category)}` : '';
  const script = `
import sys, json
from sibyl_memory_client import Storage, MemoryClient
storage = Storage('${SIBYL_DB}')
client = MemoryClient(storage)
sr = client.search_entities(${JSON.stringify(query)}, limit=${limit}${catArg})
print(json.dumps([{'key': i['name'], 'category': i['category'], 'data': i['body']} for i in sr]))
`;
  const raw = sibylExec(script);
  try { return JSON.parse(raw) || []; } catch { return []; }
}

function sibylDelete(category, name) {
  const script = `
from sibyl_memory_client import Storage, MemoryClient
storage = Storage('${SIBYL_DB}')
client = MemoryClient(storage)
client.delete_entity(${JSON.stringify(category)}, ${JSON.stringify(name)})
print('ok')
`;
  try { sibylExec(script); } catch {}
}

// ─── Adapter 类 ──────────────────────────────────────────────────────────────

class SibylStorageAdapter {
  constructor(env, strategy) {
    this.env = env;
    this.strategy = strategy;
    this.type = 'sibyl';
    // 维度权重内存缓存（避免每次调 Python）
    this._weightsCache = null;
    this._weightsCacheAt = 0;
    this._WEIGHTS_TTL = 60 * 1000; // 1分钟缓存
    console.log(`[SibylAdapter] Initialized (env=${env}, strategy=${strategy})`);
  }

  // ─── category key: env+strategy 隔离 ───────────────────────────────

  _entityName(key) {
    return `${this.env}__${this.strategy}__${key}`;
  }

  // ─── 通用 learning 数据读写 ─────────────────────────────────────────

  async get(category, key) {
    try {
      return sibylGet(category, this._entityName(key));
    } catch (e) {
      console.error(`[SibylAdapter] get(${category}, ${key}) error:`, e.message);
      return null;
    }
  }

  async set(category, key, data) {
    try {
      sibylSet(category, this._entityName(key), data);
    } catch (e) {
      console.error(`[SibylAdapter] set(${category}, ${key}) error:`, e.message);
    }
  }

  async list(category, { limit = 100 } = {}) {
    try {
      const prefix = `${this.env}__${this.strategy}__`;
      const items = sibylList(category, limit);
      return items
        .filter(i => i.key.startsWith(prefix))
        .map(i => ({ key: i.key.slice(prefix.length), data: i.data }));
    } catch (e) {
      console.error(`[SibylAdapter] list(${category}) error:`, e.message);
      return [];
    }
  }

  // ─── 维度权重 ───────────────────────────────────────────────────────

  async loadWeights() {
    // 有缓存且未过期，直接返回
    if (this._weightsCache && Date.now() - this._weightsCacheAt < this._WEIGHTS_TTL) {
      return this._weightsCache;
    }
    try {
      const data = sibylGet('dim_weights', this._entityName('all'));
      if (!data) return {};
      this._weightsCache = data;
      this._weightsCacheAt = Date.now();
      return data;
    } catch (e) {
      console.error(`[SibylAdapter] loadWeights error:`, e.message);
      return {};
    }
  }

  async saveWeight(dimension, weight, accuracy, sampleCount) {
    try {
      // 读取现有权重对象，更新后整体写回（Sibyl 不支持字段级更新）
      let current = sibylGet('dim_weights', this._entityName('all')) || {};
      current[dimension] = { weight, accuracy, sampleCount };
      sibylSet('dim_weights', this._entityName('all'), current);
      // 清缓存
      this._weightsCache = current;
      this._weightsCacheAt = Date.now();
    } catch (e) {
      console.error(`[SibylAdapter] saveWeight(${dimension}) error:`, e.message);
    }
  }

  // ─── 最近交易历史（autoAdjustRules 用）────────────────────────────
  // Sibyl 模式下: 从 MySQL 的 paper_trade_history 读取历史
  // (历史成交记录仍存MySQL, 只有learning数据走Sibyl)

  async getRecentTrades(days = 30) {
    try {
      const DatabaseService = require('../../databaseService');
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
      console.error(`[SibylAdapter] getRecentTrades error:`, e.message);
      return [];
    }
  }

  // ─── 搜索（Sibyl 特有功能，MySQL版本没有）─────────────────────────

  search(query, category = null) {
    try {
      return sibylSearch(query, category);
    } catch (e) {
      return [];
    }
  }

  // ─── 统计 ───────────────────────────────────────────────────────────

  async getStats() {
    try {
      const script = `
import json
from sibyl_memory_client import Storage, MemoryClient
storage = Storage('${SIBYL_DB}')
client = MemoryClient(storage)
all_items = client.list_entities(limit=1000)
cats = {}
for i in all_items:
    cats[i['category']] = cats.get(i['category'], 0) + 1
print(json.dumps(cats))
`;
      const raw = sibylExec(script);
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  // ─── 状态信息（Dashboard用）────────────────────────────────────────

  async getSibylStatus() {
    try {
      const script = `
import json
from sibyl_memory_client import Storage, MemoryClient
storage = Storage('${SIBYL_DB}')
client = MemoryClient(storage)
status = client.free_tier_status()
print(json.dumps(status))
`;
      const raw = sibylExec(script);
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }
}

module.exports = SibylStorageAdapter;

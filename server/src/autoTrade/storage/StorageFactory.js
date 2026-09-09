/**
 * StorageFactory — 根据配置返回对应的存储 Adapter
 *
 * 使用方式:
 *   process.env.LEARNING_STORAGE = 'sibyl'  → SibylStorageAdapter (黑客松)
 *   process.env.LEARNING_STORAGE = 'mysql'  → MySQLStorageAdapter  (默认/回退)
 */

const MySQLStorageAdapter = require('./MySQLStorageAdapter');
const SibylStorageAdapter = require('./SibylStorageAdapter');

function createStorage(env, strategy) {
  const backend = (process.env.LEARNING_STORAGE || 'mysql').toLowerCase();
  if (backend === 'sibyl') {
    console.log(`[StorageFactory] Using SibylStorageAdapter (env=${env}, strategy=${strategy})`);
    return new SibylStorageAdapter(env, strategy);
  }
  console.log(`[StorageFactory] Using MySQLStorageAdapter (env=${env}, strategy=${strategy})`);
  return new MySQLStorageAdapter(env, strategy);
}

module.exports = { createStorage };

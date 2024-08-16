const db = require('./index');

class KnowledgeBase {
  static async create(agentId, ipfsHash) {
    const [result] = await db.query('INSERT INTO knowledge_base (agent_id, ipfs_hash) VALUES (?, ?)', [agentId, ipfsHash]);
    return result.insertId;
  }

  static async findByAgentId(agentId) {
    const [rows] = await db.query('SELECT * FROM knowledge_base WHERE agent_id = ?', [agentId]);
    return rows;
  }
}

module.exports = KnowledgeBase;

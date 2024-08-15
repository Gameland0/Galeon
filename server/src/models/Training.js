const db = require('./index');

class Training {
  static async create(agentId, trainingData) {
    const [result] = await db.query('INSERT INTO training_sessions (agent_id, training_data) VALUES (?, ?)', [agentId, JSON.stringify(trainingData)]);
    return result.insertId;
  }

  static async findByAgentId(agentId) {
    const [rows] = await db.query('SELECT * FROM training_sessions WHERE agent_id = ?', [agentId]);
    return rows;
  }
}

module.exports = Training;

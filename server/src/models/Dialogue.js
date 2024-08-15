const db = require('./index');

class Dialogue {
  static async create(agentId, userMessage, aiResponse) {
    const [result] = await db.query('INSERT INTO dialogues (agent_id, user_message, ai_response) VALUES (?, ?, ?)', [agentId, userMessage, aiResponse]);
    return result.insertId;
  }

  static async findByAgentId(agentId) {
    const [rows] = await db.query('SELECT * FROM dialogues WHERE agent_id = ?', [agentId]);
    return rows;
  }
}

module.exports = Dialogue;

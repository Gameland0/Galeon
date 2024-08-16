const db = require('./index');

class Agent {
  static async create(userId, name, description) {
    const [result] = await db.query('INSERT INTO agents (user_id, name, description) VALUES (?, ?, ?)', [userId, name, description]);
    return result.insertId;
  }

  static async findByUserId(userId) {
    const [rows] = await db.query('SELECT * FROM agents WHERE user_id = ?', [userId]);
    return rows;
  }
}

module.exports = Agent;

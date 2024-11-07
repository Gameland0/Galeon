const db = require('../config/database');
const UUID = require('uuid');

class DatabaseService {
  async query(sql, params) {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (error, results) => {
        if (error) {
          reject(error);
        } else {
          resolve(results);
        }
      });
    });
  }

  async saveConversation(userId, conversationId, agentId = null, role, content) {
    const id = UUID.v4();
    return this.query(
      'INSERT INTO chat_history (id, conversation_id, user_id, agent_id, role, content) VALUES (?, ?, ?, ?, ?, ?)',
      [id, conversationId, userId, agentId, role, content]
    );
  }

  async getConversationHistory(userId, conversationId) {
    return this.query(
      'SELECT * FROM chat_history WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC',
      [userId, conversationId]
    );
  }

  async clearConversation(userId) {
    return this.query('DELETE FROM chat_history WHERE user_id = ?', [userId]);
  }

  async saveTaskDecomposition(conversationId, decomposition) {
    const query = 'INSERT INTO task_decompositions (conversation_id, decomposition, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE decomposition = ?, status = ?';
    const values = [conversationId, JSON.stringify(decomposition), decomposition.status || 'in_progress', JSON.stringify(decomposition), decomposition.status || 'in_progress'];
    return this.query(query, values);
  }

  async getTaskDecomposition(conversationId) {
    const query = 'SELECT decomposition FROM task_decompositions WHERE conversation_id = ?';
    const results = await this.query(query, [conversationId]);
    return results.length > 0 ? JSON.parse(results[0].decomposition) : null;
  }
}

module.exports = new DatabaseService();

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

  async consumeCredits({userId, amount, teamId, conversationId, type, taskCount = 0}) {
    try {
      // await this.query('START TRANSACTION');

      // 扣除用户credits
      const updateResult = await this.query(
        'UPDATE user_credits SET credit_balance = credit_balance - ? WHERE user_id = ? AND credit_balance >= ?',
        [amount, userId, amount]
      );

      if (updateResult.affectedRows === 0) {
        throw new Error('Insufficient credits');
      }

      // 记录消费记录
      await this.query(
        `INSERT INTO credit_consumption (
          id, 
          user_id, 
          amount,
          type,
          use_id,
          conversation_id,
          message_type,
          task_count,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          UUID.v4(), 
          userId, 
          amount,
          'team',
          teamId,
          conversationId,
          type,
          taskCount
        ]
      );

      await this.query('COMMIT');

      return true;
    } catch (error) {
      await this.query('ROLLBACK');
      throw error;
    }
  }

}

module.exports = new DatabaseService();

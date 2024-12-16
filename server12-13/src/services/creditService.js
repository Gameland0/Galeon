const db = require('../config/database');
const DatabaseService = require('./databaseService')
const UUID = require('uuid');

class CreditService {

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
    
    async getCreditbyId(userId) {
        const results = await this.query(
            'SELECT * FROM user_credits WHERE user_id = ?',
            [userId]
        );
        return results[0].credit_balance
    }

    async getBuyCredit(userId) {
        const results = await this.query(
            'SELECT * FROM user_credits WHERE user_id = ?',
            [userId]
        );
        return results[0].buy_balance
    }

    async useBuyCredit(userId) {
        const result = await this.query(
            `UPDATE user_credits 
             SET buy_balance = buy_balance - 1,
                 last_used_at = NOW() 
             WHERE user_id = ? AND buy_balance > 0`,
            [userId]
        );
        return result.affectedRows > 0;
    }

    async getUserCredit(userId) {
        const results = await this.query(
            'SELECT * FROM user_credits WHERE user_id = ?',
            [userId]
        );

        if (results.length === 0) {
            await this.initializeUserCredit(userId);
            return { creditBalance: 20 };
        }

        const userData = results[0];
        await this.checkAndUpdateDailyCredit(userId, userData);
        return {
          creditBalance: userData.credit_balance,
          buyBalance: userData.buy_balance,
          lastUsedAt: userData.last_used_at,
          lastResetAt: userData.last_reset_at
        };
    }

    async updataUserBuyCredit(userId, amout) {
        return this.query(
            `UPDATE user_credits 
             SET buy_balance = buy_balance + ?
             WHERE user_id = ?`,
            [amout, userId]
        );
        // return result.affectedRows > 0;
    }

    async initializeUserCredit(userId) {
        const id = UUID.v4();
        await this.query(
            `INSERT INTO user_credits (id, user_id, credit_balance,buy_balance, last_reset_at) 
             VALUES (?, ?, 20, 0, NOW())
             ON DUPLICATE KEY UPDATE credit_balance = credit_balance`,
            [id, userId]
        );
    }

    async checkAndUpdateDailyCredit(userId, userData) {
        const lastReset = new Date(userData.last_reset_at);
        const now = new Date();
        
        // 如果最后重置时间是昨天或更早，添加每日credit
        if (lastReset.getDate() !== now.getDate() || 
            lastReset.getMonth() !== now.getMonth() || 
            lastReset.getFullYear() !== now.getFullYear()) {
            
            await this.query(
                `UPDATE user_credits 
                 SET credit_balance = credit_balance + 20, 
                     last_reset_at = NOW() 
                 WHERE user_id = ?`,
                [userId]
            );
        }
    }

    async useCredit(userId) {
        const result = await this.query(
            `UPDATE user_credits 
             SET credit_balance = credit_balance - 1,
                 last_used_at = NOW() 
             WHERE user_id = ? AND credit_balance > 0`,
            [userId]
        );
        return result.affectedRows > 0;
    }

    async runDailyUpdate() {
        const users = await this.query('SELECT DISTINCT user_id FROM user_credits');
        for (const user of users) {
            await this.checkAndUpdateDailyCredit(user.user_id, user);
        }
    }

    async weeklyReset() {
        console.log('Executing weekly credit reset for all users...');
        
        try {
            // 重置所有用户的credit为20
            await this.query(
                `UPDATE user_credits 
                 SET credit_balance = 20,
                     last_reset_at = NOW()`
            );
            
            console.log('Weekly credit reset completed successfully');
        } catch (error) {
            console.error('Error during weekly credit reset:', error);
            throw error;
        }
    }

}

module.exports = new CreditService();

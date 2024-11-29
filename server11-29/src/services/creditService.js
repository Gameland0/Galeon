const DatabaseService = require('./databaseService');
const UUID = require('uuid');

class CreditService {
    async getUserCredit(userId) {
        const results = await DatabaseService.query(
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
          lastUsedAt: userData.last_used_at,
          lastResetAt: userData.last_reset_at
        };
    }

    async initializeUserCredit(userId) {
        const id = UUID.v4();
        await DatabaseService.query(
            `INSERT INTO user_credits (id, user_id, credit_balance, last_reset_at) 
             VALUES (?, ?, 20, NOW())
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
            
            await DatabaseService.query(
                `UPDATE user_credits 
                 SET credit_balance = credit_balance + 20, 
                     last_reset_at = NOW() 
                 WHERE user_id = ?`,
                [userId]
            );
        }
    }

    async useCredit(userId) {
        const result = await DatabaseService.query(
            `UPDATE user_credits 
             SET credit_balance = credit_balance - 1,
                 last_used_at = NOW() 
             WHERE user_id = ? AND credit_balance > 0`,
            [userId]
        );
        return result.affectedRows > 0;
    }

    async runDailyUpdate() {
        const users = await DatabaseService.query('SELECT DISTINCT user_id FROM user_credits');
        for (const user of users) {
            await this.checkAndUpdateDailyCredit(user.user_id, user);
        }
    }

    async weeklyReset() {
        console.log('Executing weekly credit reset for all users...');
        
        try {
            // 重置所有用户的credit为20
            await DatabaseService.query(
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

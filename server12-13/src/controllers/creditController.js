const CreditService = require('../services/creditService');

exports.getUserCredit = async (req, res) => {
    try {
        const credit = await CreditService.getUserCredit(req.userId);
        res.json(credit);
    } catch (error) {
        console.error('Error getting user credit:', error);
        res.status(500).json({ error: 'Failed to get user credit' });
    }
};

exports.useCredit = async (req, res) => {
    try {
        const success = await CreditService.useCredit(req.userId);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Insufficient credits' });
        }
    } catch (error) {
        console.error('Error using credit:', error);
        res.status(500).json({ error: 'Failed to use credit' });
    }
};

exports.updataUserCredit = async (req, res) => {
    const { amout } = req.body;
    try {
        const credit = await CreditService.updataUserBuyCredit(req.userId,amout);
        res.json(credit);
    } catch (error) {
        console.error('Error updata user credit:', error);
        res.status(500).json({ error: 'Failed to updata user credit' });
    }
};
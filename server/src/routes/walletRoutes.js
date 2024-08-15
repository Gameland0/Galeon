const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { verifyToken } = require('../middleware/auth');

router.get('/balance/:address', verifyToken, walletController.getBalance);
router.put('/update', verifyToken, walletController.updateWallet);

module.exports = router;

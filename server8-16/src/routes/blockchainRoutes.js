const express = require('express');
const router = express.Router();
const blockchainController = require('../controllers/blockchainController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/deploy', authMiddleware, blockchainController.deployContract);
router.post('/estimate-gas', authMiddleware, blockchainController.estimateGas);
router.get('/events/:contractAddress', authMiddleware, blockchainController.getContractEvents);

module.exports = router;


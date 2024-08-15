const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { authenticateJWT } = require('../middleware/auth');

router.post('/deploy', authenticateJWT, contractController.deployContract);
router.post('/sendToken', authenticateJWT, contractController.sendToken);
router.post('/estimateGas', authenticateJWT, contractController.estimateGas);
router.post('/estimateTokenTransferGas', authenticateJWT, contractController.estimateTokenTransferGas);

module.exports = router;

const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { authenticateJWT } = require('../middleware/auth');

router.get('/user', authenticateJWT, agentController.getUserAgents);
router.get('/marketplace', agentController.getMarketplaceAgents);
router.post('/:agentId/train', authenticateJWT, agentController.trainAgent);
router.post('/:agentId/toggle-publicity', authenticateJWT, agentController.toggleAgentPublicity);

module.exports = router;

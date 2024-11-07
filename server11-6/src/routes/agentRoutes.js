const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/where/:address', agentController.getAgents);
router.post('/', agentController.createAgent);
router.post('/finalize', agentController.finalizeAgentCreation);
router.get('/marketplace', agentController.getMarketplaceAgents);
router.get('/:agentId', agentController.getAgentDetails);
router.put('/:agentId', agentController.updateAgent);
router.delete('/:agentId',agentController.deleteAgent)
router.put('/:agentId/toggle-publicity', agentController.toggleAgentPublicity);
router.post('/:agentId/train', agentController.trainAgent);
router.get('/:agentId/knowledge', agentController.getAgentKnowledge);
router.post('/communicate', agentController.communicateWithAgent);
router.put('/:agentId/role-goal', agentController.updateAgentRoleAndGoal);
router.post('/:agentId/verify', agentController.verifyAgent);

module.exports = router;

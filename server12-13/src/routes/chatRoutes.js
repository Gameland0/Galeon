const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.post('/', chatController.sendMessage);
router.post('/team/:teamId', chatController.sendTeamMessage);
router.get('/history/:conversationId', chatController.getConversationHistory);
router.delete('/history', chatController.clearConversation);
router.post('/agent/:agentId/responses', chatController.getAgentResponses);
router.post('/decompose-task', chatController.decomposeTask);
router.post('/refine-task-decomposition/:conversationId', chatController.refineTaskDecomposition);
router.post('/complete-task-decomposition/:conversationId', chatController.completeTaskDecomposition);
router.get('/task-decomposition/:conversationId', chatController.getTaskDecomposition);


module.exports = router;

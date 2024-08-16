const express = require('express');
const router = express.Router();
const knowledgeBaseController = require('../controllers/knowledgeBaseController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, knowledgeBaseController.addKnowledge);
router.get('/:agentId', verifyToken, knowledgeBaseController.getKnowledge);

module.exports = router;

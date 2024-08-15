const express = require('express');
const router = express.Router();
const dialogueController = require('../controllers/dialogueController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, dialogueController.startDialogue);
router.get('/:agentId', verifyToken, dialogueController.getDialogueHistory);

module.exports = router;

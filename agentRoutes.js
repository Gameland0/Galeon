const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, agentController.createAgent);
router.get('/', verifyToken, agentController.getAgents);
router.post('/deploy', agentController.deployAgent);


module.exports = router;

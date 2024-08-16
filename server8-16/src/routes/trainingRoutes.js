const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/trainingController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, trainingController.startTraining);
router.get('/:agentId', verifyToken, trainingController.getTrainingSessions);

module.exports = router;

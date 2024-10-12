const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/', teamController.createTeam);
router.get('/', teamController.getTeams);
router.get('/:teamId', teamController.getTeamById);
router.put('/:teamId', teamController.updateTeam);
router.delete('/:teamId', teamController.deleteTeam);
router.put('/:teamId/agent-roles', teamController.updateTeamAgentRoles);
router.post('/:teamId/execute-langchain-task', teamController.executeLangChainTeamTask);

module.exports = router;

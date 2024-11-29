const TeamService = require('../services/teamService');

exports.createTeam = async (req, res) => {
  const { name, description, agents, transactionHash, teamId, chainid } = req.body;
  try {
    const team = await TeamService.createTeam(req.userId, name, description, agents, transactionHash, teamId, chainid);
    res.status(201).json(team);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
};

exports.getTeams = async (req, res) => {
  try {
    const teams = await TeamService.getTeams(req.userId);
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
};

exports.getTeamById = async (req, res) => {
  const { teamId } = req.params;
  try {
    const team = await TeamService.getTeamById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json(team);
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
};

exports.updateTeam = async (req, res) => {
  const { teamId } = req.params;
  const { name, description, agents, transactionHash } = req.body;
  try {
    const updatedTeam = await TeamService.updateTeam(teamId, req.userId, { name, description, agents, transactionHash });
    res.json(updatedTeam);
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
};

exports.deleteTeam = async (req, res) => {
  const { teamId } = req.params;
  try {
    await TeamService.deleteTeam(teamId, req.userId);
    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
};

exports.updateTeamAgentRoles = async (req, res) => {
  const { teamId } = req.params;
  const { agentRoles } = req.body;
  try {
    await TeamService.updateTeamAgentRoles(teamId, agentRoles);
    res.json({ message: 'Team agent roles updated successfully' });
  } catch (error) {
    console.error('Error updating team agent roles:', error);
    res.status(500).json({ error: 'Failed to update team agent roles' });
  }
};

exports.executeLangChainTeamTask = async (req, res) => {
  const { teamId } = req.params;
  const { task } = req.body;
  try {
    const result = await TeamService.executeLangChainTeamTask(teamId, task);
    res.json(result);
  } catch (error) {
    console.error('Error in executeLangChainTeamTask:', error);
    res.status(500).json({ error: 'Failed to execute team task' });
  }
};

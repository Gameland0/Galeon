const AIService = require('../services/aiService');
const DatabaseService = require('../services/databaseService');
const agentService = require('../services/agentService');
const TeamService = require('../services/teamService');

exports.sendMessage = async (req, res) => {
  const { message, agentId, conversationId } = req.body;
  console.log('chatController: Received message:', message, 'for agent:', agentId);
  try {
    const response = await AIService.processMessage(req.userId, message, agentId, conversationId);
    res.json(response);
  } catch (error) {
    console.error('chatController: Error in sendMessage:', error);
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
};

exports.sendTeamMessage = async (req, res) => {
  const { teamId } = req.params;
  const { message, conversationId } = req.body;
  try {
    const response = await TeamService.processTeamMessage(req.userId, message, teamId, conversationId);
    res.json(response);
  } catch (error) {
    console.error('Error in sendTeamMessage:', error);
    res.status(500).json({ error: 'Failed to process team message', details: error.message });
  }
};

exports.getConversationHistory = async (req, res) => {
  const { conversationId } = req.params;
  try {
    const history = await DatabaseService.getConversationHistory(req.userId, conversationId);
    res.json(history);
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
};

exports.clearConversation = async (req, res) => {
  try {
    await DatabaseService.clearConversation(req.userId);
    res.json({ message: 'Conversation cleared successfully' });
  } catch (error) {
    console.error('Error clearing conversation:', error);
    res.status(500).json({ error: 'Failed to clear conversation' });
  }
};

exports.getAgentResponses = async (req, res) => {
  const { agentId } = req.params;
  const { message, context = [], instruction } = req.body;
  try {
    const response = await agentService.getAgentResponse(agentId, message, context, instruction);
    res.json(response);
  } catch (error) {
    console.error('Error fetching agent responses:', error);
    res.status(500).json({ error: 'Failed to fetch agent responses' });
  }
};


exports.decomposeTask = async (req, res) => {
  const { task } = req.body;
  try {
    const subtasks = await AIService.decomposeTaskWithLangChain(task);
    res.json(subtasks);
  } catch (error) {
    console.error('Error in decomposeTask:', error);
    res.status(500).json({ error: 'Failed to decompose task' });
  }
};

exports.refineTaskDecomposition = async (req, res) => {
  const { conversationId } = req.params;
  const { taskDecomposition } = req.body;

  try {
    const refinedDecomposition = await AIService.refineTaskDecomposition(conversationId, taskDecomposition);
    res.json(refinedDecomposition);
  } catch (error) {
    console.error('Error refining task decomposition:', error);
    res.status(500).json({ error: 'Failed to refine task decomposition' });
  }
};

exports.completeTaskDecomposition = async (req, res) => {
  const { conversationId } = req.params;

  try {
    const completedDecomposition = await AIService.completeTaskDecomposition(conversationId);
    res.json(completedDecomposition);
  } catch (error) {
    console.error('Error completing task decomposition:', error);
    res.status(500).json({ error: 'Failed to complete task decomposition' });
  }
};

exports.getTaskDecomposition = async (req, res) => {
  const { conversationId } = req.params;

  try {
    const decomposition = await DatabaseService.getTaskDecomposition(conversationId);
    res.json(decomposition);
  } catch (error) {
    console.error('Error fetching task decomposition:', error);
    res.status(500).json({ error: 'Failed to fetch task decomposition' });
  }
};


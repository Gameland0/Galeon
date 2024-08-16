const AIService = require('../services/aiService');

exports.getUserAgents = (req, res) => {
  const userId = req.user.id; // Assuming you have user authentication middleware
  const agents = AIService.getUserAgents(userId);
  res.json(agents);
};

exports.getMarketplaceAgents = (req, res) => {
  const agents = AIService.getMarketplaceAgents();
  res.json(agents);
};

exports.trainAgent = (req, res) => {
  const userId = req.user.id;
  const { agentId } = req.params;
  const { trainingData } = req.body;
  
  try {
    const response = AIService.trainAgent(userId, agentId, trainingData);
    res.json({ message: response });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.toggleAgentPublicity = (req, res) => {
  const userId = req.user.id;
  const { agentId } = req.params;
  
  try {
    const response = AIService.toggleAgentPublicity(userId, agentId);
    res.json({ message: response });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

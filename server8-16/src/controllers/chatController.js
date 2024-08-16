const AIService = require('../services/aiService');


exports.sendMessage = async (req, res) => {
  const { message } = req.body;
  const walletAddress = req.user ? req.user.walletAddress : 'anonymous';

  try {
    const response = await AIService.processMessage(walletAddress, message);
    res.json(response);
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ 
      message: 'Error processing message', 
      error: error.message
    });
  }
};


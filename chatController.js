const aiService = require('../services/aiService');
const { v4: uuidv4 } = require('uuid');

exports.sendMessage = (req, res) => {
  const { message } = req.body;
  // 如果没有用户认证，我们使用一个临时的 session ID
  const userId = req.user ? req.user.id : req.session.id || uuidv4();

  console.log('Received message from user:', userId);
  console.log('Message:', message);

  aiService.processMessage(userId, message)
    .then(responses => {
      console.log('AI responses:', responses);
      res.json(responses);
    })
    .catch(error => {
      console.error('Error processing message:', error);
      res.status(500).json({ 
        message: 'Error processing message', 
        error: error.message
      });
    });
};

const db = require('../config/database');

exports.startDialogue = (req, res) => {
  const { agentId, message } = req.body;
  
  // Here you would typically call your AI model to generate a response
  const aiResponse = "This is a placeholder AI response";
  
  db.query('INSERT INTO dialogues (agent_id, user_message, ai_response) VALUES (?, ?, ?)', 
    [agentId, message, aiResponse], 
    (error, result) => {
      if (error) {
        return res.status(500).json({ error: 'Could not start dialogue' });
      }
      res.json({ message: 'Dialogue started', id: result.insertId, aiResponse });
    }
  );
};

exports.getDialogueHistory = (req, res) => {
  const { agentId } = req.params;
  
  db.query('SELECT * FROM dialogues WHERE agent_id = ?', [agentId], (error, results) => {
    if (error) {
      return res.status(500).json({ error: 'Could not fetch dialogue history' });
    }
    res.json(results);
  });
};

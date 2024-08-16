// const db = require('../config/database');

exports.startTraining = (req, res) => {
  const { agentId, trainingData } = req.body;
  
  db.query('INSERT INTO training_sessions (agent_id, training_data) VALUES (?, ?)', 
    [agentId, JSON.stringify(trainingData)], 
    (error, result) => {
      if (error) {
        return res.status(500).json({ error: 'Could not start training' });
      }
      res.json({ message: 'Training started', sessionId: result.insertId });
    }
  );
};

exports.getTrainingSessions = (req, res) => {
  const { agentId } = req.params;
  
  db.query('SELECT * FROM training_sessions WHERE agent_id = ?', [agentId], (error, results) => {
    if (error) {
      return res.status(500).json({ error: 'Could not fetch training sessions' });
    }
    res.json(results);
  });
};

// controllers/knowledgeBaseController.js
const db = require('../config/database');
const ipfs = require('../config/ipfs');

exports.addKnowledge = async (req, res) => {
  const { agentId, knowledge } = req.body;
  
  try {
    const result = await ipfs.add(JSON.stringify(knowledge));
    const ipfsHash = result.path;
    
    db.query('INSERT INTO knowledge_base (agent_id, ipfs_hash) VALUES (?, ?)', 
      [agentId, ipfsHash], 
      (error, result) => {
        if (error) {
          return res.status(500).json({ error: 'Could not add knowledge' });
        }
        res.json({ message: 'Knowledge added', id: result.insertId, ipfsHash });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'IPFS error' });
  }
};

exports.getKnowledge = (req, res) => {
  const { agentId } = req.params;
  
  db.query('SELECT * FROM knowledge_base WHERE agent_id = ?', [agentId], (error, results) => {
    if (error) {
      return res.status(500).json({ error: 'Could not fetch knowledge' });
    }
    res.json(results);
  });
};

const Agent = require('../models/Agent');
const { createAgentOnChain } = require('../services/blockchainService');
const db = require('../config/database');

exports.createAgent = (req, res) => {
  const { userId } = req.user;
  const { name, description } = req.body;
  
  createAgentOnChain(name, description, userId)
    .then(({ agentId, tokenId }) => {
      Agent.create(userId, name, description, tokenId, (error, result) => {
        if (error) {
          return res.status(500).json({ message: 'Error creating agent' });
        }
        res.status(201).json({ message: 'Agent created', agentId: result.insertId, tokenId });
      });
    })
    .catch(error => {
      res.status(500).json({ message: 'Error creating agent on blockchain', error: error.message });
    });
};

exports.getAgents = (req, res) => {
  const { userId } = req.user;
  Agent.findByUserId(userId, (error, agents) => {
    if (error) {
      return res.status(500).json({ message: 'Error fetching agents' });
    }
    res.json(agents);
  });
};

exports.deployAgent = (req, res) => {
  const { description, ownerAddress } = req.body;
  deployAgentOnChain(description, ownerAddress)
    .then(agentData => {
      const query = 'INSERT INTO agents (name, description, owner_address, contract_address) VALUES (?, ?, ?, ?)';
      const values = [agentData.name, agentData.description, ownerAddress, agentData.contractAddress];
      
      db.query(query, values, (error, result) => {
        if (error) {
          console.error('Error deploying agent:', error);
          return res.status(500).json({ message: 'Error deploying agent', error: error.message });
        }
        const newAgent = {
          id: result.insertId,
          ...agentData,
          ownerAddress
        };
        res.status(201).json(newAgent);
      });
    })
    .catch(error => {
      console.error('Error in blockchain operation:', error);
      res.status(500).json({ message: 'Error in blockchain operation', error: error.message });
    });
};




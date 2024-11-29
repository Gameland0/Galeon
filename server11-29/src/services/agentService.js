const DatabaseService = require('./databaseService');
const OpenAIService = require('./openaiService');
const LangChainService = require('./langchainService');


class AgentService {

  async getAgentById(agentId) {
    try {
      const results = await DatabaseService.query('SELECT * FROM agents WHERE id = ?', [agentId]);
      if (results.length > 0) {
        const agent = results[0];
        agent.capabilities = JSON.parse(agent.capabilities || '[]');
        return agent;
      }
      console.warn(`No agent found with id: ${agentId}`);
      return null;
    } catch (error) {
      console.error(`Error fetching agent with id ${agentId}:`, error);
      throw error;
    }
  }

  async createAgent(userId, agentData) {
    const { name, description, type, role, goal, ipfsHash, transactionHash, chainid, imageUrl } = agentData;
    const query = `
      INSERT INTO agents (name, description, type, role, goal, ipfs_hash, transaction_hash, owner, chainid, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await DatabaseService.query(query, [name, description, type, role, goal, ipfsHash, transactionHash, userId,  chainid, imageUrl]);
    return { id: result.insertId, ...agentData };
  }

  async getAgents(userId) {
    return DatabaseService.query('SELECT * FROM agents WHERE owner = ?', [userId]);
  }

  async getMarketplaceAgents() {
    return DatabaseService.query('SELECT * FROM agents WHERE is_public = true');
  }

  async toggleAgentPublicity(agentId, userId) {
    return DatabaseService.query(
      'UPDATE agents SET is_public = NOT is_public WHERE id = ? AND owner = ?',
      [agentId, userId]
    );
  }

  async updateAgent(agentId, userId, { name, description, type, role, model }) {
    return DatabaseService.query(
      'UPDATE agents SET name = ?, description = ?, type = ?, role = ?, model = ? WHERE id = ? AND owner = ?',
      [name, description, type, role, model, agentId, userId]
    );
  }

  async updateAgentHash(agentId, userId, transactionHash) {
    return DatabaseService.query(
      'UPDATE agents SET transaction_hash = ? WHERE id = ? AND owner = ?',
      [transactionHash, agentId, userId]
    );
  }

  async getAgentResponse(agentId, message, context, instruction) {
    const agent = await this.getAgentById(agentId);
    if (!agent) {
      console.error(`Agent with id ${agentId} not found`);
      throw new Error(`Agent not found`);
    }
  
    const relevantKnowledge = await this.getRelevantKnowledge(agentId, message);
    const rolePrompt = this.getRoleBasedPrompt(agent.role, instruction);
    const fullPrompt = `${rolePrompt}\n\nRelevant knowledge: ${relevantKnowledge}\n\nTask: ${message}`;
  
    let response;
    if (instruction === 'Generate code') {
      response = await LangChainService.generateCode(fullPrompt, context.existingCode || "", context.preferredLanguage || "");
    } else if (instruction === 'Review code') {
      response = await LangChainService.reviewCode(message);
    } else if (instruction === 'Apply code review') {
      const { code, review } = message;
      response = await LangChainService.applyCodeReview(code, review);
    } else {
      response = await OpenAIService.createChatCompletion([
        { role: 'system', content: fullPrompt },
        ...context.map(msg => ({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.content })),
        { role: 'user', content: message }
      ]);
    }
  
    return response;
  }

  async getAgentKnowledge(agentId) {
    return DatabaseService.query('SELECT key_phrase, content FROM agent_knowledge WHERE agent_id = ?', [agentId]);
  }

  async updateAgentRoleAndGoal(agentId, role, goal) {
    return DatabaseService.query(
      'UPDATE agents SET role = ?, goal = ? WHERE id = ?',
      [role, goal, agentId]
    );
  }

  async addTrainingData(agentId, ipfsHash, userAddress) {
    const trainedAt = new Date().toISOString();
    return DatabaseService.query(
      'INSERT INTO agent_training_data (agent_id, ipfs_hash, user_address, trained_at) VALUES (?, ?, ?, ?)',
      [agentId, ipfsHash, userAddress, trainedAt]
    );
  }

  async getAgentTrainingData(agentId) {
    const results = await DatabaseService.query(
      'SELECT ipfs_hash, user_address, trained_at FROM agent_training_data WHERE agent_id = ? ORDER BY trained_at DESC',
      [agentId]
    );
    return results.map(row => ({
      ipfsHash: row.ipfs_hash,
      userAddress: row.user_address,
      trained_at: row.trained_at
    }));
  }

  async storeKnowledge(agentId, keyPhrase, content) {
    return DatabaseService.query(
      'INSERT INTO agent_knowledge (agent_id, key_phrase, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
      [agentId, keyPhrase, content]
    );
  }

  extractKeyPhrases(content) {
    const words = content.toLowerCase().split(/\W+/);
    const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'but']);
    return [...new Set(words.filter(word => word.length > 3 && !stopWords.has(word)))];
  }

  async updateAgentKnowledge(agentId, trainingData) {
    try {
      const keywords = await this.extractKeywords(trainingData);
      for (const keyword of keywords) {
        await DatabaseService.query(
          'INSERT INTO agent_knowledge (agent_id, key_phrase, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
          [agentId, keyword, trainingData]
        );
      }
    } catch (error) {
      console.error('Error in updateAgentKnowledge:', error);
      throw error;
    }
  }

  async getRelevantKnowledge(agentId, message) {
    const keywords = await this.extractKeywords(message);
    const query = `SELECT content FROM agent_knowledge WHERE agent_id = ? AND key_phrase IN (${keywords.map(() => '?').join(', ')}) LIMIT 5`;
    const results = await DatabaseService.query(query, [agentId, ...keywords]);
    return results.map(row => row.content).join('\n\n');
  }

  getRoleBasedPrompt(role, instruction) {
    const prompts = {
      'task_decomposer': "You are a task decomposition specialist. Your job is to break down complex tasks into manageable subtasks.",
      'executor': "You are responsible for executing tasks. Provide detailed steps for completing the given task.",
      'reviewer': "As a reviewer, your role is to critically evaluate the work done and provide constructive feedback.",
      // ... 其他角色的提示词 ...
    };
    return `${prompts[role] || "You are an AI assistant."} ${instruction}`;
  }

  async extractKeywords(content) {
    try {
      const prompt = `Extract 5 key words or phrases from the following text, regardless of language. Ignore common stop words. Separate the keywords with commas:\n\n${content}`;
      const response = await OpenAIService.createChatCompletion([
        { role: "system", content: "You are a helpful assistant that extracts keywords from text, ignoring stop words." },
        { role: "user", content: prompt }
      ]);

      const keywords = response.trim().split(',').map(keyword => keyword.trim());
      return keywords;
    } catch (error) {
      console.error('Error extracting keywords with OpenAI:', error);
      return this.fallbackKeywordExtraction(content);
    }
  }

  fallbackKeywordExtraction(content) {
    // 保持现有的后备方法不变
    const words = content.split(/\s+/);
    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  }

  async deleteAgent(agentId) {
    return DatabaseService.query('DELETE FROM agents WHERE id = ?', [agentId]);
  }

}

module.exports = new AgentService();

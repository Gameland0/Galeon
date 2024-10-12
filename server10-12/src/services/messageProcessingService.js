const OpenAIService = require('./openaiService');
const AgentService = require('./agentService');
const DatabaseService = require('./databaseService');
const AIService = require('./aiService');

class MessageProcessingService {
  constructor() {
    this.processContexts = new Map();
  }

  getProcessContext(conversationId) {
    return this.processContexts.get(conversationId) || [];
  }

  updateProcessContext(conversationId, message) {
    let context = this.getProcessContext(conversationId);
    context.push(message);
    if (context.length > 10) {
      context = context.slice(-10);
    }
    this.processContexts.set(conversationId, context);
  }

  async processMessage(userId, message, agentId, conversationId) {
    let agent = null;
    let systemMessage = "";
    // const userLanguage = this.detectUserLanguage(message);
    if (agentId) {
      agent = await AgentService.getAgentById(agentId);
      const relevantKnowledge = await this.getRelevantKnowledge(agentId, message);
      const previousMessages = await this.getPreviousMessages(userId, 5); 
      systemMessage = `You are ${agent.name}, an AI agent with the following description: ${agent.description}. Your role is ${agent.role || 'not specified'} and your goal is ${agent.goal || 'not specified'}.\n\nRelevant knowledge:\n${relevantKnowledge}\n\nPrevious context:\n${previousMessages}`;
    } else {
      systemMessage = "You are an AI assistant for a multi-agent platform.";
    }
    const context = this.getProcessContext(conversationId);
    const messages = [
      { role: "system", content: systemMessage },
      ...context,
      { role: "user", content: message }
    ];

    const aiResponse = await OpenAIService.createChatCompletion(messages);
    this.updateProcessContext(conversationId, { role: 'user', content: message });
    this.updateProcessContext(conversationId, { role: 'assistant', content: aiResponse });
    await DatabaseService.saveConversation(userId, conversationId, agentId, 'user', message );
    await DatabaseService.saveConversation(userId, conversationId, agentId, 'agent', aiResponse);

    return { content: aiResponse, agent };
  }

  async getPreviousMessages(userId, count) {
    const results = await DatabaseService.query(
      `SELECT content, agent_id
       FROM chat_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, count]
    );
    return results.reverse().map(row => 
      `User: ${row.content}\nAI (Agent ${row.agent_id || 'Unknown'}): ${row.response}`
    ).join('\n\n');
  }

  async decomposeTask(task, context) {
    const messages = [
      ...context,
      { role: "system", content: `You are an expert in various fields including but not limited to web development, software engineering, and project management. Your task is to:
        1. Decompose the given task into smaller, manageable subtasks.
        2. For each subtask, determine the most appropriate agent type and required skills.
        3. Format your response as a JSON array where each object represents a subtask with properties: description, agentType, and requiredSkills (an array of strings).
        4. Do not include any markdown formatting or code block indicators in your response.` },
      { role: "user", content: `Decompose and analyze this task: ${task}` }
    ];

    const response = await OpenAIService.createChatCompletion(messages, "gpt-4o-mini", 1500);
    return this.parseDecomposition(response);
  }

  async agentCommunication(senderId, receiverId, message, conversationId) {
    const sender = await AgentService.getAgentById(senderId);
    const receiver = await AgentService.getAgentById(receiverId);

    const response = await OpenAIService.createChatCompletion([
      { role: "system", content: `You are ${receiver.name}. Another agent, ${sender.name}, is communicating with you. Respond appropriately based on your role and the message content.` },
      { role: "user", content: message }
    ]);

    const reply = response.trim();
    await this.saveAgentCommunication(senderId, receiverId, message, reply);
    await DatabaseService.saveConversation(null, conversationId, 'agent', reply, receiverId);

    return { reply };
  }

  async saveAgentCommunication(senderId, receiverId, message, reply) {
    const id = UUID.v4();
    return DatabaseService.query(
      'INSERT INTO agent_communications (id, sender_id, receiver_id, message, reply) VALUES (?, ?, ?, ?, ?)',
      [id, senderId, receiverId, message, reply]
    );
  }

  async processSimpleMessage(message, team, context) {
    return OpenAIService.createChatCompletion([
      ...context,
      { role: "system", content: `You are an AI assistant for the team "${team.name}". Respond to the user's message in the context of the ongoing Web3 game development discussion.` },
      { role: "user", content: message }
    ], "gpt-4o-mini", 1000);
  }

  async shouldDecomposeTask(message, context) {
    const response = await OpenAIService.createChatCompletion([
      ...context,
      { role: "system", content: "Determine if the given message requires task decomposition. The task could be related to any field, not just game development. Respond with 'Yes' if it's a task that can be broken down into subtasks, or 'No' if it's a simple question or doesn't require decomposition." },
      { role: "user", content: `Does this message require task decomposition? Message: "${message}"` }
    ], "gpt-4o-mini", 5);

    return response.toLowerCase() === 'yes';
  }

  parseDecomposition(decomposition) {
    if (!decomposition) {
      console.warn('Decomposition is undefined or null');
      return [];
    }

    try {
      let content = decomposition.replace(/```json\s?|```/g, '').trim();
      const parsedContent = JSON.parse(content);
      if (Array.isArray(parsedContent)) {
        return parsedContent;
      } else {
        throw new Error('Parsed content is not an array');
      }
    } catch (error) {
      console.warn('Failed to parse decomposition as JSON:', error);
      // Fallback to simple string splitting if JSON parsing fails
      return decomposition.split('\n')
        .filter(line => line.trim())
        .map(line => ({ description: line.trim(), agentType: 'general', requiredSkills: [] }));
    }
  }

  detectUserLanguage(message) {
    const chineseChars = (message.match(/[\u4e00-\u9fa5]/g) || []).length;
    return chineseChars > message.length / 4 ? '中文' : 'English';
  }

  async getRelevantKnowledge(agentId, message) {
    try {
      const keywords = await this.extractKeywords(message);
      const query = `
        SELECT content 
        FROM agent_knowledge 
        WHERE agent_id = ? AND key_phrase IN (${keywords.map(() => '?').join(', ')})
        LIMIT 5
      `;
      const results = await DatabaseService.query(query, [agentId, ...keywords]);
      return results.map(row => row.content).join('\n\n');
    } catch (error) {
      console.error('Error fetching relevant knowledge:', error);
      return '';
    }
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
    const words = content.toLowerCase().split(/\W+/);
    const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'but']);
    const wordFreq = {};
    words.forEach(word => {
      if (!stopWords.has(word) && word.length > 2) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  }
}

module.exports = new MessageProcessingService();
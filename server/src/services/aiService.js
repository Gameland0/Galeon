const OpenAI = require('openai');
const marked = require('marked');

class AIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.conversations = {};
  }

  async generateResponse(userId, prompt) {
    if (!this.conversations[userId]) {
      this.conversations[userId] = [];
    }

    this.conversations[userId].push({ role: "user", content: prompt });

    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: `You are an AI assistant specialized in creating and managing blockchain agents. When a user requests to create an agent, guide them through the process step by step. Ask for specific requirements and generate the necessary code and instructions to create a functional agent. Always format your responses using Markdown for better readability. 

Current available agent types:
1. Smart Contract Agent: Creates and deploys smart contracts
2. Token Management Agent: Handles token creation and management
3. DApp Interaction Agent: Interacts with decentralized applications

When creating an agent, always include:
1. A brief description of the agent's functionality
2. Step-by-step instructions for setup
3. Sample code (if applicable)
4. Deployment instructions
5. Usage examples` },
          ...this.conversations[userId]
        ],
        max_tokens: 1000
      });

      const aiResponse = response.choices[0].message.content.trim();
      this.conversations[userId].push({ role: "assistant", content: aiResponse });

      if (this.conversations[userId].length > 10) {
        this.conversations[userId] = this.conversations[userId].slice(-10);
      }

      return marked.parse(aiResponse); // Convert Markdown to HTML
    } catch (error) {
      console.error('Error generating AI response:', error);
      throw error;
    }
  }

  async processMessage(userId, message) {
    console.log('Processing message for user:', userId);
    console.log('Message:', message);

    try {
      const response = await this.generateResponse(userId, message);
      console.log('AI response:', response);
      return [{ agent: { name: 'System', id: 'system' }, message: response }];
    } catch (error) {
      console.error('Error in processMessage:', error);
      throw error;
    }
  }
}

module.exports = new AIService();

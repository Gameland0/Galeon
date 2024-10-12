const OpenAI = require("openai");

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async createChatCompletion(messages, model = "gpt-4o-mini", maxTokens = 1500) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: model,
        messages: messages,
        max_tokens: maxTokens
      });

      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error in createChatCompletion:', error);
      throw error;
    }
  }

  async analyzeTextComplexity(message, context) {
    try {
      const completion = await this.createChatCompletion([
        { role: "system", content: "You are an AI assistant tasked with analyzing the complexity of user requests." },
        { role: "user", content: `Analyze the following message and determine if it requires a simple response or a complex task decomposition. Consider the context of the conversation and the nature of the request. Respond with "Simple" if it's a straightforward question or request that doesn't require extensive processing or task breakdown. Respond with "Complex" if it involves multiple steps, requires significant changes, or needs a detailed explanation or implementation.

        Context: ${context.map(msg => `${msg.sender}: ${msg.content}`).join('\n')}
        
        Message: ${message}
        
        Classification (Simple/Complex):` }
      ], "gpt-4o-mini", 1);

      return completion.toLowerCase().includes('simple');
    } catch (error) {
      console.error('Error analyzing text complexity:', error);
      // 如果 API 调用失败，我们默认认为是复杂请求
      return false;
    }
  }

  async summarizeContent(content) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an AI assistant tasked with summarizing web content. Provide a concise summary of the main points and key information." },
          { role: "user", content: `Please summarize the following content:\n\n${content}` }
        ],
        max_tokens: 500
      });

      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error in summarizeContent:', error);
      throw error;
    }
  }

}

module.exports = new OpenAIService();

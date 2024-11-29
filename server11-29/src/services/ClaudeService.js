const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async createChatCompletion(messages, model = "claude-3-sonnet-20240229", maxTokens = 1500) {
    try {
      // 整理消息格式
      const formattedMessages = this.formatMessages(messages);

      // Claude API 调用
      const completion = await this.anthropic.messages.create({
        model: model,
        max_tokens: maxTokens,
        messages: formattedMessages,
        temperature: 0.7,
        system: this.extractSystemMessage(messages),
      });

      // 确保返回格式与 OpenAI 一致
      return this.formatResponse(completion);
    } catch (error) {
      console.error('Error in Claude chat completion:', error);
      if (error.status === 429) {
        return await this.handleRateLimitError(messages, model, maxTokens);
      }
      throw error;
    }
  }

  extractSystemMessage(messages) {
    const systemMessage = messages.find(msg => msg.role === 'system');
    return systemMessage ? systemMessage.content : '';
  }

  formatMessages(messages) {
    // 移除 system message，因为 Claude 使用单独的 system 参数
    return messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: this.mapRole(msg.role),
        content: msg.content
      }));
  }

  mapRole(role) {
    const roleMap = {
      'user': 'user',
      'assistant': 'assistant',
      'system': 'assistant',
      'agent': 'assistant'
    };
    return roleMap[role.toLowerCase()] || 'user';
  }

  formatResponse(completion) {
    // 确保返回的格式与 OpenAI 一致
    return completion.content[0].text;
  }

  async handleRateLimitError(messages, model, maxTokens) {
    console.log('Rate limit hit, retrying in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    return this.createChatCompletion(messages, model, maxTokens);
  }

  // 模仿 OpenAI 的文本复杂度分析
  async analyzeTextComplexity(text, context = []) {
    try {
      const response = await this.createChatCompletion([
        {
          role: 'system',
          content: 'Analyze if the following text requires a complex response with multiple steps or a simple direct answer. Respond with only the word COMPLEX or SIMPLE.'
        },
        { role: 'user', content: text }
      ], "claude-3-sonnet-20240229", 100);

      return response.toLowerCase().includes('simple');
    } catch (error) {
      console.error('Error analyzing text complexity:', error);
      return false;
    }
  }
}

module.exports = new ClaudeService();

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  // async createChatCompletion(messages, model = "claude-3-sonnet-20240229", maxTokens = 1500) {
  //   try {
  //     // 整理消息格式
  //     const formattedMessages = this.formatMessages(messages);
  //     // console.log('formattedMessages:',formattedMessages);
  //     // Claude API 调用
  //     const completion = await this.anthropic.messages.create({
  //       model: model,
  //       max_tokens: maxTokens,
  //       messages: formattedMessages,
  //       temperature: 0.7,
  //       system: this.extractSystemMessage(messages),
  //     });

  //     // 确保返回格式与 OpenAI 一致
  //     return this.formatResponse(completion);
  //   } catch (error) {
  //     console.error('Error in Claude chat completion:', error);
  //     if (error.status === 429) {
  //       return await this.handleRateLimitError(messages, model, maxTokens);
  //     }
  //     throw error;
  //   }
  // }

  // async createChatCompletion(messages, model = "claude-3-sonnet-20240229", maxTokens = 1500) {
  //   try {
  //     // 提取agent的信息
  //     const agentInfo = this.extractAgentInfo(messages);

  //     // 根据agent角色构建提示词
  //     const prompt = this.buildPromptByRole(agentInfo);
      
  //     // 构建Claude消息数组
  //     const formattedMessages = [
  //       {
  //         role: 'user',
  //         content: `${prompt}\n\nRequest: ${messages[messages.length - 1].content}`
  //       }
  //     ];

  //     const completion = await this.anthropic.messages.create({
  //       model: model,
  //       max_tokens: maxTokens,
  //       messages: formattedMessages,
  //       temperature: 0.7
  //     });

  //     return this.formatResponse(completion);
  //   } catch (error) {
  //     console.error('Error in Claude chat completion:', error);
  //     throw error;
  //   }
  // }

  async createChatCompletion(messages, model = "claude-3-sonnet-20240229", maxTokens = 1500) {
    try {
      // Claude期望消息是一个自然的对话形式
      const userMessage = messages[messages.length - 1];

      const completion = await this.anthropic.messages.create({
        model: model,
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: userMessage.content
        }],
        temperature: 0.7,
      });

      return completion.content[0].text;
    } catch (error) {
      console.error('Error in Claude chat completion:', error);
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

  extractAgentInfo(messages) {
    const systemMessage = messages.find(msg => msg.role === 'system');
    const agentInfo = {
      name: '',
      description: '',
      role: '',
      type: '',
      knowledge: '',
      capabilities: []
    };

    if (systemMessage) {
      const content = systemMessage.content;
      
      // 提取agent名称
      const nameMatch = content.match(/You are ([^,]+)/);
      if (nameMatch) agentInfo.name = nameMatch[1];

      // 提取描述
      const descMatch = content.match(/description: ([^\.]+)/);
      if (descMatch) agentInfo.description = descMatch[1];

      // 提取角色
      const roleMatch = content.match(/role is ([^\.]+)/);
      if (roleMatch) agentInfo.role = roleMatch[1];

      // 提取知识库内容
      const knowledgeMatch = content.match(/Relevant knowledge:\s*([^]*?)(?=\n\n|$)/);
      if (knowledgeMatch) agentInfo.knowledge = knowledgeMatch[1];
    }

    return agentInfo;
  }

  buildPromptByRole(agentInfo) {
    // 根据不同角色构建特定的提示词
    const rolePrompts = {
      'solidity_developer': `As an expert Solidity developer ${agentInfo.name}, your task is to:
- Write secure and optimized Solidity smart contracts
- Follow best practices for gas optimization
- Implement proper security measures
- Document the code clearly
- Consider edge cases and potential vulnerabilities`,

      'rust_developer': `As a Rust developer specializing in Solana programs ${agentInfo.name}, your task is to:
- Develop secure and efficient Solana programs using Rust
- Implement proper program architecture
- Follow Solana programming best practices
- Ensure proper error handling and validation
- Optimize for performance and account structure`,

      'frontend_developer': `As a frontend developer ${agentInfo.name}, you should:
- Create responsive and intuitive user interfaces
- Implement web3 integration properly
- Follow React/Web3 best practices
- Consider user experience and accessibility
- Ensure proper error handling and loading states`,

      'security_expert': `As a blockchain security expert ${agentInfo.name}, your focus is on:
- Identifying potential vulnerabilities in smart contracts
- Suggesting security improvements
- Following security best practices
- Performing thorough code reviews
- Considering attack vectors and edge cases`
    };

    // 获取角色特定的提示词,如果没有则使用通用提示词
    const rolePrompt = rolePrompts[agentInfo.role.toLowerCase()] || 
      `As ${agentInfo.name} with role ${agentInfo.role}, apply your expertise in ${agentInfo.description}`;

    // 添加知识库内容
    return `${rolePrompt}\n\nUse this knowledge in your response:\n${agentInfo.knowledge}`;
  }

  formatResponse(completion) {
    return completion.content[0].text;
  }

}

module.exports = new ClaudeService();

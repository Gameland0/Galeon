const DatabaseService = require('./databaseService');
const OpenAIService = require('./openaiService');
const LangChainService = require('./langchainService');
const VectorService = require('./vectorService');
const FunctionService = require('./functionService');
const UUID = require('uuid');


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

  async updateAgent(agentId, userId, agentData) {
    console.log('[MCP Debug] updateAgent called with:', { agentId, userId, agentData });
    const updateFields = [];
    const updateValues = [];
    
    // 只更新提供的字段
    if (agentData.name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(agentData.name);
    }
    if (agentData.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(agentData.description);
    }
    if (agentData.type !== undefined) {
      updateFields.push('type = ?');
      updateValues.push(agentData.type);
    }
    if (agentData.role !== undefined) {
      updateFields.push('role = ?');
      updateValues.push(agentData.role);
    }
    if (agentData.model !== undefined) {
      updateFields.push('model = ?');
      updateValues.push(agentData.model);
    }
    if (agentData.mcp_enabled !== undefined) {
      updateFields.push('mcp_enabled = ?');
      updateValues.push(agentData.mcp_enabled);
      console.log('[MCP Debug] Setting mcp_enabled to:', agentData.mcp_enabled);
    }
    if (agentData.custom_prompt !== undefined) {
      updateFields.push('custom_prompt = ?');
      updateValues.push(agentData.custom_prompt);
      console.log('[CustomPrompt] Setting custom_prompt to:', agentData.custom_prompt ? '(defined)' : '(null)');
    }

    if (updateFields.length === 0) {
      return { affectedRows: 0 };
    }
    
    updateValues.push(agentId, userId);
    
    const query = `UPDATE agents SET ${updateFields.join(', ')} WHERE id = ? AND owner = ?`;
    console.log('[MCP Debug] SQL query:', query);
    console.log('[MCP Debug] SQL values:', updateValues);
    
    const result = await DatabaseService.query(query, updateValues);
    console.log('[MCP Debug] Update result:', result);
    
    return result;
  }

  async updateAgentHash(agentId, userId, transactionHash) {
    return DatabaseService.query(
      'UPDATE agents SET transaction_hash = ? WHERE id = ? AND owner = ?',
      [transactionHash, agentId, userId]
    );
  }

  async getAgentResponse(agentId, message, context, instruction, userId = null) {
    try {
      console.log(`[AgentService] Processing message for agent ${agentId}: "${message.substring(0, 50)}..."`);
      
      const agent = await this.getAgentById(agentId);
      if (!agent) {
        console.error(`Agent with id ${agentId} not found`);
        throw new Error(`Agent not found`);
      }

      // 1. 获取相关知识（使用RAG）
      const relevantKnowledge = await this.getRelevantKnowledge(agentId, message);
      
      // 2. 构建Agent专业提示词
      const agentExpertise = this.buildAgentExpertisePrompt(agent, message, instruction);
      
      let fullPrompt = agentExpertise;
      
      // 3. 特殊指令处理
      if (instruction === 'Generate code') {
        const agentSpecialization = this.detectAgentSpecialization(agent);
        const requestedTech = this.detectRequestedTechnology(message);
        
        if (this.isTechMismatch(agentSpecialization, requestedTech)) {
          fullPrompt += `\n\n专业提示: 基于你的专业领域 ${agentSpecialization}，如果用户要求的是 ${requestedTech} 技术，你应该：
1. 说明你的专业领域与用户需求的差异
2. 提供你能力范围内的建议或替代方案
3. 如果坚持要求，可以提供基础框架但建议寻找相应专家`;
        } else if (requestedTech === 'solana' && agentSpecialization.includes('solana')) {
        fullPrompt += `\n\nPlease use Anchor-SPL v0.27+ CpiContext style for initialize_mint and mint_to when generating Solana contract code.`;
        }
      }
      
      // 4. 添加相关知识
      if (relevantKnowledge) {
        fullPrompt += `\n\nRelevant knowledge: ${relevantKnowledge}`;
      }
      
      // 5. 获取Agent可用的函数
      const enabledFunctions = await FunctionService.getAgentFunctions(agentId);
      const openAIFunctions = FunctionService.getOpenAIFunctions(enabledFunctions);
      
      console.log(`[AgentService] Agent ${agentId} has ${openAIFunctions.length} available functions`);

      // 6. 构建消息历史
      const messages = [
        { role: 'system', content: fullPrompt }
      ];
      
      // 添加对话历史
      if (Array.isArray(context)) {
        context.forEach(msg => {
          messages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.content
          });
        });
      }
      
      // 添加当前消息
      messages.push({ role: 'user', content: message });

      // 7. 调用OpenAI（支持Function Calling）
      let response;
      
      if (instruction === 'Generate code') {
        // 代码生成使用LangChain
        response = await LangChainService.generateCode(fullPrompt, context.existingCode || "", context.preferredLanguage || "");
      } else if (instruction === 'Review code') {
        response = await LangChainService.reviewCode(message);
      } else if (instruction === 'Apply code review') {
        const { code, review } = message;
        response = await LangChainService.applyCodeReview(code, review);
      } else {
        // 普通对话支持Function Calling
        response = await this.callOpenAIWithFunctions(messages, openAIFunctions, agentId, userId);
      }

      console.log(`[AgentService] Successfully generated response for agent ${agentId}`);
      return response;
      
    } catch (error) {
      console.error(`[AgentService] Error in getAgentResponse for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * 调用OpenAI并处理Function Calling
   */
  async callOpenAIWithFunctions(messages, functions, agentId, userId, maxIterations = 3) {
    let currentMessages = [...messages];
    let iteration = 0;
    
    while (iteration < maxIterations) {
      try {
        console.log(`[AgentService] OpenAI call iteration ${iteration + 1}/${maxIterations}`);
        
        // 构建OpenAI请求参数
        const requestParams = {
          model: 'gpt-3.5-turbo',
          messages: currentMessages,
          temperature: 0.7,
          max_tokens: 1000
        };
        
        // 如果有可用函数，添加function calling支持
        if (functions && functions.length > 0) {
          requestParams.functions = functions;
          requestParams.function_call = 'auto';
        }
        
        // 调用OpenAI API
        const completion = await OpenAIService.createChatCompletionWithFunctions(requestParams);
        const responseMessage = completion.choices[0].message;
        
        // 检查是否需要调用函数
        if (responseMessage.function_call) {
          console.log(`[AgentService] Function call requested: ${responseMessage.function_call.name}`);
          
          // 解析函数调用
          const functionCall = FunctionService.parseFunctionCall(responseMessage.function_call);
          
          // 执行函数
          const functionResult = await FunctionService.executeFunction(
            functionCall.name,
            functionCall.parameters,
            agentId,
            userId
          );
          
          // 将函数调用和结果添加到消息历史
          currentMessages.push({
            role: 'assistant',
            content: null,
            function_call: responseMessage.function_call
          });
          
          currentMessages.push({
            role: 'function',
            name: functionCall.name,
            content: JSON.stringify(functionResult)
          });
          
          iteration++;
          continue; // 继续下一轮对话
        } else {
          // 没有函数调用，返回最终响应
          console.log(`[AgentService] Final response generated after ${iteration + 1} iterations`);
          return responseMessage.content;
        }
        
      } catch (error) {
        console.error(`[AgentService] Error in OpenAI call iteration ${iteration + 1}:`, error);
        
        if (iteration === 0) {
          // 第一次就失败，抛出错误
          throw error;
        } else {
          // 后续迭代失败，返回错误信息
          return `抱歉，在执行功能时遇到了问题：${error.message}`;
        }
      }
    }
    
    // 达到最大迭代次数
    console.warn(`[AgentService] Reached maximum iterations (${maxIterations}) for agent ${agentId}`);
    return '对话过程中调用了多个功能，已达到处理上限。请重新开始对话。';
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
      console.log(`[AgentService] Updating knowledge for agent ${agentId}`);
      
      // 1. 使用新的向量化存储
      await VectorService.addDocument(agentId, trainingData, 'training_data', {
        uploadedAt: new Date().toISOString(),
        source: 'agent_training'
      });
      
      // 2. 保持原有的关键词存储（作为备用）
      const keywords = await this.extractKeywords(trainingData);
      for (const keyword of keywords) {
        await DatabaseService.query(
          'INSERT INTO agent_knowledge (agent_id, key_phrase, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
          [agentId, keyword, trainingData]
        );
      }
      
      console.log(`[AgentService] Successfully updated knowledge for agent ${agentId}`);
      
    } catch (error) {
      console.error('Error in updateAgentKnowledge:', error);
      throw error;
    }
  }

  async getRelevantKnowledge(agentId, message) {
    try {
      // 检查Agent是否启用向量检索
      const agent = await this.getAgentById(agentId);
      if (agent && agent.vector_enabled) {
        console.log(`[AgentService] Using vector search for agent ${agentId}`);
        
        // 使用向量检索
        const vectorResults = await VectorService.searchSimilar(agentId, message, 5, 0.7);
        
        if (vectorResults.length > 0) {
          const relevantTexts = vectorResults.map(result => 
            `[Similarity: ${(result.similarity * 100).toFixed(1)}%] ${result.text}`
          );
          
          console.log(`[AgentService] Found ${vectorResults.length} relevant vector chunks`);
          return relevantTexts.join('\n\n');
        }
      }
      
      // 回退到原始关键词匹配
      console.log(`[AgentService] Using keyword search for agent ${agentId}`);
      const keywords = await this.extractKeywords(message);
      const query = `SELECT content FROM agent_knowledge WHERE agent_id = ? AND key_phrase IN (${keywords.map(() => '?').join(', ')}) LIMIT 5`;
      const results = await DatabaseService.query(query, [agentId, ...keywords]);
      return results.map(row => row.content).join('\n\n');
      
    } catch (error) {
      console.error(`[AgentService] Error getting relevant knowledge for agent ${agentId}:`, error);
      // 出错时回退到关键词搜索
      const keywords = await this.extractKeywords(message);
      const query = `SELECT content FROM agent_knowledge WHERE agent_id = ? AND key_phrase IN (${keywords.map(() => '?').join(', ')}) LIMIT 5`;
      const results = await DatabaseService.query(query, [agentId, ...keywords]);
      return results.map(row => row.content).join('\n\n');
    }
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

  buildAgentExpertisePrompt(agent, message, instruction) {
    // 🔧 构建包含agent完整信息的智能prompt
    const agentInfo = {
      name: agent.name || 'AI Agent',
      role: agent.role || 'Assistant',
      description: agent.description || 'General AI assistant',
      goal: agent.goal || 'Provide helpful assistance'
    };
    
    // 基于agent描述和角色构建专业prompt
    let basePrompt = `You are ${agentInfo.name}, a specialized ${agentInfo.role}.
    
Professional Background:
${agentInfo.description}

Your Goal: ${agentInfo.goal}

Core Competencies:
- Expertise in ${agentInfo.role.replace(/_/g, ' ')} domain
- Deep understanding of ${this.extractTechStack(agentInfo.description)}
- Commitment to professional standards and best practices

Instructions:
1. Always stay within your area of expertise as described above
2. If a request falls outside your specialization, acknowledge this professionally
3. Provide alternative suggestions or refer to appropriate specialists when needed
4. Use your specialized knowledge to deliver high-quality, accurate responses
5. Maintain professional demeanor consistent with your role`;

    if (instruction) {
      basePrompt += `\n\nCurrent Task Type: ${instruction}`;
    }

    return basePrompt;
  }

  detectAgentSpecialization(agent) {
    // 🔧 基于agent的role和description检测专业领域
    const role = (agent.role || '').toLowerCase();
    const description = (agent.description || '').toLowerCase();
    const combined = `${role} ${description}`;
    
    // 技术栈映射
    const techMapping = {
      'solana': ['solana', 'rust', 'anchor', 'spl'],
      'ethereum': ['ethereum', 'solidity', 'evm', 'smart contract'],
      'bitcoin': ['bitcoin', 'lightning'],
      'frontend': ['frontend', 'react', 'vue', 'angular', 'javascript', 'typescript'],
      'backend': ['backend', 'node', 'python', 'java', 'api'],
      'mobile': ['mobile', 'ios', 'android', 'react native', 'flutter'],
      'ai': ['ai', 'machine learning', 'deep learning', 'neural network'],
      'security': ['security', 'audit', 'vulnerability', 'penetration']
    };
    
    // 检测匹配的技术栈
    const detectedTechs = [];
    for (const [tech, keywords] of Object.entries(techMapping)) {
      if (keywords.some(keyword => combined.includes(keyword))) {
        detectedTechs.push(tech);
      }
    }
    
    return detectedTechs.length > 0 ? detectedTechs.join(', ') : 'general';
  }

  detectRequestedTechnology(message) {
    // 🔧 检测用户请求中的技术栈
    const msg = message.toLowerCase();
    
    // 技术栈关键词映射
    const techKeywords = {
      'solana': ['solana', 'spl token', 'anchor', 'rust program'],
      'ethereum': ['ethereum', 'solidity', 'smart contract', 'evm'],
      'bitcoin': ['bitcoin', 'btc', 'lightning'],
      'frontend': ['frontend', 'react', 'vue', 'html', 'css', 'javascript'],
      'backend': ['backend', 'api', 'server', 'database'],
      'mobile': ['mobile app', 'ios', 'android', 'app development'],
      'ai': ['ai', 'machine learning', 'neural network'],
      'security': ['security audit', 'vulnerability', 'penetration test']
    };
    
    // 检测消息中的技术栈
    for (const [tech, keywords] of Object.entries(techKeywords)) {
      if (keywords.some(keyword => msg.includes(keyword))) {
        return tech;
      }
    }
    
    return 'general';
  }

  isTechMismatch(agentSpecialization, requestedTech) {
    // 🔧 判断agent专业领域与用户请求是否不匹配
    if (!agentSpecialization || !requestedTech || requestedTech === 'general') {
      return false; // 通用请求不算不匹配
    }
    
    const agentTechs = agentSpecialization.split(', ');
    
    // 如果agent专精包含请求的技术，则匹配
    if (agentTechs.includes(requestedTech)) {
      return false;
    }
    
    // 特殊情况：一些技术栈有关联性
    const relatedTechs = {
      'solana': ['rust'],
      'ethereum': ['solidity', 'frontend'], // 以太坊开发者通常也懂前端
      'frontend': ['backend'], // 全栈开发者
      'backend': ['frontend']
    };
    
    // 检查是否有相关技术栈
    for (const agentTech of agentTechs) {
      if (relatedTechs[agentTech] && relatedTechs[agentTech].includes(requestedTech)) {
        return false; // 有相关技术，不算完全不匹配
      }
    }
    
    return true; // 技术栈不匹配
  }

  extractTechStack(description) {
    // 🔧 从描述中提取技术栈信息
    if (!description) return 'various technologies';
    
    const techPatterns = [
      /(?:specializes?|expert|proficient)\s+in\s+([^,.\n]+)/gi,
      /(?:using|with|technologies?)\s*:?\s*([^,.\n]+)/gi,
      /(?:rust|solana|solidity|ethereum|javascript|python|react|vue|angular)/gi
    ];
    
    const extractedTechs = [];
    for (const pattern of techPatterns) {
      const matches = description.match(pattern);
      if (matches) {
        extractedTechs.push(...matches);
      }
    }
    
    return extractedTechs.length > 0 ? extractedTechs.join(', ') : 'blockchain and development technologies';
  }

  // ============ 新增：向量功能管理方法 ============

  /**
   * 启用Agent的向量检索功能
   * @param {number} agentId - Agent ID
   */
  async enableVectorSearch(agentId) {
    try {
      await DatabaseService.query(
        'UPDATE agents SET vector_enabled = TRUE WHERE id = ?',
        [agentId]
      );
      console.log(`[AgentService] Enabled vector search for agent ${agentId}`);
      return true;
    } catch (error) {
      console.error(`[AgentService] Error enabling vector search for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * 禁用Agent的向量检索功能
   * @param {number} agentId - Agent ID
   */
  async disableVectorSearch(agentId) {
    try {
      await DatabaseService.query(
        'UPDATE agents SET vector_enabled = FALSE WHERE id = ?',
        [agentId]
      );
      console.log(`[AgentService] Disabled vector search for agent ${agentId}`);
      return true;
    } catch (error) {
      console.error(`[AgentService] Error disabling vector search for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * 获取Agent的向量统计信息
   * @param {number} agentId - Agent ID
   */
  async getAgentVectorStats(agentId) {
    try {
      const stats = await VectorService.getAgentVectorStats(agentId);
      return stats;
    } catch (error) {
      console.error(`[AgentService] Error getting vector stats for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * 清除Agent的所有向量数据
   * @param {number} agentId - Agent ID
   */
  async clearAgentVectors(agentId) {
    try {
      const deletedCount = await VectorService.deleteAgentVectors(agentId);
      console.log(`[AgentService] Cleared ${deletedCount} vectors for agent ${agentId}`);
      return deletedCount;
    } catch (error) {
      console.error(`[AgentService] Error clearing vectors for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * 批量训练Agent（从现有knowledge迁移到向量）
   * @param {number} agentId - Agent ID
   */
  async migrateToVectorStorage(agentId) {
    try {
      console.log(`[AgentService] Starting vector migration for agent ${agentId}`);

      // 获取现有知识
      const existingKnowledge = await DatabaseService.query(
        'SELECT DISTINCT content FROM agent_knowledge WHERE agent_id = ?',
        [agentId]
      );

      if (existingKnowledge.length === 0) {
        console.log(`[AgentService] No existing knowledge found for agent ${agentId}`);
        return { migrated: 0 };
      }

      // 合并所有内容并向量化
      const allContent = existingKnowledge.map(row => row.content).join('\n\n');
      await VectorService.addDocument(agentId, allContent, 'knowledge_migration', {
        migratedAt: new Date().toISOString(),
        originalEntriesCount: existingKnowledge.length
      });

      // 启用向量搜索
      await this.enableVectorSearch(agentId);

      console.log(`[AgentService] Successfully migrated ${existingKnowledge.length} knowledge entries for agent ${agentId}`);
      return { migrated: existingKnowledge.length };

    } catch (error) {
      console.error(`[AgentService] Error migrating to vector storage for agent ${agentId}:`, error);
      throw error;
    }
  }

  // ============ 新增：Agent定价系统方法 ============

  /**
   * 设置Agent价格
   * @param {number} agentId - Agent ID
   * @param {string} userId - 用户地址
   * @param {number} price - 价格（credits）
   */
  async setAgentPrice(agentId, userId, price) {
    try {
      // 验证价格
      if (price < 0) {
        throw new Error('Price cannot be negative');
      }

      // 验证所有权
      const agent = await this.getAgentById(agentId);
      if (!agent || agent.owner.toLowerCase() !== userId.toLowerCase()) {
        throw new Error('Only agent owner can set price');
      }

      // 更新价格
      await DatabaseService.query(
        'UPDATE agents SET price = ? WHERE id = ? AND owner = ?',
        [price, agentId, userId]
      );

      console.log(`[AgentService] Set price ${price} for agent ${agentId}`);
      return { success: true, price };
    } catch (error) {
      console.error(`[AgentService] Error setting price for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * 获取Agent价格
   * @param {number} agentId - Agent ID
   */
  async getAgentPrice(agentId) {
    try {
      const results = await DatabaseService.query(
        'SELECT price FROM agents WHERE id = ?',
        [agentId]
      );
      return results[0]?.price || 0;
    } catch (error) {
      console.error(`[AgentService] Error getting price for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * 增加Agent调用次数和收益
   * @param {number} agentId - Agent ID
   * @param {number} price - 本次调用价格
   */
  async incrementAgentStats(agentId, price) {
    try {
      await DatabaseService.query(
        'UPDATE agents SET total_calls = total_calls + 1, total_earnings = total_earnings + ? WHERE id = ?',
        [price, agentId]
      );
      console.log(`[AgentService] Incremented stats for agent ${agentId}: price=${price}`);
    } catch (error) {
      console.error(`[AgentService] Error incrementing stats for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * 获取Agent统计信息
   * @param {number} agentId - Agent ID
   */
  async getAgentStats(agentId) {
    try {
      const results = await DatabaseService.query(
        'SELECT total_calls, total_earnings FROM agents WHERE id = ?',
        [agentId]
      );
      return results[0] || { total_calls: 0, total_earnings: 0 };
    } catch (error) {
      console.error(`[AgentService] Error getting stats for agent ${agentId}:`, error);
      throw error;
    }
  }

  // ============ Agent Rating System Methods ============

  /**
   * Rate an agent
   * @param {number} agentId - Agent ID
   * @param {string} userId - User wallet address
   * @param {number} rating - Rating value (1-5)
   * @param {string} comment - Optional comment
   */
  async rateAgent(agentId, userId, rating, comment = null) {
    try {
      // Validate rating
      if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      // Check if user has already rated this agent
      const existingRating = await DatabaseService.query(
        'SELECT id FROM agent_ratings WHERE agent_id = ? AND user_id = ?',
        [agentId, userId]
      );

      if (existingRating.length > 0) {
        // Update existing rating
        await DatabaseService.query(
          'UPDATE agent_ratings SET rating = ?, comment = ?, updated_at = NOW() WHERE agent_id = ? AND user_id = ?',
          [rating, comment, agentId, userId]
        );
      } else {
        // Insert new rating
        await DatabaseService.query(
          'INSERT INTO agent_ratings (id, agent_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
          [UUID.v4(), agentId, userId, rating, comment]
        );
      }

      // Recalculate average rating
      await this.updateAgentAverageRating(agentId);

      console.log(`[AgentService] User ${userId} rated agent ${agentId} with ${rating} stars`);
      return { success: true, rating };
    } catch (error) {
      console.error(`[AgentService] Error rating agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Update agent's average rating
   * @param {number} agentId - Agent ID
   */
  async updateAgentAverageRating(agentId) {
    try {
      const stats = await DatabaseService.query(
        'SELECT AVG(rating) as avg_rating, COUNT(*) as rating_count FROM agent_ratings WHERE agent_id = ?',
        [agentId]
      );

      const avgRating = stats[0].avg_rating || 0;
      const ratingCount = stats[0].rating_count || 0;

      await DatabaseService.query(
        'UPDATE agents SET average_rating = ?, rating_count = ? WHERE id = ?',
        [avgRating, ratingCount, agentId]
      );

      console.log(`[AgentService] Updated average rating for agent ${agentId}: ${avgRating.toFixed(2)} (${ratingCount} ratings)`);
    } catch (error) {
      console.error(`[AgentService] Error updating average rating for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get agent ratings
   * @param {number} agentId - Agent ID
   * @param {number} limit - Number of ratings to fetch
   */
  async getAgentRatings(agentId, limit = 10) {
    try {
      const ratings = await DatabaseService.query(
        `SELECT user_id, rating, comment, created_at, updated_at
         FROM agent_ratings
         WHERE agent_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [agentId, limit]
      );
      return ratings;
    } catch (error) {
      console.error(`[AgentService] Error getting ratings for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's rating for a specific agent
   * @param {number} agentId - Agent ID
   * @param {string} userId - User wallet address
   */
  async getUserRating(agentId, userId) {
    try {
      const results = await DatabaseService.query(
        'SELECT rating, comment FROM agent_ratings WHERE agent_id = ? AND user_id = ?',
        [agentId, userId]
      );
      return results[0] || null;
    } catch (error) {
      console.error(`[AgentService] Error getting user rating:`, error);
      throw error;
    }
  }

}

module.exports = new AgentService();

const KnowledgeGraphService = require('./knowledgeGraphService');
const VersionControlService = require('./versionControlService');
const MessageProcessingService = require('./messageProcessingService');
const DatabaseService = require('./databaseService');
const UUID = require('uuid');

class KnowledgeIntegrationService {
  constructor() {
    this.knowledgeGraphService = KnowledgeGraphService;
    this.versionControlService = VersionControlService;
    this.messageProcessingService = MessageProcessingService;
  }

  /**
   * 处理代码变更并更新知识库
   */
  async processCodeChange(code, agentId, conversationId, context) {
    try {
      // 1. 创建代码版本
      const versionData = {
        file_id: UUID.v4(),
        content: code,
        agent_id: agentId,
        commit_message: 'Code update from conversation',
        parent_version_id: await this.getLatestVersionId(conversationId)
      };

      const versionId = await VersionControlService.createVersion(versionData);

      // 2. 进行代码审查
      const reviewResult = await VersionControlService.performAICodeReview(code);

      // 3. 提取代码相关知识
      const codeKnowledge = await this.extractCodeKnowledge(code, reviewResult);

      // 4. 更新知识图谱
      await this.addKnowledgeNode({
        platform: context.platform || 'unknown',
        concept_type: 'code_implementation',
        name: `Code Version ${versionId}`,
        description: codeKnowledge.description,
        keywords: codeKnowledge.keywords
      });

      // 5. 更新代理专业度
      await KnowledgeGraphService.updateAgentExpertise(
        agentId,
        versionId,
        codeKnowledge.expertiseLevel
      );

      // 6. 关联代码版本与知识
      await this.linkCodeToKnowledge(versionId, codeKnowledge.id);

      return {
        versionId,
        reviewResult,
        codeKnowledge
      };
    } catch (error) {
      console.error('Error in processCodeChange:', error);
      throw error;
    }
  }

  /**
   * 从代码和审查结果中提取知识
   */
  async extractCodeKnowledge(code, reviewResult) {
    // 分析代码特征和模式
    const codePatterns = await this.analyzeCodePatterns(code);
    
    // 评估实现质量
    const qualityScore = this.evaluateImplementationQuality(reviewResult);
    
    // 提取关键概念和依赖
    const { concepts, dependencies } = this.extractConcepts(code);

    return {
      description: this.generateKnowledgeDescription(codePatterns, reviewResult),
      keywords: [...concepts, ...dependencies],
      expertiseLevel: qualityScore,
      id: UUID.v4()
    };
  }

  /**
   * 分析代码模式和特征
   */
  async analyzeCodePatterns(code) {
    // 识别代码中的设计模式
    const patterns = this.identifyDesignPatterns(code);
    
    // 分析算法复杂度
    const complexity = this.analyzeComplexity(code);
    
    // 检测代码重用
    const reusability = this.assessReusability(code);

    return {
      patterns,
      complexity,
      reusability
    };
  }

  /**
   * 识别代码中的设计模式
   */
  identifyDesignPatterns(code) {
    const patterns = [];
    
    // 单例模式检测
    if (code.includes('getInstance') || code.includes('private constructor')) {
      patterns.push('Singleton');
    }
    
    // 工厂模式检测
    if (code.includes('create') && code.includes('return new')) {
      patterns.push('Factory');
    }
    
    // 观察者模式检测
    if (code.includes('addEventListener') || code.includes('emit')) {
      patterns.push('Observer');
    }

    return patterns;
  }

  /**
   * 分析代码复杂度
   */
  analyzeComplexity(code) {
    let complexity = 0;
    
    // 计算循环嵌套深度
    const loops = (code.match(/for|while/g) || []).length;
    complexity += loops * 2;
    
    // 计算条件语句复杂度
    const conditions = (code.match(/if|else|switch|case/g) || []).length;
    complexity += conditions;
    
    // 函数调用深度
    const functionCalls = (code.match(/\w+\(/g) || []).length;
    complexity += functionCalls;

    return {
      cyclomaticComplexity: complexity,
      rating: this.getComplexityRating(complexity)
    };
  }

  /**
   * 评估代码可重用性
   */
  assessReusability(code) {
    let score = 100;
    
    // 检查函数长度
    const functions = code.split(/function |class /);
    functions.forEach(func => {
      if (func.length > 200) score -= 10;
    });
    
    // 检查依赖数量
    const imports = (code.match(/import |require/g) || []).length;
    score -= imports * 5;
    
    // 检查注释完整性
    const comments = (code.match(/\/\*|\*\/|\/\//g) || []).length;
    score += comments * 2;

    return {
      score,
      rating: this.getReusabilityRating(score)
    };
  }

  /**
   * 评估实现质量
   */
  evaluateImplementationQuality(reviewResult) {
    let score = 0;
    
    // 评估代码质量建议
    if (reviewResult.suggestions) {
      score -= reviewResult.suggestions.length * 5;
    }
    
    // 评估安全问题
    if (reviewResult.securityIssues) {
      score -= reviewResult.securityIssues.length * 10;
    }
    
    // 评估优化建议
    if (reviewResult.optimizationTips) {
      score -= reviewResult.optimizationTips.length * 3;
    }

    // 标准化分数
    return Math.max(0, Math.min(100, score + 100));
  }

  /**
   * 从代码中提取概念和依赖
   */
  extractConcepts(code) {
    const concepts = new Set();
    const dependencies = new Set();
    
    // 提取类名和函数名作为概念
    const classMatch = code.match(/class\s+(\w+)/g);
    if (classMatch) {
      classMatch.forEach(match => {
        concepts.add(match.split(/\s+/)[1]);
      });
    }
    
    // 提取导入的依赖
    const importMatch = code.match(/import.*from\s+['"](.*)['"]/g);
    if (importMatch) {
      importMatch.forEach(match => {
        dependencies.add(match.split(/['"]/).slice(-2)[0]);
      });
    }

    return {
      concepts: Array.from(concepts),
      dependencies: Array.from(dependencies)
    };
  }

  /**
   * 生成知识描述
   */
  generateKnowledgeDescription(codePatterns, reviewResult) {
    return `
      Implementation Patterns: ${codePatterns.patterns.join(', ')}
      Complexity: ${codePatterns.complexity.rating}
      Reusability: ${codePatterns.reusability.rating}
      Review Summary: ${reviewResult.review}
    `.trim();
  }

  /**
   * 获取最新版本ID
   */
  async getLatestVersionId(conversationId) {
    const [latestVersion] = await DatabaseService.query(
      `SELECT cv.id
       FROM code_versions cv
       JOIN code_files cf ON cv.file_id = cf.id
       WHERE cf.conversation_id = ?
       ORDER BY cv.version_number DESC
       LIMIT 1`,
      [conversationId]
    );
    
    return latestVersion?.id || null;
  }

  /**
   * 关联代码版本与知识节点
   */
  async linkCodeToKnowledge(versionId, knowledgeId) {
    await DatabaseService.query(
      `INSERT INTO code_knowledge_links (
        id, version_id, knowledge_id, created_at
      ) VALUES (?, ?, ?, NOW())`,
      [UUID.v4(), versionId, knowledgeId]
    );
  }

  /**
   * 获取复杂度等级
   */
  getComplexityRating(complexity) {
    if (complexity < 10) return 'Low';
    if (complexity < 20) return 'Medium';
    return 'High';
  }

  /**
   * 获取可重用性等级
   */
  getReusabilityRating(score) {
    if (score >= 80) return 'High';
    if (score >= 60) return 'Medium';
    return 'Low';
  }

  /**
   * 集成到消息处理流程
   */
  async enhanceMessageProcessing(message, agentId, conversationId, context) {
    // 检查消息是否包含代码
    const codeBlocks = this.extractCodeBlocks(message);
    
    if (codeBlocks.length > 0) {
      // 处理每个代码块
      const results = await Promise.all(
        codeBlocks.map(code =>
          this.processCodeChange(code, agentId, conversationId, context)
        )
      );
      
      // 更新消息处理上下文
      context.codeVersions = results.map(r => r.versionId);
      context.codeKnowledge = results.map(r => r.codeKnowledge);
      
      // 返回增强的消息处理结果
      return {
        message,
        codeResults: results,
        context
      };
    }
    
    return { message, context };
  }

  extractCodeBlocks(context) {
    const blocks = [];
    for (const msg of context) {
      if (msg.content) {
        const codeMatches = msg.content.match(/```[\s\S]*?```/g);
        if (codeMatches) {
          blocks.push(...codeMatches.map(block => 
            block.replace(/```[\w]*\n?/, '').replace(/```$/, '')
          ));
        }
      }
    }
    return blocks;
  }

  async addKnowledgeNode(node) {
    const id = UUID.v4();
    try {
      await DatabaseService.query(
        `INSERT INTO knowledge_nodes (
          id, platform, concept_type, name, description, keywords, version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [id, node.platform, node.concept_type, node.name, node.description, 
         JSON.stringify(node.keywords), 1]
      );
      return id;
    } catch (error) {
      console.error('Error adding knowledge node:', error);
      throw error;
    }
  }

  async getCodeHistory(conversationId) {
    const results = await DatabaseService.query(
      `SELECT * FROM code_files 
       WHERE conversation_id = ? 
       ORDER BY version DESC`, 
      [conversationId]
    );
    return results;
  }
  
  async getLatestCode(conversationId) {
    const [latest] = await DatabaseService.query(
      `SELECT * FROM code_files 
       WHERE conversation_id = ? 
       ORDER BY version DESC 
       LIMIT 1`,
      [conversationId]
    );
    return latest;
  }
  
}

module.exports = new KnowledgeIntegrationService();

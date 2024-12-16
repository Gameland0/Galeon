const DatabaseService = require('./databaseService');
const OpenAIService = require('./openaiService');
const ClaudeService = require('./ClaudeService');
const UUID = require('uuid');

class KnowledgeGraphService {
  // 知识基础操作
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

  // 多链平台知识管理
  async addPlatformKnowledge(platformData) {
    const id = UUID.v4();
    try {
      await DatabaseService.query(
        `INSERT INTO platform_features (
          id, platform, feature_name, description, code_examples,
          best_practices, limitations, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [id, platformData.platform, platformData.feature_name, 
         platformData.description, JSON.stringify(platformData.code_examples),
         JSON.stringify(platformData.best_practices), 
         JSON.stringify(platformData.limitations)]
      );
      return id;
    } catch (error) {
      console.error('Error adding platform knowledge:', error);
      throw error;
    }
  }

  // 知识动态更新
  async updateKnowledgeFromAgentInteraction(interaction) {
    try {
      // console.log('interaction',interaction)
      const model = interaction.agent.model;
      let analysis;

      switch (model) {
        case "gpt-3.5-turbo":
        case "gpt-4":
        case "gpt-4o":
        case "gpt-4o-mini":
          analysis = await OpenAIService.createChatCompletion([{
            role: 'system',
            content: 'Analyze this interaction for new knowledge'
          }, {
            role: 'user',
            content: interaction.content
          }]);
        case 'claude-3-opus-20240229':
        case 'claude-3-sonnet-20240229':
        case 'claude-3-haiku-20240307':
          analysis = await ClaudeService.createChatCompletion([{
            role: 'system',
            content: 'Analyze this interaction for new knowledge'
          }, {
            role: 'user',
            content: interaction.content
          }]);
        default:
          analysis = await OpenAIService.createChatCompletion([{
            role: 'system',
            content: 'Analyze this interaction for new knowledge'
          }, {
            role: 'user',
            content: interaction.content
          }]);
      }

      if (analysis) {
        // 创建新的知识节点
        const nodeId = await this.addKnowledgeNode({
          platform: interaction.platform,
          concept_type: interaction.agent.type || 'general',
          name: `Knowledge from ${interaction.agent.name}`,
          description: analysis,
          keywords: await this.extractKeywords(analysis)
        });

        // 更新agent专业度
        await this.updateAgentExpertise(
          interaction.agent.id,
          nodeId,
          analysis.confidenceLevel
        );
      }
    } catch (error) {
      console.error('Error updating knowledge from interaction:', error);
      throw error;
    }
  }

  // 代理专业度管理
  async updateAgentExpertise(agentId, knowledgeNodeId, expertiseLevel) {
    try {
      await DatabaseService.query(
        `INSERT INTO agent_expertise (
          id, agent_id, knowledge_node_id, expertise_level, 
          last_updated
        ) VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          expertise_level = expertise_level + ?,
          last_updated = NOW()`,
        [UUID.v4(), agentId, knowledgeNodeId, expertiseLevel, expertiseLevel]
      );
    } catch (error) {
      console.error('Error updating agent expertise:', error);
      throw error;
    }
  }

  // 跨链知识关联
  async linkCrossChainKnowledge(sourceNodeId, targetNodeId, relationType) {
    try {
      await DatabaseService.query(
        `INSERT INTO concept_relations (
          id, source_node_id, target_node_id, relation_type,
          weight, created_at
        ) VALUES (?, ?, ?, ?, ?, NOW())`,
        [UUID.v4(), sourceNodeId, targetNodeId, relationType, 1.0]
      );
    } catch (error) {
      console.error('Error linking cross chain knowledge:', error);
      throw error;
    }
  }

  async extractKeywords(text) {
    try {
      // 使用简单的关键词提取逻辑
      const words = text.toLowerCase()
        .split(/\W+/)
        .filter(word => word.length > 3)  // 过滤掉短词
        .filter(word => !['this', 'that', 'which', 'what'].includes(word));  // 过滤停用词
      
      // 返回前10个最常见的词作为关键词
      const wordFreq = {};
      words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      });
  
      return Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);
    } catch (error) {
      console.error('Error extracting keywords:', error);
      return [];  // 出错时返回空数组
    }
  }
  
}

module.exports = new KnowledgeGraphService();
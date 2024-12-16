const DatabaseService = require('./databaseService');
const OpenAIService = require('./openaiService');
const UUID = require('uuid');

class VersionControlService {
    // 版本管理基础功能
    async createVersion(versionData) {
      const id = UUID.v4();
      try {
        const [lastVersion] = await DatabaseService.query(
          'SELECT MAX(version_number) as max_version FROM code_versions WHERE file_id = ?',
          [versionData.file_id]
        );
        
        const versionNumber = (lastVersion?.max_version || 0) + 1;
        
        await DatabaseService.query(
          `INSERT INTO code_versions (
            id, file_id, version_number, content, agent_id,
            commit_message, review_status, created_at, parent_version_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
          [id, versionData.file_id, versionNumber, versionData.content,
           versionData.agent_id, versionData.commit_message, 'pending',
           versionData.parent_version_id]
        );
        
        // 添加版本审查任务
        await this.createCodeReview(id, versionData.agent_id);
        
        return id;
      } catch (error) {
        console.error('Error creating version:', error);
        throw error;
      }
    }
  
    // 代码审查管理
    async createCodeReview(versionId, agentId) {
      try {
        const version = await DatabaseService.query(
          'SELECT * FROM code_versions WHERE id = ?',
          [versionId]
        );
  
        if (!version[0]) throw new Error('Version not found');
  
        // 获取当前的代码内容
        const currentCode = version[0].content;
        
        // 通过AI进行代码审查
        const reviewResult = await this.performAICodeReview(currentCode);
  
        // 记录审查结果
        await DatabaseService.query(
          `INSERT INTO code_reviews (
            id, version_id, reviewer_agent_id, review_content,
            suggestions, security_issues, optimization_tips,
            status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [UUID.v4(), versionId, agentId, reviewResult.review,
           JSON.stringify(reviewResult.suggestions),
           JSON.stringify(reviewResult.securityIssues),
           JSON.stringify(reviewResult.optimizationTips),
           'completed']
        );
  
        // 更新版本状态
        await DatabaseService.query(
          'UPDATE code_versions SET review_status = ? WHERE id = ?',
          ['reviewed', versionId]
        );
  
      } catch (error) {
        console.error('Error creating code review:', error);
        throw error;
      }
    }
  
    // AI代码审查
    async performAICodeReview(code) {
      try {
        const reviewPrompt = `Review this code for:
        1. Code quality and best practices
        2. Security vulnerabilities
        3. Performance optimization opportunities
        4. Specific blockchain-related considerations
  
        Code:
        ${code}`;
  
        const analysis = await OpenAIService.createChatCompletion([
          { role: 'system', content: 'You are an expert code reviewer.' },
          { role: 'user', content: reviewPrompt }
        ]);
  
        return {
          review: analysis,
          suggestions: this.extractSuggestions(analysis),
          securityIssues: this.extractSecurityIssues(analysis),
          optimizationTips: this.extractOptimizationTips(analysis)
        };
      } catch (error) {
        console.error('Error performing AI code review:', error);
        throw error;
      }
    }
  
    // 提取建议
    extractSuggestions(analysis) {
      // 解析AI返回的内容，提取具体建议
      // 这里可以使用正则表达式或其他方法解析结构化内容
      return analysis.match(/Suggestion:.*?(?=\n|$)/g) || [];
    }
  
    extractSecurityIssues(analysis) {
      return analysis.match(/Security Issue:.*?(?=\n|$)/g) || [];
    }
  
    extractOptimizationTips(analysis) {
      return analysis.match(/Optimization:.*?(?=\n|$)/g) || [];
    }
  }
  
module.exports = new VersionControlService()
  
const AIService = require('../services/aiService');
const ipfsService = require('../services/ipfsService');
const agentService = require('../services/agentService');
const OpenAIService = require('../services/openaiService')
const axios = require('axios');
const cheerio = require('cheerio');


async function fetchUrlContent(url) {
  try {
    // 设置请求配置
    const config = {
      timeout: 10000, // 10 秒超时
      maxContentLength: 1000000, // 最大内容长度为 1MB
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };

    // 发送 GET 请求获取 URL 内容
    const response = await axios.get(url, config);

    // 使用 cheerio 解析 HTML 内容
    const $ = cheerio.load(response.data);

    // 移除脚本和样式元素
    $('script, style').remove();

    // 提取文本内容
    let text = $('body').text();

    // 清理文本（删除多余的空白字符）
    text = text.replace(/\s+/g, ' ').trim();

    // 如果文本太长，截断它
    const maxLength = 10000; // 最大字符数
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...';
    }

    return text;
  } catch (error) {
    console.error(`Error fetching content from ${url}:`, error.message);
    if (error.response) {
      // 请求已发出，但服务器响应状态码不在 2xx 范围内
      throw new Error(`Failed to fetch URL content. Status: ${error.response.status}`);
    } else if (error.request) {
      // 请求已发出，但没有收到响应
      throw new Error('No response received from the server');
    } else {
      // 设置请求时发生的错误
      throw new Error('Error setting up the request');
    }
  }
}

exports.getAgents = async (req, res) => {
  const { address } = req.params;
  try {
    const agents = await AIService.getAgents(address);
    res.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
};

exports.createAgent = async (req, res) => {
  const { name, description, type, behavior, responses, prompt } = req.body;
  try {
    // 准备要上传到IPFS的数据
    const ipfsData = JSON.stringify({ name, description, type, behavior, responses, prompt });

    // 上传到IPFS
    const ipfsHash = await ipfsService.addToIPFS(ipfsData);

    // 返回IPFS哈希给前端
    res.status(200).json({ ipfsHash });
  } catch (error) {
    console.error('Error in createAgent:', error);
    res.status(500).json({ error: 'Failed to create agent', details: error.message });
  }
};

exports.finalizeAgentCreation = async (req, res) => {
  const { id, address, name, description, type, ipfsHash, role, goal, transactionHash } = req.body;
  try {
    // 创建agent（后端存储）
    const newAgent = await AIService.createAgent(address, {
      id,
      name,
      description,
      type,
      role,
      goal,
      ipfsHash,
      transactionHash
    });

    res.status(201).json(newAgent);
  } catch (error) {
    console.error('Error finalizing agent creation:', error);
    res.status(500).json({ error: 'Failed to finalize agent creation', details: error.message });
  }
};

exports.getMarketplaceAgents = async (req, res) => {
  try {
    const agents = await AIService.getMarketplaceAgents();
    res.json(agents);
  } catch (error) {
    console.error('Error fetching marketplace agents:', error);
    res.status(500).json({ error: 'Failed to fetch marketplace agents' });
  }
};

exports.toggleAgentPublicity = async (req, res) => {
  const { agentId } = req.params;
  try {
    const result = await AIService.toggleAgentPublicity(agentId, req.userId);
    res.json(result);
  } catch (error) {
    console.error('Error toggling agent publicity:', error);
    res.status(500).json({ error: 'Failed to toggle agent publicity' });
  }
};

exports.trainAgent = async (req, res) => {
  const { agentId } = req.params;
  const { trainingData, userAddress, trainingType } = req.body;

  try {
    let processedContent = trainingData;

    if (trainingType === 'url' || trainingType === 'hyperlink') {
      // 使用 OpenAI 分析和总结 URL 内容
      const urlContent = await fetchUrlContent(trainingData);
      const summary = await OpenAIService.summarizeContent(urlContent);
      processedContent = summary;
    }

    // 上传处理后的内容到 IPFS
    const ipfsHash = await ipfsService.addToIPFS(processedContent);
    
    // 添加训练数据到数据库
    const result = await AIService.addTrainingData(agentId, ipfsHash, userAddress);
    
    // 更新 Agent 的知识库
    await agentService.updateAgentKnowledge(agentId, processedContent);
    
    res.json({ ipfsHash, ...result, message: 'Agent training completed successfully' });
  } catch (error) {
    console.error('Error training agent:', error);
    res.status(500).json({ error: 'Failed to train agent' });
  }
};

exports.getAgentDetails = async (req, res) => {
  const { agentId } = req.params;
  try {
    const agent = await AIService.getAgentDetails(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
  } catch (error) {
    console.error('Error fetching agent details:', error);
    res.status(500).json({ error: 'Failed to fetch agent details' });
  }
};

exports.updateAgent = async (req, res) => {
  const { agentId } = req.params;
  const { name, description, type } = req.body;
  try {
    const updatedAgent = await AIService.updateAgent(agentId, req.userId, { name, description, type });
    res.json(updatedAgent);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
};

exports.deleteAgent = async (req, res) => {
  const { agentId } = req.params;
  try {
    await AIService.deleteAgent(agentId, req.userId);
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
};

exports.getAgentKnowledge = async (req, res) => {
  const { agentId } = req.params;
  try {
    const knowledge = await agentService.getAgentKnowledge(agentId);
    res.json(knowledge);
  } catch (error) {
    console.error('Error fetching agent knowledge:', error);
  res.status(500).json({ error: 'Failed to fetch agent knowledge' });
  }
};

exports.communicateWithAgent = async (req, res) => {
  const { senderId, receiverId, message } = req.body;
  try {
    const reply = await AIService.agentCommunication(senderId, receiverId, message);
    res.json({ reply });
  } catch (error) {
    console.error('Error in agent communication:', error);
    res.status(500).json({ error: 'Failed to communicate between agents' });
  }
};

exports.updateAgentRoleAndGoal = async (req, res) => {
  const { agentId } = req.params;
  const { role, goal } = req.body;
  try {
    const result = await AIService.updateAgentRoleAndGoal(agentId, role, goal);
    res.json(result);
  } catch (error) {
    console.error('Error updating agent role and goal:', error);
    res.status(500).json({ error: 'Failed to update agent role and goal' });
  }
};

exports.verifyAgent = async (req, res) => {
  const { agentId } = req.params;
  const { prompt } = req.body;

  try {
    const response = await AIService.getAgentResponse(agentId, prompt);
    res.json({ response });
  } catch (error) {
    console.error('Error verifying agent:', error);
    res.status(500).json({ error: 'Failed to verify agent' });
  }
};



const OpenAIService = require('./openaiService');
const DatabaseService = require('./databaseService');
const AgentService = require('./agentService');
const TeamService = require('./teamService');
const GeminiService = require('./geminiService');
const MessageProcessingService = require('./messageProcessingService')
const LangChainService = require('./langchainService')
const ClaudeService = require('./ClaudeService');
const NodeCache = require("node-cache");
const UUID = require('uuid');

class AIService {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 600 });
    this.conversationContexts = new Map();
    this.sharedKnowledge = new Map();
    this.roleKeywords = {
      'task_decomposer': ['decompose', 'break down', 'subtasks', 'manageable'],
      'executor': ['execute', 'complete', 'perform', 'implement'],
      'reviewer': ['review', 'evaluate', 'feedback', 'assess'],
      'planner': ['plan', 'strategy', 'goal', 'comprehensive'],
      'researcher': ['research', 'gather', 'analyze', 'synthesize'],
      'problem_solver': ['solve', 'issue', 'solution', 'identify'],
      'innovator': ['innovate', 'creative', 'novel', 'idea'],
      'analyst': ['analyze', 'data', 'pattern', 'conclusion'],
      'communicator': ['communicate', 'convey', 'clarify', 'audience'],
      'coordinator': ['coordinate', 'organize', 'synchronize', 'project'],
      'quality_assurance': ['quality', 'reliability', 'defect', 'prevent'],
      'mentor': ['guide', 'advise', 'support', 'development'],
      'frontend_developer': ['frontend', 'UI', 'client-side', 'interface'],
      'backend_developer': ['backend', 'server-side', 'database', 'integration'],
      'full_stack_developer': ['full stack', 'frontend', 'backend', 'end-to-end'],
      'ui_designer': ['UI', 'design', 'interface', 'visual'],
      'ux_researcher': ['UX', 'user', 'behavior', 'need'],
      'data_scientist': ['data', 'analyze', 'interpret', 'insight'],
      'security_expert': ['security', 'risk', 'vulnerability', 'mitigate'],
      'devops_engineer': ['DevOps', 'streamline', 'collaboration', 'deployment'],
      'product_manager': ['product', 'success', 'cross-functional', 'improvement']
    };
    this.taskContexts = [
      'Decentralized Application (DApp)',
      'Smart Contract',
      'Blockchain Protocol',
      'Token Economy',
      'Decentralized Finance (DeFi)',
      'Non-Fungible Token (NFT)',
      'Cross-Chain Technology',
      'Layer 2 Scaling Solutions',
      'Consensus Mechanism',
      'Cryptocurrency Wallet',
      'Decentralized Identity System',
      'Decentralized Storage',
      'Blockchain Games',
      'Decentralized Exchange (DEX)',
      'Oracle Service'
    ];
  }

  async processMessage(userId, message, agentId, conversationId) {
    try {
      return await MessageProcessingService.processMessage(userId, message, agentId, conversationId);
    } catch (error) {
      console.error('AIService: Error in processMessage:', error);
      throw error;
    }
  }
  
  async processTeamMessage(userId, message, teamId, conversationId) {
    try {
      const team = await TeamService.getTeamById(teamId);
      if (!team) {
        throw new Error(`Team with id ${teamId} not found`);
      }
  
      await DatabaseService.saveConversation(userId, conversationId, null, 'user', message);
  
      const context = this.getConversationContext(conversationId);
      const shouldDecompose = await MessageProcessingService.shouldDecomposeTask(message, context);
  
      let response;
      if (shouldDecompose) {
        let taskDecomposition;
        let decompositionSource = 'OpenAI';  // 默认设置为 OpenAI
  
        const taskDecomposer = team.agents.find(agent => agent.role === 'task_decomposer');
        if (taskDecomposer && await this.verifyAgentCapability(taskDecomposer, 'task_decomposition')) {
          try {
            taskDecomposition = await MessageProcessingService.decomposeTask(taskDecomposer.id, message, context);
            if (taskDecomposition && taskDecomposition.length > 0) {
              decompositionSource = 'team';
            }
          } catch (error) {
            console.warn('Team decomposition failed:', error);
          }
        }
  
        if (!taskDecomposition || taskDecomposition.length === 0) {
          console.log('Falling back to OpenAI for task decomposition');
          taskDecomposition = await this.getOpenAIDecomposition(message);
        }
  
        if (!taskDecomposition || taskDecomposition.length === 0) {
          throw new Error('Failed to decompose task with both team and OpenAI');
        }
  
        const workflowId = await this.initializeWorkflow(taskDecomposition, team.agents);
        const combinedResponse = this.synthesizeTaskDecomposition(taskDecomposition, team.agents);
  
        const decompositionExplanation = decompositionSource === 'team' 
          ? `Task decomposed by the team's task_decomposer.` 
          : `Task decomposed by OpenAI as no team agent could successfully decompose it.`;
  
        response = {
          content: `${decompositionExplanation} Task has been decomposed and assigned to the team.`,
          agent: null,
          taskDecomposition: combinedResponse
        };
      } else {
        const aiResponse = await MessageProcessingService.processSimpleMessage(message, team, context);
        response = {
          content: aiResponse,
          agent: null
        };
      }
  
      this.updateConversationContext(conversationId, { role: 'assistant', content: response.content });
      await DatabaseService.saveConversation(userId, conversationId,null, 'agent', response.content);
  
      return response;
    } catch (error) {
      console.error('Error in processTeamMessage:', error);
      throw error;
    }
  }
  
  getConversationContext(conversationId) {
    return this.conversationContexts.get(conversationId) || [];
  }

  updateConversationContext(conversationId, message) {
    let context = this.getConversationContext(conversationId);
    context.push(message);
    if (context.length > 10) {
      context = context.slice(-10);
    }
    this.conversationContexts.set(conversationId, context);
  }

  synthesizeTaskDecomposition(taskDecomposition, teamAgents) {
    return {
      message: `Task has been decomposed into the following subtasks:`,
      tasks: taskDecomposition.map(task => ({
        description: task.description,
        agentType: task.agentType,
        requiredSkills: task.requiredSkills,
        assignedAgent: teamAgents.find(agent => this.isAgentSuitable(agent, task)) ?? null
      }))
    };
  }

  isAgentSuitable(agent, task) {
    return agent.type === task.agentType && task.requiredSkills.every(skill => agent.skills.includes(skill));
  }

  async initializeWorkflow(tasks, agents) {
    const workflowId = UUID.v4();
    const workflowTasks = tasks.map((task, index) => ({
      workflowId,
      taskId: task.id || index + 1,
      agentId: agents[index % agents.length].id,
      status: 'pending',
      order: index
    }));

    await DatabaseService.query(
      `INSERT INTO workflow_tasks (workflow_id, task_id, agent_id, status, \`order\`) VALUES ${workflowTasks.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
      workflowTasks.flatMap(task => [task.workflowId, task.taskId, task.agentId, task.status, task.order])
    );

    return workflowId;
  }

  async getNextAgent(workflowId) {
    const results = await DatabaseService.query(
      'SELECT agent_id FROM workflow_tasks WHERE workflow_id = ? AND status = "pending" ORDER BY `order` LIMIT 1',
      [workflowId]
    );
    if (results.length === 0) {
      return null;
    }
    return AgentService.getAgentById(results[0].agent_id);
  }

  async getWorkflowContext(workflowId) {
    const results = await DatabaseService.query(
      'SELECT a.name, wt.result FROM workflow_tasks wt JOIN agents a ON wt.agent_id = a.id WHERE wt.workflow_id = ? AND wt.status = "completed" ORDER BY wt.`order`',
      [workflowId]
    );
    return results.map(r => `${r.name}: ${r.result}`).join('\n');
  }

  async updateWorkflowStatus(workflowId, agentId, result) {
    return DatabaseService.query(
      'UPDATE workflow_tasks SET status = "completed", result = ? WHERE workflow_id = ? AND agent_id = ? AND status = "pending" ORDER BY `order` LIMIT 1',
      [result, workflowId, agentId]
    );
  }

  async refineTaskDecomposition(conversationId, taskDecomposition) {
    const context = this.getConversationContext(conversationId);
    const systemMessage = `You are an AI assistant refining a task decomposition for web development. 
    Review the current decomposition and suggest improvements or additional subtasks if necessary.`;

    const response = await OpenAIService.createChatCompletion([
      { role: "system", content: systemMessage },
      ...context,
      { role: "user", content: `Refine this task decomposition: ${JSON.stringify(taskDecomposition)}` }
    ], "gpt-4o-mini", 1500);

    const refinedDecomposition = JSON.parse(response);
    await DatabaseService.saveTaskDecomposition(conversationId, refinedDecomposition);

    return refinedDecomposition;
  }

  // Methods delegating to other services
  async getAgents(userId) {
    return AgentService.getAgents(userId);
  }

  async createAgent(userId, agentData) {
    return AgentService.createAgent(userId,agentData);
  }

  async getMarketplaceAgents() {
    return AgentService.getMarketplaceAgents();
  }

  async toggleAgentPublicity(agentId, userId) {
    return AgentService.toggleAgentPublicity(agentId, userId);
  }

  async getAgentDetails(agentId) {
    const agent = await AgentService.getAgentById(agentId);
    if (!agent) {
      return null;
    }
    const trainingData = await AgentService.getAgentTrainingData(agentId);
    return { ...agent, trainingData };
  }

  async updateAgent(agentId, userId, agentData) {
    return AgentService.updateAgent(agentId, userId, agentData);
  }

  async addTrainingData(agentId, ipfsHash, userAddress) {
    const result = await AgentService.addTrainingData(agentId, ipfsHash, userAddress);
    const content = await this.getFromIPFS(ipfsHash);
    await AgentService.storeKnowledge(agentId, content);
    return result;
  }

  async getFromIPFS(ipfsHash) {
    // This method should be implemented to fetch content from IPFS
    // For now, we'll return a placeholder
    return `Content for IPFS hash: ${ipfsHash}`;
  }

  async createTeam(userId, name, description, agents) {
    return TeamService.createTeam(userId, name, description, agents);
  }

  async getTeams(userId) {
    return TeamService.getTeams(userId);
  }

  async updateTeam(teamId, userId, teamData) {
    return TeamService.updateTeam(teamId, userId, teamData);
  }

  async deleteTeam(teamId, userId) {
    return TeamService.deleteTeam(teamId, userId);
  }

  async agentCommunication(senderId, receiverId, message, conversationId) {
    return MessageProcessingService.agentCommunication(senderId, receiverId, message, conversationId);
  }

  async updateAgentRoleAndGoal(agentId, role, goal) {
    return AgentService.updateAgentRoleAndGoal(agentId, role, goal);
  }

  async getAgentResponse(agentId, message, context, instruction) {
    const agent = await AgentService.getAgentById(agentId);
    if (!agent) {
      throw new Error(`Agent not found`);
    }

    const relevantKnowledge = await this.getRelevantKnowledge(agentId, message);
    const rolePrompt = this.getRoleBasedPrompt(agent.role, instruction);
    const fullPrompt = `${rolePrompt}\n\nRelevant knowledge: ${relevantKnowledge}\n\nTask: ${message}`;

    let response;
    switch(agent.model) {
      case 'gpt-3.5-turbo':
      case 'gpt-4':
      case 'gpt-4o-mini':
        response = await OpenAIService.createChatCompletion([
          { role: 'system', content: fullPrompt },
          ...context.map(msg => ({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.content })),
          { role: 'user', content: message }
        ], agent.model);
        break;
      case 'claude-3-opus-20240229':
      case 'claude-3-sonnet-20240229':
      case 'claude-3-haiku-20240307':
        response = await ClaudeService.createChatCompletion([
          { role: 'system', content: fullPrompt },
          ...context.map(msg => ({ 
            role: msg.sender === 'user' ? 'user' : 'assistant', 
            content: msg.content 
          })),
          { role: 'user', content: message }
        ], agent.model);
        break;
      case 'gemini-pro':
        response = await GeminiService.generateContent(fullPrompt + '\n\n' + message);
        break;
      default:
        response = await OpenAIService.createChatCompletion([
          { role: 'system', content: fullPrompt },
          ...context.map(msg => ({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.content })),
          { role: 'user', content: message }
        ]);
    }

    return response;
  }


  getRoleBasedPrompt(role, instruction) {
    const prompts = {
      'task_decomposer': "You are a task decomposition specialist. Your job is to break down complex tasks into manageable subtasks.",
      'executor': "You are responsible for executing tasks. Provide detailed steps for completing the given task.",
      'reviewer': "As a reviewer, your role is to critically evaluate the work done and provide constructive feedback.",
      'planner': "You are a strategic planner. Your role is to create comprehensive plans and strategies for achieving goals.",
      'researcher': "As a researcher, your job is to gather, analyze, and synthesize information on given topics.",
      'problem_solver': "You are a problem-solving expert. Your role is to identify issues and propose effective solutions.",
      'innovator': "You are an innovator tasked with generating creative and novel ideas to address challenges.",
      'analyst': "As an analyst, your role is to examine data, identify patterns, and draw meaningful conclusions.",
      'communicator': "You are a communication specialist. Your job is to convey information clearly and effectively to various audiences.",
      'coordinator': "As a coordinator, your role is to organize and synchronize different aspects of a project or task.",
      'quality_assurance': "You are responsible for ensuring the quality and reliability of work. Your job is to identify and prevent defects or issues.",
      'mentor': "As a mentor, your role is to guide, advise, and support others in their tasks and development.",
      'frontend_developer': "You are a frontend developer specializing in creating user interfaces and client-side functionality.",
      'backend_developer': "As a backend developer, your role is to work on server-side logic, databases, and application integration.",
      'full_stack_developer': "You are a full stack developer capable of working on both frontend and backend aspects of web development.",
      'ui_designer': "As a UI designer, your job is to create intuitive and visually appealing user interfaces.",
      'ux_researcher': "You are a UX researcher responsible for understanding user needs, behaviors, and motivations.",
      'data_scientist': "As a data scientist, your role is to analyze and interpret complex data to help make informed decisions.",
      'security_expert': "You are a security expert tasked with identifying and mitigating potential security risks and vulnerabilities.",
      'devops_engineer': "As a DevOps engineer, your job is to streamline development processes and improve collaboration between development and operations teams.",
      'product_manager': "You are a product manager responsible for guiding the success of a product and leading the cross-functional team that is responsible for improving it."
    };
  
    return `${prompts[role] || "You are an AI assistant."} ${instruction}`;
  }

  getRolePrompt(role) {
    const prompts = {
      'task_decomposer': "You are a task decomposition specialist. Your job is to break down complex tasks into manageable subtasks.",
      'executor': "You are responsible for executing tasks. Provide detailed steps for completing the given task.",
      'reviewer': "As a reviewer, your role is to critically evaluate the work done and provide constructive feedback.",
      'planner': "You are a strategic planner. Your role is to create comprehensive plans and strategies for achieving goals.",
      'researcher': "As a researcher, your job is to gather, analyze, and synthesize information on given topics.",
      'problem_solver': "You are a problem-solving expert. Your role is to identify issues and propose effective solutions.",
      'innovator': "You are an innovator tasked with generating creative and novel ideas to address challenges.",
      'analyst': "As an analyst, your role is to examine data, identify patterns, and draw meaningful conclusions.",
      'communicator': "You are a communication specialist. Your job is to convey information clearly and effectively to various audiences.",
      'coordinator': "As a coordinator, your role is to organize and synchronize different aspects of a project or task.",
      'quality_assurance': "You are responsible for ensuring the quality and reliability of work. Your job is to identify and prevent defects or issues.",
      'mentor': "As a mentor, your role is to guide, advise, and support others in their tasks and development.",
      'frontend_developer': "You are a frontend developer specializing in creating user interfaces and client-side functionality.",
      'backend_developer': "As a backend developer, your role is to work on server-side logic, databases, and application integration.",
      'full_stack_developer': "You are a full stack developer capable of working on both frontend and backend aspects of web development.",
      'ui_designer': "As a UI designer, your job is to create intuitive and visually appealing user interfaces.",
      'ux_researcher': "You are a UX researcher responsible for understanding user needs, behaviors, and motivations.",
      'data_scientist': "As a data scientist, your role is to analyze and interpret complex data to help make informed decisions.",
      'security_expert': "You are a security expert tasked with identifying and mitigating potential security risks and vulnerabilities.",
      'devops_engineer': "As a DevOps engineer, your job is to streamline development processes and improve collaboration between development and operations teams.",
      'product_manager': "You are a product manager responsible for guiding the success of a product and leading the cross-functional team that is responsible for improving it."
    };
    return prompts[role] || "You are an AI assistant.";
  }

  async processSubtasks(subtasks, agents, context) {
    let finalResponse = 'Task processing results:\n\n';
    for (const subtask of subtasks) {
      const appropriateAgent = this.findAppropriateAgent(agents, subtask);
      if (appropriateAgent) {
        const result = await this.getAgentResponse(appropriateAgent.id, subtask, context, 'Complete this subtask');
        finalResponse += `${appropriateAgent.role}: ${result}\n\n`;
      } else {
        finalResponse += `No appropriate agent found for subtask: ${subtask}\n\n`;
      }
    }
    return { content: finalResponse };
  }

  getSharedKnowledge(agentId) {
    return this.sharedKnowledge.get(agentId) || '';
  }

  updateSharedKnowledge(agentId, newKnowledge) {
    const currentKnowledge = this.getSharedKnowledge(agentId);
    const updatedKnowledge = `${currentKnowledge}\n${newKnowledge}`.trim();
    this.sharedKnowledge.set(agentId, updatedKnowledge);
  }

  findAppropriateAgent(agents, subtask) {
    const roleKeywords = {
      'task_decomposer': ['decompose', 'break down', 'subtasks', 'manageable'],
      'executor': ['execute', 'complete', 'perform', 'implement'],
      'reviewer': ['review', 'evaluate', 'feedback', 'assess'],
      'planner': ['plan', 'strategy', 'goal', 'comprehensive'],
      'researcher': ['research', 'gather', 'analyze', 'synthesize'],
      'problem_solver': ['solve', 'issue', 'solution', 'identify'],
      'innovator': ['innovate', 'creative', 'novel', 'idea'],
      'analyst': ['analyze', 'data', 'pattern', 'conclusion'],
      'communicator': ['communicate', 'convey', 'clarify', 'audience'],
      'coordinator': ['coordinate', 'organize', 'synchronize', 'project'],
      'quality_assurance': ['quality', 'reliability', 'defect', 'prevent'],
      'mentor': ['guide', 'advise', 'support', 'development'],
      'frontend_developer': ['frontend', 'UI', 'client-side', 'interface'],
      'backend_developer': ['backend', 'server-side', 'database', 'integration'],
      'full_stack_developer': ['full stack', 'frontend', 'backend', 'end-to-end'],
      'ui_designer': ['UI', 'design', 'interface', 'visual'],
      'ux_researcher': ['UX', 'user', 'behavior', 'need'],
      'data_scientist': ['data', 'analyze', 'interpret', 'insight'],
      'security_expert': ['security', 'risk', 'vulnerability', 'mitigate'],
      'devops_engineer': ['DevOps', 'streamline', 'collaboration', 'deployment'],
      'product_manager': ['product', 'success', 'cross-functional', 'improvement']
    };

    let bestMatch = null;
    let highestScore = 0;

    // 确保 subtask 是一个字符串
    const subtaskString = typeof subtask === 'string' ? subtask : JSON.stringify(subtask);

    for (const agent of agents) {
      if (roleKeywords[agent.role]) {
        const score = roleKeywords[agent.role].reduce((acc, keyword) => {
          const regex = new RegExp(keyword, 'gi');
          const matches = (subtaskString.match(regex) || []).length;
          return acc + matches;
        }, 0);

        if (score > highestScore) {
          highestScore = score;
          bestMatch = agent;
        }
      }
    }

    // 如果没有找到匹配的专门角色，返回执行者或第一个可用的agent
    return bestMatch || agents.find(agent => agent.role === 'executor') || agents[0] || null;
  }

  parseDecomposition(decomposition) {
    if (!decomposition) {
      return [];
    }
    try {
      const parsed = JSON.parse(decomposition);
      if (Array.isArray(parsed)) {
        return parsed.map(task => typeof task === 'string' ? { description: task } : task);
      }
    } catch (error) {
      console.warn('Failed to parse decomposition as JSON:', error);
    }

    // Fallback to simple string splitting if JSON parsing fails
    return decomposition.split('\n')
      .filter(line => line.trim())
      .map(line => ({ description: line.trim() }));
  }

  async tryDecomposition(agent, message) {
    try {
      const result = await this.getAgentResponse(
        agent.id,
        message,
        [],
        'Decompose this task into subtasks. Provide a JSON array of subtasks.'
      );
      return this.parseDecomposition(result.content);
    } catch (error) {
      console.warn(`Decomposition failed for agent ${agent.name}:`, error);
      return null;
    }
  }

  async getOpenAIDecomposition(message) {
    try {
      const result = await OpenAIService.createChatCompletion([
        { role: 'system', content: 'You are a task decomposition specialist. Break down the given task into subtasks. Provide your response as a JSON array of objects, each with "description", "agentType", and "requiredSkills" properties.' },
        { role: 'user', content: `Decompose this task into subtasks: ${message}` }
      ]);
      return MessageProcessingService.parseDecomposition(result);
    } catch (error) {
      console.error('OpenAI decomposition failed:', error);
      return null;
    }
  }
  
  evaluateTestResult(result, role, capability) {
    if (!result || typeof result !== 'string' || result.trim().length === 0) {
      return false;
    }

    const roleKeywords = this.roleKeywords[role];
    return roleKeywords.some(keyword => result.toLowerCase().includes(keyword.toLowerCase()));
  }

  async verifyAgentCapability(agent, capability) {
    const roleKeywords = {
      'task_decomposer': ['decompose', 'break down', 'subtasks', 'manageable'],
      'executor': ['execute', 'complete', 'perform', 'implement'],
      'reviewer': ['review', 'evaluate', 'feedback', 'assess'],
      'planner': ['plan', 'strategy', 'goal', 'comprehensive'],
      'researcher': ['research', 'gather', 'analyze', 'synthesize'],
      'problem_solver': ['solve', 'issue', 'solution', 'identify'],
      'innovator': ['innovate', 'creative', 'novel', 'idea'],
      'analyst': ['analyze', 'data', 'pattern', 'conclusion'],
      'communicator': ['communicate', 'convey', 'clarify', 'audience'],
      'coordinator': ['coordinate', 'organize', 'synchronize', 'project'],
      'quality_assurance': ['quality', 'reliability', 'defect', 'prevent'],
      'mentor': ['guide', 'advise', 'support', 'development'],
      'frontend_developer': ['frontend', 'UI', 'client-side', 'interface'],
      'backend_developer': ['backend', 'server-side', 'database', 'integration'],
      'full_stack_developer': ['full stack', 'frontend', 'backend', 'end-to-end'],
      'ui_designer': ['UI', 'design', 'interface', 'visual'],
      'ux_researcher': ['UX', 'user', 'behavior', 'need'],
      'data_scientist': ['data', 'analyze', 'interpret', 'insight'],
      'security_expert': ['security', 'risk', 'vulnerability', 'mitigate'],
      'devops_engineer': ['DevOps', 'streamline', 'collaboration', 'deployment'],
      'product_manager': ['product', 'success', 'cross-functional', 'improvement']
    };

    // 1. 检查 agent 的角色是否匹配所需能力
    if (!roleKeywords[agent.role] || !roleKeywords[agent.role].includes(capability)) {
      console.log(`Agent ${agent.name} role does not match required capability ${capability}`);
      return false;
    }

    // 2. 检查 agent 的训练数据
    try {
      const trainingData = await AgentService.getAgentTrainingData(agent.id);
      const hasRelevantTraining = trainingData.some(data => 
        roleKeywords[agent.role].some(keyword => 
          data.content.toLowerCase().includes(keyword.toLowerCase())
        )
      );
      if (!hasRelevantTraining) {
        console.log(`Agent ${agent.name} lacks relevant training data for ${capability}`);
        return false;
      }
    } catch (error) {
      console.error(`Error checking training data for agent ${agent.name}:`, error);
      return false;
    }

    // 3. 动态能力测试
    try {
      const testResult = await this.performCapabilityTest(agent, capability);
      if (!testResult) {
        console.log(`Agent ${agent.name} failed the capability test for ${capability}`);
        return false;
      }
    } catch (error) {
      console.error(`Error in capability test for agent ${agent.name}:`, error);
      return false;
    }

    console.log(`Agent ${agent.name} verified for capability ${capability}`);
    return true;
  }

  getActionVerb(capability) {
    const verbMap = {
      'decompose': 'Break down',
      'break down': 'Decompose',
      'subtasks': 'Divide',
      'manageable': 'Organize',
      'execute': 'Implement',
      'complete': 'Finish',
      'perform': 'Carry out',
      'implement': 'Develop',
      'review': 'Evaluate',
      'evaluate': 'Assess',
      'feedback': 'Provide feedback on',
      'assess': 'Review',
      'plan': 'Strategize',
      'strategy': 'Plan',
      'goal': 'Set objectives for',
      'comprehensive': 'Create a thorough plan for',
      // ... 可以为其他能力添加更多动词映射
    };

    return verbMap[capability] || capability;
  }

  getTaskObject(role, context) {
    const taskObjects = {
      'task_decomposer': `the process of building a ${context}`,
      'executor': `a key feature of the ${context}`,
      'reviewer': `the design and implementation of a ${context}`,
      'planner': `the development roadmap for a ${context}`,
      'researcher': `the current state and future trends of ${context}`,
      'problem_solver': `a critical issue in ${context} implementation`,
      'innovator': `a novel approach to enhance ${context}`,
      'analyst': `the performance metrics of a ${context}`,
      'communicator': `the benefits and challenges of ${context} to stakeholders`,
      'coordinator': `the various aspects of a ${context} project`,
      'quality_assurance': `the reliability and security aspects of a ${context}`,
      'mentor': `a team working on ${context} development`,
      'frontend_developer': `the user interface for a ${context}`,
      'backend_developer': `the server-side logic for a ${context}`,
      'full_stack_developer': `both frontend and backend components of a ${context}`,
      'ui_designer': `an intuitive interface for a ${context}`,
      'ux_researcher': `user interactions with a ${context}`,
      'data_scientist': `data patterns in ${context} usage`,
      'security_expert': `potential vulnerabilities in a ${context}`,
      'devops_engineer': `the deployment pipeline for a ${context}`,
      'product_manager': `the product strategy for a ${context}`
    };

    return taskObjects[role] || `a ${context} related task`;
  }

  async decomposeTaskWithLangChain(task) {
    try {
      return await LangChainService.decomposeTask(task);
    } catch (error) {
      console.error('Error in decomposeTaskWithLangChain:', error);
      throw error;
    }
  }

  async createLangChainAgent(agentData) {
    try {
      const langChainAgent = await LangChainService.createAgent(agentData);
      const savedAgent = await AgentService.createAgent({
        ...agentData,
        capabilities: langChainAgent.capabilities
      });
      return savedAgent;
    } catch (error) {
      console.error('Error in createLangChainAgent:', error);
      throw error;
    }
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

  async deleteAgent(agentId, userId) {
    try {
      const agent = await AgentService.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }
      
      if (agent.owner.toLowerCase() !== userId.toLowerCase()) {
        throw new Error('Unauthorized to delete this agent');
      }
      await AgentService.deleteAgent(agentId);
      return true;
    } catch (error) {
      console.error('Error in deleteAgent:', error);
      throw error;
    }
  }
  
}

module.exports = new AIService();
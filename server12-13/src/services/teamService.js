const DatabaseService = require("./databaseService");
const AIService = require("./aiService");
const agentService = require("./agentService");
const LangChainService = require("./langchainService");
const MessageProcessingService = require("./messageProcessingService");
const ModelService = require("./modelService");
const OpenAIService = require("./openaiService");
const CreditService = require("./creditService")
const UUID = require("uuid");

class TeamService {
  async createTeam(
    userId,
    name,
    description,
    agents,
    transactionHash,
    teamId,
    chainid
  ) {
    // const teamId = UUID.v4();
    await DatabaseService.query(
      "INSERT INTO teams (name, description, created_by, transaction_hash, chainid, teamid) VALUES (?, ?, ?, ?, ?, ?)",
      [name, description, userId, transactionHash, chainid, teamId]
    );
    await this.addAgentsToTeam(teamId, agents);
    return this.getTeamById(teamId);
  }

  async addAgentsToTeam(teamId, agents) {
    const values = agents.map((agent) => [teamId, agent.id, agent.role]);
    return DatabaseService.query(
      "INSERT INTO team_agents (team_id, agent_id, role) VALUES ?",
      [values]
    );
  }

  async getTeams(userId) {
    try {
      const teams = await DatabaseService.query(
        `SELECT t.*, 
         (SELECT COUNT(*) FROM team_agents WHERE team_id = t.id) as agent_count
         FROM teams t 
         WHERE t.created_by = ?`,
        [userId]
      );

      return teams.map((team) => ({
        ...team,
        canAddMoreAgents: team.agent_count < 5,
      }));
    } catch (error) {
      console.error("Error in getTeams:", error);
      throw error;
    }
  }

  async getTeamById(teamId) {
    const [team] = await DatabaseService.query(
      "SELECT * FROM teams WHERE teamid = ?",
      [teamId]
    );

    if (!team) {
      return null;
    }

    const agents = await DatabaseService.query(
      `SELECT a.*, ta.role 
       FROM agents a 
       JOIN team_agents ta ON a.id = ta.agent_id
       WHERE ta.team_id = ?`,
      [teamId]
    );

    return {
      ...team,
      agents,
      canAddMoreAgents: agents.length < 5,
    };
  }

  async updateTeam(
    teamId,
    userId,
    { name, description, agents, transactionHash }
  ) {
    await DatabaseService.query(
      "UPDATE teams SET name = ?, description = ?, transaction_hash = ? WHERE teamid = ? AND created_by = ?",
      [name, description, transactionHash, teamId, userId]
    );
    await this.removeAgentsFromTeam(teamId);
    await this.addAgentsToTeam(teamId, agents);
    return this.getTeamById(teamId);
  }

  async removeAgentsFromTeam(teamId) {
    return DatabaseService.query("DELETE FROM team_agents WHERE team_id = ?", [
      teamId,
    ]);
  }

  async deleteTeam(teamId, userId) {
    return DatabaseService.query(
      "DELETE FROM teams WHERE teamid = ? AND created_by = ?",
      [teamId, userId]
    );
  }

  async updateTeamAgentRoles(teamId, agentRoles) {
    const values = agentRoles.map((ar) => [teamId, ar.agentId, ar.role]);
    return DatabaseService.query(
      "INSERT INTO team_agents (team_id, agent_id, role) VALUES ? ON DUPLICATE KEY UPDATE role = VALUES(role)",
      [values]
    );
  }

  async checkTeamCapabilities(teamId, decomposedTasks) {
    const results = await DatabaseService.query(
      "SELECT a.type FROM agents a JOIN team_agents ta ON a.id = ta.agent_id WHERE ta.team_id = ?",
      [teamId]
    );
    const teamCapabilities = new Set(results.map((r) => r.type));
    const missingCapabilities = decomposedTasks
      .map((task) => task.type)
      .filter((type) => !teamCapabilities.has(type));
    return {
      canHandleAllTasks: missingCapabilities.length === 0,
      missingCapabilities,
    };
  }

  async processTeamTask(teamId, task, context) {
    const team = await this.getTeamById(teamId);
    if (!team) throw new Error("Team not found");

    const taskDecomposer = team.agents.find(
      (agent) => agent.role === "task_decomposer"
    );
    if (!taskDecomposer)
      throw new Error("Task decomposer not found in the team");

    const subtasks = await AIService.getAgentResponse(
      taskDecomposer.id,
      task,
      context,
      "Decompose this task into subtasks"
    );

    const results = [];
    for (const subtask of subtasks) {
      const appropriateAgent = this.findAppropriateAgent(team.agents, subtask);
      if (appropriateAgent) {
        const result = await AIService.getAgentResponse(
          appropriateAgent.id,
          subtask,
          context,
          "Complete this subtask"
        );
        results.push({ role: appropriateAgent.role, content: result });
      } else {
        results.push({
          role: "unassigned",
          content: `No appropriate agent found for subtask: ${subtask}`,
        });
      }
    }

    return results;
  }

  async decomposeTask(agentId, task, context) {
    const response = await AIService.getAgentResponse(
      agentId,
      `Decompose this task into subtasks: ${task}`,
      context
    );
    return JSON.parse(response.content);
  }

  async processAgentTask(agentId, input, context) {
    return await AIService.getAgentResponse(
      agentId,
      `Process this input: ${input}`,
      context
    );
  }

  async getAgentResponse(agentId, message, context) {
    return await AIService.getAgentResponse(agentId, message, context);
  }

  getRoleKeywords(role) {
    const keywordMap = {
      task_decomposer: ["decompose", "analyze", "break down"],
      executor: ["execute", "implement", "perform"],
      reviewer: ["review", "evaluate", "assess"],
      // ... 添加其他角色的关键词
    };
    return keywordMap[role] || [];
  }

  async executeLangChainTeamTask(teamId, task) {
    const team = await this.getTeamById(teamId);
    const subtasks = await LangChainService.decomposeTask(task);
    // 这里可以添加分配任务给团队成员的逻辑
    const result = { team, task, subtasks };
    await this.saveTaskResult(teamId, task, result);
    return result;
  }

  async saveTaskResult(teamId, task, result) {
    const query = `
      INSERT INTO team_tasks (team_id, task, result)
      VALUES (?, ?, ?)
    `;
    await DatabaseService.query(query, [teamId, task, JSON.stringify(result)]);
  }

  // async processTeamMessage(userId, message, teamId, conversationId) {
  //   const team = await this.getTeamById(teamId);
  //   if (!team || !team.agents || team.agents.length === 0) {
  //     throw new Error("Team not found or has no agents");
  //   }

  //   if (!conversationId) {
  //     conversationId = UUID.v4();
  //   }
  //   const fileNameMatch = message.match(
  //     /simulateBattle\.js|review\s+([\w.-]+)/i
  //   );
  //   let relevantCode = "";
  //   let targetAgentId = null;

  //   if (fileNameMatch) {
  //     const fileName = fileNameMatch[1] || "simulateBattle.js";

  //     // 查询最新版本的代码文件
  //     const codeFile = await DatabaseService.query(
  //       `SELECT cf.*, a.role as agent_role, a.id as agent_id
  //          FROM code_files cf
  //          LEFT JOIN agents a ON cf.agent_id = a.id
  //          WHERE cf.conversation_id = ? 
  //          AND cf.file_name LIKE ?
  //          ORDER BY cf.version DESC
  //          LIMIT 1`,
  //       [conversationId, `%${fileName}%`]
  //     );

  //     if (codeFile && codeFile.length > 0) {
  //       relevantCode = codeFile[0].content;
  //       // 找到对应角色的智能体来处理请求
  //       targetAgentId = await this.findAppropriateAgent(
  //         team.agents,
  //         codeFile[0].agent_role
  //       );

  //       // 将代码文件信息添加到上下文
  //       await DatabaseService.saveConversation(
  //         userId,
  //         conversationId,
  //         targetAgentId,
  //         "system",
  //         `Previous version of ${fileName}:\n\`\`\`${codeFile[0].language}\n${codeFile[0].content}\n\`\`\``
  //       );
  //     }
  //   }

  //   // await DatabaseService.saveConversation(userId, conversationId, null, 'user', message);
  //   const context = await DatabaseService.getConversationHistory(
  //     userId,
  //     conversationId
  //   );
  //   await this.storeMessage(userId, conversationId, "user", message);

  //   try {
  //     const teamKnowledge = await Promise.all(
  //       team.agents.map(async (agent) => {
  //         const knowledge = await MessageProcessingService.getRelevantKnowledge(
  //           agent.id,
  //           message
  //         );
  //         return `Agent ${agent.name} (${agent.role}) knowledge:\n${knowledge}\n`;
  //       })
  //     );
  //     const combinedKnowledge = teamKnowledge.join("\n");

  //     const blockchainPlatform = this.detectBlockchainPlatform(
  //       message,
  //       context
  //     );
  //     const gameType = LangChainService.detectGameType(message);
  //     const processedResponse = await LangChainService.processMessage(
  //       `${message}${
  //         relevantCode ? `\n\nPrevious code:\n${relevantCode}` : ""
  //       }`,
  //       team,
  //       context,
  //       combinedKnowledge,
  //       blockchainPlatform
  //     );
  //     await this.storeMessage(
  //       userId,
  //       conversationId,
  //       "system",
  //       processedResponse.response
  //     );
  //     let creditsToConsume = 0;
  //     let taskCount = 0;
  //     if (processedResponse.needsDecomposition) {
  //       const results = await this.executeDecomposedTasks(
  //         userId,
  //         processedResponse.taskDecomposition,
  //         team,
  //         context,
  //         conversationId,
  //         blockchainPlatform,
  //         gameType
  //       );
  //       await this.storeMessage(
  //         userId,
  //         conversationId,
  //         "system",
  //         JSON.stringify({
  //           content: processedResponse.response,
  //           taskDecomposition: processedResponse.taskDecomposition,
  //         })
  //       );

  //       const taskDecomposition = {
  //         message: "Task has been decomposed and analyzed for team assignment.",
  //         tasks: processedResponse.taskDecomposition.map((task) => {
  //           const assignedAgent = team.agents.find(
  //             (agent) => agent.id * 1 === task.assignedAgentId * 1
  //           );
  //           return {
  //             description: task.description,
  //             assignedAgent: assignedAgent
  //               ? {
  //                   id: assignedAgent.id,
  //                   name: assignedAgent.name,
  //                   role: assignedAgent.role,
  //                 }
  //               : null,
  //             agentType: task.agentType,
  //             requiredSkills: task.requiredSkills,
  //             status: assignedAgent ? "assigned" : "unassigned",
  //             expectedOutput: task.expected_output,
  //           };
  //         }),
  //       };
  //       taskCount = processedResponse.taskDecomposition.length;
  //       creditsToConsume = team.agents.length + taskCount;
  //       // console.log('taskDecomposition:',taskDecomposition);
  //       await DatabaseService.consumeCredits({
  //         userId,
  //         amount: creditsToConsume,
  //         teamId,
  //         conversationId,
  //         type: "TEAM_DECOMPOSE",
  //         taskCount,
  //       });
  //       return {
  //         content: processedResponse.response,
  //         taskDecomposition: taskDecomposition,
  //         results: results,
  //         conversationId,
  //       };
  //     } else {
  //       await agentService.updateAgentKnowledge(
  //         team.agents[0].agentid,
  //         processedResponse.response
  //       );
  //       await this.storeMessage(
  //         userId,
  //         conversationId,
  //         "system",
  //         processedResponse.response
  //       );
  //       await DatabaseService.consumeCredits({
  //         userId,
  //         amount: 1,
  //         teamId,
  //         conversationId,
  //         type: "TEAM_SIMPLE",
  //         taskCount,
  //       });
  //       return {
  //         content: LangChainService.formatResponse(processedResponse.response),
  //         conversationId,
  //         agent: team.agents[0],
  //       };
  //     }
  //   } catch (error) {
  //     console.error("Error in processTeamMessage:", error);
  //     throw error;
  //   }
  // }

  async processTeamMessage(userId, message, teamId, conversationId) {
    try {
      const team = await this.getTeamById(teamId);
      if (!team || !team.agents || team.agents.length === 0) {
        throw new Error("Team not found or has no agents");
      }
  
      // Generate new conversation ID if needed
      if (!conversationId) {
        conversationId = UUID.v4();
      }
  
      const context = await DatabaseService.getConversationHistory(userId, conversationId);
      await this.storeMessage(userId, conversationId, "user", message);
  
      try {
        // Get team member knowledge and combine it
        const teamKnowledge = await Promise.all(
          team.agents.map(async (agent) => {
            const knowledge = await MessageProcessingService.getRelevantKnowledge(
              agent.id,
              message
            );
            return `Agent ${agent.name} (${agent.role}) knowledge:\n${knowledge}\n`;
          })
        );
        const combinedKnowledge = teamKnowledge.join("\n");
  
        // Detect relevant platforms and game type
        const blockchainPlatform = this.detectBlockchainPlatform(message, context);
        const gameType = LangChainService.detectGameType(message);
  
        // Process message through LangChain
        const processedResponse = await LangChainService.processMessage(
          message,
          team,
          context,
          combinedKnowledge,
          blockchainPlatform
        );
  
        // Store system response
        await this.storeMessage(userId, conversationId, "system", processedResponse.response);
  
        // Handle task decomposition if needed
        if (processedResponse.needsDecomposition) {
          // Execute decomposed tasks
          const taskCount = processedResponse.taskDecomposition.length;
          const usercredits = await CreditService.getCreditbyId(userId)
          if (usercredits*1 < taskCount*1) {
            throw new Error('Insufficient credits');
          }
          const results = await this.executeDecomposedTasks(
            userId,
            processedResponse.taskDecomposition,
            team,
            context, 
            conversationId,
            blockchainPlatform,
            gameType
          );
  
          // Store task decomposition
          const taskDecomposition = {
            message: "Task has been decomposed and analyzed for team assignment.",
            tasks: processedResponse.taskDecomposition.map((task) => {
              const assignedAgent = team.agents.find(
                (agent) => agent.id === task.assignedAgentId
              );
              return {
                description: task.description,
                assignedAgent: assignedAgent ? {
                  id: assignedAgent.agentid,
                  name: assignedAgent.name,
                  role: assignedAgent.role,
                } : null,
                agentType: task.agentType,
                requiredSkills: task.requiredSkills,
                status: assignedAgent ? "assigned" : "unassigned",
                expectedOutput: task.expected_output,
              };
            }),
          };
  
          // Consume credits based on task count
          
          await DatabaseService.consumeCredits({
            userId,
            amount: team.agents.length + taskCount,
            teamId,
            conversationId,
            type: "TEAM_DECOMPOSE",
            taskCount,
          });
  
          return {
            content: processedResponse.response,
            taskDecomposition,
            results,
            conversationId,
          };
        } else {
          // Handle simple response
          await agentService.updateAgentKnowledge(
            team.agents[0].id,
            processedResponse.response
          );
          
          await DatabaseService.consumeCredits({
            userId,
            amount: 1,
            teamId, 
            conversationId,
            type: "TEAM_SIMPLE",
            taskCount: 0
          });
  
          return {
            content: processedResponse.response,
            conversationId,
            agent: team.agents[0],
          };
        }
  
      } catch (error) {
        console.error("Error in team message processing:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error in processTeamMessage:", error);
      throw error;
    }
  }  

  // async storeMessage(userId, conversationId, role, content, agentId = null) {
  //   const id = UUID.v4();
  //   await DatabaseService.query(
  //     "INSERT INTO chat_history (id, user_id, conversation_id, role, content, agent_id) VALUES (?, ?, ?, ?, ?, ?)",
  //     [id, userId, conversationId, role, content, agentId]
  //   );
  // }

  async getConversationHistory(conversationId) {
    const result = await DatabaseService.query(
      "SELECT * FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversationId]
    );
    return result.map((row) => ({
      sender: row.role,
      content: row.content,
      agentId: row.agent_id,
    }));
  }

  findAppropriateAgent(agents, requiredAgentType) {
    if (typeof requiredAgentType !== "string") {
      console.warn(`Invalid agent type: ${requiredAgentType}`);
      return null;
    }

    return agents.find(
      (agent) =>
        agent.role &&
        agent.role.toLowerCase() === requiredAgentType.toLowerCase()
    );
  }

  async initializeWorkflow(tasks, agents, workflowTemplate) {
    const workflowId = UUID.v4();
    const workflowTasks = tasks.map((task, index) => ({
      workflowId,
      taskId: index + 1,
      description: task.description,
      agentType: task.agentType,
      status: "pending",
      assignedAgent: this.findAppropriateAgent(agents, task),
      dependsOn: task.dependsOn,
      workflowStep:
        LangChainService.workflowTemplates[workflowTemplate][index] || null,
    }));

    await DatabaseService.query(
      `INSERT INTO workflow_tasks (workflow_id, task_id, description, agent_type, status, assigned_agent, depends_on, workflow_step) 
       VALUES ?`,
      [
        workflowTasks.map((task) => [
          task.workflowId,
          task.taskId,
          task.description,
          task.agentType,
          task.status,
          task.assignedAgent,
          JSON.stringify(task.dependsOn),
          task.workflowStep,
        ]),
      ]
    );

    return workflowId;
  }

  async executeWorkflow(workflowId, context) {
    let allTasksCompleted = false;
    let iterations = 0;
    const maxIterations = 10; // 防止无限循环

    while (!allTasksCompleted && iterations < maxIterations) {
      const tasks = await this.getWorkflowTasks(workflowId);
      allTasksCompleted = true;

      for (const task of tasks) {
        if (task.status !== "completed" && this.canExecuteTask(task, tasks)) {
          allTasksCompleted = false;
          const result = await this.executeTask(task, context);
          await this.updateTaskStatus(task.id, "completed", result);
          context.push(`Task ${task.taskId} completed: ${result}`);
        } else if (task.status !== "completed") {
          allTasksCompleted = false;
        }
      }

      iterations++;
    }

    return this.generateWorkflowSummary(workflowId);
  }

  async executeTask(task, context) {
    // 使用LangChainService执行任务，确保输出作为下一个任务的输入
    const result = await LangChainService.executeTeamTask(
      task.description,
      context,
      task.workflowStep
    );
    return result.finalOutput;
  }

  async getWorkflowTasks(workflowId) {
    // 假设你有一个数据库或内存存储用于获取任务
    const query = `SELECT * FROM workflow_tasks WHERE workflow_id = ? ORDER BY task_id`;
    const tasks = await DatabaseService.query(query, [workflowId]);

    return tasks;
  }

  async canExecuteTask(task, tasks) {
    // 检查此任务是否依赖其他任务
    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true; // 没有依赖，可以执行
    }

    // 遍历依赖任务，确保它们已经全部完成
    for (const dependencyId of task.dependsOn) {
      const dependencyTask = tasks.find((t) => t.taskId === dependencyId);
      if (!dependencyTask || dependencyTask.status !== "completed") {
        return false; // 如果有任何一个依赖任务未完成，则不能执行
      }
    }

    return true; // 所有依赖任务都已完成，可以执行
  }

  async updateTaskStatus(taskId, status, result) {
    // 更新任务的状态和结果
    await DatabaseService.query(
      "UPDATE workflow_tasks SET status = ?, result = ?, updated_at = NOW() WHERE task_id = ?",
      [status, result, taskId]
    );
  }

  async generateWorkflowSummary(workflowId) {
    // 获取所有属于该工作流的任务
    const tasks = await DatabaseService.query(
      `SELECT task_id, description, status, result, updated_at FROM workflow_tasks WHERE workflow_id = ? ORDER BY task_id`,
      [workflowId]
    );

    // 如果没有找到任务，抛出错误
    if (!tasks || tasks.length === 0) {
      throw new Error(`No tasks found for workflow ID: ${workflowId}`);
    }

    // 初始化总结对象
    const summary = {
      workflowId,
      totalTasks: tasks.length,
      completedTasks: tasks.filter((task) => task.status === "completed")
        .length,
      pendingTasks: tasks.filter((task) => task.status !== "completed").length,
      tasksDetails: tasks.map((task) => ({
        taskId: task.task_id,
        description: task.description,
        status: task.status,
        result: task.result || "No result available",
        completedAt:
          task.status === "completed" ? task.updated_at : "Not completed yet",
      })),
    };

    // 计算工作流的总体状态
    summary.workflowStatus =
      summary.pendingTasks === 0 ? "Completed" : "In Progress";

    return summary;
  }

  isTaskExecution(message) {
    const taskKeywords = [
      "execute",
      "run",
      "perform",
      "do",
      "implement",
      "create",
      "develop",
      "build",
    ];
    return taskKeywords.some((keyword) =>
      message.toLowerCase().includes(keyword)
    );
  }

  async executeWorkflowForDecomposedTasks(
    tasks,
    team,
    recommendedWorkflow,
    context
  ) {
    let finalResult = { intermediateSteps: [], finalOutput: "" };

    for (const task of tasks) {
      try {
        console.log(`Executing subtask: ${task.description}`);
        const subtaskResult = await LangChainService.executeTeamTask(
          task.description,
          context,
          recommendedWorkflow
        );
        finalResult.intermediateSteps.push({
          task: task.description,
          result: subtaskResult,
        });
        finalResult.finalOutput += `\n\nSubtask: ${task.description}\nResult: ${subtaskResult.finalOutput}`;
      } catch (error) {
        console.error(`Error executing subtask: ${task.description}`, error);
        finalResult.intermediateSteps.push({
          task: task.description,
          error: error.message,
        });
        finalResult.finalOutput += `\n\nSubtask: ${task.description}\nError: ${error.message}`;
      }
    }

    return finalResult;
  }

  async executeSimpleTask(message, context, recommendedWorkflow) {
    try {
      const requirementsUnderstanding =
        await LangChainService.understandRequirements(message, context);

      const currentConversationId =
        context.length > 0 ? context[0].conversationId : uuidv4();

      await DatabaseService.saveConversation(
        null,
        currentConversationId,
        null,
        "system",
        JSON.stringify({
          content: "Task requirements analysis:",
          understanding: requirementsUnderstanding,
        })
      );

      return await LangChainService.executeTeamTask(
        message,
        context,
        recommendedWorkflow
      );
    } catch (error) {
      console.error("Error executing simple task:", error);
      throw error;
    }
  }

  async processSubtask(task, context, blockchainPlatform, gameType) {
    // const blockchainPlatform = this.detectBlockchainPlatform(task.description, context);
    let code;
    let review;
    let updatedCode;
    if (task.model) {
      code = await ModelService.modelGenerateCode(
        task,
        task.model,
        context,
        blockchainPlatform,
        gameType
      );
      const reviewPrompt = this.getReviewPrompt(code, blockchainPlatform, gameType);
      review = await ModelService.modelReview(task.model, reviewPrompt);
      updatedCode = await ModelService.modelUpdatedCode(
        task.model,
        code,
        review
      );
    } else {
      code = await LangChainService.generateCode(
        task.description,
        task.agentType,
        context,
        context.existingCode || "",
        blockchainPlatform,
        gameType
      );
      const reviewPrompt = this.getReviewPrompt(code, blockchainPlatform, gameType);
      review = await LangChainService.reviewCode(reviewPrompt);
      updatedCode = await LangChainService.applyCodeReview(code, review);
    }
    const initialFileId = UUID.v4();
    const fileName = this.generateFileName(code, blockchainPlatform);
    await DatabaseService.query(
      `INSERT INTO code_files (
          id, conversation_id, file_name, content, language,
          agent_id, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        initialFileId,
        context[0]?.conversationId || UUID.v4(),
        fileName,
        code,
        this.getLanguageByPlatform(blockchainPlatform),
        task.assignedAgentId,
        1,
      ]
    );
    if (updatedCode !== code) {
      await DatabaseService.query(
        `INSERT INTO code_files (
          id, conversation_id, file_name, content, language,
          agent_id, parent_id, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          UUID.v4(),
          context[0]?.conversationId || UUID.v4(),
          fileName,
          updatedCode,
          this.getLanguageByPlatform(blockchainPlatform),
          task.assignedAgentId,
          initialFileId,
          2,
        ]
      );
    }

    return { originalCode: code, review, updatedCode };
  }

  getCoordinatorAgent(team) {
    // 查找或创建一个协调者角色的agent
    let coordinator = team.agents.find(
      (a) =>
        a.role.toLowerCase().includes("coordinator") ||
        a.role.toLowerCase().includes("manager")
    );
    if (!coordinator) {
      coordinator = {
        id: "coordinator-" + team.id,
        name: "Team Coordinator",
        role: "Coordinator",
        description:
          "Responsible for task assessment, decomposition, and assignment within the team.",
      };
      team.agents.push(coordinator);
    }
    return coordinator;
  }

  async getCoordinatorResponse(coordinatorAgent, message, context, team) {
    const teamInfo = team.agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      skills: a.skills || [],
    }));

    const prompt = `As the ${
      coordinatorAgent.role
    }, assess the following task and decide if it needs to be decomposed. If so, provide a decomposition and assign subtasks to appropriate team members based on their roles and skills. If not, assign the task to the most suitable team member. Your response should be in JSON format with the following structure:
    {
      "needsDecomposition": boolean,
      "taskDecomposition": [{ "description": string, "assignedAgentId": string }] or null,
      "assignedAgentId": string or null,
      "instruction": string
    }

    Team members information:
    ${JSON.stringify(teamInfo, null, 2)}

    Ensure that each task is assigned to an existing team member based on their role and skills. Use the exact id provided in the team information.`;

    const response = await OpenAIService.createChatCompletion([
      { role: "system", content: prompt },
      ...context.map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ]);

    let parsedResponse;

    try {
      const cleanedResult = response.replace(/```json\s?|```/g, "");
      parsedResponse = JSON.parse(cleanedResult);
    } catch (error) {
      console.error("Error parsing coordinator response:", error);
      throw new Error("Invalid coordinator response format");
    }

    // 验证分配的 agent ID
    if (parsedResponse.taskDecomposition) {
      parsedResponse.taskDecomposition = parsedResponse.taskDecomposition.map(
        (task) => {
          const assignedAgent = team.agents.find(
            (a) => a.id === task.assignedAgentId
          );
          if (!assignedAgent) {
            console.warn(
              `Invalid agent ID ${task.assignedAgentId} for task: ${task.description}`
            );
            task.assignedAgentId = team.agents[0].agentid; // 默认分配给第一个 agent
          }
          return task;
        }
      );
    }

    return parsedResponse;
  }

  validateGeneratedCode(code, role) {
    const keywords = this.getKeywordsForRole(role);
    return keywords.some((keyword) =>
      code.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  getKeywordsForRole(role) {
    const keywordMap = {
      smartcontract_developer: ["contract", "function", "event", "modifier"],
      solidity_developer: ["contract", "function", "event", "modifier"],
      rust_developer: ["pub fn", "struct", "impl", "#[program]"],
      move_developer: ["module", "struct", "public fun", "resource"],
      func_developer: ["() recv_internal", "cell", "slice", "builder"],
      cosmwasm_developer: ["pub fn", "#[entry_point]", "cosmwasm_std", "Deps"],
      haskell_developer: ["module", "data", "instance", "where"],
      frontend_developer: ["react", "component", "useState", "useEffect"],
      backend_developer: ["async", "await", "router", "middleware"],
      game_developer: ["GameObject", "Transform", "Update", "Start"],
    };
    return keywordMap[role.toLowerCase()] || [];
  }

  detectBlockchainPlatform(message, context) {
    const combinedText =
      message.toLowerCase() +
      " " +
      context.map((c) => c.content?.toLowerCase() || "").join(" ");
    if (combinedText.includes("solana")) return "solana";
    if (combinedText.includes("ethereum")) return "ethereum";
    if (combinedText.includes("ton")) return "ton";
    if (combinedText.includes("aptos")) return "aptos";
    return "ethereum"; // 默认
  }

  async executeDecomposedTasks(
    userId,
    taskDecomposition,
    team,
    context,
    conversationId,
    blockchainPlatform,
    gameType
  ) {
    const results = [];
    for (const task of taskDecomposition) {
      const executingAgent = team.agents.find(
        (a) => a.id === task.assignedAgentId
      );
      if (executingAgent) {
        try {
          // 处理子任务，生成代码
          const { originalCode, review, updatedCode } =
            await this.processSubtask(
              task,
              context,
              blockchainPlatform,
              gameType
            );

          const isValidCode = this.validateGeneratedCode(
            updatedCode,
            executingAgent.role
          );
          const processedResponse =
            await MessageProcessingService.processCodeBlocks(
              updatedCode,
              conversationId
            );

          results.push({
            task: task.description,
            agent: {
              id: executingAgent.id,
              name: executingAgent.name,
              role: executingAgent.role,
            },
            originalCode,
            review,
            updatedCode: processedResponse.content,
            files: processedResponse.files,
            isValidCode,
          });

          // 保存对话历史
          await DatabaseService.saveConversation(
            userId,
            conversationId,
            executingAgent.id,
            "agent",
            JSON.stringify({
              subtask: task.description,
              originalCode,
              review,
              updatedCode: processedResponse.content,
              files: processedResponse.files,
            })
          );
        } catch (error) {
          console.error(
            `Error executing task for agent ${executingAgent.id}:`,
            error
          );
          results.push({
            task: task.description,
            agent: {
              id: executingAgent.id,
              name: executingAgent.name,
              role: executingAgent.role,
            },
            error: `Error occurred while processing this task: ${error.message}`,
          });
        }
      } else {
        console.warn(`No agent found for task: ${task.description}`);
        results.push({
          task: task.description,
          error: "No appropriate agent found for this task.",
        });
      }
    }
    return results;
  }

  generateFileName(code, platform) {
    switch (platform.toLowerCase()) {
      case "solana":
        return `solana_${UUID.v4()}.rs`;
      case "ethereum":
        return `contract_${UUID.v4()}.sol`;
      case "aptos":
        return `aptos_${UUID.v4()}.move`;
      case "ton":
        return `ton_${UUID.v4()}.fc`;
      default:
        return `contract_${UUID.v4()}.sol`;
    }
  }

  // 获取对应的编程语言
  getLanguageByPlatform(platform) {
    const languageMap = {
      solana: "rust",
      ethereum: "solidity",
      aptos: "move",
      ton: "func",
      cosmwasm: "rust",
      cardano: "haskell",
    };
    return languageMap[platform.toLowerCase()] || "solidity";
  }

  async getTaskCodeHistory(taskId, conversationId) {
    return DatabaseService.query(
      `SELECT cf.* 
       FROM code_files cf
       JOIN chat_history ch ON cf.conversation_id = ch.conversation_id
       WHERE ch.id = ? AND cf.conversation_id = ?
       ORDER BY cf.version ASC`,
      [taskId, conversationId]
    );
  }

  // 新增方法：获取特定代码版本
  async getCodeVersion(fileId) {
    const results = await DatabaseService.query(
      "SELECT * FROM code_files WHERE id = ?",
      [fileId]
    );
    return results[0] || null;
  }

  // 新增方法：获取团队代码贡献统计
  async getTeamCodeContributions(teamId) {
    return DatabaseService.query(
      `SELECT 
         a.name as agent_name,
         a.role as agent_role,
         COUNT(cf.id) as code_files_count,
         COUNT(DISTINCT cf.conversation_id) as tasks_count
       FROM agents a
       JOIN code_files cf ON a.id = cf.agent_id
       JOIN team_agents ta ON a.id = ta.agent_id
       WHERE ta.team_id = ?
       GROUP BY a.id`,
      [teamId]
    );
  }

  async consumeCredits(userId, amount, teamId, conversationId, isDecomposed) {
    const userCredits = await DatabaseService.getUserCredits(userId);
    if (userCredits < amount) {
      throw new Error("Insufficient credits");
    }

    await DatabaseService.consumeCredits({
      userId,
      amount,
      teamId,
      conversationId,
      type: isDecomposed ? "TEAM_DECOMPOSE" : "TEAM_SIMPLE",
    });
  }

  getPlatformSpecificReview(platform) {
    const reviewPoints = {
      ethereum: [
        "Gas optimization patterns",
        "ERC standards compliance",
        "State variable access",
        "Event emissions",
        "Reentrancy protection",
      ],
      solana: [
        "Account validation",
        "Program derived addresses",
        "Cross-program invocation",
        "Rent exemption handling",
        "Instruction data validation",
      ],
      aptos: [
        "Move resource management",
        "Module access control",
        "Capability patterns",
        "Global storage usage",
        "Account abstraction",
      ],
      ton: [
        "Message handling",
        "TVM instructions usage",
        "Gas optimization",
        "Contract upgrade patterns",
        "GET methods implementation",
      ],
    };

    return reviewPoints[platform.toLowerCase()] || reviewPoints.ethereum;
  }

  getReviewPrompt(code, blockchainPlatform, gameType) {
    const platformPoints = this.getPlatformSpecificReview(blockchainPlatform);

    return `Review this ${blockchainPlatform} blockchain code for a ${gameType} game.
    
  Platform-specific review points:
  ${platformPoints.map((point) => `- ${point}`).join("\n")}
  
  Game-specific considerations:
  - State management for game logic
  - Asset handling patterns
  - Player interaction flows
  - Event emission for game actions
  - Resource optimization
  
  Code to review:
  ${code}
  
  Provide a structured review with:
  1. Critical issues that must be fixed
  2. Optimization suggestions 
  3. Security considerations
  4. Best practices recommendations
  5. Game logic improvements`;
  }

  async handleSimpleResponse(message, context, team, conversationState) {
    const lastCode = conversationState.lastDiscussedCode;
    const lastExplanation = conversationState.lastCodeExplanation;
    
    const prompt = PromptTemplate.fromTemplate(`
      You are discussing code with a user. The last discussed code was:
      {lastCode}
      
      Your last explanation was:
      {lastExplanation}
      
      The user has responded with: {message}
      
      Provide a brief, contextual response without repeating the code explanation unless specifically asked.
    `);

    const chain = new LLMChain({ llm: this.llm, prompt });
    const result = await chain.call({
      lastCode,
      lastExplanation,
      message
    });

    return result.text;
  }

  async processTeamResponse(userId, message, team, context, conversationState) {
    const teamKnowledge = await this.getTeamKnowledge(team);
    const blockchainPlatform = this.detectBlockchainPlatform(message, context);
    
    const processedResponse = await LangChainService.processMessage(
      message,
      team,
      context,
      teamKnowledge,
      blockchainPlatform
    );

    if (conversationState.isExplainingCode) {
      processedResponse.codeContext = conversationState.lastDiscussedCode;
    }

    return processedResponse;
  }

  async consumeTeamCredits(userId, teamId, conversationId, response) {
    const creditsToConsume = response.taskDecomposition ? response.taskDecomposition.length + 1 : 1;
    await DatabaseService.consumeCredits({
      userId,
      amount: creditsToConsume,
      teamId,
      conversationId,
      type: response.taskDecomposition ? "TEAM_DECOMPOSE" : "TEAM_SIMPLE",
      taskCount: response.taskDecomposition?.length || 0
    });
  }

  async getTeamKnowledge(team) {
    try {
      // Get knowledge from all team members
      const teamKnowledge = await Promise.all(
        team.agents.map(async (agent) => {
          // Get knowledge for each agent
          const knowledge = await MessageProcessingService.getRelevantKnowledge(
            agent.id,
            agent.role
          );
          
          // Format knowledge output
          return {
            agentName: agent.name,
            agentRole: agent.role,
            knowledge: knowledge || 'No relevant knowledge found',
            specialties: this.getAgentSpecialties(agent.role)
          };
        })
      );
  
      // Combine knowledge from all team members
      const combinedKnowledge = teamKnowledge.reduce((acc, agentKnowledge) => {
        return acc + `\n\nAgent ${agentKnowledge.agentName} (${agentKnowledge.agentRole}) knowledge:\n` +
               `Specialties: ${agentKnowledge.specialties.join(', ')}\n` +
               `${agentKnowledge.knowledge}`;
      }, '');
  
      // Add team level context
      const teamContext = `
  Team Name: ${team.name}
  Description: ${team.description || 'No description'}
  Member Count: ${team.agents.length}
  Expertise Coverage: ${this.getTeamExpertise(team.agents)}
      `;
  
      return teamContext + combinedKnowledge;
  
    } catch (error) {
      console.error('Error getting team knowledge:', error);
      return 'Unable to retrieve team knowledge';
    }
  }
  
  // Helper method: Get agent specialties
  getAgentSpecialties(role) {
    const specialtiesMap = {
      'smartcontract_developer': ['Smart Contract Development', 'Security Auditing', 'Gas Optimization'],
      'solidity_developer': ['Ethereum Development', 'Solidity', 'EVM'],
      'rust_developer': ['Solana Development', 'Rust', 'Anchor Framework'],
      'frontend_developer': ['Frontend Development', 'React', 'Web3 Integration'],
      'backend_developer': ['Backend Development', 'API Design', 'Database'],
      'game_developer': ['Game Development', 'Game Design', 'Blockchain Integration'],
      'reviewer': ['Code Review', 'Performance Optimization', 'Best Practices'],
      'coordinator': ['Task Coordination', 'Team Management', 'Requirements Analysis']
    };
  
    return specialtiesMap[role.toLowerCase()] || ['General Development'];
  }
  
  // Helper method: Get team expertise coverage
  getTeamExpertise(agents) {
    const expertise = new Set();
    
    agents.forEach(agent => {
      const specialties = this.getAgentSpecialties(agent.role);
      specialties.forEach(specialty => expertise.add(specialty));
    });
  
    return Array.from(expertise).join(', ');
  }
  
  async storeMessage(userId, conversationId, role, content) {
    const id = UUID.v4();
    await DatabaseService.query(
      "INSERT INTO chat_history (id, user_id, conversation_id, role, content) VALUES (?, ?, ?, ?, ?)",
      [id, userId, conversationId, role, content]
    );
  }
  
}

module.exports = new TeamService();

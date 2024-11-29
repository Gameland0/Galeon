const OpenAIService = require("./openaiService");
const AgentService = require("./agentService");
const DatabaseService = require("./databaseService");
const GeminiService = require("./geminiService");
const SolanaValidatorService = require("./solanaValidatorService");
const CreditService = require("./creditService");
const ClaudeService = require('./ClaudeService');
const fs = require("fs").promises;
const path = require("path");
const UUID = require("uuid");

class MessageProcessingService {
  constructor() {
    this.processContexts = new Map();
    this.conversationStates = new Map();
  }

  getConversationState(conversationId) {
    return this.conversationStates.get(conversationId) || {
      lastCodeExplanation: null,
      isExplainingCode: false,
      lastDiscussedCode: null,
      currentContext: 'general'
    };
  }

  setConversationState(conversationId, state) {
    this.conversationStates.set(conversationId, {
      ...this.getConversationState(conversationId),
      ...state
    });
  }

  isFollowUpQuestion(message, lastExplanation) {
    const simpleResponses = ['ok', 'nice', 'thanks', 'good', 'great', 'got it'];
    if (simpleResponses.some(response => message.toLowerCase().includes(response))) {
      return true;
    }

    return message.length < 50 && !this.containsCodeRequest(message);
  }

  containsCodeRequest(message) {
    const codeKeywords = ['code', 'implement', 'function', 'class', 'write', 'develop', 'create'];
    return codeKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  getProcessContext(conversationId) {
    return this.processContexts.get(conversationId) || [];
  }

  updateProcessContext(conversationId, message) {
    let context = this.getProcessContext(conversationId);
    context.push(message);
    if (context.length > 10) {
      context = context.slice(-10);
    }
    this.processContexts.set(conversationId, context);
  }

  async processMessage(userId, message, agentId, conversationId) {
    try {
      const allCodeFiles = await DatabaseService.query(
        "SELECT file_name FROM code_files WHERE conversation_id = ?",
        [conversationId]
      );

      // 提取所有文件名
      const fileNames = allCodeFiles.map((file) => file.file_name);

      let relevantCode = "";

      // 检查消息中是否包含任何已知的文件名
      if (fileNames.length > 0) {
        const matchedFiles = fileNames.filter((fileName) =>
          message.toLowerCase().includes(fileName.toLowerCase())
        );

        if (matchedFiles.length > 0) {
          // 查询匹配到的文件内容
          const codeFiles = await DatabaseService.query(
            `SELECT * FROM code_files 
             WHERE conversation_id = ? 
             AND file_name IN (${matchedFiles.map(() => "?").join(",")})
             ORDER BY version DESC`,
            [conversationId, ...matchedFiles]
          );

          if (codeFiles.length > 0) {
            relevantCode =
              "\n\nReferenced code files:\n" +
              codeFiles
                .map(
                  (file) =>
                    `${file.file_name}:\n\`\`\`${file.language}\n${file.content}\n\`\`\``
                )
                .join("\n\n");
          }
        }
      }
      let agent = null;
      let systemMessage = "";
      if (agentId) {
        agent = await this.getAgentById(agentId)
        const relevantKnowledge = await this.getRelevantKnowledge(
          agentId,
          message
        );
        const previousMessages = await this.getPreviousMessages(userId, 5);
        systemMessage = `You are ${
          agent.name
        }, an AI agent with the following description: ${agent.description}. 
          Your role is ${agent.role || "not specified"} and your goal is ${
          agent.goal || "not specified"
        }.
          ${relevantCode}\n\n
          Relevant knowledge:\n${relevantKnowledge}\n\n
          Previous context:\n${previousMessages}`;
      } else {
        systemMessage = `You are an AI assistant for a multi-agent platform. ${relevantCode}`;
      }

      // const context = this.getProcessContext(conversationId);
      const context = await DatabaseService.getConversationHistory(
        userId,
        conversationId
      );

      const messages = [
        { role: "system", content: systemMessage },
        ...context,
        { role: "user", content: message },
      ];

      let aiResponse;
      if (agent && agent.model) {
        aiResponse = await this.getModelResponse(agent.model, messages);
      } else {
        aiResponse = await OpenAIService.createChatCompletion(messages);
      }
      if (agent) {
        await this.updateAgentKnowledge(
          agent.id,
          aiResponse
        );
      }
      const processedResponse = await this.processCodeBlocks(
        aiResponse,
        conversationId
      );

      await DatabaseService.saveConversation(
        userId,
        conversationId,
        agentId,
        "user",
        message
      );
      await DatabaseService.saveConversation(
        userId,
        conversationId,
        agentId,
        "agent",
        processedResponse.content
      );
      const canUseCredit = await CreditService.useCredit(userId);
      await DatabaseService.query(
        `INSERT INTO credit_consumption (
          id, 
          user_id,
          amount,
          type,
          use_id,
          conversation_id,
          message_type,
          task_count,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [UUID.v4(), userId, 1, "agent", agentId, conversationId, "SINGLE", 0]
      );
      if (!canUseCredit) {
        return {
          content:
            "You don't have enough credits to send messages. Please wait for weekly reset.",
          conversationId: conversationId || UUID.v4(),
        };
      }
      return {
        content: processedResponse.content,
        agent,
        files: processedResponse.files,
      };
    } catch (error) {
      console.error("Error in processMessage:", error);
      throw error;
    }
  }

  // async processMessage(userId, message, agentId, conversationId) {
  //   try {
  //     const conversationState = this.getConversationState(conversationId);
      
  //     // 检查是否是对之前代码的跟进讨论
  //     if (conversationState.isExplainingCode && 
  //         this.isFollowUpQuestion(message, conversationState.lastCodeExplanation)) {
  //       const response = await this.handleCodeFollowUp(message, conversationState, agentId);
  //       await this.saveConversation(userId, conversationId, agentId, response);
  //       return response;
  //     }

  //     // 获取和分析代码文件
  //     const codeFiles = await this.getRelevantCodeFiles(message, conversationId);
  //     const relevantCode = this.formatRelevantCode(codeFiles);

  //     // 准备系统消息
  //     let systemMessage = await this.prepareSystemMessage(agentId, message, relevantCode, userId);
      
  //     // 获取上下文并处理消息
  //     const context = await DatabaseService.getConversationHistory(userId, conversationId);
  //     const messages = this.prepareMessages(systemMessage, context, message);

  //     // 获取AI响应
  //     let aiResponse = await this.getAIResponse(agentId, messages);
      
  //     // 处理代码块并更新状态
  //     const processedResponse = await this.processCodeBlocks(aiResponse, conversationId);
  //     if (processedResponse.files.length > 0) {
  //       this.setConversationState(conversationId, {
  //         isExplainingCode: true,
  //         lastCodeExplanation: processedResponse.content,
  //         lastDiscussedCode: processedResponse.files[0].content,
  //         lastProcessedFile: processedResponse.files[0].name
  //       });
  //     }

  //     // 保存对话历史
  //     await this.saveConversationHistory(userId, conversationId, agentId, message, processedResponse);

  //     // 处理积分消耗
  //     await this.handleCreditConsumption(userId, agentId, conversationId);

  //     return {
  //       content: processedResponse.content,
  //       agent: agentId ? await AgentService.getAgentById(agentId) : null,
  //       files: processedResponse.files
  //     };
  //   } catch (error) {
  //     console.error("Error in processMessage:", error);
  //     throw error;
  //   }
  // }

  async getPreviousMessages(userId, count) {
    const results = await DatabaseService.query(
      `SELECT content, agent_id
       FROM chat_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, count]
    );
    return results
      .reverse()
      .map(
        (row) =>
          `User: ${row.content}\nAI (Agent ${row.agent_id || "Unknown"}): ${
            row.response
          }`
      )
      .join("\n\n");
  }

  async decomposeTask(task, context) {
    const messages = [
      ...context,
      {
        role: "system",
        content: `You are an expert in various fields including but not limited to web development, software engineering, and project management. Your task is to:
        1. Decompose the given task into smaller, manageable subtasks.
        2. For each subtask, determine the most appropriate agent type and required skills.
        3. Format your response as a JSON array where each object represents a subtask with properties: description, agentType, and requiredSkills (an array of strings).
        4. Do not include any markdown formatting or code block indicators in your response.`,
      },
      { role: "user", content: `Decompose and analyze this task: ${task}` },
    ];

    const response = await OpenAIService.createChatCompletion(
      messages,
      "gpt-4o-mini",
      1500
    );
    return this.parseDecomposition(response);
  }

  async agentCommunication(senderId, receiverId, message, conversationId) {
    const sender = await AgentService.getAgentById(senderId);
    const receiver = await AgentService.getAgentById(receiverId);

    const response = await OpenAIService.createChatCompletion([
      {
        role: "system",
        content: `You are ${receiver.name}. Another agent, ${sender.name}, is communicating with you. Respond appropriately based on your role and the message content.`,
      },
      { role: "user", content: message },
    ]);

    const reply = response.trim();
    await this.saveAgentCommunication(senderId, receiverId, message, reply);
    await DatabaseService.saveConversation(
      null,
      conversationId,
      "agent",
      reply,
      receiverId
    );

    return { reply };
  }

  async saveAgentCommunication(senderId, receiverId, message, reply) {
    const id = UUID.v4();
    return DatabaseService.query(
      "INSERT INTO agent_communications (id, sender_id, receiver_id, message, reply) VALUES (?, ?, ?, ?, ?)",
      [id, senderId, receiverId, message, reply]
    );
  }

  async processSimpleMessage(message, team, context) {
    return OpenAIService.createChatCompletion(
      [
        ...context,
        {
          role: "system",
          content: `You are an AI assistant for the team "${team.name}". Respond to the user's message in the context of the ongoing Web3 game development discussion.`,
        },
        { role: "user", content: message },
      ],
      "gpt-4o-mini",
      1000
    );
  }

  async shouldDecomposeTask(message, context) {
    const response = await OpenAIService.createChatCompletion(
      [
        ...context,
        {
          role: "system",
          content:
            "Determine if the given message requires task decomposition. The task could be related to any field, not just game development. Respond with 'Yes' if it's a task that can be broken down into subtasks, or 'No' if it's a simple question or doesn't require decomposition.",
        },
        {
          role: "user",
          content: `Does this message require task decomposition? Message: "${message}"`,
        },
      ],
      "gpt-4o-mini",
      5
    );

    return response.toLowerCase() === "yes";
  }

  parseDecomposition(decomposition) {
    if (!decomposition) {
      console.warn("Decomposition is undefined or null");
      return [];
    }

    try {
      let content = decomposition.replace(/```json\s?|```/g, "").trim();
      const parsedContent = JSON.parse(content);
      if (Array.isArray(parsedContent)) {
        return parsedContent;
      } else {
        throw new Error("Parsed content is not an array");
      }
    } catch (error) {
      console.warn("Failed to parse decomposition as JSON:", error);
      // Fallback to simple string splitting if JSON parsing fails
      return decomposition
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => ({
          description: line.trim(),
          agentType: "general",
          requiredSkills: [],
        }));
    }
  }

  detectUserLanguage(message) {
    const chineseChars = (message.match(/[\u4e00-\u9fa5]/g) || []).length;
    return chineseChars > message.length / 4 ? "中文" : "English";
  }

  async getRelevantKnowledge(agentId, message) {
    try {
      const keywords = await this.extractKeywords(message);
      const query = `
        SELECT content 
        FROM agent_knowledge 
        WHERE agent_id = ? AND key_phrase IN (${keywords
          .map(() => "?")
          .join(", ")})
        LIMIT 5
      `;
      const results = await DatabaseService.query(query, [
        agentId,
        ...keywords,
      ]);
      return results.map((row) => row.content).join("\n\n");
    } catch (error) {
      console.error("Error fetching relevant knowledge:", error);
      return "";
    }
  }

  async extractKeywords(content) {
    try {
      const prompt = `Extract 5 key words or phrases from the following text, regardless of language. Ignore common stop words. Separate the keywords with commas:\n\n${content}`;
      const response = await OpenAIService.createChatCompletion([
        {
          role: "system",
          content:
            "You are a helpful assistant that extracts keywords from text, ignoring stop words.",
        },
        { role: "user", content: prompt },
      ]);
      const keywords = response
        .trim()
        .split(",")
        .map((keyword) => keyword.trim());
      return keywords;
    } catch (error) {
      console.error("Error extracting keywords with OpenAI:", error);
      return this.fallbackKeywordExtraction(content);
    }
  }

  fallbackKeywordExtraction(content) {
    const words = content.toLowerCase().split(/\W+/);
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "in",
      "on",
      "at",
      "for",
      "to",
      "of",
      "and",
      "or",
      "but",
    ]);
    const wordFreq = {};
    words.forEach((word) => {
      if (!stopWords.has(word) && word.length > 2) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((entry) => entry[0]);
  }

  async processCodeBlocks(content, conversationId) {
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    const files = [];
    let processedContent = content;
    let str = "";

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [fullMatch, declaredLanguage, code] = match;

      try {
        // 检查代码类型和提取合约名称/类名/函数名
        const codeType = this.identifyCodeType(code, declaredLanguage);
        const extractedName = this.extractCodeName(
          code,
          codeType,
          declaredLanguage
        );

        if (codeType === "solana-program") {
          // Solana 程序验证
          const validationResult = await SolanaValidatorService.validateProgram(
            code
          );
          const fileName = `${extractedName}.rs`;

          // 在代码块前添加文件名
          const replacementContent = `${fileName}\n\`\`\`${declaredLanguage}\n${code}\`\`\``;
          processedContent = processedContent.replace(
            fullMatch,
            replacementContent
          );

          str = str + "\n\n### Code Review";
          if (validationResult.syntaxErrors.length > 0) {
            str =
              str +
              `\nSyntax errors in Solana program: ${validationResult.syntaxErrors.join(
                "\n"
              )}`;
          }

          if (validationResult.securityIssues.length > 0) {
            str =
              str +
              `\nSecurity issues found: ${validationResult.securityIssues.join(
                "\n"
              )}`;
          }

          if (validationResult.optimizationSuggestions.length > 0) {
            str =
              str +
              `\nOptimization Suggestions: ${validationResult.optimizationSuggestions.join(
                "\n"
              )}`;
          }

          const isAnchorProgram = this.isAnchorProgram(code);
          const programType = isAnchorProgram ? "anchor" : "cargo";

          const filePath = path.join(
            __dirname,
            "../public/generated",
            fileName
          );
          await fs.writeFile(filePath, code);

          const fileId = UUID.v4();
          await DatabaseService.query(
            `INSERT INTO code_files (
              id, conversation_id, file_name, content, language, 
              version
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [fileId, conversationId, fileName, code, "rust", 1]
          );

          files.push({
            name: fileName,
            type: programType,
            language: "rust",
            path: `/generated/${fileName}`,
            isContract: true,
          });
        } else if (codeType === "solidity") {
          const fileName = `${extractedName}.sol`;

          // 在代码块前添加文件名
          const replacementContent = `${fileName}\n\`\`\`${declaredLanguage}\n${code}\`\`\``;
          processedContent = processedContent.replace(
            fullMatch,
            replacementContent
          );

          const filePath = path.join(
            __dirname,
            "../public/generated",
            fileName
          );
          await fs.writeFile(filePath, code);

          const fileId = UUID.v4();
          await DatabaseService.query(
            `INSERT INTO code_files (
              id, conversation_id, file_name, content, language, 
              version
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [fileId, conversationId, fileName, code, "solidity", 1]
          );

          files.push({
            name: fileName,
            type: "solidity",
            language: "solidity",
            path: `/generated/${fileName}`,
            isContract: true,
          });
        } else if (codeType === "react-component") {
          const fileName = extractedName.endsWith(".jsx")
            ? extractedName
            : `${extractedName}.jsx`;
          const replacementContent = `${fileName} (React Component)\n\`\`\`${declaredLanguage}\n${code}\`\`\``;
          processedContent = processedContent.replace(
            fullMatch,
            replacementContent
          );

          const filePath = path.join(
            __dirname,
            "../public/generated",
            fileName
          );
          await fs.writeFile(filePath, code);

          const fileId = UUID.v4();
          await DatabaseService.query(
            `INSERT INTO code_files (
              id, conversation_id, file_name, content, language, 
              version
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [fileId, conversationId, fileName, code, "frontend", 1]
          );

          files.push({
            name: fileName,
            type: "react-component",
            language: "jsx",
            path: `/generated/${fileName}`,
          });
        } else if (
          codeType === "backend-service" ||
          codeType === "api-endpoint"
        ) {
          const extension = declaredLanguage === "typescript" ? "ts" : "js";
          const fileName = extractedName.includes(".")
            ? extractedName
            : `${extractedName}.${extension}`;
          const codeTypeLabel = this.getCodeTypeLabel(codeType);
          const replacementContent = `${fileName} (${codeTypeLabel})\n\`\`\`${declaredLanguage}\n${code}\`\`\``;
          processedContent = processedContent.replace(
            fullMatch,
            replacementContent
          );

          const filePath = path.join(
            __dirname,
            "../public/generated",
            fileName
          );
          await fs.writeFile(filePath, code);

          const fileId = UUID.v4();
          await DatabaseService.query(
            `INSERT INTO code_files (
              id, conversation_id, file_name, content, language, 
              version
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [fileId, conversationId, fileName, code, "backend", 1]
          );

          files.push({
            name: fileName,
            type: codeType,
            language: declaredLanguage || "javascript",
            path: `/generated/${fileName}`,
          });
        } else {
          const fileName = this.generateFileName(
            code,
            extractedName,
            declaredLanguage
          );

          // 在代码块前添加文件名和类型说明
          let codeTypeLabel = this.getCodeTypeLabel(codeType);
          const replacementContent = `${fileName} (${codeTypeLabel})\n\`\`\`${declaredLanguage}\n${code}\`\`\``;
          processedContent = processedContent.replace(
            fullMatch,
            replacementContent
          );

          const filePath = path.join(
            __dirname,
            "../public/generated",
            fileName
          );
          await fs.writeFile(filePath, code);

          const fileId = UUID.v4();
          await DatabaseService.query(
            `INSERT INTO code_files (
              id, conversation_id, file_name, content, language, 
              version
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              fileId,
              conversationId,
              fileName,
              code,
              declaredLanguage || "plaintext",
              1,
            ]
          );

          files.push({
            name: fileName,
            type: codeType,
            language: declaredLanguage || "plaintext",
            path: `/generated/${fileName}`,
            isContract: false,
          });
        }
      } catch (error) {
        console.error("Error processing code block:", error);
        str = str + `\nError processing code: ${error.message}`;
      }
    }
    return { content: processedContent + str, files };
  }

  isAnchorProgram(code) {
    return (
      code.includes("use anchor_lang::prelude") ||
      code.includes("#[program]") ||
      code.includes("anchor_lang")
    );
  }

  isSolanaProgram(code) {
    return (
      code.includes("solana_program") ||
      code.includes("use anchor_lang") ||
      code.includes("#[program]") ||
      code.includes("declare_id!")
    );
  }

  isSolidityContract(code) {
    return code.includes("pragma solidity") || code.includes("contract ");
  }

  isConfigFile(code, language) {
    return (
      ["toml", "json", "yaml", "yml"].includes(language) ||
      code.includes("Cargo.toml") ||
      code.includes("package.json")
    );
  }

  isCommand(code) {
    const commandPatterns = [
      /^anchor\s+/,
      /^solana\s+/,
      /^cargo\s+/,
      /^npm\s+/,
    ];
    return commandPatterns.some((pattern) => pattern.test(code.trim()));
  }

  generateSupportFileName(code, language) {
    if (this.isCommand(code)) {
      return `commands_${UUID.v4()}.sh`;
    }

    const extensionMap = {
      toml: "toml",
      json: "json",
      yaml: "yaml",
      yml: "yml",
      js: "js",
      ts: "ts",
      python: "py",
      rust: "rs",
    };

    return `support_${UUID.v4()}.${extensionMap[language] || "txt"}`;
  }

  async getModelResponse(model, messages) {
    switch (model) {
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4o":
      case "gpt-4o-mini":
        return await OpenAIService.createChatCompletion(messages, model);
        case 'claude-3-opus-20240229':
      case 'claude-3-sonnet-20240229':
      case 'claude-3-haiku-20240307':
        return await ClaudeService.createChatCompletion(messages, model);
      case "gemini-pro":
        return await GeminiService.generateContent(messages);
      default:
        return await OpenAIService.createChatCompletion(messages);
    }
  }

  async getCodeFileHistory(conversationId) {
    return DatabaseService.query(
      "SELECT * FROM code_files WHERE conversation_id = ? ORDER BY created_at DESC",
      [conversationId]
    );
  }

  async getCodeFile(fileId) {
    const results = await DatabaseService.query(
      "SELECT * FROM code_files WHERE id = ?",
      [fileId]
    );
    return results[0] || null;
  }

  extractCodeName(code, codeType, language) {
    let name = "";

    switch (codeType) {
      case "solidity":
        // 提取合约名
        const contractMatch = code.match(/contract\s+(\w+)/);
        name = contractMatch ? contractMatch[1] : "Contract";
        break;

      case "solana-program":
        // 提取程序名或模块名
        const programMatch = code.match(
          /#\[program\]\s*pub mod\s+(\w+)|pub mod\s+(\w+)/
        );
        name = programMatch ? programMatch[1] || programMatch[2] : "Program";
        break;

      case "react-component":
        // 提取React组件名
        const componentMatch = code.match(
          /function\s+(\w+)|class\s+(\w+)\s+extends\s+React/
        );
        name = componentMatch
          ? componentMatch[1] || componentMatch[2]
          : "Component";
        break;

      case "backend-service":
        // 提取服务类名或主要函数名
        const serviceMatch = code.match(
          /class\s+(\w+Service)|async\s+function\s+(\w+)/
        );
        name = serviceMatch ? serviceMatch[1] || serviceMatch[2] : "Service";
        break;

      default:
        // 尝试从语言特定的模式中提取名称
        name = this.extractNameByLanguage(code, language);
    }

    return name || `Code_${UUID.v4().slice(0, 8)}`;
  }

  // 新增方法：根据编程语言提取名称
  extractNameByLanguage(code, language) {
    const patterns = {
      typescript: {
        regex: /(?:interface|class|function|const)\s+(\w+)/,
        default: "TypeScript",
      },
      javascript: {
        regex: /(?:class|function|const)\s+(\w+)/,
        default: "JavaScript",
      },
      python: {
        regex: /(?:class|def)\s+(\w+)/,
        default: "Python",
      },
      rust: {
        regex: /(?:struct|fn|mod)\s+(\w+)/,
        default: "Rust",
      },
      java: {
        regex: /(?:class|interface)\s+(\w+)/,
        default: "Java",
      },
    };

    const langPattern = patterns[language?.toLowerCase()];
    if (langPattern) {
      const match = code.match(langPattern.regex);
      return match ? match[1] : langPattern.default;
    }

    return "";
  }

  // 更新方法：增强代码类型识别
  identifyCodeType(code, declaredLanguage) {
    // React组件识别
    if (this.isReactComponent(code)) {
      return "react-component";
    }

    // 后端服务和API识别
    if (this.isBackendService(code)) {
      return "backend-service";
    }
    if (this.isAPIEndpoint(code)) {
      return "api-endpoint";
    }

    // 智能合约识别
    if (this.isSolidityContract(code)) {
      return "solidity";
    }
    if (this.isSolanaProgram(code)) {
      return "solana-program";
    }

    return "other";
  }

  // 新增代码类型检测方法
  isReactComponent(code) {
    return (
      code.includes("import React") ||
      code.includes("from 'react'") ||
      code.includes("useState") ||
      code.includes("useEffect") ||
      /export\s+(?:default\s+)?(?:function|class).*(?:Component|Page|Screen)/.test(
        code
      ) ||
      /return\s+\(\s*<.*>\s*\)/.test(code) // JSX返回语句
    );
  }

  isStylesheet(code) {
    return (
      code.includes("@import") ||
      code.includes("@media") ||
      /[\.\#]\w+\s*\{/.test(code)
    );
  }

  isBackendService(code) {
    return (
      (code.includes("class") &&
        (code.includes("Service") || code.includes("Repository"))) ||
      code.includes("module.exports") ||
      code.includes("export class") ||
      code.includes("Database") ||
      code.includes("async function") ||
      code.includes("connection")
    );
  }

  isAPIEndpoint(code) {
    return (
      code.includes("router.") ||
      code.includes("express") ||
      code.includes("@Controller") ||
      code.includes("@Get") ||
      code.includes("@Post")
    );
  }

  getCodeTypeLabel(codeType) {
    const labels = {
      "react-component": "React Component",
      "backend-service": "Backend Service",
      "api-endpoint": "API Endpoint",
      stylesheet: "Stylesheet",
      config: "Configuration",
      "solana-program": "Solana Program",
      solidity: "Solidity Contract",
    };
    return labels[codeType] || "Code File";
  }

  generateFileName(code, agentType, declaredLanguage) {
    // 基于 agent 角色和代码类型生成合适的文件名
    const getFileExtension = (agentType, declaredLanguage) => {
      const extensionMap = {
        frontend_developer: {
          javascript: "js",
          typescript: "ts",
          react: "jsx",
          default: "js",
        },
        solidity_developer: {
          default: "sol",
        },
        game_developer: {
          unity: "cs",
          unreal: "cpp",
          default: "js",
        },
        backend_developer: {
          javascript: "js",
          typescript: "ts",
          python: "py",
          default: "js",
        },
      };

      const agentExtensions = extensionMap[agentType] || { default: "txt" };
      return agentExtensions[declaredLanguage] || agentExtensions.default;
    };

    let baseName;
    const extension = getFileExtension(agentType, declaredLanguage);

    // 尝试从代码中提取名称
    if (agentType === "solidity_developer") {
      const contractMatch = code.match(/contract\s+(\w+)/);
      baseName = contractMatch ? contractMatch[1] : "Contract";
    } else if (agentType === "frontend_developer") {
      const componentMatch = code.match(/(?:class|function)\s+(\w+)/);
      baseName = componentMatch ? componentMatch[1] : "Component";
    } else if (agentType === "game_developer") {
      const classMatch = code.match(/class\s+(\w+)/);
      baseName = classMatch ? classMatch[1] : "Game";
    } else if (agentType === "backend_developer") {
      const serviceMatch = code.match(
        /(?:class|function)\s+(\w+)(?:Service|Controller)?/
      );
      baseName = serviceMatch ? serviceMatch[1] : "Service";
    }

    baseName = baseName || "Generated";
    return `${baseName}.${extension}`;
  }

  async handleCodeFollowUp(message, conversationState, agentId) {
    const response = await OpenAIService.createChatCompletion([
      {
        role: "system",
        content: `You are explaining previously discussed code. 
                 The code being discussed is: ${conversationState.lastDiscussedCode}`
      },
      {
        role: "user",
        content: message
      }
    ]);

    return {
      content: response,
      isFollowUp: true,
      relatedCode: conversationState.lastDiscussedCode
    };
  }

  // prepareMessages(systemMessage, context, message) {
  //   return [
  //     { role: "system", content: systemMessage },
  //     ...context,
  //     { role: "user", content: message }
  //   ];
  // }

  shouldGenerateNewCode(message) {
    const generationTriggers = [
      'create', 'generate', 'implement', 'write',
      'develop', 'build', 'make', 'code'
    ];
    return generationTriggers.some(trigger => 
      message.toLowerCase().includes(trigger));
  }

  async saveConversationHistory(userId, conversationId, agentId, message, response) {
    await DatabaseService.saveConversation(
      userId, conversationId, agentId, "user", message
    );
    await DatabaseService.saveConversation(
      userId, conversationId, agentId, "agent", response.content
    );
  }

  async handleCreditConsumption(userId, agentId, conversationId) {
    const canUseCredit = await CreditService.useCredit(userId);
    if (!canUseCredit) {
      throw new Error("Insufficient credits");
    }
    
    await DatabaseService.query(
      `INSERT INTO credit_consumption (
        id, user_id, amount, type, use_id, 
        conversation_id, message_type, task_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [UUID.v4(), userId, 1, "agent", agentId, conversationId, "SINGLE", 0]
    );
  }

  async analyzeCodeRelation(message, context) {
    try {
      // Check if message explicitly references code
      const codeKeywords = ['code', 'function', 'method', 'class', 'contract', 'program', 'implementation'];
      const hasCodeKeywords = codeKeywords.some(keyword => 
        message.toLowerCase().includes(keyword)
      );
  
      // Get conversation state
      const lastMessage = context[context.length - 1];
      const previousCodeBlocks = this.extractCodeBlocks(context);
      
      // Look for code file references
      const fileReferencePattern = /\b[\w-]+\.(sol|rs|jsx?|tsx?|py|move|fc)\b/g;
      const fileReferences = message.match(fileReferencePattern);
  
      // Get any referenced code content
      let codeContent = null;
      if (fileReferences?.length > 0) {
        // Search context for referenced files
        for (const fileName of fileReferences) {
          const fileContent = context.find(msg => 
            msg.content?.includes(fileName) && this.containsCodeBlock(msg.content)
          );
          if (fileContent) {
            codeContent = this.extractCodeFromMessage(fileContent.content, fileName);
            break;
          }
        }
      }
  
      // If no specific file reference but code was recently discussed
      if (!codeContent && previousCodeBlocks.length > 0) {
        const lastCodeBlock = previousCodeBlocks[previousCodeBlocks.length - 1];
        if (this.isRecentCodeDiscussion(lastMessage, message)) {
          codeContent = lastCodeBlock;
        }
      }
  
      return {
        isRelated: hasCodeKeywords || !!codeContent,
        codeContent,
        fileReferences: fileReferences || [],
        type: this.determineCodeDiscussionType(message, codeContent)
      };
    } catch (error) {
      console.error('Error in analyzeCodeRelation:', error);
      return {
        isRelated: false,
        codeContent: null,
        fileReferences: [],
        type: 'unknown'
      };
    }
  }
  
  // Helper methods
  containsCodeBlock(content) {
    return content?.includes('```');
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
  
  extractCodeFromMessage(content, fileName) {
    const fileExtension = fileName.split('.').pop();
    const codeBlockRegex = new RegExp(
      `\`\`\`(?:${fileExtension})?\n([\\s\\S]*?)\`\`\``, 'g'
    );
    const matches = content.match(codeBlockRegex);
    return matches ? matches[0].replace(/```[\w]*\n?/, '').replace(/```$/, '') : null;
  }
  
  isRecentCodeDiscussion(lastMessage, currentMessage) {
    if (!lastMessage || !currentMessage) return false;
    
    const timeDiff = 5 * 60 * 1000; // 5 minutes
    const lastMessageTime = new Date(lastMessage.timestamp || Date.now());
    const currentTime = new Date();
    
    return currentTime.getTime() - lastMessageTime.getTime() < timeDiff &&
           this.containsCodeBlock(lastMessage.content);
  }
  
  determineCodeDiscussionType(message, codeContent) {
    const types = {
      EXPLANATION: ['explain', 'what does', 'how does', 'tell me about'],
      MODIFICATION: ['change', 'modify', 'update', 'fix', 'improve'],
      REVIEW: ['review', 'check', 'look at', 'analyze'],
      QUESTION: ['why', 'when', 'where', 'how']
    };
  
    const messageLower = message.toLowerCase();
    
    for (const [type, keywords] of Object.entries(types)) {
      if (keywords.some(keyword => messageLower.includes(keyword))) {
        return type;
      }
    }
  
    return codeContent ? 'CONTEXT' : 'GENERAL';
  }
  
  async processCodeBlocks(content, conversationId) {
    const state = this.getConversationState(conversationId);
    // If explaining code and no new code generation needed
    if (state.isExplainingCode && !this.shouldGenerateNewCode(content)) {
      return {
        content: state.lastCodeExplanation,
        files: [],
        isReused: true
      };
    }
  
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    const files = [];
    let processedContent = content;
    let str = "";
  
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [fullMatch, declaredLanguage, code] = match;
  
      try {
        const codeType = this.identifyCodeType(code, declaredLanguage);
        const extractedName = this.extractCodeName(code, codeType, declaredLanguage);
  
        if (codeType === "solana-program") {
          const validationResult = await SolanaValidatorService.validateProgram(code);
          const fileName = `${extractedName}.rs`;
  
          const replacementContent = `${fileName}\n\`\`\`${declaredLanguage}\n${code}\`\`\``;
          processedContent = processedContent.replace(fullMatch, replacementContent);
  
          str = str + "\n\n### Code Review";
          if (validationResult.syntaxErrors.length > 0) {
            str = str + `\nSyntax errors in Solana program: ${validationResult.syntaxErrors.join("\n")}`;
          }
  
          if (validationResult.securityIssues.length > 0) {
            str = str + `\nSecurity issues found: ${validationResult.securityIssues.join("\n")}`;
          }
  
          if (validationResult.optimizationSuggestions.length > 0) {
            str = str + `\nOptimization Suggestions: ${validationResult.optimizationSuggestions.join("\n")}`;
          }
  
          const isAnchorProgram = this.isAnchorProgram(code);
          const programType = isAnchorProgram ? "anchor" : "cargo";
  
          await this.saveCodeFile(fileName, code, "rust", conversationId);
  
          files.push({
            name: fileName,
            type: programType,
            language: "rust",
            path: `/generated/${fileName}`,
            isContract: true
          });
        } else {
          // Handle other code types...
          const fileInfo = await this.processOtherCodeTypes(code, codeType, declaredLanguage, extractedName, conversationId);
          if (fileInfo) {
            files.push(fileInfo);
            processedContent = processedContent.replace(fullMatch, 
              `${fileInfo.name}\n\`\`\`${declaredLanguage}\n${code}\`\`\``);
          }
        }
      } catch (error) {
        console.error("Error processing code block:", error);
        str = str + `\nError processing code: ${error.message}`;
      }
    }
  
    // Update code explanation history
    if (files.length > 0) {
      const codeExplanationHistory = new Set(state.codeExplanationHistory || []);
      files.forEach(file => codeExplanationHistory.add(file.name));
      this.setConversationState(conversationId, {
        ...state,
        codeExplanationHistory: Array.from(codeExplanationHistory)
      });
    }
  
    return { 
      content: processedContent + str, 
      files 
    };
  }
  
  // Helper method to save code file
  async saveCodeFile(fileName, content, language, conversationId) {
    const filePath = path.join(__dirname, "../public/generated", fileName);
    await fs.writeFile(filePath, content);
  
    const fileId = UUID.v4();
    await DatabaseService.query(
      `INSERT INTO code_files (
        id, conversation_id, file_name, content, language, 
        version
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [fileId, conversationId, fileName, content, language, 1]
    );
  }
  
  // Helper method to process other code types
  async processOtherCodeTypes(code, codeType, declaredLanguage, extractedName, conversationId) {
    if (codeType === "solidity") {
      const fileName = `${extractedName}.sol`;
      await this.saveCodeFile(fileName, code, "solidity", conversationId);
      return {
        name: fileName,
        type: "solidity",
        language: "solidity",
        path: `/generated/${fileName}`,
        isContract: true
      };
    } else if (codeType === "react-component") {
      const fileName = extractedName.endsWith(".jsx") ? extractedName : `${extractedName}.jsx`;
      await this.saveCodeFile(fileName, code, "frontend", conversationId);
      return {
        name: fileName,
        type: "react-component",
        language: "jsx",
        path: `/generated/${fileName}`
      };
    } // Add more code type handling as needed
  
    return null;
  }
  
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

  async updateAgentKnowledge(agentId, trainingData) {
    try {
      const keywords = await this.extractKeywords(trainingData);
      for (const keyword of keywords) {
        await DatabaseService.query(
          'INSERT INTO agent_knowledge (agent_id, key_phrase, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
          [agentId, keyword, trainingData]
        );
      }
    } catch (error) {
      console.error('Error in updateAgentKnowledge:', error);
      throw error;
    }
  }
}

module.exports = new MessageProcessingService();

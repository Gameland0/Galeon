const OpenAIService = require("./openaiService");
const ClaudeService = require("./ClaudeService");

class ModelService {
  constructor() {}

  async modelGenerateCode(task, model, context, blockchainPlatform, gameType) {
    switch (model) {
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4o-mini":
        return await OpenAIService.createChatCompletion(
          this.buildCodeGenerationPrompt(
            task,
            model,
            blockchainPlatform,
            gameType
          ),
          model
        );
      case "claude-3-opus-20240229":
      case "claude-3-sonnet-20240229":
      case "claude-3-haiku-20240307":
        return await ClaudeService.createChatCompletion(
          this.buildCodeGenerationPrompt(
            task,
            context,
            blockchainPlatform,
            gameType
          ),
          model
        );
      default:
        return await OpenAIService.createChatCompletion(
          this.buildCodeGenerationPrompt(
            task,
            context,
            blockchainPlatform,
            gameType
          ),
          model
        );
    }
  }

  async modelReview(model, originalCode) {
    switch (model) {
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4o-mini":
        return await OpenAIService.createChatCompletion(
          this.buildCodeReviewPrompt(originalCode,model),
          model
        );
      case "claude-3-opus-20240229":
      case "claude-3-sonnet-20240229":
      case "claude-3-haiku-20240307":
        return await ClaudeService.createChatCompletion(
          this.buildCodeReviewPrompt(originalCode,model),
          model
        );
      default:
        return await OpenAIService.createChatCompletion(
          this.buildCodeReviewPrompt(originalCode,model),
          model
        );
    }
  }

  async modelUpdatedCode(model, originalCode, review) {
    switch (model) {
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4o-mini":
        return await OpenAIService.createChatCompletion(
          this.buildCodeUpdatePrompt(originalCode, review,model),
          model
        );
      case "claude-3-opus-20240229":
      case "claude-3-sonnet-20240229":
      case "claude-3-haiku-20240307":
        return await ClaudeService.createChatCompletion(
          this.buildCodeUpdatePrompt(originalCode, review,model),
          model
        );
      default:
        return await OpenAIService.createChatCompletion(
          this.buildCodeUpdatePrompt(originalCode, review,model),
          model
        );
    }
  }

  buildCodeGenerationPrompt(task, model, blockchainPlatform, gameType) {
    const developmentLanguage = this.getDevelopmentLanguage(blockchainPlatform);
    const gameTypeDescription =
      gameType === "fullChain"
        ? "implementing all logic on-chain"
        : "implementing core assets on-chain and game logic off-chain";
        
    switch (model) {
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4o-mini":
        return [
          {
            role: "system",
            content: `You are an expert blockchain developer specialized in ${blockchainPlatform} development for ${gameTypeDescription}.`,
          },
          {
            role: "user",
            content: `Using ${developmentLanguage}, implement the following task:\n\n${task.description}`,
          },
        ];
        case "claude-3-opus-20240229":
        case "claude-3-sonnet-20240229":
        case "claude-3-haiku-20240307":
          return [
            {
              role: "user",
              content: `You are an expert blockchain developer specialized in ${blockchainPlatform} development for ${gameTypeDescription}. Using ${developmentLanguage}, implement the following task:\n\n${task.description}`,
            },
          ];
        default:
          return [
            {
              role: "system",
              content: `You are an expert blockchain developer specialized in ${blockchainPlatform} development for ${gameTypeDescription}.`,
            },
            {
              role: "user",
              content: `Using ${developmentLanguage}, implement the following task:\n\n${task.description}`,
            },
          ];
    }
  }

  buildCodeReviewPrompt(code,model) {
    switch (model) {
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4o-mini":
        return [
          {
            role: 'system',
            content: 'You are an expert code reviewer. Review the provided code for security, optimization, and best practices.'
          },
          {
            role: 'user',
            content: `Review the following code:\n\n${code}`
          }
        ];
        case "claude-3-opus-20240229":
        case "claude-3-sonnet-20240229":
        case "claude-3-haiku-20240307":
          return [
            {
              role: 'user',
              content: `You are an expert code reviewer. Review the provided code for security, optimization, and best practices. Review the following code:\n\n${code}`
            }
          ];
        default:
          return [
            {
              role: 'system',
              content: 'You are an expert code reviewer. Review the provided code for security, optimization, and best practices.'
            },
            {
              role: 'user',
              content: `Review the following code:\n\n${code}`
            }
          ];
    }
  }

  buildCodeUpdatePrompt(originalCode, review,model) {
    switch (model) {
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4o-mini":
        return [
          {
            role: 'system',
            content: 'You are an expert code optimizer. Update the code based on the review feedback.'
          },
          {
            role: 'user',
            content: `Original code:\n${originalCode}\n\nReview feedback:\n${review}\n\nProvide the improved code:`
          }
        ];
        case "claude-3-opus-20240229":
        case "claude-3-sonnet-20240229":
        case "claude-3-haiku-20240307":
          return [
            {
              role: 'user',
              content: `You are an expert code optimizer. Update the code based on the review feedback. Original code:\n${originalCode}\n\nReview feedback:\n${review}\n\nProvide the improved code:`
            }
          ];
        default:
          return [
            {
              role: 'system',
              content: 'You are an expert code optimizer. Update the code based on the review feedback.'
            },
            {
              role: 'user',
              content: `Original code:\n${originalCode}\n\nReview feedback:\n${review}\n\nProvide the improved code:`
            }
          ];
    }
    
  }

  getDevelopmentLanguage(blockchainPlatform) {
    const platformLanguages = {
      ethereum: "Solidity",
      solana: "Rust",
      aptos: "Move",
      sui: "Move",
      ton: "FunC",
      cosmos: "CosmWasm (Rust)",
      cardano: "Plutus (Haskell)",
    };
    return platformLanguages[blockchainPlatform.toLowerCase()] || "Solidity";
  }
}

module.exports = new ModelService();

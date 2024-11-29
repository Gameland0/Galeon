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
            context,
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
          this.buildCodeReviewPrompt(originalCode),
          model
        );
      case "claude-3-opus-20240229":
      case "claude-3-sonnet-20240229":
      case "claude-3-haiku-20240307":
        return await ClaudeService.createChatCompletion(
          this.buildCodeReviewPrompt(originalCode),
          model
        );
      default:
        return await OpenAIService.createChatCompletion(
          this.buildCodeReviewPrompt(originalCode),
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
          this.buildCodeUpdatePrompt(originalCode, review),
          model
        );
      case "claude-3-opus-20240229":
      case "claude-3-sonnet-20240229":
      case "claude-3-haiku-20240307":
        return await ClaudeService.createChatCompletion(
          this.buildCodeUpdatePrompt(originalCode, review),
          model
        );
      default:
        return await OpenAIService.createChatCompletion(
          this.buildCodeUpdatePrompt(originalCode, review),
          model
        );
    }
  }

  buildCodeGenerationPrompt(task, context, blockchainPlatform, gameType) {
    const developmentLanguage = this.getDevelopmentLanguage(blockchainPlatform);
    const gameTypeDescription =
      gameType === "fullChain"
        ? "implementing all logic on-chain"
        : "implementing core assets on-chain and game logic off-chain";

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

  buildCodeReviewPrompt(code) {
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

  buildCodeUpdatePrompt(originalCode, review) {
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

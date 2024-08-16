const OpenAI = require('openai');
const blockchainService = require('./blockchainService');
const ipfsService = require('./ipfsService');

class AIService {
  constructor() {
    this.conversations = {};
    this.agentCreationStates = {};
    this.agentTypes = ['blockchain', 'data_analysis', 'task_automation', 'smart_contract', 'solidity'];
    this.userAgents = {};
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async processMessage(walletAddress, message) {
    console.log('Processing message for wallet:', walletAddress);
    console.log('Message:', message);

    if (message.toLowerCase().startsWith('create agent')) {
      return this.handleAgentCreation(walletAddress, message);
    }

    if (this.agentCreationStates[walletAddress]) {
      return this.continueAgentCreation(walletAddress, message);
    }

    return this.generateAIResponse(walletAddress, message);
  }

  async handleAgentCreation(walletAddress, message) {
    this.agentCreationStates[walletAddress] = { step: 'type' };
    return "Let's create a new agent. What type of agent would you like to create? Available types are: " + this.agentTypes.join(', ');
  }

  async continueAgentCreation(walletAddress, message) {
    const state = this.agentCreationStates[walletAddress];
    
    switch (state.step) {
      case 'type':
        if (this.agentTypes.includes(message.toLowerCase())) {
          state.type = message.toLowerCase();
          state.step = 'name';
          return `Great! You're creating a ${state.type} agent. What would you like to name your agent?`;
        } else {
          return `I'm sorry, but "${message}" is not a valid agent type. Available types are: ${this.agentTypes.join(', ')}. Please choose one of these types.`;
        }
      case 'name':
        state.name = message.trim();
        state.step = 'description';
        return `Your agent will be named "${state.name}". Now, please provide a brief description of its functionality:`;
      case 'description':
        state.description = message.trim();
        state.step = 'image';
        return "Great! Finally, please provide an image URL for your agent's avatar, or type 'generate' to automatically create one:";
      case 'image':
        state.image = message === 'generate' ? 'generated_image_url' : message;
        
        try {
          const newAgent = {
            name: state.name,
            type: state.type,
            description: state.description,
            image: state.image,
            createdAt: new Date().toISOString(),
            walletAddress: walletAddress
          };
          
          const ipfsHash = await ipfsService.addToIPFS(JSON.stringify(newAgent));
          await blockchainService.recordAgentCreation(walletAddress, ipfsHash);
          
          if (!this.userAgents[walletAddress]) {
            this.userAgents[walletAddress] = [];
          }
          this.userAgents[walletAddress].push(newAgent);
          
          delete this.agentCreationStates[walletAddress];
          
          return {
            message: `Congratulations! Your ${state.type} agent "${state.name}" has been created successfully and is now active. You can start interacting with it or proceed with further training.`,
            agent: newAgent
          };
        } catch (error) {
          console.error('Error creating agent:', error);
          delete this.agentCreationStates[walletAddress];
          return "I apologize, but an error occurred while creating the agent. Please try again later.";
        }
      default:
        delete this.agentCreationStates[walletAddress];
        return "I'm sorry, but there was an error in the agent creation process. Please start over by typing 'create agent'.";
    }
  }

  async generateAIResponse(walletAddress, message) {
    if (!this.conversations[walletAddress]) {
      this.conversations[walletAddress] = [];
    }

    this.conversations[walletAddress].push({ role: "user", content: message });

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are an AI assistant specialized in blockchain and agent creation." },
          ...this.conversations[walletAddress]
        ],
        max_tokens: 1500
      });

      const aiResponse = response.choices[0].message.content.trim();
      this.conversations[walletAddress].push({ role: "assistant", content: aiResponse });

      if (this.conversations[walletAddress].length > 10) {
        this.conversations[walletAddress] = this.conversations[walletAddress].slice(-10);
      }

      return [{ agent: { name: 'System', id: 'system' }, message: aiResponse }];
    } catch (error) {
      console.error('Error calling OpenAI:', error);
      return [{ agent: { name: 'System', id: 'system' }, message: "I'm sorry, I encountered an error while processing your request. Could you please try again?" }];
    }
  }

  async generateAirdropContract() {
    const contractCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Airdrop is Ownable {
    IERC20 public token;
    
    event AirdropExecuted(address indexed recipient, uint256 amount);
    
    constructor(IERC20 _token) {
        token = _token;
    }
    
    function airdrop(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "Recipients and amounts length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            require(token.transfer(recipients[i], amounts[i]), "Token transfer failed");
            emit AirdropExecuted(recipients[i], amounts[i]);
        }
    }
    
    function withdrawTokens(uint256 amount) external onlyOwner {
        require(token.transfer(owner(), amount), "Token transfer failed");
    }
    
    function getBalance() public view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
    `;
    return contractCode;
  }

  getAgents(walletAddress) {
    return this.userAgents[walletAddress] || [];
  }
}

module.exports = new AIService();


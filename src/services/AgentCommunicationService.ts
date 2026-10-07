import { EventEmitter } from 'events';
import { sendMessage, getAgentResponse, getConversationHistory } from '../services/api';
import mcpService from '../services/mcpService';

class AgentCommunicationService extends EventEmitter {
  private agents: Map<number, any> = new Map();

  registerAgent(agentId: number, agent: any) {
    this.agents.set(agentId, agent);
    this.on(`message_to_${agentId}`, this.handleMessage.bind(this, agentId));
  }

  async sendMessage(fromAgentId: number, toAgentId: number, message: string, conversationId: string) {
    console.log(`Agent ${fromAgentId} sending message to Agent ${toAgentId}: ${message}`);
    this.emit(`message_to_${toAgentId}`, fromAgentId, message, conversationId);
  }

  async handleMessage(toAgentId: number, fromAgentId: number, message: string, conversationId: string) {
    const agent = this.agents.get(toAgentId);
    if (!agent) {
      console.error(`Agent ${toAgentId} not found`);
      return;
    }

    console.log(`Agent ${toAgentId} received message from Agent ${fromAgentId}: ${message}`);
    
    try {
      // 获取对话历史作为上下文
      const context = await getConversationHistory(conversationId);
      
      // Check if message requires MCP capabilities
      let mcpResult = null;
      if (this.shouldUseMCP(message)) {
        mcpResult = await this.handleMCPRequest(toAgentId, message);
      }

      // Add MCP result to context if available
      const enhancedContext = mcpResult ? 
        [...context, { role: 'system', content: `MCP Result: ${JSON.stringify(mcpResult)}` }] : 
        context;
      
      const instruction = `Respond to the message from Agent ${fromAgentId}`;
      const response = await getAgentResponse(toAgentId, message, enhancedContext, instruction);

      console.log(`Agent ${toAgentId} responding to Agent ${fromAgentId}: ${response}`);
      this.emit(`message_to_${fromAgentId}`, toAgentId, response, conversationId);
      this.emit('agent_message', toAgentId, fromAgentId, response, conversationId);
    } catch (error) {
      console.error(`Error getting response from Agent ${toAgentId}:`, error);
    }
  }

  private shouldUseMCP(message: string): boolean {
    const mcpKeywords = ['balance', 'transfer', 'price', 'sol', 'token', 'nft', 'mint', 'deploy', 'swap', 'tps'];
    return mcpKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  private async handleMCPRequest(agentId: number, message: string) {
    try {
      const lowerMessage = message.toLowerCase();
      
      // Extract Solana address pattern (base58, 32-44 chars)
      const addressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
      const addresses = message.match(addressRegex) || [];
      
      if (lowerMessage.includes('balance')) {
        // Use first address found or a sample address
        const address = addresses[0] || '11111111111111111111111111111112'; // System Program address as example
        return await mcpService.callReadOnlyTool(agentId, 'balance', { address }, undefined, undefined);
      } else if (lowerMessage.includes('price')) {
        // Extract token symbol or use SOL as default
        const tokenMint = lowerMessage.includes('sol') ? 'SOL' : addresses[0] || 'SOL';
        return await mcpService.callReadOnlyTool(agentId, 'get_price', { tokenMint }, undefined, undefined);
      } else if (lowerMessage.includes('tps')) {
        return await mcpService.callReadOnlyTool(agentId, 'get_tps', {}, undefined, undefined);
      } else if (lowerMessage.includes('asset') || lowerMessage.includes('token info')) {
        const assetId = addresses[0] || '11111111111111111111111111111112';
        return await mcpService.callReadOnlyTool(agentId, 'get_asset', { assetId }, undefined, undefined);
      } else if (lowerMessage.includes('transfer')) {
        // Extract amount if possible
        const amountMatch = message.match(/(\d+(?:\.\d+)?)\s*(sol|SOL)/);
        const amount = amountMatch ? parseFloat(amountMatch[1]) : 0.001;
        
        return await mcpService.buildTransaction(agentId, 'transfer', {
          from: addresses[0] || 'user_wallet_address',
          to: addresses[1] || 'recipient_address',
          amount: amount
        }, undefined, undefined);
      }
      
      return null;
    } catch (error) {
      console.error('MCP request failed:', error);
      return { error: 'MCP operation failed' };
    }
  }

  async broadcastMessage(fromAgentId: number, message: string, conversationId: string) {
    for (let agentId of this.agents.keys()) {
      if (agentId !== fromAgentId) {
        await this.sendMessage(fromAgentId, agentId, message, conversationId);
      }
    }
  }
}

export default new AgentCommunicationService();

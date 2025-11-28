import { EventEmitter } from 'events';
import { sendMessage, getAgentResponse, getConversationHistory } from '../services/api';

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
      
      const instruction = `Respond to the message from Agent ${fromAgentId}`;
      const response = await getAgentResponse(toAgentId, message, context, instruction);

      console.log(`Agent ${toAgentId} responding to Agent ${fromAgentId}: ${response}`);
      this.emit(`message_to_${fromAgentId}`, toAgentId, response, conversationId);
      this.emit('agent_message', toAgentId, fromAgentId, response, conversationId);
    } catch (error) {
      console.error(`Error getting response from Agent ${toAgentId}:`, error);
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

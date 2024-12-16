const EventEmitter = require('events');
const AgentService = require('./agentService');

class AgentCommunicationService extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
  }

  registerAgent(agentId, agent) {
    this.agents.set(agentId, agent);
    this.on(`message_to_${agentId}`, this.handleMessage.bind(this, agentId));
  }

  async sendMessage(fromAgentId, toAgentId, message) {
    console.log(`Agent ${fromAgentId} sending message to Agent ${toAgentId}: ${message}`);
    this.emit(`message_to_${toAgentId}`, fromAgentId, message);
  }

  async handleMessage(toAgentId, fromAgentId, message) {
    const agent = this.agents.get(toAgentId);
    if (!agent) {
      console.error(`Agent ${toAgentId} not found`);
      return;
    }

    console.log(`Agent ${toAgentId} received message from Agent ${fromAgentId}: ${message}`);
    
    const response = await AgentService.getAgentResponse(toAgentId, message, [], `Respond to the message from Agent ${fromAgentId}`);
    
    console.log(`Agent ${toAgentId} responding to Agent ${fromAgentId}: ${response}`);
    this.emit(`message_to_${fromAgentId}`, toAgentId, response);
    this.emit('agent_message', toAgentId, fromAgentId, response);
  }

  async broadcastMessage(fromAgentId, message) {
    for (let agentId of this.agents.keys()) {
      if (agentId !== fromAgentId) {
        await this.sendMessage(fromAgentId, agentId, message);
      }
    }
  }
}

module.exports = new AgentCommunicationService();

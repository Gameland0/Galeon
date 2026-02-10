const EventEmitter = require('events');

class AgentBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.eventLog = [];
    this.agents = new Map();
  }

  register(agent) {
    this.agents.set(agent.name, agent);
    console.log(`[AgentBus] ${agent.name} registered (role: ${agent.role})`);
  }

  publish(fromAgent, eventName, payload) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      from: fromAgent,
      event: eventName,
      payload,
      timestamp: new Date().toISOString()
    };

    this.eventLog.push(event);
    if (this.eventLog.length > 100) this.eventLog.shift();

    this.emit(eventName, event);
    this.emit('*', event);
  }

  getStatus() {
    const agentStatuses = {};
    for (const [name, agent] of this.agents) {
      agentStatuses[name] = agent.getAgentStatus();
    }
    return {
      agents: agentStatuses,
      recentEvents: this.eventLog.slice(-20),
      totalEvents: this.eventLog.length
    };
  }
}

module.exports = new AgentBus();

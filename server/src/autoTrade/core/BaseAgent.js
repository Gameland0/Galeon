const EventEmitter = require('events');

class BaseAgent extends EventEmitter {
  constructor(name, role) {
    super();
    this.name = name;
    this.role = role;
    this.status = 'idle';
    this.startTime = Date.now();
    this.stats = { decisions: 0, errors: 0 };
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${this.name}]`;
    if (data !== null && data !== undefined) {
      console.log(`${timestamp} ${prefix} ${message}`, data);
    } else {
      console.log(`${timestamp} ${prefix} ${message}`);
    }
  }

  warn(message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${this.name}]`;
    if (data !== null && data !== undefined) {
      console.warn(`${timestamp} ${prefix} ${message}`, data);
    } else {
      console.warn(`${timestamp} ${prefix} ${message}`);
    }
  }

  error(message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${this.name}]`;
    if (data !== null && data !== undefined) {
      console.error(`${timestamp} ${prefix} ${message}`, data);
    } else {
      console.error(`${timestamp} ${prefix} ${message}`);
    }
  }

  publish(eventName, payload) {
    const AgentBus = require('./AgentBus');
    AgentBus.publish(this.name, eventName, payload);
  }

  setStatus(status) {
    this.status = status;
    this.publish('agent:status', { agent: this.name, status });
  }

  getAgentStatus() {
    return {
      name: this.name,
      role: this.role,
      status: this.status,
      uptime: Date.now() - this.startTime,
      stats: this.stats
    };
  }
}

module.exports = BaseAgent;

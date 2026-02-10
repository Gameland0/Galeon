const DeepSeekService = require('../../deepseekService');

class LLMSignalAnalyzer {
  constructor() {
    this.model = 'deepseek-chat';
    this.cache = new Map();
  }

  async analyzeSignal(signal, rawMessage) {
    if (!DeepSeekService.isAvailable) {
      return { score: 0.5, suggestion: 'NEUTRAL' };
    }

    const cacheKey = `${signal.token_symbol}_${signal.chain}_${Math.floor(Date.now() / 300000)}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    try {
      const response = await DeepSeekService.createChatCompletion([
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: this.buildPrompt(signal, rawMessage) }
      ], this.model, 500);

      const result = this.parseResponse(response);
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      return { score: 0.5, suggestion: 'NEUTRAL' };
    }
  }

  getSystemPrompt() {
    return `You are a crypto trading signal analyst. Analyze the trading signal and respond in JSON format only:
{
  "score": 0.0-1.0,
  "risk_level": "LOW|MEDIUM|HIGH",
  "analysis": "brief reason",
  "suggestion": "BUY|SKIP|NEUTRAL"
}
Rules:
- Score below 0.3 = likely scam/low quality
- Consider: token age, liquidity mentions, urgency language, price targets reasonableness
- Be skeptical of "100x" claims, brand new tokens, no contract address`;
  }

  buildPrompt(signal, rawMessage) {
    return `Signal Data:
- Token: ${signal.token_symbol}
- Chain: ${signal.chain}
- Entry Price: ${signal.entry_price_min} - ${signal.entry_price_max}
- Stop Loss: ${signal.stop_loss || 'N/A'}
- Take Profit: ${signal.take_profit_1 || 'N/A'}
- Contract: ${signal.contract_address || 'N/A'}

Raw Message:
${(rawMessage || '').substring(0, 500)}

Analyze this signal quality and risk.`;
  }

  parseResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.max(0, Math.min(1, parsed.score || 0.5)),
          risk_level: parsed.risk_level || 'MEDIUM',
          analysis: parsed.analysis || '',
          suggestion: parsed.suggestion || 'NEUTRAL'
        };
      }
    } catch (e) { /* parse error */ }
    return { score: 0.5, suggestion: 'NEUTRAL' };
  }
}

module.exports = new LLMSignalAnalyzer();

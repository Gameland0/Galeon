/**
 * GaleonBrain — Core Orchestrator
 *
 * The central nervous system of the trading agent.
 * Coordinates: Perception → Cognition → Decision → Execution → Verification → Evolution
 *
 * Open-source showcase version — core logic redacted.
 */

const DataDrivenCognition = require('./DataDrivenCognition');
const ControlSystem = require('./ControlSystem');
const ExperienceStore = require('./ExperienceStore');
const PaperTraderBridge = require('./PaperTraderBridge');

class GaleonBrain {
  constructor() {
    this.positions = [];
    this.verifications = [];
    this.predictions = [];
    this.cooldowns = {};
    this.stats = {
      total_thinks: 0, total_enters: 0, total_waits: 0,
      total_blocks: 0, total_exits: 0, verified_correct: 0, verified_wrong: 0
    };

    this.experienceStore = new ExperienceStore();
    this.ptBridge = new PaperTraderBridge();

    this.MAX_POSITIONS = 20;
    this.COOLDOWN_MS = 30 * 60 * 1000;
    this.maxVerifications = 200;
  }

  /**
   * Core think cycle — called for each signal
   * @param {Object} marketData - Multi-dimensional market snapshot
   * @returns {Object} { decision, cognition, elapsed_ms }
   */
  async think(marketData) {
    const startTime = Date.now();
    const token = marketData.token_symbol;
    this.stats.total_thinks++;

    // Cooldown check — skip if recently traded, but monitor existing positions
    const hasPosition = this.positions.some(p => p.token === token);
    if (!hasPosition && this.cooldowns[token] && Date.now() < this.cooldowns[token]) {
      return this._makeDecision(token, marketData, null, { action: 'wait', confidence: 0, reason: 'cooldown active' }, Date.now() - startTime);
    }

    // Step 1: Cognition — analyze market state, token stage, confidence
    const cognition = await this._buildCognition(marketData);

    // Step 2: Control System — apply red-line checks, adjust confidence, map to action
    const decision = ControlSystem.decide(marketData, cognition);

    // Step 3: Record prediction for future verification
    this._recordPrediction(token, marketData, cognition);

    // Step 4: Execute decision (enter/wait/block)
    /* proprietary — position management, sizing, cooldown logic */

    return this._makeDecision(token, marketData, cognition, decision, Date.now() - startTime);
  }

  /**
   * Build cognition from multi-dimensional data
   * Uses Rules Engine (DataDrivenCognition) + optional LLM (Thinker)
   */
  async _buildCognition(marketData) {
    const token = marketData.token_symbol;

    // Get PT context for this token
    const ptContext = await this.ptBridge.buildPromptContext(token);
    if (ptContext) marketData._pt_context = ptContext;

    // Get prior experiences for this token
    const experiences = this.experienceStore.getRelevant(token);

    // Rules Engine cognition (deterministic, always available)
    const rulesCognition = DataDrivenCognition.analyze(marketData, { experiences });

    // LLM cognition (optional, for complex scenarios)
    let llmCognition = null;
    if (rulesCognition.needs_llm) {
      /* proprietary — LLM prompt construction and parsing */
    }

    return this._mergeCognition(rulesCognition, llmCognition);
  }

  /**
   * Monitor existing positions — called each scan cycle
   * Checks price, stage changes, and exit conditions
   */
  async monitorPositions(getMarketData) {
    const exitSignals = [];

    for (const pos of this.positions) {
      const marketData = await getMarketData(pos.token);
      if (!marketData?.market?.price) continue;

      const currentPrice = marketData.market.price;
      const pnlPct = this._positionPnlPct(pos, currentPrice);
      const holdMinutes = (Date.now() - new Date(pos.entered_at).getTime()) / 60000;

      // Assess position — deterministic exit rules
      const guidance = this.assessPosition(pos, currentPrice, null, holdMinutes);

      if (guidance.auto_exit) {
        exitSignals.push(this.exitPosition(pos, currentPrice, guidance.reason, holdMinutes));
      }
    }

    return exitSignals;
  }

  /**
   * Position assessment — multi-layer exit logic
   * Includes: hard stop, time-decay stop, stage deterioration, take profit
   */
  assessPosition(pos, currentPrice, cognition, holdMinutes) {
    const pnlPct = this._positionPnlPct(pos, currentPrice);
    const ageMinutes = holdMinutes || (Date.now() - new Date(pos.entered_at).getTime()) / 60000;

    /* proprietary — exit thresholds, time-decay logic, stage-based exits */

    return { action: 'hold', auto_exit: false, reason: 'no exit trigger', pnl_pct: pnlPct };
  }

  /**
   * Exit position and trigger verification + learning
   */
  exitPosition(pos, currentPrice, reason, holdMinutes) {
    const pnlPct = this._positionPnlPct(pos, currentPrice);

    this.stats.total_exits++;
    this._verify(pos, currentPrice);
    this.positions = this.positions.filter(p => p.token !== pos.token);

    // Loss-based cooldown — larger loss = longer cooldown
    /* proprietary — cooldown duration logic */

    return { token: pos.token, action: 'exit', pnl_pct: pnlPct, reason };
  }

  /**
   * Verify trade outcome — feeds into learning loop
   */
  _verify(pos, currentPrice) {
    const pnlPct = this._positionPnlPct(pos, currentPrice);
    const correct = pnlPct > 0;

    if (correct) this.stats.verified_correct++;
    else this.stats.verified_wrong++;

    this.verifications.unshift({
      token: pos.token, signal_type: pos.signal_type,
      entry_price: pos.entry_price, verify_price: currentPrice,
      pnl_pct: Math.round(pnlPct * 100) / 100, correct,
      entry_stage: pos.cognition_at_entry.token_stage,
      entry_confidence: pos.cognition_at_entry.confidence,
      hold_minutes: Math.round((Date.now() - new Date(pos.entered_at).getTime()) / 60000)
    });
  }

  /**
   * PnL calculation — direction-aware (positive = profit for both LONG and SHORT)
   */
  _positionPnlPct(pos, currentPrice) {
    const raw = (currentPrice - pos.entry_price) / pos.entry_price * 100;
    return pos.signal_type === 'SHORT' ? -raw : raw;
  }

  /**
   * Record prediction for 4h verification
   */
  _recordPrediction(token, marketData, cognition) {
    /* proprietary — prediction recording with multi-timeframe forecasts */
  }

  /**
   * Verify past predictions against actual outcomes
   */
  async verifyPredictions() {
    /* proprietary — direction accuracy check, stage accuracy, bias calculation */
  }
}

module.exports = GaleonBrain;

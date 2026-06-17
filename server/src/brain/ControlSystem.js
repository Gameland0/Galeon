/**
 * ControlSystem — Decision Gate
 *
 * Maps cognition output to concrete trading actions.
 * Enforces red-line risk checks, adjusts confidence with market rules,
 * and determines final action: enter / wait / block.
 *
 * All parameters are dynamically tunable by RuleEvolver.
 *
 * Open-source showcase version — thresholds and rules redacted.
 */

let _dynamicParams = null;

function setDynamicParams(params) { _dynamicParams = params; }
function getParams() {
  return _dynamicParams || {
    confidence_min: '***',
    enter_small_threshold: '***',
    enter_full_threshold: '***',
    /* proprietary — 20+ tunable parameters */
  };
}

class ControlSystem {

  /**
   * Validate cognition output structure
   */
  static validate(cognition) {
    const errors = [];
    const validStages = ['discovery', 'accumulation', 'acceleration', 'exhaustion', 'distribution', 'decline', 'rug_danger'];
    if (!validStages.includes(cognition.token_stage)) errors.push(`invalid token_stage`);
    if (typeof cognition.confidence !== 'number') errors.push(`invalid confidence`);
    return { valid: errors.length === 0, errors };
  }

  /**
   * Red-line checks — highest priority, overrides everything
   * Blocks: honeypot, rug, extreme crash, dangerous stage+direction combos
   */
  static checkRedlines(marketData, cognition) {
    // Honeypot detection
    if (marketData.risk?.honeypot === true) {
      return { blocked: true, action: 'block', reason: 'honeypot detected' };
    }

    // Rug score too high
    if (marketData.risk?.rug_score > 0.7) {
      return { blocked: true, action: 'block', reason: `rug_score too high` };
    }

    // Price crash detection (token may be rugging/delisting)
    /* proprietary — crash threshold */

    // BTC extreme drop + LONG
    /* proprietary — macro red-line */

    // Self-learned stage+direction blocks (from trade data)
    /* proprietary — auto-discovered blocking rules */

    return { blocked: false };
  }

  /**
   * Main decision logic — confidence adjustment + action mapping
   */
  static decide(marketData, cognition) {
    // 1. Red-line check
    const redline = this.checkRedlines(marketData, cognition);
    if (redline.blocked) return redline;

    // 2. Minimum confidence gate
    const P = getParams();
    if (cognition.confidence < P.confidence_min) {
      return { action: 'wait', confidence: cognition.confidence, reason: 'confidence too low' };
    }

    // 3. Dynamic confidence adjustment based on market conditions
    let adjustedConf = cognition.confidence;
    const reasons = [];

    /* proprietary — 15+ adjustment rules:
     * - Weekday patterns
     * - BTC alignment
     * - Funding rate signals
     * - OI change patterns
     * - Stage penalties
     * - Risk-off environment
     * - Experience-based boost/penalty
     */

    // 4. Map adjusted confidence to action
    let action = 'wait';
    if (adjustedConf >= P.enter_full_threshold) action = 'enter_full';
    else if (adjustedConf >= P.enter_small_threshold) action = 'enter_small';

    // 5. Stage-based overrides
    /* proprietary — force reduce/block for dangerous stage+direction combos */

    return { action, confidence: adjustedConf, original_confidence: cognition.confidence, reasons };
  }
}

module.exports = { ControlSystem, setDynamicParams, getParams };

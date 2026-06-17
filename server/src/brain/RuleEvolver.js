/**
 * RuleEvolver — Self-Evolution Engine
 *
 * Automatically tunes ControlSystem parameters based on accumulated
 * trade outcomes. Includes overfitting protection.
 *
 * Open-source showcase version — bounds and adjustment logic redacted.
 */

const fs = require('fs');
const path = require('path');

const PARAM_BOUNDS = {
  /* proprietary — min/max bounds for each tunable parameter */
};

class RuleEvolver {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.paramsFile = path.join(dataDir, 'control-params.json');
    this.params = this._loadParams();
    this.history = { adjustments: [] };
  }

  /**
   * Analyze trade outcomes and propose parameter adjustments
   * @param {Array} verifications - Recent trade verification records
   * @param {Object} predictionStats - Prediction accuracy by stage/direction
   * @returns {Array} adjustments - Proposed changes with reasons
   */
  analyzeAndPropose(verifications, predictionStats) {
    const adjustments = [];

    // 1. Stage penalty tuning — if a stage has low WR, increase its penalty
    /* proprietary — stage analysis and penalty adjustment logic */

    // 2. Entry threshold tuning — if low-confidence trades are losing, raise threshold
    /* proprietary — threshold optimization logic */

    // 3. OI crash sensitivity — tune based on OI-related loss patterns
    /* proprietary — OI parameter tuning */

    return adjustments;
  }

  /**
   * Apply proposed adjustments with safety checks
   * - Overfitting protection: block same-direction adjustments after 3 consecutive
   * - Bounded optimization: all params clamped to safe ranges
   */
  applyAdjustments(adjustments) {
    const applied = [];

    for (const adj of adjustments) {
      // Overfitting check: same direction 3x in a row → block
      const recentSameParam = this.history.adjustments
        .filter(h => h.param === adj.param)
        .slice(-3);

      if (recentSameParam.length >= 3) {
        const allSameDir = recentSameParam.every(h =>
          (h.new_value - h.old_value > 0) === (adj.delta > 0)
        );
        if (allSameDir) {
          console.log(`[RuleEvolver] Blocked ${adj.param}: same direction 3x in a row (overfitting protection)`);
          continue;
        }
      }

      // Apply with bounds
      const oldVal = this.params[adj.param];
      const newVal = this._applyBounded(adj.param, oldVal, adj.delta);

      if (newVal !== oldVal) {
        this.params[adj.param] = newVal;
        this.history.adjustments.push({
          timestamp: new Date().toISOString(),
          param: adj.param, old_value: oldVal, new_value: newVal,
          reason: adj.reason
        });
        applied.push(adj);
      }
    }

    if (applied.length > 0) this._saveParams();
    return applied;
  }

  _applyBounded(param, current, delta) {
    const bounds = PARAM_BOUNDS[param];
    if (!bounds) return current + delta;
    return Math.max(bounds.min, Math.min(bounds.max, current + delta));
  }

  _loadParams() {
    try {
      const data = JSON.parse(fs.readFileSync(this.paramsFile, 'utf8'));
      return data.params || {};
    } catch { return {}; }
  }

  _saveParams() {
    const data = { params: this.params, updated_at: new Date().toISOString(), version: (this._loadVersion() + 1) };
    fs.writeFileSync(this.paramsFile, JSON.stringify(data, null, 2));
  }

  _loadVersion() {
    try { return JSON.parse(fs.readFileSync(this.paramsFile, 'utf8')).version || 0; } catch { return 0; }
  }

  getStatus() {
    return {
      total_adjustments: this.history.adjustments.length,
      current_params: this.params,
      last_adjustment: this.history.adjustments[this.history.adjustments.length - 1] || null
    };
  }
}

module.exports = RuleEvolver;

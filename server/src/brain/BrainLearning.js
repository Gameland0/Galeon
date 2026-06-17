/**
 * BrainLearning — Learning Loop
 *
 * Runs periodic learning cycles:
 * 1. Analyze prediction accuracy by direction, stage, confidence
 * 2. Detect systematic biases
 * 3. Generate calibration adjustments
 * 4. Apply validated changes to control-params
 *
 * Open-source showcase version — analysis thresholds redacted.
 */

const fs = require('fs');
const path = require('path');

class BrainLearning {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.reports = [];
    this.adjustmentHistory = [];
  }

  /**
   * Run a full learning cycle
   * @param {Array} predictions - All verified predictions
   * @returns {Object} report - { accuracy, adjustments, calibration }
   */
  runLearningCycle(predictions) {
    const verified = predictions.filter(p => p.status === 'verified');
    if (verified.length < 10) return null;

    const overall = this._analyzeOverall(verified);
    const byStage = this._analyzeByStage(verified);
    const byDirection = this._analyzeByDirection(verified);
    const byConfidence = this._analyzeByConfidence(verified);
    const worstPatterns = this._findWorstPatterns(verified);

    const adjustments = this._generateAdjustments(verified);

    const report = {
      timestamp: new Date().toISOString(),
      sample_size: verified.length,
      direction_accuracy: overall.directionAccuracy,
      stage_accuracy: overall.stageAccuracy,
      avg_bias: overall.bias,
      adjustments,
      worst_patterns: worstPatterns
    };

    this.reports.push(report);
    return report;
  }

  /**
   * Apply validated adjustments to control-params
   * Maps learning insights → concrete parameter changes
   */
  applyAdjustments(report) {
    if (!report.adjustments || report.adjustments.length === 0) return [];

    const applied = [];
    const paramsFile = path.join(this.dataDir, 'control-params.json');
    let paramsData;
    try { paramsData = JSON.parse(fs.readFileSync(paramsFile, 'utf8')); }
    catch { paramsData = { params: {}, version: 0 }; }

    let paramsChanged = false;

    for (const adj of report.adjustments) {
      if (adj.auto_apply && adj.confidence >= 0.7) {
        // Map learning parameter to control-params
        /* proprietary — parameter mapping logic */

        this.adjustmentHistory.push({
          timestamp: new Date().toISOString(),
          parameter: adj.parameter,
          old_value: adj.current_value,
          new_value: adj.suggested_value,
          reason: adj.reason
        });
        applied.push(adj);
      }
    }

    if (paramsChanged) {
      paramsData.version = (paramsData.version || 0) + 1;
      paramsData.updated_at = new Date().toISOString();
      fs.writeFileSync(paramsFile, JSON.stringify(paramsData, null, 2));
    }

    return applied;
  }

  // ==================== Analysis Methods ====================

  _analyzeOverall(verified) {
    const dirCorrect = verified.filter(p => p.direction_correct).length;
    const stageCorrect = verified.filter(p => p.stage_correct).length;
    const avgPredicted = verified.reduce((s, p) => s + (p.predicted_change_pct || 0), 0) / verified.length;
    const avgActual = verified.reduce((s, p) => s + (p.actual_change_pct || 0), 0) / verified.length;

    return {
      directionAccuracy: Math.round(dirCorrect / verified.length * 100),
      stageAccuracy: Math.round(stageCorrect / verified.length * 100),
      bias: Math.round((avgPredicted - avgActual) * 100) / 100
    };
  }

  _analyzeByStage(verified) {
    /* proprietary — per-stage accuracy breakdown */
    return {};
  }

  _analyzeByDirection(verified) {
    /* proprietary — per-direction accuracy breakdown */
    return {};
  }

  _analyzeByConfidence(verified) {
    /* proprietary — confidence band accuracy analysis */
    return {};
  }

  _findWorstPatterns(verified) {
    /* proprietary — pattern discovery for systematic errors */
    return [];
  }

  _generateAdjustments(verified) {
    /* proprietary — adjustment generation with auto_apply flags */
    return [];
  }
}

module.exports = BrainLearning;

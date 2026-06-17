/**
 * PaperTraderBridge — Brain ↔ Paper Trader Integration
 *
 * Reads PT data (positions, trades, patterns, OI history) to provide
 * Brain with execution context and cross-validation data.
 *
 * Three layers:
 * 1. Knowledge — PT pattern library, win/loss conditions → Brain cognition
 * 2. Validation — PT trade results → cross-calibrate Brain judgments
 * 3. Real-time — PT live positions/signals → assist current decisions
 *
 * Open-source showcase version — full implementation, no proprietary logic.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PT_DATA_DIR = path.join(__dirname, '../services/paper-trade-data');
const PT_API = 'http://localhost:9847/api/data';

class PaperTraderBridge {
  constructor() {
    this.cache = { api: null, apiUpdated: 0, files: {}, filesUpdated: 0 };
    this.CACHE_TTL_API = 30 * 1000;
    this.CACHE_TTL_FILES = 5 * 60 * 1000;
  }

  // ==================== Data Access ====================

  async getLiveData() {
    if (this.cache.api && Date.now() - this.cache.apiUpdated < this.CACHE_TTL_API) return this.cache.api;
    try {
      const r = await axios.get(PT_API, { timeout: 5000 });
      this.cache.api = r.data;
      this.cache.apiUpdated = Date.now();
      return r.data;
    } catch { return this.cache.api; }
  }

  _readFile(name) {
    const key = name;
    if (this.cache.files[key] && Date.now() - this.cache.filesUpdated < this.CACHE_TTL_FILES) return this.cache.files[key];
    try {
      const data = JSON.parse(fs.readFileSync(path.join(PT_DATA_DIR, name), 'utf8'));
      this.cache.files[key] = data;
      this.cache.filesUpdated = Date.now();
      return data;
    } catch { return null; }
  }

  getLearning() { return this._readFile('learning.json'); }
  getOIHistory() { return this._readFile('oi_history.json'); }
  getWatchlist() { return this._readFile('watchlist.json'); }
  getTrades() { return this._readFile('trades.json'); }

  // ==================== Layer 1: Knowledge ====================

  getPatternKnowledge() {
    const learning = this.getLearning();
    if (!learning) return null;

    const pl = learning.patterns?.patternLibrary || {};
    const wc = learning.patterns?.winConditions || {};
    const fg = learning.patterns?.frequentGainers || {};

    return {
      topWinPatterns: Object.entries(pl).filter(([_, v]) => v.count >= 5 && v.avgChange > 20).slice(0, 5),
      winConditions: Object.entries(wc).filter(([_, v]) => v.count >= 2).slice(0, 5),
      topGainers: Object.entries(fg).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
    };
  }

  // ==================== Layer 2: Validation ====================

  getTradeResults() {
    const allTrades = this.getTrades() || [];
    if (allTrades.length === 0) return null;

    const recent = allTrades.slice(-50);
    const wins = recent.filter(t => (t.total_pnl || 0) > 0);
    const losses = recent.filter(t => (t.total_pnl || 0) <= 0);

    return {
      total_trades: allTrades.length,
      recent_win_rate: recent.length > 0 ? Math.round(wins.length / recent.length * 100) : 0,
      avg_win: wins.length > 0 ? wins.reduce((s, t) => s + t.total_pnl, 0) / wins.length : 0,
      avg_loss: losses.length > 0 ? losses.reduce((s, t) => s + t.total_pnl, 0) / losses.length : 0
    };
  }

  // ==================== Layer 3: Real-time ====================

  async getTokenContext(token) {
    const live = await this.getLiveData();
    if (!live) return null;

    const position = (live.positions || []).find(p =>
      (p.token_symbol || '').toUpperCase() === token.toUpperCase()
    );

    return position ? {
      direction: position.direction,
      entry_price: position.entry_price,
      health: position._health,
      oi_stage: position._oiStage,
    } : null;
  }

  // ==================== Prompt Context ====================

  async buildPromptContext(token) {
    const [tokenCtx, patterns, market] = await Promise.all([
      this.getTokenContext(token),
      this.getPatternKnowledge(),
      this.getLiveData()
    ]);

    const parts = [];
    if (tokenCtx) parts.push(`[PT POSITION] ${token}: ${tokenCtx.direction}, health=${tokenCtx.health}`);
    if (patterns?.topWinPatterns?.length) parts.push(`[PT PATTERNS] ${patterns.topWinPatterns.length} win patterns loaded`);
    if (market?.state) parts.push(`[PT STATUS] capital=$${market.state.capital?.toFixed(0)} winRate=${Math.round(market.state.win_count / (market.state.win_count + market.state.loss_count) * 100)}%`);

    return parts.length > 0 ? parts.join('\n') : null;
  }
}

module.exports = PaperTraderBridge;

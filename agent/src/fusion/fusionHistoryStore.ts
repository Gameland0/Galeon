/**
 * FusionHistoryStore — Circular buffer of past fusion decision snapshots
 *
 * Keeps up to MAX_SNAPSHOTS (500) cycle snapshots, persisted to disk.
 * Each snapshot is one full evaluateMarket() call result.
 * At 15-second polling → ~2 hours of live history retained.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MarketDecision, FusionLabel } from './fip-types';

const STORE_PATH = path.join(__dirname, '../../data/fusion-history.json');
const MAX_SNAPSHOTS = 5000;
const SAVE_EVERY_N = 5; // persist every 5 records to reduce disk I/O

export interface DecisionSnapshot {
  timestamp: string;     // ISO when this cycle ran
  decisions: MarketDecision[];
}

/** Per-symbol score/action at a single point in time */
export interface SymbolPoint {
  timestamp: string;
  score: number;
  action: string;
  label: FusionLabel;
  agentCount: number;
}

/** Aggregated label distribution across recent cycles */
export interface LabelStat {
  label: FusionLabel;
  count: number;
  pct: number;
}

export class FusionHistoryStore {
  private snapshots: DecisionSnapshot[] = [];
  private unsavedCount = 0;

  constructor() {
    this.load();
  }

  record(decisions: MarketDecision[]): void {
    // Record even empty cycles so timeline stays continuous
    this.snapshots.push({
      timestamp: new Date().toISOString(),
      decisions: decisions || [],
    });
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.splice(0, this.snapshots.length - MAX_SNAPSHOTS);
    }
    this.unsavedCount++;
    if (this.unsavedCount >= SAVE_EVERY_N) {
      this.save();
      this.unsavedCount = 0;
    }
  }

  /** Latest N snapshots (newest first) */
  getHistory(limit = 60): DecisionSnapshot[] {
    return this.snapshots.slice(-limit).reverse();
  }

  /** Per-symbol score trend over last N cycles */
  getSymbolHistory(symbol: string, limit = 60): SymbolPoint[] {
    return this.snapshots
      .slice(-limit)
      .flatMap(snap => {
        const d = snap.decisions.find(x => x.symbol === symbol);
        if (!d) return [];
        return [{
          timestamp: snap.timestamp,
          score: d.score,
          action: d.action,
          label: d.label,
          agentCount: d.externalContributors.length,
        }];
      });
  }

  /** All symbols seen in history */
  getKnownSymbols(): string[] {
    const seen = new Set<string>();
    for (const snap of this.snapshots) {
      for (const d of snap.decisions) seen.add(d.symbol);
    }
    return [...seen].sort();
  }

  /** Label distribution in a recent time window (default: all retained) */
  getLabelDistribution(windowMs?: number): LabelStat[] {
    const cutoff = windowMs ? Date.now() - windowMs : 0;
    const counts = new Map<FusionLabel, number>();
    let total = 0;
    for (const snap of this.snapshots) {
      if (new Date(snap.timestamp).getTime() < cutoff) continue;
      for (const d of snap.decisions) {
        counts.set(d.label, (counts.get(d.label) || 0) + 1);
        total++;
      }
    }
    if (total === 0) return [];
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }));
  }

  /**
   * Compact timeline: one data point per cycle containing score per symbol.
   * Used for multi-symbol score trend chart.
   */
  getScoreTimeline(symbols: string[], limit = 60): {
    timestamp: string;
    scores: Record<string, number>;
    actions: Record<string, string>;
  }[] {
    return this.snapshots.slice(-limit).map(snap => {
      const scores: Record<string, number> = {};
      const actions: Record<string, string> = {};
      for (const sym of symbols) {
        const d = snap.decisions.find(x => x.symbol === sym);
        if (d) { scores[sym] = d.score; actions[sym] = d.action; }
      }
      return { timestamp: snap.timestamp, scores, actions };
    });
  }

  get size(): number { return this.snapshots.length; }

  private load(): void {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as DecisionSnapshot[];
        if (Array.isArray(data)) {
          // Keep only the latest MAX_SNAPSHOTS entries
          this.snapshots = data.slice(-MAX_SNAPSHOTS);
          console.log(`[FusionHistoryStore] Loaded ${this.snapshots.length} snapshot(s) from disk`);
        }
      }
    } catch {
      /* start fresh if file is corrupt */
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.snapshots));
    } catch (err: any) {
      console.error('[FusionHistoryStore] Save error:', err.message);
    }
  }
}

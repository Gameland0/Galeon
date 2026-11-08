/**
 * Trust Store — Agent lifecycle, trust scoring, and anomaly tracking
 *
 * Lifecycle: PROBATION → VALIDATED → TRUSTED (or SUSPENDED)
 *
 * PROBATION (first 10 signals): intel logged but zero weight in fusion
 * VALIDATED (10+ signals, low anomaly): reduced weight (0.5x)
 * TRUSTED  (20+ evaluated, >60% accuracy): full weight (1.0x)
 * SUSPENDED (anomalyScore ≥ 70): zero weight, requires admin unsuspend
 *
 * Persisted to data/trust-store.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { TrustState, AnomalyEvent, AgentTrustProfile } from './fip-types';

const STORE_PATH = path.join(__dirname, '../../data/trust-store.json');

// Thresholds
const PROBATION_SIGNAL_COUNT = 10;
const VALIDATED_EVAL_COUNT = 20;
const VALIDATED_MIN_ACCURACY = 0.6;
const SUSPEND_ANOMALY_SCORE = 70;
const DEMOTE_ACCURACY = 0.4;
const ANOMALY_DECAY_PER_HOUR = 5;
const MAX_ANOMALIES = 50;

const TRUST_MULTIPLIERS: Record<TrustState, number> = {
  PROBATION: 0.0,
  VALIDATED: 0.5,
  TRUSTED: 1.0,
  SUSPENDED: 0.0,
};

export class TrustStore {
  private profiles = new Map<string, AgentTrustProfile>();

  constructor() {
    this.load();
  }

  getOrCreate(agentId: string): AgentTrustProfile {
    let profile = this.profiles.get(agentId);
    if (!profile) {
      profile = {
        agentId,
        state: 'PROBATION',
        signalCount: 0,
        evaluatedCount: 0,
        correctCount: 0,
        accuracy: null,
        trustMultiplier: TRUST_MULTIPLIERS.PROBATION,
        anomalies: [],
        anomalyScore: 0,
        stateHistory: [{ state: 'PROBATION', at: new Date().toISOString(), reason: 'Agent registered' }],
        lastSignalAt: null,
        registeredAt: new Date().toISOString(),
      };
      this.profiles.set(agentId, profile);
      this.save();
    }
    return profile;
  }

  recordSignal(agentId: string): void {
    const p = this.getOrCreate(agentId);
    p.signalCount++;
    p.lastSignalAt = new Date().toISOString();

    // Decay anomaly score: -1 per clean signal (no anomaly recorded this cycle)
    if (p.anomalyScore > 0) {
      p.anomalyScore = Math.max(0, p.anomalyScore - 1);
    }

    // State transitions
    if (p.state === 'PROBATION' && p.signalCount >= PROBATION_SIGNAL_COUNT && p.anomalyScore < 30) {
      this.transition(p, 'VALIDATED', `Passed probation: ${p.signalCount} signals, anomaly score ${p.anomalyScore}`);
    }
    if (p.state === 'VALIDATED' && p.evaluatedCount >= VALIDATED_EVAL_COUNT
        && (p.accuracy ?? 0) >= VALIDATED_MIN_ACCURACY && p.anomalyScore < 20) {
      this.transition(p, 'TRUSTED', `Promoted: accuracy ${((p.accuracy ?? 0) * 100).toFixed(0)}%, ${p.evaluatedCount} evaluated`);
    }

    this.save();
  }

  recordAnomaly(agentId: string, anomaly: AnomalyEvent): void {
    const p = this.getOrCreate(agentId);
    p.anomalies.push(anomaly);
    if (p.anomalies.length > MAX_ANOMALIES) {
      p.anomalies = p.anomalies.slice(-MAX_ANOMALIES);
    }

    // Score bump — CRITICAL is immediate danger, WARNING is gradual concern
    p.anomalyScore += anomaly.severity === 'CRITICAL' ? 25 : 5;
    p.anomalyScore = Math.min(100, p.anomalyScore);

    // Auto-suspend
    if (p.anomalyScore >= SUSPEND_ANOMALY_SCORE && p.state !== 'SUSPENDED') {
      this.transition(p, 'SUSPENDED', `Anomaly score ${p.anomalyScore} exceeded threshold (${anomaly.type})`);
    }

    console.log(`[TrustStore] ${agentId}: anomaly ${anomaly.type} (${anomaly.severity}), score=${p.anomalyScore}, state=${p.state}`);
    this.save();
  }

  recordOutcome(agentId: string, correct: boolean): void {
    const p = this.getOrCreate(agentId);
    p.evaluatedCount++;
    if (correct) p.correctCount++;
    p.accuracy = p.evaluatedCount > 0 ? parseFloat((p.correctCount / p.evaluatedCount).toFixed(3)) : null;

    // Demote if accuracy drops
    if (p.state === 'TRUSTED' && p.evaluatedCount >= 20 && (p.accuracy ?? 0) < DEMOTE_ACCURACY) {
      this.transition(p, 'VALIDATED', `Accuracy dropped to ${((p.accuracy ?? 0) * 100).toFixed(0)}%`);
    }

    this.save();
  }

  getTrustMultiplier(agentId: string): number {
    const p = this.profiles.get(agentId);
    if (!p) return 0.0; // unknown agent = zero trust
    return p.trustMultiplier;
  }

  getState(agentId: string): TrustState {
    return this.getOrCreate(agentId).state;
  }

  getReport(agentId: string): AgentTrustProfile {
    return this.getOrCreate(agentId);
  }

  getAllReports(): AgentTrustProfile[] {
    return Array.from(this.profiles.values());
  }

  unsuspend(agentId: string): void {
    const p = this.getOrCreate(agentId);
    if (p.state !== 'SUSPENDED') return;
    p.anomalyScore = 0;
    p.anomalies = [];
    this.transition(p, 'PROBATION', 'Admin unsuspended — reset to probation');
    p.signalCount = 0;
    this.save();
  }

  /** Set a known agent (like galeon-brain) to TRUSTED directly */
  setTrusted(agentId: string): void {
    const p = this.getOrCreate(agentId);
    if (p.state !== 'TRUSTED') {
      this.transition(p, 'TRUSTED', 'Built-in agent — auto-trusted');
      this.save();
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private transition(p: AgentTrustProfile, newState: TrustState, reason: string): void {
    const oldState = p.state;
    p.state = newState;
    p.trustMultiplier = TRUST_MULTIPLIERS[newState];
    p.stateHistory.push({ state: newState, at: new Date().toISOString(), reason });
    console.log(`[TrustStore] ${p.agentId}: ${oldState} → ${newState} (${reason})`);

    // Sync to NEAR chain (async, non-blocking)
    this.syncToChain(p, reason).catch(() => {});
  }

  private async syncToChain(p: AgentTrustProfile, reason: string): Promise<void> {
    try {
      const { syncTrustScoreToChain, registerAgentOnChain } = await import('../services/nearTrustChain');

      // Ensure agent is registered on-chain first
      await registerAgentOnChain(p.agentId, p.agentId);

      await syncTrustScoreToChain({
        agentId: p.agentId,
        state: p.state,
        signalCount: p.signalCount,
        evaluatedCount: p.evaluatedCount,
        correctCount: p.correctCount,
        anomalyScore: p.anomalyScore,
        suspensionReason: p.state === 'SUSPENDED' ? reason : undefined,
      });
    } catch (err: any) {
      console.warn(`[TrustStore] Chain sync skipped for ${p.agentId}: ${err.message}`);
    }
  }

  private decayAnomalyScore(p: AgentTrustProfile): void {
    if (p.anomalyScore <= 0 || !p.lastSignalAt) return;
    const hoursSinceLast = (Date.now() - new Date(p.lastSignalAt).getTime()) / (60 * 60 * 1000);
    const decay = Math.floor(hoursSinceLast * ANOMALY_DECAY_PER_HOUR);
    if (decay > 0) {
      p.anomalyScore = Math.max(0, p.anomalyScore - decay);
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as AgentTrustProfile[];
        for (const p of data) {
          this.profiles.set(p.agentId, p);
        }
        console.log(`[TrustStore] Loaded ${this.profiles.size} profile(s)`);
      }
    } catch { /* start fresh */ }
  }

  private save(): void {
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(Array.from(this.profiles.values()), null, 2));
    } catch (err: any) {
      console.error('[TrustStore] Save error:', err.message);
    }
  }
}

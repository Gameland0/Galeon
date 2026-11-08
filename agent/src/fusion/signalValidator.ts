/**
 * Signal Validator — Real-time anomaly detection for external agent intelligence
 *
 * Checks every incoming signal against 8 anomaly patterns:
 * 1. Format check       — required fields present
 * 2. Timestamp freshness — not stale (>10 min)
 * 3. Rate limiting       — not flooding (>20/min)
 * 4. Flip-flop           — changing direction >5 times in 1h
 * 5. Extreme confidence  — last 5 signals all conf ≥ 95
 * 6. Stale replay        — sending identical data
 * 7. Monotone            — last 10 signals all identical direction
 * 8. Pump pattern        — always bullish on same obscure token
 */

import { AgentIntelligence, AnomalyType, SignalValidationResult, BLOCKED_SYMBOLS, MAJOR_SYMBOLS } from './fip-types';
import * as crypto from 'crypto';

interface SignalRecord {
  timestamp: number;
  symbol: string;
  direction: string;  // BULLISH, BEARISH, NEUTRAL, or derived
  dataHash: string;
  confidence?: number;
}

const MAX_RECORDS = 200;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;   // 10 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000;       // 1 minute
const RATE_LIMIT_MAX = 60;                     // Allow high-frequency polling (agents return multiple coins per poll)
const FLIPFLOP_WINDOW_MS = 60 * 60 * 1000;   // 1 hour
const FLIPFLOP_MAX = 10;                       // Allow some natural direction changes with market movement

export class SignalValidator {
  /** agentId → recent signal records */
  private history = new Map<string, SignalRecord[]>();

  validate(agentId: string, intel: AgentIntelligence): SignalValidationResult {
    const warnings: string[] = [];
    const anomalies: AnomalyType[] = [];
    let rejected = false;
    let rejectionReason: string | undefined;

    const records = this.history.get(agentId) || [];

    // Extract direction from typed intelligence data
    const direction = this.extractDirection(intel);
    const confidence = this.extractConfidence(intel);
    const dataHash = crypto.createHash('md5').update(JSON.stringify(intel.data) + intel.symbol).digest('hex').slice(0, 12);
    const now = Date.now();

    // ── 1. Format check ──
    if (!intel.symbol || !intel.data || !intel.data.capability) {
      return { valid: false, warnings: ['Missing required fields'], rejected: true, rejectionReason: 'Invalid signal format', anomaliesDetected: [] };
    }

    // ── 1b. Injection attack detection ──
    // Scan all string fields for SQL injection, XSS, command injection, prompt injection
    const allText = this.extractAllText(intel);
    const injectionPatterns = [
      { pattern: /['";]\s*(OR|AND|DROP|DELETE|INSERT|UPDATE|SELECT|UNION)\b/i, label: 'SQL injection' },
      { pattern: /<script[\s>]|javascript:|on\w+\s*=/i, label: 'XSS injection' },
      { pattern: /[;|&`]\s*(rm|cat|curl|wget|nc|bash|sh|eval|exec)\b/i, label: 'Command injection' },
      { pattern: /\{\{.*\}\}|__proto__|constructor\s*\[/i, label: 'Prototype pollution' },
      { pattern: /ignore\s+(previous|above|all)\s+(instructions?|prompts?)/i, label: 'Prompt injection' },
      { pattern: /system\s*\(\s*["']/i, label: 'Code execution' },
    ];
    for (const { pattern, label } of injectionPatterns) {
      if (pattern.test(allText)) {
        anomalies.push('INJECTION_ATTACK');
        warnings.push(`${label} detected in signal data`);
        rejected = true;
        rejectionReason = `Security: ${label} detected`;
      }
    }

    // ── 1c. Malicious content detection ──
    // Keywords that suggest the agent is trying to manipulate trading or steal funds
    const maliciousPatterns = [
      { pattern: /\b(transfer|send|withdraw|转账|提现|提币)\b/i, label: 'Transfer/withdraw attempt' },
      { pattern: /\b(sell_all|dump_all|liquidate|清仓|抛售|全部卖出)\b/i, label: 'Mass liquidation command' },
      { pattern: /\b(private_key|secret_key|seed_phrase|助记词|私钥)\b/i, label: 'Key/seed extraction' },
      { pattern: /\b(approve|allowance|setApprovalForAll|授权)\b/i, label: 'Token approval manipulation' },
      { pattern: /\b(rug_pull|rugpull|exit_scam|跑路)\b/i, label: 'Rug pull signal' },
      { pattern: /0x[a-fA-F0-9]{40,}/i, label: 'Suspicious wallet address in signal' },
      { pattern: /\b(urgent|immediately|now_or_never|立即|紧急)\b.*\b(buy|sell|long|short)\b/i, label: 'FOMO/urgency manipulation' },
    ];
    for (const { pattern, label } of maliciousPatterns) {
      if (pattern.test(allText)) {
        anomalies.push('MALICIOUS_CONTENT');
        warnings.push(`${label} detected`);
        rejected = true;
        rejectionReason = `Security: ${label}`;
      }
    }

    // ── 1d. Field overflow / abnormal values ──
    if (allText.length > 5000) {
      anomalies.push('FIELD_OVERFLOW');
      warnings.push(`Signal data abnormally large: ${allText.length} chars`);
      rejected = true;
      rejectionReason = 'Field overflow: signal data too large';
    }
    const d = intel.data as any;
    if (d.confidence !== undefined && (d.confidence < 0 || d.confidence > 100)) {
      anomalies.push('FIELD_OVERFLOW');
      warnings.push(`Confidence out of range: ${d.confidence}`);
    }
    if (d.trend_strength !== undefined && (d.trend_strength < 0 || d.trend_strength > 1)) {
      anomalies.push('FIELD_OVERFLOW');
      warnings.push(`Trend strength out of range: ${d.trend_strength}`);
    }
    if (d.buy_sell_imbalance !== undefined && (d.buy_sell_imbalance < -1 || d.buy_sell_imbalance > 1)) {
      anomalies.push('FIELD_OVERFLOW');
      warnings.push(`Imbalance out of range: ${d.buy_sell_imbalance}`);
    }

    // ── 2. Timestamp freshness ──
    const signalAge = now - new Date(intel.timestamp).getTime();
    if (signalAge > STALE_THRESHOLD_MS) {
      anomalies.push('TIMESTAMP_STALE');
      warnings.push(`Signal is ${Math.round(signalAge / 60000)}min old`);
      rejected = true;
      rejectionReason = `Stale signal: ${Math.round(signalAge / 60000)}min old`;
    }

    // ── 3. Rate limiting ──
    const recentCount = records.filter(r => now - r.timestamp < RATE_LIMIT_WINDOW_MS).length;
    if (recentCount >= RATE_LIMIT_MAX) {
      anomalies.push('RATE_FLOOD');
      warnings.push(`Rate limit exceeded: ${recentCount} signals in last minute`);
      rejected = true;
      rejectionReason = `Rate flood: ${recentCount} signals/min`;
    }

    // ── 4. Flip-flop detection ──
    const recentForSymbol = records.filter(r => r.symbol === intel.symbol && now - r.timestamp < FLIPFLOP_WINDOW_MS);
    let directionChanges = 0;
    for (let i = 1; i < recentForSymbol.length; i++) {
      if (recentForSymbol[i].direction !== recentForSymbol[i - 1].direction
          && recentForSymbol[i].direction !== 'NEUTRAL'
          && recentForSymbol[i - 1].direction !== 'NEUTRAL') {
        directionChanges++;
      }
    }
    if (directionChanges >= FLIPFLOP_MAX) {
      anomalies.push('FLIP_FLOP');
      warnings.push(`Direction changed ${directionChanges} times in 1h for ${intel.symbol}`);
    }

    // ── 5. Extreme confidence ──
    if (confidence !== null) {
      const lastFive = records.slice(-5);
      if (lastFive.length >= 5 && lastFive.every(r => (r.confidence ?? 0) >= 95)) {
        anomalies.push('EXTREME_CONFIDENCE');
        warnings.push('Last 5 signals all had confidence ≥ 95');
      }
    }

    // ── 6. Stale replay — only flag if SAME data for same symbol sent >10 consecutive times
    // (agents with caches legitimately return same data for a few cycles)
    const lastTenSameSymbol = records.filter(r => r.symbol === intel.symbol).slice(-10);
    const consecutiveDupes = lastTenSameSymbol.filter(r => r.dataHash === dataHash).length;
    if (consecutiveDupes >= 10) {
      anomalies.push('STALE_REPLAY');
      warnings.push(`Identical data for ${intel.symbol} sent ${consecutiveDupes}+ consecutive times`);
    }

    // ── 7. Monotone pattern — only flag if ALL signals across ALL symbols are same direction
    // (a persistent single-direction agent targeting diverse symbols is suspicious)
    const lastTwenty = records.slice(-20);
    if (lastTwenty.length >= 20) {
      const uniqueSymbols = new Set(lastTwenty.map(r => r.symbol));
      const allSameDir = lastTwenty.every(r => r.direction === direction && r.direction !== 'NEUTRAL');
      const confSpread = lastTwenty.reduce((max, r) => Math.max(max, Math.abs((r.confidence ?? 0) - (confidence ?? 0))), 0);
      if (allSameDir && confSpread <= 3 && uniqueSymbols.size >= 3) {
        anomalies.push('MONOTONE');
        warnings.push(`Last 20 signals all ${direction} across ${uniqueSymbols.size} symbols with identical confidence`);
      }
    }

    // ── 8. Pump pattern ──
    const hourRecords = records.filter(r => now - r.timestamp < FLIPFLOP_WINDOW_MS);
    if (hourRecords.length >= 5) {
      const symbolCounts = new Map<string, { bullish: number; total: number }>();
      for (const r of hourRecords) {
        const entry = symbolCounts.get(r.symbol) || { bullish: 0, total: 0 };
        entry.total++;
        if (r.direction === 'BULLISH') entry.bullish++;
        symbolCounts.set(r.symbol, entry);
      }
      for (const [sym, counts] of symbolCounts) {
        if (!MAJOR_SYMBOLS.has(sym)
            && !BLOCKED_SYMBOLS.has(sym)
            && counts.total >= 4
            && counts.bullish / counts.total > 0.8
            && counts.total / hourRecords.length > 0.7) {
          anomalies.push('PUMP_PATTERN');
          warnings.push(`Pump pattern: ${counts.bullish}/${counts.total} BULLISH signals for obscure token ${sym}`);
        }
      }
    }

    // ── 9. Blocked symbol probe ──
    const blockedAttempts = new Set(
      hourRecords.filter(r => BLOCKED_SYMBOLS.has(r.symbol)).map(r => r.symbol)
    );
    if (BLOCKED_SYMBOLS.has(intel.symbol)) {
      blockedAttempts.add(intel.symbol);
    }
    if (blockedAttempts.size >= 3) {
      anomalies.push('BLOCKED_PROBE');
      warnings.push(`Probing ${blockedAttempts.size} blocked symbols: ${[...blockedAttempts].join(', ')}`);
    }

    // ── Record this signal ──
    records.push({
      timestamp: now,
      symbol: intel.symbol,
      direction,
      dataHash,
      confidence: confidence ?? undefined,
    });
    if (records.length > MAX_RECORDS) {
      records.splice(0, records.length - MAX_RECORDS);
    }
    this.history.set(agentId, records);

    return {
      valid: !rejected,
      warnings,
      rejected,
      rejectionReason,
      anomaliesDetected: anomalies,
    };
  }

  /** Recursively extract all string values from an object for security scanning */
  private extractAllText(obj: any): string {
    if (typeof obj === 'string') return obj;
    if (typeof obj !== 'object' || obj === null) return '';
    return Object.values(obj).map(v => this.extractAllText(v)).join(' ');
  }

  /** Extract directional signal from typed intelligence */
  private extractDirection(intel: AgentIntelligence): string {
    const d = intel.data as any;
    if (d.direction) return d.direction;
    if (d.buy_sell_imbalance !== undefined) {
      return d.buy_sell_imbalance > 0.15 ? 'BULLISH' : d.buy_sell_imbalance < -0.15 ? 'BEARISH' : 'NEUTRAL';
    }
    return 'NEUTRAL';
  }

  /** Extract confidence if available */
  private extractConfidence(intel: AgentIntelligence): number | null {
    const d = intel.data as any;
    if (d.confidence !== undefined) return d.confidence;
    if (d.trend_strength !== undefined) return Math.round(d.trend_strength * 100);
    return null;
  }
}

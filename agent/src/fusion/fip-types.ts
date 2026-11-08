/**
 * Financial Intelligence Protocol (FIP) — Type definitions
 *
 * Core paradigm shift: Agents provide intelligence, Brain decides.
 * External agents NEVER produce trade orders — only financial observations.
 * Galeon Brain holds final decision authority.
 */

// ── Agent Capability Types ───────────────────────────────────────────────────

export type AgentCapability =
  | 'TREND_ANALYSIS'      // EMA crossover, trend strength, regime
  | 'ORDERBOOK_DEPTH'     // Buy/sell imbalance, liquidity, slippage
  | 'FUNDING_RATE'        // Funding rate, crowded positioning
  | 'SENTIMENT'           // Social/news sentiment
  | 'VOLATILITY'          // Vol regime, ATR, Bollinger
  | 'ON_CHAIN'            // Whale flows, exchange flows
  | 'GENERAL';            // Fallback for legacy agents

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// ── Typed Intelligence Payloads ──────────────────────────────────────────────

export interface TrendIntelligence {
  capability: 'TREND_ANALYSIS';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trend_strength: number;        // 0.0–1.0
  market_regime: 'TREND_UP' | 'TREND_DOWN' | 'RANGING' | 'BREAKOUT';
  ema_gap_pct?: number;
  rsi?: number;
}

export interface OrderBookIntelligence {
  capability: 'ORDERBOOK_DEPTH';
  buy_sell_imbalance: number;    // -1.0 (sell heavy) to +1.0 (buy heavy)
  liquidity_depth: 'HIGH' | 'MEDIUM' | 'LOW';
  slippage_bps: number;
  taker_ratio?: number;
}

export interface FundingRateIntelligence {
  capability: 'FUNDING_RATE';
  funding_rate: number;
  crowded_side: 'LONG' | 'SHORT' | 'BALANCED';
  squeeze_risk: number;          // 0.0–1.0
}

export interface GeneralIntelligence {
  capability: 'GENERAL';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;            // 0–100 backward compat
  reasoning?: string;
  /** LLM-scored quality of the reasoning (0.0–1.0). Set by DeepSeek analysis. */
  reasoningStrength?: number;
  /** Key market factors extracted from reasoning by LLM */
  reasoningFactors?: string[];
}

export type IntelligenceData =
  | TrendIntelligence
  | OrderBookIntelligence
  | FundingRateIntelligence
  | GeneralIntelligence;

// ── What agents submit ───────────────────────────────────────────────────────

export interface AgentIntelligence {
  agentId: string;
  agentName?: string;
  symbol: string;                // normalized: BTC, ETH, SOL
  data: IntelligenceData;
  timeframe: Timeframe;
  timestamp: string;             // ISO 8601
  expiresAt: string;             // ISO 8601
}

// ── Brain Assessment (mapped from ai-server response) ────────────────────────

export interface BrainAssessment {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;            // 0–100
  regime: 'BULL' | 'BEAR' | 'NEUTRAL';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  leverage: number;
  entryReason: string;
  timestamp: string;
}

// ── Market Decision Context (one per symbol per cycle) ───────────────────────

export interface MarketDecisionContext {
  symbol: string;
  brainAssessment: BrainAssessment | null;
  externalIntel: AgentIntelligence[];
  btcRegime: 'BULL' | 'BEAR' | 'NEUTRAL';
  timestamp: string;
}

// ── Agent Impact — how each agent's intel affects Brain ──────────────────────

export type ImpactType =
  | 'CONFIRM'             // Supports existing Brain assessment
  | 'STRENGTHEN'          // Increases confidence in assessment
  | 'WEAKEN'              // Reduces confidence
  | 'CHALLENGE'           // Introduces meaningful conflicting evidence
  | 'SHIFT_BIAS'          // Changes market directional bias
  | 'RISK_WARNING'        // Introduces additional trading risk
  | 'NO_MATERIAL_IMPACT'  // Does not materially change assessment
  | 'INVALID';            // Failed validation

export interface AgentImpact {
  agentId: string;
  agentName: string;
  capability: string;
  impactType: ImpactType;
  reliabilityWeight: number;      // 0.0–1.0 from trust system
  contribution: number;           // score delta applied
  explanation: string;            // human-readable reasoning
}

// ── Fusion Assessment — multi-dimensional evaluation ─────────────────────────

export interface FusionAssessment {
  marketBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  directionalConfidence: number | null;  // 0–100, null if no direction
  entryConfirmation: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  // Before/after comparison
  coreDirection: string;           // Brain's original direction
  coreScore: number;               // Brain's original score
  fusedDirection: string;           // Direction after fusion
  fusedScore: number;               // Score after fusion
  biasChanged: boolean;             // Did external intel change direction?
  // Agent contributions
  agentImpacts: AgentImpact[];
  fusionExplanation: string;        // Summary of what fusion did
}

// ── Market Decision (output of fusion) ───────────────────────────────────────

export type DecisionAction = 'LONG' | 'SHORT' | 'WAIT' | 'REDUCE' | 'CLOSE';

export type FusionLabel =
  | 'BRAIN_SOLO'           // No external intelligence used
  | 'FUSION_CONFIRMED'     // External evidence supported Brain
  | 'FUSION_STRENGTHENED'  // External evidence strengthened assessment
  | 'FUSION_CHALLENGED'    // External evidence challenged Brain
  | 'FUSION_ADJUSTED'      // External evidence materially changed assessment
  | 'FUSION_EVALUATED'     // External intel evaluated without material change
  | 'SECURITY_REJECTION';  // Blocked by security gate

export interface DecisionReasoning {
  step: string;
  source: string;
  detail: string;
  impact: number;
}

export interface MarketDecision {
  symbol: string;
  action: DecisionAction;
  score: number;                    // 0–100 final score
  label: FusionLabel;
  fusion: FusionAssessment;
  reasoning: DecisionReasoning[];
  entryPrice?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  leverage?: number;
  brainContributed: boolean;
  externalContributors: string[];
  timestamp: string;
}

// Legacy compat — keep old FusionScenario as alias
export type FusionScenario = FusionLabel;

// ── Agent Trust & Validation ─────────────────────────────────────────────────

export type TrustState = 'PROBATION' | 'VALIDATED' | 'TRUSTED' | 'SUSPENDED';

export type AnomalyType =
  | 'PUMP_PATTERN'        // Always BULLISH on same obscure token
  | 'FLIP_FLOP'           // Changes direction >5 times in 1 hour
  | 'MONOTONE'            // Every signal identical direction/confidence
  | 'STALE_REPLAY'        // Sending same data repeatedly
  | 'BLOCKED_PROBE'       // Trying variations of blocked symbols
  | 'RATE_FLOOD'          // >20 signals per minute
  | 'EXTREME_CONFIDENCE'  // Confidence always 95+
  | 'TIMESTAMP_STALE'     // Data older than 10 minutes
  | 'INJECTION_ATTACK'    // SQL/XSS/command injection in fields
  | 'MALICIOUS_CONTENT'   // Dangerous keywords: transfer, sell_all, withdraw, liquidate
  | 'FIELD_OVERFLOW';     // Abnormal field length or value ranges

export interface AnomalyEvent {
  type: AnomalyType;
  detail: string;
  timestamp: string;
  severity: 'WARNING' | 'CRITICAL';
}

export interface AgentTrustProfile {
  agentId: string;
  state: TrustState;
  signalCount: number;
  evaluatedCount: number;
  correctCount: number;
  accuracy: number | null;       // null if evaluatedCount=0
  trustMultiplier: number;       // 0.0 (PROBATION/SUSPENDED) → 0.5 (VALIDATED) → 1.0 (TRUSTED)
  anomalies: AnomalyEvent[];
  anomalyScore: number;          // 0–100, higher = more suspicious
  stateHistory: { state: TrustState; at: string; reason: string }[];
  lastSignalAt: string | null;
  registeredAt: string;
}

export interface SignalValidationResult {
  valid: boolean;
  warnings: string[];
  rejected: boolean;
  rejectionReason?: string;
  anomaliesDetected: AnomalyType[];
}

// Known major symbols — agents pushing only obscure tokens are suspicious
export const MAJOR_SYMBOLS = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOGE', 'DOT', 'LINK', 'MATIC', 'UNI', 'AAVE']);

// Blocked symbols — exported for shared use
export const BLOCKED_SYMBOLS = new Set(['SHIB', 'PEPE', 'FLOKI', 'BABYDOGE', 'ELON', 'SAFEMOON']);

/**
 * Fusion Engine v3 — Context-Aware Financial Intelligence Fusion
 *
 * Core principle: Galeon Brain is the decision-maker with market cognition.
 * External agents provide specialized financial intelligence that can:
 *   CONFIRM, STRENGTHEN, WEAKEN, CHALLENGE, SHIFT_BIAS, or add RISK_WARNING.
 *
 * Key design: External intel materially influences Brain's assessment.
 * A conflicting signal is NOT automatically ignored.
 * But external intel CANNOT independently override Brain.
 *
 * Pipeline per symbol:
 *   1. Brain Core Assessment (base direction + score)
 *   2. External Intelligence Collection
 *   3. Per-agent Impact Evaluation (typed by capability)
 *   4. Multi-dimensional Fusion (direction, liquidity, risk)
 *   5. Final Brain Decision (one unified decision per symbol)
 *   6. Risk Validation
 */

import axios from 'axios';
import { Signal } from '../signals/signalPoller';
import { SourceStore } from './sourceStore';
import { IntelBuffer } from './intelBuffer';
import { adaptLegacySignal } from './legacyAdapter';
import { buildContexts } from './decisionContext';
import { TrustStore } from './trustStore';
import { SignalValidator } from './signalValidator';
import { FusionHistoryStore } from './fusionHistoryStore';
import {
  BrainAssessment, MarketDecision, MarketDecisionContext,
  DecisionAction, FusionLabel, DecisionReasoning,
  AgentIntelligence, AgentImpact, FusionAssessment, ImpactType,
  TrendIntelligence, OrderBookIntelligence, GeneralIntelligence,
  BLOCKED_SYMBOLS,
} from './fip-types';

function normalizeSymbol(raw: string): string {
  return raw.replace(/USDT$|PERP$|-PERP$|USD$/, '').replace(/\/.*/, '').toUpperCase();
}

// ── Legacy FusionResult (backward compat) ────────────────────────────────────

export interface FusionResult {
  signal: Signal | null;
  fusedScore: number;
  sources: string[];
  bonuses: string[];
  rejectionReason?: string;
  rawSymbol?: string;
  rawDirection?: 'LONG' | 'SHORT';
}

// ── FusionEngine ─────────────────────────────────────────────────────────────

export class FusionEngine {
  private btcTrend: 'BULL' | 'BEAR' | 'NEUTRAL' = 'NEUTRAL';
  private btcTrendFetchedAt = 0;

  constructor(
    private sourceStore: SourceStore,
    private intelBuffer: IntelBuffer = new IntelBuffer(),
    private trustStore?: TrustStore,
    private signalValidator?: SignalValidator,
    public historyStore: FusionHistoryStore = new FusionHistoryStore(),
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Main entry
  // ═══════════════════════════════════════════════════════════════════════════

  async evaluateMarket(strategy: string): Promise<MarketDecision[]> {
    const btcRegime = await this.getBtcTrend();
    const brainAssessments = await this.fetchBrainAssessments(strategy);
    await this.collectExternalIntel(strategy);
    const contexts = buildContexts(brainAssessments, this.intelBuffer, btcRegime);

    const decisions: MarketDecision[] = [];
    for (const ctx of contexts) {
      const d = this.evaluateSymbol(ctx);
      if (d) decisions.push(d);
    }
    // Record snapshot for history
    this.historyStore.record(decisions);
    return decisions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Per-symbol evaluation — the core fusion logic
  // ═══════════════════════════════════════════════════════════════════════════

  private evaluateSymbol(ctx: MarketDecisionContext): MarketDecision | null {
    const { symbol, brainAssessment, externalIntel, btcRegime } = ctx;
    const reasoning: DecisionReasoning[] = [];
    const agentImpacts: AgentImpact[] = [];
    const contributors: string[] = [];
    const now = new Date().toISOString();

    // ── Stage 0: Security Gate ──
    if (BLOCKED_SYMBOLS.has(symbol)) {
      return this.securityRejection(symbol, externalIntel, now);
    }

    // ── Stage 1: Brain's own market read ──
    // Brain reads its own indicators first: direction + confidence from ai-server.
    const coreDirection = brainAssessment?.direction || 'NEUTRAL';
    const coreScore = brainAssessment?.confidence || 0;
    let currentDirection = coreDirection;
    let currentScore = coreScore;

    reasoning.push({
      step: 'brain_read', source: 'galeon-brain',
      detail: coreDirection === 'NEUTRAL'
        ? `Brain scanning ${symbol} — no directional signal yet (${brainAssessment?.entryReason || 'market scan'})`
        : `Brain reads ${symbol} ${coreDirection} at confidence ${coreScore} (${brainAssessment?.entryReason || ''})`,
      impact: coreScore,
    });

    // ── Stage 2: Gather and process external intelligence ──
    // Brain collects information from external agents and incorporates it into
    // its comprehensive analysis. Each agent's data is weighted by trust.
    // Single-agent contribution is capped at ±10 to prevent any one source
    // from skewing the overall picture.
    const MAX_SINGLE_AGENT_CONTRIB = 10;
    const validIntel = externalIntel.filter(i => !this.isBlocked(i.agentId));

    for (const intel of validIntel) {
      const trustMult = this.trustStore?.getTrustMultiplier(intel.agentId) ?? 1.0;
      const trustState = this.trustStore?.getState(intel.agentId) || 'TRUSTED';
      contributors.push(intel.agentId);

      if (trustMult === 0) {
        agentImpacts.push({
          agentId: intel.agentId, agentName: intel.agentName || intel.agentId,
          capability: intel.data.capability, impactType: 'NO_MATERIAL_IMPACT',
          reliabilityWeight: 0, contribution: 0,
          explanation: `Data received, not yet trusted (${trustState}) — excluded from analysis`,
        });
        reasoning.push({
          step: 'trust_gate', source: intel.agentId,
          detail: `${intel.agentName || intel.agentId}: data received but excluded — ${trustState}`,
          impact: 0,
        });
        continue;
      }

      // Brain evaluates what this agent's data means in the current market context
      const impact = this.evaluateAgentImpact(intel, currentDirection, currentScore, trustMult);

      // Cap single-agent contribution
      const capped = Math.sign(impact.contribution) * Math.min(Math.abs(impact.contribution), MAX_SINGLE_AGENT_CONTRIB);
      const finalImpact: AgentImpact = { ...impact, contribution: capped };
      agentImpacts.push(finalImpact);

      // Incorporate into Brain's running analysis
      currentScore += capped;
      reasoning.push({
        step: `intel_${impact.capability.toLowerCase()}`, source: intel.agentId,
        detail: `${impact.agentName}: ${impact.explanation}`,
        impact: capped,
      });

      // If agent data strongly shifts the market picture, Brain updates its directional read
      if (impact.impactType === 'SHIFT_BIAS') {
        const newDir = this.extractDirectionFromIntel(intel);
        if (newDir && newDir !== currentDirection) {
          const prev = currentDirection;
          currentDirection = newDir;
          reasoning.push({
            step: 'direction_update', source: intel.agentId,
            detail: `Brain updates directional read: ${prev} → ${newDir} based on ${impact.agentName} data`,
            impact: 0,
          });
        }
      }
    }

    // ── Stage 3: Comprehensive analysis result ──
    const biasChanged = currentDirection !== coreDirection;
    const materialImpacts = agentImpacts.filter(i =>
      i.impactType !== 'NO_MATERIAL_IMPACT' && i.impactType !== 'INVALID'
    );
    const confirmCount = agentImpacts.filter(i => i.impactType === 'CONFIRM' || i.impactType === 'STRENGTHEN').length;
    const challengeCount = agentImpacts.filter(i => i.impactType === 'CHALLENGE' || i.impactType === 'WEAKEN').length;
    const riskWarnings = agentImpacts.filter(i => i.impactType === 'RISK_WARNING').length;

    const marketBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      currentDirection === 'LONG' ? 'BULLISH'
      : currentDirection === 'SHORT' ? 'BEARISH'
      : 'NEUTRAL';

    const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
      riskWarnings >= 2 ? 'HIGH' : riskWarnings >= 1 || currentScore < 40 ? 'MEDIUM' : 'LOW';

    const entryConfirmation = confirmCount >= 1 && challengeCount === 0 && currentScore >= 58;

    let fusionExplanation: string;
    if (materialImpacts.length === 0) {
      fusionExplanation = `Brain analysis based on own signals only — no external data available.`;
    } else if (biasChanged) {
      fusionExplanation = `After incorporating external data, Brain's directional read updated: ${coreDirection} → ${currentDirection}.`;
    } else if (challengeCount > 0 && confirmCount === 0) {
      fusionExplanation = `External data raises caution — ${challengeCount} source(s) show conflicting signals.`;
    } else if (confirmCount > 0 && challengeCount === 0) {
      fusionExplanation = `External data reinforces Brain's ${currentDirection} read — ${confirmCount} source(s) aligned.`;
    } else {
      fusionExplanation = `Brain incorporated ${materialImpacts.length} external data source(s). Mixed signals evaluated.`;
    }

    const fusion: FusionAssessment = {
      marketBias,
      directionalConfidence: currentDirection !== 'NEUTRAL' ? Math.max(0, Math.min(100, Math.round(currentScore))) : null,
      entryConfirmation,
      riskLevel,
      coreDirection,
      coreScore,
      fusedDirection: currentDirection,
      fusedScore: Math.max(0, Math.min(100, Math.round(currentScore))),
      biasChanged,
      agentImpacts,
      fusionExplanation,
    };

    // ── Stage 4: Brain final decision ──
    let action: DecisionAction = 'WAIT';
    let finalScore = fusion.fusedScore;

    if (currentDirection === 'LONG' && btcRegime === 'BEAR' && finalScore < 80) {
      finalScore -= 10;
      reasoning.push({ step: 'regime_gate', source: 'brain', detail: `LONG in BEAR regime -10`, impact: -10 });
    }
    if (currentDirection === 'SHORT' && btcRegime === 'BULL' && finalScore < 80) {
      finalScore -= 10;
      reasoning.push({ step: 'regime_gate', source: 'brain', detail: `SHORT in BULL regime -10`, impact: -10 });
    }
    if (riskLevel === 'HIGH') {
      finalScore -= 15;
      reasoning.push({ step: 'risk_gate', source: 'brain', detail: `High risk in data (${riskWarnings} warnings) -15`, impact: -15 });
    }

    finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
    fusion.fusedScore = finalScore;

    if (currentDirection !== 'NEUTRAL' && finalScore >= 58) {
      action = currentDirection === 'LONG' ? 'LONG' : 'SHORT';
    } else if (currentDirection !== 'NEUTRAL' && finalScore >= 40) {
      action = 'WAIT';
      reasoning.push({ step: 'confidence_gate', source: 'brain',
        detail: `Score ${finalScore} below execution threshold 58 — monitoring`,
        impact: 0,
      });
    }

    const label = this.determineLabel(materialImpacts, biasChanged, contributors.length, brainAssessment);

    return {
      symbol, action, score: finalScore, label, fusion, reasoning,
      entryPrice: brainAssessment?.entryPrice,
      stopLoss: brainAssessment?.stopLoss,
      takeProfit1: brainAssessment?.takeProfit1,
      takeProfit2: brainAssessment?.takeProfit2,
      leverage: brainAssessment?.leverage,
      brainContributed: !!brainAssessment,
      externalContributors: contributors,
      timestamp: now,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Agent Impact Engine — determines how each agent affects Brain
  // ═══════════════════════════════════════════════════════════════════════════

  private evaluateAgentImpact(
    intel: AgentIntelligence,
    brainDirection: string, // 'LONG' | 'SHORT' | 'NEUTRAL'
    brainScore: number,
    trustMult: number,
  ): AgentImpact {
    const agentName = intel.agentName || intel.agentId;
    const base = { agentId: intel.agentId, agentName, capability: intel.data.capability, reliabilityWeight: trustMult };

    switch (intel.data.capability) {
      case 'TREND_ANALYSIS': return this.evaluateTrendImpact(intel.data as TrendIntelligence, brainDirection, brainScore, trustMult, base);
      case 'ORDERBOOK_DEPTH': return this.evaluateOrderbookImpact(intel.data as OrderBookIntelligence, brainDirection, brainScore, trustMult, base);
      case 'FUNDING_RATE': return this.evaluateFundingImpact(intel.data, brainDirection, trustMult, base);
      default: return this.evaluateGeneralImpact(intel.data as GeneralIntelligence, brainDirection, trustMult, base);
    }
  }

  private evaluateTrendImpact(
    t: TrendIntelligence, brainDir: string, brainScore: number, trust: number,
    base: Omit<AgentImpact, 'impactType' | 'contribution' | 'explanation'>,
  ): AgentImpact {
    const intelDir = t.direction === 'BULLISH' ? 'LONG' : t.direction === 'BEARISH' ? 'SHORT' : 'NEUTRAL';
    const strength = t.trend_strength;

    // Brain has direction — check alignment
    if (brainDir !== 'NEUTRAL' && intelDir !== 'NEUTRAL') {
      if (intelDir === brainDir) {
        // CONFIRM or STRENGTHEN
        const rawContrib = Math.max(3, Math.round(8 * strength));
        const contrib = Math.round(rawContrib * trust);
        const impactType: ImpactType = strength >= 0.5 ? 'STRENGTHEN' : 'CONFIRM';
        return { ...base, impactType, contribution: contrib,
          explanation: `${t.direction} trend (strength ${strength.toFixed(2)}, ${t.market_regime}) ${impactType === 'STRENGTHEN' ? 'strengthens' : 'confirms'} Brain ${brainDir} → +${contrib}` };
      } else {
        // CHALLENGE or SHIFT_BIAS
        const rawContrib = -Math.max(2, Math.round(6 * strength));
        const contrib = Math.round(rawContrib * trust);
        // SHIFT_BIAS only if trend is strong AND Brain score is low
        const impactType: ImpactType = strength >= 0.4 && brainScore < 50 ? 'SHIFT_BIAS' : 'CHALLENGE';
        return { ...base, impactType, contribution: contrib,
          explanation: `${t.direction} trend (strength ${strength.toFixed(2)}) ${impactType === 'SHIFT_BIAS' ? 'shifts bias from' : 'challenges'} Brain ${brainDir} → ${contrib}` };
      }
    }

    // Brain NEUTRAL — external can introduce directional bias
    if (brainDir === 'NEUTRAL' && intelDir !== 'NEUTRAL') {
      const rawContrib = Math.max(3, Math.round(10 * strength));
      const contrib = Math.round(rawContrib * trust);
      return { ...base, impactType: 'SHIFT_BIAS', contribution: contrib,
        explanation: `${t.direction} trend (strength ${strength.toFixed(2)}) introduces ${intelDir} bias to NEUTRAL Brain → +${contrib}` };
    }

    return { ...base, impactType: 'NO_MATERIAL_IMPACT', contribution: 0,
      explanation: `${t.direction} trend — no directional impact on current assessment` };
  }

  private evaluateOrderbookImpact(
    ob: OrderBookIntelligence, brainDir: string, brainScore: number, trust: number,
    base: Omit<AgentImpact, 'impactType' | 'contribution' | 'explanation'>,
  ): AgentImpact {
    const buyPressure = ob.buy_sell_imbalance > 0.15;
    const sellPressure = ob.buy_sell_imbalance < -0.15;
    const obDir = buyPressure ? 'LONG' : sellPressure ? 'SHORT' : 'NEUTRAL';
    const absImbalance = Math.abs(ob.buy_sell_imbalance);

    // Low liquidity risk
    if (ob.liquidity_depth === 'LOW') {
      const contrib = Math.round(-4 * trust);
      return { ...base, impactType: 'RISK_WARNING', contribution: contrib,
        explanation: `LOW liquidity depth (slippage ~${ob.slippage_bps}bps) — execution risk → ${contrib}` };
    }

    if (brainDir !== 'NEUTRAL' && obDir !== 'NEUTRAL') {
      if (obDir === brainDir) {
        const rawContrib = Math.max(3, Math.round(7 * absImbalance));
        const contrib = Math.round(rawContrib * trust);
        const impactType: ImpactType = absImbalance >= 0.5 ? 'STRENGTHEN' : 'CONFIRM';
        return { ...base, impactType, contribution: contrib,
          explanation: `${buyPressure ? 'Buy' : 'Sell'} pressure (imbalance ${ob.buy_sell_imbalance.toFixed(2)}, ${ob.liquidity_depth} depth) ${impactType === 'STRENGTHEN' ? 'strengthens' : 'confirms'} Brain ${brainDir} → +${contrib}` };
      } else {
        const rawContrib = -Math.max(2, Math.round(5 * absImbalance));
        const contrib = Math.round(rawContrib * trust);
        const impactType: ImpactType = absImbalance >= 0.5 && brainScore < 50 ? 'SHIFT_BIAS' : 'CHALLENGE';
        return { ...base, impactType, contribution: contrib,
          explanation: `${buyPressure ? 'Buy' : 'Sell'} pressure (imbalance ${ob.buy_sell_imbalance.toFixed(2)}) ${impactType === 'SHIFT_BIAS' ? 'shifts bias from' : 'challenges'} Brain ${brainDir} → ${contrib}` };
      }
    }

    // Brain NEUTRAL + orderbook has pressure
    if (brainDir === 'NEUTRAL' && obDir !== 'NEUTRAL') {
      const rawContrib = Math.max(3, Math.round(8 * absImbalance));
      const contrib = Math.round(rawContrib * trust);
      return { ...base, impactType: 'SHIFT_BIAS', contribution: contrib,
        explanation: `${buyPressure ? 'Buy' : 'Sell'} pressure (imbalance ${ob.buy_sell_imbalance.toFixed(2)}) introduces ${obDir} bias → +${contrib}` };
    }

    return { ...base, impactType: 'NO_MATERIAL_IMPACT', contribution: 0,
      explanation: `Orderbook balanced (imbalance ${ob.buy_sell_imbalance.toFixed(2)}) — no directional signal` };
  }

  private evaluateFundingImpact(
    data: any, brainDir: string, trust: number,
    base: Omit<AgentImpact, 'impactType' | 'contribution' | 'explanation'>,
  ): AgentImpact {
    if (data.squeeze_risk > 0.7) {
      const contrib = Math.round(-10 * trust);
      return { ...base, impactType: 'RISK_WARNING', contribution: contrib,
        explanation: `High squeeze risk (${data.squeeze_risk.toFixed(2)}) on ${data.crowded_side} side → ${contrib}` };
    }
    return { ...base, impactType: 'NO_MATERIAL_IMPACT', contribution: 0,
      explanation: `FR=${data.funding_rate?.toFixed(6) || '?'}, ${data.crowded_side} — normal conditions` };
  }

  private evaluateGeneralImpact(
    g: GeneralIntelligence, brainDir: string, trust: number,
    base: Omit<AgentImpact, 'impactType' | 'contribution' | 'explanation'>,
  ): AgentImpact {
    const intelDir = g.direction === 'BULLISH' ? 'LONG' : g.direction === 'BEARISH' ? 'SHORT' : 'NEUTRAL';

    // Reasoning strength from DeepSeek analysis (0.0–1.0)
    const rs = g.reasoningStrength ?? 0;
    const hasReasoning = rs > 0.3;
    const strongReasoning = rs >= 0.7;
    const factorNote = g.reasoningFactors?.length
      ? ` [${g.reasoningFactors.slice(0, 2).join(', ')}]`
      : '';

    if (brainDir !== 'NEUTRAL' && intelDir !== 'NEUTRAL') {
      if (intelDir === brainDir) {
        // Strong reasoning upgrades CONFIRM → STRENGTHEN with higher contribution
        if (strongReasoning) {
          const contrib = Math.round(6 * trust);
          return { ...base, impactType: 'STRENGTHEN', contribution: contrib,
            explanation: `${g.direction} with strong reasoning (strength=${rs.toFixed(2)}${factorNote}) strengthens Brain ${brainDir} → +${contrib}` };
        }
        if (hasReasoning) {
          const contrib = Math.round(3 * trust);
          return { ...base, impactType: 'CONFIRM', contribution: contrib,
            explanation: `${g.direction} with supporting analysis (strength=${rs.toFixed(2)}${factorNote}) confirms Brain → +${contrib}` };
        }
        const contrib = Math.round(2 * trust);
        return { ...base, impactType: 'CONFIRM', contribution: contrib,
          explanation: `${g.direction} (conf=${g.confidence}) confirms Brain → +${contrib}` };
      } else {
        // Strong reasoning escalates WEAKEN → CHALLENGE
        if (strongReasoning) {
          const contrib = Math.round(-4 * trust);
          return { ...base, impactType: 'CHALLENGE', contribution: contrib,
            explanation: `${g.direction} with strong counter-analysis (strength=${rs.toFixed(2)}${factorNote}) challenges Brain ${brainDir} → ${contrib}` };
        }
        if (hasReasoning) {
          const contrib = Math.round(-3 * trust);
          return { ...base, impactType: 'WEAKEN', contribution: contrib,
            explanation: `${g.direction} with reasoning (strength=${rs.toFixed(2)}${factorNote}) weakens Brain ${brainDir} → ${contrib}` };
        }
        const contrib = Math.round(-2 * trust);
        return { ...base, impactType: 'WEAKEN', contribution: contrib,
          explanation: `${g.direction} (conf=${g.confidence}) weakens Brain ${brainDir} → ${contrib}` };
      }
    }

    if (brainDir === 'NEUTRAL' && intelDir !== 'NEUTRAL') {
      const baseContrib = strongReasoning ? 5 : hasReasoning ? 4 : 3;
      const contrib = Math.round(baseContrib * trust);
      return { ...base, impactType: 'SHIFT_BIAS', contribution: contrib,
        explanation: `${g.direction}${hasReasoning ? ` (reasoning strength=${rs.toFixed(2)}${factorNote})` : ''} introduces ${intelDir} bias → +${contrib}` };
    }

    return { ...base, impactType: 'NO_MATERIAL_IMPACT', contribution: 0,
      explanation: `${g.direction} (conf=${g.confidence}) — no material impact` };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Label determination — based on ACTUAL impact data, not hardcoded
  // ═══════════════════════════════════════════════════════════════════════════

  private determineLabel(
    materialImpacts: AgentImpact[],
    biasChanged: boolean,
    externalCount: number,
    brainAssessment: BrainAssessment | null,
  ): FusionLabel {
    if (externalCount === 0) return 'BRAIN_SOLO';
    if (materialImpacts.length === 0) return externalCount > 0 ? 'FUSION_EVALUATED' : 'BRAIN_SOLO';

    const hasShift = materialImpacts.some(i => i.impactType === 'SHIFT_BIAS');
    const hasChallenge = materialImpacts.some(i => i.impactType === 'CHALLENGE');
    const hasStrengthen = materialImpacts.some(i => i.impactType === 'STRENGTHEN');
    const hasConfirm = materialImpacts.some(i => i.impactType === 'CONFIRM');
    const hasWeaken = materialImpacts.some(i => i.impactType === 'WEAKEN');

    if (biasChanged || hasShift) return 'FUSION_ADJUSTED';
    if (hasChallenge || hasWeaken) return 'FUSION_CHALLENGED';
    if (hasStrengthen) return 'FUSION_STRENGTHENED';
    if (hasConfirm) return 'FUSION_CONFIRMED';
    return 'FUSION_EVALUATED';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private securityRejection(symbol: string, intel: AgentIntelligence[], now: string): MarketDecision {
    const emptyFusion: FusionAssessment = {
      marketBias: 'NEUTRAL', directionalConfidence: null, entryConfirmation: false,
      riskLevel: 'HIGH', coreDirection: 'NEUTRAL', coreScore: 0,
      fusedDirection: 'NEUTRAL', fusedScore: 0, biasChanged: false,
      agentImpacts: [], fusionExplanation: `Symbol ${symbol} blocked by security gate.`,
    };
    return {
      symbol, action: 'WAIT', score: 0, label: 'SECURITY_REJECTION', fusion: emptyFusion,
      reasoning: [{ step: 'security_gate', source: 'brain', detail: `Symbol ${symbol} is on blocklist — possible scam/pump-and-dump`, impact: 0 }],
      brainContributed: false, externalContributors: intel.map(i => i.agentId), timestamp: now,
    };
  }

  private isBlocked(agentId: string): boolean { return false; /* extensible */ }

  private extractDirectionFromIntel(intel: AgentIntelligence): 'LONG' | 'SHORT' | null {
    const d = intel.data as any;
    if (d.direction === 'BULLISH') return 'LONG';
    if (d.direction === 'BEARISH') return 'SHORT';
    if (d.buy_sell_imbalance > 0.2) return 'LONG';
    if (d.buy_sell_imbalance < -0.2) return 'SHORT';
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Data fetching (unchanged from v2)
  // ═══════════════════════════════════════════════════════════════════════════

  private async fetchBrainAssessments(strategy: string): Promise<BrainAssessment[]> {
    try {
      const brainSource = this.sourceStore.getAll().find(s => s.id === 'galeon-brain');
      if (!brainSource) return [];

      const url = `${brainSource.url}/paper-trade/positions`;
      const mapPosition = (pos: any): BrainAssessment => ({
        symbol: normalizeSymbol(pos.symbol || ''),
        direction: pos.direction || 'NEUTRAL',
        confidence: pos.confidence || 50,
        regime: this.btcTrend,
        entryPrice: pos.entryPrice || 0,
        stopLoss: pos.stopLoss || 0,
        takeProfit1: pos.tp1 || pos.takeProfit1 || 0,
        takeProfit2: pos.tp2 || pos.takeProfit2,
        leverage: pos.leverage || 3,
        entryReason: pos.entryReason || '',
        timestamp: pos.openTime || new Date().toISOString(),
      });

      let res;
      try {
        res = await axios.get(url, { params: { strategy }, timeout: 8000 });
      } catch (err: any) {
        if (err.response?.status === 404 && strategy !== 'stable') {
          res = await axios.get(url, { params: { strategy: 'stable' }, timeout: 8000 });
        } else throw err;
      }

      const primaryPositions = (res?.data?.success ? res.data?.data : []) || [];
      // If ai-server has no active positions, use major symbol fallback so Fusion always runs
      if (primaryPositions.length === 0) return this.majorSymbolFallback();
      const assessments: BrainAssessment[] = primaryPositions.map(mapPosition);
      const seenSymbols = new Set(assessments.map(a => a.symbol));

      // Also fetch stable strategy for major coverage
      if (strategy !== 'stable') {
        try {
          const stableRes = await axios.get(url, { params: { strategy: 'stable' }, timeout: 8000 });
          const stablePositions = (stableRes?.data?.success ? stableRes.data?.data : []) || [];
          for (const pos of stablePositions) {
            const mapped = mapPosition(pos);
            if (!seenSymbols.has(mapped.symbol)) {
              assessments.push(mapped);
              seenSymbols.add(mapped.symbol);
            }
          }
        } catch { /* continue */ }
      }

      // Brain ALWAYS has a view on majors
      const majorSymbols = ['BTC', 'ETH', 'SOL'];
      const uncovered = majorSymbols.filter(s => !seenSymbols.has(s));
      if (uncovered.length > 0) {
        try {
          const overviewUrl = `${brainSource.url}/paper-trade/overview`;
          const ovRes = await axios.get(overviewUrl, { params: { strategy: 'stable' }, timeout: 5000 });
          const btcTrendRaw = (ovRes.data?.data?.btcTrend || '').toUpperCase();

          const trendConfig: Record<string, { dir: 'LONG' | 'SHORT' | 'NEUTRAL'; conf: number }> = {
            UP: { dir: 'LONG', conf: 55 }, BULL: { dir: 'LONG', conf: 55 }, BULLISH: { dir: 'LONG', conf: 55 },
            CAUTION_BULL: { dir: 'LONG', conf: 42 },
            DOWN: { dir: 'SHORT', conf: 55 }, BEAR: { dir: 'SHORT', conf: 55 }, BEARISH: { dir: 'SHORT', conf: 55 },
            CAUTION_BEAR: { dir: 'SHORT', conf: 42 }, CAUTION: { dir: 'SHORT', conf: 38 },
            NEUTRAL: { dir: 'NEUTRAL', conf: 35 }, SIDEWAYS: { dir: 'NEUTRAL', conf: 35 }, RANGE: { dir: 'NEUTRAL', conf: 35 },
          };
          const cfg = trendConfig[btcTrendRaw] || { dir: 'NEUTRAL' as const, conf: 30 };

          for (const sym of uncovered) {
            assessments.push({
              symbol: sym, direction: cfg.dir, confidence: cfg.conf, regime: this.btcTrend,
              entryPrice: 0, stopLoss: 0, takeProfit1: 0, leverage: 1,
              entryReason: `btcTrend=${btcTrendRaw || 'UNKNOWN'} (Brain market cognition)`,
              timestamp: new Date().toISOString(),
            });
          }
        } catch {
          for (const sym of uncovered) {
            assessments.push({
              symbol: sym, direction: 'NEUTRAL', confidence: 30, regime: this.btcTrend,
              entryPrice: 0, stopLoss: 0, takeProfit1: 0, leverage: 1,
              entryReason: 'Brain market cognition (default)', timestamp: new Date().toISOString(),
            });
          }
        }
      }

      return assessments;
    } catch {
      // Even if everything fails, Brain always has a baseline view on major symbols
      return this.majorSymbolFallback();
    }
  }

  private majorSymbolFallback(): BrainAssessment[] {
    const dirMap: Record<string, { dir: 'LONG' | 'SHORT' | 'NEUTRAL'; conf: number }> = {
      BULL:         { dir: 'LONG',    conf: 52 },
      BULLISH:      { dir: 'LONG',    conf: 52 },
      UP:           { dir: 'LONG',    conf: 52 },
      CAUTION_BULL: { dir: 'LONG',    conf: 42 },
      BEAR:         { dir: 'SHORT',   conf: 52 },
      BEARISH:      { dir: 'SHORT',   conf: 52 },
      DOWN:         { dir: 'SHORT',   conf: 52 },
      CAUTION_BEAR: { dir: 'SHORT',   conf: 42 },
      CAUTION:      { dir: 'NEUTRAL', conf: 38 },
      NEUTRAL:      { dir: 'NEUTRAL', conf: 35 },
      SIDEWAYS:     { dir: 'NEUTRAL', conf: 35 },
    };
    const cfg = dirMap[this.btcTrend] || { dir: 'NEUTRAL' as const, conf: 35 };

    // Major liquid tokens — Brain monitors these even when no positions are open
    const MAJOR_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'LINK', 'AVAX', 'OP', 'ARB'];

    // Alt tokens Brain has historically traded
    const ALT_SYMBOLS = ['SNX', 'BEAMX', 'JCT', 'MAGMA'];

    // Alts trade directionally only in trending markets, stay NEUTRAL in sideways
    const isDirectional = cfg.dir !== 'NEUTRAL';
    const altCfg = isDirectional
      ? { dir: cfg.dir, conf: Math.max(30, cfg.conf - 8) }
      : { dir: 'NEUTRAL' as const, conf: 30 };

    const now = new Date().toISOString();
    return [
      ...MAJOR_SYMBOLS.map(sym => ({
        symbol: sym, direction: cfg.dir, confidence: cfg.conf, regime: this.btcTrend,
        entryPrice: 0, stopLoss: 0, takeProfit1: 0, leverage: 1,
        entryReason: `Brain baseline (btcTrend=${this.btcTrend})`,
        timestamp: now,
      })),
      ...ALT_SYMBOLS.map(sym => ({
        symbol: sym, direction: altCfg.dir, confidence: altCfg.conf, regime: this.btcTrend,
        entryPrice: 0, stopLoss: 0, takeProfit1: 0, leverage: 1,
        entryReason: `Brain alt-watch (btcTrend=${this.btcTrend})`,
        timestamp: now,
      })),
    ];
  }

  private async collectExternalIntel(strategy: string): Promise<void> {
    const sources = this.sourceStore.getActive().filter(s => s.id !== 'galeon-brain');
    await Promise.allSettled(sources.map(async (src) => {
      try {
        // Try FIP endpoint first
        try {
          const fipRes = await axios.get(`${src.url}/intel`, { timeout: 6000 });
          if (fipRes.data?.intel) {
            const intelArr = Array.isArray(fipRes.data.intel) ? fipRes.data.intel : [fipRes.data.intel];
            for (const raw of intelArr) {
              const intel: AgentIntelligence = {
                agentId: src.id, agentName: src.name,
                symbol: normalizeSymbol(raw.symbol || ''),
                data: raw.data || raw.intelligence || raw,
                timeframe: raw.timeframe || '15m',
                timestamp: raw.timestamp || new Date().toISOString(),
                expiresAt: raw.expiresAt || raw.expires_at || IntelBuffer.defaultExpiry(),
              };
              if (!this.validateAndSubmit(src.id, intel)) continue;
            }
            return;
          }
        } catch { /* FIP not available */ }

        // Legacy fallback
        const res = await axios.get(`${src.url}/positions`, { timeout: 6000 });
        if (!res.data?.success) return;
        for (const sig of (res.data?.data || [])) {
          const adapted = adaptLegacySignal(src.id, src.name, sig);
          if (adapted) this.validateAndSubmit(src.id, adapted);
        }
      } catch { /* unreachable */ }
    }));
    this.intelBuffer.prune();
  }

  /** Public wrapper for push-intel route */
  validateAndSubmitPublic(agentId: string, intel: AgentIntelligence): boolean {
    return this.validateAndSubmit(agentId, intel);
  }

  private validateAndSubmit(agentId: string, intel: AgentIntelligence): boolean {
    if (this.signalValidator && this.trustStore) {
      const validation = this.signalValidator.validate(agentId, intel);
      for (const t of validation.anomaliesDetected) {
        this.trustStore.recordAnomaly(agentId, {
          type: t, detail: validation.warnings.join('; '),
          timestamp: new Date().toISOString(),
          severity: ['PUMP_PATTERN', 'BLOCKED_PROBE', 'INJECTION_ATTACK', 'MALICIOUS_CONTENT'].includes(t) ? 'CRITICAL' : 'WARNING',
        });
      }
      this.trustStore.recordSignal(agentId);
      if (validation.rejected) return false;
    } else if (this.trustStore) {
      this.trustStore.recordSignal(agentId);
    }
    this.intelBuffer.submit(intel);
    return true;
  }

  private async getBtcTrend(): Promise<'BULL' | 'BEAR' | 'NEUTRAL'> {
    if (Date.now() - this.btcTrendFetchedAt < 60_000) return this.btcTrend;
    try {
      const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8080/api';
      const res = await axios.get(`${AI_SERVER_URL}/paper-trade/overview`, { params: { strategy: 'stable' }, timeout: 5000 });
      const raw = (res.data?.data?.btcTrend || '').toUpperCase();
      const map: Record<string, 'BULL' | 'BEAR' | 'NEUTRAL'> = {
        UP: 'BULL', BULL: 'BULL', BULLISH: 'BULL', DOWN: 'BEAR', BEAR: 'BEAR', BEARISH: 'BEAR',
        NEUTRAL: 'NEUTRAL', SIDEWAYS: 'NEUTRAL', RANGE: 'NEUTRAL',
        CAUTION: 'NEUTRAL', CAUTION_BEAR: 'BEAR', CAUTION_BULL: 'BULL',
      };
      this.btcTrend = map[raw] || 'NEUTRAL';
      this.btcTrendFetchedAt = Date.now();
    } catch { /* keep last */ }
    return this.btcTrend;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Accessors
  // ═══════════════════════════════════════════════════════════════════════════

  getIntelBuffer(): IntelBuffer { return this.intelBuffer; }
  getTrustStore(): TrustStore | undefined { return this.trustStore; }

  // Legacy compat
  async collectAndFuse(strategy: string): Promise<FusionResult[]> {
    const decisions = await this.evaluateMarket(strategy);
    return decisions.map(d => {
      const isExecutable = d.action === 'LONG' || d.action === 'SHORT';
      const signal: Signal | null = isExecutable ? {
        id: `fused-${d.symbol}-${d.action}-${d.timestamp}`,
        symbol: d.symbol, direction: d.action as 'LONG' | 'SHORT',
        entryPrice: d.entryPrice || 0, confidence: d.score,
        leverage: d.leverage || 3, stopLoss: d.stopLoss || 0,
        takeProfit1: d.takeProfit1 || 0, takeProfit2: d.takeProfit2,
        timestamp: d.timestamp, entryReason: d.fusion.fusionExplanation,
      } : null;
      return {
        signal, fusedScore: d.score,
        sources: [d.brainContributed ? 'galeon-brain' : '', ...d.externalContributors].filter(Boolean),
        bonuses: d.fusion.agentImpacts.filter(i => i.contribution > 0).map(i => `${i.impactType}+${i.contribution}`),
        rejectionReason: d.action === 'WAIT' ? d.reasoning[d.reasoning.length - 1]?.detail : undefined,
        rawSymbol: d.symbol, rawDirection: d.action === 'LONG' || d.action === 'SHORT' ? d.action : undefined,
      };
    });
  }
}

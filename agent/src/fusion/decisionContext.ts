/**
 * Decision Context Builder — Creates one MarketDecisionContext per symbol
 *
 * Unions all symbols from Brain assessments + external intelligence buffer.
 * Each context contains Brain's own assessment (if any) and all relevant
 * external intelligence entries for that symbol.
 */

import { BrainAssessment, MarketDecisionContext, AgentIntelligence } from './fip-types';
import { IntelBuffer } from './intelBuffer';

/**
 * Build one MarketDecisionContext per unique symbol across Brain + external intel.
 */
export function buildContexts(
  brainAssessments: BrainAssessment[],
  intelBuffer: IntelBuffer,
  btcRegime: 'BULL' | 'BEAR' | 'NEUTRAL',
): MarketDecisionContext[] {
  const now = new Date().toISOString();

  // Collect all symbols
  const symbols = new Set<string>();
  const brainBySymbol = new Map<string, BrainAssessment>();

  for (const ba of brainAssessments) {
    const sym = ba.symbol.replace(/USDT$|PERP$/, '').toUpperCase();
    symbols.add(sym);
    brainBySymbol.set(sym, ba);
  }

  for (const sym of intelBuffer.getActiveSymbols()) {
    symbols.add(sym);
  }

  // Build one context per symbol
  const contexts: MarketDecisionContext[] = [];
  for (const symbol of symbols) {
    contexts.push({
      symbol,
      brainAssessment: brainBySymbol.get(symbol) || null,
      externalIntel: intelBuffer.getForSymbol(symbol),
      btcRegime,
      timestamp: now,
    });
  }

  return contexts;
}

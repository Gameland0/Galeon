/**
 * Legacy Adapter — Converts old-style agent signals to FIP AgentIntelligence
 *
 * Parses `entryReason` key=value pairs to detect capability type:
 *   EMA_gap + RSI → TrendIntelligence
 *   FR + taker    → OrderBookIntelligence (or FundingRateIntelligence)
 *   anything else → GeneralIntelligence
 */

import {
  AgentIntelligence, IntelligenceData, Timeframe,
  TrendIntelligence, OrderBookIntelligence, GeneralIntelligence,
} from './fip-types';
import { IntelBuffer } from './intelBuffer';

/** Strip USDT / PERP / USD suffix */
function normalizeSymbol(raw: string): string {
  return raw.replace(/USDT$|PERP$|-PERP$|USD$/, '').replace(/\/.*/, '').toUpperCase();
}

/** Parse "EMA_gap=0.85 RSI=58 taker=0.72" into { EMA_gap: 0.85, RSI: 58, taker: 0.72 } */
function parseEntryReason(reason: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!reason) return out;
  for (const part of reason.split(' ')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx);
      const v = parseFloat(part.slice(idx + 1));
      if (!isNaN(v)) out[k] = v;
    }
  }
  return out;
}

/**
 * Convert a legacy signal (from GET /positions) to FIP AgentIntelligence.
 */
export function adaptLegacySignal(
  agentId: string,
  agentName: string,
  signal: any,
): AgentIntelligence | null {
  if (!signal || !signal.symbol) return null;

  const symbol = normalizeSymbol(signal.symbol);
  const dims = parseEntryReason(signal.entryReason || '');
  const timestamp = signal.timestamp || new Date().toISOString();
  const expiresAt = IntelBuffer.defaultExpiry(timestamp);

  let data: IntelligenceData;
  let timeframe: Timeframe = '4h';

  // Detect capability from entryReason keys
  if (dims.EMA_gap !== undefined || dims.RSI !== undefined) {
    // TrendAgent-style: EMA crossover + RSI
    const gapPct = dims.EMA_gap ?? 0;
    const rsi = dims.RSI ?? 50;
    const isBullish = gapPct > 0 && rsi > 40;
    const isBearish = gapPct < 0 && rsi < 60;

    data = {
      capability: 'TREND_ANALYSIS',
      direction: isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL',
      trend_strength: Math.min(1.0, Math.abs(gapPct) / 2),
      market_regime: isBullish ? 'TREND_UP' : isBearish ? 'TREND_DOWN' : 'RANGING',
      ema_gap_pct: gapPct,
      rsi,
    } as TrendIntelligence;
    timeframe = '4h';

  } else if (dims.FR !== undefined || dims.taker !== undefined) {
    // OrderBookAgent-style: funding rate + taker ratio
    const taker = dims.taker ?? 0.5;
    const imbalance = (taker - 0.5) * 2; // -1.0 to +1.0

    data = {
      capability: 'ORDERBOOK_DEPTH',
      buy_sell_imbalance: parseFloat(imbalance.toFixed(3)),
      liquidity_depth: Math.abs(imbalance) > 0.3 ? 'HIGH' : 'MEDIUM',
      slippage_bps: Math.abs(imbalance) > 0.5 ? 3 : 6,
      taker_ratio: taker,
    } as OrderBookIntelligence;
    timeframe = '5m';

  } else {
    // Fallback: GeneralIntelligence
    const direction = signal.direction === 'LONG' ? 'BULLISH'
      : signal.direction === 'SHORT' ? 'BEARISH' : 'NEUTRAL';

    data = {
      capability: 'GENERAL',
      direction,
      confidence: signal.confidence || 50,
      reasoning: signal.entryReason || undefined,
    } as GeneralIntelligence;
    timeframe = '15m';
  }

  return {
    agentId,
    agentName,
    symbol,
    data,
    timeframe,
    timestamp,
    expiresAt,
  };
}

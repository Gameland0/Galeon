/**
 * Risk Check — Simplified risk controller for Agent
 * Core rules extracted from ai-server's RiskController.js
 */

import { Signal } from '../signals/signalPoller';
import { ExecutionLog } from '../store/executionLog';

const MAX_POSITIONS = parseInt(process.env.MAX_POSITIONS || '3');
const MAX_SINGLE_TRADE_USD = parseFloat(process.env.MAX_SINGLE_TRADE_USD || '100');
const DAILY_LOSS_LIMIT_PERCENT = parseFloat(process.env.DAILY_LOSS_LIMIT_PERCENT || '10');

export interface RiskResult {
  allowed: boolean;
  reason?: string;
  tradeAmount: number;
}

export class RiskCheck {
  check(accountId: string, signal: Signal, log: ExecutionLog): RiskResult {
    const activePositions = log.getActivePositions(accountId);

    // 1. Max positions
    if (activePositions.length >= MAX_POSITIONS) {
      return { allowed: false, reason: `Max positions reached (${MAX_POSITIONS})`, tradeAmount: 0 };
    }

    // 2. Duplicate symbol check
    const hasSameSymbol = activePositions.some(p => p.symbol === signal.symbol);
    if (hasSameSymbol) {
      return { allowed: false, reason: `Already have position in ${signal.symbol}`, tradeAmount: 0 };
    }

    // 3. Minimum confidence
    if (signal.confidence < 55) {
      return { allowed: false, reason: `Confidence too low: ${signal.confidence}%`, tradeAmount: 0 };
    }

    // 4. Daily loss limit
    const todayPnl = log.getTodayPnlPercent(accountId);
    if (todayPnl <= -DAILY_LOSS_LIMIT_PERCENT) {
      return { allowed: false, reason: `Daily loss limit reached: ${todayPnl.toFixed(1)}%`, tradeAmount: 0 };
    }

    // 5. Calculate trade amount (fixed amount for hackathon simplicity)
    const tradeAmount = Math.min(MAX_SINGLE_TRADE_USD, 100);

    return { allowed: true, tradeAmount };
  }
}

/**
 * GaleonBrain Contract Interface
 * Monad on-chain AI Trading Intelligence Layer
 */

import { ethers } from 'ethers';
import { MONAD_CONTRACTS, MONAD_CHAIN_CONFIG } from '../config/monad';

// ABI - only the read functions needed by frontend
export const GALEON_BRAIN_ABI = [
  // Query latest decision
  'function getTradeDecision(string asset) view returns (uint8 direction, uint8 confidence, uint8 riskLevel, int256 entryPrice, int256 stopLoss, int256 takeProfit, string reasoning, uint16 similarSetups, uint8 historicalWinRate, uint256 timestamp)',
  // Query trader stats
  'function getTraderFullStats(address trader) view returns (uint256 totalTrades, uint256 winCount, int256 totalPnlBps, uint256 totalMicroSteps, uint8 winRate)',
  // Query endorsed trade
  'function endorsedTrades(uint256 tradeId) view returns (address trader, address token, uint256 amount, uint8 direction, uint8 confidence, uint8 riskLevel, uint16 similarSetups, uint8 historicalWinRate, uint256 decisionId, uint256 timestamp, bool settled, int256 pnlBps, uint8 microSteps)',
  // Counts
  'function decisionCount() view returns (uint256)',
  'function endorsedTradeCount() view returns (uint256)',
  // Trader history
  'function getTraderTradeCount(address trader) view returns (uint256)',
  'function getTraderTradeId(address trader, uint256 index) view returns (uint256)',
  // Events
  'event DecisionPublished(string indexed assetIndexed, string asset, uint8 direction, uint8 confidence, uint256 decisionId)',
  'event TradeEndorsed(address indexed trader, address token, uint256 amount, uint8 confidence, uint256 tradeId)',
  'event TradeSettled(uint256 indexed tradeId, int256 pnlBps, uint8 microSteps)',
];

export const DIRECTION_LABELS: Record<number, string> = {
  0: 'WAIT',
  1: 'LONG',
  2: 'SHORT',
};

export const RISK_LABELS: Record<number, string> = {
  0: 'LOW',
  1: 'MEDIUM',
  2: 'HIGH',
};

export interface TradeDecision {
  asset: string;
  direction: number;
  directionLabel: string;
  confidence: number;
  riskLevel: number;
  riskLabel: string;
  entryPrice: bigint;
  stopLoss: bigint;
  takeProfit: bigint;
  reasoning: string;
  similarSetups: number;
  historicalWinRate: number;
  timestamp: number;
}

export interface TraderStats {
  totalTrades: number;
  winCount: number;
  totalPnlBps: number;
  totalMicroSteps: number;
  winRate: number;
}

export interface AIEndorsedTrade {
  tradeId: number;
  trader: string;
  token: string;
  amount: bigint;
  direction: number;
  confidence: number;
  riskLevel: number;
  similarSetups: number;
  historicalWinRate: number;
  decisionId: number;
  timestamp: number;
  settled: boolean;
  pnlBps: number;
  microSteps: number;
}

/**
 * Get GaleonBrain contract instance (read-only)
 */
export function getGaleonBrainContract(provider?: ethers.Provider): ethers.Contract {
  const rpcUrl = MONAD_CHAIN_CONFIG.rpcUrls[0];
  const p = provider || new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(MONAD_CONTRACTS.GaleonBrain, GALEON_BRAIN_ABI, p);
}

/**
 * Fetch latest trade decision for an asset
 */
export async function fetchTradeDecision(asset: string): Promise<TradeDecision | null> {
  try {
    const contract = getGaleonBrainContract();
    const result = await contract.getTradeDecision(asset);

    return {
      asset,
      direction: Number(result.direction),
      directionLabel: DIRECTION_LABELS[Number(result.direction)] || 'UNKNOWN',
      confidence: Number(result.confidence),
      riskLevel: Number(result.riskLevel),
      riskLabel: RISK_LABELS[Number(result.riskLevel)] || 'UNKNOWN',
      entryPrice: result.entryPrice,
      stopLoss: result.stopLoss,
      takeProfit: result.takeProfit,
      reasoning: result.reasoning,
      similarSetups: Number(result.similarSetups),
      historicalWinRate: Number(result.historicalWinRate),
      timestamp: Number(result.timestamp),
    };
  } catch (error) {
    console.error(`Failed to fetch decision for ${asset}:`, error);
    return null;
  }
}

/**
 * Fetch trader stats from on-chain
 */
export async function fetchTraderStats(traderAddress: string): Promise<TraderStats | null> {
  try {
    const contract = getGaleonBrainContract();
    const result = await contract.getTraderFullStats(traderAddress);

    return {
      totalTrades: Number(result.totalTrades),
      winCount: Number(result.winCount),
      totalPnlBps: Number(result.totalPnlBps),
      totalMicroSteps: Number(result.totalMicroSteps),
      winRate: Number(result.winRate),
    };
  } catch (error) {
    console.error(`Failed to fetch stats for ${traderAddress}:`, error);
    return null;
  }
}

/**
 * Fetch a specific AI-endorsed trade
 */
export async function fetchEndorsedTrade(tradeId: number): Promise<AIEndorsedTrade | null> {
  try {
    const contract = getGaleonBrainContract();
    const t = await contract.endorsedTrades(tradeId);

    return {
      tradeId,
      trader: t.trader,
      token: t.token,
      amount: t.amount,
      direction: Number(t.direction),
      confidence: Number(t.confidence),
      riskLevel: Number(t.riskLevel),
      similarSetups: Number(t.similarSetups),
      historicalWinRate: Number(t.historicalWinRate),
      decisionId: Number(t.decisionId),
      timestamp: Number(t.timestamp),
      settled: t.settled,
      pnlBps: Number(t.pnlBps),
      microSteps: Number(t.microSteps),
    };
  } catch (error) {
    console.error(`Failed to fetch trade #${tradeId}:`, error);
    return null;
  }
}

/**
 * Fetch all endorsed trades for a trader
 */
export async function fetchTraderTrades(traderAddress: string): Promise<AIEndorsedTrade[]> {
  try {
    const contract = getGaleonBrainContract();
    const count = Number(await contract.getTraderTradeCount(traderAddress));
    const trades: AIEndorsedTrade[] = [];

    for (let i = 0; i < count; i++) {
      const tradeId = Number(await contract.getTraderTradeId(traderAddress, i));
      const trade = await fetchEndorsedTrade(tradeId);
      if (trade) trades.push(trade);
    }

    return trades;
  } catch (error) {
    console.error(`Failed to fetch trades for ${traderAddress}:`, error);
    return [];
  }
}

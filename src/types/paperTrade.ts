export type PaperTradeStrategy = 'stable' | 'aggressive';

export interface PaperTradeOverview {
  env: string;
  strategy: PaperTradeStrategy;
  capital: number;
  availableCapital: number;
  startCapital: number;
  totalReturn: number;
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  daysRunning: number;
  dailyPnl: number;
  activePositions: number;
  consecutiveLosses: number;
  btcTrend: string;
  paused: boolean;
  startedAt?: string;
  maxFutures?: number;
  maxSpot?: number;
}

export interface PaperTradePosition {
  id: string;
  symbol: string;
  tokenSymbol: string;
  direction: 'LONG' | 'SHORT';
  isSpot: boolean;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  marginUsed: number;
  stopLoss: number;
  slCurrent: number;
  unrealizedPnlPct: number;
  confidence: number;
  entryScore: number;
  entrySource: string;
  entryReason: string;
  health: number;
  enteredAt: string;
  remainingPct: number;
  partialExits: number;
}

export interface PaperTradeHistoryItem {
  id: string;
  symbol: string;
  tokenSymbol: string;
  direction: 'LONG' | 'SHORT';
  isSpot: boolean;
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  exitReason: string;
  durationMin: number;
  entryScore: number;
  entrySource: string;
  confidence: number;
  closedAt: string;
  enteredAt: string;
}

export interface PaperTradeHistoryResponse {
  trades: PaperTradeHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CapitalHistoryItem {
  date: string;
  capital: number;
  dailyPnl: number;
  winCount: number;
  lossCount: number;
  positionsCount: number;
  profitFactor: number;
  drawdownPct: number;
  qualityExits: number;
  avgWin: number;
  avgLoss: number;
}

export interface DimWeight {
  dimension: string;
  accuracy: number;
  sampleCount: number;
}

export interface LearningStats {
  weights: DimWeight[];
  sources: { source: string; wins: number; losses: number; totalPnl: number }[];
  topPatterns: { pattern: string; wins: number; losses: number; totalPnl: number }[];
  topGainers: { symbol: string; count: number; totalChange: number }[];
}

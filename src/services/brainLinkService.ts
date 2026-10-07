/**
 * Brain Link API Service
 * Frontend client for Galeon Brain Link API endpoints
 */

import axios from 'axios';

// Reuse the same base URL logic as api.ts
function getBaseUrl(): string {
  const host = window.location.host;
  if (host.includes('testai.galeon.world')) return 'https://testaiservice.galeon.world/api';
  if (host.includes('testai.gameland.network')) return 'https://testaiservice.gameland.network/api';
  if (host.includes('localhost')) return 'http://localhost:9090/api';
  if (host.includes('brainlink.galeon.world')) return 'https://brainlink.galeon.world/api';
  if (host.includes('galeon.world')) return 'https://galeon.world/api';
  return 'https://galeon.gameland.network/api';
}

const brainApi = axios.create({
  baseURL: `${getBaseUrl()}/brain-link`,
  timeout: 15000,
});

// Add auth token if available
brainApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ========== Types ==========

export interface BrainDecision {
  asset: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  confidence: number;
  score: number;
  absScore: number;
  passed: boolean;
  leverage: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string;
  price: number;
  entryZone: { min: number; max: number };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  similarSetups: number;
  winRate: number;
  decisionId: string | null;
  timestamp: number;
}

export interface DecisionSummary {
  asset: string;
  direction: string;
  confidence: number;
  score: number;
  passed: boolean;
  decisionId: string | null;
  timestamp: number;
  similarSetups: number;
  winRate: number;
}

export interface VoteDimension {
  dimension: string;
  score: number;
  reason: string;
  type: 'bullish' | 'bearish' | 'neutral';
}

export interface DecisionDetail {
  asset: string;
  direction: string;
  score: number;
  absScore: number;
  confidence: number;
  passed: boolean;
  bullVotes: number;
  bearVotes: number;
  consistency: number;
  votes: VoteDimension[];
  marketData: Record<string, any>;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  leverage: number;
  evidence: Record<string, any>;
  decisionId: string | null;
  timestamp: number;
}

export interface RiskAssessment {
  riskScore: number;
  action: 'PASS' | 'ADJUST' | 'REJECT';
  suggestedAmount: number;
  reason: string;
}

export interface MicroPlan {
  asset: string;
  totalAmount: number;
  direction: string;
  steps: Array<{
    step: number;
    type: string;
    percent: number;
    amount?: number;
    condition: string;
  }>;
  safety: string;
  estimatedGas: string;
  note?: string;
}

export interface TraderStats {
  address: string;
  totalTrades: number;
  winCount: number;
  winRate: number;
  totalPnl: string;
  avgPnlPercent: string;
  aiTrustScore: number;
}

export interface BrainActivity {
  type: string;
  asset: string;
  message: string;
  data: Record<string, any>;
  timestamp: number;
}

export interface TimelineEntry {
  direction: string;
  score: number;
  confidence: number;
  riskLevel: string;
  reasoning: string;
  decisionId: string | null;
  timestamp: string;
}

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartAnnotation {
  time: number;
  type: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  reasoning: string;
}

// ========== API Functions ==========

/** Get all active Brain decisions */
export async function getAllDecisions(): Promise<DecisionSummary[]> {
  const { data } = await brainApi.get('/decisions');
  return data.decisions || [];
}

/** Get Brain decision for a specific asset */
export async function getDecision(asset: string): Promise<BrainDecision> {
  const { data } = await brainApi.get(`/decision/${asset}`);
  return data;
}

/** Get detailed decision with full voting breakdown */
export async function getDecisionDetail(asset: string): Promise<DecisionDetail> {
  const { data } = await brainApi.get(`/decision-detail/${asset}`);
  return data;
}

/** Get decision change timeline for an asset */
export async function getDecisionTimeline(asset: string, limit = 20): Promise<TimelineEntry[]> {
  const { data } = await brainApi.get(`/decision-timeline/${asset}`, { params: { limit } });
  return data.timeline || [];
}

/** Assess risk for a proposed trade */
export async function assessRisk(
  walletAddress: string,
  asset: string,
  amount: number,
  direction?: string
): Promise<RiskAssessment> {
  const { data } = await brainApi.post('/assess-risk', { walletAddress, asset, amount, direction });
  return data;
}

/** Get micro-execution plan preview */
export async function getMicroPlan(
  asset: string,
  amount: number,
  direction: string = 'LONG'
): Promise<MicroPlan> {
  const { data } = await brainApi.get(`/micro-plan/${asset}`, { params: { amount, direction } });
  return data;
}

/** Get K-line chart data with Brain annotations */
export async function getChartData(
  asset: string,
  interval: string = '1h',
  limit: number = 100
): Promise<{ candles: ChartCandle[]; annotations: ChartAnnotation[] }> {
  const { data } = await brainApi.get(`/chart/${asset}`, { params: { interval, limit } });
  return data;
}

/** Get on-chain verified trader stats */
export async function getTraderStats(address: string): Promise<TraderStats> {
  const { data } = await brainApi.get(`/trader/${address}/stats`);
  return data;
}

/** Get trader's AI-endorsed trade history */
export async function getTraderTrades(address: string, page = 1, limit = 20): Promise<any[]> {
  const { data } = await brainApi.get(`/trader/${address}/trades`, { params: { page, limit } });
  return data.trades || [];
}

/** Get Brain learning evolution data */
export async function getLearningEvolution(): Promise<any> {
  const { data } = await brainApi.get('/learning/evolution');
  return data;
}

/** Get recent Brain activity events */
export async function getActivity(limit = 30, since = 0): Promise<BrainActivity[]> {
  const { data } = await brainApi.get('/activity', { params: { limit, since } });
  return data.activities || [];
}

/** Get activity for a specific asset */
export async function getAssetActivity(asset: string, limit = 20): Promise<BrainActivity[]> {
  const { data } = await brainApi.get(`/activity/${asset}`, { params: { limit } });
  return data.activities || [];
}

/** Create Agent Wallet (Smart Account) for user */
export async function createAgentWallet(userAddress: string): Promise<any> {
  const { data } = await brainApi.post('/agent-wallet/create', { userAddress });
  return data;
}

/** Get Agent Wallet status + balances */
export async function getAgentWallet(address: string): Promise<any> {
  const { data } = await brainApi.get(`/agent-wallet/${address}`);
  return data;
}

/** Enable auto-trade for Agent Wallet */
export async function enableAgentAutoTrade(userAddress: string, maxPerTrade: number, totalLimit: number): Promise<any> {
  const { data } = await brainApi.post('/agent-wallet/enable', { userAddress, maxPerTrade, totalLimit });
  return data;
}

/** Get live Monad auto-trade positions + balances */
export async function getMonadPositions(): Promise<{
  active: any[];
  closed: any[];
  balances: { usdc: number; mon: number };
  currentPrice: number | null;
}> {
  const { data } = await brainApi.get('/monad/positions');
  return data;
}

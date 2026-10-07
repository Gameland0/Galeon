/**
 * Prediction Market Types
 */

// ============ Event ============

export type EventStatus = 'OPEN' | 'SETTLED' | 'CANCELLED' | 'NO_WINNER';

export interface PredictionEvent {
  event_id: string;
  pt_trade_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  leverage: number;
  stop_loss_pct: number;

  status: EventStatus;

  pt_opened_at: string;
  visible_at: string;
  closed_at: string | null;
  settled_at: string | null;

  actual_pnl_pct: number | null;
  is_loss: boolean;
  threshold_t: number;
  qualification_gate: number;

  total_pool: number;
  platform_fee: number;
  available_pool: number;
  total_payout: number;
  reserve_amount: number;

  participant_count: number;
  qualified_count: number;
  winner_count: number;
  max_winners: number;

  // 积分池数据
  points_participant_count?: number;
  points_winner_count?: number;
  points_pool?: number;
  points_total_payout?: number;

  // 列表查询时附加
  bet_count?: number;
  // Live position data (from getOpenEvents JOIN)
  current_price?: number | null;
  position_health?: number | null;
  current_pnl_pct?: number | null;
}

// ============ Bet ============

export interface PredictionBet {
  id: number;
  event_id: string;
  user_address: string;

  predicted_pnl_pct: number;
  bet_amount: number;

  distance: number | null;
  rate: number | null;
  rank_position: number | null;
  rank_weight: number | null;
  effective_weight: number | null;

  is_qualified: boolean | null;
  is_winner: boolean | null;

  payout: number;
  net_pnl: number;

  bet_tx_hash: string | null;
  payout_tx_hash: string | null;

  created_at: string;
}

// ============ Settlement Result ============

export interface SettlementResult {
  event: PredictionEvent;
  bets: SettlementBet[];
}

export interface SettlementBet {
  user_address: string;
  predicted_pnl_pct: number;
  bet_amount: number;
  distance: number;
  rate: number | null;
  rank_position: number | null;
  is_qualified: boolean;
  is_winner: boolean;
  payout: number;
  net_pnl: number;
}

// ============ User ============

export interface PredictionUserStats {
  user_address: string;
  total_bets: number;
  total_wins: number;
  win_as_1st: number;
  win_as_2nd: number;
  win_as_3rd: number;
  win_as_other: number;
  total_qualified: number;
  total_bet_amount: number;
  total_payout: number;
  net_pnl: number;
  best_distance: number | null;
  current_win_streak: number;
  best_win_streak: number;
}

export interface UserBetHistory extends PredictionBet {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  actual_pnl_pct: number | null;
  event_status: EventStatus;
  settled_at: string | null;
  participant_count: number;
  winner_count: number;
}

// ============ Leaderboard ============

export interface LeaderboardEntry {
  user_address: string;
  total_bets: number;
  total_wins: number;
  total_bet_amount: number;
  total_payout: number;
  net_pnl: number;
  best_win_streak: number;
  win_rate: number;
}

// ============ Reserve Pool ============

export interface ReserveBalance {
  balance: number;
  total_in_count: number;
  total_in: number;
  total_out_count: number;
  total_out: number;
}

// ============ API Request / Response ============

export interface PlaceBetRequest {
  eventId: string;
  predictedPnlPct: number;
  betAmount: number;
  txHash?: string; // 链上 placeBet tx hash
  betType?: 'USDC' | 'POINTS';
}

export interface PointsBalance {
  user_address: string;
  balance: number;
  total_earned: number;
  total_spent: number;
}

export interface PointsLedgerEntry {
  amount: number;
  type: string;
  ref_id: string | null;
  balance_after: number;
  created_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============ Settlement Engine Config (mirror of backend) ============

export const PREDICTION_CONFIG = {
  THRESHOLD_LONG: 2.0,
  THRESHOLD_LOSS: 2.0,
  GATE_LONG: 2.0,
  GATE_LOSS: 2.0,
  PLATFORM_FEE_PCT: 0,
  RESERVE_BASE_PCT: 0,
  AVAILABLE_PCT: 1.0,
  MAX_WINNERS_CAP: 50,
  MIN_BET: 1,
  MAX_BET: 500,
  PREDICT_MIN: -20,
  PREDICT_MAX: 200,
} as const;

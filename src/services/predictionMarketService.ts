/**
 * Prediction Market API Client
 *
 * 前端调用后端 /api/prediction/* 接口
 */

import { api } from './api';
import type {
  PredictionEvent,
  SettlementResult,
  PredictionBet,
  PredictionUserStats,
  UserBetHistory,
  LeaderboardEntry,
  ReserveBalance,
  PlaceBetRequest,
  ApiResponse,
} from '../types/prediction';

const BASE = '/prediction';

// ============ 公开接口 ============

/** 获取当前可见的 OPEN 事件列表 */
export async function getOpenEvents(): Promise<PredictionEvent[]> {
  const res = await api.get<ApiResponse<PredictionEvent[]>>(`${BASE}/events`);
  return res.data.data || [];
}

/** 获取事件详情 */
export async function getEventDetail(eventId: string): Promise<PredictionEvent | null> {
  const res = await api.get<ApiResponse<PredictionEvent>>(`${BASE}/events/${eventId}`);
  return res.data.data || null;
}

/** 获取事件预测分布 */
export async function getEventDistribution(eventId: string): Promise<{ label: string; count: number; pct: number }[]> {
  const res = await api.get<ApiResponse<{ label: string; count: number; pct: number }[]>>(`${BASE}/events/${eventId}/distribution`);
  return res.data.data || [];
}

/** 获取已结算事件的完整结果 */
export async function getEventSettlement(eventId: string): Promise<SettlementResult | null> {
  const res = await api.get<ApiResponse<SettlementResult>>(`${BASE}/events/${eventId}/settlement`);
  return res.data.data || null;
}

/** 最近已结算事件 */
export async function getRecentSettled(limit = 20): Promise<PredictionEvent[]> {
  const res = await api.get<ApiResponse<PredictionEvent[]>>(`${BASE}/recent`, { params: { limit } });
  return res.data.data || [];
}

/** 排行榜 */
export async function getLeaderboard(limit = 20, betType = 'USDC'): Promise<LeaderboardEntry[]> {
  const res = await api.get<ApiResponse<LeaderboardEntry[]>>(`${BASE}/leaderboard`, { params: { limit, betType } });
  return res.data.data || [];
}

/** 储备池状态 */
export async function getReserveBalance(): Promise<ReserveBalance | null> {
  const res = await api.get<ApiResponse<ReserveBalance>>(`${BASE}/reserve`);
  return res.data.data || null;
}

/** 平台统计（历史总数据） */
export async function getPlatformStats(): Promise<{ total_users: number; total_volume: number; total_bets: number; total_events: number }> {
  const res = await api.get<ApiResponse<any>>(`${BASE}/stats`);
  return res.data.data || { total_users: 0, total_volume: 0, total_bets: 0, total_events: 0 };
}

// ============ 认证接口 ============

/** 下注 */
export async function placeBet(data: PlaceBetRequest): Promise<{ success: boolean }> {
  const res = await api.post<ApiResponse<{ success: boolean }>>(`${BASE}/bet`, data);
  if (!res.data.success) throw new Error(res.data.error || 'Bet failed');
  return res.data.data!;
}

/** 查看自己在某事件的下注 */
export async function getMyBet(eventId: string): Promise<PredictionBet | null> {
  const res = await api.get<ApiResponse<PredictionBet | null>>(`${BASE}/my/bet/${eventId}`);
  return res.data.data || null;
}

/** 用户历史记录 */
export async function getMyHistory(limit = 50, offset = 0): Promise<UserBetHistory[]> {
  const res = await api.get<ApiResponse<UserBetHistory[]>>(`${BASE}/my/history`, {
    params: { limit, offset },
  });
  return res.data.data || [];
}

/** 用户统计 */
export async function getMyStats(): Promise<PredictionUserStats | null> {
  const res = await api.get<ApiResponse<PredictionUserStats>>(`${BASE}/my/stats`);
  return res.data.data || null;
}

// ============ Season 接口 ============

/** Season 概览 */
export async function getSeasonInfo(): Promise<any> {
  const res = await api.get<ApiResponse<any>>(`${BASE}/season`);
  return res.data.data || null;
}

/** 用户 Season 积分详情 */
export async function getMySeasonStats(): Promise<any> {
  const res = await api.get<ApiResponse<any>>(`${BASE}/season/my-stats`);
  return res.data.data || null;
}

/** Weekly Leaderboard */
export async function getWeeklyLeaderboard(): Promise<any[]> {
  const res = await api.get<ApiResponse<any[]>>(`${BASE}/season/leaderboard/weekly`);
  return res.data.data || [];
}

/** Season Leaderboard */
export async function getSeasonLeaderboard(): Promise<any[]> {
  const res = await api.get<ApiResponse<any[]>>(`${BASE}/season/leaderboard/season`);
  return res.data.data || [];
}

/** Accuracy Leaderboard */
export async function getAccuracyLeaderboard(): Promise<any[]> {
  const res = await api.get<ApiResponse<any[]>>(`${BASE}/season/leaderboard/accuracy`);
  return res.data.data || [];
}

/** Monthly Profit Leaderboard */
export async function getMonthlyProfitLeaderboard(): Promise<any[]> {
  const res = await api.get<ApiResponse<any[]>>(`${BASE}/season/leaderboard/monthly`);
  return res.data.data || [];
}

// ============ Referral 接口 ============

/** 获取我的推广码 */
export async function getReferralCode(): Promise<any> {
  const res = await api.get<ApiResponse<any>>('/referral/code');
  return res.data.data || null;
}

// ============ 积分接口 ============

/** 获取积分余额（首次调用自动发放注册奖励） */
export async function getPointsBalance(): Promise<any> {
  const eth = (window as any).ethereum;
  let address = '';
  if (eth) {
    try {
      const accounts = await eth.request({ method: 'eth_accounts' });
      address = accounts?.[0] || '';
    } catch {}
  }
  if (!address) throw new Error('NO_WALLET');
  const res = await api.get<ApiResponse<any>>(`${BASE}/points/balance`, { params: { address } });
  return res.data.data || null;
}

/** 获取积分流水 */
export async function getPointsLedger(limit = 50, offset = 0): Promise<any[]> {
  const res = await api.get<ApiResponse<any[]>>(`${BASE}/points/ledger`, { params: { limit, offset } });
  return res.data.data || [];
}

// ============ 推广接口 ============

/** 获取推广统计 */
export async function getReferralStats(): Promise<any> {
  const res = await api.get<ApiResponse<any>>('/referral/stats');
  return res.data.data || null;
}

/** 获取佣金明细 */
export async function getReferralHistory(): Promise<any[]> {
  const res = await api.get<ApiResponse<any[]>>('/referral/history');
  return res.data.data || [];
}

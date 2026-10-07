/**
 * Twitter Signal API 服务层
 * 提供所有 Twitter KOL 信号相关的 API 调用
 */

import { api } from './api';

// ==================== 类型定义 ====================

export interface KOLConfig {
  id: number;
  strategy_id: number;
  user_address: string;
  kol_handle: string;
  kol_weight: number;
  original_weight: number;
  trust_mode: 'STRICT' | 'FULL_TRUST';
  enabled: boolean;
  win_rate_30d: number;
  last_weight_adjustment: string | null;
  created_at: string;
  updated_at: string;
}

export interface TwitterSignal {
  id: number;
  signal_id: string;
  strategy_id: number;
  user_address: string;
  kol_handle: string;
  token_symbol: string;
  chain: string;
  signal_type: 'BUY' | 'SELL';
  tweet_url: string;
  tweet_content: string;
  detected_at: string;

  // 评分
  kol_weight: number;
  tweet_engagement: number;
  external_score: number;
  internal_score: number;
  final_score: number;

  // 执行状态
  executed: boolean;
  rejection_reason: string | null;
  execution_id: string | null;

  // 结果
  result: 'WIN' | 'LOSS' | 'OPEN';
  entry_price: number | null;
  exit_price: number | null;
  profit_loss_usdt: number | null;
  profit_loss_percent: number | null;
  close_reason: string | null;
  closed_at: string | null;
}

export interface SignalHistoryStats {
  total_signals: number;
  executed_count: number;
  wins: number;
  losses: number;
  total_profit: number;
}

export interface KOLPerformance {
  basicStats: {
    winRate: number;
    totalTrades: number;
    wins: number;
    losses: number;
    totalProfit: number;
    avgProfitPercent: number;
  };
  recentTrades: Array<{
    token_symbol: string;
    signal_type: 'BUY' | 'SELL';
    detected_at: string;
    executed: boolean;
    result: 'WIN' | 'LOSS' | 'OPEN';
    profit_loss_usdt: number | null;
    profit_loss_percent: number | null;
  }>;
  tokenDistribution: Array<{
    token_symbol: string;
    signal_count: number;
    executed_count: number;
    win_count: number;
    total_profit: number;
  }>;
  weightInfo: {
    currentWeight: number;
    originalWeight: number;
    lastAdjustment: string | null;
  } | null;
}

export interface KOLRanking {
  rank: number;
  kolHandle: string;
  weight: number;
  winRate30d: number;
  totalSignals: number;
  executedCount: number;
  winCount: number;
  lossCount: number;
  totalProfit: number;
  avgProfitPercent: number;
}

export interface WeightAdjustmentResult {
  newWeight: number;
  oldWeight?: number;
  reason: string;
  winRate: number;
  totalTrades: number;
  totalProfit?: number;
  adjusted: boolean;
}

export interface MonitorStatus {
  activeCount: number;
  strategies: number[];
}

// ==================== API 调用函数 ====================

/**
 * 添加 KOL 到策略
 */
export const addKOL = async (params: {
  strategyId: number;
  kolHandle: string;
  kolWeight: 60 | 80 | 90;
  trustMode: 'STRICT' | 'FULL_TRUST';
}, accessToken: string) => {
  const response = await api.post('/auto-trade/twitter/kol/add', params, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

/**
 * 删除 KOL
 */
export const removeKOL = async (
  strategyId: number,
  kolHandle: string,
  accessToken: string
) => {
  const response = await api.delete(
    `/auto-trade/twitter/kol/${strategyId}/${kolHandle}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.data;
};

/**
 * 获取策略的 KOL 列表
 */
export const getStrategyKOLs = async (
  strategyId: number,
  accessToken: string
): Promise<{ kols: KOLConfig[] }> => {
  const response = await api.get(`/auto-trade/twitter/kols/${strategyId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

/**
 * 获取信号历史
 */
export const getSignalHistory = async (
  strategyId: number,
  accessToken: string,
  params?: { limit?: number; offset?: number }
): Promise<{ history: TwitterSignal[]; stats: SignalHistoryStats }> => {
  const response = await api.get(`/auto-trade/twitter/history/${strategyId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    params
  });
  return response.data;
};

/**
 * 获取 KOL 绩效统计
 */
export const getKOLPerformance = async (
  strategyId: number,
  kolHandle: string,
  accessToken: string
): Promise<KOLPerformance> => {
  const response = await api.get(
    `/auto-trade/twitter/kol/performance/${strategyId}/${kolHandle}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.data;
};

/**
 * 获取 KOL 排名
 */
export const getKOLRanking = async (
  accessToken: string,
  strategyId?: number,
  limit: number = 10
): Promise<{ ranking: KOLRanking[] }> => {
  const url = strategyId
    ? `/auto-trade/twitter/kol/ranking/${strategyId}`
    : '/auto-trade/twitter/kol/ranking';

  const response = await api.get(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    params: { limit }
  });
  return response.data;
};

/**
 * 手动调整 KOL 权重 (自动模式)
 */
export const adjustKOLWeight = async (
  strategyId: number,
  kolHandle: string,
  accessToken: string
): Promise<WeightAdjustmentResult> => {
  const response = await api.post(
    '/auto-trade/twitter/kol/adjust-weight',
    { strategyId, kolHandle },
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.data;
};

/**
 * 手动更新 KOL 权重
 */
export const updateKOLWeight = async (
  strategyId: number,
  kolHandle: string,
  newWeight: number,
  accessToken: string
): Promise<{ success: boolean; message: string }> => {
  const response = await api.post(
    '/auto-trade/twitter/kol/update-weight',
    { strategyId, kolHandle, newWeight },
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.data;
};

/**
 * 启动/停止 Twitter 监控
 */
export const toggleMonitoring = async (
  strategyId: number,
  enabled: boolean,
  accessToken: string
) => {
  const response = await api.post(
    '/auto-trade/twitter/monitor/toggle',
    { strategyId, enabled },
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.data;
};

/**
 * 获取 Twitter 监控状态
 */
export const getMonitorStatus = async (
  accessToken: string
): Promise<MonitorStatus> => {
  const response = await api.get('/auto-trade/twitter/monitor/status', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

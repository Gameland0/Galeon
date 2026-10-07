/**
 * Telegram Signal API 服务层
 * 提供所有 Telegram 群组信号相关的 API 调用
 */

import { api } from './api';

// ==================== 类型定义 ====================

export interface TelegramUserAuth {
  userId: string;
  telegramUserId: number;
  telegramUsername: string;
  telegramName: string;
  isActive: boolean;
  sessionExpiresAt: string;
  // 后端可能返回的替代字段名
  firstName?: string;
  lastName?: string;
  username?: string;
}

export interface TelegramGroup {
  chatId: number;
  chatTitle: string;
  chatUsername?: string;
  chatType: 'GROUP' | 'SUPERGROUP' | 'CHANNEL';
  memberCount?: number;
}

export interface TelegramGroupConfig {
  id: number;
  strategyId: string;
  chatId: number;
  chatTitle: string;
  chatUsername?: string;
  chatType: 'GROUP' | 'SUPERGROUP' | 'CHANNEL';
  enabled: boolean;
  trustMode: 'STRICT' | 'BALANCED' | 'AGGRESSIVE';
  minConfidence: number;
  messageCount: number;
  signalCount: number;
  lastCheckTime?: string;
  createdAt: string;
}

export interface TelegramSignal {
  signalId: string;
  chatId: number;
  chatTitle: string;
  messageText: string;
  tokens: Array<{
    symbol: string;
    chain?: string;
    contractAddress?: string;
  }>;
  aiScore: number;
  signalType: 'BUY' | 'SELL' | 'LONG' | 'SHORT' | 'HOLD';
  tradeExecuted: boolean;
  tradeResult?: string;
  createdAt: string;
  processedAt?: string;
}

export interface TelegramGroupStats {
  chatId: number;
  chatTitle: string;
  chatType: string;
  totalMessages: number;
  totalSignals: number;
  lastCheckTime?: string;
  createdAt: string;
  recentStats: Array<{
    date: string;
    signal_count: number;
    trade_count: number;
  }>;
}

export interface TelegramMonitorStatus {
  isRunning: boolean;
  connectedUsers: number;
  monitoredGroups: number;
  lastUpdateTime?: string;
}

// ==================== 授权相关 API ====================

/**
 * 发起 Telegram 授权
 */
export const initiateAuth = async (accessToken: string): Promise<{
  success: boolean;
  alreadyAuthorized?: boolean;
  telegramUser?: TelegramUserAuth;
  tempId?: string;
  qrCodeDataUrl?: string;
  expiresAt?: string;
  message?: string;
}> => {
  const response = await api.post('/auto-trade/telegram/auth/initiate', {}, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

/**
 * 检查授权状态
 */
export const checkAuthStatus = async (
  accessToken: string,
  tempId?: string
): Promise<{
  success: boolean;
  status?: 'pending' | 'success' | 'expired' | 'completed' | 'need_2fa' | 'verifying_2fa';
  authorized?: boolean;
  needsReauth?: boolean;
  telegramUser?: TelegramUserAuth;
  expiresAt?: string;
  message?: string;
  error?: string;
  // 2FA相关字段
  needs2FA?: boolean;
  passwordHint?: string;
}> => {
  const params = tempId ? { tempId } : {};
  const response = await api.get('/auto-trade/telegram/auth/status', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    params
  });
  return response.data;
};

/**
 * 提交2FA密码
 */
export const submit2FA = async (
  accessToken: string,
  tempId: string,
  password: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  const response = await api.post('/auto-trade/telegram/auth/2fa', {
    tempId,
    password
  }, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

/**
 * 撤销 Telegram 授权
 */
export const revokeAuth = async (accessToken: string): Promise<{
  success: boolean;
  message: string;
}> => {
  const response = await api.post('/auto-trade/telegram/auth/revoke', {}, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

// ==================== 群组管理 API ====================

/**
 * 获取用户的所有 Telegram 群组和频道
 */
export const getUserGroups = async (accessToken: string): Promise<{
  success: boolean;
  groups: TelegramGroup[];
  channels: TelegramGroup[];
  total: number;
}> => {
  const response = await api.get('/auto-trade/telegram/groups', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

/**
 * 添加监控群组
 */
export const addGroup = async (params: {
  strategyId: number | string;
  chatId: number;
  chatTitle?: string;
  chatUsername?: string | null;
  chatType?: 'GROUP' | 'SUPERGROUP' | 'CHANNEL';
  trustMode?: 'STRICT' | 'BALANCED' | 'AGGRESSIVE';
  minConfidence?: number;
}, accessToken: string): Promise<{
  success: boolean;
  groupConfig: TelegramGroupConfig;
}> => {
  // 后端 addGroup 控制器期望驼峰命名，直接发送原始 params
  const response = await api.post('/auto-trade/telegram/group/add', params, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

/**
 * 删除监控群组
 */
export const removeGroup = async (
  strategyId: number | string,
  chatId: number,
  accessToken: string
): Promise<{
  success: boolean;
  message: string;
}> => {
  const response = await api.delete(
    `/auto-trade/telegram/group/${strategyId}/${chatId}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.data;
};

/**
 * 获取策略的监控群组列表
 */
export const getStrategyGroups = async (
  strategyId: number | string,
  accessToken: string
): Promise<{
  success: boolean;
  groups: TelegramGroupConfig[];
  count: number;
}> => {
  const response = await api.get(`/auto-trade/telegram/groups/${strategyId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

/**
 * 更新群组配置
 */
export const updateGroupConfig = async (
  strategyId: number | string,
  chatId: number,
  updates: {
    trustMode?: 'STRICT' | 'BALANCED' | 'AGGRESSIVE';
    minConfidence?: number;
    enabled?: boolean;
  },
  accessToken: string
): Promise<{
  success: boolean;
  message: string;
}> => {
  // 🔧 转换字段名：驼峰 → 下划线（匹配后端格式）
  const backendUpdates: any = {};
  if (updates.trustMode !== undefined) {
    backendUpdates.trust_mode = updates.trustMode;
  }
  if (updates.minConfidence !== undefined) {
    backendUpdates.min_confidence = updates.minConfidence;
  }
  if (updates.enabled !== undefined) {
    backendUpdates.enabled = updates.enabled;
  }

  const response = await api.patch(
    `/auto-trade/telegram/group/${strategyId}/${chatId}`,
    backendUpdates,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.data;
};

// ==================== 信号历史 API ====================

/**
 * 获取信号历史
 */
export const getSignalHistory = async (
  strategyId: number | string,
  accessToken: string,
  params?: { limit?: number; offset?: number }
): Promise<{
  success: boolean;
  signals: TelegramSignal[];
  total: number;
  limit: number;
  offset: number;
}> => {
  const response = await api.get(`/auto-trade/telegram/history/${strategyId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    params
  });
  return response.data;
};

/**
 * 获取群组统计
 */
export const getGroupStats = async (
  chatId: number,
  accessToken: string
): Promise<{
  success: boolean;
  group: TelegramGroupStats;
  recentStats: Array<{
    date: string;
    signal_count: number;
    trade_count: number;
  }>;
}> => {
  const response = await api.get(`/auto-trade/telegram/group/stats/${chatId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

// ==================== 监控管理 API ====================

/**
 * 启动/停止 Telegram 监控
 */
export const toggleMonitoring = async (
  enabled: boolean,
  accessToken: string
): Promise<{
  success: boolean;
  enabled: boolean;
  status: TelegramMonitorStatus;
}> => {
  const response = await api.post(
    '/auto-trade/telegram/monitor/toggle',
    { enabled },
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  return response.data;
};

/**
 * 获取 Telegram 监控状态
 */
export const getMonitorStatus = async (
  accessToken: string
): Promise<TelegramMonitorStatus> => {
  const response = await api.get('/auto-trade/telegram/monitor/status', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
};

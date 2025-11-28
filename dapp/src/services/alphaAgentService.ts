import axios from 'axios';

// 动态根据当前域名设置API地址，与 api.ts 保持一致
const host = window.location.host;
let API_BASE_URL = '';
if (host.includes('testai.gameland.network')) {
  API_BASE_URL = 'https://testaiservice.gameland.network/api';
} else if (host.includes('localhost')) {
  API_BASE_URL = 'http://localhost:8080/api';
} else {
  API_BASE_URL = 'https://galeon.gameland.network/api';
}

const api = axios.create({
  baseURL: `${API_BASE_URL}/agents/alpha`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// FLock Insight Interface
export interface FlockInsight {
  source: string;              // 'FLock RAG' or 'Local DB + DeepSeek'
  similarCasesCount: number;   // Number of similar cases found
  analysis: string;            // AI analysis text
  adjustmentReason: string;    // Reason label for adjustment
}

// Signal Preview Interface (for list browsing)
export interface AlphaSignalPreview {
  signalId: string;
  tokenSymbol: string;
  signalType: 'LONG' | 'SHORT' | 'NEUTRAL' | 'BUY' | 'SELL';
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  currentPrice: number;
  signalPrice?: number;
  priceChangePercent?: number;
  status: 'ACTIVE' | 'HIT_TP' | 'HIT_SL' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;

  // FLock enhancement fields
  originalConfidence?: number;
  confidenceAdjustment?: number;
  flockInsight?: FlockInsight | null;
}

// Full Signal Interface (for paid viewing)
export interface AlphaSignalFull extends AlphaSignalPreview {
  entryZone: {
    min: number;
    max: number;
  };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  analysis: {
    oiChange24h: number;
    fundingRate: number;
    trend: string;
    pattern: string;
    volume: string;
  };
  reasoning: string;
}

// Agent Stats Interface
export interface AgentStats {
  totalSignals: number;
  signalsToday: number;
  signalsThisWeek: number;
  totalAudited: number;
  totalTriggered: number;  // TP+SL总数（用于Win Rate计算）
  hitTP: number;
  hitSL: number;
  winRate: number;
  avgAccuracy: string;
  signalDistribution: {
    [key: string]: {
      count: number;
      avgConfidence: string;
    };
  };
  currentModelVersion: string;
  lastUpdated: string;
}

// Usage Info Interface
export interface UsageInfo {
  userId: string;
  freeUsageCount: number;
  totalPaidUsage: number;
  remainingFreeViews: number;
  isFreeUser: boolean;
  totalViews: number;
}

// View Signal Result Interface
export interface ViewSignalResult {
  success: boolean;
  charged: boolean;
  cost?: number;
  remainingFreeViews: number;
  signal: AlphaSignalFull;
}

export interface MonitorStatus {
  isRunning: boolean;
  nextRun: string | null;
  lastRun: string | null;
  totalScans: number;
  tokensMonitored: number;
  signalsGenerated: number;
  errors: number;
}

export interface TokenStats {
  totalSignals: number;
  signalsToday: number;
  signalsThisWeek: number;
  totalAudited: number;
  hitTPCount: number;
  hitSLCount: number;
  expiredCount: number;
  winRate: number;
  avgAccuracy: number;
  avgReturn: number;
  signalDistribution: {
    buy: number;
    sell: number;
    neutral: number;
  };
  bestReturn: number | null;
  worstReturn: number | null;
  bestSignalId: string | null;
  worstSignalId: string | null;
  lastSignalAt: string;
  lastUpdated: string;
}

export interface TokenLeaderboardEntry {
  rank: number;
  tokenSymbol: string;
  totalSignals: number;
  totalAudited: number;
  hitTPCount: number;
  hitSLCount: number;
  winRate: number;
  avgAccuracy: number;
  avgReturn: number;
  bestReturn?: number;
  worstReturn?: number;
  lastSignalAt: string;
}

export interface TokensOverview {
  totalTokens: number;
  totalSignals: number;
  totalAudited: number;
  totalHitTP: number;
  totalHitSL: number;
  avgWinRate: string;
  avgAccuracy: string;
  avgReturn: string;
}

export interface WatchlistToken {
  tokenSymbol: string;
  futuresSymbol: string;
  price: number;
  volume24h: number;
  lastAnalyzed: string;
  hasSignal: boolean;
  signal: {
    type: string;
    confidence: number;
  } | null;
}

class AlphaAgentService {
  /**
   * Get user's usage statistics
   */
  async getUsage(userId: string): Promise<UsageInfo> {
    try {
      const response = await api.get(`/usage/${userId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get usage');
    }
  }

  /**
   * View signal detail (with billing)
   * - First 5 views are free
   * - Then 8 credits per view
   */
  async viewSignalDetail(userId: string, signalId: string): Promise<ViewSignalResult> {
    try {
      const response = await api.post('/signals/view', { userId, signalId });
      return response.data;
    } catch (error: any) {
      // Re-throw to handle in component
      throw error;
    }
  }

  /**
   * Get signals list (free browsing, without details)
   */
  async getSignals(options: {
    limit?: number;
    offset?: number;
    signalType?: 'LONG' | 'SHORT' | 'NEUTRAL' | 'BUY' | 'SELL';
    minConfidence?: number;
    status?: 'ACTIVE' | 'HIT_TP' | 'HIT_SL' | 'EXPIRED';
    tokenSymbol?: string;
    sortBy?: 'time' | 'confidence';
  } = {}): Promise<{ signals: AlphaSignalPreview[]; total: number }> {
    try {
      const response = await api.get('/signals', { params: options });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get signals');
    }
  }

  /**
   * Get new signals (for polling)
   */
  async getNewSignals(userId: string, since?: string): Promise<AlphaSignalPreview[]> {
    try {
      const response = await api.get('/signals/new', {
        params: { userId, since },
      });
      return response.data.newSignals || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get new signals');
    }
  }

  /**
   * Get Alpha Agent statistics
   */
  async getStats(): Promise<AgentStats> {
    try {
      const response = await api.get('/stats');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get stats');
    }
  }

  /**
   * Get monitored tokens (watchlist)
   */
  async getWatchlist(): Promise<{ watchlist: WatchlistToken[]; count: number }> {
    try {
      const response = await api.get('/watchlist');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get watchlist');
    }
  }

  /**
   * Manually trigger monitor (for testing)
   */
  async triggerMonitor(): Promise<{ success: boolean; message: string; status: MonitorStatus }> {
    try {
      const response = await api.post('/monitor/trigger');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to trigger monitor');
    }
  }

  /**
   * Get monitor status
   */
  async getMonitorStatus(): Promise<{ success: boolean; status: MonitorStatus }> {
    try {
      const response = await api.get('/monitor/status');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get monitor status');
    }
  }

  /**
   * Get token learning stats
   */
  async getTokenStats(tokenSymbol: string): Promise<{ success: boolean; tokenSymbol: string; stats: TokenStats }> {
    try {
      const response = await api.get(`/tokens/${tokenSymbol}/stats`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get token stats');
    }
  }

  /**
   * Get token leaderboard
   */
  async getTokenLeaderboard(
    type: 'top' | 'bottom' = 'top',
    limit: number = 10
  ): Promise<{ success: boolean; type: string; count: number; leaderboard: TokenLeaderboardEntry[] }> {
    try {
      const response = await api.get('/tokens/leaderboard', {
        params: { type, limit },
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get token leaderboard');
    }
  }

  /**
   * Get tokens overview
   */
  async getTokensOverview(): Promise<{ success: boolean; overview: TokensOverview }> {
    try {
      const response = await api.get('/tokens/overview');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get tokens overview');
    }
  }

  /**
   * Refresh all token stats
   */
  async refreshAllTokenStats(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/tokens/stats/refresh');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to refresh token stats');
    }
  }

  /**
   * Run learning cycle
   */
  async runLearningCycle(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/learning/run');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to run learning cycle');
    }
  }

  /**
   * Get learning history
   */
  async getLearningHistory(limit: number = 10): Promise<{ success: boolean; history: any[] }> {
    try {
      const response = await api.get('/learning/history', {
        params: { limit },
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get learning history');
    }
  }

  /**
   * Get active configuration
   */
  async getActiveConfig(): Promise<{ success: boolean; config: any }> {
    try {
      const response = await api.get('/learning/config');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get active config');
    }
  }

  /**
   * Rollback learning
   */
  async rollbackLearning(learningRunId: string): Promise<{ success: boolean; message: string; result: any }> {
    try {
      const response = await api.post('/learning/rollback', { learningRunId });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to rollback learning');
    }
  }

  /**
   * Poll for new signals
   * Returns a function to stop polling
   */
  startPolling(
    userId: string,
    callback: (signals: AlphaSignalPreview[]) => void,
    interval: number = 30000 // 30 seconds
  ): () => void {
    let lastSignalId: string | undefined;
    let isPolling = true;

    const poll = async () => {
      if (!isPolling) return;

      try {
        const newSignals = await this.getNewSignals(userId, lastSignalId);
        if (newSignals.length > 0) {
          callback(newSignals);
          lastSignalId = newSignals[0].signalId;
        }
      } catch (error) {
        console.error('Polling error:', error);
      }

      if (isPolling) {
        setTimeout(poll, interval);
      }
    };

    poll();

    // Return stop function
    return () => {
      isPolling = false;
    };
  }

  // ==================== News Related APIs ====================

  /**
   * 获取新闻列表
   * @param params - 查询参数 { token, impact, limit, offset }
   */
  async getNews(params?: {
    token?: string;
    impact?: 'high' | 'medium' | 'low';
    limit?: number;
    offset?: number;
  }) {
    return api.get('/news', { params });
  }

  /**
   * 获取信号关联的新闻
   * @param signalId - 信号ID
   */
  async getSignalRelatedNews(signalId: string) {
    return api.get(`/signals/${signalId}/news`);
  }

  /**
   * 获取特定Token的最新新闻
   * @param symbol - Token符号
   * @param limit - 数量限制
   */
  async getTokenNews(symbol: string, limit = 5) {
    return api.get(`/tokens/${symbol}/news`, {
      params: { limit }
    });
  }

  /**
   * 获取热门新闻（高影响力）
   * @param limit - 数量限制
   */
  async getHotNews(limit = 10) {
    return api.get('/news/hot', {
      params: { limit }
    });
  }
}

export const alphaAgentService = new AlphaAgentService();

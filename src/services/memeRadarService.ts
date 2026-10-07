import axios from 'axios';
import {
  MemeRadarSignalPreview,
  MemeRadarSignalFull,
  MemeRadarStats,
  MemeRadarUsageInfo,
  MemeRadarChain,
  MemeRadarSignalLevel,
} from '../types/memeRadarSignal';

// 动态根据当前域名设置API地址
const host = window.location.host;
let API_BASE_URL = '';
if (host.includes('testai.galeon.world')) {
  API_BASE_URL = 'https://testaiservice.galeon.world/api';
} else if (host.includes('testai.gameland.network')) {
  API_BASE_URL = 'https://testaiservice.gameland.network/api';
} else if (host.includes('localhost')) {
  API_BASE_URL = 'http://localhost:8080/api';
} else if (host.includes('galeon.world')) {
  API_BASE_URL = 'https://galeon.world/api';
} else {
  API_BASE_URL = 'https://galeon.gameland.network/api';
}

const api = axios.create({
  baseURL: `${API_BASE_URL}/meme-radar`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

class MemeRadarService {
  /**
   * Get signals list (free browsing)
   */
  async getSignals(options: {
    limit?: number;
    offset?: number;
    chain?: MemeRadarChain;
    signalLevel?: MemeRadarSignalLevel;
    status?: 'ACTIVE' | 'WIN' | 'LOSS' | 'EXPIRED' | 'all';
    tokenSymbol?: string;
    sortBy?: 'time' | 'radarScore' | 'smartMoney' | 'volume';
  } = {}): Promise<{ signals: MemeRadarSignalPreview[]; total: number }> {
    try {
      const response = await api.get('/signals', { params: options });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get meme radar signals');
    }
  }

  /**
   * View signal detail (with billing)
   */
  async viewSignalDetail(userId: string, signalId: string): Promise<{
    success: boolean;
    charged: boolean;
    cost?: number;
    remainingFreeViews: number;
    signal: MemeRadarSignalFull;
  }> {
    try {
      const response = await api.post('/signals/view', { userId, signalId });
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Get Meme Radar stats
   */
  async getStats(): Promise<MemeRadarStats> {
    try {
      const response = await api.get('/stats');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get meme radar stats');
    }
  }

  /**
   * Get user usage info
   */
  async getUsage(userId: string): Promise<MemeRadarUsageInfo> {
    try {
      const response = await api.get(`/usage/${userId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get usage');
    }
  }

  /**
   * Poll for new signals
   */
  async getNewSignals(since?: string): Promise<MemeRadarSignalPreview[]> {
    try {
      const response = await api.get('/signals/new', { params: { since } });
      return response.data.newSignals || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get new signals');
    }
  }
}

export const memeRadarService = new MemeRadarService();

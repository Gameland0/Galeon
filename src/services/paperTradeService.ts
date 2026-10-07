import { api } from './api';
import {
  PaperTradeOverview,
  PaperTradePosition,
  PaperTradeHistoryResponse,
  CapitalHistoryItem,
  LearningStats,
  PaperTradeStrategy,
} from '../types/paperTrade';

const BASE = '/paper-trade';

export const paperTradeService = {
  async getOverview(strategy: PaperTradeStrategy = 'stable'): Promise<PaperTradeOverview> {
    const res = await api.get(`${BASE}/overview`, { params: { strategy } });
    return res.data.data;
  },

  async getPositions(strategy: PaperTradeStrategy = 'stable'): Promise<PaperTradePosition[]> {
    const res = await api.get(`${BASE}/positions`, { params: { strategy } });
    return res.data.data;
  },

  async getHistory(page = 1, pageSize = 20, filter?: { symbol?: string; direction?: string; profitable?: boolean }, strategy: PaperTradeStrategy = 'stable'): Promise<PaperTradeHistoryResponse> {
    const params: any = { page, pageSize, strategy };
    if (filter?.symbol) params.symbol = filter.symbol;
    if (filter?.direction) params.direction = filter.direction;
    if (filter?.profitable !== undefined) params.profitable = String(filter.profitable);
    const res = await api.get(`${BASE}/history`, { params });
    return res.data.data;
  },

  async getCapitalHistory(strategy: PaperTradeStrategy = 'stable'): Promise<CapitalHistoryItem[]> {
    const res = await api.get(`${BASE}/capital-history`, { params: { strategy } });
    return res.data.data;
  },

  async getLearning(strategy: PaperTradeStrategy = 'stable'): Promise<LearningStats> {
    const res = await api.get(`${BASE}/learning`, { params: { strategy } });
    return res.data.data;
  },
};

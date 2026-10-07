/**
 * Signal Monitor API
 */

import { api } from './api';

export interface SignalTrade {
  entry_price: number | null;
  entry_amount: number | null;
  exit_price: number | null;
  pnl_usdt: number | null;
  pnl_percent: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  error_message: string | null;
}

export interface Signal {
  signal_id: string;
  source: 'telegram' | 'twitter' | 'meme_radar' | 'alpha';
  source_name: string;
  source_url: string | null;
  tokens: string[];
  token_symbol: string;
  signal_type: string;
  message: string;
  chain: string | null;
  contract_address: string | null;
  market_cap: number | null;
  liquidity: number | null;
  ai_score: number | null;
  claude_suggestion: string | null;
  claude_skip_reason: string | null;
  claude_analysis: string | null;
  extraction_source: string;
  status: 'holding' | 'exited' | 'pending' | 'skipped';
  trade: SignalTrade | null;
  created_at: string;
  price_change_30m: number | null;
  price_change_1h: number | null;
}

export interface SignalStats {
  total: number;
  holding: number;
  exited: number;
  pending: number;
  skipped: number;
}

export interface TopGain {
  token: string;
  gain_percent: number;
  time: string;
}

export interface TopSignal {
  token: string;
  gain: number;
  time: string;
}

export interface SignalFeedResponse {
  success: boolean;
  stats: SignalStats;
  topGains: TopGain[];
  topSignals: TopSignal[];
  signals: Signal[];
  hasMore: boolean;
}

export async function getSignalFeed(
  accessToken: string,
  params: {
    source?: string;
    status?: string;
    chain?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<SignalFeedResponse> {
  const response = await api.get('/auto-trade/signals/monitor', {
    params,
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.data;
}

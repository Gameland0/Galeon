// Meme Radar 10-Dimension Scores
export interface MemeRadarDimensionScores {
  signalResonance: number;      // 信号共振 (0-100)
  smartMoney: number;           // 聪明钱流入 (0-100)
  whaleKol: number;             // 鲸鱼/KOL活动 (0-100)
  smartMoneyQuality: number;    // 聪明钱质量 (0-100)
  volumeMomentum: number;       // 成交量动量 (0-100)
  priceTrend: number;           // 价格趋势 (0-100)
  devSafety: number;            // 开发者安全 (0-100)
  liquidity: number;            // 流动性深度 (0-100)
  social: number;               // 社交热度 (0-100)
  topTraderConfidence: number;  // 顶级交易员信心 (0-100)
}

// Signal Level
export type MemeRadarSignalLevel = 'WATCH' | 'BUY' | 'STRONG_BUY' | 'VETO';

// Chain types supported
export type MemeRadarChain = 'SOL' | 'BSC' | 'ETH' | 'BASE';

// Signal Preview (for list view - free browsing)
export interface MemeRadarSignalPreview {
  signalId: string;
  tokenSymbol: string;
  tokenName: string;
  chain: MemeRadarChain;
  contractAddress: string;
  signalLevel: MemeRadarSignalLevel;
  radarScore: number;           // 综合评分 (0-100)
  currentPrice: number;
  priceChange1h: number;        // 1h涨跌幅 %
  priceChange24h: number;       // 24h涨跌幅 %
  marketCap: number;
  volume24h: number;
  liquidity: number;
  smartMoneyCount: number;      // 聪明钱持有人数
  whaleCount: number;           // 鲸鱼数量
  kolCount: number;             // KOL数量
  topTraderCount: number;       // 顶级交易员数量
  dimensionScores: MemeRadarDimensionScores;
  status: 'ACTIVE' | 'WIN' | 'LOSS' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
}

// Full Signal (for paid detail view)
export interface MemeRadarSignalFull extends MemeRadarSignalPreview {
  // On-Chain Data (from OKX API + GMGN)
  onChainData: {
    buyVolume24h: number;
    sellVolume24h: number;
    buyTxCount24h: number;
    sellTxCount24h: number;
    uniqueBuyers24h: number;
    uniqueSellers24h: number;
    netFlow24h: number;
    holderCount: number;
    top10HolderPercent: number;
    lpLocked: boolean;
    lpLockedPercent: number;
    volume1H?: number;           // 1h volume for momentum calc
    // GMGN Risk Data
    gmgnRugRatio?: number;         // Rug probability 0-1
    gmgnIsHoneypot?: boolean;      // Cannot sell
    gmgnIsWashTrading?: boolean;   // Fake volume detected
    gmgnInsiderRate?: number;      // Suspected insider hold %
    gmgnRatRate?: number;          // Copycat bot trader %
    gmgnBundlerRate?: number;      // Bundle buy bot %
    gmgnEntrapmentRatio?: number;  // Buyer trap ratio
  };

  // Smart Money Detail
  smartMoneyDetail: {
    totalHolders: number;
    recentBuyers: number;
    recentSellers: number;
    avgEntryPrice: number;
    avgHoldingPeriod: string;    // e.g. "2.5 days"
    profitablePercent: number;   // 盈利占比
  };

  // Dev Safety
  devSafetyDetail: {
    isRenounced: boolean;
    isMintable: boolean;
    hasProxy: boolean;
    top1HolderPercent?: number;
    top10HoldPercent?: number;
    devHolderPercent: number;
    honeypotRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    auditScore: number;         // 0-100
    riskLevel?: number;
    holders?: number;
  };

  // Signal Reasoning
  reasoning: string;

  // Trading Plan (if STRONG_BUY)
  tradingPlan?: {
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
    riskRewardRatio: number;
  };

  // Signal Outcome (backtest result after 4h)
  outcome?: {
    result: 'WIN' | 'LOSS' | 'EXPIRED' | 'PENDING';
    entryPrice: number;
    exitPrice: number;
    pnlPct?: number;         // backend field
    profitPercent?: number;  // legacy alias
    evaluatedAt?: string;    // backend field
    checkedAt?: string;      // legacy alias
  };

  // Dimension weights used
  dimensionWeights: MemeRadarDimensionScores;
}

// Stats for Meme Radar dashboard
export interface MemeRadarStats {
  totalSignals: number;
  signalsToday: number;
  signalsThisWeek: number;
  totalBacktested: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgRadarScore: number;
  strongBuyCount: number;
  watchCount: number;
  vetoCount: number;
  chainDistribution: {
    [chain: string]: number;
  };
  lastUpdated: string;
}

// Usage Info (can share with Alpha Signal billing)
export interface MemeRadarUsageInfo {
  remainingFreeViews: number;
  isFreeUser: boolean;
  totalViews: number;
}

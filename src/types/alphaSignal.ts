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

  // Token历史胜率（用于Win Rate排序）
  tokenWinRate?: number;

  // Smart Money 简要数据 (用于列表标签显示)
  smartMoneyDirection?: 'buy' | 'sell' | null;
  smartMoneyHolders?: number | null;
}

// Smart Money 数据接口
export interface SmartMoneyData {
  smartMoneyHolders: number | null;
  smartMoneyDirection: 'buy' | 'sell' | null;
  holderDistribution: {
    kol: number;
    pro: number;
    smartMoney: number;
    bundler: number;
    newWallet: number;
  } | null;
  auditBlacklist: boolean | null;
  smartMoneyBoost: number | null;
}

// dimensionScores 中的 Smart Money 维度
export interface SmartMoneyDimension {
  score: number;
  signal: string;
  smartMoneyCount: number;
  proCount: number;
  bnTraders: number;
  hasActiveSignal: boolean;
  description: string;
}

export interface HolderDistributionDimension {
  score: number;
  risk: string;
  signal: string;
  kolPercent: number;
  proPercent: number;
  smartMoneyPercent: number;
  bundlerPercent: number;
  newWalletPercent: number;
  holdersChange24h: number;
  description: string;
}

export interface SmartMoneyMomentumDimension {
  score: number;
  signal: string;
  description: string;
}

// 🆕 v3.1: Social Hype 维度
export interface SocialHypeDimension {
  score: number;
  signal: string;
  socialHype: number;
  hypeChange24h: number;
  description: string;
}

export interface SocialSentimentDimension {
  score: number;
  signal: string;
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  description: string;
}

export interface SocialPriceCorrelationDimension {
  score: number;
  signal: string;
  description: string;
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

  // Binance Alpha exchange link fields
  contractAddress?: string;
  chain?: string;  // 'bsc' | 'eth' | 'solana' etc.

  // Smart Money 数据 (v2.2 Sintral/Binance Agent Skills)
  smartMoneyData?: SmartMoneyData;
}

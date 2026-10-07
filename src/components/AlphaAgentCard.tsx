import React, { useState, useEffect } from 'react';
import { alphaAgentService } from '../services/alphaAgentService';
import '../styles/AlphaAgentCard.css';

interface AgentStats {
  totalSignals: number;
  signalsToday: number;
  signalsThisWeek: number;
  totalAudited: number;
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

interface UsageInfo {
  freeUsageCount: number;
  totalPaidUsage: number;
  remainingFreeViews: number;
  isFreeUser: boolean;
  totalViews: number;
}

interface AlphaAgentCardProps {
  account: string;
}

const AlphaAgentCard: React.FC<AlphaAgentCardProps> = ({ account }) => {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (account) {
      fetchStats();
      fetchUsage();
    }
  }, [account]);

  const fetchStats = async () => {
    try {
      const data = await alphaAgentService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching Alpha Agent stats:', error);
    }
  };

  const fetchUsage = async () => {
    if (!account) return; // 如果没有 account，不调用 API

    try {
      const data = await alphaAgentService.getUsage(account);
      setUsage(data);
    } catch (error) {
      console.error('Error fetching usage:', error);
    }
  };

  return (
    <div className="alpha-agent-card">
      {/* Header */}
      <div className="agent-header">
        <div className="agent-icon">
          <span className="icon">🤖</span>
        </div>
        <div className="agent-info">
          <h3 className="agent-name">Alpha Auto Agent</h3>
          <p className="agent-tagline">24/7 Crypto Trading Signals</p>
          <div className="agent-badges">
            <span className="badge official">Official</span>
            <span className="badge verified">Verified</span>
            <span className="badge auto">Auto</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="agent-description">
        <p>
          AI-powered trading signal generator for Binance Alpha tokens.
          Uses 7-dimensional analysis including OI, Funding Rate, K-line patterns,
          and technical indicators to provide high-confidence trading signals.
        </p>
      </div>

      {/* Features */}
      <div className="agent-features">
        <h4 className="features-title">Key Features</h4>
        <ul className="features-list">
          <li>
            <span className="feature-icon">📊</span>
            <span>7-Dimensional Analysis Engine</span>
          </li>
          <li>
            <span className="feature-icon">🎯</span>
            <span>Confidence Score ≥70%</span>
          </li>
          <li>
            <span className="feature-icon">⏰</span>
            <span>Hourly Market Scanning</span>
          </li>
          <li>
            <span className="feature-icon">💰</span>
            <span>Entry, Stop-Loss & Take-Profit</span>
          </li>
          <li>
            <span className="feature-icon">🔄</span>
            <span>Auto-Learning System</span>
          </li>
        </ul>
      </div>

      {/* Usage & Pricing Info - removed (signals are now free) */}
    </div>
  );
};

export default AlphaAgentCard;

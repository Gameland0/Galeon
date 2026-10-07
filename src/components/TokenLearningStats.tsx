import React, { useEffect, useState } from 'react';
import { alphaAgentService, TokenStats } from '../services/alphaAgentService';
import './TokenLearningStats.css';

interface TokenLearningStatsProps {
  tokenSymbol: string;
  compact?: boolean; // Compact mode for signal cards
}

const TokenLearningStats: React.FC<TokenLearningStatsProps> = ({ tokenSymbol, compact = false }) => {
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, [tokenSymbol]);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await alphaAgentService.getTokenStats(tokenSymbol);
      setStats(response.stats);
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to load token stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`token-stats ${compact ? 'compact' : ''}`}>
        <div className="loading">Loading stats...</div>
      </div>
    );
  }

  // If no stats or error, show nothing in compact mode (cleaner UI)
  if ((error || !stats || stats.totalAudited === 0) && compact) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        fontSize: '11px',
        color: '#8B949E',
        fontWeight: '500'
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span>Win Rate: --</span>
          <span>Audited: 0</span>
          <span>Accuracy: --</span>
        </div>
      </div>
    );
  }

  // If no stats or error in full mode
  if (error || !stats) {
    return (
      <div className={`token-stats ${compact ? 'compact' : ''}`}>
        <div className="error">No stats available</div>
      </div>
    );
  }

  // Compact mode for signal cards (badge display)
  if (compact) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        fontSize: '11px',
        fontWeight: '600'
      }}>
        {/* Win Rate */}
        <div>
          <span style={{ color: '#8B949E' }}>Win Rate: </span>
          <span style={{
            color: stats.winRate >= 60 ? '#00C797' : stats.winRate >= 40 ? '#F8D264' : '#F05454'
          }}>
            {stats.winRate.toFixed(1)}%
          </span>
        </div>

        {/* Total Audited */}
        <div>
          <span style={{ color: '#8B949E' }}>Audited: </span>
          <span style={{ color: '#5A6AE6' }}>
            {stats.totalAudited}
          </span>
        </div>

        {/* Average Accuracy */}
        <div>
          <span style={{ color: '#8B949E' }}>Acc: </span>
          <span style={{
            color: stats.avgAccuracy >= 70 ? '#00C797' : stats.avgAccuracy >= 50 ? '#F8D264' : '#F05454'
          }}>
            {stats.avgAccuracy.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  }

  // Full display mode
  const totalSignalTypes = stats.signalDistribution.buy + stats.signalDistribution.sell + stats.signalDistribution.neutral;

  return (
    <div className="token-stats-full">
      <div className="stats-header">
        <h3>Learning Statistics for {tokenSymbol}</h3>
        <span className="last-updated">Updated: {new Date(stats.lastUpdated).toLocaleString()}</span>
      </div>

      <div className="stats-grid">
        {/* Signal Generation Stats */}
        <div className="stat-card">
          <div className="stat-title">Signal Generation</div>
          <div className="stat-row">
            <span className="stat-label">Total Signals:</span>
            <span className="stat-value highlight">{stats.totalSignals}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Today:</span>
            <span className="stat-value">{stats.signalsToday}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">This Week:</span>
            <span className="stat-value">{stats.signalsThisWeek}</span>
          </div>
        </div>

        {/* Audit Results */}
        <div className="stat-card">
          <div className="stat-title">Audit Results</div>
          <div className="stat-row">
            <span className="stat-label">Total Audited:</span>
            <span className="stat-value highlight">{stats.totalAudited}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Hit TP:</span>
            <span className="stat-value success">{stats.hitTPCount}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Hit SL:</span>
            <span className="stat-value danger">{stats.hitSLCount}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Expired:</span>
            <span className="stat-value neutral">{stats.expiredCount}</span>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="stat-card">
          <div className="stat-title">Performance</div>
          <div className="stat-row">
            <span className="stat-label">Win Rate:</span>
            <span className={`stat-value ${stats.winRate >= 60 ? 'success' : stats.winRate >= 40 ? 'warning' : 'danger'}`}>
              {stats.winRate.toFixed(2)}%
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Avg Accuracy:</span>
            <span className={`stat-value ${stats.avgAccuracy >= 70 ? 'success' : stats.avgAccuracy >= 50 ? 'warning' : 'danger'}`}>
              {stats.avgAccuracy.toFixed(2)}%
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Avg Return:</span>
            <span className={`stat-value ${stats.avgReturn > 0 ? 'success' : stats.avgReturn < 0 ? 'danger' : 'neutral'}`}>
              {stats.avgReturn > 0 ? '+' : ''}{stats.avgReturn.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Signal Distribution */}
        <div className="stat-card">
          <div className="stat-title">Signal Distribution</div>
          <div className="stat-row">
            <span className="stat-label">BUY Signals:</span>
            <span className="stat-value">
              {stats.signalDistribution.buy} ({totalSignalTypes > 0 ? ((stats.signalDistribution.buy / totalSignalTypes) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">SELL Signals:</span>
            <span className="stat-value">
              {stats.signalDistribution.sell} ({totalSignalTypes > 0 ? ((stats.signalDistribution.sell / totalSignalTypes) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">NEUTRAL Signals:</span>
            <span className="stat-value">
              {stats.signalDistribution.neutral} ({totalSignalTypes > 0 ? ((stats.signalDistribution.neutral / totalSignalTypes) * 100).toFixed(1) : 0}%)
            </span>
          </div>
        </div>

        {/* Best/Worst Records */}
        {(stats.bestReturn !== null || stats.worstReturn !== null) && (
          <div className="stat-card">
            <div className="stat-title">Records</div>
            {stats.bestReturn !== null && (
              <div className="stat-row">
                <span className="stat-label">Best Return:</span>
                <span className="stat-value success">
                  +{stats.bestReturn.toFixed(2)}%
                  {stats.bestSignalId && <span className="signal-id"> ({stats.bestSignalId})</span>}
                </span>
              </div>
            )}
            {stats.worstReturn !== null && (
              <div className="stat-row">
                <span className="stat-label">Worst Return:</span>
                <span className="stat-value danger">
                  {stats.worstReturn.toFixed(2)}%
                  {stats.worstSignalId && <span className="signal-id"> ({stats.worstSignalId})</span>}
                </span>
              </div>
            )}
            {stats.lastSignalAt && (
              <div className="stat-row">
                <span className="stat-label">Last Signal:</span>
                <span className="stat-value">{new Date(stats.lastSignalAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenLearningStats;

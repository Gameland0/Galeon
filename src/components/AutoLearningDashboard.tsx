import React, { useEffect, useState } from 'react';
import { alphaAgentService } from '../services/alphaAgentService';
import './AutoLearningDashboard.css';

interface WeightsConfig {
  name: string;
  version: string;
  oiFunding: number;
  trend: number;
  pattern: number;
  volume: number;
  keyLevels: number;
  rsi: number;
  macd: number;
  performance: {
    totalSignals: number;
    winRate: number;
    avgReturn: number;
  };
  activatedAt: string;
}

interface ThresholdsConfig {
  name: string;
  version: string;
  minConfidence: number;
  minOiChange: number;
  minFundingRate: number;
}

interface LearningHistoryEntry {
  learningRunId: string;
  previousConfig: { name: string; version: string };
  newConfig: { name: string; version: string };
  signalsAnalyzed: number;
  timePeriodDays: number;
  previousWinRate: number;
  newWinRate: number;
  previousAvgReturn: number;
  newAvgReturn: number;
  weightChanges: any;
  algorithm: string;
  learningRate: number;
  improvementPercentage: number;
  triggeredBy: string;
  status: string;
  notes: string;
  createdAt: string;
}

const AutoLearningDashboard: React.FC = () => {
  const [weightsConfig, setWeightsConfig] = useState<WeightsConfig | null>(null);
  const [thresholdsConfig, setThresholdsConfig] = useState<ThresholdsConfig | null>(null);
  const [learningHistory, setLearningHistory] = useState<LearningHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [learningInProgress, setLearningInProgress] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load current config
      const configResponse = await alphaAgentService.getActiveConfig();
      if (configResponse.success) {
        setWeightsConfig(configResponse.config.weights);
        setThresholdsConfig(configResponse.config.thresholds);
      }

      // Load learning history
      const historyResponse = await alphaAgentService.getLearningHistory(5);
      if (historyResponse.success) {
        setLearningHistory(historyResponse.history);
      }
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRunLearning = async () => {
    if (!confirm('Run learning cycle? This will analyze recent signals and adjust weights based on performance.')) {
      return;
    }

    try {
      setLearningInProgress(true);
      await alphaAgentService.runLearningCycle();
      alert('Learning cycle started! Check back in a few minutes for results.');

      // Reload data after a delay
      setTimeout(() => {
        loadData();
        setLearningInProgress(false);
      }, 5000);
    } catch (error: any) {
      alert(`Failed to run learning: ${error.message}`);
      setLearningInProgress(false);
    }
  };

  const handleRollback = async (learningRunId: string) => {
    if (!confirm('Rollback to previous configuration? This will revert the weight changes from this learning run.')) {
      return;
    }

    try {
      await alphaAgentService.rollbackLearning(learningRunId);
      alert('Successfully rolled back to previous configuration!');
      loadData();
    } catch (error: any) {
      alert(`Failed to rollback: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="auto-learning-dashboard">
        <div className="loading">Loading Auto-Learning Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="auto-learning-dashboard">
      <div className="dashboard-header">
        <h2>Auto-Learning System</h2>
        <button
          className="run-learning-btn"
          onClick={handleRunLearning}
          disabled={learningInProgress}
        >
          {learningInProgress ? 'Learning...' : 'Run Learning Cycle'}
        </button>
      </div>

      {/* Current Configuration */}
      {weightsConfig && (
        <div className="config-section">
          <h3>Current Active Configuration</h3>
          <div className="config-grid">
            {/* Weights */}
            <div className="config-card">
              <div className="config-card-header">
                <h4>Analysis Weights</h4>
                <span className="version-badge">{weightsConfig.version}</span>
              </div>
              <div className="weights-visualization">
                <div className="weight-bar">
                  <span className="weight-label">OI + Funding</span>
                  <div className="bar-container">
                    <div className="bar-fill" style={{ width: `${weightsConfig.oiFunding * 100}%` }} />
                    <span className="bar-value">{(weightsConfig.oiFunding * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="weight-bar">
                  <span className="weight-label">Trend</span>
                  <div className="bar-container">
                    <div className="bar-fill" style={{ width: `${weightsConfig.trend * 100}%` }} />
                    <span className="bar-value">{(weightsConfig.trend * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="weight-bar">
                  <span className="weight-label">K-line Pattern</span>
                  <div className="bar-container">
                    <div className="bar-fill" style={{ width: `${weightsConfig.pattern * 100}%` }} />
                    <span className="bar-value">{(weightsConfig.pattern * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="weight-bar">
                  <span className="weight-label">Volume</span>
                  <div className="bar-container">
                    <div className="bar-fill" style={{ width: `${weightsConfig.volume * 100}%` }} />
                    <span className="bar-value">{(weightsConfig.volume * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="weight-bar">
                  <span className="weight-label">Key Levels</span>
                  <div className="bar-container">
                    <div className="bar-fill" style={{ width: `${weightsConfig.keyLevels * 100}%` }} />
                    <span className="bar-value">{(weightsConfig.keyLevels * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="weight-bar">
                  <span className="weight-label">RSI</span>
                  <div className="bar-container">
                    <div className="bar-fill" style={{ width: `${weightsConfig.rsi * 100}%` }} />
                    <span className="bar-value">{(weightsConfig.rsi * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="weight-bar">
                  <span className="weight-label">MACD</span>
                  <div className="bar-container">
                    <div className="bar-fill" style={{ width: `${weightsConfig.macd * 100}%` }} />
                    <span className="bar-value">{(weightsConfig.macd * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="config-performance">
                <div className="perf-stat">
                  <span className="perf-label">Total Signals:</span>
                  <span className="perf-value">{weightsConfig.performance.totalSignals}</span>
                </div>
                <div className="perf-stat">
                  <span className="perf-label">Win Rate:</span>
                  <span className={`perf-value ${weightsConfig.performance.winRate >= 60 ? 'good' : weightsConfig.performance.winRate >= 40 ? 'neutral' : 'bad'}`}>
                    {weightsConfig.performance.winRate.toFixed(2)}%
                  </span>
                </div>
                <div className="perf-stat">
                  <span className="perf-label">Avg Return:</span>
                  <span className={`perf-value ${weightsConfig.performance.avgReturn > 0 ? 'good' : 'bad'}`}>
                    {weightsConfig.performance.avgReturn > 0 ? '+' : ''}{weightsConfig.performance.avgReturn.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="config-activated">
                Activated: {new Date(weightsConfig.activatedAt).toLocaleString()}
              </div>
            </div>

            {/* Thresholds */}
            {thresholdsConfig && (
              <div className="config-card">
                <div className="config-card-header">
                  <h4>Thresholds</h4>
                  <span className="version-badge">{thresholdsConfig.version}</span>
                </div>
                <div className="threshold-list">
                  <div className="threshold-item">
                    <span className="threshold-label">Min Confidence:</span>
                    <span className="threshold-value">{thresholdsConfig.minConfidence}%</span>
                  </div>
                  <div className="threshold-item">
                    <span className="threshold-label">Min OI Change:</span>
                    <span className="threshold-value">{thresholdsConfig.minOiChange}%</span>
                  </div>
                  <div className="threshold-item">
                    <span className="threshold-label">Min Funding Rate:</span>
                    <span className="threshold-value">{thresholdsConfig.minFundingRate}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Learning History */}
      {learningHistory.length > 0 && (
        <div className="history-section">
          <h3>Learning History</h3>
          <div className="history-list">
            {learningHistory.map((entry) => (
              <div key={entry.learningRunId} className={`history-entry ${entry.status.toLowerCase()}`}>
                <div className="history-header">
                  <div className="history-versions">
                    <span className="version-change">
                      {entry.previousConfig.version} → {entry.newConfig.version}
                    </span>
                    <span className={`status-badge ${entry.status.toLowerCase()}`}>
                      {entry.status}
                    </span>
                  </div>
                  <span className="history-date">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>

                <div className="history-metrics">
                  <div className="metric">
                    <span className="metric-label">Signals Analyzed:</span>
                    <span className="metric-value">{entry.signalsAnalyzed}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Time Period:</span>
                    <span className="metric-value">{entry.timePeriodDays} days</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Algorithm:</span>
                    <span className="metric-value">{entry.algorithm}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Learning Rate:</span>
                    <span className="metric-value">{entry.learningRate}</span>
                  </div>
                </div>

                <div className="history-performance">
                  <div className="perf-change">
                    <span>Win Rate:</span>
                    <span className={entry.newWinRate >= entry.previousWinRate ? 'improved' : 'declined'}>
                      {entry.previousWinRate.toFixed(2)}% → {entry.newWinRate.toFixed(2)}%
                    </span>
                  </div>
                  <div className="perf-change">
                    <span>Avg Return:</span>
                    <span className={entry.newAvgReturn >= entry.previousAvgReturn ? 'improved' : 'declined'}>
                      {entry.previousAvgReturn.toFixed(2)}% → {entry.newAvgReturn.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {entry.status === 'SUCCESS' && (
                  <button
                    className="rollback-btn"
                    onClick={() => handleRollback(entry.learningRunId)}
                  >
                    Rollback
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoLearningDashboard;

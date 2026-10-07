import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NewsItem } from './TokenNewsFeed';

interface NewsCardProps {
  news: NewsItem;
  compact?: boolean;
  onViewSignal?: (token: string) => void;
}

const NewsCard: React.FC<NewsCardProps> = ({ news, compact = false, onViewSignal }) => {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const getImpactColor = (score: number) => {
    if (score >= 80) return '#ff4757'; // 红色-高影响
    if (score >= 60) return '#ffa502'; // 橙色-中影响
    return '#2ed573'; // 绿色-低影响
  };

  const getHeatEmoji = (heat: string) => {
    switch (heat) {
      case 'high':
        return '🔥';
      case 'medium':
        return '📊';
      case 'low':
        return '💤';
      default:
        return '📰';
    }
  };

  const getSentimentEmoji = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return '📈 Positive';
      case 'negative':
        return '📉 Negative';
      case 'neutral':
        return '➖ Neutral';
      default:
        return '❓ Unknown';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) {
      return `${diffMins} minutes ago`;
    } else if (diffMins < 1440) {
      return `${Math.floor(diffMins / 60)} hours ago`;
    } else {
      return `${Math.floor(diffMins / 1440)} days ago`;
    }
  };

  const getSourceLabel = (source: string) => {
    const labels: { [key: string]: string } = {
      binance_alpha: 'Binance Alpha',
      binance_futures: 'Binance Futures',
      binance: 'Binance',
      bitget: 'Bitget',
      other: 'News'
    };
    return labels[source] || source;
  };

  const handleViewSignal = () => {
    if (news.tokens.length > 0) {
      const token = news.tokens[0];
      if (onViewSignal) {
        onViewSignal(token);
      } else {
        // 跳转到Alpha Agent页面并筛选该token
        navigate(`/alpha-agent?token=${token}`);
      }
    }
  };

  return (
    <div
      className={`news-card ${compact ? 'compact' : ''}`}
      style={{
        borderLeft: `4px solid ${getImpactColor(news.impactScore)}`
      }}
    >
      <div className="news-card-header">
        <div className="news-tokens">
          {news.tokens.map(token => (
            <span key={token} className="token-badge">
              {token}
            </span>
          ))}
        </div>
        <div className="news-meta">
          <span className="news-source">{getSourceLabel(news.source)}</span>
          <span className="news-time">{formatTimeAgo(news.publishedAt)}</span>
        </div>
      </div>

      <div className="news-card-body">
        <h4>
          {getHeatEmoji(news.marketHeat)} {news.title}
        </h4>
        {news.titleCN && !compact && (
          <p className="news-title-cn">{news.titleCN}</p>
        )}

        <div className="news-metrics">
          <span
            className="metric impact-metric"
            style={{ color: getImpactColor(news.impactScore) }}
          >
            Impact: <strong>{news.impactScore}</strong>
          </span>
          <span className="metric">
            Heat: <strong>{news.marketHeat}</strong>
          </span>
          <span className="metric">
            {getSentimentEmoji(news.sentiment)}
          </span>
        </div>

        {/* 元数据 */}
        {!compact && news.metadata && (
          <div className="news-metadata">
            {news.metadata.contract && (
              <div className="metadata-item">
                <span className="metadata-label">Contract:</span>
                <span className="metadata-value contract-address">
                  {news.metadata.contract.substring(0, 10)}...
                  {news.metadata.contract.substring(news.metadata.contract.length - 8)}
                </span>
              </div>
            )}
            {news.metadata.chain && (
              <div className="metadata-item">
                <span className="metadata-label">Chain:</span>
                <span className="metadata-value">{news.metadata.chain}</span>
              </div>
            )}
            {news.metadata.marketcap && (
              <div className="metadata-item">
                <span className="metadata-label">Market Cap:</span>
                <span className="metadata-value">${news.metadata.marketcap}</span>
              </div>
            )}
          </div>
        )}

        {/* AI分析 */}
        {expanded && news.analysis && (
          <div className="news-analysis">
            <div className="ai-badge">🤖 AI Analysis</div>
            <p className="analysis-text">{news.analysis.analysisText}</p>

            {news.analysis.keyPoints && news.analysis.keyPoints.length > 0 && (
              <div className="key-points">
                <strong>Key Points:</strong>
                <ul>
                  {news.analysis.keyPoints.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}

            {news.analysis.recommendedAction && (
              <div className="recommended-action">
                <strong>Recommended:</strong> {news.analysis.recommendedAction}
              </div>
            )}

            {news.analysis.confidence && (
              <div className="analysis-confidence">
                AI Confidence: <strong>{(news.analysis.confidence * 100).toFixed(0)}%</strong>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="news-card-footer">
        {news.analysis && (
          <button
            className="btn-link"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '▲ Hide Details' : '▼ View AI Analysis'}
          </button>
        )}

        {news.hasRelatedSignal && (
          <button className="btn-signal" onClick={handleViewSignal}>
            View Related Signal →
          </button>
        )}

        <a
          href={news.telegramLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-link"
        >
          View on Telegram ↗
        </a>
      </div>
    </div>
  );
};

export default NewsCard;

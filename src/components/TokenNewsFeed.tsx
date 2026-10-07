import React, { useState, useEffect } from 'react';
import { alphaAgentService } from '../services/alphaAgentService';
import NewsCard from './NewsCard';
import '../styles/TokenNewsFeed.css';

export interface NewsItem {
  id: string;
  tokens: string[];
  title: string;
  titleCN: string;
  source: string;
  newsType: string;
  impactScore: number;
  marketHeat: 'high' | 'medium' | 'low';
  sentiment: 'positive' | 'negative' | 'neutral';
  publishedAt: string;
  telegramLink: string;
  hasRelatedSignal: boolean;
  metadata?: {
    contract?: string;
    chain?: string;
    marketcap?: string;
  };
  analysis?: {
    recommendedAction: string;
    keyPoints: string[];
    analysisText: string;
    confidence: number;
  };
}

interface TokenNewsFeedProps {
  limit?: number;
  tokenFilter?: string;
  showFilters?: boolean;
  autoRefresh?: boolean;
}

const TokenNewsFeed: React.FC<TokenNewsFeedProps> = ({
  limit = 10,
  tokenFilter,
  showFilters = true,
  autoRefresh = true
}) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNews();

    // 自动刷新（每60秒）
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchNews(true); // 静默刷新
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [tokenFilter, filter, limit]);

  const fetchNews = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const params: any = {
        limit,
        offset: 0
      };

      if (tokenFilter) {
        params.token = tokenFilter;
      }

      if (filter !== 'all') {
        params.impact = filter;
      }

      const response = await alphaAgentService.getNews(params);

      if (response.data.success) {
        setNews(response.data.data.news || []);
      }
    } catch (err: any) {
      console.error('获取新闻失败:', err);
      if (!silent) {
        setError(err.response?.data?.message || '获取新闻失败，请稍后重试');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const getFilterLabel = (filterType: string) => {
    switch (filterType) {
      case 'high':
        return '🔥 High Impact';
      case 'medium':
        return '📊 Medium Impact';
      case 'low':
        return '💤 Low Impact';
      default:
        return 'All News';
    }
  };

  return (
    <div className="token-news-feed">
      <div className="news-header">
        <h3>📰 Market News Feed</h3>
        {showFilters && (
          <div className="news-filters">
            <button
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              All News
            </button>
            <button
              className={filter === 'high' ? 'active' : ''}
              onClick={() => setFilter('high')}
            >
              🔥 High Impact
            </button>
            <button
              className={filter === 'medium' ? 'active' : ''}
              onClick={() => setFilter('medium')}
            >
              📊 Medium Impact
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="news-loading">
          <div className="spinner"></div>
          <p>Loading latest news...</p>
        </div>
      )}

      {error && (
        <div className="news-error">
          <p>{error}</p>
          <button onClick={() => fetchNews()}>Retry</button>
        </div>
      )}

      {!loading && !error && news.length === 0 && (
        <div className="news-empty">
          <p>📭 No news available at the moment</p>
          <p>Check back later for the latest crypto market updates</p>
        </div>
      )}

      {!loading && !error && news.length > 0 && (
        <div className="news-list">
          {news.map(item => (
            <NewsCard key={item.id} news={item} />
          ))}
        </div>
      )}

      {!loading && news.length > 0 && (
        <div className="news-footer">
          <p className="news-count">
            Showing {news.length} news items
            {tokenFilter && ` for ${tokenFilter}`}
          </p>
          <button
            className="btn-refresh"
            onClick={() => fetchNews()}
            disabled={loading}
          >
            🔄 Refresh
          </button>
        </div>
      )}
    </div>
  );
};

export default TokenNewsFeed;

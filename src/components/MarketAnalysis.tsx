import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Spin, Alert, Tag, Progress, Divider, Switch } from 'antd';
import { LineChartOutlined, RiseOutlined, FallOutlined, InfoCircleOutlined, GlobalOutlined } from '@ant-design/icons';
import { api } from '../services/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

// 国际化文本
const i18n = {
  en: {
    title: 'AI-Powered Market Analysis',
    inputPlaceholder: 'Enter token symbol (e.g. BTC, ETH, SOL)',
    startAnalysis: 'Start Analysis',
    analyzing: 'Analyzing market data, please wait...',
    analysisError: 'Analysis Error',
    priceOverview: 'Price Overview',
    currentPrice: 'Current Price',
    change24h: '24h Change',
    marketCap: 'Market Cap',
    volume24h: '24h Volume',
    marketCapRank: 'Market Cap Rank',
    description: 'Description',
    aiSummary: '🤖 AI Summary',
    keyMetrics: 'Key Metrics',
    trend: 'Trend',
    volatility: 'Volatility',
    riskLevel: 'Risk Level',
    sentimentScore: 'Sentiment Score',
    confidence: 'Analysis Confidence',
    marketSentiment: '😊 Market Sentiment',
    overallSentiment: 'Overall Sentiment',
    sentimentStrength: 'Sentiment Strength',
    newsOverview: 'News Overview',
    relatedNews: '📰 Related News',
    readMore: 'Read More →',
    moreNews: 'more news...',
    riskWarning: 'Investment Risk Warning',
    riskDescription: 'The above analysis is for reference only. Please make investment decisions based on multiple sources of information. The cryptocurrency market is highly risky, please invest cautiously.',
    positive: 'Positive',
    negative: 'Negative',
    neutral: 'Neutral',
    generalNews: '(General News)',
    relevantNews: '(Relevant News)',
    noAnalysisData: 'No Analysis Data',
    noAnalysisDescription: 'Unable to retrieve detailed analysis data for this token. Please try again later or try another token.'
  },
  zh: {
    title: 'AI驱动的市场分析',
    inputPlaceholder: '输入代币符号 (如 BTC, ETH, SOL)',
    startAnalysis: '开始分析',
    analyzing: '正在分析市场数据，请稍候...',
    analysisError: '分析错误',
    priceOverview: '价格概览',
    currentPrice: '当前价格',
    change24h: '24小时变化',
    marketCap: '市值',
    volume24h: '24小时成交量',
    marketCapRank: '市值排名',
    description: '项目描述',
    aiSummary: '🤖 AI智能总结',
    keyMetrics: '关键指标',
    trend: '趋势',
    volatility: '波动性',
    riskLevel: '风险等级',
    sentimentScore: '情绪分数',
    confidence: '分析置信度',
    marketSentiment: '😊 市场情绪',
    overallSentiment: '整体情绪',
    sentimentStrength: '情绪强度',
    newsOverview: '新闻概况',
    relatedNews: '📰 相关新闻',
    readMore: '查看原文 →',
    moreNews: '条新闻...',
    riskWarning: '投资风险提示',
    riskDescription: '以上分析仅供参考，请结合多方信息做出投资决策。加密货币市场存在高风险，请谨慎投资。',
    positive: '正面',
    negative: '负面',
    neutral: '中性',
    generalNews: '(通用新闻)',
    relevantNews: '(相关新闻)',
    noAnalysisData: '暂无分析数据',
    noAnalysisDescription: '无法获取该代币的详细分析数据，请稍后重试或尝试其他代币。'
  }
};

interface PriceData {
  current_price: number;
  price_change_percentage_24h: number;
  total_volume: number;
  market_cap: number;
  market_cap_rank?: number | null;
  description?: string;
  name?: string;
  image?: string;
  chartData?: {
    prices?: number[][];
    market_caps?: number[][];
    total_volumes?: number[][];
  };
}

interface KeyMetrics {
  trend: string;
  volatility: string;
  sentiment_score: number;
  risk_level: string;
}

interface AISummary {
  summary: string;
  keyMetrics: KeyMetrics;
  confidence: number;
}

interface NewsImpact {
  summary: string;
  prediction: {
    expected_impact: string;
    probability: number;
    timeframe: string;
  };
}

interface SentimentAnalysis {
  label: string;
  score: number;
}


interface MarketAnalysisData {
  token: string;
  timestamp: string;
  price_analysis: {
    data: PriceData;
  } | null;
  ai_summary: AISummary | null;
  news_impact: NewsImpact | null;
  news_analysis: {
    sentiment_analysis: SentimentAnalysis;
    news_summary?: string;
    news_data?: any[];
  } | null;
}

const MarketAnalysis: React.FC = () => {
  const [analysisData, setAnalysisData] = useState<MarketAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [language, setLanguage] = useState<'en' | 'zh'>('en'); // 默认英文
  
  // 获取当前语言的文本
  const t = i18n[language];

  const handleAnalysis = async () => {
    if (!token.trim()) {
      setError(language === 'zh' ? '请输入代币符号' : 'Please enter a token symbol');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`Starting analysis for token: ${token}`);
      
      const response = await api.get(`/market-analysis/analysis/${token.toLowerCase()}`);
      console.log('API response:', response.data);
      
      if (response.data.success) {
        setAnalysisData(response.data.data);
      } else {
        setError(response.data.error || '分析失败');
      }
    } catch (err: any) {
      console.error('Market analysis error:', err);
      setError(err.response?.data?.error || (language === 'zh' ? '网络错误，请稍后重试' : 'Network error, please try again later'));
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend.includes('bullish') || trend.includes('涨')) {
      return <RiseOutlined style={{ color: '#52c41a' }} />;
    } else if (trend.includes('bearish') || trend.includes('跌')) {
      return <FallOutlined style={{ color: '#ff4d4f' }} />;
    }
    return <LineChartOutlined style={{ color: '#1890ff' }} />;
  };

  const getTrendColor = (trend: string): string => {
    if (trend.includes('bullish') || trend.includes('涨')) return '#52c41a';
    if (trend.includes('bearish') || trend.includes('跌')) return '#ff4d4f';
    return '#1890ff';
  };

  const getRiskColor = (riskLevel: string): string => {
    if (riskLevel.includes('high') || riskLevel.includes('高')) return '#ff4d4f';
    if (riskLevel.includes('medium') || riskLevel.includes('中')) return '#fa8c16';
    return '#52c41a';
  };

  const formatPrice = (price: number): string => {
    if (price >= 1) {
      return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
    }
    return `$${price.toFixed(8)}`;
  };

  const formatMarketCap = (marketCap: number): string => {
    if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
    return `$${marketCap.toLocaleString()}`;
  };

  const prepareChartData = (chartData: any) => {
    if (!chartData?.prices || !Array.isArray(chartData.prices)) {
      return null;
    }

    const labels = chartData.prices.map((point: number[]) => new Date(point[0]));
    const prices = chartData.prices.map((point: number[]) => point[1]);

    return {
      labels,
      datasets: [
        {
          label: language === 'zh' ? '价格 (USD)' : 'Price (USD)',
          data: prices,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 5,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: language === 'zh' ? '7天价格走势' : '7-Day Price Chart',
        font: {
          size: 14,
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function(context: any) {
            return `${language === 'zh' ? '价格' : 'Price'}: ${formatPrice(context.parsed.y)}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
          displayFormats: {
            day: 'MMM dd',
          },
        },
        title: {
          display: true,
          text: language === 'zh' ? '日期' : 'Date',
        },
      },
      y: {
        title: {
          display: true,
          text: language === 'zh' ? '价格 (USD)' : 'Price (USD)',
        },
        ticks: {
          callback: function(value: any) {
            return formatPrice(value);
          },
        },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LineChartOutlined />
              <span>{t.title}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GlobalOutlined />
              <Switch 
                checked={language === 'zh'}
                onChange={(checked) => setLanguage(checked ? 'zh' : 'en')}
                checkedChildren="中文"
                unCheckedChildren="EN"
              />
            </div>
          </div>
        }
        style={{ marginBottom: '20px' }}
      >
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <Input
            placeholder={t.inputPlaceholder}
            value={token}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            onPressEnter={handleAnalysis}
            style={{ flex: 1 }}
          />
          <Button 
            type="primary" 
            onClick={handleAnalysis}
            loading={loading}
            icon={<LineChartOutlined />}
          >
            {t.startAnalysis}
          </Button>
        </div>

        {error && (
          <Alert 
            message={t.analysisError}
            description={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: '20px' }}
          />
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
            <p style={{ marginTop: '16px', color: '#666' }}>
              {t.analyzing}
            </p>
          </div>
        )}

        {analysisData && (
          <div>
            {/* 检查是否有任何可显示的数据 */}
            {!analysisData.price_analysis?.data && !analysisData.ai_summary && !analysisData.news_analysis && (
              <Alert
                message={t.noAnalysisData}
                description={t.noAnalysisDescription}
                type="warning"
                style={{ marginBottom: '16px' }}
              />
            )}
            {/* 价格概览 */}
            {analysisData.price_analysis?.data && (
              <Card 
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {analysisData.price_analysis.data.image && (
                      <img 
                        src={analysisData.price_analysis.data.image} 
                        alt={analysisData.price_analysis.data.name || analysisData.token}
                        style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                      />
                    )}
                    <span>
                      {analysisData.price_analysis.data.name || analysisData.token} {t.priceOverview}
                    </span>
                  </div>
                }
                size="small"
                style={{ marginBottom: '16px' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{t.currentPrice}</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                      {formatPrice(analysisData.price_analysis.data.current_price)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{t.change24h}</div>
                    <div style={{ 
                      fontSize: '18px', 
                      fontWeight: 'bold',
                      color: analysisData.price_analysis.data.price_change_percentage_24h > 0 ? '#52c41a' : '#ff4d4f'
                    }}>
                      {analysisData.price_analysis.data.price_change_percentage_24h > 0 ? '+' : ''}
                      {analysisData.price_analysis.data.price_change_percentage_24h.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{t.marketCap}</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                      {formatMarketCap(analysisData.price_analysis.data.market_cap)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{t.volume24h}</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                      {formatMarketCap(analysisData.price_analysis.data.total_volume)}
                    </div>
                  </div>
                  {analysisData.price_analysis.data.market_cap_rank && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{t.marketCapRank}</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                        #{analysisData.price_analysis.data.market_cap_rank}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 项目描述 */}
                {analysisData.price_analysis.data.description && (
                  <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>
                      {t.description}
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      lineHeight: '1.5', 
                      color: '#666',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {analysisData.price_analysis.data.description}
                    </div>
                  </div>
                )}

                {/* 价格曲线图 */}
                {analysisData.price_analysis.data.chartData && prepareChartData(analysisData.price_analysis.data.chartData) && (
                  <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#fafafa', borderRadius: '6px' }}>
                    <div style={{ height: '300px' }}>
                      <Line data={prepareChartData(analysisData.price_analysis.data.chartData)!} options={chartOptions} />
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* AI智能总结 */}
            {analysisData.ai_summary && (
              <Card 
                title={t.aiSummary}
                size="small"
                style={{ marginBottom: '16px' }}
              >
                <p style={{ marginBottom: '16px', lineHeight: '1.6' }}>
                  {analysisData.ai_summary.summary}
                </p>
                
                {analysisData.ai_summary.keyMetrics && (
                  <>
                    <Divider orientation="left" orientationMargin={0}>{t.keyMetrics}</Divider>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{t.trend}</div>
                        <Tag 
                          icon={getTrendIcon(analysisData.ai_summary.keyMetrics.trend)}
                          color={getTrendColor(analysisData.ai_summary.keyMetrics.trend)}
                        >
                          {analysisData.ai_summary.keyMetrics.trend}
                        </Tag>
                      </div>
                      
                      <div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{t.volatility}</div>
                        <Tag>{analysisData.ai_summary.keyMetrics.volatility}</Tag>
                      </div>
                      
                      <div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{t.riskLevel}</div>
                        <Tag color={getRiskColor(analysisData.ai_summary.keyMetrics.risk_level)}>
                          {analysisData.ai_summary.keyMetrics.risk_level}
                        </Tag>
                      </div>
                      
                      {analysisData.ai_summary.keyMetrics.sentiment_score !== undefined && (
                        <div>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{t.sentimentScore}</div>
                          <Progress 
                            percent={analysisData.ai_summary.keyMetrics.sentiment_score} 
                            size="small"
                            format={(percent) => `${percent}/100`}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
                
                {analysisData.ai_summary.confidence && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{t.confidence}</div>
                    <Progress 
                      percent={analysisData.ai_summary.confidence}
                      strokeColor={{
                        '0%': '#108ee9',
                        '100%': '#87d068',
                      }}
                    />
                  </div>
                )}
              </Card>
            )}

            {/* 新闻影响分析 */}
            {analysisData.news_impact && (
              <Card 
                title={t.newsOverview}
                size="small"
                style={{ marginBottom: '16px' }}
              >
                <p style={{ marginBottom: '16px', lineHeight: '1.6' }}>
                  {analysisData.news_impact.summary}
                </p>
                
                {analysisData.news_impact.prediction && (
                  <>
                    <Divider orientation="left" orientationMargin={0}>{language === 'zh' ? '短期预测' : 'Short-term Prediction'}</Divider>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{language === 'zh' ? '预期影响' : 'Expected Impact'}</div>
                        <Tag color="blue">{analysisData.news_impact.prediction.expected_impact}</Tag>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{language === 'zh' ? '概率' : 'Probability'}</div>
                        <span style={{ fontWeight: 'bold' }}>
                          {analysisData.news_impact.prediction.probability}%
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{language === 'zh' ? '时间窗口' : 'Timeframe'}</div>
                        <Tag>{analysisData.news_impact.prediction.timeframe}</Tag>
                      </div>
                    </div>
                  </>
                )}
              </Card>
            )}

            {/* 市场情绪 */}
            {analysisData.news_analysis?.sentiment_analysis && (
              <Card 
                title={t.marketSentiment}
                size="small"
                style={{ marginBottom: '16px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{t.overallSentiment}</div>
                    <Tag 
                      color={
                        analysisData.news_analysis.sentiment_analysis.label === 'positive' ? 'green' :
                        analysisData.news_analysis.sentiment_analysis.label === 'negative' ? 'red' : 'default'
                      }
                    >
                      {analysisData.news_analysis.sentiment_analysis.label === 'positive' ? t.positive :
                       analysisData.news_analysis.sentiment_analysis.label === 'negative' ? t.negative : t.neutral}
                    </Tag>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{t.sentimentStrength}</div>
                    <Progress 
                      percent={Math.round((analysisData.news_analysis.sentiment_analysis.score || 0) * 100)}
                      strokeColor={
                        analysisData.news_analysis.sentiment_analysis.label === 'positive' ? '#52c41a' :
                        analysisData.news_analysis.sentiment_analysis.label === 'negative' ? '#ff4d4f' : '#1890ff'
                      }
                    />
                  </div>
                </div>
                
                {/* 新闻总结 */}
                {analysisData.news_analysis.news_summary && (
                  <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{t.newsOverview}</div>
                    <div style={{ fontSize: '14px' }}>{analysisData.news_analysis.news_summary}</div>
                  </div>
                )}
              </Card>
            )}


            {/* 相关新闻 */}
            {analysisData.news_analysis?.news_data && analysisData.news_analysis.news_data.length > 0 && (
              <Card 
                title={t.relatedNews}
                size="small"
                style={{ marginBottom: '16px' }}
              >
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {analysisData.news_analysis.news_data.slice(0, 5).map((news: any, index: number) => (
                    <div 
                      key={index} 
                      style={{ 
                        borderBottom: index < 4 ? '1px solid #f0f0f0' : 'none',
                        paddingBottom: '12px',
                        marginBottom: index < 4 ? '12px' : '0'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <h4 style={{ 
                          margin: 0, 
                          fontSize: '14px', 
                          fontWeight: 'bold',
                          flex: 1,
                          marginRight: '12px'
                        }}>
                          {news.title}
                        </h4>
                        <div style={{ fontSize: '12px', color: '#999', whiteSpace: 'nowrap' }}>
                          {new Date(news.published_at).toLocaleDateString()}
                        </div>
                      </div>
                      
                      <p style={{ 
                        margin: 0, 
                        fontSize: '13px', 
                        color: '#666', 
                        lineHeight: '1.4',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {news.content}
                      </p>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Tag color="blue">{news.source}</Tag>
                          {news.token_symbol === 'GENERAL' && (
                            <Tag color="orange">{t.generalNews}</Tag>
                          )}
                          {news.token_symbol !== 'GENERAL' && (
                            <Tag color="green">{t.relevantNews}</Tag>
                          )}
                        </div>
                        {news.url && (
                          <a 
                            href={news.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ fontSize: '12px', color: '#1890ff' }}
                          >
                            {t.readMore}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {analysisData.news_analysis.news_data.length > 5 && (
                    <div style={{ textAlign: 'center', marginTop: '12px', color: '#999', fontSize: '12px' }}>
                      {language === 'zh' ? 
                        `还有 ${analysisData.news_analysis.news_data.length - 5} 条新闻...` :
                        `${analysisData.news_analysis.news_data.length - 5} ${t.moreNews}`
                      }
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* 免责声明 */}
            <Alert
              message={t.riskWarning}
              description={t.riskDescription}
              type="warning"
              icon={<InfoCircleOutlined />}
              style={{ marginTop: '16px' }}
            />
          </div>
        )}
      </Card>
    </div>
  );
};

export default MarketAnalysis;
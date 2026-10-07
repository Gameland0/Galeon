import React from 'react';
import { Card, Tag, Progress, Divider } from 'antd';
import { RiseOutlined, FallOutlined, LineChartOutlined, InfoCircleOutlined, GlobalOutlined } from '@ant-design/icons';
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

interface MarketAnalysisRendererProps {
  data: any;
  isEnglish?: boolean;
}

const MarketAnalysisRenderer: React.FC<MarketAnalysisRendererProps> = ({ data, isEnglish = true }) => {
  const analysis = data.marketAnalysis;
  const language = isEnglish ? 'en' : 'zh';
  
  if (!analysis) {
    return (
      <div className="market-analysis-error">
        <p>{language === 'zh' ? '市场分析数据不可用' : 'Market analysis data unavailable'}</p>
      </div>
    );
  }

  const t = {
    en: {
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
    },
    zh: {
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
    }
  };

  const getText = (key: string) => t[language as keyof typeof t][key as keyof typeof t['en']];

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
    return `$${price.toFixed(3)}`;
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

  // Staking相关辅助函数
  const getStakingRiskColor = (riskLevel: string): string => {
    switch(riskLevel) {
      case 'low': return 'green';
      case 'medium': return 'orange';  
      case 'high': return 'red';
      default: return 'default';
    }
  };

  const getStakingRiskText = (riskLevel: string, language: string): string => {
    const texts = {
      en: { low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk' },
      zh: { low: '低风险', medium: '中等风险', high: '高风险' }
    };
    return texts[language as 'en' | 'zh'][riskLevel as 'low' | 'medium' | 'high'] || 'Unknown';
  };

  const getInsightBackgroundColor = (level: string): string => {
    switch(level) {
      case 'positive': return '#f6ffed';
      case 'warning': return '#fff7e6';
      case 'neutral': return '#f0f9ff';
      default: return '#fafafa';
    }
  };

  const getInsightBorderColor = (level: string): string => {
    switch(level) {
      case 'positive': return '#b7eb8f';
      case 'warning': return '#ffd591';
      case 'neutral': return '#91d5ff';
      default: return '#d9d9d9';
    }
  };

  const getInsightTextColor = (level: string): string => {
    switch(level) {
      case 'positive': return '#52c41a';
      case 'warning': return '#fa8c16';
      case 'neutral': return '#1890ff';
      default: return '#666';
    }
  };

  return (
    <div style={{ maxWidth: '100%', margin: '0', padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
      {/* 价格概览 */}
      {analysis.price_analysis?.data && (
        <Card 
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {analysis.price_analysis.data.image && (
                <img 
                  src={analysis.price_analysis.data.image} 
                  alt={analysis.price_analysis.data.name || analysis.token}
                  style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                />
              )}
              <span>
                {analysis.price_analysis.data.name || analysis.token} {getText('priceOverview')}
              </span>
            </div>
          }
          size="small"
          style={{ marginBottom: '16px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>{getText('currentPrice')}</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {formatPrice(analysis.price_analysis.data.current_price)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>{getText('change24h')}</div>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 'bold',
                color: analysis.price_analysis.data.price_change_percentage_24h > 0 ? '#52c41a' : '#ff4d4f'
              }}>
                {analysis.price_analysis.data.price_change_percentage_24h > 0 ? '+' : ''}
                {analysis.price_analysis.data.price_change_percentage_24h.toFixed(2)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>{getText('marketCap')}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatMarketCap(analysis.price_analysis.data.market_cap)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>{getText('volume24h')}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatMarketCap(analysis.price_analysis.data.total_volume)}
              </div>
            </div>
            {analysis.price_analysis.data.market_cap_rank && (
              <div>
                <div style={{ fontSize: '12px', color: '#666' }}>{getText('marketCapRank')}</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                  #{analysis.price_analysis.data.market_cap_rank}
                </div>
              </div>
            )}
          </div>
          
          {/* 项目描述 */}
          {analysis.price_analysis.data.description && (
            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>
                {getText('description')}
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
                {analysis.price_analysis.data.description}
              </div>
            </div>
          )}

          {/* 价格曲线图 */}
          {analysis.price_analysis.data.chartData && prepareChartData(analysis.price_analysis.data.chartData) && (
            <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#fafafa', borderRadius: '6px' }}>
              <div style={{ height: '300px' }}>
                <Line data={prepareChartData(analysis.price_analysis.data.chartData)!} options={chartOptions} />
              </div>
            </div>
          )}
        </Card>
      )}

      {/* AI智能总结 */}
      {analysis.ai_summary && (
        <Card 
          title={getText('aiSummary')}
          size="small"
          style={{ marginBottom: '16px' }}
        >
          <p style={{ marginBottom: '16px', lineHeight: '1.6' }}>
            {analysis.ai_summary.summary}
          </p>
          
          {analysis.ai_summary.keyMetrics && (
            <>
              <Divider orientation="left" orientationMargin={0}>{getText('keyMetrics')}</Divider>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{getText('trend')}</div>
                  <Tag 
                    icon={getTrendIcon(analysis.ai_summary.keyMetrics.trend)}
                    color={getTrendColor(analysis.ai_summary.keyMetrics.trend)}
                  >
                    {analysis.ai_summary.keyMetrics.trend}
                  </Tag>
                </div>
                
                <div>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{getText('volatility')}</div>
                  <Tag>{analysis.ai_summary.keyMetrics.volatility}</Tag>
                </div>
                
                <div>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{getText('riskLevel')}</div>
                  <Tag color={getRiskColor(analysis.ai_summary.keyMetrics.risk_level)}>
                    {analysis.ai_summary.keyMetrics.risk_level}
                  </Tag>
                </div>
                
                {analysis.ai_summary.keyMetrics.sentiment_score !== undefined && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{getText('sentimentScore')}</div>
                    <Progress 
                      percent={analysis.ai_summary.keyMetrics.sentiment_score} 
                      size="small"
                      format={(percent) => `${percent}/100`}
                    />
                  </div>
                )}
              </div>
            </>
          )}
          
          {analysis.ai_summary.confidence && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{getText('confidence')}</div>
              <Progress 
                percent={analysis.ai_summary.confidence}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
            </div>
          )}
        </Card>
      )}

      {/* 市场情绪 */}
      {analysis.news_analysis?.sentiment_analysis && (
        <Card 
          title={getText('marketSentiment')}
          size="small"
          style={{ marginBottom: '16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{getText('overallSentiment')}</div>
              <Tag 
                color={
                  analysis.news_analysis.sentiment_analysis.label === 'positive' ? 'green' :
                  analysis.news_analysis.sentiment_analysis.label === 'negative' ? 'red' : 'default'
                }
              >
                {analysis.news_analysis.sentiment_analysis.label === 'positive' ? getText('positive') :
                 analysis.news_analysis.sentiment_analysis.label === 'negative' ? getText('negative') : getText('neutral')}
              </Tag>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{getText('sentimentStrength')}</div>
              <Progress 
                percent={Math.round((analysis.news_analysis.sentiment_analysis.score || 0) * 100)}
                strokeColor={
                  analysis.news_analysis.sentiment_analysis.label === 'positive' ? '#52c41a' :
                  analysis.news_analysis.sentiment_analysis.label === 'negative' ? '#ff4d4f' : '#1890ff'
                }
              />
            </div>
          </div>
          
          {/* 新闻总结 */}
          {analysis.news_analysis.news_summary && (
            <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{getText('newsOverview')}</div>
              <div style={{ fontSize: '14px' }}>{analysis.news_analysis.news_summary}</div>
            </div>
          )}
        </Card>
      )}

      {/* 相关新闻 */}
      {analysis.news_analysis?.news_data && analysis.news_analysis.news_data.length > 0 && (
        <Card 
          title={getText('relatedNews')}
          size="small"
          style={{ marginBottom: '16px' }}
        >
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {analysis.news_analysis.news_data.slice(0, 3).map((news: any, index: number) => (
              <div 
                key={index} 
                style={{ 
                  borderBottom: index < 2 ? '1px solid #f0f0f0' : 'none',
                  paddingBottom: '12px',
                  marginBottom: index < 2 ? '12px' : '0'
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
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {news.content}
                </p>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Tag color="blue">{news.source}</Tag>
                    {news.token_symbol === 'GENERAL' && (
                      <Tag color="orange">{getText('generalNews')}</Tag>
                    )}
                    {news.token_symbol !== 'GENERAL' && (
                      <Tag color="green">{getText('relevantNews')}</Tag>
                    )}
                  </div>
                  {news.url && (
                    <a 
                      href={news.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ fontSize: '12px', color: '#1890ff' }}
                    >
                      {getText('readMore')}
                    </a>
                  )}
                </div>
              </div>
            ))}
            
            {analysis.news_analysis.news_data.length > 3 && (
              <div style={{ textAlign: 'center', marginTop: '12px', color: '#999', fontSize: '12px' }}>
                {language === 'zh' ? 
                  `还有 ${analysis.news_analysis.news_data.length - 3} 条新闻...` :
                  `${analysis.news_analysis.news_data.length - 3} ${getText('moreNews')}`
                }
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Staking信息 */}
      {analysis.staking_analysis?.available && (
        <Card 
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              💰 Staking信息
              <Tag color={getStakingRiskColor(analysis.staking_analysis.data.riskLevel)}>
                {getStakingRiskText(analysis.staking_analysis.data.riskLevel, language)}
              </Tag>
            </div>
          }
          size="small"
          style={{ marginBottom: '16px' }}
        >
          {/* 基础指标 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>{language === 'zh' ? '加权平均APY' : 'Weighted Avg APY'}</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#52c41a' }}>
                {analysis.staking_analysis.data.averageAPY.toFixed(2)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>{language === 'zh' ? '总锁仓量' : 'Total TVL'}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatMarketCap(analysis.staking_analysis.data.totalTVL)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>{language === 'zh' ? '安全协议' : 'Safe Protocols'}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {analysis.staking_analysis.data.poolsCount}{language === 'zh' ? '个' : ''}
              </div>
            </div>
          </div>
          
          {/* 优选协议 (TVL > 1000万) */}
          {analysis.staking_analysis.data.premiumPools && analysis.staking_analysis.data.premiumPools.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#52c41a' }}>
                🏆 {language === 'zh' ? '优选协议 (TVL > $10M)' : 'Premium Protocols (TVL > $10M)'}
              </div>
              {analysis.staking_analysis.data.premiumPools.map((pool: any, index: number) => (
                <div key={index} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '12px',
                  margin: '4px 0',
                  backgroundColor: '#f6ffed',
                  borderRadius: '6px',
                  border: '1px solid #b7eb8f'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                      <a 
                        href={pool.protocolUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#52c41a', textDecoration: 'none' }}
                        onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                      >
                        {pool.protocol}
                      </a> ({pool.chain})
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      TVL: {formatMarketCap(pool.tvl)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#52c41a', fontWeight: 'bold', fontSize: '16px' }}>
                      {pool.apy.toFixed(2)}%
                    </div>
                    {pool.apyReward > 0 && (
                      <div style={{ fontSize: '10px', color: '#666' }}>
                        Base: {pool.apyBase.toFixed(1)}% + Rewards: {pool.apyReward.toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* 标准协议 (TVL > 100万) */}
          {analysis.staking_analysis.data.standardPools && analysis.staking_analysis.data.standardPools.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#1890ff' }}>
                📊 {language === 'zh' ? '标准协议 (TVL > $1M)' : 'Standard Protocols (TVL > $1M)'}
              </div>
              {analysis.staking_analysis.data.standardPools.slice(0, 2).map((pool: any, index: number) => (
                <div key={index} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '10px',
                  margin: '4px 0',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '6px',
                  border: '1px solid #91d5ff'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                      <a 
                        href={pool.protocolUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#1890ff', textDecoration: 'none' }}
                        onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                      >
                        {pool.protocol}
                      </a> ({pool.chain})
                    </div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      TVL: {formatMarketCap(pool.tvl)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#1890ff', fontWeight: 'bold', fontSize: '14px' }}>
                      {pool.apy.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Staking见解 */}
          {analysis.staking_analysis.insights && analysis.staking_analysis.insights.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#666' }}>
                💡 {language === 'zh' ? '关键见解' : 'Key Insights'}
              </div>
              {analysis.staking_analysis.insights.slice(0, 3).map((insight: any, index: number) => (
                <div key={index} style={{ 
                  padding: '8px 12px',
                  margin: '4px 0',
                  backgroundColor: getInsightBackgroundColor(insight.level),
                  borderRadius: '4px',
                  border: `1px solid ${getInsightBorderColor(insight.level)}`,
                  fontSize: '12px'
                }}>
                  <span style={{ color: getInsightTextColor(insight.level) }}>
                    {insight.message}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {/* 风险提示 */}
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#fffbe6', 
            borderRadius: '4px',
            fontSize: '12px',
            color: '#666',
            border: '1px solid #ffd591'
          }}>
            ⚠️ {language === 'zh' 
              ? '仅显示TVL>$1M的协议，建议优选高TVL协议以降低风险。点击协议名查看详情。' 
              : 'Only showing protocols with TVL>$1M. Prefer high-TVL protocols to reduce risk. Click protocol names for details.'}
          </div>
        </Card>
      )}

      {/* 免责声明 */}
      <div style={{ 
        padding: '12px', 
        backgroundColor: '#fff7e6', 
        border: '1px solid #ffd591', 
        borderRadius: '6px',
        marginTop: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <InfoCircleOutlined style={{ color: '#fa8c16' }} />
          <span style={{ fontWeight: 'bold', color: '#fa8c16' }}>{getText('riskWarning')}</span>
        </div>
        <div style={{ fontSize: '13px', color: '#8c8c8c', lineHeight: '1.4' }}>
          {getText('riskDescription')}
        </div>
      </div>
    </div>
  );
};

export default MarketAnalysisRenderer;
import React, { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
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

interface PriceChartProps {
  data: {
    type: string;
    title: string;
    tokenSymbol: string;
    currentPrice: string;
    priceChange24h: string;
    trend: string;
    marketCap: string;
    volume24h: string;
    chainName: string;
    chartData: {
      prices: [number, number][];
      market_caps: [number, number][];
      total_volumes: [number, number][];
    };
    lastUpdated: string;
    coinGeckoId: string;
  };
}

const PriceChart: React.FC<PriceChartProps> = ({ data }) => {
  const chartRef = useRef<ChartJS<"line", number[], Date>>(null);

  if (!data.chartData || !data.chartData.prices) {
    return (
      <div className="price-chart-container" style={{ 
        padding: '20px', 
        border: '1px solid #e0e0e0', 
        borderRadius: '8px',
        margin: '10px 0'
      }}>
        <h3>{data.title}</h3>
        <p>Chart data unavailable</p>
      </div>
    );
  }

  const prices = data.chartData.prices;
  const labels = prices.map(point => new Date(point[0]));
  const priceData = prices.map(point => point[1]);

  const chartConfig = {
    labels,
    datasets: [
      {
        label: `${data.tokenSymbol} / USD`,
        data: priceData,
        borderColor: data.priceChange24h.startsWith('-') ? '#ef4444' : '#10b981',
        backgroundColor: data.priceChange24h.startsWith('-') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1,
        fill: true
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    layout: {
      padding: {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10
      }
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
          displayFormats: {
            day: 'MM/dd'
          }
        },
        title: {
          display: true,
          text: 'Date',
          font: {
            size: 12
          }
        },
        grid: {
          color: '#e5e5e5'
        }
      },
      y: {
        title: {
          display: true,
          text: 'Price (USD)',
          font: {
            size: 12
          }
        },
        grid: {
          color: '#e5e5e5'
        },
        ticks: {
          callback: function(value: any) {
            return '$' + value.toLocaleString();
          },
          font: {
            size: 11
          }
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          font: {
            size: 12
          },
          usePointStyle: true,
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: {
          size: 13
        },
        bodyFont: {
          size: 12
        },
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: $${context.parsed.y.toLocaleString()}`;
          }
        }
      }
    }
  };

  return (
    <div className="price-chart-container" style={{ 
      width: '100%',
      padding: '15px', 
      border: '1px solid #e0e0e0', 
      borderRadius: '8px',
      backgroundColor: '#fafafa',
      boxSizing: 'border-box'
    }}>
      <div style={{ marginBottom: '15px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px' }}>
          {data.trend} {data.title}
        </h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: '8px',
          fontSize: '13px',
          marginBottom: '15px'
        }}>
          <div>
            <strong>💰 Current Price:</strong> ${data.currentPrice}
          </div>
          <div style={{ color: data.priceChange24h.startsWith('-') ? '#ef4444' : '#10b981' }}>
            <strong>📊 24h Change:</strong> {data.priceChange24h.startsWith('-') ? '' : '+'}{data.priceChange24h}%
          </div>
          <div>
            <strong>📈 Market Cap:</strong> {data.marketCap}
          </div>
          <div>
            <strong>💹 24h Volume:</strong> {data.volume24h}
          </div>
          <div>
            <strong>🌐 Network:</strong> {data.chainName}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            <strong>⏰ Updated:</strong> {data.lastUpdated}
          </div>
        </div>
      </div>
      
      <div style={{ 
        width: '100%', 
        height: '315px',
        minHeight: '280px',
        position: 'relative'
      }}>
        <Line ref={chartRef} data={chartConfig} options={options} />
      </div>
      
      <div style={{ 
        textAlign: 'center', 
        marginTop: '12px', 
        fontSize: '11px', 
        color: '#888',
        borderTop: '1px solid #eee',
        paddingTop: '8px'
      }}>
        💡 Data source: CoinGecko API
      </div>
    </div>
  );
};

export default PriceChart;
import React, { useEffect, useState, useRef } from 'react';
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
  Filler,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import annotationPlugin from 'chartjs-plugin-annotation';
import 'chartjs-adapter-date-fns';
import axios from 'axios';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
  annotationPlugin
);

interface SignalPriceChartProps {
  tokenSymbol: string;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  signalType: 'LONG' | 'SHORT' | 'BUY' | 'SELL' | 'NEUTRAL';
  currentPrice: number;
  timeframe: '15m' | '1h' | '4h' | '1d';
}

interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const SignalPriceChart: React.FC<SignalPriceChartProps> = ({
  tokenSymbol,
  entryMin,
  entryMax,
  stopLoss,
  takeProfit1,
  takeProfit2,
  takeProfit3,
  signalType,
  currentPrice,
  timeframe
}) => {
  const [klineData, setKlineData] = useState<KlineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<ChartJS<"line", number[], number>>(null);

  useEffect(() => {
    fetchKlineData();
  }, [tokenSymbol, timeframe]);

  const fetchKlineData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 尝试获取 Binance K线数据
      let symbol = tokenSymbol;

      // 如果没有 USDT 后缀，添加它
      if (!symbol.includes('USDT') && !symbol.includes('BUSD')) {
        symbol = `${symbol}USDT`;
      }

      const intervals: Record<string, string> = {
        '15m': '15m',
        '1h': '1h',
        '4h': '4h',
        '1d': '1d'
      };

      const interval = intervals[timeframe];
      const limit = timeframe === '15m' ? 96 : timeframe === '1h' ? 168 : timeframe === '4h' ? 168 : 90; // Data points

      const response = await axios.get(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );

      const formattedData: KlineData[] = response.data.map((item: any[]) => ({
        time: item[0],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5])
      }));

      setKlineData(formattedData);
    } catch (err) {
      console.error('Error fetching kline data:', err);
      setError('Unable to load price chart');
      // 生成模拟数据作为后备
      generateMockData();
    } finally {
      setLoading(false);
    }
  };

  const generateMockData = () => {
    // 生成模拟价格数据
    const now = Date.now();
    const interval = timeframe === '15m' ? 900000 : timeframe === '1h' ? 3600000 : timeframe === '4h' ? 14400000 : 86400000;
    const points = timeframe === '15m' ? 96 : timeframe === '1h' ? 168 : timeframe === '4h' ? 168 : 90;

    const mockData: KlineData[] = [];
    let price = currentPrice * 0.95; // 从当前价格的95%开始

    for (let i = 0; i < points; i++) {
      const time = now - (points - i) * interval;
      const change = (Math.random() - 0.5) * currentPrice * 0.02; // ±2% 变化
      price = Math.max(price + change, currentPrice * 0.8);

      mockData.push({
        time,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price,
        volume: Math.random() * 1000000
      });
    }

    // 最后一个点设为当前价格
    mockData[mockData.length - 1].close = currentPrice;
    setKlineData(mockData);
  };

  if (loading) {
    return (
      <div className="chart-placeholder" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        background: 'rgba(48, 54, 61, 0.3)',
        borderRadius: '12px'
      }}>
        <p style={{ color: '#8B949E' }}>Loading chart...</p>
      </div>
    );
  }

  if (error && klineData.length === 0) {
    return (
      <div className="chart-placeholder" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        background: 'rgba(48, 54, 61, 0.3)',
        borderRadius: '12px'
      }}>
        <p style={{ color: '#F24822', marginBottom: '8px' }}>{error}</p>
        <p style={{ color: '#8B949E', fontSize: '12px' }}>Using simulated data</p>
      </div>
    );
  }

  // 准备图表数据 - 使用时间戳作为 labels
  const labels = klineData.map(k => k.time);
  const priceData = klineData.map(k => k.close);

  // 创建注释（水平线）
  const annotations: any = {
    // Entry Zone
    entryMin: {
      type: 'line',
      yMin: entryMin,
      yMax: entryMin,
      borderColor: 'rgba(90, 106, 230, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        content: `Entry Min: $${entryMin.toFixed(3)}`,
        enabled: true,
        position: 'start',
        backgroundColor: 'rgba(90, 106, 230, 0.9)',
        color: 'white',
        font: {
          size: 11
        }
      }
    },
    entryMax: {
      type: 'line',
      yMin: entryMax,
      yMax: entryMax,
      borderColor: 'rgba(90, 106, 230, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        content: `Entry Max: $${entryMax.toFixed(3)}`,
        enabled: true,
        position: 'start',
        backgroundColor: 'rgba(90, 106, 230, 0.9)',
        color: 'white',
        font: {
          size: 11
        }
      }
    },
    // Stop Loss
    stopLoss: {
      type: 'line',
      yMin: stopLoss,
      yMax: stopLoss,
      borderColor: 'rgba(242, 72, 34, 0.9)',
      borderWidth: 2,
      label: {
        content: `Stop Loss: $${stopLoss.toFixed(3)}`,
        enabled: true,
        position: 'end',
        backgroundColor: 'rgba(242, 72, 34, 0.9)',
        color: 'white',
        font: {
          size: 11
        }
      }
    },
    // Take Profit 1
    tp1: {
      type: 'line',
      yMin: takeProfit1,
      yMax: takeProfit1,
      borderColor: 'rgba(0, 199, 151, 0.9)',
      borderWidth: 2,
      label: {
        content: `TP1: $${takeProfit1.toFixed(3)}`,
        enabled: true,
        position: 'end',
        backgroundColor: 'rgba(0, 199, 151, 0.9)',
        color: 'white',
        font: {
          size: 11
        }
      }
    }
  };

  // 添加 TP2 和 TP3（如果存在）
  if (takeProfit2) {
    annotations.tp2 = {
      type: 'line',
      yMin: takeProfit2,
      yMax: takeProfit2,
      borderColor: 'rgba(0, 199, 151, 0.7)',
      borderWidth: 2,
      borderDash: [3, 3],
      label: {
        content: `TP2: $${takeProfit2.toFixed(3)}`,
        enabled: true,
        position: 'end',
        backgroundColor: 'rgba(0, 199, 151, 0.9)',
        color: 'white',
        font: {
          size: 11
        }
      }
    };
  }

  if (takeProfit3) {
    annotations.tp3 = {
      type: 'line',
      yMin: takeProfit3,
      yMax: takeProfit3,
      borderColor: 'rgba(0, 199, 151, 0.5)',
      borderWidth: 2,
      borderDash: [3, 3],
      label: {
        content: `TP3: $${takeProfit3.toFixed(3)}`,
        enabled: true,
        position: 'end',
        backgroundColor: 'rgba(0, 199, 151, 0.9)',
        color: 'white',
        font: {
          size: 11
        }
      }
    };
  }

  // Entry Zone 区域填充
  annotations.entryZone = {
    type: 'box',
    yMin: entryMin,
    yMax: entryMax,
    backgroundColor: 'rgba(90, 106, 230, 0.1)',
    borderWidth: 0
  };

  const chartData = {
    labels,
    datasets: [
      {
        label: `${tokenSymbol} Price`,
        data: priceData,
        borderColor: signalType === 'LONG' || signalType === 'BUY' ? '#00C797' : '#F24822',
        backgroundColor: signalType === 'LONG' || signalType === 'BUY' ? 'rgba(0, 199, 151, 0.1)' : 'rgba(242, 72, 34, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1,
        fill: true
      }
    ]
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#E6EDF3',
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(22, 27, 34, 0.95)',
        titleColor: '#E6EDF3',
        bodyColor: '#C9D1D9',
        borderColor: '#30363D',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: function(context) {
            return `Price: $${context.parsed.y.toFixed(3)}`;
          }
        }
      },
      annotation: {
        annotations
      }
    },
    scales: {
      x: {
        type: 'time',
        display: true,
        grid: {
          color: 'rgba(48, 54, 61, 0.3)'
        },
        time: {
          unit: timeframe === '15m' ? 'minute' : timeframe === '1h' ? 'hour' : timeframe === '4h' ? 'hour' : 'day',
          displayFormats: {
            minute: 'HH:mm',
            hour: 'MM-dd HH:mm',
            day: 'MM-dd'
          },
          tooltipFormat: timeframe === '15m' ? 'yyyy-MM-dd HH:mm' : timeframe === '1h' ? 'yyyy-MM-dd HH:mm' : timeframe === '4h' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'
        },
        ticks: {
          color: '#8B949E',
          maxTicksLimit: 8,
          font: {
            size: 11
          }
        }
      },
      y: {
        display: true,
        position: 'right',
        grid: {
          color: 'rgba(48, 54, 61, 0.3)'
        },
        ticks: {
          color: '#8B949E',
          font: {
            size: 11
          },
          callback: function(value) {
            return '$' + (value as number).toFixed(3);
          }
        }
      }
    }
  };

  return (
    <div style={{ height: '400px', position: 'relative' }}>
      <Line ref={chartRef} data={chartData} options={options} />
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        display: 'flex',
        gap: '12px',
        fontSize: '11px',
        color: '#8B949E'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '16px', height: '2px', background: 'rgba(90, 106, 230, 0.8)', borderRadius: '1px' }}></div>
          <span>Entry Zone</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '16px', height: '2px', background: 'rgba(242, 72, 34, 0.9)', borderRadius: '1px' }}></div>
          <span>Stop Loss</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '16px', height: '2px', background: 'rgba(0, 199, 151, 0.9)', borderRadius: '1px' }}></div>
          <span>Take Profit</span>
        </div>
      </div>
    </div>
  );
};

export default SignalPriceChart;

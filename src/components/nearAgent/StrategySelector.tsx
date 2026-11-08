/**
 * Step 2: Strategy Selector
 * Tab-based design: click tab to select strategy, trade history shows below
 */

import React, { useState, useEffect } from 'react';
import { Spin, Statistic, Row, Col, Tag, Table, Typography } from 'antd';
import { TrophyOutlined, ThunderboltOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;

interface StrategyOverview {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
}

interface Trade {
  id: string;
  tokenSymbol: string;
  direction: string;
  pnl: number;
  pnlPct: number;
  exitReason: string;
  durationMin: number;
  closedAt: string;
}

interface StrategySelectorProps {
  selectedStrategy: string;
  onStrategyChange: (strategy: string) => void;
}

const API_BASE = (() => {
  const host = window.location.hostname;
  if (host.includes('testai.galeon.world')) return 'https://testaiservice.galeon.world/api';
  if (host.includes('testai.gameland.network')) return 'https://testaiservice.gameland.network/api';
  if (host.includes('localhost') || host.includes('127.0.0.1')) return 'https://galeon.world/api';
  return 'https://galeon.world/api';
})();

const TABS = [
  { key: 'stable', label: 'Stable', icon: <TrophyOutlined />, tag: 'Recommended', tagColor: 'green', color: '#1677ff' },
  { key: 'aggressive', label: 'Aggressive', icon: <ThunderboltOutlined />, tag: 'High Risk', tagColor: 'orange', color: '#fa8c16' },
] as const;

const tradeColumns = [
  {
    title: 'Symbol', dataIndex: 'tokenSymbol', width: 90,
    render: (_: any, r: any) => {
      const sym = String(r.tokenSymbol || r.symbol || '').replace(/USDT$/i, '');
      const dir = String(r.direction || '').toUpperCase();
      return (
        <span>
          <Tag color={dir === 'LONG' ? 'success' : 'error'} style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
            {dir === 'LONG' ? '↑L' : '↓S'}
          </Tag>{' '}
          <Text strong style={{ fontSize: 12 }}>{sym}</Text>
        </span>
      );
    },
  },
  {
    title: 'PnL', dataIndex: 'pnlPct', width: 80,
    render: (v: any) => {
      const n = parseFloat(String(v ?? 0)) || 0;
      return (
        <span style={{ color: n >= 0 ? '#3f8600' : '#cf1322', fontWeight: 700, fontSize: 12 }}>
          {n >= 0 ? '+' : ''}{n.toFixed(1)}%
        </span>
      );
    },
  },
  {
    title: 'Exit Reason', dataIndex: 'exitReason', width: 120,
    render: (v: any) => <Text style={{ fontSize: 11, color: '#8c8c8c' }}>{String(v || '-').replace(/_/g, ' ')}</Text>,
  },
  {
    title: 'Duration', dataIndex: 'durationMin', width: 70,
    render: (v: any) => {
      const m = parseInt(String(v)) || 0;
      return <Text style={{ fontSize: 11, color: '#8c8c8c' }}>{m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`}</Text>;
    },
  },
  {
    title: 'Time', dataIndex: 'closedAt', width: 100,
    render: (v: any) => {
      if (!v) return <Text style={{ fontSize: 11, color: '#8c8c8c' }}>-</Text>;
      const d = new Date(String(v));
      if (isNaN(d.getTime())) return <Text style={{ fontSize: 11, color: '#8c8c8c' }}>-</Text>;
      return <Text style={{ fontSize: 11, color: '#8c8c8c' }}>{`${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`}</Text>;
    },
  },
];

interface StrategyData {
  overview: StrategyOverview | null;
  trades: Trade[];
}

const StrategySelector: React.FC<StrategySelectorProps> = ({ selectedStrategy, onStrategyChange }) => {
  const [data, setData] = useState<Record<string, StrategyData>>({ stable: { overview: null, trades: [] }, aggressive: { overview: null, trades: [] } });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStrategy = async (strategy: string): Promise<StrategyData> => {
      const [ovRes, histRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/paper-trade/overview`, { params: { strategy } }),
        axios.get(`${API_BASE}/paper-trade/history`, { params: { strategy, limit: 10 } }),
      ]);

      const overview = ovRes.status === 'fulfilled' && ovRes.value.data.success
        ? ovRes.value.data.data : null;

      let trades: Trade[] = [];
      if (histRes.status === 'fulfilled') {
        const d = histRes.value.data?.data;
        const raw = Array.isArray(d) ? d : d?.trades || d?.data || [];
        trades = (Array.isArray(raw) ? raw : []).slice(0, 10);
      }

      return { overview, trades };
    };

    Promise.all([fetchStrategy('stable'), fetchStrategy('aggressive')])
      .then(([stable, aggressive]) => setData({ stable, aggressive }))
      .finally(() => setLoading(false));
  }, []);

  const current = data[selectedStrategy] || { overview: null, trades: [] };
  const tab = TABS.find(t => t.key === selectedStrategy) || TABS[0];

  return (
    <div>
      {/* Tab buttons */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        {TABS.map(t => (
          <div
            key={t.key}
            onClick={() => onStrategyChange(t.key)}
            style={{
              flex: 1, padding: '10px 16px', cursor: 'pointer', textAlign: 'center',
              background: selectedStrategy === t.key ? t.color : '#fafafa',
              color: selectedStrategy === t.key ? '#fff' : '#374151',
              transition: 'all 0.2s',
              borderRight: t.key === 'stable' ? '1px solid #e5e7eb' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t.label}</span>
              <Tag color={selectedStrategy === t.key ? undefined : t.tagColor}
                style={{ fontSize: 10, margin: 0, ...(selectedStrategy === t.key ? { background: 'rgba(255,255,255,0.25)', color: '#fff', border: 'none' } : {}) }}>
                {t.tag}
              </Tag>
            </div>
          </div>
        ))}
      </div>

      {/* Stats row */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
      ) : current.overview ? (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Statistic
              title={<span style={{ fontSize: 11 }}>Win Rate</span>}
              value={parseFloat(String(current.overview.winRate || 0)).toFixed(1)} suffix="%"
              valueStyle={{ color: (current.overview.winRate || 0) >= 55 ? '#3f8600' : '#cf1322', fontSize: 20, fontWeight: 700 }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={<span style={{ fontSize: 11 }}>Total PnL</span>}
              value={parseFloat(String(current.overview.totalPnlPercent || 0)).toFixed(1)} suffix="%"
              prefix={(current.overview.totalPnlPercent || 0) >= 0 ? '+' : ''}
              valueStyle={{ color: (current.overview.totalPnlPercent || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 20, fontWeight: 700 }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={<span style={{ fontSize: 11 }}>Trades</span>}
              value={current.overview.totalTrades || 0}
              valueStyle={{ fontSize: 20, fontWeight: 700 }}
            />
          </Col>
        </Row>
      ) : null}

      {/* Trade history table */}
      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
        <div style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 600, marginBottom: 8 }}>
          Recent Trades — {tab.label}
        </div>
        {loading ? (
          <Spin size="small" />
        ) : current.trades.length > 0 ? (
          <Table
            dataSource={current.trades}
            columns={tradeColumns}
            rowKey={(r, i) => r.id || `${i}`}
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
          />
        ) : (
          <Text style={{ fontSize: 12, color: '#bbb' }}>No trade history yet</Text>
        )}
      </div>
    </div>
  );
};

export default StrategySelector;

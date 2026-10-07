import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Tag, Progress, Table, Statistic, Spin, Badge, Tooltip, Switch } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, MinusOutlined,
  ReloadOutlined, DashboardOutlined, FundOutlined,
  UserOutlined, ThunderboltOutlined
} from '@ant-design/icons';

const API_BASE = 'http://localhost:3088';
const REFRESH_INTERVAL = 60_000; // 60s

// 类型
interface SmartMoneyPosition {
  addr: string; winRate: number; leverage: number;
  entryPx: number; pnl: number; size: number; side?: string;
}

interface TokenData {
  price: number;
  priceChange24h: number;
  oiUsd: number;
  volume24h: number;
  funding: { current: number; avg24h: number; trend: string };
  orderBook: { bidDepth: number; askDepth: number; imbalance: number };
  smartMoney: {
    longCount: number; shortCount: number;
    longAvgWinRate: number; shortAvgWinRate: number;
    longs: SmartMoneyPosition[]; shorts: SmartMoneyPosition[];
  };
  binance: {
    retailLong: number; retailShort: number;
    topLong: number; topShort: number;
    openInterest: number; takerBuyRatio: number; takerTrend: string;
  } | null;
}

interface Snapshot {
  timestamp: string;
  tokens: Record<string, TokenData>;
  smartMoneyOverview: {
    totalAnalyzed: number; avgWinRate: number;
    top5: Array<{
      addr: string; accountValue: number; winRate: number;
      profitFactor: number; dayPnl: number;
      positions: Array<{ coin: string; side: string; leverage: number }>;
    }>;
  };
}

// AI 信号计算
function calcSignal(coin: string, data: TokenData): { signal: string; confidence: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const sm = data.smartMoney;
  const bn = data.binance;

  // 1. 聪明钱方向 (40分)
  const total = sm.longCount + sm.shortCount;
  if (total > 0) {
    const longRatio = sm.longCount / total;
    // 按胜率加权
    const longWR = sm.longAvgWinRate || 0;
    const shortWR = sm.shortAvgWinRate || 0;
    const wrDiff = longWR - shortWR;
    const dirScore = (longRatio - 0.5) * 60 + wrDiff * 0.3;
    score += Math.max(-40, Math.min(40, dirScore));

    if (sm.longCount > sm.shortCount * 2 && longWR > 60) reasons.push(`聪明钱 ${sm.longCount}:${sm.shortCount} 偏多(WR${longWR}%)`);
    else if (sm.shortCount > sm.longCount * 2 && shortWR > 60) reasons.push(`聪明钱 ${sm.longCount}:${sm.shortCount} 偏空(WR${shortWR}%)`);
    else if (total > 0) reasons.push(`聪明钱 ${sm.longCount}多:${sm.shortCount}空`);
  }

  // 2. 散户反向 (20分)
  if (bn) {
    const retailBias = bn.retailLong - 50;
    const reverseScore = -retailBias * 0.6;
    score += Math.max(-20, Math.min(20, reverseScore));
    if (bn.retailLong > 65) reasons.push(`散户${bn.retailLong}%做多→反向看空`);
    else if (bn.retailLong < 35) reasons.push(`散户${bn.retailLong}%做多→反向看多`);
  }

  // 3. Taker (15分)
  if (bn) {
    const takerBias = bn.takerBuyRatio - 50;
    score += Math.max(-15, Math.min(15, takerBias * 0.6));
    if (bn.takerTrend === 'buy_dominant') reasons.push('Taker买方主导');
    else if (bn.takerTrend === 'sell_dominant') reasons.push('Taker卖方主导');
  }

  // 4. 资金费率 (15分)
  const fr = data.funding.current * 10000; // 转为万分位
  if (Math.abs(fr) > 1) {
    score += fr > 0 ? -Math.min(15, fr * 3) : Math.min(15, -fr * 3);
    if (fr > 3) reasons.push('费率过高→多方过热');
    else if (fr < -3) reasons.push('费率为负→空方过热');
  }

  // 5. 盘口 (10分)
  const imb = data.orderBook.imbalance;
  score += Math.max(-10, Math.min(10, imb * 0.2));
  if (Math.abs(imb) > 20) reasons.push(`盘口偏移${imb > 0 ? '+' : ''}${imb}%`);

  const confidence = Math.min(95, Math.abs(score) + 20);
  const signal = score > 15 ? 'LONG' : score < -15 ? 'SHORT' : 'NEUTRAL';

  return { signal, confidence: Math.round(confidence), reasons };
}

// 格式化
const fmtUsd = (v: number) => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};
const fmtPrice = (v: number) => v >= 100 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`;
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const fmtFunding = (v: number) => `${(v * 100).toFixed(4)}%`;

// ==================== 组件 ====================

const SignalBadge: React.FC<{ signal: string; confidence: number }> = ({ signal, confidence }) => {
  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    LONG: { color: '#52c41a', icon: <ArrowUpOutlined /> },
    SHORT: { color: '#ff4d4f', icon: <ArrowDownOutlined /> },
    NEUTRAL: { color: '#faad14', icon: <MinusOutlined /> },
  };
  const c = config[signal] || config.NEUTRAL;
  return (
    <div style={{ textAlign: 'center' }}>
      <Tag color={c.color} style={{ fontSize: 18, padding: '6px 20px', fontWeight: 700 }}>
        {c.icon} {signal}
      </Tag>
      <Progress
        percent={confidence} size="small" strokeColor={c.color}
        format={p => <span style={{ color: '#fff' }}>{p}%</span>}
        style={{ marginTop: 8 }}
      />
    </div>
  );
};

const LongShortBar: React.FC<{ long: number; short: number; label?: string }> = ({ long, short, label }) => {
  const total = long + short;
  const longPct = total > 0 ? (long / total * 100) : 50;
  return (
    <div style={{ marginBottom: 8 }}>
      {label && <div style={{ color: '#aaa', fontSize: 12, marginBottom: 2 }}>{label}</div>}
      <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${longPct}%`, background: '#52c41a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 600, minWidth: 30 }}>
          {longPct.toFixed(0)}%
        </div>
        <div style={{ width: `${100 - longPct}%`, background: '#ff4d4f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 600, minWidth: 30 }}>
          {(100 - longPct).toFixed(0)}%
        </div>
      </div>
    </div>
  );
};

// Token 卡片
const TokenCard: React.FC<{ coin: string; data: TokenData }> = ({ coin, data }) => {
  const { signal, confidence, reasons } = calcSignal(coin, data);
  const sm = data.smartMoney;
  const bn = data.binance;
  const changeColor = data.priceChange24h >= 0 ? '#52c41a' : '#ff4d4f';

  // 聪明钱持仓表格
  const positions = [
    ...sm.longs.map(l => ({ ...l, side: 'LONG' })),
    ...sm.shorts.map(s => ({ ...s, side: 'SHORT' })),
  ].sort((a, b) => b.winRate - a.winRate);

  return (
    <Card
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{coin}</span>
          <div>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{fmtPrice(data.price)}</span>
            <span style={{ color: changeColor, marginLeft: 8, fontSize: 14 }}>{fmtPct(data.priceChange24h)}</span>
          </div>
        </div>
      }
      style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 12 }}
      headStyle={{ borderBottom: '1px solid #2a2a4a' }}
    >
      {/* 信号 */}
      <Row gutter={16}>
        <Col span={8}>
          <SignalBadge signal={signal} confidence={confidence} />
          <div style={{ marginTop: 8, fontSize: 11, color: '#888', lineHeight: '18px' }}>
            {reasons.map((r, i) => <div key={i}>• {r}</div>)}
          </div>
        </Col>

        {/* 市场数据 */}
        <Col span={16}>
          <Row gutter={[8, 8]}>
            <Col span={8}>
              <Statistic title="OI" value={fmtUsd(data.oiUsd)} valueStyle={{ fontSize: 14, color: '#fff' }} />
            </Col>
            <Col span={8}>
              <Statistic title="24h量" value={fmtUsd(data.volume24h)} valueStyle={{ fontSize: 14, color: '#fff' }} />
            </Col>
            <Col span={8}>
              <Statistic
                title="费率"
                value={fmtFunding(data.funding.current)}
                valueStyle={{ fontSize: 14, color: data.funding.current > 0.0001 ? '#ff4d4f' : data.funding.current < -0.0001 ? '#52c41a' : '#fff' }}
                suffix={<Tag color={data.funding.trend === 'rising' ? 'red' : data.funding.trend === 'falling' ? 'green' : 'default'} style={{ fontSize: 10 }}>{data.funding.trend}</Tag>}
              />
            </Col>
          </Row>

          {/* 盘口 */}
          <div style={{ marginTop: 12 }}>
            <LongShortBar
              long={data.orderBook.bidDepth} short={data.orderBook.askDepth}
              label={`盘口深度 (偏移 ${data.orderBook.imbalance > 0 ? '+' : ''}${data.orderBook.imbalance}%)`}
            />
          </div>
        </Col>
      </Row>

      {/* 多空比 */}
      <div style={{ marginTop: 16 }}>
        <LongShortBar long={sm.longCount} short={sm.shortCount} label={`聪明钱 多${sm.longCount}人(WR${sm.longAvgWinRate}%) vs 空${sm.shortCount}人(WR${sm.shortAvgWinRate}%)`} />
        {bn && (
          <>
            <LongShortBar long={bn.retailLong} short={bn.retailShort} label={`Binance散户 多${bn.retailLong}% vs 空${bn.retailShort}%`} />
            <LongShortBar long={bn.topLong} short={bn.topShort} label={`Binance大户 多${bn.topLong}% vs 空${bn.topShort}%`} />
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              Taker: 买方{bn.takerBuyRatio}%
              <Tag color={bn.takerTrend === 'buy_dominant' ? 'green' : bn.takerTrend === 'sell_dominant' ? 'red' : 'default'} style={{ marginLeft: 8, fontSize: 10 }}>
                {bn.takerTrend === 'buy_dominant' ? '买方主导' : bn.takerTrend === 'sell_dominant' ? '卖方主导' : '平衡'}
              </Tag>
            </div>
          </>
        )}
      </div>

      {/* 聪明钱持仓表 */}
      {positions.length > 0 && (
        <Table
          size="small"
          pagination={false}
          style={{ marginTop: 12 }}
          dataSource={positions}
          rowKey={(r, i) => `${r.addr}-${i}`}
          columns={[
            {
              title: '地址', dataIndex: 'addr', width: 100,
              render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}...</span>
            },
            {
              title: '方向', dataIndex: 'side', width: 70,
              render: (v: string) => <Tag color={v === 'LONG' ? 'green' : 'red'}>{v}</Tag>
            },
            {
              title: '胜率', dataIndex: 'winRate', width: 70, sorter: (a: any, b: any) => a.winRate - b.winRate,
              render: (v: number) => <span style={{ color: v > 60 ? '#52c41a' : v < 40 ? '#ff4d4f' : '#faad14', fontWeight: 600 }}>{v.toFixed(0)}%</span>
            },
            {
              title: '杠杆', dataIndex: 'leverage', width: 50,
              render: (v: number) => <span>{v}x</span>
            },
            {
              title: '入场价', dataIndex: 'entryPx', width: 90,
              render: (v: number) => <span style={{ fontSize: 11 }}>{fmtPrice(v)}</span>
            },
            {
              title: 'PnL', dataIndex: 'pnl', width: 90,
              render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{fmtUsd(v)}</span>
            },
          ]}
        />
      )}
    </Card>
  );
};

// ==================== 主页面 ====================

const SignalDashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/signal/snapshot`);
      const data = await res.json();
      setSnapshot(data);
      setLastUpdate(new Date().toLocaleTimeString());
      setError(null);
    } catch (err: any) {
      setError(err.message || '数据获取失败，请确保 signal-api-server 已启动');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchData]);

  if (error && !snapshot) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Card style={{ background: '#1a1a2e', border: '1px solid #ff4d4f', maxWidth: 500, margin: '0 auto' }}>
          <h2 style={{ color: '#ff4d4f' }}>⚠️ 连接失败</h2>
          <p style={{ color: '#aaa' }}>{error}</p>
          <p style={{ color: '#888', fontSize: 13 }}>
            请先启动 API 服务：<br />
            <code style={{ background: '#0d0d1a', padding: '4px 12px', borderRadius: 4, color: '#52c41a' }}>
              node signal-api-server.js
            </code>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            <DashboardOutlined style={{ marginRight: 8 }} />
            Crypto Signal Dashboard
          </h1>
          <p style={{ margin: 0, color: '#888', fontSize: 13 }}>
            Hyperliquid 聪明钱 + Binance 情绪 → AI 信号
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {lastUpdate && (
            <span style={{ color: '#666', fontSize: 12 }}>
              更新: {lastUpdate}
            </span>
          )}
          <Tooltip title="自动刷新 (60s)">
            <Switch checked={autoRefresh} onChange={setAutoRefresh} checkedChildren="自动" unCheckedChildren="手动" />
          </Tooltip>
          <Tooltip title="手动刷新">
            <ReloadOutlined
              spin={loading}
              style={{ fontSize: 18, cursor: 'pointer', color: loading ? '#1890ff' : '#fff' }}
              onClick={() => !loading && fetchData()}
            />
          </Tooltip>
        </div>
      </div>

      {loading && !snapshot ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
          <p style={{ color: '#888', marginTop: 16 }}>首次加载数据中，约需60秒...</p>
        </div>
      ) : snapshot ? (
        <>
          {/* 信号概览 */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {Object.entries(snapshot.tokens).map(([coin, data]) => {
              const { signal, confidence } = calcSignal(coin, data);
              const changeColor = data.priceChange24h >= 0 ? '#52c41a' : '#ff4d4f';
              const sigColor = signal === 'LONG' ? '#52c41a' : signal === 'SHORT' ? '#ff4d4f' : '#faad14';
              return (
                <Col span={6} key={coin}>
                  <Card size="small" style={{ background: '#1a1a2e', border: `1px solid ${sigColor}33`, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{coin}</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtPrice(data.price)}</div>
                        <div style={{ color: changeColor, fontSize: 13 }}>{fmtPct(data.priceChange24h)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <Tag color={sigColor} style={{ fontSize: 14, padding: '2px 12px', fontWeight: 700 }}>
                          {signal === 'LONG' ? <ArrowUpOutlined /> : signal === 'SHORT' ? <ArrowDownOutlined /> : <MinusOutlined />}
                          {' '}{signal}
                        </Tag>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>置信度 {confidence}%</div>
                      </div>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>

          {/* 详细卡片 */}
          <Row gutter={[16, 16]}>
            {Object.entries(snapshot.tokens).map(([coin, data]) => (
              <Col span={12} key={coin}>
                <TokenCard coin={coin} data={data} />
              </Col>
            ))}
          </Row>

          {/* 聪明钱 Top5 */}
          <Card
            title={<span><ThunderboltOutlined style={{ marginRight: 8 }} />聪明钱 Top5 (共{snapshot.smartMoneyOverview.totalAnalyzed}人分析, 平均胜率{snapshot.smartMoneyOverview.avgWinRate}%)</span>}
            style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 12, marginTop: 16 }}
            headStyle={{ borderBottom: '1px solid #2a2a4a' }}
          >
            <Table
              size="small"
              pagination={false}
              dataSource={snapshot.smartMoneyOverview.top5}
              rowKey="addr"
              columns={[
                {
                  title: '地址', dataIndex: 'addr', width: 120,
                  render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}...</span>
                },
                {
                  title: '账户', dataIndex: 'accountValue', width: 100,
                  render: (v: number) => fmtUsd(v)
                },
                {
                  title: '胜率', dataIndex: 'winRate', width: 80,
                  render: (v: number) => <span style={{ color: v > 60 ? '#52c41a' : '#faad14', fontWeight: 700 }}>{v.toFixed(1)}%</span>
                },
                {
                  title: '盈亏比', dataIndex: 'profitFactor', width: 80,
                  render: (v: number) => <span style={{ fontWeight: 600 }}>{v > 100 ? '999+' : v.toFixed(2)}</span>
                },
                {
                  title: '今日PnL', dataIndex: 'dayPnl', width: 120,
                  render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{fmtUsd(v)}</span>
                },
                {
                  title: '当前持仓', dataIndex: 'positions',
                  render: (positions: Array<{ coin: string; side: string; leverage: number }>) => (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {positions.map((p, i) => (
                        <Tag key={i} color={p.side === 'LONG' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                          {p.coin} {p.side} {p.leverage}x
                        </Tag>
                      ))}
                    </div>
                  )
                },
              ]}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
};

export default SignalDashboard;

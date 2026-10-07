import React, { useState, useEffect, useCallback, useContext } from 'react';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { getMarketOverview, getTokenDetail, getSignalFeed, api } from '../services/api';
import './MarketOverviewPage.css';

// ── Types ──
interface Signal {
  symbol: string; total_score: number; direction: string | null; status: string;
  blocked: number; price: number; price_chg_24h: number;
  price_structure_score: number; flow_score: number; sentiment_score: number; env_score: number;
  sm: number; oi: number; fr: number; taker: number; bs: number; rsi: number; gls: number; tls: number;
  market_direction: string; market_strength: number;
  pattern_name: string | null; pattern_outlook: string | null;
  support_price: number | null; resistance_price: number | null;
  tp_price: number | null; sl_price: number | null; rr_ratio: number | null;
  atr_pct: number | null; hist_win_rate: number | null;
  btc_trend: string; votes_json: string | null;
  sparkline?: number[];
  scanned_at: string;
}

interface FeedEvent {
  id: number; symbol: string; event_type: string; event_detail: string;
  prev_score: number; curr_score: number; created_at: string;
}

interface TimelinePoint { t: string; avg: number; longs: number; shorts: number; total: number; }

interface OverviewData {
  environment: { btcTrend: string; btcPrice: number; regime: any };
  aiToday: { wins: number; losses: number; winRate: number; pnl: number };
  signals: Signal[];
  sectors: Record<string, { avgChange: number; count: number }>;
  stress: { avgFunding: number | null; avgTaker: number | null };
  events: FeedEvent[];
  statusCounts: { ENTRY: number; READY: number; WATCH: number };
  marketTimeline: TimelinePoint[];
  updatedAt: string;
}

// ── Helpers ──
const fmtPrice = (p: number) => {
  if (!p) return '0';
  if (p >= 1) return p.toLocaleString('en', { maximumFractionDigits: 2 });
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(8);
};
const fmtPct = (p: number) => (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
const fmtUsd = (n: number) => (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(0);
const timeAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
};
const timeHHMM = (iso: string) => new Date(iso).toTimeString().slice(0, 5);

const tokenColors: Record<string, string> = {
  ETH: 'linear-gradient(135deg,#627eea,#8fa8f8)', DOGE: 'linear-gradient(135deg,#c2a633,#e8d064)',
  LINK: 'linear-gradient(135deg,#2a5ada,#6a9af7)', SOL: 'linear-gradient(135deg,#9945ff,#14f195)',
  BTC: 'linear-gradient(135deg,#f7931a,#ffb84d)', AAPL: 'linear-gradient(135deg,#333,#888)',
  TSLA: 'linear-gradient(135deg,#cc0000,#ff4444)', NVDA: 'linear-gradient(135deg,#76b900,#a3e635)',
};
const getTokenBg = (sym: string) => tokenColors[sym.replace('USDT', '')] || 'linear-gradient(135deg,#64748b,#94a3b8)';

const eventDotColor: Record<string, string> = {
  SCORE_JUMP: 'blue', DIRECTION_FLIP: 'amber', STATUS_CHANGE: 'purple',
  NEW_SIGNAL: 'green', SIGNAL_BLOCKED: 'red', DIM_FLIP: 'purple',
  REGIME_CHANGE: 'amber', TP_HIT: 'green', PATTERN_ALERT: 'purple',
};
const eventTagClass: Record<string, string> = {
  SCORE_JUMP: 'ok', DIRECTION_FLIP: 'warn', STATUS_CHANGE: 'info',
  NEW_SIGNAL: 'ok', SIGNAL_BLOCKED: 'bad', DIM_FLIP: 'info',
  REGIME_CHANGE: 'warn', TP_HIT: 'ok', PATTERN_ALERT: 'info',
};
const eventTagLabel: Record<string, string> = {
  SCORE_JUMP: 'Score Jump', DIRECTION_FLIP: 'Direction Flip', STATUS_CHANGE: 'Status Change',
  NEW_SIGNAL: 'New Signal', SIGNAL_BLOCKED: 'Risk Block', DIM_FLIP: 'Dimension Flip',
  REGIME_CHANGE: 'Regime Change', TP_HIT: 'TP Hit', PATTERN_ALERT: 'Pattern',
};

// ── Sparkline SVG ──
const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (!data || data.length < 2) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 72, h = 24;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  const lastX = w, lastY = h - ((data[data.length - 1] - min) / range) * h;
  const gradId = `sg-${Math.random().toString(36).slice(2, 6)}`;
  const areaPath = `M${points.split(' ').join(' ')} L${w},${h} L0,${h}Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
    </svg>
  );
};

// ── Mini Chart SVG (reusable) ──
const MiniChart: React.FC<{ data: number[]; color: string; h?: number; label?: string }> = ({ data, color, h = 60, label }) => {
  const [hover, setHover] = useState<{ x: number; val: number } | null>(null);
  if (!data || data.length < 2) return <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 11 }}>Collecting...</div>;

  const w = 300;
  const pad = 4;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const toY = (v: number) => pad + (1 - (v - min) / range) * (h - pad * 2);
  const toX = (i: number) => (i / (data.length - 1)) * w;
  const points = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const areaPath = `M${points} L${w},${h} L0,${h}Z`;
  const lastVal = data[data.length - 1];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * w;
    const ci = Math.max(0, Math.min(data.length - 1, Math.round(mx / w * (data.length - 1))));
    setHover({ x: toX(ci), val: data[ci] });
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, cursor: 'crosshair' }}
      onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <defs><linearGradient id={`mc-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.12" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {min < 0 && max > 0 && <line x1={0} y1={toY(0)} x2={w} y2={toY(0)} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3" />}
      <path d={areaPath} fill={`url(#mc-${color.replace('#','')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={toX(data.length - 1)} cy={toY(lastVal)} r="3" fill={color} />
      {hover && (
        <>
          <line x1={hover.x} y1={0} x2={hover.x} y2={h} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2" />
          <circle cx={hover.x} cy={toY(hover.val)} r="4" fill={color} />
          <rect x={Math.min(hover.x - 24, w - 52)} y={Math.max(toY(hover.val) - 22, 0)} width="48" height="18" rx="4" fill="#1e293b" />
          <text x={Math.min(hover.x, w - 28)} y={Math.max(toY(hover.val) - 9, 13)} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono">
            {hover.val > 0 ? '+' : ''}{typeof hover.val === 'number' ? (Number.isInteger(hover.val) ? hover.val : hover.val.toFixed(1)) : hover.val}
          </text>
        </>
      )}
    </svg>
  );
};

// ── Stacked Bar Chart for Long/Short ratio ──
const LongShortBars: React.FC<{ data: Array<{ longs: number; shorts: number }> }> = ({ data }) => {
  if (!data || data.length < 2) return <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 11 }}>Collecting...</div>;
  const w = 300, h = 60;
  const barW = Math.max(2, Math.min(8, w / data.length - 1));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h }}>
      {data.map((d, i) => {
        const total = d.longs + d.shorts || 1;
        const longPct = d.longs / total;
        const x = (i / (data.length - 1)) * (w - barW);
        return (
          <g key={i}>
            <rect x={x} y={0} width={barW} height={h * longPct} rx={1} fill="#22c55e" opacity="0.7" />
            <rect x={x} y={h * longPct} width={barW} height={h * (1 - longPct)} rx={1} fill="#ef4444" opacity="0.7" />
          </g>
        );
      })}
    </svg>
  );
};

// ── Main Component ──
const MarketOverviewPage: React.FC = () => {
  const { getCurrentAccount, isAuthenticated } = useContext(MultiWalletContext);
  const account = getCurrentAccount();
  const isConnected = !!account && isAuthenticated;

  const [data, setData] = useState<OverviewData | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filter, setFilter] = useState({ dir: 'All', status: 'All', type: 'All' });
  const [tab, setTab] = useState<'all' | 'watchlist'>('all');
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [tgCode, setTgCode] = useState('');
  const [tgLinkStatus, setTgLinkStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [tgLinkMsg, setTgLinkMsg] = useState('');

  const handleLinkTelegram = async () => {
    if (!tgCode.trim() || !isConnected) return;
    setTgLinkStatus('loading');
    try {
      const res = await api.post('/overview/link-telegram', { code: tgCode.trim(), walletAddress: account });
      if (res.data?.success) {
        setTgLinkStatus('success');
        setTgLinkMsg(res.data.data?.message || 'Linked successfully!');
        setTgCode('');
      } else {
        setTgLinkStatus('error');
        setTgLinkMsg(res.data?.error || 'Failed to link');
      }
    } catch (e: any) {
      setTgLinkStatus('error');
      setTgLinkMsg(e.response?.data?.error || 'Invalid or expired code');
    }
  };

  // 从服务器加载 watchlist（需要钱包连接）
  const loadWatchlist = useCallback(async () => {
    if (!isConnected || !account) return;
    try {
      const res = await api.get('/overview/watchlist', { params: { userId: account } });
      if (res.data?.success) {
        setWatchlist(new Set(res.data.data.map((w: any) => w.symbol)));
      }
    } catch (e) {}
  }, [isConnected, account]);

  useEffect(() => { loadWatchlist(); }, [loadWatchlist]);

  const toggleWatchlist = async (symbol: string) => {
    if (!isConnected) {
      // 跳转登录页
      window.location.hash = '#/login';
      return;
    }
    const isAdding = !watchlist.has(symbol);
    // 乐观更新 UI
    setWatchlist(prev => {
      const next = new Set(prev);
      if (isAdding) next.add(symbol); else next.delete(symbol);
      return next;
    });
    // 同步到服务器
    try {
      if (isAdding) {
        await api.post('/overview/watchlist/add', { symbols: [symbol], userId: account });
      } else {
        await api.post('/overview/watchlist/remove', { symbol, userId: account });
      }
    } catch (e) {
      // 回滚
      setWatchlist(prev => {
        const next = new Set(prev);
        if (isAdding) next.delete(symbol); else next.add(symbol);
        return next;
      });
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await getMarketOverview();
      if (res?.success && res.data) {
        setData(res.data);
        setFeed(res.data.events || []);
        // 缓存到 sessionStorage
        try { sessionStorage.setItem('mo_cache', JSON.stringify(res.data)); } catch {}
      }
    } catch (e) { console.error('[MarketOverview] fetch error:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // 先读缓存，立即显示
    try {
      const cached = sessionStorage.getItem('mo_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        setData(parsed);
        setFeed(parsed.events || []);
        setLoading(false);
      }
    } catch {}
    // 后台刷新最新数据
    fetchData();
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (loading) return <div className="mo-page"><div className="mo-loading"><div className="mo-spinner" />Loading market data...</div></div>;
  if (!data) return <div className="mo-page"><div className="mo-loading">Failed to load data</div></div>;

  const { environment, aiToday, signals, sectors, stress, statusCounts } = data;

  // Filter signals
  const filtered = signals.filter(s => {
    if (tab === 'watchlist' && !watchlist.has(s.symbol)) return false;
    if (filter.dir !== 'All' && s.direction !== filter.dir.toUpperCase()) return false;
    if (filter.status !== 'All' && s.status !== filter.status.toUpperCase()) return false;
    return true;
  });

  const toggleExpand = (sym: string) => setExpandedRow(expandedRow === sym ? null : sym);

  return (
    <div className="mo-page">

      {/* Header */}
      <div className="mo-title-card">
        <div className="mo-title-left">
          <h1><span>AI</span> Market Overview</h1>
          <p>Real-time AI signal analysis across crypto & RWA markets</p>
        </div>
        <div className="mo-title-right">
          <div className="mo-live">Live</div>
          <div className="mo-tabs">
            <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All Signals</button>
            <button className={tab === 'watchlist' ? 'on' : ''} onClick={() => setTab('watchlist')}>My Watchlist{watchlist.size > 0 ? ` (${watchlist.size})` : ''}</button>
          </div>
        </div>
      </div>

      {/* Top: Charts + Metrics */}
      <div className="mo-top">
        <div className="mo-hero">
          <div className="mo-hero-top">
            <div>
              <div className="mo-hero-label">BTC Market State</div>
              <div className="mo-hero-val">
                <span className={environment.btcTrend === 'BULL' || environment.btcTrend === 'NEUTRAL' ? 'mo-g' : 'mo-r'}>
                  {environment.btcTrend}
                </span>
                {environment.btcTrend === 'BULL' ? ' ↗' : environment.btcTrend === 'BEAR' ? ' ↘' : ''}
              </div>
              <div className="mo-hero-sub">
                {environment.btcPrice ? `$${fmtPrice(environment.btcPrice)}` : ''} · Regime: <b>{environment.regime?.regime || 'N/A'}</b>
              </div>
            </div>
          </div>

          {/* 3 Sub-Charts */}
          <div className="mo-charts-grid">
            <div className="mo-chart-block">
              <div className="mo-chart-label-row">
                <span className="mo-chart-label-text">Market Sentiment</span>
                <span className="mo-chart-label-hint">AI scans ~50 tokens every 5 min and scores each one. This is the average score across all tokens.</span>
              </div>
              {(() => {
                const avg = data.marketTimeline?.length ? data.marketTimeline[data.marketTimeline.length - 1].avg : 0;
                const label = avg >= 5 ? 'Strong Bullish' : avg >= 2 ? 'Bullish' : avg >= 0.5 ? 'Slightly Bullish' : avg > -0.5 ? 'Neutral' : avg > -2 ? 'Slightly Bearish' : avg > -5 ? 'Bearish' : 'Strong Bearish';
                const color = avg >= 2 ? '#22c55e' : avg >= 0.5 ? '#4f7df9' : avg > -0.5 ? '#94a3b8' : avg > -2 ? '#f59e0b' : '#ef4444';
                return (
                  <div className="mo-chart-val-row" style={{ gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color }}>{avg > 0 ? '+' : ''}{avg.toFixed(1)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}15`, padding: '2px 8px', borderRadius: 6 }}>{label}</span>
                  </div>
                );
              })()}
              <MiniChart data={(data.marketTimeline || []).map(t => t.avg)} color="#4f7df9" h={55} />
              <div style={{ fontSize: 9, color: '#c0c7d0', marginTop: 4, lineHeight: 1.4 }}>
                Score range: -15 (extreme bearish) to +15 (extreme bullish). 0 = neutral.
              </div>
            </div>

            <div className="mo-chart-block">
              <div className="mo-chart-label-row">
                <span className="mo-chart-label-text">Long / Short Ratio</span>
                <span className="mo-chart-label-hint">Green = LONG signals, Red = SHORT signals over time.</span>
              </div>
              <div className="mo-chart-val-row">
                <span className="mo-g">{data.marketTimeline?.length ? data.marketTimeline[data.marketTimeline.length - 1].longs : 0}L</span>
                <span style={{ color: '#94a3b8', margin: '0 4px' }}>/</span>
                <span className="mo-r">{data.marketTimeline?.length ? data.marketTimeline[data.marketTimeline.length - 1].shorts : 0}S</span>
              </div>
              <LongShortBars data={(data.marketTimeline || []).map(t => ({ longs: t.longs, shorts: t.shorts }))} />
            </div>

            <div className="mo-chart-block">
              <div className="mo-chart-label-row">
                <span className="mo-chart-label-text">Signal Count</span>
                <span className="mo-chart-label-hint">Total active tokens being analyzed per scan cycle.</span>
              </div>
              <div className="mo-chart-val-row">
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16 }}>{data.marketTimeline?.length ? data.marketTimeline[data.marketTimeline.length - 1].total : 0}</span>
              </div>
              <MiniChart data={(data.marketTimeline || []).map(t => t.total)} color="#8b5cf6" h={55} />
            </div>
          </div>
        </div>

        <div className="mo-metrics">
          <div className="mo-mcard accent">
            <div className="mo-mcard-top">
              <div className="mo-mcard-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
              </div>
              {aiToday.winRate > 0 && <div className="mo-mcard-badge up">↑ {aiToday.winRate}%</div>}
            </div>
            <div className="mo-mcard-val">{aiToday.wins}W / {aiToday.losses}L</div>
            <div className="mo-mcard-label">AI Win Rate Today</div>
          </div>
          <div className="mo-mcard">
            <div className="mo-mcard-top">
              <div className="mo-mcard-icon green">
                <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
              </div>
            </div>
            <div className="mo-mcard-val" style={{ color: aiToday.pnl >= 0 ? '#22c55e' : '#ef4444' }}>{fmtUsd(aiToday.pnl)}</div>
            <div className="mo-mcard-label">AI PnL Today</div>
          </div>
          <div className="mo-mcard">
            <div className="mo-mcard-top">
              <div className="mo-mcard-icon purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </div>
            </div>
            <div className="mo-mcard-val">{signals.length}</div>
            <div className="mo-mcard-label">Active Signals</div>
          </div>
          <div className="mo-mcard">
            <div className="mo-mcard-top">
              <div className="mo-mcard-icon amber">
                <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              </div>
            </div>
            <div className="mo-mcard-val">{statusCounts.ENTRY || 0}</div>
            <div className="mo-mcard-label">Entry Ready</div>
          </div>
        </div>
      </div>

      {/* Context Row */}
      <div className="mo-ctx">
        <div className="mo-ctx-card">
          <div className="mo-ctx-title">Sector Heatmap</div>
          {Object.entries(sectors).map(([name, s]) => (
            <div className="mo-ctx-row" key={name}>
              <span className="label">{name}</span>
              <span className={`val ${s.avgChange >= 0 ? 'mo-g' : 'mo-r'}`}>{fmtPct(s.avgChange)}</span>
            </div>
          ))}
          <div className="mo-ctx-src">Binance + HL · {data.updatedAt ? timeAgo(data.updatedAt) : ''}</div>
        </div>
        <div className="mo-ctx-card">
          <div className="mo-ctx-title">On-chain Stress</div>
          <div className="mo-ctx-row"><span className="label">Avg Funding Rate</span><span className={`val ${(stress.avgFunding || 0) >= 0 ? 'mo-g' : 'mo-r'}`}>{stress.avgFunding !== null ? `${stress.avgFunding}%` : 'N/A'}</span></div>
          <div className="mo-ctx-row"><span className="label">Taker Buy/Sell</span><span className={`val ${(stress.avgTaker || 1) >= 1 ? 'mo-g' : 'mo-r'}`}>{stress.avgTaker || 'N/A'}</span></div>
          <div className="mo-ctx-row"><span className="label">Long Signals</span><span className="val mo-g">{signals.filter(s => s.direction === 'LONG').length}</span></div>
          <div className="mo-ctx-row"><span className="label">Short Signals</span><span className="val mo-r">{signals.filter(s => s.direction === 'SHORT').length}</span></div>
        </div>
        <div className="mo-ctx-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="mo-ctx-title">What Changed</div>
          <div className="mo-chg-scroll">
            {feed.length > 0 ? feed.slice(0, 10).map((e, i) => (
              <div className="mo-chg" key={i}>
                <span className="mo-chg-dot" style={{ background: e.event_type === 'SIGNAL_BLOCKED' ? '#ef4444' : e.event_type === 'DIRECTION_FLIP' ? '#f59e0b' : '#22c55e' }} />
                <span>{e.event_detail}</span>
                <span style={{ fontSize: 10, color: '#c0c7d0', marginLeft: 'auto', flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>{timeHHMM(e.created_at)}</span>
              </div>
            )) : <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>No changes yet — collecting data...</div>}
          </div>
        </div>
      </div>

      {/* Stress Banner */}
      {(() => {
        const avgFR = stress.avgFunding ? Math.abs(parseFloat(String(stress.avgFunding))) : 0;
        const longCount = signals.filter(s => s.direction === 'LONG').length;
        const shortCount = signals.filter(s => s.direction === 'SHORT').length;
        const imbalance = signals.length > 0 ? Math.abs(longCount - shortCount) / signals.length : 0;

        let level: 'low' | 'medium' | 'high' = 'low';
        let msg = 'Normal trading conditions. No abnormal pressure detected.';

        if (avgFR > 0.05 || imbalance > 0.7) {
          level = 'high';
          msg = avgFR > 0.05
            ? `Extreme funding rate (${stress.avgFunding}%). Crowded trades detected — risk of liquidation cascade.`
            : `Extreme signal imbalance (${longCount}L/${shortCount}S). One-sided market — elevated reversal risk.`;
        } else if (avgFR > 0.02 || imbalance > 0.5) {
          level = 'medium';
          msg = avgFR > 0.02
            ? `Funding rate rising (${stress.avgFunding}%). Market getting crowded — monitor for reversals.`
            : `Signal imbalance (${longCount}L/${shortCount}S). Market leaning one direction — stay cautious.`;
        }

        const colors = { low: { bg: 'rgba(34,197,94,0.05)', border: 'rgba(34,197,94,0.15)', text: '#166534', dot: '#22c55e' }, medium: { bg: 'rgba(245,158,11,0.05)', border: 'rgba(245,158,11,0.15)', text: '#92400e', dot: '#f59e0b' }, high: { bg: 'rgba(239,68,68,0.05)', border: 'rgba(239,68,68,0.15)', text: '#991b1b', dot: '#ef4444' } };
        const c = colors[level];

        return (
          <div style={{ borderRadius: 14, padding: '14px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 13, fontWeight: 500 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
            <span><b>Market Stress: {level.charAt(0).toUpperCase() + level.slice(1)}</b> — {msg}</span>
          </div>
        );
      })()}

      {/* Main: Table + Feed */}
      <div className="mo-main">
        <div className="mo-tbl-card">
          <div className="mo-tbl-hdr">
            <div><div className="mo-tbl-title">Signal Ranking</div><div className="mo-tbl-sub">Click any token for full AI analysis</div></div>
          </div>
          <div className="mo-filters">
            <div className="mo-fgrp">
              {['All', 'Long', 'Short'].map(v => (
                <button key={v} className={filter.dir === v ? 'on' : ''} onClick={() => setFilter(f => ({ ...f, dir: v }))}>{v}</button>
              ))}
            </div>
            <div className="mo-fgrp">
              {['All', 'Entry', 'Ready', 'Watch'].map(v => (
                <button key={v} className={filter.status === v ? 'on' : ''} onClick={() => setFilter(f => ({ ...f, status: v }))}>{v}</button>
              ))}
            </div>
          </div>

          {/* Watchlist TG binding guide */}
          {tab === 'watchlist' && watchlist.size > 0 && (
            <div className="mo-tg-guide">
              <div className="mo-tg-guide-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f7df9" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </div>
              <div className="mo-tg-guide-content">
                <div className="mo-tg-guide-text">
                  <b>Get alerts on Telegram</b>
                  <br />1. Open <a href="https://t.me/Galeon_signal_bot" target="_blank" rel="noreferrer">@Galeon_signal_bot</a> and send <code>/create</code> to get your link code
                  <br />2. Enter the code below to connect:
                </div>
                <div className="mo-tg-input-row">
                  <input
                    className="mo-tg-input"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={tgCode}
                    onChange={(e) => setTgCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    onKeyDown={(e) => e.key === 'Enter' && handleLinkTelegram()}
                  />
                  <button
                    className="mo-tg-btn"
                    onClick={handleLinkTelegram}
                    disabled={tgLinkStatus === 'loading' || tgCode.length < 4}
                  >
                    {tgLinkStatus === 'loading' ? 'Linking...' : 'Link'}
                  </button>
                </div>
                {tgLinkStatus === 'success' && <div className="mo-tg-msg success">{tgLinkMsg}</div>}
                {tgLinkStatus === 'error' && <div className="mo-tg-msg error">{tgLinkMsg}</div>}
              </div>
            </div>
          )}
          {tab === 'watchlist' && watchlist.size === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>☆</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No tokens in your watchlist</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Click the star icon on any token to add it here</div>
            </div>
          )}

          <table className="mo-table" style={tab === 'watchlist' && watchlist.size === 0 ? { display: 'none' } : {}}>
            <thead><tr>
              <th style={{ width: 20 }}>#</th><th>Token</th><th>Status</th><th>Signal</th>
              <th className="r">Score</th><th className="c">Trend</th><th>Levels</th><th className="c">R:R</th>
              <th style={{ width: 32 }}></th>
            </tr></thead>
            <tbody>
              {filtered.map((s, idx) => {
                const sym = s.symbol.replace('USDT', '');
                const scoreColor = s.total_score > 0 ? 'mo-g' : s.total_score < 0 ? 'mo-r' : 'mo-n';
                const sparkColor = s.total_score > 0 ? '#22c55e' : s.total_score < 0 ? '#ef4444' : '#94a3b8';
                const tpPct = s.tp_price && s.price ? ((s.tp_price - s.price) / s.price * 100) : null;
                const slPct = s.sl_price && s.price ? ((s.price - s.sl_price) / s.price * 100) : null;

                return (
                  <React.Fragment key={s.symbol}>
                    <tr onClick={() => toggleExpand(s.symbol)}>
                      <td style={{ color: '#94a3b8', fontWeight: 700, fontSize: 12 }}>{idx + 1}</td>
                      <td>
                        <div className="mo-tk">
                          <div className="mo-tk-av" style={{ background: getTokenBg(s.symbol) }}>{sym[0]}</div>
                          <div>
                            <div className="mo-tk-name">{sym}</div>
                            <div className="mo-tk-row2">
                              <span className="mo-tk-price">${fmtPrice(s.price)}</span>
                              {s.price_chg_24h != null && <span className={`mo-tk-chg ${s.price_chg_24h >= 0 ? 'mo-g' : 'mo-r'}`}>{fmtPct(s.price_chg_24h)}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`mo-st ${s.status?.toLowerCase() || 'watch'}`}>
                          <span className="mo-st-dot" />
                          {s.status || 'Watch'}
                        </span>
                      </td>
                      <td>
                        <span className={`mo-sig ${s.direction === 'LONG' ? 'long' : s.direction === 'SHORT' ? 'short' : 'wait'}`}>
                          {s.direction || 'WAIT'}
                        </span>
                      </td>
                      <td className="mo-sc">
                        <div className={`mo-sc-big ${scoreColor}`}>{s.total_score > 0 ? '+' : ''}{s.total_score}</div>
                        {s.hist_win_rate != null && <div className="mo-sc-wr">WR <b>{s.hist_win_rate}%</b></div>}
                      </td>
                      <td className="mo-spark">
                        <Sparkline data={s.sparkline || []} color={sparkColor} />
                      </td>
                      <td>
                        {s.tp_price && s.sl_price ? (
                          <div className="mo-tgt">
                            <div className="mo-tgt-row"><span className="mo-tgt-lbl tp">TP</span><span className="mo-tgt-val">{fmtPrice(s.tp_price)}</span>{tpPct && <span className="mo-tgt-pct">+{tpPct.toFixed(1)}%</span>}</div>
                            <div className="mo-tgt-row"><span className="mo-tgt-lbl sl">SL</span><span className="mo-tgt-val">{fmtPrice(s.sl_price)}</span>{slPct && <span className="mo-tgt-pct">-{slPct.toFixed(1)}%</span>}</div>
                          </div>
                        ) : (
                          <div className="mo-tgt-na">Signal weak</div>
                        )}
                      </td>
                      <td>
                        {s.rr_ratio ? (
                          <div className={`mo-rr ${s.rr_ratio >= 1.5 ? 'good' : 'ok'}`}>
                            <div className="mo-rr-val">1:{s.rr_ratio.toFixed(1)}</div>
                            <div className="mo-rr-bar"><div className="mo-rr-fill" /></div>
                          </div>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td><button className={`mo-star ${watchlist.has(s.symbol) ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleWatchlist(s.symbol); }}>{watchlist.has(s.symbol) ? '★' : '☆'}</button></td>
                    </tr>

                    {expandedRow === s.symbol && (
                      <tr><td colSpan={9} style={{ padding: '6px 12px 20px' }}>
                        <ExpandedReport signal={s} />
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Feed */}
        <div className="mo-feed-card">
          <div className="mo-feed-hdr">
            <div className="mo-feed-title">Signal Feed</div>
            <div className="mo-feed-live">Live</div>
          </div>
          <div className="mo-feed-list">
            {feed.map((e, i) => (
              <div className="mo-fi" key={i}>
                <div className={`mo-fi-dot ${eventDotColor[e.event_type] || 'blue'}`} />
                <div className="mo-fi-body">
                  <div className="mo-fi-top">
                    <span className="mo-fi-title">{e.event_detail}</span>
                    <span className="mo-fi-time">{timeHHMM(e.created_at)}</span>
                  </div>
                  <span className={`mo-fi-tag ${eventTagClass[e.event_type] || 'info'}`}>
                    {eventTagLabel[e.event_type] || e.event_type}
                  </span>
                </div>
              </div>
            ))}
            {feed.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 40 }}>No recent events</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Expanded Report ──
const ExpandedReport: React.FC<{ signal: Signal }> = ({ signal: s }) => {
  const votes: Array<{ d: string; s: number; r: string }> = [];
  try { if (s.votes_json) { const parsed = JSON.parse(s.votes_json); if (Array.isArray(parsed)) votes.push(...parsed); } } catch (e) {}

  // Dimension name mapping for display
  const dimLabel: Record<string, string> = {
    'SM': 'Smart Money', 'SM变化': 'SM Change', 'BS': 'Buy/Sell', 'BS变化': 'BS Change',
    'OI': 'Open Interest', 'OI变化': 'OI Change', 'FR': 'Funding Rate', 'FR变化': 'FR Change',
    'Taker': 'Taker', 'Taker变化': 'Taker Change', 'Taker趋势': 'Taker Trend',
    'TT': 'Top Traders', '散户': 'Retail', '散户变化': 'Retail Change',
    '大户': 'Whales', '大户变化': 'Whale Change', '大户趋势': 'Whale Trend',
    'K线': 'K-line', 'K线变化': 'K-line Change', 'EMA': 'EMA', '9EMA': '9EMA',
    'BTC': 'BTC', 'BTC连阳': 'BTC Rally', 'BTC趋势': 'BTC Trend',
    '位置': 'Position', '趋势': 'Trend', '7日趋势': '7D Trend',
    'Social热度': 'Social', 'Surge': 'Volume Surge', 'K形态': 'K Pattern',
    '动能加速': 'Momentum', 'MACD': 'MACD', '1h趋势': '1H Trend',
    '关键价位': 'Key Level', '量价背离': 'Divergence', 'RegimeMap': 'Regime',
    '成交额': 'Volume', '反转': 'Reversal', 'COMBO': 'Combo Signal',
    'SLOW_BLEED': 'Slow Bleed', 'RANGE_block': 'Range Block', 'MA横盘': 'MA Sideways',
    'K趋势': 'K Trend', 'FR趋势': 'FR Trend', '历史交易': 'History',
    '双拥挤': 'Double Crowded', 'BTC_CAUTION': 'BTC Caution',
  };

  const bullCase = votes.filter(v => v.s > 0).sort((a, b) => b.s - a.s).slice(0, 5);
  const bearCase = votes.filter(v => v.s < 0).sort((a, b) => a.s - b.s).slice(0, 5);
  // Extract key numbers from Chinese reason for English display
  const extractInfo = (reason: string): string => {
    // Extract numbers/percentages in parentheses
    const nums = reason.match(/[\d.]+[%x]?/g) || [];
    const hasBull = reason.includes('BULL') || reason.includes('多') || reason.includes('涨') || reason.includes('买');
    const hasBear = reason.includes('BEAR') || reason.includes('空') || reason.includes('跌') || reason.includes('卖');
    if (nums.length > 0) return nums.join(', ');
    if (hasBull) return 'bullish';
    if (hasBear) return 'bearish';
    return '';
  };

  const fmtVote = (v: { d: string; s: number; r: string }) => {
    const label = dimLabel[v.d] || v.d;
    const info = extractInfo(v.r);
    return `${label} (${v.s > 0 ? '+' : ''}${v.s})${info ? ' — ' + info : ''}`;
  };

  const upside = s.tp_price && s.price ? ((s.tp_price - s.price) / s.price * 100) : null;
  const downside = s.sl_price && s.price ? ((s.price - s.sl_price) / s.price * 100) : null;

  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: '28px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{s.symbol.replace('USDT', '')} — Full Analysis</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#94a3b8' }}>
          <span>{new Date(s.scanned_at).toLocaleTimeString().slice(0, 5)} UTC</span>
          <span>Binance + HL</span>
        </div>
      </div>

      {/* 4 Dimension Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { name: 'Price Structure', score: s.price_structure_score, rows: [['4H K-line', s.market_direction || 'N/A'], ['Strength', `${s.market_strength}/3`], ['Support', s.support_price ? `$${fmtPrice(s.support_price)}` : 'N/A'], ['Resistance', s.resistance_price ? `$${fmtPrice(s.resistance_price)}` : 'N/A']] },
          { name: 'On-chain Flow', score: s.flow_score, rows: [['Smart Money', s.sm != null ? `${s.sm}` : 'N/A'], ['OI', s.oi != null ? `${s.oi}` : 'N/A'], ['Taker', s.taker != null ? `${s.taker}` : 'N/A'], ['Funding', s.fr != null ? `${(s.fr * 100).toFixed(3)}%` : 'N/A'], ['BS ratio', s.bs != null ? `${s.bs}` : 'N/A']] },
          { name: 'Sentiment', score: s.sentiment_score, rows: [['Whale L/S', s.tls != null ? `${s.tls}` : 'N/A'], ['Retail L/S', s.gls != null ? `${s.gls}` : 'N/A'], ['RSI', s.rsi != null ? `${s.rsi}` : 'N/A']] },
          { name: 'Environment', score: s.env_score, rows: [['BTC', s.btc_trend || 'N/A'], ['Pattern', s.pattern_name || 'None'], ['Outlook', s.pattern_outlook || 'N/A']] },
        ].map((dim, i) => (
          <div key={i} style={{ background: '#f8fafc', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.5px' }}>{dim.name}</span>
              <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: dim.score > 0 ? '#22c55e' : dim.score < 0 ? '#ef4444' : '#94a3b8' }}>{dim.score > 0 ? '+' : ''}{dim.score}</span>
            </div>
            {dim.rows.map(([k, v], j) => (
              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>{k}</span>
                <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Key Levels */}
      {(s.support_price || s.resistance_price) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {s.support_price && (
            <div style={{ background: '#f0fdf4', borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(34,197,94,0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 8 }}>Support Level</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: '#1e293b' }}>${fmtPrice(s.support_price)}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                Distance: <b>{s.price ? (((s.price - s.support_price) / s.support_price) * 100).toFixed(2) : 'N/A'}%</b>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Strength:</span>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
                  <div style={{ width: '80%', height: '100%', borderRadius: 2, background: '#22c55e' }} />
                </div>
              </div>
            </div>
          )}
          {s.resistance_price && (
            <div style={{ background: '#fef2f2', borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(239,68,68,0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 8 }}>Resistance Level</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: '#1e293b' }}>${fmtPrice(s.resistance_price)}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                Distance: <b>{s.price ? (((s.resistance_price - s.price) / s.price) * 100).toFixed(2) : 'N/A'}%</b>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Strength:</span>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
                  <div style={{ width: '65%', height: '100%', borderRadius: 2, background: '#ef4444' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bull/Bear Case */}
      {(bullCase.length > 0 || bearCase.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ borderRadius: 16, padding: '22px 24px', background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.1)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase' as const, marginBottom: 12 }}>Bull Case</div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {bullCase.map((v, i) => <li key={i} style={{ fontSize: 13, padding: '4px 0', lineHeight: 1.6, color: '#1e293b' }}>• {fmtVote(v)}</li>)}
            </ul>
          </div>
          <div style={{ borderRadius: 16, padding: '22px 24px', background: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.1)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#ef4444', textTransform: 'uppercase' as const, marginBottom: 12 }}>Counter-Argument</div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {bearCase.map((v, i) => <li key={i} style={{ fontSize: 13, padding: '4px 0', lineHeight: 1.6, color: '#1e293b' }}>• {fmtVote(v)}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Pattern + 2D Target */}
      {s.pattern_name && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', background: '#f8fafc', borderRadius: 16, padding: '20px 24px', marginBottom: 20, border: '1px solid rgba(0,0,0,0.04)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: s.pattern_outlook === 'Bullish' ? 'rgba(34,197,94,0.08)' : s.pattern_outlook === 'Bearish' ? 'rgba(239,68,68,0.08)' : 'rgba(148,163,184,0.08)', color: s.pattern_outlook === 'Bullish' ? '#22c55e' : s.pattern_outlook === 'Bearish' ? '#ef4444' : '#94a3b8' }}>{s.pattern_outlook || 'Neutral'}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{s.pattern_name}</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              {s.support_price && s.resistance_price ? (
                <>Range: ${fmtPrice(s.support_price)} — ${fmtPrice(s.resistance_price)}. <b>Invalidation:</b> Close below ${fmtPrice(s.support_price)}.</>
              ) : s.support_price ? (
                <>Support at ${fmtPrice(s.support_price)}. <b>Invalidation:</b> Break below this level.</>
              ) : null}
            </div>
          </div>
          {s.tp_price && s.price && (
            <div style={{ textAlign: 'right' as const, minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.5px' }}>2-Day Target</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 4, color: s.direction === 'LONG' ? '#22c55e' : '#ef4444' }}>
                ${fmtPrice(s.tp_price)}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' as const, marginTop: 4 }}>
                {s.pattern_name} measured move
              </div>
            </div>
          )}
        </div>
      )}

      {/* Risk Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { lbl: 'Upside', val: upside ? `+${upside.toFixed(1)}%` : 'N/A', color: '#22c55e' },
          { lbl: 'Downside', val: downside ? `-${downside.toFixed(1)}%` : 'N/A', color: '#ef4444' },
          { lbl: 'R:R', val: s.rr_ratio ? `1:${s.rr_ratio.toFixed(1)}` : 'N/A', color: s.rr_ratio && s.rr_ratio >= 1.5 ? '#22c55e' : '#f59e0b' },
          { lbl: 'Volatility', val: s.atr_pct ? (s.atr_pct > 5 ? 'High' : s.atr_pct > 2 ? 'Med' : 'Low') : 'N/A', color: '#1e293b' },
          { lbl: 'Pattern', val: s.pattern_name || 'None', color: '#1e293b' },
        ].map((r, i) => (
          <div key={i} style={{ background: '#f8fafc', borderRadius: 14, padding: 16, textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const }}>{r.lbl}</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 6, color: r.color }}>{r.val}</div>
          </div>
        ))}
      </div>

      {/* AI Conclusion */}
      {(() => {
        const absScore = Math.abs(s.total_score);
        const rr = s.rr_ratio || 0;
        const verdict = absScore >= 10 && rr >= 1.5 ? 'Worth pursuing' : absScore >= 6 ? 'Borderline — monitor closely' : 'Not recommended — signal too weak';
        const verdictColor = absScore >= 10 && rr >= 1.5 ? '#22c55e' : absScore >= 6 ? '#f59e0b' : '#ef4444';
        const topBear = bearCase.length > 0 ? fmtVote(bearCase[0]) : null;
        const waitEntry = s.support_price && s.price && s.direction === 'LONG'
          ? `Better entry on retest of $${fmtPrice(s.support_price)} (${(((s.price - s.support_price) / s.price) * 100).toFixed(1)}% below)`
          : s.resistance_price && s.price && s.direction === 'SHORT'
          ? `Better entry on retest of $${fmtPrice(s.resistance_price)} (${(((s.resistance_price - s.price) / s.price) * 100).toFixed(1)}% above)`
          : null;

        return (
          <div style={{ background: 'rgba(79,125,249,0.04)', borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(79,125,249,0.1)', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#4f7df9', textTransform: 'uppercase' as const, letterSpacing: '.4px', marginBottom: 14 }}>AI Conclusion</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0', fontSize: 14, lineHeight: 1.6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: verdictColor, flexShrink: 0, marginTop: 6 }} />
              <span><b style={{ color: verdictColor }}>{verdict}.</b> Score {s.total_score > 0 ? '+' : ''}{s.total_score}, R:R {rr ? `1:${rr.toFixed(1)}` : 'N/A'}, {s.direction || 'no direction'}.</span>
            </div>
            {topBear && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0', fontSize: 14, lineHeight: 1.6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0, marginTop: 6 }} />
                <span><b>Watch:</b> {topBear}</span>
              </div>
            )}
            {waitEntry && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0', fontSize: 14, lineHeight: 1.6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8', flexShrink: 0, marginTop: 6 }} />
                <span><b>Wait option:</b> {waitEntry}</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default MarketOverviewPage;

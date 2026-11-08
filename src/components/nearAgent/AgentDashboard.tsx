import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Tag, Typography, Space, Button, Modal, message, Tabs, Progress, Spin, Input, Form, Popconfirm, Tooltip, Alert, Steps, Badge, Switch, Select,
} from 'antd';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title as ChartTitle, Tooltip as ChartTooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  RobotOutlined, ThunderboltOutlined, SafetyOutlined, SyncOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ArrowUpOutlined, ArrowDownOutlined,
  ReloadOutlined, StopOutlined, RiseOutlined, FallOutlined,
  WarningOutlined, FundOutlined, DollarOutlined, ApiOutlined, DeleteOutlined, PlusOutlined,
  LinkOutlined, CodeOutlined, SafetyCertificateOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { useNearWallet } from '../../contexts/NearWalletContext';
import { AGENT_SERVICE_URL, USDC_ASSETS } from '../../config/near';
import { getIntentsBalance, getNearBalance } from '../../services/nearIntentsService';
import FundAccount from './FundAccount';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTitle, ChartTooltip, Legend, Filler);

const { Text } = Typography;

// ── Types ─────────────────────────────────────────────────────────────────────
interface BrainStatus { running: boolean; marketRegime: string; paused: boolean; activePositions: number; strategy: string; }
interface Performance { totalReturn: number; totalPnl: number; winRate: number; totalTrades: number; winCount: number; lossCount: number; maxDrawdown: number; daysRunning: number; dailyPnl: number; capital: number; }
interface RiskStatus { riskLevel: string; consecutiveLosses: number; maxDrawdown: number; paused: boolean; availableCapital: number; }
interface AgentState { hlBalance: number; hlAddress: string | null; strategy: string; }
interface Position { id: string; symbol: string; direction: string; entryPrice: number; pnl?: number; leverage: number; openTime: string; }
interface ExecutionRecord { id: string; timestamp: string; type: string; symbol: string; direction: string; amount: string; status: string; error?: string; pnl?: number; }
// HL mainnet types
interface HLPosition {
  position: {
    coin: string; szi: string; entryPx: string; positionValue: string;
    unrealizedPnl: string; returnOnEquity: string; leverage: { type: string; value: number };
    liquidationPx: string | null; marginUsed: string; maxLeverage: number;
  };
  type: string;
}
interface HLFill {
  coin: string; side: string; px: string; sz: string; time: number; fee: string;
  closedPnl: string; hash: string; dir: string; crossed: boolean; tid: number;
}
interface HLAccountState {
  positions: HLPosition[];
  accountValue: number;
  totalNtlPos: number;
  totalRawUsd: number;
  withdrawable: number;
}
interface BrainPosition {
  id: string; symbol: string; direction: string; leverage: number;
  entryPrice: number; markPrice: number; unrealizedPnlPct: number;
  confidence: number; entryScore: number; entryReason: string;
  marginUsed: number; stopLoss: number; remainingPct: number;
  enteredAt: string; isSpot: boolean;
}
interface ActivityItem { type: string; asset: string; message: string; timestamp: number; }
interface SignalSource {
  id: string; name: string; url: string; trustWeight: number;
  totalSignals: number; wonSignals: number; lostSignals: number; winRate: number | null;
  active: boolean; registeredAt: string; capabilities?: string[];
  trustState?: string; trustMultiplier?: number; anomalyScore?: number; anomalyCount?: number;
  suspensionReason?: string; topAnomalies?: { type: string; count: number }[];
}
interface RawSourceResult { sourceId: string; sourceName: string; trustWeight: number; signals: any[]; error?: string; latencyMs: number; }
interface FusionResultItem { symbol: string; direction: string | null; fusedScore: number; accepted: boolean; sources: string[]; bonuses: string[]; rejectionReason: string | null; signal: any; }
interface FusionLiveData { rawSignals: RawSourceResult[]; fusionResults: FusionResultItem[]; decisions?: MarketDecisionItem[]; timestamp: string; }
interface DecisionReasoningItem { step: string; source: string; detail: string; impact: number; }
interface AgentImpactItem { agentId: string; agentName: string; capability: string; impactType: string; reliabilityWeight: number; contribution: number; explanation: string; }
interface FusionAssessmentItem {
  marketBias: string; directionalConfidence: number | null; entryConfirmation: boolean; riskLevel: string;
  coreDirection: string; coreScore: number; fusedDirection: string; fusedScore: number; biasChanged: boolean;
  agentImpacts: AgentImpactItem[]; fusionExplanation: string;
}
interface MarketDecisionItem {
  symbol: string; action: string; score: number; label: string;
  fusion: FusionAssessmentItem;
  reasoning: DecisionReasoningItem[];
  entryPrice?: number; stopLoss?: number; takeProfit1?: number; takeProfit2?: number; leverage?: number;
  brainContributed: boolean; externalContributors: string[]; timestamp: string;
}
interface FusionLabelStat { label: string; count: number; pct: number; }
interface FusionSymbolPoint { timestamp: string; score: number; action: string; label: string; agentCount: number; }
interface FusionScoreTimeline {
  timestamp: string;
  scores: Record<string, number>;
  actions: Record<string, string>;
}
interface FusionHistoryData {
  totalSnapshots: number;
  labelDistribution: FusionLabelStat[];
  knownSymbols: string[];
  snapshots: { timestamp: string; decisions: MarketDecisionItem[] }[];
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.75)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 2px 20px rgba(0,0,0,0.05)',
};

const REGIME_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  UP:      { label: 'Trending Up',  color: '#52c41a', icon: <RiseOutlined /> },
  DOWN:    { label: 'Trending Down',color: '#ff4d4f', icon: <FallOutlined /> },
  NEUTRAL: { label: 'Neutral',      color: '#faad14', icon: <SyncOutlined /> },
  CAUTION: { label: 'Caution',      color: '#fa8c16', icon: <WarningOutlined /> },
  UNKNOWN: { label: 'Scanning…',   color: '#9ca3af', icon: <SyncOutlined spin /> },
};

// ── Main Component ────────────────────────────────────────────────────────────
const AgentDashboard: React.FC = () => {
  const { accountId, agentAuthorized, revokeAgent } = useNearWallet();
  const [brainStatus, setBrainStatus] = useState<BrainStatus | null>(null);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [intentsBalance, setIntentsBalance] = useState('0.00');
  const [nearBalance, setNearBalance] = useState<{ total: string; available: string } | null>(null);
  const [brainPositions, setBrainPositions] = useState<BrainPosition[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [sources, setSources] = useState<SignalSource[]>([]);
  const [fusionLive, setFusionLive] = useState<FusionLiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [fusionHistory, setFusionHistory] = useState<FusionHistoryData | null>(null);
  const [hlAccount, setHlAccount] = useState<HLAccountState | null>(null);
  const [hlFills, setHlFills] = useState<HLFill[]>([]);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    // Fetch data that doesn't require accountId
    await Promise.allSettled([
      fetch(`${AGENT_SERVICE_URL}/api/agent/brain-decisions`).then(r => r.json()).then(d => { setBrainPositions(d.positions || []); setActivities(d.activities || []); }).catch(() => {}),
      fetch(`${AGENT_SERVICE_URL}/api/agent/sources`).then(r => r.json()).then(d => d.success && setSources(d.sources || [])).catch(() => {}),
      fetch(`${AGENT_SERVICE_URL}/api/agent/fusion-live`).then(r => r.json()).then(d => d.success && setFusionLive(d)).catch(() => {}),
      fetch(`${AGENT_SERVICE_URL}/api/agent/fusion-history?limit=500`).then(r => r.json()).then(d => d.success && setFusionHistory(d)).catch(() => {}),
    ]);

    if (!accountId) { setLoading(false); setRefreshing(false); return; }

    // Fetch agent state first (for strategy, HL balance, etc.)
    const statusData = await fetch(`${AGENT_SERVICE_URL}/api/agent/status/${accountId}`)
      .then(r => r.json()).catch(() => null);
    if (statusData) setAgentState(statusData);

    await Promise.allSettled([
      fetch(`${AGENT_SERVICE_URL}/api/agent/brain-status?accountId=${accountId}`).then(r => r.json()).then(d => d.success && setBrainStatus(d)).catch(() => {}),
      fetch(`${AGENT_SERVICE_URL}/api/agent/performance?accountId=${accountId}`).then(r => r.json()).then(d => d.success && setPerformance(d)).catch(() => {}),
      fetch(`${AGENT_SERVICE_URL}/api/agent/risk-status?accountId=${accountId}`).then(r => r.json()).then(d => d.success && setRiskStatus(d)).catch(() => {}),
      fetch(`${AGENT_SERVICE_URL}/api/agent/positions/${accountId}`).then(r => r.json()).then(d => setPositions(d.positions || [])).catch(() => {}),
      fetch(`${AGENT_SERVICE_URL}/api/agent/executions/${accountId}?limit=20`).then(r => r.json()).then(d => setExecutions(d.executions || [])).catch(() => {}),
      fetch(`${AGENT_SERVICE_URL}/api/agent/hl-positions/${accountId}`).then(r => r.json()).then(d => setHlAccount(d)).catch(() => {}),
      fetch(`${AGENT_SERVICE_URL}/api/agent/hl-fills/${accountId}`).then(r => r.json()).then(d => setHlFills(d.fills || [])).catch(() => {}),
      Promise.allSettled(
        Object.values(USDC_ASSETS).map(a => getIntentsBalance(accountId, a.assetId).then(raw => {
          const dec = a.decimals || 6;
          return Number(raw) / Math.pow(10, dec);
        }).catch(() => 0))
      ).then(results => {
        const total = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
        setIntentsBalance(total.toFixed(2));
      }),
      getNearBalance(accountId).then(setNearBalance).catch(() => {}),
    ]);
    setLoading(false); setRefreshing(false);
  }, [accountId]);

  useEffect(() => { fetchAll(); const t = setInterval(() => fetchAll(true), 15000); return () => clearInterval(t); }, [fetchAll]);

  const handleRevoke = () => Modal.confirm({
    title: 'Stop Galeon Brain?',
    content: 'This removes the Function-Call Key from your NEAR account. Brain stops immediately. HL positions are unaffected.',
    okText: 'Stop Brain', okType: 'danger',
    onOk: async () => { try { await revokeAgent(); message.success('Brain stopped.'); } catch (e: any) { message.error(e.message); } },
  });

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <Spin size="large" />
      <div style={{ marginTop: 12, color: '#9ca3af', fontSize: 13 }}>Loading Brain status…</div>
    </div>
  );

  const regime = REGIME_CONFIG[brainStatus?.marketRegime || 'UNKNOWN'] ?? REGIME_CONFIG['UNKNOWN'];
  const isRunning = brainStatus?.running && !brainStatus?.paused;
  const riskColors: Record<string, string> = { LOW: '#52c41a', MEDIUM: '#faad14', HIGH: '#ff4d4f', UNKNOWN: '#9ca3af' };
  const rc = riskColors[riskStatus?.riskLevel || 'UNKNOWN'] ?? '#9ca3af';
  const pnlColor = (n: number) => n >= 0 ? '#52c41a' : '#ff4d4f';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Status bar ── */}
      <div style={{
        ...glass,
        padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Space size={20} wrap>
          <Space size={8}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isRunning ? '#52c41a' : '#faad14',
              boxShadow: isRunning ? '0 0 0 3px rgba(82,196,26,0.2)' : 'none',
            }} />
            <Text style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
              {isRunning ? 'Brain Running' : brainStatus?.paused ? 'Brain Paused' : 'Brain Stopped'}
            </Text>
          </Space>
          <Text style={{ fontSize: 12, color: '#9ca3af' }}>
            Strategy: <span style={{ color: '#374151', fontWeight: 500 }}>{agentState?.strategy || 'stable'}</span>
          </Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' }}>
            {accountId && accountId.length > 16
              ? `${accountId.slice(0, 8)}…${accountId.slice(-8)}`
              : accountId}
          </Text>
        </Space>
        <Space>
          <Button
            size="small" icon={<ApiOutlined />}
            onClick={() => setConnectModalOpen(true)}
            style={{ borderRadius: 8, fontSize: 12, borderColor: '#1677ff', color: '#1677ff' }}
          >
            Connect Agent
          </Button>
          <Button
            size="small" icon={<ReloadOutlined spin={refreshing} />}
            onClick={() => fetchAll(true)}
            style={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb', color: '#6b7280' }}
          >
            Refresh
          </Button>
          {agentAuthorized && (
            <Button size="small" danger icon={<StopOutlined />} onClick={handleRevoke} style={{ borderRadius: 8, fontSize: 12 }}>
              Stop
            </Button>
          )}
        </Space>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>

        {/* HL Balance — real mainnet account value */}
        <div style={{ ...glass, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>HL Account</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111', letterSpacing: -0.5 }}>
            ${(hlAccount?.accountValue || agentState?.hlBalance || 0).toFixed(2)}
          </div>
          <button
            onClick={() => setFundModalOpen(true)}
            style={{
              marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: '#1677ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <ArrowUpOutlined style={{ fontSize: 10 }} /> Add Funds
          </button>
        </div>

        {/* Wallet Balance — NEAR native + Intents USDC */}
        <div style={{ ...glass, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Wallet Balance</div>
          {nearBalance ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#111', letterSpacing: -0.5 }}>
                {nearBalance.available} <span style={{ fontSize: 13, fontWeight: 500, color: '#6b7280' }}>NEAR</span>
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                {parseFloat(intentsBalance) > 0
                  ? <span style={{ color: '#1677ff' }}>+ ${intentsBalance} USDC in Intents</span>
                  : 'No USDC deposited to Intents yet'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#111', letterSpacing: -0.5 }}>{intentsBalance}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>USDC in Intents</div>
            </>
          )}
        </div>

        {/* Open Positions — real HL positions */}
        <div style={{ ...glass, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Open Positions</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#111' }}>
            {hlAccount?.positions?.filter(p => parseFloat(p.position.szi) !== 0).length ?? brainStatus?.activePositions ?? 0}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>HL Mainnet</div>
        </div>

        {/* Return */}
        <div style={{ ...glass, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Total Return</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: pnlColor(performance?.totalReturn || 0), letterSpacing: -0.5 }}>
            {(performance?.totalReturn || 0) >= 0 ? '+' : ''}{(performance?.totalReturn || 0).toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{(performance?.winRate || 0).toFixed(1)}% win rate</div>
        </div>

        {/* Market Regime */}
        <div style={{ ...glass, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Market Regime</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: regime.color }}>
            {regime.icon} {regime.label}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            Risk: <span style={{ color: rc, fontWeight: 600 }}>{riskStatus?.riskLevel || '—'}</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ ...glass, padding: '4px 4px 0' }}>
        <Tabs
          defaultActiveKey="overview"
          style={{ padding: '0 16px' }}
          items={[
            {
              key: 'overview', label: 'Overview',
              children: <OverviewTab performance={performance} riskStatus={riskStatus} onAddFunds={() => setFundModalOpen(true)} />,
            },
            {
              key: 'decisions', label: `Brain Decisions (${brainPositions.length})`,
              children: <DecisionsTab positions={brainPositions} activities={activities} fusionLive={fusionLive} sources={sources} />,
            },
            {
              key: 'positions',
              label: `HL Positions (${hlAccount?.positions?.length || 0})`,
              children: <HLPositionsTab hlAccount={hlAccount} />,
            },
            {
              key: 'history',
              label: `Trade History (${hlFills.length})`,
              children: <HLFillsTab fills={hlFills} />,
            },
            {
              key: 'fusion-history',
              label: <span><FundOutlined /> Fusion History {fusionHistory ? `(${fusionHistory.totalSnapshots})` : ''}</span>,
              children: <FusionHistoryTab historyData={fusionHistory} sources={sources} />,
            },
            {
              key: 'agents', label: <span><ApiOutlined /> Agents ({sources.length})</span>,
              children: <SourcesTab sources={sources} fusionLive={fusionLive} onRefresh={() => fetchAll(true)} onConnectAgent={() => setConnectModalOpen(true)} />,
            },
            {
              key: 'on-chain',
              label: <span><SafetyOutlined /> On-Chain Trust</span>,
              children: <OnChainTrustTab />,
            },
          ]}
        />
      </div>

      {/* ── Fund Modal ── */}
      <Modal
        title={<Space><ThunderboltOutlined style={{ color: '#1677ff' }} /><span>Fund via NEAR Intents</span></Space>}
        open={fundModalOpen} onCancel={() => setFundModalOpen(false)} footer={null} width={600}
        styles={{ content: { borderRadius: 16 } }}
      >
        <div style={{ padding: '10px 14px', fontSize: 13, color: '#374151', marginBottom: 16, background: 'rgba(22,119,255,0.05)', borderRadius: 10, border: '1px solid rgba(22,119,255,0.12)' }}>
          NEAR Intents routes from any chain directly to your Hyperliquid account — no manual bridging.
        </div>
        <FundAccount accountId={accountId!} onFundComplete={() => { setFundModalOpen(false); fetchAll(true); message.success('Funds added!'); }} />
      </Modal>

      {/* ── Connect Agent Modal ── */}
      <Modal
        title={<Space><ApiOutlined style={{ color: '#1677ff' }} /><span>Connect External Agent</span></Space>}
        open={connectModalOpen} onCancel={() => setConnectModalOpen(false)} footer={null} width={720}
        styles={{ content: { borderRadius: 16 } }}
      >
        <ConnectAgentModal onRegistered={() => { setConnectModalOpen(false); fetchAll(true); }} onRefresh={() => fetchAll(true)} />
      </Modal>
    </div>
  );
};

// ── Overview Tab ──────────────────────────────────────────────────────────────
const OverviewTab: React.FC<{
  performance: Performance | null;
  riskStatus: RiskStatus | null;
  onAddFunds: () => void;
}> = ({ performance, riskStatus, onAddFunds }) => {
  const pnlColor = (n: number) => n >= 0 ? '#52c41a' : '#ff4d4f';

  return (
    <div style={{ padding: '16px 4px 20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

        {/* Performance panel */}
        <div style={{ background: '#fafafa', borderRadius: 12, padding: '20px 24px', border: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 20 }}>
            Brain Performance
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 20 }}>
            {[
              { label: 'Total Return', value: `${(performance?.totalReturn || 0) >= 0 ? '+' : ''}${(performance?.totalReturn || 0).toFixed(1)}%`, color: pnlColor(performance?.totalReturn || 0), large: true },
              { label: 'Win Rate', value: `${(performance?.winRate || 0).toFixed(1)}%`, color: '#1677ff', large: true },
              { label: 'Daily PnL', value: `$${(performance?.dailyPnl || 0).toFixed(0)}`, color: pnlColor(performance?.dailyPnl || 0), large: false },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: s.large ? 28 : 20, fontWeight: 800, color: s.color, letterSpacing: -0.5 }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total Trades', value: String(performance?.totalTrades || 0) },
              { label: 'Win / Loss', value: `${performance?.winCount || 0}W / ${performance?.lossCount || 0}L` },
              { label: 'Days Running', value: `${performance?.daysRunning || 0}d` },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 10, background: '#fff', border: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Max Drawdown</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{(performance?.maxDrawdown || 0).toFixed(1)}%</span>
            </div>
            <Progress
              percent={performance?.maxDrawdown || 0}
              strokeColor={(performance?.maxDrawdown || 0) > 30 ? '#ff4d4f' : (performance?.maxDrawdown || 0) > 15 ? '#faad14' : '#52c41a'}
              showInfo={false} strokeLinecap="round"
            />
          </div>
        </div>

        {/* Risk panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fafafa', borderRadius: 12, padding: '16px 18px', border: '1px solid #f0f0f0', flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
              Risk Controls
            </div>
            {[
              { label: 'Risk Level', value: <Tag color={riskStatus?.riskLevel === 'LOW' ? 'success' : riskStatus?.riskLevel === 'HIGH' ? 'error' : 'warning'} style={{ borderRadius: 6 }}>{riskStatus?.riskLevel || '—'}</Tag> },
              { label: 'Consec. Losses', value: <span style={{ fontWeight: 700, color: (riskStatus?.consecutiveLosses || 0) >= 3 ? '#ff4d4f' : '#111' }}>{riskStatus?.consecutiveLosses || 0}</span> },
              { label: 'Max Drawdown', value: <span style={{ fontWeight: 600, color: '#374151' }}>{(riskStatus?.maxDrawdown || 0).toFixed(1)}%</span> },
              { label: 'Brain State', value: <Tag color={riskStatus?.paused ? 'warning' : 'success'} style={{ borderRadius: 6 }}>{riskStatus?.paused ? 'Paused' : 'Trading'}</Tag> },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{r.label}</span>
                {r.value}
              </div>
            ))}
          </div>
          <Button
            type="primary" icon={<ArrowUpOutlined />} onClick={onAddFunds}
            style={{ borderRadius: 10, background: '#1677ff', border: 'none', height: 40 }}
            block
          >
            Add Funds via NEAR Intents
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Decisions Tab ─────────────────────────────────────────────────────────────
function parseEntryReason(reason: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!reason) return out;
  reason.split(' ').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k && v !== undefined) out[k] = v;
  });
  return out;
}

const SIGNAL_LABELS: Record<string, string> = {
  conf: 'Confidence', OI: 'Open Interest Δ', FR: 'Funding Rate',
  taker: 'Taker Ratio', tt: 'Tech Trend', RSI: 'RSI',
  BS: 'Buy/Sell', OI_stage: 'OI Stage',
};

const LABEL_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BRAIN_SOLO:           { label: 'Brain Solo',         color: '#722ed1', bg: 'rgba(114,46,209,0.04)', border: 'rgba(114,46,209,0.15)' },
  FUSION_CONFIRMED:     { label: 'Fusion Confirmed',   color: '#52c41a', bg: 'rgba(82,196,26,0.04)',  border: 'rgba(82,196,26,0.15)' },
  FUSION_STRENGTHENED:  { label: 'Fusion Strengthened', color: '#13c2c2', bg: 'rgba(19,194,194,0.04)', border: 'rgba(19,194,194,0.15)' },
  FUSION_CHALLENGED:    { label: 'Fusion Challenged',  color: '#fa8c16', bg: 'rgba(250,140,22,0.04)', border: 'rgba(250,140,22,0.15)' },
  FUSION_ADJUSTED:      { label: 'Fusion Adjusted',    color: '#1677ff', bg: 'rgba(22,119,255,0.04)', border: 'rgba(22,119,255,0.15)' },
  FUSION_EVALUATED:     { label: 'Fusion Evaluated',   color: '#9ca3af', bg: 'rgba(156,163,175,0.04)',border: 'rgba(156,163,175,0.15)' },
  SECURITY_REJECTION:   { label: 'Security Block',     color: '#ff4d4f', bg: 'rgba(255,77,79,0.04)',  border: 'rgba(255,77,79,0.15)' },
};

const DecisionsTab: React.FC<{
  positions: BrainPosition[]; activities: ActivityItem[];
  fusionLive: FusionLiveData | null; sources: SignalSource[];
}> = ({ positions, activities, fusionLive, sources }) => {
  const pnlColor = (n: number) => n >= 0 ? '#52c41a' : '#ff4d4f';
  const decisions = fusionLive?.decisions || [];

  // Categorize decisions
  const executing = decisions.filter(d => d.action === 'LONG' || d.action === 'SHORT');
  const waiting = decisions.filter(d => d.action === 'WAIT' && d.label !== 'SECURITY_REJECTION');
  const blocked = decisions.filter(d => d.label === 'SECURITY_REJECTION');

  // Scenario counts
  const scenarioCounts: Record<string, number> = {};
  for (const d of decisions) {
    scenarioCounts[d.label] = (scenarioCounts[d.label] || 0) + 1;
  }

  return (
    <div style={{ padding: '16px 4px 20px' }}>

      {/* ── Scenario Summary Bar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { key: 'BRAIN_SOLO', icon: <RobotOutlined />, label: 'Brain Solo' },
          { key: 'FUSION_CONFIRMED', icon: <CheckCircleOutlined />, label: 'Confirmed' },
          { key: 'FUSION_ADJUSTED', icon: <ThunderboltOutlined />, label: 'Adjusted' },
          { key: 'FUSION_CHALLENGED', icon: <WarningOutlined />, label: 'Challenged' },
          { key: 'SECURITY_REJECTION', icon: <SafetyOutlined />, label: 'Blocked' },
        ].map(s => {
          // Count both exact match and strengthened under confirmed
          const count = s.key === 'FUSION_CONFIRMED'
            ? (scenarioCounts['FUSION_CONFIRMED'] || 0) + (scenarioCounts['FUSION_STRENGTHENED'] || 0) + (scenarioCounts['FUSION_EVALUATED'] || 0)
            : scenarioCounts[s.key] || 0;
          const cfg = LABEL_CONFIG[s.key];
          return (
            <div key={s.key} style={{
              padding: '12px 14px', borderRadius: 10, textAlign: 'center',
              background: count > 0 ? cfg.bg : '#fafafa',
              border: `1px solid ${count > 0 ? cfg.border : '#f0f0f0'}`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: count > 0 ? cfg.color : '#d1d5db' }}>{count}</div>
              <div style={{ fontSize: 11, color: count > 0 ? cfg.color : '#9ca3af', marginTop: 2 }}>
                {s.icon} {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Unified Brain Decisions ── */}
      {decisions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <RobotOutlined style={{ fontSize: 36, color: '#d1d5db', display: 'block', marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>Brain is evaluating markets</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Unified decisions will appear here</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Executing decisions */}
          {executing.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#52c41a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Executing — {executing.length} decision(s)
              </div>
              {executing.map((dec, i) => <DecisionCard key={`exec-${i}`} decision={dec} sources={sources} />)}
            </>
          )}

          {/* Waiting decisions */}
          {waiting.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#faad14', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 }}>
                Evaluating — {waiting.length} market(s) not yet actionable
              </div>
              {waiting.map((dec, i) => <DecisionCard key={`wait-${i}`} decision={dec} sources={sources} />)}
            </>
          )}

          {/* Security blocked */}
          {blocked.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#ff4d4f', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 }}>
                <SafetyOutlined style={{ marginRight: 4 }} />Security Gate — {blocked.length} blocked
              </div>
              {blocked.map((dec, i) => <DecisionCard key={`block-${i}`} decision={dec} sources={sources} />)}
            </>
          )}

          {/* Active positions from Brain (existing) */}
          {positions.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 }}>
                Active Positions · {positions.length} open
              </div>
              {positions.map(pos => {
                const dims = parseEntryReason(pos.entryReason);
                const isLong = pos.direction === 'LONG';
                const pnl = pos.unrealizedPnlPct || 0;
                const confNum = parseFloat(dims.conf || '0');
                return (
                  <div key={pos.id} style={{ background: '#fafafa', borderRadius: 12, border: '1px solid #f0f0f0', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text strong style={{ fontSize: 14 }}>{pos.symbol.replace('USDT', '')}</Text>
                        <Tag color={isLong ? 'success' : 'error'} style={{ borderRadius: 6, fontSize: 11, margin: 0 }}>{pos.direction} {pos.leverage}x</Tag>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: pnlColor(pnl) }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%</div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280' }}>
                      <span>Entry <strong>${pos.entryPrice?.toFixed(2)}</strong></span>
                      <span>Mark <strong>${pos.markPrice?.toFixed(2)}</strong></span>
                      <span>SL <strong style={{ color: '#ff4d4f' }}>${pos.stopLoss?.toFixed(2)}</strong></span>
                      <span>Conf <strong style={{ color: confNum >= 60 ? '#52c41a' : '#faad14' }}>{confNum.toFixed(0)}%</strong></span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Activity feed (unchanged) */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Activity Feed</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activities.slice(0, 15).map((a, i) => {
              const isOpen = a.type === 'trade_open';
              const isExit = a.type.includes('exit');
              const dotColor = isOpen ? '#1677ff' : isExit ? '#52c41a' : '#faad14';
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4 }}>{a.message}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{new Date(a.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              );
            })}
            {activities.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', background: '#fafafa', borderRadius: 12, border: '1px solid #f0f0f0', color: '#9ca3af', fontSize: 12 }}>No recent activity</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Smart price formatter ────────────────────────────────────────────────────
function formatPrice(price: number): string {
  if (price === 0) return '$0';
  if (price < 0.001) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 100) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

// ── Impact type styling ──────────────────────────────────────────────────────
const IMPACT_STYLE: Record<string, { color: string; icon: string }> = {
  CONFIRM:             { color: '#52c41a', icon: '✓' },
  STRENGTHEN:          { color: '#13c2c2', icon: '↑' },
  WEAKEN:              { color: '#faad14', icon: '↓' },
  CHALLENGE:           { color: '#fa8c16', icon: '⚡' },
  SHIFT_BIAS:          { color: '#1677ff', icon: '⇄' },
  RISK_WARNING:        { color: '#ff4d4f', icon: '⚠' },
  NO_MATERIAL_IMPACT:  { color: '#9ca3af', icon: '—' },
  INVALID:             { color: '#d1d5db', icon: '✗' },
};

// ── Decision Card — Clean 4-stage layout ─────────────────────────────────────
const stageBox = (color: string, alpha = 0.04): React.CSSProperties => ({
  padding: '10px 14px', borderRadius: 10,
  background: `rgba(${color},${alpha})`,
  border: `1px solid rgba(${color},0.10)`,
});

const DecisionCard: React.FC<{ decision: MarketDecisionItem; sources: SignalSource[] }> = ({ decision: dec, sources }) => {
  const cfg = LABEL_CONFIG[dec.label] || LABEL_CONFIG['FUSION_EVALUATED'];
  const f = dec.fusion;
  const isExecuting = dec.action === 'LONG' || dec.action === 'SHORT';
  const hasExternal = f.agentImpacts.length > 0;
  const materialImpacts = f.agentImpacts.filter(i => i.impactType !== 'NO_MATERIAL_IMPACT' && i.impactType !== 'INVALID');

  return (
    <div style={{
      borderRadius: 14, background: '#fff',
      border: `1.5px solid ${cfg.border}`,
      boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>

      {/* ━━ Header bar ━━ */}
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: cfg.bg, borderBottom: `1px solid ${cfg.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{dec.symbol}</span>
          <Tag color={dec.action === 'LONG' ? 'success' : dec.action === 'SHORT' ? 'error' : 'default'}
            style={{ borderRadius: 6, fontSize: 11, margin: 0, fontWeight: 700 }}>{dec.action}</Tag>
          <Tag style={{ borderRadius: 6, fontSize: 10, margin: 0 }} color={cfg.color}>{cfg.label}</Tag>
        </div>
        <span style={{
          fontSize: 22, fontWeight: 800,
          color: dec.score >= 58 ? '#52c41a' : dec.score >= 35 ? '#faad14' : dec.score > 0 ? '#ff4d4f' : '#d1d5db',
        }}>{dec.score}<span style={{ fontSize: 11, fontWeight: 400, color: '#bbb' }}>/100</span></span>
      </div>

      {/* ━━ 4-stage content ━━ */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Stage 1 — Galeon Core */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(114,46,209,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <RobotOutlined style={{ fontSize: 13, color: '#722ed1' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#722ed1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Galeon Core</div>
            <div style={{ fontSize: 13, color: '#374151' }}>
              <strong style={{ color: f.coreDirection === 'NEUTRAL' ? '#9ca3af' : f.coreDirection === 'LONG' ? '#52c41a' : '#ff4d4f' }}>
                {f.coreDirection}
              </strong>
              <span style={{ marginLeft: 8, color: '#9ca3af' }}>score {f.coreScore}</span>
            </div>
          </div>
        </div>

        {/* Stage 2 — External Intelligence (only if material impacts exist) */}
        {hasExternal && (
          <div style={{ borderLeft: '2px solid rgba(22,119,255,0.15)', paddingLeft: 12, marginLeft: 13 }}>
            <div style={{ fontSize: 10, color: '#1677ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              External Intelligence
            </div>
            {f.agentImpacts.map((imp, i) => {
              const st = IMPACT_STYLE[imp.impactType] || IMPACT_STYLE['NO_MATERIAL_IMPACT'];
              if (imp.impactType === 'NO_MATERIAL_IMPACT') {
                return (
                  <div key={i} style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>
                    {imp.agentName}: {imp.explanation.length > 60 ? imp.explanation.slice(0, 60) + '...' : imp.explanation}
                  </div>
                );
              }
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <Tag color={st.color} style={{ borderRadius: 4, fontSize: 9, margin: 0, fontWeight: 700, padding: '0 6px', lineHeight: '18px' }}>
                    {imp.impactType.replace(/_/g, ' ')}
                  </Tag>
                  <span style={{ flex: 1, fontSize: 12, color: '#374151' }}>
                    <strong>{imp.agentName}</strong>
                  </span>
                  {imp.contribution !== 0 && (
                    <span style={{ fontSize: 13, fontWeight: 800, color: imp.contribution > 0 ? '#52c41a' : '#ff4d4f' }}>
                      {imp.contribution > 0 ? '+' : ''}{imp.contribution}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Stage 3 — Fusion Result (only if external intel changed something) */}
        {hasExternal && (f.biasChanged || f.fusedScore !== f.coreScore) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
            background: f.biasChanged ? 'rgba(22,119,255,0.04)' : 'rgba(82,196,26,0.03)',
          }}>
            <ThunderboltOutlined style={{ fontSize: 13, color: f.biasChanged ? '#1677ff' : '#52c41a' }} />
            <div style={{ flex: 1, fontSize: 12, color: '#374151' }}>
              {f.biasChanged && (
                <span style={{ color: '#1677ff', fontWeight: 600 }}>
                  {f.coreDirection} → <strong>{f.fusedDirection}</strong>
                </span>
              )}
              {f.biasChanged && f.fusedScore !== f.coreScore && <span style={{ margin: '0 6px', color: '#d1d5db' }}>·</span>}
              {f.fusedScore !== f.coreScore && (
                <span>
                  Score {f.coreScore} → <strong style={{ color: f.fusedScore > f.coreScore ? '#52c41a' : '#ff4d4f' }}>{f.fusedScore}</strong>
                  <span style={{ color: f.fusedScore > f.coreScore ? '#52c41a' : '#ff4d4f', marginLeft: 3, fontSize: 11 }}>
                    ({f.fusedScore > f.coreScore ? '+' : ''}{f.fusedScore - f.coreScore})
                  </span>
                </span>
              )}
              <span style={{ margin: '0 6px', color: '#d1d5db' }}>·</span>
              <Tag color={f.riskLevel === 'LOW' ? 'success' : f.riskLevel === 'HIGH' ? 'error' : 'warning'}
                style={{ borderRadius: 4, fontSize: 10, margin: 0, verticalAlign: 'middle' }}>{f.riskLevel}</Tag>
            </div>
          </div>
        )}

        {/* Fusion explanation (if any external participated) */}
        {hasExternal && materialImpacts.length > 0 && (
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4, marginLeft: 38 }}>
            {f.fusionExplanation}
          </div>
        )}

        {/* Stage 4 — Final Decision */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 8,
          background: isExecuting ? 'rgba(82,196,26,0.06)' : dec.label === 'SECURITY_REJECTION' ? 'rgba(255,77,79,0.04)' : '#fafafa',
          border: `1px solid ${isExecuting ? 'rgba(82,196,26,0.12)' : '#f0f0f0'}`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: isExecuting ? 'rgba(82,196,26,0.12)' : dec.label === 'SECURITY_REJECTION' ? 'rgba(255,77,79,0.08)' : '#f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isExecuting
              ? <CheckCircleOutlined style={{ fontSize: 13, color: '#52c41a' }} />
              : dec.label === 'SECURITY_REJECTION'
                ? <CloseCircleOutlined style={{ fontSize: 13, color: '#ff4d4f' }} />
                : <SafetyOutlined style={{ fontSize: 13, color: '#9ca3af' }} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: isExecuting ? '#52c41a' : '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Final Decision
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isExecuting ? '#52c41a' : '#374151' }}>
              {isExecuting ? `${dec.action} — Executing` : dec.action}
            </div>
          </div>
          {isExecuting && dec.entryPrice != null && dec.entryPrice > 0 && (
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#6b7280' }}>
              <span>Entry <strong style={{ color: '#111' }}>{formatPrice(dec.entryPrice)}</strong></span>
              {dec.stopLoss != null && dec.stopLoss > 0 && <span>SL <strong style={{ color: '#ff4d4f' }}>{formatPrice(dec.stopLoss)}</strong></span>}
              {dec.leverage != null && dec.leverage > 1 && <span><strong>{dec.leverage}x</strong></span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Positions Tab ─────────────────────────────────────────────────────────────
// ── HL Positions Tab (mainnet live data) ─────────────────────────────────────
const HLPositionsTab: React.FC<{ hlAccount: HLAccountState | null }> = ({ hlAccount }) => {
  const hlPositions = (hlAccount?.positions || []).filter(
    p => parseFloat(p.position.szi) !== 0
  );
  const pnlColor = (n: number) => n >= 0 ? '#52c41a' : '#ff4d4f';

  return (
    <div style={{ padding: '12px 4px 20px' }}>
      {/* Account summary bar */}
      {hlAccount && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Account Value</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginTop: 4 }}>${hlAccount.accountValue.toFixed(2)}</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Position</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginTop: 4 }}>${Math.abs(hlAccount.totalNtlPos).toFixed(2)}</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Free Balance</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginTop: 4 }}>${hlAccount.withdrawable.toFixed(2)}</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Open Positions</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginTop: 4 }}>{hlPositions.length}</div>
          </div>
        </div>
      )}

      {hlPositions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <RobotOutlined style={{ fontSize: 36, color: '#d1d5db', display: 'block', marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>No open positions on Hyperliquid</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            {hlAccount?.accountValue ? `Account value: $${hlAccount.accountValue.toFixed(2)}` : 'Connect HL address to see live positions'}
          </div>
        </div>
      ) : (
        <Table
          dataSource={hlPositions.map((p, i) => ({ ...p, key: i }))}
          size="small"
          pagination={false}
          style={{ padding: '0 4px' }}
          columns={[
            {
              title: 'Coin', key: 'coin', width: 80,
              render: (_: any, row: HLPosition) => <Text strong style={{ fontSize: 13 }}>{row.position.coin}</Text>,
            },
            {
              title: 'Side', key: 'side', width: 70,
              render: (_: any, row: HLPosition) => {
                const isLong = parseFloat(row.position.szi) > 0;
                return <Tag color={isLong ? 'success' : 'error'} style={{ borderRadius: 6 }}>{isLong ? 'LONG' : 'SHORT'}</Tag>;
              },
            },
            {
              title: 'Size', key: 'size', width: 100,
              render: (_: any, row: HLPosition) => {
                const sz = Math.abs(parseFloat(row.position.szi));
                return <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{sz.toFixed(4)}</span>;
              },
            },
            {
              title: 'Entry Price', key: 'entry', width: 100,
              render: (_: any, row: HLPosition) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>${parseFloat(row.position.entryPx).toLocaleString()}</span>,
            },
            {
              title: 'Value', key: 'value', width: 100,
              render: (_: any, row: HLPosition) => <span style={{ fontSize: 12 }}>${parseFloat(row.position.positionValue).toFixed(2)}</span>,
            },
            {
              title: 'Leverage', key: 'lev', width: 70,
              render: (_: any, row: HLPosition) => <span style={{ fontSize: 12, fontWeight: 600 }}>{row.position.leverage.value}x</span>,
            },
            {
              title: 'uPnL', key: 'pnl', width: 100,
              render: (_: any, row: HLPosition) => {
                const pnl = parseFloat(row.position.unrealizedPnl);
                const roe = parseFloat(row.position.returnOnEquity) * 100;
                return (
                  <div>
                    <div style={{ fontWeight: 700, color: pnlColor(pnl), fontSize: 12 }}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, color: pnlColor(roe) }}>
                      {roe >= 0 ? '+' : ''}{roe.toFixed(1)}%
                    </div>
                  </div>
                );
              },
            },
            {
              title: 'Liq. Price', key: 'liq', width: 100,
              render: (_: any, row: HLPosition) => {
                const liq = row.position.liquidationPx;
                return liq ? <span style={{ fontSize: 11, color: '#ff4d4f', fontFamily: 'monospace' }}>${parseFloat(liq).toLocaleString()}</span> : '—';
              },
            },
          ]}
        />
      )}
    </div>
  );
};

// ── HL Fills Tab (mainnet trade history) ────────────────────────────────────
const HLFillsTab: React.FC<{ fills: HLFill[] }> = ({ fills }) => {
  // Aggregate stats
  const closedPnls = fills.filter(f => parseFloat(f.closedPnl) !== 0);
  const totalPnl = closedPnls.reduce((sum, f) => sum + parseFloat(f.closedPnl), 0);
  const wins = closedPnls.filter(f => parseFloat(f.closedPnl) > 0).length;
  const totalFees = fills.reduce((sum, f) => sum + parseFloat(f.fee), 0);
  const pnlColor = (n: number) => n >= 0 ? '#52c41a' : '#ff4d4f';

  return (
    <div style={{ padding: '12px 4px 20px' }}>
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Fills</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginTop: 4 }}>{fills.length}</div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: totalPnl >= 0 ? 'rgba(82,196,26,0.04)' : 'rgba(255,77,79,0.04)', border: `1px solid ${totalPnl >= 0 ? 'rgba(82,196,26,0.12)' : 'rgba(255,77,79,0.12)'}` }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Realized PnL</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: pnlColor(totalPnl), marginTop: 4 }}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
          </div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Win Rate</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginTop: 4 }}>
            {closedPnls.length > 0 ? `${((wins / closedPnls.length) * 100).toFixed(1)}%` : '—'}
          </div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Fees</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ff4d4f', marginTop: 4 }}>-${totalFees.toFixed(2)}</div>
        </div>
      </div>

      <Table
        dataSource={fills.map((f, i) => ({ ...f, key: i }))}
        size="small"
        pagination={{ pageSize: 15, showSizeChanger: false }}
        style={{ padding: '0 4px' }}
        locale={{ emptyText: <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}><FundOutlined style={{ fontSize: 28, color: '#d1d5db', display: 'block', marginBottom: 8 }} />No trades found on Hyperliquid</div> }}
        columns={[
          {
            title: 'Time', key: 'time', width: 140,
            render: (_: any, row: HLFill) => (
              <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                {new Date(row.time).toLocaleString()}
              </span>
            ),
          },
          {
            title: 'Coin', key: 'coin', width: 70,
            render: (_: any, row: HLFill) => <Text strong style={{ fontSize: 12 }}>{row.coin}</Text>,
          },
          {
            title: 'Side', key: 'side', width: 65,
            render: (_: any, row: HLFill) => (
              <Tag color={row.side === 'B' ? 'success' : 'error'} style={{ borderRadius: 6, fontSize: 11 }}>
                {row.side === 'B' ? 'BUY' : 'SELL'}
              </Tag>
            ),
          },
          {
            title: 'Dir', key: 'dir', width: 110,
            render: (_: any, row: HLFill) => (
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                {row.dir.replace('Open ', '').replace('Close ', '')}
              </span>
            ),
          },
          {
            title: 'Price', key: 'price', width: 100,
            render: (_: any, row: HLFill) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>${parseFloat(row.px).toLocaleString()}</span>,
          },
          {
            title: 'Size', key: 'sz', width: 80,
            render: (_: any, row: HLFill) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{row.sz}</span>,
          },
          {
            title: 'Fee', key: 'fee', width: 70,
            render: (_: any, row: HLFill) => <span style={{ fontSize: 11, color: '#9ca3af' }}>${parseFloat(row.fee).toFixed(3)}</span>,
          },
          {
            title: 'Closed PnL', key: 'pnl', width: 100,
            render: (_: any, row: HLFill) => {
              const pnl = parseFloat(row.closedPnl);
              if (pnl === 0) return <span style={{ color: '#d1d5db' }}>—</span>;
              return <Text style={{ fontWeight: 700, color: pnlColor(pnl), fontSize: 12 }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}</Text>;
            },
          },
        ]}
      />
    </div>
  );
};

// ── Sources Tab ───────────────────────────────────────────────────────────────
const SourcesTab: React.FC<{ sources: SignalSource[]; fusionLive: FusionLiveData | null; onRefresh: () => void; onConnectAgent?: () => void }> = ({ sources, fusionLive, onRefresh, onConnectAgent }) => {
  const [toggling, setToggling] = useState<string | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  const handleToggle = async (id: string) => {
    setToggling(id);
    try {
      await fetch(`${AGENT_SERVICE_URL}/api/agent/sources/${id}/toggle`, { method: 'PATCH' });
      onRefresh();
    } catch {
      message.error('Toggle failed');
    } finally {
      setToggling(null);
    }
  };

  const handleRefreshPipeline = async () => {
    setPipelineLoading(true);
    onRefresh();
    setTimeout(() => setPipelineLoading(false), 1500);
  };

  const handleRemove = async (id: string) => {
    try {
      await fetch(`${AGENT_SERVICE_URL}/api/agent/sources/${id}`, { method: 'DELETE' });
      message.success('Source removed');
      onRefresh();
    } catch {
      message.error('Failed to remove source');
    }
  };

  const TRUST_STATE_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
    PROBATION: { color: '#faad14', label: 'Probation', bg: 'rgba(250,173,20,0.08)' },
    VALIDATED: { color: '#1677ff', label: 'Validated', bg: 'rgba(22,119,255,0.08)' },
    TRUSTED:   { color: '#52c41a', label: 'Trusted',   bg: 'rgba(82,196,26,0.08)' },
    SUSPENDED: { color: '#ff4d4f', label: 'Suspended', bg: 'rgba(255,77,79,0.08)' },
  };

  const columns = [
    {
      title: '', key: 'toggle', width: 50,
      render: (_: any, row: SignalSource) => row.id === 'galeon-brain' ? (
        <Tooltip title="Primary Brain — always active">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: '#52c41a',
              boxShadow: '0 0 0 3px rgba(82,196,26,0.2)',
            }} />
          </div>
        </Tooltip>
      ) : (
        <Switch
          size="small"
          checked={row.active}
          loading={toggling === row.id}
          onChange={() => handleToggle(row.id)}
          style={{ background: row.active ? '#52c41a' : undefined }}
        />
      ),
    },
    {
      title: 'Agent', key: 'name',
      render: (_: any, row: SignalSource) => {
        const ts = TRUST_STATE_CONFIG[row.trustState || 'PROBATION'];
        return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: row.active ? 1 : 0.45 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: row.id === 'galeon-brain' ? 'linear-gradient(135deg,#1677ff,#9b59ff)'
              : row.trustState === 'SUSPENDED' ? 'rgba(255,77,79,0.1)' : '#f0f5ff',
            flexShrink: 0,
          }}>
            {row.id === 'galeon-brain'
              ? <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />
              : row.trustState === 'SUSPENDED'
                ? <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
                : <ApiOutlined style={{ color: '#1677ff', fontSize: 16 }} />}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#111', display: 'flex', alignItems: 'center', gap: 4 }}>
              {row.name}
              {row.id === 'galeon-brain' && <Tag style={{ borderRadius: 6, fontSize: 10, margin: 0 }} color="purple">Built-in</Tag>}
              {!row.active && <Tag style={{ borderRadius: 6, fontSize: 10, margin: 0 }} color="default">OFF</Tag>}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{row.url}</div>
            {row.trustState === 'SUSPENDED' && (
              <div style={{ marginTop: 4, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,77,79,0.06)', border: '1px solid rgba(255,77,79,0.12)' }}>
                <div style={{ fontSize: 11, color: '#ff4d4f', fontWeight: 600 }}>
                  <WarningOutlined style={{ marginRight: 4 }} />
                  {row.suspensionReason || 'Anomaly threshold exceeded'}
                </div>
                {row.topAnomalies && row.topAnomalies.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {row.topAnomalies.map((a, i) => (
                      <Tag key={i} color="error" style={{ borderRadius: 4, fontSize: 9, margin: 0 }}>
                        {a.type.replace(/_/g, ' ')} x{a.count}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        );
      },
    },
    {
      title: 'Trust State', key: 'trustState', width: 130,
      render: (_: any, row: SignalSource) => {
        const state = row.trustState || (row.id === 'galeon-brain' ? 'TRUSTED' : 'PROBATION');
        const ts = TRUST_STATE_CONFIG[state];
        const mult = row.trustMultiplier ?? 0;
        return (
          <div>
            <Tag style={{ borderRadius: 6, fontSize: 11, fontWeight: 700, margin: 0 }}
              color={state === 'TRUSTED' ? 'success' : state === 'SUSPENDED' ? 'error' : state === 'VALIDATED' ? 'processing' : 'warning'}>
              {ts.label}
            </Tag>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
              weight: <strong style={{ color: ts.color }}>{mult.toFixed(1)}x</strong>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Anomaly', key: 'anomaly', width: 100,
      render: (_: any, row: SignalSource) => {
        const score = row.anomalyScore ?? 0;
        const count = row.anomalyCount ?? 0;
        if (row.id === 'galeon-brain') return <span style={{ fontSize: 12, color: '#52c41a' }}>—</span>;
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Progress
                percent={score} size="small" showInfo={false}
                strokeColor={score >= 70 ? '#ff4d4f' : score >= 30 ? '#faad14' : '#52c41a'}
                strokeLinecap="round"
                style={{ width: 60 }}
              />
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: score >= 70 ? '#ff4d4f' : score >= 30 ? '#faad14' : '#52c41a',
              }}>{score}</span>
            </div>
            {count > 0 && (
              <div style={{ fontSize: 10, color: '#ff7875', marginTop: 2 }}>
                <WarningOutlined style={{ fontSize: 9, marginRight: 2 }} />{count} alert{count > 1 ? 's' : ''}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Signals', key: 'signals', width: 80,
      render: (_: any, row: SignalSource) => (
        <span style={{ fontSize: 13, color: '#374151' }}>
          {row.totalSignals > 0
            ? <>{row.wonSignals}<span style={{ color: '#52c41a' }}>W</span> / {row.lostSignals}<span style={{ color: '#ff4d4f' }}>L</span></>
            : <span style={{ color: '#9ca3af' }}>0</span>}
        </span>
      ),
    },
    {
      title: '', key: 'actions', width: 50,
      render: (_: any, row: SignalSource) => row.id === 'galeon-brain' ? (
        <Tooltip title="Primary source — cannot remove"><DeleteOutlined style={{ color: '#d1d5db' }} /></Tooltip>
      ) : (
        <Popconfirm title="Remove this agent?" onConfirm={() => handleRemove(row.id)} okText="Remove" okType="danger">
          <DeleteOutlined style={{ color: '#ff7875', cursor: 'pointer' }} />
        </Popconfirm>
      ),
    },
  ];

  // My Agents: all user-created agents (push + pull), excluding built-in galeon-brain
  const BUILTIN_IDS = ['galeon-brain', 'trend', 'orderbook'];
  const pushAgents = sources.filter(s => !BUILTIN_IDS.includes(s.id));
  const pullAgents = sources.filter(s => s.id !== 'galeon-brain' && (s as any).protocolType !== 'push');

  return (
    <div style={{ padding: '16px 4px 24px' }}>

      {/* ── My Push Agents ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>My Agents</span>
            <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>
              Push-mode agents you've created — they send intel to Brain via API key
            </span>
          </div>
          {onRefresh && (
            <Button size="small" icon={<PlusOutlined />} type="primary" ghost
              style={{ borderRadius: 8, fontSize: 12 }}
              onClick={() => onConnectAgent?.()}
            >
              New Agent
            </Button>
          )}
        </div>

        {pushAgents.length === 0 ? (
          <div style={{
            padding: '24px', borderRadius: 12, textAlign: 'center',
            background: '#fafafa', border: '1px dashed #e5e7eb',
          }}>
            <ApiOutlined style={{ fontSize: 28, color: '#d1d5db', display: 'block', marginBottom: 8 }} />
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>No push agents yet</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              Click "Connect Agent" → Push mode to create one and get an API key
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {pushAgents.map(agent => {
              const state = agent.trustState || 'PROBATION';
              const ts = TRUST_STATE_CONFIG[state];
              const mult = agent.trustMultiplier ?? 0;
              return (
                <div key={agent.id} style={{
                  padding: '16px', borderRadius: 12, border: '1px solid #e5e7eb',
                  background: agent.active ? '#fff' : '#fafafa',
                  opacity: agent.active ? 1 : 0.6,
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, background: '#f0f5ff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <CodeOutlined style={{ color: '#1677ff', fontSize: 16 }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{agent.name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>ID: {agent.id}</div>
                      </div>
                    </div>
                    <Switch
                      size="small" checked={agent.active}
                      loading={toggling === agent.id}
                      onChange={() => handleToggle(agent.id)}
                      style={{ background: agent.active ? '#52c41a' : undefined }}
                    />
                  </div>

                  {/* Trust state */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Tag style={{ borderRadius: 6, fontSize: 11, fontWeight: 700, margin: 0 }}
                      color={state === 'TRUSTED' ? 'success' : state === 'SUSPENDED' ? 'error' : state === 'VALIDATED' ? 'processing' : 'warning'}>
                      {ts.label}
                    </Tag>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      weight <strong style={{ color: ts.color }}>{mult.toFixed(1)}x</strong>
                    </span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      · {agent.totalSignals} signal{agent.totalSignals !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Capabilities */}
                  {agent.capabilities && agent.capabilities.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                      {agent.capabilities.map(c => (
                        <Tag key={c} style={{ borderRadius: 4, fontSize: 10, margin: 0 }} color="blue">{c}</Tag>
                      ))}
                    </div>
                  )}

                  {/* Status banner */}
                  {!agent.active && agent.totalSignals === 0 ? (
                    <div style={{
                      padding: '8px 10px', borderRadius: 8, marginBottom: 10,
                      background: 'rgba(250,173,20,0.06)', border: '1px solid rgba(250,173,20,0.2)',
                    }}>
                      <div style={{ fontSize: 12, color: '#d48806', fontWeight: 600, marginBottom: 2 }}>
                        <WarningOutlined style={{ marginRight: 4 }} />Not connected yet
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
                        Wire up your agent using the API key from registration, then enable the toggle above.
                      </div>
                    </div>
                  ) : agent.totalSignals > 0 ? (
                    <div style={{
                      padding: '8px 10px', borderRadius: 8, marginBottom: 10,
                      background: 'rgba(82,196,26,0.04)', border: '1px solid rgba(82,196,26,0.15)',
                    }}>
                      <div style={{ fontSize: 12, color: '#52c41a', fontWeight: 600 }}>
                        <CheckCircleOutlined style={{ marginRight: 4 }} />
                        Connected · {agent.totalSignals} signal{agent.totalSignals !== 1 ? 's' : ''} received
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '8px 10px', borderRadius: 8, marginBottom: 10,
                      background: 'rgba(22,119,255,0.04)', border: '1px solid rgba(22,119,255,0.12)',
                    }}>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151' }}>
                        POST {AGENT_SERVICE_URL}/api/agent/push-intel
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                        Auth: Bearer &lt;API key from registration&gt;
                      </div>
                    </div>
                  )}

                  {/* Anomaly warning */}
                  {(agent.anomalyScore ?? 0) > 0 && (
                    <div style={{ fontSize: 11, color: (agent.anomalyScore ?? 0) >= 70 ? '#ff4d4f' : '#faad14', marginBottom: 8 }}>
                      <WarningOutlined style={{ marginRight: 4 }} />
                      Anomaly score: {agent.anomalyScore}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Popconfirm title="Remove this agent?" onConfirm={() => handleRemove(agent.id)} okText="Remove" okType="danger">
                      <Button size="small" danger type="text" icon={<DeleteOutlined />} style={{ fontSize: 11 }}>
                        Remove
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trust lifecycle banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { icon: <ExperimentOutlined />, color: '#faad14', title: 'Probation', desc: 'New agent — first 10 signals logged, zero weight in decisions' },
          { icon: <SafetyCertificateOutlined />, color: '#1677ff', title: 'Validated', desc: 'Passed checks — 0.5x weight, anomaly monitoring active' },
          { icon: <CheckCircleOutlined />, color: '#52c41a', title: 'Trusted', desc: '60%+ accuracy over 20 evals — full 1.0x weight' },
          { icon: <CloseCircleOutlined />, color: '#ff4d4f', title: 'Suspended', desc: 'Anomaly score ≥70 — zero weight, requires admin review' },
        ].map(s => (
          <div key={s.title} style={{ padding: '14px 16px', background: '#fafafa', borderRadius: 12, border: '1px solid #f0f0f0', display: 'flex', gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${s.color}15`, flexShrink: 0 }}>
              <span style={{ fontSize: 16, color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 2 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Agent Trust Network ({sources.length})
        </span>
        <Button
          size="small" icon={<ThunderboltOutlined />}
          loading={pipelineLoading}
          onClick={handleRefreshPipeline}
          style={{ borderRadius: 8, fontSize: 12, borderColor: '#722ed1', color: '#722ed1' }}
        >
          Refresh Pipeline
        </Button>
      </div>
      <Table
        dataSource={sources} columns={columns} rowKey="id" size="small" pagination={false}
        locale={{ emptyText: (
          <div style={{ textAlign: 'center', padding: '28px 20px' }}>
            <ApiOutlined style={{ fontSize: 32, color: '#d1d5db', display: 'block', marginBottom: 8 }} />
            <div style={{ fontSize: 13, color: '#9ca3af' }}>No external agents yet</div>
            <div style={{ fontSize: 12, color: '#d1d5db', marginTop: 4 }}>Click "Connect Agent" in the top bar to add one</div>
          </div>
        )}}
        style={{ marginBottom: 0 }}
      />

      {/* ── Fusion Live Panel ── */}
      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <ThunderboltOutlined style={{ marginRight: 4 }} />
            Live Signal Pipeline
            <Tag style={{ marginLeft: 8, borderRadius: 6, fontSize: 10 }} color="purple">
              {sources.filter(s => s.active).length}/{sources.length} active
            </Tag>
          </span>
          {fusionLive && (
            <span style={{ fontSize: 11, color: '#d1d5db' }}>
              Last poll: {new Date(fusionLive.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        {!fusionLive ? (
          <div style={{ textAlign: 'center', padding: '24px', background: '#fafafa', borderRadius: 12, border: '1px solid #f0f0f0', color: '#9ca3af', fontSize: 13 }}>
            <SyncOutlined spin style={{ marginRight: 6 }} />Loading pipeline data...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Left: Raw signals from each source */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Agent Signal Input
              </div>
              {/* Reorder: Brain first, then auxiliaries */}
              {[...fusionLive.rawSignals].sort((a, b) => a.sourceId === 'galeon-brain' ? -1 : b.sourceId === 'galeon-brain' ? 1 : 0).map(src => {
                const isBrain = src.sourceId === 'galeon-brain';
                return (
                <div key={src.sourceId} style={{
                  marginBottom: 10, padding: '12px 14px', borderRadius: 10,
                  background: src.error ? '#fff2f0' : isBrain ? 'linear-gradient(135deg, rgba(22,119,255,0.04), rgba(114,46,209,0.04))' : '#fafafa',
                  border: `1px solid ${src.error ? '#ffccc7' : isBrain ? 'rgba(22,119,255,0.15)' : '#f0f0f0'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isBrain
                        ? <RobotOutlined style={{ color: '#1677ff', fontSize: 13 }} />
                        : <ApiOutlined style={{ color: '#9ca3af', fontSize: 13 }} />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{src.sourceName}</span>
                      <Tag style={{ borderRadius: 6, fontSize: 10 }} color={isBrain ? 'purple' : 'blue'}>
                        {isBrain ? 'primary w=2.0' : `auxiliary w=${src.trustWeight.toFixed(1)}`}
                      </Tag>
                    </div>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{src.latencyMs}ms</span>
                  </div>
                  {src.error ? (
                    <div style={{ fontSize: 12, color: '#ff4d4f' }}>
                      <CloseCircleOutlined style={{ marginRight: 4 }} />{src.error.slice(0, 60)}
                    </div>
                  ) : src.signals.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>No active signals</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {src.signals.map((sig: any, i: number) => (
                        <div key={i} style={{
                          padding: '4px 10px', borderRadius: 8,
                          background: sig.direction === 'LONG' ? 'rgba(82,196,26,0.08)' : 'rgba(255,77,79,0.08)',
                          border: `1px solid ${sig.direction === 'LONG' ? 'rgba(82,196,26,0.2)' : 'rgba(255,77,79,0.2)'}`,
                          fontSize: 12,
                        }}>
                          <span style={{ fontWeight: 700, color: sig.direction === 'LONG' ? '#52c41a' : '#ff4d4f' }}>
                            {(sig.symbol || '').replace('USDT', '')} {sig.direction}
                          </span>
                          <span style={{ color: '#6b7280', marginLeft: 6 }}>
                            conf={sig.confidence || '?'}
                          </span>
                          {sig.entryPrice && (
                            <span style={{ color: '#9ca3af', marginLeft: 4 }}>
                              @{typeof sig.entryPrice === 'number' ? sig.entryPrice.toFixed(2) : sig.entryPrice}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Right: Brain Fusion Decision */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                <RobotOutlined style={{ marginRight: 4 }} />
                Brain Fusion Decision
              </div>

              {/* Architecture explanation */}
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                background: 'linear-gradient(135deg, rgba(22,119,255,0.04), rgba(114,46,209,0.04))',
                border: '1px solid rgba(22,119,255,0.12)',
              }}>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                  <strong style={{ color: '#1677ff' }}>Galeon Brain</strong> collects signals from all active agents,
                  applies <strong>weighted fusion</strong> (Brain w=2.0, others w=1.0),
                  then runs <strong>Symbol Gate → Regime Gate → Confidence Gate</strong> before executing.
                </div>
              </div>

              {fusionLive.fusionResults.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '32px 20px', background: '#fafafa', borderRadius: 12,
                  border: '1px solid #f0f0f0',
                }}>
                  <SafetyCertificateOutlined style={{ fontSize: 28, color: '#d1d5db', display: 'block', marginBottom: 8 }} />
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>No signals reached fusion</div>
                  <div style={{ fontSize: 12, color: '#d1d5db', marginTop: 4 }}>All agents idle or all signals were filtered</div>
                </div>
              ) : (
                fusionLive.fusionResults.map((fr, i) => {
                  const srcNames = fr.sources.map(sid => {
                    const s = sources.find(x => x.id === sid);
                    return s ? s.name : sid;
                  });
                  const hasBrain = fr.sources.includes('galeon-brain');

                  return (
                    <div key={i} style={{
                      marginBottom: 10, padding: '12px 14px', borderRadius: 10,
                      background: fr.accepted ? 'rgba(82,196,26,0.04)' : 'rgba(255,77,79,0.04)',
                      border: `1px solid ${fr.accepted ? 'rgba(82,196,26,0.15)' : 'rgba(255,77,79,0.15)'}`,
                    }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {fr.accepted
                            ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                            : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />}
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>
                            {fr.symbol?.replace?.('USDT', '') || '?'}
                          </span>
                          {fr.direction && (
                            <Tag color={fr.direction === 'LONG' ? 'success' : 'error'} style={{ borderRadius: 6, fontSize: 11, margin: 0 }}>
                              {fr.direction}
                            </Tag>
                          )}
                          <Tag style={{ borderRadius: 6, fontSize: 10, margin: 0 }} color={fr.accepted ? 'green' : 'red'}>
                            {fr.accepted ? 'EXECUTE' : 'BLOCKED'}
                          </Tag>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            fontSize: 16, fontWeight: 800,
                            color: fr.fusedScore >= 60 ? '#52c41a' : fr.fusedScore >= 40 ? '#faad14' : '#ff4d4f',
                          }}>
                            {fr.fusedScore}
                          </span>
                          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>/ 100</span>
                        </div>
                      </div>

                      {/* Score bar */}
                      <Progress
                        percent={Math.min(100, fr.fusedScore)} size="small" showInfo={false}
                        strokeColor={fr.accepted ? '#52c41a' : '#ff4d4f'}
                        strokeLinecap="round"
                        style={{ marginBottom: 8 }}
                      />

                      {/* Contributing agents */}
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Signal from: </span>
                        {srcNames.map((name, j) => (
                          <Tag key={j} style={{ borderRadius: 6, fontSize: 10, margin: '0 2px' }}
                            color={fr.sources[j] === 'galeon-brain' ? 'purple' : 'blue'}>
                            {name}
                            {fr.sources[j] === 'galeon-brain' && ' (primary)'}
                          </Tag>
                        ))}
                        {!hasBrain && (
                          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>
                            (auxiliary only — Brain had no signal for this pair)
                          </span>
                        )}
                      </div>

                      {/* Bonuses */}
                      {fr.bonuses.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>Bonuses: </span>
                          {fr.bonuses.map((b, j) => (
                            <Tag key={j} color="gold" style={{ borderRadius: 6, fontSize: 10 }}>{b}</Tag>
                          ))}
                        </div>
                      )}

                      {/* Rejection reason */}
                      {fr.rejectionReason && (
                        <div style={{
                          fontSize: 12, color: '#ff4d4f', marginTop: 4,
                          padding: '6px 10px', borderRadius: 6, background: 'rgba(255,77,79,0.06)',
                        }}>
                          <WarningOutlined style={{ marginRight: 4 }} />
                          Brain decision: {fr.rejectionReason}
                        </div>
                      )}

                      {/* Accepted signal detail */}
                      {fr.accepted && fr.signal && (
                        <div style={{
                          fontSize: 12, color: '#374151', marginTop: 8, padding: '8px 10px',
                          borderRadius: 6, background: 'rgba(82,196,26,0.06)',
                          display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
                        }}>
                          <span style={{ fontSize: 11, color: '#52c41a', fontWeight: 600 }}>EXECUTING →</span>
                          <span>Entry <strong>${fr.signal.entryPrice?.toFixed(2)}</strong></span>
                          <span>SL <strong style={{ color: '#ff4d4f' }}>${fr.signal.stopLoss?.toFixed(2)}</strong></span>
                          <span>TP <strong style={{ color: '#52c41a' }}>${fr.signal.takeProfit1?.toFixed(2)}</strong></span>
                          <span>Lev <strong>{fr.signal.leverage}x</strong></span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Connect Agent Modal ───────────────────────────────────────────────────────

const ConnectAgentModal: React.FC<{ onRegistered: () => void; onRefresh?: () => void }> = ({ onRegistered, onRefresh }) => {
  const [form] = Form.useForm();
  const [registering, setRegistering] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [connectMode, setConnectMode] = useState<'push' | 'pull' | null>(null);
  const [pushResult, setPushResult] = useState<{ apiKey: string; endpoint: string; curl: string; python: string } | null>(null);

  // ── Push mode: register and get API key ──
  const handlePushRegister = async (values: { id: string; name: string }) => {
    setRegistering(true);
    try {
      const res = await fetch(`${AGENT_SERVICE_URL}/api/agent/register-external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, mode: 'push' }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setPushResult({
        apiKey: res.pushApiKey,
        endpoint: `${AGENT_SERVICE_URL}/api/agent/push-intel`,
        curl: res.example?.curl || '',
        python: res.example?.python || '',
      });
      message.success(`Agent "${values.name}" registered — API Key generated`);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setRegistering(false);
    }
  };

  // ── Pull mode: test then register ──
  const handleTest = async () => {
    const url = form.getFieldValue('url');
    if (!url) { message.warning('Enter a URL first'); return; }
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch(`${url}/positions`, { signal: AbortSignal.timeout(6000) });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTestResult({ ok: true, msg: `Connected — ${json.data.length} signal(s) received` });
      } else {
        setTestResult({ ok: false, msg: 'Response format incorrect. Expected {success:true, data:[...]}' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: `Cannot reach ${url}/positions — ${e.message}` });
    } finally { setTesting(false); }
  };

  const handlePullRegister = async (values: { id: string; name: string; url: string; apiKey?: string }) => {
    setRegistering(true);
    try {
      const res = await fetch(`${AGENT_SERVICE_URL}/api/agent/register-external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, mode: 'pull' }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      message.success(`Agent "${values.name}" connected to Brain`);
      form.resetFields(); setTestResult(null); setConnectMode(null);
      onRegistered();
    } catch (e: any) { message.error(e.message); }
    finally { setRegistering(false); }
  };

  // ── Mode selection ──
  if (!connectMode) {
    return (
      <div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.6 }}>
          Choose how your agent communicates with Galeon Brain:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Push mode card */}
          <div
            onClick={() => setConnectMode('push')}
            style={{
              padding: '20px 18px', borderRadius: 14, cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(22,119,255,0.04), rgba(114,46,209,0.06))',
              border: '2px solid rgba(22,119,255,0.15)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#1677ff')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(22,119,255,0.15)')}
          >
            <div style={{ fontSize: 22, marginBottom: 10 }}>
              <ArrowUpOutlined style={{ color: '#1677ff' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>Push Mode</div>
            <Tag color="blue" style={{ borderRadius: 6, fontSize: 11, marginBottom: 10 }}>Recommended</Tag>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
              Your agent pushes signals to Brain via API. No public server needed — works from any environment.
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['No public URL required', 'Works behind firewalls', 'curl / Python / any language', 'Real-time — no polling delay'].map(p => (
                <div key={p} style={{ fontSize: 11, color: '#52c41a', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircleOutlined style={{ fontSize: 10 }} /> {p}
                </div>
              ))}
            </div>
          </div>

          {/* Pull mode card */}
          <div
            onClick={() => setConnectMode('pull')}
            style={{
              padding: '20px 18px', borderRadius: 14, cursor: 'pointer',
              background: '#fafafa', border: '2px solid #f0f0f0',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}
          >
            <div style={{ fontSize: 22, marginBottom: 10 }}>
              <ArrowDownOutlined style={{ color: '#9ca3af' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>Pull Mode</div>
            <Tag color="default" style={{ borderRadius: 6, fontSize: 11, marginBottom: 10 }}>Advanced</Tag>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
              Brain polls your agent's HTTP endpoint. Requires a publicly accessible server.
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['Agent controls data freshness', 'FIP + Legacy protocol support', 'Auto capability detection', 'Requires public URL'].map((p, i) => (
                <div key={p} style={{ fontSize: 11, color: i === 3 ? '#faad14' : '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {i === 3 ? <WarningOutlined style={{ fontSize: 10 }} /> : <CheckCircleOutlined style={{ fontSize: 10 }} />} {p}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUSH MODE UI
  // ══════════════════════════════════════════════════════════════════════════
  if (connectMode === 'push') {
    // After registration — show API key and examples
    if (pushResult) {
      return (
        <div>
          <Alert
            type="success" showIcon
            message="Agent registered — your API Key is ready"
            description="Use this key to push signals from any environment. Keep it secret."
            style={{ borderRadius: 10, marginBottom: 16 }}
          />
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Your Push API Key:</div>
            <Input.Password
              readOnly value={pushResult.apiKey}
              style={{ borderRadius: 8, fontFamily: 'monospace', fontSize: 13, background: '#f9fafb' }}
              addonAfter={
                <span style={{ cursor: 'pointer' }} onClick={() => { navigator.clipboard.writeText(pushResult.apiKey); message.success('Copied!'); }}>
                  Copy
                </span>
              }
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Push Endpoint:</div>
            <code style={{ fontSize: 12, color: '#1677ff', display: 'block', padding: '8px 12px', background: '#f0f5ff', borderRadius: 8, wordBreak: 'break-all' }}>
              POST {pushResult.endpoint}
            </code>
          </div>

          <Tabs size="small" items={[
            {
              key: 'curl', label: 'curl',
              children: (
                <pre style={{ background: '#1a1a2e', color: '#a8d8a8', borderRadius: 10, padding: '14px 16px', fontSize: 11, lineHeight: 1.6, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
{`curl -X POST ${pushResult.endpoint} \\
  -H "Authorization: Bearer ${pushResult.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"symbol":"BTC","direction":"BULLISH","confidence":75,"reasoning":"RSI oversold"}'`}
                </pre>
              ),
            },
            {
              key: 'python', label: 'Python',
              children: (
                <pre style={{ background: '#1a1a2e', color: '#a8d8a8', borderRadius: 10, padding: '14px 16px', fontSize: 11, lineHeight: 1.6, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
{`import requests

r = requests.post(
    "${pushResult.endpoint}",
    headers={"Authorization": "Bearer ${pushResult.apiKey}"},
    json={
        "symbol": "BTC",
        "direction": "BULLISH",
        "confidence": 75,
        "reasoning": "RSI oversold bounce"
    }
)
print(r.json())  # {"success":true,"accepted":1,...}`}
                </pre>
              ),
            },
            {
              key: 'js', label: 'JavaScript',
              children: (
                <pre style={{ background: '#1a1a2e', color: '#a8d8a8', borderRadius: 10, padding: '14px 16px', fontSize: 11, lineHeight: 1.6, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
{`fetch("${pushResult.endpoint}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${pushResult.apiKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    symbol: "BTC",
    direction: "BULLISH",
    confidence: 75,
    reasoning: "RSI oversold bounce"
  })
}).then(r => r.json()).then(console.log);`}
                </pre>
              ),
            },
            {
              key: 'lunarcrush', label: '🌙 LunarCrush Agent',
              children: (
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                    Real social sentiment agent — fetches BTC/ETH/SOL signals from LunarCrush every 5 min.
                    Get a free API key at <a href="https://lunarcrush.com" target="_blank" rel="noreferrer">lunarcrush.com</a>
                  </div>
                  <pre style={{ background: '#1a1a2e', color: '#a8d8a8', borderRadius: 10, padding: '14px 16px', fontSize: 11, lineHeight: 1.6, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
{`LUNARCRUSH_API_KEY=your_lunarcrush_key \\
GALEON_API_KEY=${pushResult.apiKey} \\
python /Users/css/Desktop/gameland/near-hackathon/agent/scripts/lunarcrush_agent.py`}
                  </pre>
                  <span
                    style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer' }}
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `LUNARCRUSH_API_KEY=your_lunarcrush_key \\\nGALEON_API_KEY=${pushResult.apiKey} \\\npython /Users/css/Desktop/gameland/near-hackathon/agent/scripts/lunarcrush_agent.py`
                      );
                      message.success('Command copied!');
                    }}
                  >
                    Copy command
                  </span>
                </div>
              ),
            },
            {
              key: 'batch', label: 'Batch (multi-symbol)',
              children: (
                <pre style={{ background: '#1a1a2e', color: '#a8d8a8', borderRadius: 10, padding: '14px 16px', fontSize: 11, lineHeight: 1.6, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
{`# Send multiple signals in one request
curl -X POST ${pushResult.endpoint} \\
  -H "Authorization: Bearer ${pushResult.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "intel": [
      {"symbol":"BTC","direction":"BULLISH","confidence":80},
      {"symbol":"ETH","direction":"BEARISH","confidence":65},
      {"symbol":"SOL","direction":"NEUTRAL","confidence":50}
    ]
  }'`}
                </pre>
              ),
            },
          ]} />

          <Alert
            type="warning" showIcon
            message="Save your API key now — it will not be shown again after closing this window."
            style={{ borderRadius: 8, marginTop: 16, marginBottom: 8 }}
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <Button block onClick={() => { onRefresh?.(); }} style={{ borderRadius: 8 }}>
              Refresh Agent List
            </Button>
            <Button block type="primary" onClick={() => { setPushResult(null); setConnectMode(null); onRegistered(); }} style={{ borderRadius: 8 }}>
              Close
            </Button>
          </div>
        </div>
      );
    }

    // Registration form for push mode
    return (
      <div>
        <Button type="link" onClick={() => setConnectMode(null)} style={{ padding: 0, marginBottom: 12, fontSize: 13 }}>← Back to mode selection</Button>
        <Alert
          type="info" showIcon
          message="Push Mode — Your agent sends signals to Brain"
          description="No public URL needed. Register your agent, get an API key, then POST signals from anywhere."
          style={{ borderRadius: 10, marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" onFinish={handlePushRegister}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="id" label="Agent ID" rules={[{ required: true }]} style={{ marginBottom: 14 }}>
              <Input placeholder="my-trend-bot" style={{ borderRadius: 8 }} />
            </Form.Item>
            <Form.Item name="name" label="Display Name" rules={[{ required: true }]} style={{ marginBottom: 14 }}>
              <Input placeholder="My Trend Analysis Bot" style={{ borderRadius: 8 }} />
            </Form.Item>
          </div>
          <Button
            type="primary" htmlType="submit" loading={registering} block
            icon={<ThunderboltOutlined />}
            style={{ borderRadius: 10, height: 44, background: '#1677ff', border: 'none', fontSize: 14 }}
          >
            Register & Get API Key
          </Button>
        </Form>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PULL MODE UI (existing flow, cleaned up)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div>
      <Button type="link" onClick={() => setConnectMode(null)} style={{ padding: 0, marginBottom: 12, fontSize: 13 }}>← Back to mode selection</Button>
      <Alert
        type="info" showIcon
        message="Pull Mode — Brain polls your agent"
        description={<span>Your agent must expose <code>GET /positions</code> or <code>GET /intel</code> on a public URL.</span>}
        style={{ borderRadius: 10, marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" onFinish={handlePullRegister}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="id" label="Agent ID" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
            <Input placeholder="trend-agent" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="name" label="Display Name" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
            <Input placeholder="My TrendAgent" style={{ borderRadius: 8 }} />
          </Form.Item>
        </div>
        <Form.Item name="url" label="Base URL" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder="https://your-agent.example.com"
            enterButton={<Button loading={testing} icon={<ExperimentOutlined />}>Test</Button>}
            style={{ borderRadius: 8 }}
            onSearch={handleTest}
          />
        </Form.Item>
        {testResult && (
          <Alert type={testResult.ok ? 'success' : 'error'} message={testResult.msg} showIcon style={{ borderRadius: 8, marginBottom: 12 }} />
        )}
        <Form.Item name="apiKey" label={<span>API Key <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}>(optional)</span></span>} style={{ marginBottom: 16 }}>
          <Input.Password placeholder="Bearer token if your agent requires auth" style={{ borderRadius: 8 }} />
        </Form.Item>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="primary" htmlType="submit" loading={registering}
            icon={<LinkOutlined />}
            style={{ borderRadius: 8, background: '#1677ff', flex: 1 }}
            disabled={!testResult?.ok}
          >
            Connect Agent
          </Button>
        </div>
        {!testResult?.ok && (
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
            Run the test first to verify your agent is reachable
          </div>
        )}
      </Form>
    </div>
  );
};

// ── Fusion History Tab ────────────────────────────────────────────────────────

const LABEL_COLORS_HEX: Record<string, string> = {
  BRAIN_SOLO:          '#722ed1',
  FUSION_CONFIRMED:    '#52c41a',
  FUSION_STRENGTHENED: '#13c2c2',
  FUSION_CHALLENGED:   '#fa8c16',
  FUSION_ADJUSTED:     '#1677ff',
  FUSION_EVALUATED:    '#9ca3af',
  SECURITY_REJECTION:  '#ff4d4f',
};

const SYMBOL_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#13c2c2', '#ff4d4f'];

const ACTION_DOT: Record<string, string> = {
  LONG: '#52c41a', SHORT: '#ff4d4f', WAIT: '#faad14', REDUCE: '#fa8c16', CLOSE: '#9ca3af',
};

// ═══════════════════════════════════════════════════════════════════════════════
// ON-CHAIN TRUST TAB
// ═══════════════════════════════════════════════════════════════════════════════

const TRUST_STATE_COLORS: Record<string, string> = {
  PROBATION: '#faad14', VALIDATED: '#1677ff', TRUSTED: '#52c41a', SUSPENDED: '#ff4d4f',
};

const OnChainTrustTab: React.FC = () => {
  const [chainData, setChainData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${AGENT_SERVICE_URL}/api/agent/chain-trust`)
      .then(r => r.json())
      .then(d => d.success && setChainData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

  if (!chainData?.enabled) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
        <SafetyOutlined style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
        On-chain trust sync is not configured.
      </div>
    );
  }

  const { agents = [], stats } = chainData;
  const contractId = 'galeon-trust.testnet';
  const explorerBase = 'https://testnet.nearblocks.io';

  return (
    <div style={{ padding: '16px 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>NEAR On-Chain Trust Registry</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
            Contract: <a href={`${explorerBase}/address/${contractId}`} target="_blank" rel="noreferrer"
              style={{ fontFamily: 'monospace', color: '#1677ff' }}>{contractId}</a>
          </div>
        </div>
        <Tag color="green" style={{ fontSize: 12, fontWeight: 600 }}>NEAR Testnet</Tag>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total Agents', value: stats.total_agents, color: '#111' },
            { label: 'Trusted', value: stats.trusted, color: '#52c41a' },
            { label: 'Validated', value: stats.validated, color: '#1677ff' },
            { label: 'Suspended', value: stats.suspended, color: '#ff4d4f' },
          ].map(s => (
            <div key={s.label} style={{ padding: '12px 14px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Agent list */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        On-Chain Agent Records
      </div>
      {agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 20, color: '#bbb' }}>No agents registered on-chain yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {agents.map((agent: any) => (
            <div key={agent.agent_id} style={{
              padding: '14px 16px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{agent.name}</span>
                  <Tag color={
                    agent.state === 'TRUSTED' ? 'success' : agent.state === 'SUSPENDED' ? 'error'
                    : agent.state === 'VALIDATED' ? 'processing' : 'warning'
                  } style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>
                    {agent.state}
                  </Tag>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    weight: <strong style={{ color: TRUST_STATE_COLORS[agent.state] || '#999' }}>{agent.trust_multiplier}x</strong>
                  </span>
                </div>
                <a href={`${explorerBase}/address/${contractId}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: '#1677ff' }}>
                  View on Explorer →
                </a>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Signals</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{agent.signal_count.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Accuracy</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: agent.accuracy >= 0 ? (agent.accuracy >= 0.55 ? '#52c41a' : '#ff4d4f') : '#bbb' }}>
                    {agent.accuracy >= 0 ? `${(agent.accuracy * 100).toFixed(1)}%` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Anomaly Score</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: agent.anomaly_score > 50 ? '#ff4d4f' : '#52c41a' }}>
                    {agent.anomaly_score}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Agent ID</div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#6b7280' }}>{agent.agent_id}</div>
                </div>
              </div>

              {agent.suspension_reason && (
                <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,77,79,0.06)', border: '1px solid rgba(255,77,79,0.15)', fontSize: 11, color: '#cf1322' }}>
                  ⚠ {agent.suspension_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#f0f7ff', border: '1px solid #d6e4ff', fontSize: 12, color: '#4096ff', lineHeight: 1.6 }}>
        All trust scores are stored on NEAR blockchain and are publicly queryable.
        Any protocol on NEAR can verify an agent's reputation before adopting its signals.
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// FUSION HISTORY TAB
// ═══════════════════════════════════════════════════════════════════════════════

const FusionHistoryTab: React.FC<{ historyData: FusionHistoryData | null; sources: any[] }> = ({ historyData, sources }) => {
  // Default to symbols with highest score variance — prefer non-neutral ones
  const getDefaultSymbols = (known: string[]) => {
    const preferred = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
    const hits = preferred.filter(s => known.includes(s));
    return hits.length >= 2 ? hits.slice(0, 5) : known.slice(0, 5);
  };

  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [timelineData, setTimelineData] = useState<FusionScoreTimeline[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Set default symbols once historyData arrives
  useEffect(() => {
    if (historyData && selectedSymbols.length === 0) {
      setSelectedSymbols(getDefaultSymbols(historyData.knownSymbols));
    }
  }, [historyData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load score timeline whenever symbol selection changes
  useEffect(() => {
    if (selectedSymbols.length === 0) return;
    setLoadingTimeline(true);
    fetch(
      `${AGENT_SERVICE_URL}/api/agent/fusion-history?mode=timeline&symbols=${selectedSymbols.join(',')}&limit=5000`
    )
      .then(r => r.json())
      .then(d => { if (d.success) setTimelineData(d.timeline || []); })
      .catch(() => {})
      .finally(() => setLoadingTimeline(false));
  }, [selectedSymbols]);

  if (!historyData) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <FundOutlined style={{ fontSize: 32, color: '#d1d5db', display: 'block', marginBottom: 10 }} />
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Collecting fusion history… check back in a few cycles.</div>
      </div>
    );
  }

  const { totalSnapshots, labelDistribution, knownSymbols } = historyData;

  // Aggregate raw data points into 1h buckets
  const hourlyMap = new Map<string, { scores: Record<string, number[]>; actions: Record<string, string> }>();
  for (const p of timelineData) {
    const d = new Date(p.timestamp);
    const key = `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:00`;
    if (!hourlyMap.has(key)) hourlyMap.set(key, { scores: {}, actions: {} });
    const bucket = hourlyMap.get(key)!;
    for (const sym of selectedSymbols) {
      if (p.scores[sym] !== undefined) {
        if (!bucket.scores[sym]) bucket.scores[sym] = [];
        bucket.scores[sym].push(p.scores[sym]);
      }
      if (p.actions[sym]) bucket.actions[sym] = p.actions[sym];
    }
  }
  const hourlyData = Array.from(hourlyMap.entries()).map(([label, bucket]) => ({
    label,
    scores: Object.fromEntries(
      Object.entries(bucket.scores).map(([sym, vals]) => [sym, Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)])
    ),
    actions: bucket.actions,
  }));

  const timeLabels = hourlyData.map(p => p.label);

  // Compute adaptive Y range with 10pt padding around actual data
  const allScores = hourlyData.flatMap(p =>
    selectedSymbols.map(s => p.scores[s]).filter((v): v is number => v !== undefined)
  );
  const yMin = allScores.length > 0 ? Math.max(0, Math.min(...allScores) - 10) : 0;
  const yMax = allScores.length > 0 ? Math.min(100, Math.max(...allScores) + 10) : 100;

  const scoreChartData = {
    labels: timeLabels,
    datasets: selectedSymbols.map((sym, i) => {
      const color = SYMBOL_COLORS[i % SYMBOL_COLORS.length];
      const pointColors = hourlyData.map(p =>
        p.actions[sym] ? (ACTION_DOT[p.actions[sym]] || color) : color
      );
      return {
        label: sym,
        data: hourlyData.map(p => p.scores[sym] ?? null),
        borderColor: color,
        backgroundColor: color + '20',
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false,
        spanGaps: true,
      };
    }),
  };

  const scoreChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } },
      tooltip: {
        callbacks: {
          afterLabel: (ctx: any) => {
            const point = hourlyData[ctx.dataIndex];
            if (!point) return '';
            const sym = selectedSymbols[ctx.datasetIndex];
            const action = point.actions[sym];
            return action ? `Action: ${action}` : '';
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 10 }, maxTicksLimit: 12, maxRotation: 0 },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
      y: {
        min: yMin,
        max: yMax,
        ticks: { font: { size: 10 }, stepSize: 5 },
        grid: { color: 'rgba(0,0,0,0.04)' },
        title: { display: true, text: 'Fusion Score', font: { size: 10 }, color: '#9ca3af' },
      },
    },
  };

  // Recent decisions table — latest snapshot, all symbols, sorted by score desc
  const latestSnap = historyData.snapshots[0];
  const recentRows: { key: string; time: string; symbol: string; action: string; label: string; score: number; agents: number }[] = [];
  if (latestSnap) {
    const t = new Date(latestSnap.timestamp);
    const tStr = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;
    const sorted = [...latestSnap.decisions].sort((a, b) => b.score - a.score);
    for (const d of sorted) {
      recentRows.push({
        key: `${latestSnap.timestamp}-${d.symbol}`,
        time: tStr,
        symbol: d.symbol,
        action: d.action,
        label: d.label,
        score: d.score,
        agents: d.externalContributors?.length || 0,
      });
    }
  }

  return (
    <div style={{ padding: '16px 4px 24px' }}>

      {/* ── Header stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(22,119,255,0.04)', border: '1px solid rgba(22,119,255,0.12)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1677ff' }}>{totalSnapshots}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Total Cycles Recorded</div>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(82,196,26,0.04)', border: '1px solid rgba(82,196,26,0.12)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#52c41a' }}>
            {labelDistribution
              .filter(l => l.label !== 'BRAIN_SOLO' && l.label !== 'SECURITY_REJECTION')
              .reduce((sum, l) => sum + l.pct, 0)}%
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Agent Participation</div>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,77,79,0.04)', border: '1px solid rgba(255,77,79,0.12)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ff4d4f' }}>
            {sources.filter(s => s.trustState === 'SUSPENDED').length}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Agents Suspended</div>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(114,46,209,0.04)', border: '1px solid rgba(114,46,209,0.12)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#722ed1' }}>{knownSymbols.length}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Symbols Tracked</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16 }}>
        {/* ── Score timeline chart ── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Fusion Score Timeline</div>
            <Select
              mode="multiple"
              size="small"
              value={selectedSymbols}
              onChange={setSelectedSymbols}
              style={{ minWidth: 180, fontSize: 12 }}
              maxTagCount={3}
              options={knownSymbols.map(s => ({ label: s, value: s }))}
              placeholder="Select symbols"
            />
          </div>
          {/* Action color legend */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            {Object.entries(ACTION_DOT).map(([action, color]) => (
              <span key={action} style={{ fontSize: 10, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                {action}
              </span>
            ))}
          </div>
          {loadingTimeline ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="small" />
            </div>
          ) : timelineData.length < 2 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
              Collecting data — check back in 1–2 minutes
            </div>
          ) : (
            <div style={{ height: 220 }}>
              <Line data={scoreChartData} options={scoreChartOptions} />
            </div>
          )}
        </div>

        {/* ── Label distribution ── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 14 }}>Label Distribution</div>
          {labelDistribution.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>No data yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {labelDistribution.map(stat => {
                const color = LABEL_COLORS_HEX[stat.label] || '#9ca3af';
                const cfg = LABEL_CONFIG[stat.label];
                return (
                  <div key={stat.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: color, fontWeight: 600 }}>{cfg?.label || stat.label}</span>
                      <span style={{ color: '#9ca3af' }}>{stat.count} ({stat.pct}%)</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: '#f5f5f5', overflow: 'hidden' }}>
                      <div style={{ width: `${stat.pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent decisions table ── */}
      <div style={{ marginTop: 16, background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '16px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 12 }}>Recent Cycle Decisions</div>
        <Table
          size="small"
          dataSource={recentRows}
          pagination={false}
          scroll={{ y: 240 }}
          columns={[
            { title: 'Time', dataIndex: 'time', key: 'time', width: 80,
              render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{v}</span> },
            { title: 'Symbol', dataIndex: 'symbol', key: 'symbol', width: 70,
              render: (v: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{v}</span> },
            { title: 'Action', dataIndex: 'action', key: 'action', width: 70,
              render: (v: string) => (
                <span style={{ fontWeight: 700, fontSize: 11, color: ACTION_DOT[v] || '#9ca3af' }}>{v}</span>
              ) },
            { title: 'Label', dataIndex: 'label', key: 'label',
              render: (v: string) => {
                const cfg = LABEL_CONFIG[v];
                return cfg ? (
                  <Tag style={{ borderRadius: 4, fontSize: 10, border: `1px solid ${cfg.border}`, color: cfg.color, background: cfg.bg }}>
                    {cfg.label}
                  </Tag>
                ) : <Tag>{v}</Tag>;
              } },
            { title: 'Score', dataIndex: 'score', key: 'score', width: 60,
              render: (v: number) => (
                <span style={{ fontWeight: 700, fontSize: 12, color: v >= 65 ? '#52c41a' : v >= 50 ? '#faad14' : '#9ca3af' }}>{v}</span>
              ) },
            { title: 'Agents', dataIndex: 'agents', key: 'agents', width: 60,
              render: (v: number) => <span style={{ fontSize: 11, color: v > 0 ? '#1677ff' : '#d1d5db' }}>{v > 0 ? `${v} ext` : '—'}</span> },
          ]}
        />
      </div>
    </div>
  );
};

export default AgentDashboard;

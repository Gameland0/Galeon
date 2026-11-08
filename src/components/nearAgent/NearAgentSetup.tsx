import React, { useState } from 'react';
import { Button, Typography, message, Divider } from 'antd';
import {
  WalletOutlined, ThunderboltOutlined, RocketOutlined,
  CheckCircleOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import { useNearWallet } from '../../contexts/NearWalletContext';
import FundAccount from './FundAccount';
import StrategySelector from './StrategySelector';

const { Text } = Typography;

// ── Design tokens ─────────────────────────────────────────────────────────────
const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.75)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 2px 20px rgba(0,0,0,0.05)',
  padding: '32px 36px',
};

const BRAIN_STATS = [
  { label: 'Total Trades',   value: '7,704' },
  { label: 'Win Rate',       value: '59.3%' },
  { label: 'Cumul. Return',  value: '+244%' },
  { label: 'Decision Acc.',  value: '68.7%' },
];

const STEPS = [
  { label: 'Connect Wallet', icon: <WalletOutlined /> },
  { label: 'Fund Account',   icon: <ThunderboltOutlined /> },
  { label: 'Start Brain',    icon: <RocketOutlined /> },
];

interface NearAgentSetupProps { onComplete?: () => void; }

const NearAgentSetup: React.FC<NearAgentSetupProps> = ({ onComplete }) => {
  const { accountId, isConnected, connectWallet, agentAuthorized, authorizeAgent, agentKeyPublic } = useNearWallet();
  const [currentStep, setCurrentStep] = useState(isConnected ? (agentAuthorized ? 2 : 1) : 0);
  const [authorizing, setAuthorizing] = useState(false);
  const [hlAddress, setHlAddress] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('stable');

  React.useEffect(() => {
    if (!isConnected) setCurrentStep(0);
    else if (!agentAuthorized) setCurrentStep(s => Math.max(s, 1));
    else setCurrentStep(s => Math.max(s, 2));
  }, [isConnected, agentAuthorized]);

  const hlValid = /^0x[0-9a-fA-F]{40}$/.test(hlAddress);

  // ── Step bar ─────────────────────────────────────────────────────────────────
  const StepBar = () => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
      {STEPS.map((s, i) => (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: currentStep > i ? '#1677ff' : currentStep === i ? '#e8f0fe' : '#f0f0f0',
              color: currentStep > i ? '#fff' : currentStep === i ? '#1677ff' : '#bbb',
              border: currentStep === i ? '2px solid #1677ff' : '2px solid transparent',
            }}>
              {currentStep > i ? <CheckCircleOutlined style={{ fontSize: 13 }} /> : i + 1}
            </div>
            <span style={{
              fontSize: 13,
              fontWeight: currentStep === i ? 600 : 400,
              color: currentStep === i ? '#111' : currentStep > i ? '#1677ff' : '#bbb',
            }}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              flex: 1, height: 1, margin: '0 12px',
              background: currentStep > i ? '#1677ff' : '#e5e7eb',
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  // ── Step 0: Connect ───────────────────────────────────────────────────────────
  const renderConnectStep = () => (
    <div style={glass}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
          background: '#1677ff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <WalletOutlined style={{ fontSize: 26, color: '#fff' }} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 6 }}>
          Connect Your NEAR Wallet
        </div>
        <div style={{ fontSize: 14, color: '#6b7280', maxWidth: 380, margin: '0 auto' }}>
          Galeon Brain uses your NEAR identity to access the Intents protocol. Your keys never leave your wallet.
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 28 }}>
        {BRAIN_STATS.map(s => (
          <div key={s.label} style={{
            textAlign: 'center', padding: '14px 8px', borderRadius: 12,
            background: 'rgba(22,119,255,0.04)',
            border: '1px solid rgba(22,119,255,0.1)',
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1677ff', letterSpacing: -0.5 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <Button
        type="primary" size="large" icon={<WalletOutlined />}
        onClick={connectWallet} block
        style={{ height: 48, fontSize: 15, borderRadius: 12, border: 'none', background: '#1677ff' }}
      >
        Connect Meteor Wallet
      </Button>
    </div>
  );

  // ── Step 1: Fund ──────────────────────────────────────────────────────────────
  const renderFundStep = () => (
    <div style={glass}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          background: '#1677ff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ThunderboltOutlined style={{ fontSize: 20, color: '#fff' }} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>Fund Your Trading Account</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Any chain · Any asset · Directly to Hyperliquid</div>
        </div>
      </div>

      <div style={{
        padding: '10px 14px', borderRadius: 10, marginBottom: 20,
        background: 'rgba(22,119,255,0.04)', border: '1px solid rgba(22,119,255,0.12)',
        fontSize: 13, color: '#374151',
      }}>
        Powered by <strong style={{ color: '#1677ff' }}>NEAR Intents</strong> — send USDC from Ethereum, Base, Solana or any supported chain. Protocol handles cross-chain routing automatically.
      </div>

      <FundAccount accountId={accountId!} onFundComplete={() => message.success('Account funded — ready to start Brain!')} />

      <Divider style={{ margin: '20px 0' }} />
      <div style={{ textAlign: 'center' }}>
        <Text style={{ fontSize: 13, color: '#9ca3af' }}>Already have funds in Hyperliquid? </Text>
        <Button type="link" size="small" onClick={() => setCurrentStep(2)} style={{ padding: '0 4px', fontSize: 13 }}>
          Skip <ArrowRightOutlined />
        </Button>
      </div>
    </div>
  );

  // ── Step 2: Start Brain ───────────────────────────────────────────────────────
  const renderStartBrainStep = () => (
    <div style={glass}>
      {agentAuthorized ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto 14px',
            background: '#52c41a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckCircleOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 4 }}>Brain is Active</div>
          <div style={{ fontSize: 13, color: '#9ca3af', fontFamily: 'monospace' }}>{agentKeyPublic?.slice(0, 32)}...</div>
          <Button
            type="primary" size="large" onClick={onComplete}
            style={{ marginTop: 20, height: 46, paddingInline: 36, borderRadius: 12, background: '#1677ff', border: 'none' }}
          >
            Go to Dashboard <ArrowRightOutlined />
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
              background: '#1677ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RocketOutlined style={{ fontSize: 26, color: '#fff' }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 6 }}>Start Galeon Brain</div>
            <div style={{ fontSize: 13, color: '#6b7280', maxWidth: 380, margin: '0 auto' }}>
              Authorize a limited Function-Call Key — Brain trades autonomously on your behalf.
            </div>
          </div>

          {/* Permissions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { title: 'Allowed', items: ['Call intents.near for swaps', 'Route funds to Hyperliquid', 'Execute perp trades via signals'], positive: true },
              { title: 'Not Allowed', items: ['Transfer NEAR to other accounts', 'Manage your keys / account', 'Access any other contract'], positive: false },
            ].map(p => (
              <div key={p.title} style={{
                padding: '14px 16px', borderRadius: 12,
                background: p.positive ? 'rgba(82,196,26,0.04)' : 'rgba(255,77,79,0.04)',
                border: `1px solid ${p.positive ? 'rgba(82,196,26,0.15)' : 'rgba(255,77,79,0.15)'}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: p.positive ? '#389e0d' : '#cf1322', marginBottom: 8 }}>
                  {p.positive ? '✓' : '✗'} {p.title}
                </div>
                {p.items.map(item => (
                  <div key={item} style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, paddingLeft: 2 }}>· {item}</div>
                ))}
              </div>
            ))}
          </div>

          {/* HL Address + Strategy */}
          <div style={{ padding: '16px 18px', borderRadius: 12, background: '#fafafa', border: '1px solid #f0f0f0' }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Hyperliquid EVM Address</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>app.hyperliquid.xyz → Profile</span>
              </div>
              <input
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13,
                  fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
                  border: `1.5px solid ${hlAddress && !hlValid ? '#ff4d4f' : hlValid ? '#52c41a' : '#e5e7eb'}`,
                  background: '#fff',
                  boxShadow: hlValid ? '0 0 0 3px rgba(82,196,26,0.08)' : 'none',
                  transition: 'all 0.2s',
                }}
                placeholder="0x..."
                value={hlAddress}
                onChange={e => setHlAddress(e.target.value.trim())}
              />
              {hlAddress && !hlValid && (
                <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>Invalid EVM address format</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Strategy</div>
              <StrategySelector
                selectedStrategy={selectedStrategy}
                onStrategyChange={setSelectedStrategy}
              />
            </div>
          </div>

          <Button
            type="primary" size="large" icon={<RocketOutlined />}
            loading={authorizing} disabled={!hlValid} block
            style={{
              height: 48, fontSize: 15, borderRadius: 12, border: 'none',
              background: hlValid ? '#1677ff' : undefined,
            }}
            onClick={async () => {
              setAuthorizing(true);
              try {
                await authorizeAgent(hlAddress, selectedStrategy);
                message.success('Galeon Brain activated!');
              } catch (err: any) {
                message.error(`Failed: ${err.message}`);
              } finally {
                setAuthorizing(false);
              }
            }}
          >
            Start Galeon Brain
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <StepBar />
      {currentStep === 0 && renderConnectStep()}
      {currentStep === 1 && renderFundStep()}
      {currentStep === 2 && renderStartBrainStep()}
    </div>
  );
};

export default NearAgentSetup;

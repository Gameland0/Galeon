/**
 * HLAgentSetup — Hyperliquid Agent Authorization Wizard
 *
 * 4-step flow:
 *   Step 0: Connect MetaMask
 *   Step 1: Check HL Account Balance
 *   Step 2: Authorize Brain (EIP-712 approveAgent + approveBuilderFee)
 *   Step 3: Set Trading Params
 */

import React, { useState, useCallback } from 'react';
import { api } from '../../services/api';
import './HLAgentSetup.css';

const HL_AGENT_ADDRESS = process.env.REACT_APP_HL_AGENT_ADDRESS || '';
const HL_BUILDER_ADDRESS = process.env.REACT_APP_HL_BUILDER_ADDRESS || '';
const HL_BUILDER_FEE_BPS = 5;

const APPROVE_AGENT_TYPES = {
  'HyperliquidTransaction:ApproveAgent': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'agentAddress', type: 'address' },
    { name: 'agentName', type: 'string' },
    { name: 'nonce', type: 'uint64' },
  ],
};

const APPROVE_BUILDER_FEE_TYPES = {
  'HyperliquidTransaction:ApproveBuilderFee': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'maxFeeRate', type: 'string' },
    { name: 'builder', type: 'address' },
    { name: 'nonce', type: 'uint64' },
  ],
};

// HL supports signing via Arbitrum (chainId 42161) — no fake network needed.
// MetaMask enforces domain.chainId === active network, so we switch to Arbitrum.
const HL_DOMAIN = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: 42161,
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

const EIP712_DOMAIN_TYPES = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

interface HLConfig {
  hl_leverage: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  hl_trade_amount: number;
  daily_loss_limit: number;
}

interface Props {
  onComplete?: (masterAddress: string) => void;
  onClose?: () => void;
}

const STEP_LABELS = ['Connect', 'Balance', 'Authorize', 'Configure'];

function shortAddr(addr: string) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function parseSignature(sig: string) {
  const r = sig.slice(0, 66);
  const s = '0x' + sig.slice(66, 130);
  const v = parseInt(sig.slice(130, 132), 16);
  return { r, s, v };
}

const HLAgentSetup: React.FC<Props> = ({ onComplete, onClose }) => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [account, setAccount] = useState('');
  const [balance, setBalance] = useState(0);
  const [config, setConfig] = useState<HLConfig>({
    hl_leverage: 3,
    stop_loss_pct: 7,
    take_profit_pct: 15,
    hl_trade_amount: 50,
    daily_loss_limit: -15,
  });
  const [tradeAmountInput, setTradeAmountInput] = useState('50');

  const connectWallet = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error('MetaMask not found. Please install it first.');
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) throw new Error('No wallet address found.');
      setAccount(accounts[0].toLowerCase());
      setStep(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkBalance = useCallback(async () => {
    if (!account) return;
    setError('');
    setLoading(true);
    try {
      const addr = account.toLowerCase();
      // Query via backend to avoid CORS issues with HL API
      const res = await api.get(`/hl/balance-check?address=${addr}`);
      const { perpBalance, spotBalance } = res.data;
      setBalance((perpBalance || 0) + (spotBalance || 0));
      setStep(2);
    } catch (e: any) {
      setError(`Failed to fetch balance: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [account]);

  const signAuthorizations = useCallback(async () => {
    if (!account) return;
    setError('');
    setLoading(true);

    const eth = (window as any).ethereum;
    let originalChainId: string | null = null;

    // Helper: switch MetaMask to chainId 1337 (HL signing chain)
    // MetaMask enforces domain.chainId === active chainId for signTypedData.
    // HL requires chainId 1337 in their EIP-712 domain, so we switch temporarily.
    // Switch to Arbitrum One (chainId 42161 = 0xa4b1) for HL signing
    async function switchToHLChain() {
      originalChainId = await eth.request({ method: 'eth_chainId' });
      if (originalChainId === '0xa4b1') return; // already on Arbitrum
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xa4b1' }] });
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xa4b1',
              chainName: 'Arbitrum One',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://arb1.arbitrum.io/rpc'],
              blockExplorerUrls: ['https://arbiscan.io'],
            }],
          });
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xa4b1' }] });
        } else {
          throw switchErr;
        }
      }
    }

    // Helper: restore original chain
    async function restoreChain() {
      if (originalChainId && originalChainId !== '0xa4b1') {
        try {
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: originalChainId }] });
        } catch (_) { /* non-critical */ }
      }
    }

    try {
      await switchToHLChain();

      const nonce = Date.now();

      const agentPayload = {
        hyperliquidChain: 'Mainnet',
        agentAddress: HL_AGENT_ADDRESS,
        agentName: 'GaleonBrain',
        nonce,
      };

      const agentSig = await eth.request({
        method: 'eth_signTypedData_v4',
        params: [
          account,
          JSON.stringify({
            types: { EIP712Domain: EIP712_DOMAIN_TYPES, ...APPROVE_AGENT_TYPES },
            primaryType: 'HyperliquidTransaction:ApproveAgent',
            domain: HL_DOMAIN,
            message: agentPayload,
          }),
        ],
      });

      if (HL_BUILDER_ADDRESS) {
        const feeNonce = nonce + 1;
        const feePayload = {
          hyperliquidChain: 'Mainnet',
          maxFeeRate: `${HL_BUILDER_FEE_BPS / 10000}%`,
          builder: HL_BUILDER_ADDRESS,
          nonce: feeNonce,
        };

        const feeSig = await eth.request({
          method: 'eth_signTypedData_v4',
          params: [
            account,
            JSON.stringify({
              types: { EIP712Domain: EIP712_DOMAIN_TYPES, ...APPROVE_BUILDER_FEE_TYPES },
              primaryType: 'HyperliquidTransaction:ApproveBuilderFee',
              domain: HL_DOMAIN,
              message: feePayload,
            }),
          ],
        });

        // Restore chain before API calls (non-blocking UX)
        await restoreChain();
        originalChainId = null;

        // Read response as text first so we can show the raw error if it's not JSON
        const agentBody = await (await fetch('https://api.hyperliquid.xyz/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: {
              type: 'approveAgent',
              hyperliquidChain: 'Mainnet',
              signatureChainId: '0xa4b1',
              agentAddress: HL_AGENT_ADDRESS.toLowerCase(),
              agentName: 'GaleonBrain',
              nonce,
            },
            nonce,
            signature: parseSignature(agentSig),
          }),
        })).text();
        let agentResult: any;
        try { agentResult = JSON.parse(agentBody); } catch (_) {
          throw new Error(`HL approveAgent: ${agentBody}`);
        }
        // "Extra agent already used" means this agent is already approved — treat as success
        if (agentResult?.status !== 'ok') {
          const errMsg = agentResult?.response || '';
          if (!errMsg.includes('Extra agent already used')) {
            throw new Error(`Authorization failed: ${JSON.stringify(agentResult)}`);
          }
        }

        const feeBody = await (await fetch('https://api.hyperliquid.xyz/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: {
              type: 'approveBuilderFee',
              hyperliquidChain: 'Mainnet',
              signatureChainId: '0xa4b1',
              maxFeeRate: feePayload.maxFeeRate,
              builder: HL_BUILDER_ADDRESS.toLowerCase(),
              nonce: feeNonce,
            },
            nonce: feeNonce,
            signature: parseSignature(feeSig),
          }),
        })).text();
        try {
          const feeResult = JSON.parse(feeBody);
          if (feeResult?.status !== 'ok') console.warn('approveBuilderFee non-critical:', feeResult);
        } catch (_) {
          console.warn('approveBuilderFee non-JSON:', feeBody);
        }
      } else {
        await restoreChain();
        originalChainId = null;

        const agentBody = await (await fetch('https://api.hyperliquid.xyz/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: {
              type: 'approveAgent',
              hyperliquidChain: 'Mainnet',
              signatureChainId: '0xa4b1',
              agentAddress: HL_AGENT_ADDRESS.toLowerCase(),
              agentName: 'GaleonBrain',
              nonce,
            },
            nonce,
            signature: parseSignature(agentSig),
          }),
        })).text();
        let agentResult: any;
        try { agentResult = JSON.parse(agentBody); } catch (_) {
          throw new Error(`HL approveAgent: ${agentBody}`);
        }
        if (agentResult?.status !== 'ok') {
          throw new Error(`Authorization failed: ${JSON.stringify(agentResult)}`);
        }
      }

      await api.post('/hl/connect', { masterAddress: account });

      setSuccess('Brain authorized successfully.');
      setTimeout(() => { setSuccess(''); setStep(3); }, 800);
    } catch (e: any) {
      await restoreChain();
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [account]);

  const saveConfig = useCallback(async () => {
    const amt = parseFloat(tradeAmountInput);
    if (isNaN(amt) || amt < 5) {
      setError('Per-trade amount must be at least $5.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/hl/config', {
        ...config,
        hl_trade_amount: amt,
      });
      onComplete?.(account);
    } catch (e: any) {
      if (e.response?.status === 401) {
        setError('Session expired. Please refresh the page, log in again, and retry.');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [config, tradeAmountInput, account, onComplete]);

  const stepState = (i: number) => {
    if (i < step) return 'done';
    if (i === step) return 'active';
    return 'idle';
  };

  return (
    <div className="hls-wrap">
      {/* Header */}
      <div className="hls-header">
        <div className="hls-header-left">
          <div className="hls-logo">🔷</div>
          <div>
            <h2 className="hls-title">Connect Hyperliquid</h2>
            <p className="hls-subtitle">Let Brain auto-trade perps on your behalf</p>
          </div>
        </div>
        {onClose && (
          <button className="hls-close" onClick={onClose}>✕</button>
        )}
      </div>

      {/* Step progress */}
      <div className="hls-steps">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className={`hls-step ${stepState(i)}`}>
            <div className="hls-step-dot">
              {i < step ? '✓' : i + 1}
            </div>
            <span className="hls-step-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="hls-divider" />

      {/* Body */}
      <div className="hls-body">
        {error && (
          <div className="hls-alert error">
            <span className="hls-alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="hls-alert success">
            <span className="hls-alert-icon">✅</span>
            <span>{success}</span>
          </div>
        )}

        {/* Step 0 */}
        {step === 0 && (
          <>
            <div className="hls-step-hero">
              <div className="hls-step-icon">🦊</div>
              <div>
                <p className="hls-step-title">Connect Your Wallet</p>
                <p className="hls-step-desc">We need your Hyperliquid account address</p>
              </div>
            </div>
            <ul className="hls-info-list">
              <li>Your funds always stay in your HL account</li>
              <li>Brain can only trade — it cannot withdraw</li>
              <li>You can revoke access anytime on Hyperliquid</li>
            </ul>
            <button className="hls-btn" onClick={connectWallet} disabled={loading}>
              {loading ? <><span className="hls-btn-spinner" /> Connecting...</> : 'Connect MetaMask'}
            </button>
          </>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <>
            <div className="hls-step-hero">
              <div className="hls-step-icon">💰</div>
              <div>
                <p className="hls-step-title">Check Account Balance</p>
                <p className="hls-step-desc">Wallet: {shortAddr(account)}</p>
              </div>
            </div>
            <ul className="hls-info-list">
              <li>You need USDC in your HL account as margin</li>
              <li>Recommended minimum: $100 USDC</li>
              <li>Deposit at app.hyperliquid.xyz → Deposit</li>
            </ul>
            <button className="hls-btn" onClick={checkBalance} disabled={loading}>
              {loading ? <><span className="hls-btn-spinner" /> Fetching...</> : 'Check Balance'}
            </button>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <div className="hls-step-hero">
              <div className="hls-step-icon">✍️</div>
              <div>
                <p className="hls-step-title">Authorize Brain</p>
                <p className="hls-step-desc">Two signatures required — no gas fees</p>
              </div>
            </div>

            <div className="hls-balance-card">
              <div>
                <div className="hls-balance-label">HL Account Balance</div>
                <div className="hls-balance-addr">{shortAddr(account)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="hls-balance-val">${balance.toFixed(2)}</div>
                <div className="hls-balance-unit">USDC</div>
              </div>
            </div>

            {balance === 0 && (
              <div className="hls-alert error" style={{ marginBottom: 14 }}>
                <span className="hls-alert-icon">⚠️</span>
                <span>No funds detected. You must deposit USDC at <strong>app.hyperliquid.xyz → Deposit</strong> before authorizing.</span>
              </div>
            )}
            {balance > 0 && balance < 10 && (
              <div className="hls-alert warning" style={{ marginBottom: 14 }}>
                <span className="hls-alert-icon">⚠️</span>
                <span>Low balance (${balance.toFixed(2)}). Recommended minimum is $100 USDC for trading.</span>
              </div>
            )}

            <ul className="hls-info-list">
              <li>Brain will open and close positions automatically</li>
              <li>Funds stay in your HL account — Brain cannot withdraw</li>
              <li>Revoke anytime at app.hyperliquid.xyz → Agents</li>
            </ul>
            <button className="hls-btn" onClick={signAuthorizations} disabled={loading || balance === 0}>
              {loading ? <><span className="hls-btn-spinner" /> Check MetaMask...</> : 'Authorize Brain'}
            </button>
          </>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <>
            <div className="hls-step-hero">
              <div className="hls-step-icon">⚙️</div>
              <div>
                <p className="hls-step-title">Configure Trading</p>
                <p className="hls-step-desc">You can adjust these anytime in Engine settings</p>
              </div>
            </div>

            <div className="hls-params">
              {/* Per-trade amount */}
              <div className="hls-param">
                <div className="hls-param-header">
                  <span className="hls-param-label">Per-Trade Amount</span>
                  <span className="hls-param-val">${tradeAmountInput || '—'}</span>
                </div>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={tradeAmountInput}
                  onChange={e => {
                    setTradeAmountInput(e.target.value);
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) setConfig(c => ({ ...c, hl_trade_amount: v }));
                  }}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                />
                <div className="hls-param-hint">USDC per signal · Minimum $5</div>
              </div>

              {/* Daily loss circuit breaker */}
              <div className="hls-param">
                <div className="hls-param-header">
                  <span className="hls-param-label">Daily Loss Limit</span>
                  <span className="hls-param-val" style={{ color: '#dc2626' }}>{config.daily_loss_limit}%</span>
                </div>
                <input
                  type="range" min={-50} max={-1} step={1} value={config.daily_loss_limit}
                  onChange={e => setConfig(c => ({ ...c, daily_loss_limit: parseFloat(e.target.value) }))}
                />
                <div className="hls-param-hint">Auto-pause trading if daily loss reaches this level · Range −1% to −50%</div>
              </div>
            </div>

            <button className="hls-btn" onClick={saveConfig} disabled={loading}>
              {loading ? <><span className="hls-btn-spinner" /> Saving...</> : 'Save & Start Trading'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default HLAgentSetup;

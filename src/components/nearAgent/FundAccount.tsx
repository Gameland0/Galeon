/**
 * FundAccount — Multi-chain deposit to Hyperliquid via NEAR Intents
 */

import React, { useState, useEffect } from 'react';
import { Select, InputNumber, Button, Typography, Space, message, Spin, Steps, Alert } from 'antd';
import { SwapOutlined, CheckCircleOutlined, LoadingOutlined, ArrowDownOutlined, WalletOutlined } from '@ant-design/icons';
import { fetchTokens, getQuote, pollStatus, IntentsToken, IntentsStatus } from '../../services/nearIntentsService';
import { INTENTS_API_BASE, INTENTS_API_KEY } from '../../config/near';
import { useNearWallet } from '../../contexts/NearWalletContext';

const { Text } = Typography;

const HL_USDC_ASSET = '1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054';

const CHAIN_LABELS: Record<string, { label: string }> = {
  eth: { label: 'Ethereum' }, base: { label: 'Base' }, arb: { label: 'Arbitrum' },
  sol: { label: 'Solana' }, bsc: { label: 'BSC' }, near: { label: 'NEAR' },
  btc: { label: 'Bitcoin' }, ton: { label: 'TON' }, pol: { label: 'Polygon' }, trx: { label: 'TRON' },
};

type Phase = 'input' | 'quoting' | 'quoted' | 'tracking' | 'done' | 'error';

interface FundAccountProps { accountId: string; onFundComplete?: () => void; }

const FundAccount: React.FC<FundAccountProps> = ({ accountId, onFundComplete }) => {
  const { selector } = useNearWallet();
  const [tokens, setTokens] = useState<IntentsToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [amount, setAmount] = useState<number>(100);
  const [hlAddress, setHlAddress] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [depositAddress, setDepositAddress] = useState('');
  const [depositMemo, setDepositMemo] = useState<string | null>(null);
  const [quoteAmountOut, setQuoteAmountOut] = useState('');
  const [quoteDeadline, setQuoteDeadline] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [signingWallet, setSigningWallet] = useState(false);

  useEffect(() => {
    fetchTokens()
      .then(list => {
        setTokens(list);
        const baseUsdc = list.find(t => t.assetId?.includes('base') && t.symbol === 'USDC');
        if (baseUsdc) setSelectedAsset(baseUsdc.assetId);
        else if (list.length > 0) setSelectedAsset(list[0].assetId);
      })
      .catch(() => { setTokens(FALLBACK_TOKENS); setSelectedAsset(FALLBACK_TOKENS[0].assetId); })
      .finally(() => setLoadingTokens(false));
  }, []);

  const selectedToken = tokens.find(t => t.assetId === selectedAsset);

  const getChainLabel = (assetId: string) => {
    const key = Object.keys(CHAIN_LABELS).find(k => assetId?.includes(k + '-') || assetId?.startsWith(`nep141:${k}`));
    return key ? CHAIN_LABELS[key].label : 'NEAR';
  };

  const tokenOptions = tokens
    .filter(t => t.assetId !== HL_USDC_ASSET)
    .map(t => ({
      value: t.assetId,
      label: `${getChainLabel(t.assetId)} · ${t.symbol}`,
      searchLabel: `${t.symbol} ${getChainLabel(t.assetId)}`,
    }));

  const handleGetQuote = async () => {
    if (!selectedAsset || !amount || !hlAddress) { message.warning('Please fill all fields'); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(hlAddress)) { message.error('Invalid Hyperliquid EVM address'); return; }
    setPhase('quoting');
    try {
      const decimals = selectedToken?.decimals ?? 6;
      const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals))).toString();
      const quote = await getQuote({
        dry: false, swapType: 'EXACT_INPUT',
        originAsset: selectedAsset, destinationAsset: HL_USDC_ASSET,
        amount: rawAmount, recipient: hlAddress, refundTo: accountId,
        depositType: 'ORIGIN_CHAIN', recipientType: 'DESTINATION_CHAIN',
        refundType: 'INTENTS', slippageTolerance: 100,
      });
      setDepositAddress(quote.quote.depositAddress);
      setDepositMemo(quote.quote.depositMemo);
      setQuoteAmountOut(quote.quote.amountOutFormatted);
      setQuoteDeadline(quote.quote.deadline);
      setPhase('quoted');
    } catch (err: any) { setPhase('error'); setStatusMsg(`Quote failed: ${err.message}`); }
  };

  const handleStartTracking = async () => {
    setPhase('tracking'); setStatusMsg('Waiting for your deposit…');
    try {
      const result = await pollStatus(depositAddress, (s: IntentsStatus) => {
        const msgs: Record<string, string> = {
          PENDING_DEPOSIT: 'Waiting for deposit…',
          KNOWN_DEPOSIT_TX: 'Deposit detected, processing…',
          PROCESSING: 'Routing via NEAR Intents…',
        };
        setStatusMsg(msgs[s.status] || s.status);
      });
      if (result.status === 'SUCCESS') {
        setPhase('done'); message.success('Funds arrived!'); onFundComplete?.();
      } else {
        setPhase('error'); setStatusMsg(`Transaction ended: ${result.status}. Refund will go to your Intents Balance.`);
      }
    } catch (err: any) { setPhase('error'); setStatusMsg(err.message); }
  };

  // Detect if origin token is NEAR-native (can sign directly from wallet)
  const isNearOrigin = selectedToken?.blockchain === 'near' ||
    selectedToken?.assetId?.startsWith('nep141:near') ||
    selectedToken?.assetId === 'near' ||
    selectedToken?.assetId?.includes('wrap.near');

  // Sign and send directly from connected NEAR wallet
  const handleSignWithWallet = async () => {
    if (!selector || !depositAddress) return;
    setSigningWallet(true);
    try {
      const { actionCreators } = await import('@near-js/transactions');
      const wallet = await selector.wallet();
      const decimals = selectedToken?.decimals ?? 24;
      const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals))).toString();

      if (selectedToken?.assetId === 'near' || selectedToken?.assetId?.includes('wrap.near') || !selectedToken?.assetId?.includes('nep141')) {
        // Native NEAR transfer (yoctoNEAR)
        const yocto = (BigInt(Math.round(amount * 1e4)) * BigInt(1e20)).toString();
        await wallet.signAndSendTransaction({
          receiverId: depositAddress,
          actions: [actionCreators.transfer(BigInt(yocto))],
        });
      } else {
        // NEP-141 token → ft_transfer_call to deposit address
        await wallet.signAndSendTransaction({
          receiverId: selectedToken!.assetId.replace('nep141:', '').split('.omft')[0] + '.omft.near',
          actions: [
            actionCreators.functionCall(
              'ft_transfer_call',
              { receiver_id: depositAddress, amount: rawAmount, msg: depositMemo || '' },
              BigInt('50000000000000'),
              BigInt('1'),
            ),
          ],
        });
      }

      // Start tracking after wallet confirms
      await handleStartTracking();
    } catch (err: any) {
      setSigningWallet(false);
      if (err?.message?.includes('User cancelled') || err?.message?.includes('rejected')) {
        message.warning('Transaction cancelled');
      } else {
        setPhase('error');
        setStatusMsg(err.message || 'Wallet signing failed');
      }
    }
  };

  const hlValid = /^0x[0-9a-fA-F]{40}$/.test(hlAddress);
  const chainLabel = selectedToken ? getChainLabel(selectedToken.assetId) : '—';

  if (loadingTokens) return <div style={{ textAlign: 'center', padding: 32 }}><Spin tip="Loading assets…" /></div>;

  // ── Input phase ───────────────────────────────────────────────────────────────
  if (phase === 'input') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* FROM */}
      <div style={{ padding: '14px 16px', borderRadius: 12, background: '#fafafa', border: '1px solid #f0f0f0' }}>
        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
          Step 1 · Select source chain &amp; amount
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
          选择你打算从哪条链发送，系统会生成对应的充值地址。选 NEAR 可直接用钱包签名。
        </div>
        {isNearOrigin && (
          <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(22,119,255,0.06)', border: '1px solid rgba(22,119,255,0.15)', fontSize: 12, color: '#1677ff' }}>
            <WalletOutlined style={{ marginRight: 5 }} />
            NEAR wallet detected — you can sign directly, no manual transfer needed
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <Select
            showSearch value={selectedAsset} onChange={setSelectedAsset}
            options={tokenOptions}
            filterOption={(input, opt) => (opt?.searchLabel as string)?.toLowerCase().includes(input.toLowerCase())}
            style={{ flex: 1 }} size="large"
          />
          <InputNumber
            value={amount} onChange={v => setAmount(v || 0)} min={1}
            style={{ width: 110 }} size="large"
          />
        </div>
      </div>

      {/* Arrow */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: '50%',
          background: '#1677ff',
        }}>
          <ArrowDownOutlined style={{ color: '#fff', fontSize: 13 }} />
        </div>
      </div>

      {/* TO */}
      <div style={{ padding: '14px 16px', borderRadius: 12, background: '#fafafa', border: '1px solid #f0f0f0' }}>
        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
          Step 2 · Send from your own wallet
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
          获取充值地址后，用 MetaMask / Phantom 等钱包手动转账，NEAR Intents 自动路由到 HL
        </div>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
          Arrives as <strong>USDC</strong> in your HL account
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 5 }}>
          Your HL EVM Address <span style={{ fontSize: 11 }}>(app.hyperliquid.xyz → Profile)</span>
        </div>
        <input
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13,
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
        {hlAddress && !hlValid && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>Invalid EVM address</div>}
      </div>

      <Button
        type="primary" size="large" icon={<SwapOutlined />} onClick={handleGetQuote} block
        disabled={!selectedAsset || !amount || !hlValid}
        style={{ height: 46, fontSize: 14, borderRadius: 12, border: 'none', background: '#1677ff', marginTop: 4 }}
      >
        Get Quote via NEAR Intents
      </Button>
    </div>
  );

  // ── Quoting ───────────────────────────────────────────────────────────────────
  if (phase === 'quoting') return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <Spin size="large" />
      <div style={{ marginTop: 16, fontSize: 13, color: '#9ca3af' }}>Finding best route via NEAR Intents…</div>
    </div>
  );

  // ── Quoted ────────────────────────────────────────────────────────────────────
  if (phase === 'quoted') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Summary */}
      <div style={{ padding: '16px 18px', borderRadius: 12, background: '#fafafa', border: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>You Send</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>{amount}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{chainLabel} · {selectedToken?.symbol}</div>
          </div>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ArrowDownOutlined style={{ color: '#fff', fontSize: 12 }} />
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Arrives in HL</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#52c41a' }}>~{quoteAmountOut}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Hyperliquid · USDC</div>
          </div>
        </div>
      </div>

      {/* Deposit address */}
      <div style={{ padding: '14px 16px', borderRadius: 12, background: '#fafafa', border: '1px solid #f0f0f0' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          Send {amount} {selectedToken?.symbol} on {chainLabel} to:
        </div>
        <Text
          copyable={{ text: depositAddress }}
          code
          style={{ fontSize: 11, wordBreak: 'break-all', display: 'block', padding: '8px 10px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}
        >
          {depositAddress}
        </Text>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
          Expires: {new Date(quoteDeadline).toLocaleString()}
        </div>
      </div>

      {isNearOrigin && selector ? (
        <>
          <Alert
            type="info" showIcon
            message="Your NEAR wallet is connected — sign the transaction directly without copying addresses."
            style={{ borderRadius: 10, fontSize: 12 }}
          />
          <Button
            type="primary" size="large" block icon={<WalletOutlined />}
            loading={signingWallet} onClick={handleSignWithWallet}
            style={{ height: 46, borderRadius: 12, background: '#1677ff', border: 'none' }}
          >
            Sign with NEAR Wallet
          </Button>
        </>
      ) : (
        <>
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fffbe6', border: '1px solid #ffe58f', fontSize: 12, color: '#875800' }}>
            Send from your wallet, then click confirm. Intents detects the deposit and routes automatically.
          </div>
          <Button type="primary" size="large" block onClick={handleStartTracking}
            style={{ height: 46, borderRadius: 12, background: '#1677ff', border: 'none' }}
          >
            I've Sent — Track Now
          </Button>
        </>
      )}
      <Button type="link" block onClick={() => setPhase('input')} style={{ fontSize: 13 }}>← Change</Button>
    </div>
  );

  // ── Tracking ──────────────────────────────────────────────────────────────────
  if (phase === 'tracking') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ textAlign: 'center', padding: '28px 20px', borderRadius: 12, background: '#fafafa', border: '1px solid #f0f0f0' }}>
        <LoadingOutlined style={{ fontSize: 36, color: '#1677ff' }} />
        <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: '#111' }}>Routing via NEAR Intents</div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{statusMsg}</div>
      </div>
      <Steps size="small" current={statusMsg.includes('Routing') ? 2 : statusMsg.includes('detected') ? 1 : 0}
        items={[{ title: 'Deposit Detected' }, { title: 'Cross-chain Routing' }, { title: 'Arrives in HL' }]}
      />
    </div>
  );

  // ── Done ──────────────────────────────────────────────────────────────────────
  if (phase === 'done') return (
    <div style={{ textAlign: 'center', padding: '32px 20px', borderRadius: 12, background: 'rgba(82,196,26,0.04)', border: '1px solid rgba(82,196,26,0.15)' }}>
      <CheckCircleOutlined style={{ fontSize: 44, color: '#52c41a' }} />
      <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginTop: 12 }}>Funds Arrived!</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>USDC is now in your Hyperliquid account. Galeon Brain can start trading.</div>
    </div>
  );

  // ── Error ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,77,79,0.04)', border: '1px solid rgba(255,77,79,0.15)' }}>
        <div style={{ fontWeight: 600, color: '#cf1322', marginBottom: 4, fontSize: 13 }}>Transaction Issue</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>{statusMsg}</div>
      </div>
      <Button block onClick={() => setPhase('input')} style={{ borderRadius: 10 }}>Try Again</Button>
    </div>
  );
};

const FALLBACK_TOKENS: IntentsToken[] = [
  { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', symbol: 'USDC', decimals: 6, blockchain: 'base' },
  { assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', symbol: 'USDC', decimals: 6, blockchain: 'eth' },
  { assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near', symbol: 'USDC', decimals: 6, blockchain: 'arb' },
  { assetId: 'nep141:sol-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.omft.near', symbol: 'USDC', decimals: 6, blockchain: 'sol' },
  { assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near', symbol: 'USDT', decimals: 6, blockchain: 'eth' },
];

export default FundAccount;

/**
 * AgentWalletCard — MetaMask Agent Wallet integration
 *
 * Flow:
 * 1. Connect MetaMask
 * 2. Check USDC allowance for GaleonRouter
 * 3. If not approved → Approve USDC
 * 4. Enable Auto-Trade (calls contract + registers with backend)
 * 5. Brain auto-trades on Kuru DEX
 */
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getAgentWallet, enableAgentAutoTrade, createAgentWallet } from '../../services/brainLinkService';
import { switchToMonad, MONAD_CONTRACTS } from '../../config/monad';

const USDC_ADDRESS = process.env.REACT_APP_MONAD_USDC_ADDRESS || '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
const ROUTER_ADDRESS = MONAD_CONTRACTS.GaleonRouter;

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

const ROUTER_ABI = [
  'function enableAutoTrade(uint256 maxPerTrade, uint256 totalLimit, uint256 durationDays)',
  'function revokeAutoTrade()',
  'function getUserAuth(address user) view returns (bool enabled, uint256 maxPerTrade, uint256 totalLimit, uint256 totalUsed, uint256 expiresAt)',
];

interface Props {
  currentPrice: number | null;
}

const AgentWalletCard: React.FC<Props> = ({ currentPrice }) => {
  const [walletAddress, setWalletAddress] = useState('');
  const [walletData, setWalletData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [maxPerTrade, setMaxPerTrade] = useState('0.5');
  const [totalLimit, setTotalLimit] = useState('10');
  const [durationDays] = useState('30');
  const [selectedTokens, setSelectedTokens] = useState<string[]>(['MON']);

  const AVAILABLE_TOKENS = [
    { symbol: 'MON', name: 'Monad', pair: 'MON/USDC', volume: '$48M' },
    { symbol: 'ETH', name: 'Ethereum', pair: 'WETH/USDC', volume: '$6.9M' },
    { symbol: 'BTC', name: 'Bitcoin', pair: 'WBTC/USDC', volume: '$5.7M' },
  ];

  const toggleToken = (symbol: string) => {
    setSelectedTokens(prev =>
      prev.includes(symbol) ? prev.filter(t => t !== symbol) : [...prev, symbol]
    );
  };

  // Balances + allowance
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [monBalance, setMonBalance] = useState(0);
  const [usdcAllowance, setUsdcAllowance] = useState(0);
  const [approveAmount, setApproveAmount] = useState('10');
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [autoTradeAuth, setAutoTradeAuth] = useState<any>(null);

  // Refresh balances + allowance
  const refreshWalletData = async (addr: string) => {
    if (!addr || !(window as any).ethereum) return;
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      // MON balance
      const monBal = await provider.getBalance(addr);
      setMonBalance(parseFloat(ethers.formatEther(monBal)));

      // USDC balance + allowance
      if (USDC_ADDRESS && ROUTER_ADDRESS) {
        const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
        const bal = await usdc.balanceOf(addr);
        setUsdcBalance(parseFloat(ethers.formatUnits(bal, 6)));
        const allowance = await usdc.allowance(addr, ROUTER_ADDRESS);
        setUsdcAllowance(parseFloat(ethers.formatUnits(allowance, 6)));
      }

      // Check on-chain auto-trade auth
      if (ROUTER_ADDRESS) {
        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
        try {
          const auth = await router.getUserAuth(addr);
          const expiresAt = Number(auth.expiresAt);
          const now = Math.floor(Date.now() / 1000);
          if (auth.enabled && expiresAt > now) {
            setAutoTradeEnabled(true);
            setAutoTradeAuth({
              maxPerTrade: parseFloat(ethers.formatUnits(auth.maxPerTrade, 6)),
              totalLimit: parseFloat(ethers.formatUnits(auth.totalLimit, 6)),
              totalUsed: parseFloat(ethers.formatUnits(auth.totalUsed, 6)),
              daysRemaining: Math.floor((expiresAt - now) / 86400),
            });
          }
        } catch (e) {}
      }
    } catch (e) { console.error('Refresh failed:', e); }
  };

  useEffect(() => {
    if (!walletAddress) return;
    refreshWalletData(walletAddress);
    const timer = setInterval(() => refreshWalletData(walletAddress), 15000);
    return () => clearInterval(timer);
  }, [walletAddress]);

  // Step 1: Connect
  const connectWallet = async () => {
    setLoading(true); setStatus('Connecting...');
    try {
      if (!(window as any).ethereum) { setStatus('Install MetaMask'); setLoading(false); return; }
      const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      await switchToMonad();
      setWalletAddress(accounts[0]);
      await refreshWalletData(accounts[0]);
      setStatus('');
    } catch (e: any) { setStatus(e.message); }
    finally { setLoading(false); }
  };

  // Step 2: Approve USDC
  const approveUSDC = async () => {
    setLoading(true); setStatus('Approving USDC...');
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
      const amount = ethers.parseUnits(approveAmount, 6);
      const tx = await usdc.approve(ROUTER_ADDRESS, amount);
      setStatus('Waiting for confirmation...');
      await tx.wait();
      await refreshWalletData(walletAddress);
      setStatus('Approved!');
      setTimeout(() => setStatus(''), 3000);
    } catch (e: any) { setStatus('Approve failed: ' + (e.reason || e.message)); }
    finally { setLoading(false); }
  };

  // Step 3: Enable Auto-Trade (on-chain + backend)
  const enableAutoTrade = async () => {
    setLoading(true); setStatus('Enabling auto-trade...');
    try {
      // Verify chain
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 143) {
        setStatus('Please switch MetaMask to Monad network (Chain ID 143)');
        await switchToMonad();
        setLoading(false);
        return;
      }

      const signer = await provider.getSigner();
      console.log('Signer:', await signer.getAddress());
      console.log('Router:', ROUTER_ADDRESS);
      console.log('maxPerTrade:', maxPerTrade, '→', ethers.parseUnits(maxPerTrade, 6).toString());
      console.log('totalLimit:', totalLimit, '→', ethers.parseUnits(totalLimit, 6).toString());

      const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
      const maxWei = ethers.parseUnits(maxPerTrade, 6);
      const limitWei = ethers.parseUnits(totalLimit, 6);

      setStatus('Confirm in MetaMask...');
      const tx = await router.enableAutoTrade(maxWei, limitWei, parseInt(durationDays));
      setStatus('Waiting for confirmation...');
      await tx.wait();

      // Register with backend
      await createAgentWallet(walletAddress);
      await enableAgentAutoTrade(walletAddress, parseFloat(maxPerTrade), parseFloat(totalLimit));

      setAutoTradeEnabled(true);
      setAutoTradeAuth({
        maxPerTrade: parseFloat(maxPerTrade),
        totalLimit: parseFloat(totalLimit),
        totalUsed: 0,
        daysRemaining: parseInt(durationDays),
      });
      setStatus('');
    } catch (e: any) { setStatus('Failed: ' + (e.reason || e.message)); }
    finally { setLoading(false); }
  };

  // Revoke
  const revokeAutoTrade = async () => {
    setLoading(true); setStatus('Revoking...');
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
      const tx = await router.revokeAutoTrade();
      await tx.wait();
      setAutoTradeEnabled(false);
      setAutoTradeAuth(null);
      setStatus('Revoked');
      setTimeout(() => setStatus(''), 3000);
    } catch (e: any) { setStatus('Failed: ' + (e.reason || e.message)); }
    finally { setLoading(false); }
  };

  const needsApproval = usdcAllowance < parseFloat(approveAmount || '1');

  return (
    <div className="bl-card">
      <div className="bl-card-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Agent Wallet — Monad Mainnet
      </div>

      {/* Not Connected */}
      {!walletAddress && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
            Connect MetaMask to enable AI auto-trade on Kuru DEX.<br />
            Your funds stay in your wallet. Brain trades on your behalf.
          </p>
          <button className="bl-btn bl-btn-primary" disabled={loading} onClick={connectWallet}>
            {loading ? 'Connecting...' : 'Connect MetaMask'}
          </button>
          {status && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>{status}</p>}
        </div>
      )}

      {/* Connected */}
      {walletAddress && (
        <div>
          {/* Address + Disconnect */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>● Connected</span>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8, fontFamily: "'JetBrains Mono'" }}>
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
            </div>
            <button className="bl-btn bl-btn-secondary" style={{ padding: '4px 12px', fontSize: 10 }}
              onClick={() => { setWalletAddress(''); setAutoTradeEnabled(false); setAutoTradeAuth(null); }}>
              Disconnect
            </button>
          </div>

          {/* Balances */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', flex: 1 }}>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>USDC</div>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 18, fontWeight: 800, color: '#1e293b' }}>${usdcBalance.toFixed(2)}</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', flex: 1 }}>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>MON</div>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{monBalance.toFixed(4)}</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', flex: 1 }}>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>Approved</div>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 18, fontWeight: 800, color: usdcAllowance >= 1 ? '#22c55e' : '#94a3b8' }}>
                ${usdcAllowance.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Step 2: Approve USDC (if needed) */}
          {!autoTradeEnabled && needsApproval && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>Step 1: Approve USDC</div>
              <p style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>
                Allow GaleonRouter contract to trade with your USDC. You control the limit.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>$</span>
                <input type="number" value={approveAmount} onChange={e => setApproveAmount(e.target.value)}
                  style={{ width: 80, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: "'JetBrains Mono'", fontWeight: 700 }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>USDC</span>
                <button className="bl-btn bl-btn-primary" style={{ padding: '8px 20px', fontSize: 12, marginLeft: 'auto' }} disabled={loading} onClick={approveUSDC}>
                  {loading ? '...' : 'Approve'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Enable Auto-Trade */}
          {!autoTradeEnabled && !needsApproval && (
            <div style={{ background: '#f0f4ff', borderRadius: 10, padding: 14, marginBottom: 12, border: '1px solid #c7d2fe' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>Step 2: Enable Auto-Trade</div>
              <p style={{ fontSize: 11, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
                Select tokens and set limits. Brain will analyze and trade on Kuru DEX.
              </p>

              {/* Token Selection */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>Select tokens to trade</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {AVAILABLE_TOKENS.map(t => {
                    const selected = selectedTokens.includes(t.symbol);
                    return (
                      <div key={t.symbol} onClick={() => toggleToken(t.symbol)} style={{
                        flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                        background: selected ? '#4f7df9' : '#fff', color: selected ? '#fff' : '#1e293b',
                        border: selected ? '1px solid #4f7df9' : '1px solid #e2e8f0', transition: 'all 0.2s',
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{t.symbol}</div>
                        <div style={{ fontSize: 9, opacity: 0.7 }}>{t.pair}</div>
                        <div style={{ fontSize: 9, opacity: 0.5 }}>Vol: {t.volume}</div>
                      </div>
                    );
                  })}
                </div>
                {selectedTokens.length === 0 && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>Select at least one token</div>}
              </div>

              {/* Trade Params */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>Max per trade ($)</div>
                  <input type="number" value={maxPerTrade} onChange={e => setMaxPerTrade(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontFamily: "'JetBrains Mono'" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>Total limit ($)</div>
                  <input type="number" value={totalLimit} onChange={e => setTotalLimit(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontFamily: "'JetBrains Mono'" }} />
                </div>
              </div>

              <button className="bl-btn bl-btn-primary" style={{ width: '100%', fontSize: 13 }} disabled={loading || selectedTokens.length === 0} onClick={enableAutoTrade}>
                {loading ? 'Enabling...' : `Enable Auto-Trade — ${selectedTokens.join(', ')} (30 days)`}
              </button>
            </div>
          )}

          {/* Active */}
          {autoTradeEnabled && autoTradeAuth && (
            <div style={{ background: '#dcfce7', borderRadius: 10, padding: 14, marginBottom: 12, border: '1px solid #86efac' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>Auto-Trade Active ✅</div>
              <div className="bl-row"><span className="bl-row-label">Trading</span><span className="bl-row-val">{selectedTokens.join(', ')} on Kuru DEX</span></div>
              <div className="bl-row"><span className="bl-row-label">Max per trade</span><span className="bl-row-val">${autoTradeAuth.maxPerTrade.toFixed(2)}</span></div>
              <div className="bl-row"><span className="bl-row-label">Total limit</span><span className="bl-row-val">${autoTradeAuth.totalLimit.toFixed(2)}</span></div>
              <div className="bl-row"><span className="bl-row-label">Used</span><span className="bl-row-val">${autoTradeAuth.totalUsed.toFixed(2)}</span></div>
              <div className="bl-row"><span className="bl-row-label">Remaining</span><span className="bl-row-val green">${(autoTradeAuth.totalLimit - autoTradeAuth.totalUsed).toFixed(2)}</span></div>
              <div className="bl-row"><span className="bl-row-label">Days left</span><span className="bl-row-val">{autoTradeAuth.daysRemaining}</span></div>
              <div className="bl-row"><span className="bl-row-label">Fee</span><span className="bl-row-val">0.5% per trade</span></div>
              <p style={{ fontSize: 10, color: '#64748b', margin: '8px 0 0', lineHeight: 1.5 }}>
                Brain monitors markets 24/7. Trades execute automatically on Kuru DEX.
                Every trade is AI-Endorsed on Monad chain.
              </p>
              <button className="bl-btn bl-btn-secondary" style={{ width: '100%', marginTop: 10, fontSize: 11 }} disabled={loading} onClick={revokeAutoTrade}>
                {loading ? '...' : 'Revoke Auto-Trade'}
              </button>
            </div>
          )}

          {/* MM Plugin */}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
              MetaMask Agent Wallet Plugin
            </div>
            <p style={{ fontSize: 10, color: '#64748b', marginBottom: 6, lineHeight: 1.5 }}>
              Also available via MetaMask Agent Wallet CLI:
            </p>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#4f7df9', lineHeight: 1.8 }}>
              mm brain check MON<br />
              mm brain auto-trade<br />
              mm brain positions
            </div>
          </div>

          {/* Refresh */}
          <button className="bl-btn bl-btn-secondary" style={{ width: '100%', fontSize: 11 }}
            onClick={() => refreshWalletData(walletAddress)}>
            Refresh
          </button>

          {/* Status */}
          {status && <p style={{ fontSize: 11, color: status.includes('!') || status === 'Revoked' ? '#22c55e' : '#ef4444', marginTop: 6 }}>{status}</p>}
        </div>
      )}

      {/* MON Price */}
      {currentPrice && (
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>
          MON: <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: '#1e293b' }}>${currentPrice.toFixed(6)}</span>
          <span style={{ color: '#94a3b8', marginLeft: 8 }}>via Kuru DEX</span>
        </div>
      )}
    </div>
  );
};

export default AgentWalletCard;

/**
 * Wallet Manager Component
 * Features:
 * 1. Privy embedded wallet login
 * 2. Auto-create blockchain wallet address
 * 3. Deposit/Withdrawal functionality
 * 4. Backend-hosted, no user signature required each time
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../../contexts/PrivyWalletContext';
import { withdrawAutoTradeUsdt, withdrawAutoTradeSolana } from '../../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import './WalletManager.css';

interface DepositModalProps {
  address: string;
  chain: 'BSC' | 'Base' | 'Solana';
  onClose: () => void;
}

function DepositModal({ address, chain, onClose }: DepositModalProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💰 Deposit Address</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="deposit-instruction">
            {chain === 'BSC'
              ? '🔶 Transfer USDT (BEP20) to the following address:'
              : chain === 'Solana'
              ? '🟣 Transfer SOL or USDC to the following Solana address:'
              : '🔷 Transfer ETH or USDC to the following Base address:'}
          </p>

          <div className="address-display">
            <div className="address-text" style={{ fontSize: '12px', wordBreak: 'break-all' }}>{address}</div>
            <button
              className={`copy-btn ${copied ? 'copied' : ''}`}
              onClick={copyAddress}
            >
              {copied ? '✅ Copied' : '📋 Copy'}
            </button>
          </div>

          <div className="qr-placeholder">
            <div className="qr-box">
              <QRCodeSVG
                value={address}
                size={200}
                level="H"
                style={{ display: 'block', margin: '10px auto' }}
              />
              <p className="qr-note" style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                Scan with wallet app to transfer
              </p>
            </div>
          </div>

          <div className="deposit-warnings">
            <div className="warning-item">
              <span className="warning-icon">⚠️</span>
              <span>Only supports {chain === 'BSC' ? 'BSC (BEP20)' : chain === 'Solana' ? 'Solana' : 'Base'} network</span>
            </div>
            <div className="warning-item">
              <span className="warning-icon">⚠️</span>
              <span>Do not transfer from other networks or tokens</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

interface WithdrawModalProps {
  balance: { usdt: string; bnb: string; eth: string };
  chain: 'BSC' | 'Base' | 'Solana';
  solanaBalance?: string;  // Solana SOL balance
  onClose: () => void;
  onConfirm: (address: string, amount: string, token: string) => void;
}

function WithdrawModal({ balance, chain, solanaBalance, onClose, onConfirm }: WithdrawModalProps) {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [selectedToken, setSelectedToken] = useState<'USDT' | 'BNB' | 'ETH' | 'SOL' | 'USDC'>(
    chain === 'Solana' ? 'SOL' : 'USDT'
  );

  // Get current token balance
  const getCurrentBalance = () => {
    if (selectedToken === 'USDT') return balance.usdt;
    if (selectedToken === 'BNB') return balance.bnb;
    if (selectedToken === 'ETH') return balance.eth;
    if (selectedToken === 'SOL') return solanaBalance || '0';
    if (selectedToken === 'USDC') return '0';  // TODO: Add USDC balance support
    return '0';
  };

  // Get minimum withdrawal amount
  const getMinAmount = () => {
    if (selectedToken === 'USDT' || selectedToken === 'USDC') return 1;
    if (selectedToken === 'SOL') return 0.01;
    return 0.01;  // BNB/ETH
  };

  const handleConfirm = () => {
    setError('');

    // Validate address based on chain type
    if (!toAddress) {
      setError('Please enter a wallet address');
      return;
    }

    // EVM address validation (BSC/Base): 0x... 42 chars
    if (chain !== 'Solana') {
      if (!toAddress.startsWith('0x') || toAddress.length !== 42) {
        setError('Please enter a valid EVM wallet address (0x...)');
        return;
      }
    } else {
      // Solana address validation: Base58, typically 32-44 chars, no 0x prefix
      if (toAddress.startsWith('0x')) {
        setError('Solana addresses should not start with 0x');
        return;
      }
      if (toAddress.length < 32 || toAddress.length > 44) {
        setError('Please enter a valid Solana wallet address');
        return;
      }
      // Basic Base58 character check (no 0, O, I, l)
      if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(toAddress)) {
        setError('Invalid Solana address format (Base58 expected)');
        return;
      }
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    const balanceNum = parseFloat(getCurrentBalance());

    if (!amount || amountNum <= 0) {
      setError('Please enter withdrawal amount');
      return;
    }

    if (amountNum > balanceNum) {
      setError('Insufficient balance');
      return;
    }

    // Minimum withdrawal amount
    const minAmount = getMinAmount();
    if (amountNum < minAmount) {
      setError(`Minimum withdrawal amount is ${minAmount} ${selectedToken}`);
      return;
    }

    onConfirm(toAddress, amount, selectedToken);
  };

  const setMaxAmount = () => {
    const balanceNum = parseFloat(getCurrentBalance());
    // Reserve gas fee only for native tokens (BNB/ETH/SOL)
    // USDT/USDC gas is paid from native token balance, so no need to reserve
    const gasReserve = (selectedToken === 'USDT' || selectedToken === 'USDC') ? 0 :
                       (selectedToken === 'SOL' ? 0.001 : 0.001);
    const maxWithdraw = Math.max(0, balanceNum - gasReserve);
    const decimals = (selectedToken === 'USDT' || selectedToken === 'USDC') ? 2 : 6;
    setAmount(maxWithdraw.toFixed(decimals));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💸 Withdraw</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Select Token</label>
            <div className="filter-buttons" style={{ marginBottom: '12px' }}>
              {/* Show USDT for EVM chains (BSC/Base) */}
              {chain !== 'Solana' && (
                <button
                  className={`filter-btn ${selectedToken === 'USDT' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedToken('USDT');
                    setAmount('');
                  }}
                >
                  USDT
                </button>
              )}

              {/* BSC: Show BNB */}
              {chain === 'BSC' && (
                <button
                  className={`filter-btn ${selectedToken === 'BNB' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedToken('BNB');
                    setAmount('');
                  }}
                >
                  BNB
                </button>
              )}

              {/* Base: Show ETH */}
              {chain === 'Base' && (
                <button
                  className={`filter-btn ${selectedToken === 'ETH' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedToken('ETH');
                    setAmount('');
                  }}
                >
                  ETH
                </button>
              )}

              {/* Solana: Show SOL and USDC */}
              {chain === 'Solana' && (
                <>
                  <button
                    className={`filter-btn ${selectedToken === 'SOL' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedToken('SOL');
                      setAmount('');
                    }}
                  >
                    SOL
                  </button>
                  <button
                    className={`filter-btn ${selectedToken === 'USDC' ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedToken('USDC');
                      setAmount('');
                    }}
                  >
                    USDC
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Withdrawal Address</label>
            <input
              type="text"
              className="input-field"
              placeholder={chain === 'Solana' ? 'Solana address (Base58)...' : '0x...'}
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
            />
            <p className="input-hint">
              Please ensure address supports {chain} network
            </p>
          </div>

          <div className="form-group">
            <label>
              Withdrawal Amount
              <span className="balance-info">
                Available: {parseFloat(getCurrentBalance()).toFixed(selectedToken === 'USDT' ? 2 : 6)} {selectedToken}
              </span>
            </label>
            <div className="amount-input-group">
              <input
                type="number"
                className="input-field"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step={selectedToken === 'USDT' ? '0.01' : '0.000001'}
              />
              <button className="btn-max" onClick={setMaxAmount}>
                Max
              </button>
            </div>
            <p className="input-hint">
              Minimum withdrawal: {getMinAmount()} {selectedToken}
            </p>
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="withdraw-summary">
            <div className="summary-row">
              <span>Withdrawal Amount</span>
              <span>{amount || '0.00'} {selectedToken}</span>
            </div>
            <div className="summary-row">
              <span>Network Fee (Gas)</span>
              <span>
                ~{chain === 'BSC' ? '0.002 BNB' : chain === 'Solana' ? '0.00001 SOL' : '0.0005 ETH'}
              </span>
            </div>
            <div className="summary-row total">
              <span>Estimated Arrival</span>
              <span>
                {amount || '0.00'} {selectedToken}
              </span>
            </div>
            <p className="input-hint" style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>
              * Gas fee paid from {chain === 'BSC' ? 'BNB' : chain === 'Solana' ? 'SOL' : 'ETH'} balance
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleConfirm}>
            Confirm Withdrawal
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProfitStats {
  today: { profit: number; count: number };
  week: { profit: number; count: number };
  total: { profit: number; count: number };
}

export default function WalletManager() {
  const {
    isConnected,
    address,
    balance,
    login,
    logout,
    refreshBalance,
    isLoading,
    isCreatingWallet,
    walletCreationFailed,
    ready,
    authenticated,
    getAccessToken,
    // Session Signer functionality (EVM)
    sessionSignerEnabled,
    enableSessionSigner,
    // 🟣 Solana support
    solanaAddress,
    solanaBalance,
    solanaSessionSignerEnabled,
    enableSolanaSessionSigner,
    refreshSolanaBalance,
    createSolanaWallet,
    isCreatingSolanaWallet,
  } = useWallet();

  // Get Privy user and wallets for withdrawal signature
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [selectedChain, setSelectedChain] = useState<'BSC' | 'Base' | 'Solana'>('BSC');
  const [enablingSolanaSessionSigner, setEnablingSolanaSessionSigner] = useState(false);
  const [profitStats, setProfitStats] = useState<ProfitStats>({
    today: { profit: 0, count: 0 },
    week: { profit: 0, count: 0 },
    total: { profit: 0, count: 0 },
  });
  const [enablingSessionSigner, setEnablingSessionSigner] = useState(false);

  // Debug: print sessionSignerEnabled status
  useEffect(() => {
    // console.log('🔍 [WalletManager] sessionSignerEnabled status:', sessionSignerEnabled);
  }, [sessionSignerEnabled]);

  // 🔧 根据链获取显示币种
  const getDisplayCurrency = (chain: string) => {
    return chain === 'Solana' ? 'SOL' : 'USDT';
  };

  // Fetch profit statistics (use useCallback to avoid recreating)
  const fetchProfitStats = useCallback(async () => {
    // 🔧 修复: Solana 标签页使用 solanaAddress 或 address 作为查询标识
    const statsAddress = (selectedChain === 'Solana' && solanaAddress) ? solanaAddress : address;
    if (!statsAddress) return;

    try {
      // 🔧 按 selectedChain 过滤统计数据
      const response = await fetch(`/api/auto-trade/stats/${statsAddress}?chain=${selectedChain}`);
      if (response.ok) {
        const result = await response.json();

        if (result.success && result.data && result.data.stats) {
          const stats = result.data.stats;
          setProfitStats({
            today: {
              profit: stats.todayProfit || 0,
              count: stats.todayTrades || 0,
            },
            week: {
              profit: stats.weekProfit || 0,
              count: stats.weekTrades || 0,
            },
            total: {
              profit: stats.totalProfit || 0,
              count: stats.totalTrades || 0,
            },
          });
        }
      }
    } catch (error) {
      // console.error('Failed to fetch profit statistics:', error);
    }
  }, [address, solanaAddress, selectedChain]);

  // Auto refresh balance
  // 🔧 修复：移除 refreshBalance 和 fetchProfitStats 从依赖项
  // 这些函数现在使用 useCallback 包装，但我们不应该依赖它们，
  // 而是只依赖 address 变化时重新设置定时器
  useEffect(() => {
    const statsAddress = (selectedChain === 'Solana' && solanaAddress) ? solanaAddress : address;
    if (statsAddress) {
      refreshBalance();
      fetchProfitStats();

      // Refresh every 30 seconds
      const interval = setInterval(() => {
        refreshBalance();
        fetchProfitStats();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [address, solanaAddress, selectedChain]); // 🔧 依赖 address/solanaAddress 和 selectedChain，切换链时刷新统计

  // Debug info
  useEffect(() => {
    // console.log('🔍 Privy Status:', { ready, authenticated, isConnected, address: address ? `${address.slice(0, 6)}...` : null });
  }, [ready, authenticated, isConnected, address]);

  /**
   * Format address
   */
  const formatAddress = (addr: string | null) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  /**
   * Format balance
   */
  const formatBalance = (bal: string) => {
    const num = parseFloat(bal);
    if (num === 0) return '0.00';
    if (num < 0.01) return num.toFixed(6);
    return num.toFixed(2);
  };

  /**
   * Handle withdrawal - Routes to EVM or Solana based on selectedChain
   */
  const handleWithdraw = async (toAddress: string, amount: string, token: string) => {
    if (selectedChain === 'Solana') {
      return handleWithdrawSolana(toAddress, amount, token);
    } else {
      return handleWithdrawEVM(toAddress, amount, token);
    }
  };

  /**
   * Handle EVM withdrawal (BSC/Base)
   */
  const handleWithdrawEVM = async (toAddress: string, amount: string, token: string) => {
    try {
      if (!address || !user?.id) {
        alert('❌ Please connect wallet first');
        return;
      }

      console.log('Submitting EVM withdrawal request:', { address, toAddress, amount, token, chain: selectedChain });

      // Get Privy access token for authentication
      const accessToken = await getAccessToken();
      if (!accessToken) {
        alert('❌ Failed to get authentication token. Please try logging in again.');
        return;
      }

      // Find external wallet (the wallet user logged in with, e.g., MetaMask)
      // External wallet is used for signing withdrawal requests
      const externalWallet = wallets?.find(
        (w) => w.walletClientType !== 'privy' && w.address
      );

      if (!externalWallet) {
        alert('❌ External wallet not found. Please connect your wallet.');
        return;
      }

      const signerAddress = externalWallet.address;
      console.log('🔐 Using external wallet for signature:', signerAddress.substring(0, 10) + '...');

      // Build withdrawal request message
      const withdrawRequest = {
        action: 'WITHDRAW',
        userId: user.id,                // Privy User ID
        fromAddress: address,           // Current wallet address (Privy embedded wallet)
        toAddress: toAddress,           // Withdrawal destination address
        amount: amount,
        token: token,
        chain: selectedChain,
        timestamp: Date.now(),
        nonce: `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
      };

      console.log('📝 Withdrawal request:', withdrawRequest);

      // Request user signature using external wallet
      console.log('🔐 Requesting user signature from external wallet...');

      let signature: string;
      try {
        const message = JSON.stringify(withdrawRequest);

        // Use external wallet's signMessage method
        const provider = await externalWallet.getEthereumProvider();
        const signatureResult = await provider.request({
          method: 'personal_sign',
          params: [message, signerAddress],
        });
        signature = signatureResult as string;

        console.log('✅ Signature obtained from external wallet:', signature.substring(0, 20) + '...');

      } catch (signError: any) {
        console.error('❌ User rejected signature:', signError);
        alert('Withdrawal cancelled: Signature confirmation required');
        return;
      }

      // Call backend API to create withdrawal request with signature
      const result = await withdrawAutoTradeUsdt(
        withdrawRequest.userId,
        withdrawRequest.toAddress,
        withdrawRequest.amount,
        withdrawRequest.chain,
        withdrawRequest.token,
        accessToken,
        // Additional signature data
        {
          signature: signature,
          fromAddress: withdrawRequest.fromAddress,
          signerAddress: signerAddress,  // External wallet address for signature verification
          timestamp: withdrawRequest.timestamp,
          nonce: withdrawRequest.nonce,
          action: withdrawRequest.action
        }
      );

      console.log('Withdrawal result:', result);

      if (result.success) {
        alert(`✅ Withdrawal request submitted successfully!\n\nWithdrawal ID: ${result.data.withdrawalId}\nAmount: ${result.data.amount} ${token}\nTransaction Hash: ${result.data.txHash}\n\nPlease check on blockchain explorer.`);
        setShowWithdraw(false);

        // Refresh balance after 2 seconds
        setTimeout(() => refreshBalance(), 2000);
      } else {
        alert(`❌ Withdrawal failed:\n${result.error || 'Unknown error'}`);
      }

    } catch (error: any) {
      console.error('EVM withdrawal failed:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      alert(`❌ Withdrawal failed:\n${errorMsg}\n\nPlease try again later.`);
    }
  };

  /**
   * Handle Solana withdrawal (SOL/USDC)
   * Supports cross-chain signing: MetaMask can authorize Solana withdrawals
   */
  const handleWithdrawSolana = async (toAddress: string, amount: string, token: string) => {
    try {
      if (!solanaAddress || !user?.id) {
        alert('❌ Please create Solana wallet first');
        return;
      }

      console.log('Submitting Solana withdrawal request:', { solanaAddress, toAddress, amount, token });

      // Get Privy access token for authentication
      const accessToken = await getAccessToken();
      if (!accessToken) {
        alert('❌ Failed to get authentication token. Please try logging in again.');
        return;
      }

      // Find external wallet (MetaMask or Phantom)
      const externalWallet = wallets?.find(
        (w) => w.walletClientType !== 'privy' && w.address
      );

      if (!externalWallet) {
        alert('❌ External wallet not found. Please connect your wallet.');
        return;
      }

      // Determine signer type based on wallet
      const isMetaMask = externalWallet.walletClientType === 'metamask' ||
                         (externalWallet.address && externalWallet.address.startsWith('0x'));
      const isPhantom = externalWallet.walletClientType === 'phantom' ||
                        externalWallet.walletClientType === 'solana';

      const signerChainType = isMetaMask ? 'ethereum' : 'solana';
      const signerAddress = externalWallet.address;

      console.log('🔐 Signer wallet info:', {
        type: externalWallet.walletClientType,
        signerChainType,
        address: signerAddress.substring(0, 10) + '...'
      });

      // Build withdrawal request message (same format for both wallet types)
      const withdrawRequest = {
        action: 'WITHDRAW',
        userId: user.id,
        fromAddress: solanaAddress,     // Solana embedded wallet address
        toAddress: toAddress,
        amount: amount,
        token: token,
        chain: 'Solana',
        timestamp: Date.now(),
        nonce: `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
      };

      console.log('📝 Solana withdrawal request:', withdrawRequest);

      const message = JSON.stringify(withdrawRequest);
      let signature: string;

      try {
        if (signerChainType === 'ethereum') {
          // MetaMask signing (EVM signature)
          console.log('🔐 Requesting MetaMask signature for Solana withdrawal...');
          const provider = await externalWallet.getEthereumProvider();
          const signatureResult = await provider.request({
            method: 'personal_sign',
            params: [message, signerAddress],
          });
          signature = signatureResult as string;
          console.log('✅ MetaMask signature obtained:', signature.substring(0, 20) + '...');

        } else {
          // Phantom/Solana wallet signing (Solana signature)
          console.log('🔐 Requesting Phantom signature for Solana withdrawal...');
          const encoder = new TextEncoder();
          const messageBytes = encoder.encode(message);

          // Use Phantom's signMessage method
          // 🔧 修复: 优先使用 window.phantom?.solana (Phantom 官方推荐)
          const solanaProvider = (window as any).phantom?.solana || (window as any).solana;
          if (!solanaProvider) {
            throw new Error('Phantom wallet not found');
          }

          const signResult = await solanaProvider.signMessage(messageBytes, 'utf8');
          // Convert signature bytes to Base58
          const bs58 = await import('bs58');
          signature = bs58.default.encode(signResult.signature);
          console.log('✅ Phantom signature obtained (Base58):', signature.substring(0, 20) + '...');
        }

      } catch (signError: any) {
        console.error('❌ User rejected signature:', signError);
        alert('Withdrawal cancelled: Signature confirmation required');
        return;
      }

      // Call Solana withdrawal API
      const result = await withdrawAutoTradeSolana(
        withdrawRequest.userId,
        withdrawRequest.toAddress,
        withdrawRequest.amount,
        withdrawRequest.token,
        accessToken,
        {
          signature: signature,
          fromAddress: withdrawRequest.fromAddress,
          signerAddress: signerAddress,
          signerChainType: signerChainType,  // 'ethereum' or 'solana'
          timestamp: withdrawRequest.timestamp,
          nonce: withdrawRequest.nonce,
          action: withdrawRequest.action
        }
      );

      console.log('Solana withdrawal result:', result);

      if (result.success) {
        alert(`✅ Solana withdrawal submitted successfully!\n\nWithdrawal ID: ${result.data.withdrawalId}\nAmount: ${result.data.amount} ${token}\nTransaction Hash: ${result.data.signature}\n\nPlease check on Solana explorer.`);
        setShowWithdraw(false);

        // Refresh Solana balance after 2 seconds
        setTimeout(() => refreshSolanaBalance(), 2000);
      } else {
        alert(`❌ Solana withdrawal failed:\n${result.error || 'Unknown error'}`);
      }

    } catch (error: any) {
      console.error('Solana withdrawal failed:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      alert(`❌ Solana withdrawal failed:\n${errorMsg}\n\nPlease try again later.`);
    }
  };

  /**
   * Handle enable session signer (EVM)
   */
  const handleEnableSessionSigner = async () => {
    setEnablingSessionSigner(true);
    try {
      await enableSessionSigner();
      alert('✅ Auto Trading Enabled!\n\nThe system can now automatically execute trades on your behalf.');
    } catch (error: any) {
      // console.error('Enable failed:', error);
      alert(`❌ Enable failed:\n${error.message || 'Unknown error'}\n\nPlease try again later or contact support.`);
    } finally {
      setEnablingSessionSigner(false);
    }
  };

  /**
   * 🟣 Handle create Solana wallet
   */
  const handleCreateSolanaWallet = async () => {
    try {
      await createSolanaWallet();
      alert('✅ Solana Wallet Created!\n\nYour Solana wallet has been created successfully.');
    } catch (error: any) {
      console.error('❌ [Solana] Create wallet failed:', error);
      alert(`❌ Failed to create Solana wallet:\n${error.message || 'Unknown error'}\n\nPlease try again later.`);
    }
  };

  /**
   * 🟣 Handle enable Solana session signer
   */
  const handleEnableSolanaSessionSigner = async () => {
    setEnablingSolanaSessionSigner(true);
    try {
      console.log('🟣 启用 Solana 自动交易...');
      await enableSolanaSessionSigner();
      alert('✅ Solana Auto Trading Enabled!\n\nThe system can now automatically execute Solana/pump.fun trades on your behalf.');
    } catch (error: any) {
      console.error('❌ [Solana] Enable failed:', error);
      alert(`❌ Solana auto trading failed:\n${error.message || 'Unknown error'}\n\nPlease try again later or contact support.`);
    } finally {
      setEnablingSolanaSessionSigner(false);
    }
  };

  // Privy is still initializing
  if (!ready) {
    return (
      <div className="wallet-manager disconnected">
        <div className="wallet-card">
          <div className="wallet-icon">⏳</div>
          <h3>Initializing Privy...</h3>
          <p>Loading wallet service, please wait</p>
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated but no embedded wallet yet (Privy is creating)
  if (authenticated && !address) {
    return (
      <div className="wallet-manager no-address">
        <div className="wallet-card">
          <div className="wallet-icon">{walletCreationFailed ? '❌' : '⏳'}</div>
          <h3>{walletCreationFailed ? 'Wallet Creation Failed' : 'Creating Trading Wallet...'}</h3>
          <p>
            {walletCreationFailed
              ? 'Failed to create Privy embedded wallet. Please try again.'
              : isCreatingWallet
              ? 'Creating your exclusive private wallet (2-5 seconds)...'
              : 'Privy is preparing your trading wallet...'}
          </p>

          {!walletCreationFailed && (
            <div className="loading-spinner">
              <div className="spinner"></div>
            </div>
          )}

          {walletCreationFailed ? (
            <div style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                Retry
              </button>
              <button
                onClick={logout}
                style={{ padding: '8px 20px', background: '#374151', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="info-box">
              <p>✅ Supports BSC, Base, and Solana networks</p>
              <p>✅ Private key securely managed by Privy</p>
              <p>✅ Wallet address displayed after creation</p>
              <p style={{ color: '#fbbf24', marginTop: '8px' }}>
                ⏱️ {isCreatingWallet ? 'Generating wallet on Privy servers...' : 'Please wait, do not refresh the page'}
              </p>
            </div>
          )}

          {!walletCreationFailed && (
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '16px' }}>
              This usually takes just a few seconds...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Disconnected state (really need login)
  if (!authenticated) {
    return (
      <div className="wallet-manager disconnected">
        <div className="wallet-card">
          <div className="wallet-icon">🔒</div>
          <h3>Wallet Not Connected</h3>
          <p>Connect wallet to enable auto trading functionality</p>

          <button className="btn-connect" onClick={login}>
            Connect Wallet
          </button>

          <div className="features-list">
            <div className="feature-item">
              <span className="feature-icon">📱</span>
              <span>Supports email, Google login</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🔐</span>
              <span>Privy secure embedded wallet</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span>One-click blockchain address generation</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Connected and has address (normal working state)
  return (
    <div className="wallet-manager connected">
      <div className="wallet-card">
        <div className="wallet-header">
          <div className="status-badge connected">
            <span className="status-dot"></span>
            <span>Connected</span>
          </div>
          <button className="btn-logout" onClick={logout}>
            Disconnect
          </button>
        </div>

        <div className="wallet-address-section">
          <div className="address-label">Wallet Address - {selectedChain}</div>
          <div className="address-value" onClick={() => {
            const currentAddress = selectedChain === 'Solana' ? solanaAddress : address;
            if (currentAddress) {
              navigator.clipboard.writeText(currentAddress);
              alert('Address copied');
            }
          }} style={{ fontSize: '12px', wordBreak: 'break-all' }}>
            {selectedChain === 'Solana' ? (solanaAddress || 'Not created') : (address || 'Not connected')}
            <span className="copy-hint">📋</span>
          </div>
        </div>

        {/* Chain selector */}
        <div className="chain-selector" style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          padding: '8px',
          background: '#f3f4f6',
          borderRadius: '8px',
        }}>
          <button
            onClick={() => setSelectedChain('BSC')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '6px',
              border: 'none',
              background: selectedChain === 'BSC' ? 'linear-gradient(135deg, #f0b90b 0%, #f8d12f 100%)' : 'white',
              color: selectedChain === 'BSC' ? 'white' : '#6b7280',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            🔶 BSC
          </button>
          <button
            onClick={() => setSelectedChain('Base')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '6px',
              border: 'none',
              background: selectedChain === 'Base' ? 'linear-gradient(135deg, #0052ff 0%, #0066ff 100%)' : 'white',
              color: selectedChain === 'Base' ? 'white' : '#6b7280',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            🔷 Base
          </button>
          <button
            onClick={() => setSelectedChain('Solana')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '6px',
              border: 'none',
              background: selectedChain === 'Solana' ? 'linear-gradient(135deg, #9945ff 0%, #14f195 100%)' : 'white',
              color: selectedChain === 'Solana' ? 'white' : '#6b7280',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            🟣 Solana
          </button>
        </div>

        <div className="balance-section">
          <div className="balance-header">
            <h4>Account Balance - {selectedChain}</h4>
            <button
              className="btn-refresh-small"
              onClick={refreshBalance}
              disabled={isLoading}
            >
              {isLoading ? '⏳' : '🔄'}
            </button>
          </div>

          <div className="balance-grid">
            {selectedChain === 'BSC' ? (
              <>
                <div className="balance-card primary">
                  <div className="balance-label">USDT</div>
                  <div className="balance-amount">
                    ${formatBalance(balance.usdt)}
                  </div>
                  <div className="balance-network">🔶 BSC (BEP20)</div>
                </div>

                <div className="balance-card">
                  <div className="balance-label">BNB</div>
                  <div className="balance-amount">
                    {formatBalance(balance.bnb)}
                  </div>
                  <div className="balance-network">🔶 Gas Fee (BSC)</div>
                  <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>Min 0.01 BNB required</div>
                </div>
              </>
            ) : selectedChain === 'Base' ? (
              <>
                <div className="balance-card primary">
                  <div className="balance-label">ETH</div>
                  <div className="balance-amount">
                    {formatBalance(balance.eth)}
                  </div>
                  <div className="balance-network">🔷 Base</div>
                </div>

                <div className="balance-card">
                  <div className="balance-label">ETH</div>
                  <div className="balance-amount">
                    {formatBalance(balance.eth)}
                  </div>
                  <div className="balance-network">🔷 Gas Fee (Base)</div>
                  <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>Min 0.005 ETH required</div>
                </div>
              </>
            ) : (
              // 🟣 Solana chain
              <>
                <div className="balance-card primary">
                  <div className="balance-label">SOL</div>
                  <div className="balance-amount">
                    {solanaBalance || '0.00'}
                  </div>
                  <div className="balance-network">🟣 Solana Mainnet</div>
                </div>

                <div className="balance-card">
                  <div className="balance-label">Wallet</div>
                  <div className="balance-amount" style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                    {solanaAddress ? `${solanaAddress.slice(0, 8)}...${solanaAddress.slice(-6)}` : 'Not created'}
                  </div>
                  <div className="balance-network">🟣 Solana Address</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Profit Statistics */}
        <div className="profit-stats-section" style={{
          marginTop: '16px',
          padding: '16px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '12px',
          color: 'white',
        }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
            📊 Profit Statistics
          </h4>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
          }}>
            {/* Today's profit */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(10px)',
              padding: '12px',
              borderRadius: '8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Today</div>
              <div style={{
                fontSize: '18px',
                fontWeight: '700',
                color: profitStats.today.profit >= 0 ? '#4ade80' : '#f87171',
                marginBottom: '4px',
              }}>
                {profitStats.today.profit >= 0 ? '+' : ''}{profitStats.today.profit.toFixed(2)} {getDisplayCurrency(selectedChain)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>
                {profitStats.today.count} trades
              </div>
            </div>

            {/* This week's profit */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(10px)',
              padding: '12px',
              borderRadius: '8px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>This Week</div>
              <div style={{
                fontSize: '18px',
                fontWeight: '700',
                color: profitStats.week.profit >= 0 ? '#4ade80' : '#f87171',
                marginBottom: '4px',
              }}>
                {profitStats.week.profit >= 0 ? '+' : ''}{profitStats.week.profit.toFixed(2)} {getDisplayCurrency(selectedChain)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>
                {profitStats.week.count} trades
              </div>
            </div>

            {/* Total profit */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              padding: '12px',
              borderRadius: '8px',
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.3)',
            }}>
              <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Total</div>
              <div style={{
                fontSize: '18px',
                fontWeight: '700',
                color: profitStats.total.profit >= 0 ? '#4ade80' : '#f87171',
                marginBottom: '4px',
              }}>
                {profitStats.total.profit >= 0 ? '+' : ''}{profitStats.total.profit.toFixed(2)} {getDisplayCurrency(selectedChain)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>
                {profitStats.total.count} trades
              </div>
            </div>
          </div>

          {/* Return Rate */}
          {profitStats.total.count > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '10px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>Avg Profit Per Trade</span>
              <span style={{ fontWeight: '600' }}>
                {(profitStats.total.profit / profitStats.total.count).toFixed(2)} {getDisplayCurrency(selectedChain)}
              </span>
            </div>
          )}
        </div>

        <div className="action-buttons">
          <button
            className="btn-action deposit"
            onClick={() => setShowDeposit(true)}
          >
            <span className="btn-icon">💰</span>
            <span>Deposit</span>
          </button>

          <button
            className="btn-action withdraw"
            onClick={() => setShowWithdraw(true)}
          >
            <span className="btn-icon">💸</span>
            <span>Withdraw</span>
          </button>
        </div>

        {/* EVM Session Signer authorization card */}
        <div style={{
          marginTop: '20px',
          padding: '20px',
          borderRadius: '12px',
          background: sessionSignerEnabled
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: 'white',
          boxShadow: sessionSignerEnabled
            ? '0 4px 12px rgba(16, 185, 129, 0.3)'
            : '0 4px 12px rgba(245, 158, 11, 0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'start', gap: '16px' }}>
            <div style={{ fontSize: '32px' }}>
              {sessionSignerEnabled ? '✅' : '🔐'}
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '700' }}>
                {sessionSignerEnabled ? 'EVM Auto Trading Enabled' : 'Enable EVM Auto Trading'}
              </h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', opacity: 0.95, lineHeight: '1.5' }}>
                {sessionSignerEnabled
                  ? 'System is authorized to automatically execute EVM (BSC/Base) trades on your behalf.'
                  : 'After authorization, system will be able to automatically execute BSC and Base trades.'}
              </p>

              {!sessionSignerEnabled && (
                <button
                  onClick={handleEnableSessionSigner}
                  disabled={enablingSessionSigner}
                  style={{
                    padding: '10px 20px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    color: '#d97706',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: enablingSessionSigner ? 'not-allowed' : 'pointer',
                    opacity: enablingSessionSigner ? 0.7 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {enablingSessionSigner ? '⏳ Authorizing...' : '🚀 Enable EVM Auto Trade'}
                </button>
              )}

              {sessionSignerEnabled && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}>
                  <span>✓</span>
                  <span>Authorized for BSC and Base chains</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 🟣 Solana wallet creation / Session Signer authorization card */}
        {!solanaAddress ? (
          // 没有 Solana 钱包，显示创建钱包卡片
          <div style={{
            marginTop: '16px',
            padding: '20px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            color: 'white',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'start', gap: '16px' }}>
              <div style={{ fontSize: '32px' }}>🔨</div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '700' }}>
                  Create Solana Wallet
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '13px', opacity: 0.95, lineHeight: '1.5' }}>
                  Create a Solana wallet to enable auto trading for pump.fun tokens and other Solana-based assets.
                </p>
                <button
                  onClick={handleCreateSolanaWallet}
                  disabled={isCreatingSolanaWallet}
                  style={{
                    padding: '10px 20px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    color: '#6366f1',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: isCreatingSolanaWallet ? 'not-allowed' : 'pointer',
                    opacity: isCreatingSolanaWallet ? 0.7 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {isCreatingSolanaWallet ? '⏳ Creating...' : '🔨 Create Solana Wallet'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          // 已有 Solana 钱包，显示 Session Signer 授权卡片
          <div style={{
            marginTop: '16px',
            padding: '20px',
            borderRadius: '12px',
            background: solanaSessionSignerEnabled
              ? 'linear-gradient(135deg, #9945ff 0%, #14f195 100%)'
              : 'linear-gradient(135deg, #9945ff 0%, #8a2be2 100%)',
            color: 'white',
            boxShadow: solanaSessionSignerEnabled
              ? '0 4px 12px rgba(153, 69, 255, 0.3)'
              : '0 4px 12px rgba(138, 43, 226, 0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'start', gap: '16px' }}>
              <div style={{ fontSize: '32px' }}>
                🟣
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '700' }}>
                  {solanaSessionSignerEnabled ? 'Solana Auto Trading Enabled' : 'Enable Solana Auto Trading'}
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '13px', opacity: 0.95, lineHeight: '1.5' }}>
                  {solanaSessionSignerEnabled
                    ? 'System is authorized to automatically execute Solana/pump.fun trades.'
                    : 'Enable automatic trading for Solana tokens and pump.fun. The system will execute trades on your behalf using Session Signer.'}
                </p>

                {!solanaSessionSignerEnabled && (
                  <button
                    onClick={handleEnableSolanaSessionSigner}
                    disabled={enablingSolanaSessionSigner}
                    style={{
                      padding: '10px 20px',
                      background: 'rgba(255, 255, 255, 0.95)',
                      color: '#8a2be2',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: enablingSolanaSessionSigner ? 'not-allowed' : 'pointer',
                      opacity: enablingSolanaSessionSigner ? 0.7 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {enablingSolanaSessionSigner ? 'Enabling...' : 'Enable Auto Trading'}
                  </button>
                )}

                {solanaSessionSignerEnabled && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}>
                    <span>✓</span>
                    <span>Enabled Successfully</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deposit modal */}
      {showDeposit && (
        <DepositModal
          address={selectedChain === 'Solana' ? solanaAddress : address}
          chain={selectedChain}
          onClose={() => setShowDeposit(false)}
        />
      )}

      {/* Withdraw modal */}
      {showWithdraw && (
        <WithdrawModal
          balance={balance}
          chain={selectedChain}
          solanaBalance={solanaBalance}
          onClose={() => setShowWithdraw(false)}
          onConfirm={handleWithdraw}
        />
      )}
    </div>
  );
}

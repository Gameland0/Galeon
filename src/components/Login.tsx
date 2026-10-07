import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import './Login.css'; // 我们需要添加样式

const Login: React.FC = () => {
  const { 
    primaryWallet,
    isAuthenticated, 
    connectMetaMask, 
    connectPhantom,
    getCurrentAccount,
    credits,
    refreshCredits,
    isConnecting
  } = useContext(MultiWalletContext);
  
  const [isLoading, setIsLoading] = useState<'metamask' | 'phantom' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const navigate = useNavigate();

  // 获取当前账户
  const account = getCurrentAccount();
  const isConnected = !!account && isAuthenticated;

  // 处理credits刷新
  useEffect(() => {
    
    if (account && isAuthenticated && credits === null) {
      refreshCredits();
    }
  }, [account, isAuthenticated, credits, refreshCredits]);

  // 处理成功状态显示和跳转
  useEffect(() => {
    
    if (account && isAuthenticated && credits !== null && !showSuccess) {
      setShowSuccess(true);
      
      const timer = setTimeout(() => {
        navigate('/');
      }, 3000);
      
      return () => {
        clearTimeout(timer);
      };
    }
  }, [account, isAuthenticated, credits, showSuccess, navigate]);

  // 添加一个强制跳转的useEffect，如果所有条件满足且showSuccess已经为true
  useEffect(() => {
    if (account && isAuthenticated && credits !== null && showSuccess) {
      const timer = setTimeout(() => {
      navigate('/');
      }, 1000); // 更短的延迟作为备用

      return () => clearTimeout(timer);
    }
  }, [account, isAuthenticated, credits, showSuccess, navigate]);

  const handleConnectMetaMask = async () => {
    setIsLoading('metamask');
    setError(null);
    
    // 检查钱包状态
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setError('❌ No Ethereum wallet found!\n\nPlease install MetaMask:\n1. Go to https://metamask.io/\n2. Download and install MetaMask\n3. Refresh this page and try again');
      setIsLoading(null);
      return;
    }

    // 检查是否有多钱包冲突
    if (ethereum.isOKX && !ethereum.isMetaMask) {
      setError('⚠️ OKX wallet detected instead of MetaMask!\n\nTo fix this:\n1. Open OKX wallet and complete/cancel any pending transactions\n2. Disable OKX extension temporarily, or\n3. Set MetaMask as default wallet in browser settings\n4. Refresh this page and try again');
      setIsLoading(null);
      return;
    }

    if (ethereum.providers && ethereum.providers.length > 0) {
      const hasMetaMask = ethereum.providers.some((p: any) => p.isMetaMask);
      const hasOKX = ethereum.providers.some((p: any) => p.isOKX);
      
      if (hasOKX && !hasMetaMask) {
        setError('⚠️ Multiple wallets detected, but MetaMask not found!\n\nTo fix this:\n1. Install MetaMask from https://metamask.io/\n2. Or disable other wallet extensions temporarily\n3. Refresh this page and try again');
        setIsLoading(null);
        return;
      }
      
      if (hasOKX && hasMetaMask) {
      }
    }
    
    try {
      await connectMetaMask();
      // 不需要立即跳转，useEffect会处理
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect MetaMask');
    } finally {
      setIsLoading(null);
    }
  };

  const handleConnectPhantom = async () => {
    setIsLoading('phantom');
    setError(null);
    try {
      await connectPhantom();
      // 不需要立即跳转，useEffect会处理
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Phantom');
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">Connect Your Wallet</h2>
        <p className="login-subtitle">
          Choose your preferred wallet to access the AI-powered dApp platform
        </p>
        
        {error && (
          <div className="error-message" style={{ whiteSpace: 'pre-line', textAlign: 'left' }}>
            {error}
          </div>
        )}
        
        {isConnected && showSuccess ? (
          <div className="success-info">
            <div className="success-message">
              <div className="success-icon">✅</div>
              <h3>Connection Successful!</h3>
            </div>
            <div className="wallet-details">
              <div className="wallet-info">
                <span className="wallet-type">
                  {primaryWallet === 'metamask' ? '🦊 MetaMask' : '👻 Phantom'}
                </span>
                <span className="wallet-address">
                  {account?.slice(0, 6)}...{account?.slice(-4)}
                </span>
              </div>
              <div className="credit-info">
                <span>
                  Purchased: {credits?.buyBalance || 0}
                  <span style={{ margin: '0 6px', color: '#b8dba8' }}>|</span>
                  Free: {credits?.creditBalance || 0}
                </span>
              </div>
            </div>
            <div className="redirect-message">
              Redirecting to app in 3 seconds...
            </div>
            <button 
              className="btn btn-success"
              onClick={() => {
                navigate('/');
              }}
              style={{ marginTop: '10px' }}
            >
              Go to App Now
            </button>
          </div>
        ) : isConnected ? (
          <div className="connected-info">
            <div className="wallet-info">
              <span className="wallet-type">
                {primaryWallet === 'metamask' ? '🦊 MetaMask' : '👻 Phantom'}
              </span>
              <span className="wallet-address">
                {account?.slice(0, 6)}...{account?.slice(-4)}
              </span>
            </div>
            <div className="credit-info">
              <span>
                Purchased: {credits?.buyBalance || 0}
                <span style={{ margin: '0 6px', color: '#b8dba8' }}>|</span>
                Free: {credits?.creditBalance || 0}
              </span>
            </div>
            <button 
              className="btn btn-success"
              onClick={() => navigate('/')}
            >
              Continue to App
            </button>
          </div>
        ) : (
          <div className="wallet-options">
            <button 
              className={`wallet-btn metamask-btn ${(isLoading === 'metamask' || isConnecting) ? 'loading' : ''}`}
              onClick={handleConnectMetaMask}
              disabled={isLoading !== null || isConnecting}
            >
              <div className="wallet-btn-content">
                <div className="wallet-icon">🦊</div>
                <div className="wallet-info">
                  <div className="wallet-name">MetaMask</div>
                  <div className="wallet-desc">
                    {isConnecting ? '⏳ Connecting... Please check MetaMask popup and click "Connect"' : 'Connect with MetaMask for EVM chains'}
                  </div>
                </div>
                {(isLoading === 'metamask' || isConnecting) && <div className="loading-spinner"></div>}
              </div>
            </button>

            <button 
              className={`wallet-btn phantom-btn ${(isLoading === 'phantom' || isConnecting) ? 'loading' : ''}`}
              onClick={handleConnectPhantom}
              disabled={isLoading !== null || isConnecting}
            >
              <div className="wallet-btn-content">
                <div className="wallet-icon">👻</div>
                <div className="wallet-info">
                  <div className="wallet-name">Phantom</div>
                  <div className="wallet-desc">
                    {isConnecting ? 'Connecting... Check Phantom popup' : 'Connect with Phantom for Solana'}
                  </div>
                </div>
                {(isLoading === 'phantom' || isConnecting) && <div className="loading-spinner"></div>}
              </div>
            </button>
          </div>
        )}
        
        <div className="login-footer">
          <p>New to crypto wallets? <a href="https://metamask.io/" target="_blank" rel="noopener noreferrer">Learn more</a></p>
        </div>
      </div>
    </div>
  );
};

export default Login;


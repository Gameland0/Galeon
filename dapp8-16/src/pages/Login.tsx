import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initWeb3, connectWallet } from '../services/web3';
import { loginWithWallet } from '../services/api';


export const Login = (data: any) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await initWeb3();
      const walletInfo = await connectWallet();
      if (walletInfo) {
        const response = await loginWithWallet(walletInfo.address, walletInfo.chainId);
        localStorage.setItem('token', response.data.token);
        setIsConnected(true);
        navigate('/chat');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2>Connect your Wallet</h2>
      <button onClick={handleConnect} disabled={isLoading}>
        {isLoading ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {error && <p className="error-message">{error}</p >}
    </div>
  );
};


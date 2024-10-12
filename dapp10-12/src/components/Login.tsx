import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Web3Context } from '../contexts/Web3Context';
import { connectWallet as apiConnectWallet } from '../services/api';

const Login: React.FC = () => {
  const { web3, account, isAuthenticated, connectWallet, setIsAuthenticated } = useContext(Web3Context);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (account && isAuthenticated) {
      navigate('/chat');
    }
  }, [account, isAuthenticated, navigate]);

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('account:',account)
      if (!account) {
        await connectWallet();
      }
      console.log('isAuthenticated:',isAuthenticated);
      if (account && !isAuthenticated) {
        const message = `Sign this message to prove you own the address ${account}. Nonce: ${Date.now()}`;
        const signature = await web3!.eth.personal.sign(message, account, '');
        await apiConnectWallet(account, 1, message, signature);
        setIsAuthenticated(true);
        localStorage.setItem('isAuthenticated', 'true');
        navigate('/chat');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const isButtonDisabled = isLoading || (!!account && isAuthenticated);

  return (
    <div className="login-container">
      <h2>Connect your Wallet</h2>
      <button onClick={handleConnect} disabled={isButtonDisabled}>
        {isLoading ? 'Connecting...' : account && isAuthenticated ? 'Connected' : 'Connect Wallet'}
      </button>
      {error && <p className="error-message">{error}</p >}
    </div>
  );
};

export default Login;


import React, { useContext, useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import ConnectWalletModal from './ConnectWalletModal';
import logoimg from '../image/galeon.jpg';
import '../styles/MainLayout.css';
import { api } from '../services/api';

const MainLayout: React.FC = () => {
  const { getCurrentAccount, isAuthenticated, disconnectWallet } = useContext(MultiWalletContext);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.get('/config/features').then(r => setFeatures(r.data || {})).catch(() => {});
  }, []);

  const account = getCurrentAccount();
  const isConnected = !!account && isAuthenticated;

  const handleDisconnect = () => {
    disconnectWallet();
    localStorage.removeItem('token');
    navigate('/login');
  };

  const getActiveLink = () => {
    const path = location.pathname;
    const search = location.search;
    if (path === '/') return 'home';
    if (path === '/alpha-agent') {
      if (search.includes('tab=meme-radar')) return 'meme-radar';
      if (search.includes('tab=auto-trade')) return 'auto-trade';
      return 'alpha-signal';
    }
    if (path === '/paper-trade') return 'paper-trade';
    if (path === '/report') return 'report';
    if (path === '/prediction') return 'prediction';
    if (path === '/market-overview') return 'market-overview';
    if (path === '/execution-engine') return 'execution-engine';
    return '';
  };

  const activeLink = getActiveLink();

  return (
    <>
      <nav className="main-layout-nav">
        <div className="main-layout-nav-left">
          <img className="main-layout-logo" src={logoimg} alt="Galeon" onClick={() => navigate('/')} />
          <div className="main-layout-links">
            <a
              href="#/"
              className={activeLink === 'home' ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); navigate('/'); }}
            >
              Home
            </a>
            <a
              href="#/market-overview"
              className={activeLink === 'market-overview' ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); navigate('/market-overview'); }}
            >
              Overview
            </a>
            <a
              href="#/alpha-agent?tab=auto-trade"
              className={activeLink === 'auto-trade' ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); navigate('/alpha-agent?tab=auto-trade'); }}
            >
              Auto Trade
            </a>
            <a
              href="#/paper-trade"
              className={activeLink === 'paper-trade' ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); navigate('/paper-trade'); }}
            >
              Paper Trade
            </a>
            <a
              href="#/report"
              className={activeLink === 'report' ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); navigate('/report'); }}
            >
              Analytics
            </a>
            {features.prediction !== false && (
            <a
              href="#/prediction"
              className={activeLink === 'prediction' ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); navigate('/prediction'); }}
            >
              Prediction
            </a>
            )}
            <a
              href="#/execution-engine"
              className={activeLink === 'execution-engine' ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); navigate('/execution-engine'); }}
            >
              Engine
            </a>
          </div>
        </div>

        <div className="main-layout-nav-right">
          {isConnected ? (
            <div className="main-layout-wallet">
              <div className="main-layout-wallet-addr">
                <span className="main-layout-wallet-dot" />
                {account?.slice(0, 6)}...{account?.slice(-4)}
              </div>
              <button className="main-layout-btn-disconnect" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="main-layout-btn-connect" onClick={() => setShowWalletModal(true)}>
              Connect Wallet
            </button>
          )}
        </div>
      </nav>

      <div className="main-layout-content">
        <Outlet />
      </div>

      <ConnectWalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnected={() => navigate('/')}
      />
    </>
  );
};

export default MainLayout;

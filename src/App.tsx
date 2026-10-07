import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { HashRouter } from 'react-router-dom'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { clusterApiUrl } from '@solana/web3.js';
import { ChatProvider } from './components/ChatContext';
import Login from './components/Login';
import Chat from './components/Chat';
import AgentMarketplace from './components/AgentMarketplace';
import AgentDetails from './components/AgentDetails';
import ProtectedRoute from './components/ProtectedRoute';
import TeamManagement from './components/TeamManagement';
import GameMarketplace from './components/GameMarketplace';
import GameDetail from './components/GameDetail';
import CreatorDashboard from './components/CreatorDashboard';
import WithdrawalManagement from './components/WithdrawalManagement';
import AdminWithdrawalPanel from './components/AdminWithdrawalPanel';
import AlphaAgentPage from './components/AlphaAgentPage';
import SignalDetailPage from './components/SignalDetailPage';
import MemeRadarDetailPage from './components/MemeRadarDetailPage';
import HomePage from './components/HomePage';
import MainLayout from './components/MainLayout';
import SignalDashboard from './pages/SignalDashboard';
import PaperTradePage from './pages/PaperTradePage';
import PredictionMarketPage from './pages/PredictionMarketPage';
import ReportPage from './pages/ReportPage';
import MarketOverviewPage from './pages/MarketOverviewPage';
import ExecutionEnginePage from './pages/ExecutionEnginePage';
import DocumentationPage from './components/DocumentationPage';
// [HACKATHON-MONAD] Brain Link pages
import BrainLinkLayout from './components/brainLink/BrainLinkLayout';
import BrainLinkHome from './pages/BrainLinkHome';
import BrainLinkAssetPage from './pages/BrainLinkAssetPage';
import BrainLinkTradePage from './pages/BrainLinkTradePage';
import BrainLinkHistoryPage from './pages/BrainLinkHistoryPage';
import BrainLinkEmbedDemo from './pages/BrainLinkEmbedDemo';
import { BlockchainProvider } from './components/BlockchainContext';
import './styles/global.css'
import './styles/markdown.css'
import './styles/chat.css'

// 检测 ?ref=XXXX 推广码并存入 localStorage
(() => {
  try {
    const fullUrl = window.location.href;
    const match = fullUrl.match(/[?&]ref=([A-Za-z0-9]+)/);
    if (match) {
      localStorage.setItem('referral_code', match[1].toUpperCase());
    }
  } catch {}
})();

const App: React.FC = () => {
  // 使用Alchemy的高性能RPC端点，大幅提升交易速度
  const endpoint = 'https://api.devnet.solana.com';
  // 备用: const endpoint = clusterApiUrl('devnet');
  const wallets = [new PhantomWalletAdapter()];

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <BlockchainProvider>
            <HashRouter>
              <ChatProvider>
                <Routes>
                  {/* MainLayout routes - own clean background, no legacy wrapper */}
                  <Route element={<MainLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/alpha-agent" element={
                      <ProtectedRoute>
                        <AlphaAgentPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/alpha-agent/signal/:signalId" element={
                      <ProtectedRoute>
                        <SignalDetailPage />
                      </ProtectedRoute>
                    } />
                    {/* [2026-09-02] Token详情页: 通过tokenSymbol直接进入 */}
                    <Route path="/alpha-agent/token/:tokenSymbol" element={
                      <ProtectedRoute>
                        <SignalDetailPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/alpha-agent/meme-radar/:signalId" element={
                      <ProtectedRoute>
                        <MemeRadarDetailPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/signal-dashboard" element={<SignalDashboard />} />
                    <Route path="/paper-trade" element={<PaperTradePage />} />
                    <Route path="/report" element={<ReportPage />} />
                    <Route path="/prediction" element={
                      <ProtectedRoute>
                        <PredictionMarketPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/market-overview" element={<MarketOverviewPage />} />
                    <Route path="/execution-engine" element={
                      <ProtectedRoute>
                        <ExecutionEnginePage />
                      </ProtectedRoute>
                    } />
                    <Route path="/docs" element={<DocumentationPage />} />
                  </Route>

                  {/* [HACKATHON-MONAD] Brain Link — Independent layout, doesn't affect MainLayout */}
                  <Route element={<BrainLinkLayout />}>
                    <Route path="/brain" element={<BrainLinkHome />} />
                    <Route path="/brain/asset/:asset" element={<BrainLinkAssetPage />} />
                    <Route path="/brain/trade" element={<BrainLinkTradePage />} />
                    <Route path="/brain/history" element={<BrainLinkHistoryPage />} />
                    <Route path="/brain/embed-demo" element={<BrainLinkEmbedDemo />} />
                  </Route>

                  {/* Legacy routes - keep original background/app wrapper */}
                  <Route path="/login" element={
                    <div className="background"><div className="app"><Login /></div></div>
                  } />
                  <Route path="/chat" element={
                    <div className="background"><div className="app">
                      <ProtectedRoute><Chat /></ProtectedRoute>
                    </div></div>
                  } />
                  <Route path="/marketplace" element={
                    <div className="background"><div className="app">
                      <ProtectedRoute><AgentMarketplace /></ProtectedRoute>
                    </div></div>
                  } />
                  <Route path="/agent/:agentId" element={
                    <div className="background"><div className="app">
                      <ProtectedRoute><AgentDetails /></ProtectedRoute>
                    </div></div>
                  } />
                  <Route path="/team-management" element={
                    <div className="background"><div className="app">
                      <ProtectedRoute><TeamManagement /></ProtectedRoute>
                    </div></div>
                  } />
                  <Route path="/game-marketplace" element={
                    <div className="background"><div className="app">
                      <ProtectedRoute><GameMarketplace /></ProtectedRoute>
                    </div></div>
                  } />
                  <Route path="/game/:gameId" element={
                    <div className="background"><div className="app">
                      <ProtectedRoute><GameDetail /></ProtectedRoute>
                    </div></div>
                  } />
                  <Route path="/creator/dashboard" element={
                    <div className="background"><div className="app">
                      <ProtectedRoute><CreatorDashboard /></ProtectedRoute>
                    </div></div>
                  } />
                  <Route path="/creator/withdrawals" element={
                    <div className="background"><div className="app">
                      <ProtectedRoute><WithdrawalManagement /></ProtectedRoute>
                    </div></div>
                  } />
                  <Route path="/admin/withdrawals" element={
                    <div className="background"><div className="app">
                      <ProtectedRoute><AdminWithdrawalPanel /></ProtectedRoute>
                    </div></div>
                  } />
                </Routes>
            </ChatProvider>
          </HashRouter>
        </BlockchainProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default App;

import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { HashRouter } from 'react-router-dom'
import { ChatProvider } from './components/ChatContext';
import Login from './components/Login';
import Chat from './components/Chat';
import AgentMarketplace from './components/AgentMarketplace';
import AgentDetails from './components/AgentDetails';
import ProtectedRoute from './components/ProtectedRoute';
import TeamManagement from './components/TeamManagement'; 
import { BlockchainProvider } from './components/BlockchainContext';
import './styles/global.css'
import './styles/markdown.css'
import './styles/chat.css'

const App: React.FC = () => {
  return (
    <BlockchainProvider>
      <HashRouter>
        <ChatProvider>
          <div className="background">
            <div className="app">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/chat" />} />
                <Route path="/chat" element={
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                } />
                <Route path="/marketplace" element={
                  <ProtectedRoute>
                    <AgentMarketplace />
                  </ProtectedRoute>
                } />
                <Route path="/agent/:agentId" element={
                  <ProtectedRoute>
                    <AgentDetails />
                  </ProtectedRoute>
                } />
                <Route path="/team-management" element={
                  <ProtectedRoute>
                    <TeamManagement />
                  </ProtectedRoute>
                } />
                {/* <Route path="*" element={<Navigate to="/chat" />} /> */}
              </Routes>
            </div>
          </div>
        </ChatProvider>
      </HashRouter>
    </BlockchainProvider>
  );
};

export default App;

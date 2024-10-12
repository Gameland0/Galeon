import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Web3Provider } from './contexts/Web3Context';
import { ChatProvider } from './components/ChatContext';
import Login from './components/Login';
import Chat from './components/Chat';
import AgentMarketplace from './components/AgentMarketplace';
import AgentDetails from './components/AgentDetails';
import ProtectedRoute from './components/ProtectedRoute';
import TeamManagement from './components/TeamManagement'; 
import './styles/global.css'
import './styles/markdown.css'

const App: React.FC = () => {
  return (
    <Web3Provider>
      <Router>
        <ChatProvider>
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
              <Route path="*" element={<Navigate to="/chat" />} />
            </Routes>
          </div>
        </ChatProvider>
      </Router>
    </Web3Provider>
  );
};

export default App;

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Chat from './components/Chat';
import AgentDetails from './pages/AgentDetails';
import { initWeb3, getWalletInfo } from './services/web3';
import './App.css';

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkConnection = async () => {
      await initWeb3();
      const walletInfo = await getWalletInfo();
      setIsConnected(!!walletInfo);
      setIsLoading(false);
    };
    checkConnection();
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <div className="app">
        <Routes>
          <Route 
            path="/login" 
            element={
              isConnected 
                ? <Navigate to="/chat" /> 
                : <Login onConnected={() => setIsConnected(true)} />
            } 
          />
          <Route
            path="/chat"
            element={isConnected ? <Chat /> : <Navigate to="/login" />}
          />
          <Route
            path="/agent/:agentId"
            element={isConnected ? <AgentDetails /> : <Navigate to="/login" />}
          />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;


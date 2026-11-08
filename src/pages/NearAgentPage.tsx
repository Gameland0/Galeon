import React from 'react';
import { RobotOutlined } from '@ant-design/icons';
import { useNearWallet } from '../contexts/NearWalletContext';
import NearAgentSetup from '../components/nearAgent/NearAgentSetup';
import AgentDashboard from '../components/nearAgent/AgentDashboard';

const NearAgentPage: React.FC = () => {
  const { isConnected, agentAuthorized } = useNearWallet();
  const showDashboard = isConnected && agentAuthorized;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #eef2ff 0%, #f5f7fa 50%, #edf5ff 100%)',
      padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: '#1677ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <RobotOutlined style={{ fontSize: 20, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111', lineHeight: 1.3 }}>
              Galeon Brain
            </div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 1 }}>
              Autonomous AI trading · Powered by NEAR Intents
            </div>
          </div>
        </div>

        {showDashboard ? <AgentDashboard /> : <NearAgentSetup />}
      </div>
    </div>
  );
};

export default NearAgentPage;

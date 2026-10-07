import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Web3Context } from '../contexts/Web3Context';
import { getMarketplaceAgents, toggleAgentPublicity } from '../services/api';
import Web3 from 'web3';
import './AgentMarketplace.css';

interface Agent {
  id: number;
  name: string;
  description: string;
  type: string;
  is_public: boolean;
  owner: string;
  imageUrl?: string;
  createdAt: string;
  transactionHash: string;
}

type SortOption = 'name' | 'newest';
type FilterOption = 'all' | 'free' | 'paid';

const AgentMarketplace: React.FC = () => {
  const web3Instance = new Web3((window as any).ethereum);
  const { account } = useContext(Web3Context);
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  useEffect(() => {
    fetchMarketplaceAgents();
  }, [account]);

  const fetchMarketplaceAgents = async () => {
    try {
      const fetchedAgents = await getMarketplaceAgents();
      console.log('📊 Fetched agents:', fetchedAgents);
      console.log('👤 Current account:', account);
      setAgents(fetchedAgents);
    } catch (error) {
      console.error('Error fetching marketplace agents:', error);
    }
  };

  const handleTogglePublicity = async (agentId: number) => {
    try {
      const chainId = await web3Instance.eth.getChainId();
      await toggleAgentPublicity(agentId, Number(chainId));
      fetchMarketplaceAgents();
    } catch (error) {
      console.error('Error toggling agent publicity:', error);
    }
  };

  // Separate agents into categories
  const myAgents = agents.filter(agent => agent.owner === account);
  const communityAgents = agents.filter(agent => agent.owner !== account);

  // Sort agents
  const sortAgents = (agentList: Agent[]) => {
    return [...agentList].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return 0;
    });
  };

  const sortedCommunityAgents = sortAgents(communityAgents);
  const sortedMyAgents = sortAgents(myAgents);

  console.log('🏘️ Community agents:', sortedCommunityAgents.length);
  console.log('👥 My agents:', sortedMyAgents.length);
  console.log('📋 All agents:', agents.length);

  return (
    <div className="agent-marketplace">
      <h2>Agent Marketplace</h2>
      <Link to="/chat" className="back-to-chat">Back to Chat</Link>

      {/* Debug Info */}
      <div style={{padding: '10px', background: '#1a1a1a', margin: '10px 0', borderRadius: '8px', fontSize: '14px'}}>
        <div>📋 Total agents: {agents.length}</div>
        <div>🏘️ Community agents: {sortedCommunityAgents.length}</div>
        <div>👤 Current account: {account || 'Not connected'}</div>
      </div>

      {/* Filter and Sort Controls */}
      <div className="marketplace-controls">
        <div className="filter-group">
          <label>Filter:</label>
          <select value={filterBy} onChange={(e) => setFilterBy(e.target.value as FilterOption)}>
            <option value="all">All</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div className="sort-group">
          <label>Sort:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
            <option value="newest">Newest</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Official Agents Section */}
      <div className="agent-section">
        <h3 className="section-title">Official Agents</h3>
        <div className="agent-list">
          {/* Featured: Alpha Auto Agent */}
          <div className="agent-card alpha-agent-featured" style={{
            border: '2px solid #3b82f6',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
            position: 'relative'
          }}>
            <div className="featured-badge" style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#000',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 'bold'
            }}>⭐ Official Agent</div>
            <div className="agent-header-section" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              marginBottom: '15px'
            }}>
              <span className="agent-icon-large" style={{ fontSize: '48px' }}>🤖</span>
              <div className="agent-title-section">
                <h3 style={{ margin: '0 0 5px 0', fontSize: '24px', color: '#3b82f6' }}>Alpha Auto Agent</h3>
                <p className="agent-subtitle" style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>24/7 AI-Powered Trading Signals</p>
              </div>
            </div>
            <p><strong>Description:</strong> Automated trading signal generator for Binance Alpha tokens using 7-dimensional analysis including OI, Funding Rate, and technical indicators.</p>
            <p><strong>Type:</strong> Auto Trading Signals</p>
            <div className="agent-features-compact" style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              margin: '15px 0'
            }}>
              <span className="feature-tag" style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                padding: '6px 12px',
                borderRadius: '15px',
                fontSize: '13px',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>📊 7D Analysis</span>
              <span className="feature-tag" style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                padding: '6px 12px',
                borderRadius: '15px',
                fontSize: '13px',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>⏰ Hourly Scans</span>
              <span className="feature-tag" style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                padding: '6px 12px',
                borderRadius: '15px',
                fontSize: '13px',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>🎯 70%+ Confidence</span>
              <span className="feature-tag" style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                padding: '6px 12px',
                borderRadius: '15px',
                fontSize: '13px',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>💰 Entry/SL/TP</span>
            </div>
            <p><strong>Access:</strong> <span style={{ color: '#22c55e', fontWeight: 'bold' }}>All signals FREE</span></p>
            <div className="agent-actions">
              <button
                onClick={() => navigate('/alpha-agent')}
                className="view-details-btn alpha-btn"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                  border: 'none',
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                🚀 View Alpha Agent
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Community Agents Section */}
      {sortedCommunityAgents.length > 0 && (
        <div className="agent-section">
          <h3 className="section-title">Community Agents</h3>
          <div className="agent-list">
            {sortedCommunityAgents.map((agent) => (
              <div key={agent.id} className="agent-card">
                <h3>Agent Name: {agent.name}</h3>
                <p><strong>Description:</strong> {agent.description}</p>
                <p><strong>Type:</strong> {agent.type}</p>
                {agent.imageUrl && <img src={agent.imageUrl} alt={agent.name} className="agent-image" />}
                <p><strong>Owner:</strong> {agent.owner}</p>
                <p><strong>Created At:</strong> {new Date(agent.createdAt).toLocaleString()}</p>
                <p><strong>Registration Hash:</strong> <a href={`https://etherscan.io/tx/${agent.transactionHash}`} target="_blank" rel="noopener noreferrer">{agent.transactionHash}</a></p>
                <div className="agent-actions">
                  <Link to={`/agent/${agent.id}`} className="view-details-btn">View Details</Link>
                  <Link to={`/chat?agentId=${agent.id}`} className="use-agent-btn">Use This Agent</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default AgentMarketplace;

import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Web3Context } from '../contexts/Web3Context';
import { getMarketplaceAgents, toggleAgentPublicity } from '../services/api';
// import './AgentMarketplace.css';

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

const AgentMarketplace: React.FC = () => {
  const { account } = useContext(Web3Context);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    fetchMarketplaceAgents();
  }, []);

  const fetchMarketplaceAgents = async () => {
    try {
      const fetchedAgents = await getMarketplaceAgents();
      setAgents(fetchedAgents);
    } catch (error) {
      console.error('Error fetching marketplace agents:', error);
    }
  };

  const handleTogglePublicity = async (agentId: number) => {
    try {
      await toggleAgentPublicity(agentId);
      fetchMarketplaceAgents(); // Refresh the list
    } catch (error) {
      console.error('Error toggling agent publicity:', error);
    }
  };

  return (
    <div className="agent-marketplace">
      <h2>Agent Marketplace</h2>
      <Link to="/chat" className="back-to-chat">Back to Chat</Link>
      <div className="agent-list">
        {agents.map((agent) => (
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
              {agent.owner === account && (
                <button onClick={() => handleTogglePublicity(agent.id)} className="toggle-publicity-btn">
                  {agent.is_public ? 'Make Private' : 'Make Public'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentMarketplace;

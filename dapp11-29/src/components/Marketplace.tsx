import React, { useContext, useEffect } from 'react';
import { ChatContext } from './ChatContext';
import { getMarketplaceAgents } from '../services/api';
import '../styles/Marketplace.css'; 
import Web3 from 'web3';
import agent_avatar from '../image/agent_avatar.png'
import icon_description from '../image/icon_description.png'
import chatbot from '../image/chatbot.png'
import task from '../image/task.png'

const Marketplace = () => {
  const { showMarketplace, selectedAgent, setSelectedAgent, marketplaceAgents, setMarketplaceAgents } = useContext(ChatContext);

  useEffect(() => {
    if (showMarketplace) {
      fetchMarketplaceAgents();
    }
  }, [showMarketplace]);

  const fetchMarketplaceAgents = async () => {
    try {
      const agents = await getMarketplaceAgents();
      setMarketplaceAgents(agents);
    } catch (error) {
      console.error('Error fetching marketplace agents:', error);
    }
  };

  if (!showMarketplace) return null;

  return (
    <div className="marketplace">
      <h2>Agent Marketplace</h2>
      <div className="agent-grid">
        {marketplaceAgents.map((agent: any) => (
          <div key={agent.id} className="agent-card">
            <div className="agent-header">
              <img src={agent.image_url? agent.image_url : agent_avatar} alt={agent.name} className="agent-image" />
              <h3>{agent.name}</h3>
            </div>
            <div className="agent-description">
              <img src={icon_description} alt="agent-description" title='Description'/>
              <p>{agent.description}</p >
            </div>
            <div className="agent-owner Hash">
              <strong>Owner:</strong>
              <div>{agent.owner}</div>
            </div >
            <div className="flex align-items space-between">
              <p className="agent-type">
                {agent.type === 'chatbot' ? (
                  <img src={chatbot} alt="chatbot" title='chatbot' />
                ) : (
                  <img src={task} alt="task" title='task' />
                )}
              </p >
              <p className="agent-created"><strong>Created:</strong> {new Date(agent.created_at).toLocaleDateString()}</p >
            </div>
            <div className="agent-actions">
              {selectedAgent && selectedAgent.id === agent.id ? (
                <button onClick={() => setSelectedAgent(null)} className="Market-deselect-btn">Deselect Agent</button>
              ) : (
                <button onClick={() => setSelectedAgent(agent)} className="Market-select-btn">Use This Agent</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Marketplace;

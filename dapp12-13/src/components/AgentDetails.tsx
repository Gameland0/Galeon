import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Web3Context } from '../contexts/Web3Context';
import { AgentRegistry } from '../contracts/AgentRegistry';
import AgentTraining from './AgentTraining';
import {
  getAgentDetails,
  updateAgent,
  getAgentKnowledge,
  deleteAgent,
  toggleAgentPublicity
} from '../services/api';
import Web3 from 'web3';
import '../styles/AgentDetails.css'
import agent_Model from '../image/agent_Model.png'
import agent_Public from '../image/agent_Public.png'
import agent_Description from '../image/agent_Description.png'
import agent_type from '../image/agent_type.png'
import icon_Hide from '../image/icon_Hide.png'
import agent_avatar from '../image/agent_avatar.png'

interface Agent {
  id: number;
  name: string;
  description: string;
  type: string;
  is_public: boolean;
  owner: string;
  image_url?: string;
  model?: string; // 新增字段
  chainid: number;
  trainingData?: {
    ipfsHash: string;
    trained_at: string;
    userAddress: string;
  }[];
}

interface Knowledge {
  key_phrase: string;
  content: string;
}

const AgentDetails: React.FC = () => {
  const web3Instance = new Web3((window as any).ethereum)
  const { agentId } = useParams<{ agentId: string }>();
  const { account, web3 } = useContext(Web3Context);
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [trainingData, setTrainingData] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedAgent, setEditedAgent] = useState<Partial<Agent>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [showTraining, setShowTraining] = useState(false);

  useEffect(() => {
    fetchAgentDetails();
    fetchAgentKnowledge();
  }, [agentId]);

  const fetchAgentDetails = async () => {
    if (agentId) {
      try {
        const chainId = await web3Instance.eth.getChainId();
        const details = await getAgentDetails(Number(agentId),chainId);
        setAgent(details);
        setEditedAgent(details);
      } catch (error) {
        console.error('Error fetching agent details:', error);
      }
    }
  };

  const fetchAgentKnowledge = async () => {
    if (agentId) {
      try {
        const chainId = await web3Instance.eth.getChainId();
        const knowledgeData = await getAgentKnowledge(Number(agentId),chainId);
        setKnowledge(knowledgeData);
      } catch (error) {
        console.error('Error fetching agent knowledge:', error);
      }
    }
  };

  const handleTogglePublicity = async () => {
    if (!agent) return;
    setIsLoading(true)
    try {
      const chainId = await web3Instance.eth.getChainId();
      const agentRegistry = new AgentRegistry(web3Instance!,chainId);
      await agentRegistry.toggleAgentPublicity(agent.id, account!);
      await toggleAgentPublicity(agent.id, chainId);
      fetchAgentDetails();
      alert('Agent is now private. You can make it public again from the settings. ');
      setIsLoading(false);
    } catch (error) {
      console.error('Error toggling agent publicity:', error);
      alert('Failed to toggle agent publicity. Please try again.');
      setIsLoading(false)
    }
  };

  const handleUpdateAgent = async () => {
    if (!agent) return;
    setIsLoading(true)
    try {
      const chainId = await web3Instance.eth.getChainId();
      await updateAgent(agent.id, {...editedAgent, chainid: chainId});
      setIsEditing(false);
      fetchAgentDetails();
      setIsLoading(false)
      alert('Agent updated successfully!');
    } catch (error) {
      console.error('Error updating agent:', error);
      setIsLoading(false)
      alert('Failed to update agent. Please try again.');
    }
  };

  const handleDeleteAgent = async () => {
    if (!agent) return;
    if (window.confirm('Are you sure you want to delete this agent?')) {
      setIsLoading(true)
      try {
        await deleteAgent(agent.id);
        alert('Agent deleted successfully!');
        setIsLoading(false)
        navigate('/chat');
      } catch (error) {
        console.error('Error deleting agent:', error);
        setIsLoading(false)
        alert('Failed to delete agent. Please try again.');
      }
    }
  };

  if (!agent) {
    return <div>Loading...</div>;
  }

  return (
    <div className="agent-details">
      <div className="details-context">
        <Link to="/chat" className="back-button">
          <div className="flex align-items space-between">
            <div style={{marginLeft: '8px'}}>Back to Chat</div>
            <div className="Hide"><img src={icon_Hide} alt="icon_Hide" property='icon_Hide' /></div>
          </div>
        </Link>
        {isEditing ? (
          <div className="Edit-agent">
            <input
              value={editedAgent.name || ''}
              disabled={isLoading}
              onChange={(e) => setEditedAgent({ ...editedAgent, name: e.target.value })}
              placeholder="Agent Name"
            />
            <textarea
              value={editedAgent.description || ''}
              disabled={isLoading}
              onChange={(e) => setEditedAgent({ ...editedAgent, description: e.target.value })}
              placeholder="Agent Description"
            />
            <div className="flex">
              <input
                value={editedAgent.type || ''}
                disabled={isLoading}
                onChange={(e) => setEditedAgent({ ...editedAgent, type: e.target.value })}
                placeholder="Agent Type"
              />
              <div className="select-model">
                <select
                  value={editedAgent.model || ''}
                  disabled={isLoading}
                  onChange={(e) => setEditedAgent({ ...editedAgent, model: e.target.value })}
                >
                  <option value="">Select Model</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="claude-3-opus-20240229">Claude 3 Opus 20240229</option>
                  <option value="claude-3-sonnet-20240229">Claude 3 Sonnet 20240229</option>
                  <option value="claude-3-haiku-20240307">Claude 3 Haiku 20240307</option>
                </select>
              </div>
            </div>
            
            <div className="flex space-around" style={{marginTop: '15px'}}>
              <button className={isLoading? 'Save-button disabled':'Save-button'} disabled={isLoading} onClick={handleUpdateAgent}>Save Changes</button>
              <button className={isLoading? 'Cancel-button disabled':'Cancel-button'} disabled={isLoading} onClick={() => setIsEditing(false)}>Cancel</button> 
            </div>
          </div>
        )  : (
          <div className="agent-info">
            <div className="agent-header">
              <img src={agent.image_url? agent.image_url : agent_avatar} alt={agent.name} className="agent-image" />
              <div className="name">{agent.name}</div>
            </div>
            <div className="flex" style={{marginTop: '20px'}}>
              <img className="agent-icon" src={agent_Description} alt="agent_Description" />
              <div className="flex">
                <div style={{marginRight:'8px'}}><strong>Description:</strong></div>
                <div>{agent.description}</div>
              </div>
            </div>
            <div className="flex align-items" style={{marginTop: '20px'}}>
              <img className="agent-icon" src={agent_Public} alt="agent_Public" />
              <div className="flex">
                <div style={{marginRight: '8px'}}><strong>Public:</strong></div> 
                <div>{agent.is_public ? 'Yes' : 'No'}</div>
              </div>
            </div>
            <div className="flex" style={{marginTop: '20px'}}>
              <div>
                <div className="flex align-items">
                  <img className="agent-icon" src={agent_type} alt="agent_type" />
                  <div><strong style={{marginRight: '8px'}}>Type:</strong> {agent.type}</div>
                </div>
                <div className="flex align-items" style={{marginTop: '20px'}}>
                  <img className="agent-icon" src={agent_Model} alt="agent_Model" />
                  <div><strong style={{marginRight: '8px'}}>Model:</strong>{agent.model || 'Default'}</div>
                </div>
              </div>
            </div>
            {agent.owner === account && (
              <div className="button-group">
                <button disabled={isLoading} onClick={handleTogglePublicity} className={isLoading? 'toggle-button disabled':'toggle-button'}>
                  {agent.is_public ? 'Make Private' : 'Make Public'}
                </button>
                <button disabled={isLoading} onClick={handleDeleteAgent} className={isLoading? 'delete-button disabled':'delete-button'}>Delete Agent</button>
                <button disabled={isLoading} onClick={() => setIsEditing(true)} className={isLoading? 'edit-button disabled':'edit-button'}>Edit Agent</button>
                <button disabled={isLoading} className={isLoading? 'Train-Agent disabled':'Train-Agent'} onClick={() => setShowTraining(!showTraining)}>
                  {showTraining ? 'Hide Training' : 'Train Agent'}
                </button>
              </div>
            )}
          </div>
        )}
        {showTraining && (
          <AgentTraining
            agentId={Number(agentId)}
            onTrainingComplete={() => {
              setShowTraining(false);
              fetchAgentDetails();
            }}
          />
        )}
        <div className="long-border"></div>
        <div
          style={{
            fontWeight:'bold',
            fontSize:'20px',
            color:'#222222',
            textAlign:'right',
            marginTop:'20px',
            marginBottom:'20px'
          }}>
            Training History
        </div>
        {agent.trainingData?.length ? (agent.trainingData.map((data, index) => (
          <div key={index} className="training-data-item">
            <p>IPFS Hash: {data.ipfsHash}</p>
            <p>Timestamp: {data.trained_at.substring(0,10)} {data.trained_at.substring(11,19)}</p>
            <p>Trainer: {data.userAddress}</p>
          </div>
        ))):(
          <div className="No-content">
            <div className="border"></div>
            <div style={{margin: '0 20px'}}>No content</div>
            <div className="border"></div>
          </div>
        )}
      </div>
      
    </div>
  );

};

export default AgentDetails;

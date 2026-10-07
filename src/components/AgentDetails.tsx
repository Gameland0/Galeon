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
  toggleAgentPublicity,
  getAgentEnhancedInfo,
  getAgentPrice,
  setAgentPrice,
  getAgentStats,
  rateAgent,
  getAgentRatings,
  getUserRating
} from '../services/api';
import Web3 from 'web3';
import '../styles/AgentDetails.css'
import agent_Model from '../image/agent_Model.png'
import agent_Public from '../image/agent_Public.png'
import agent_Description from '../image/agent_Description.png'
import agent_type from '../image/agent_type.png'
import icon_Hide from '../image/icon_Hide.png'
import agent_avatar from '../image/agent_avatar.png'
import { MultiWalletContext } from '../contexts/MultiWalletContext'
import MCPConfiguration from './MCPConfiguration'

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
  custom_prompt?: string; // 新增字段：自定义 prompt
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
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const currentAccount = getCurrentAccount();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [trainingData, setTrainingData] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedAgent, setEditedAgent] = useState<Partial<Agent>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [showTraining, setShowTraining] = useState(false);
  const [mcpEnabled, setMcpEnabled] = useState(false);

  // RAG相关状态
  const [enhancedInfo, setEnhancedInfo] = useState<any>(null);
  const [vectorStats, setVectorStats] = useState<any>(null);

  // Agent定价系统相关状态
  const [agentPrice, setAgentPriceState] = useState<number>(0);
  const [agentStats, setAgentStats] = useState<{ total_calls: number; total_earnings: number }>({
    total_calls: 0,
    total_earnings: 0
  });
  const [isPriceEditing, setIsPriceEditing] = useState(false);
  const [tempPrice, setTempPrice] = useState<string>('0');

  // Agent评分系统相关状态
  const [userRating, setUserRating] = useState<number>(0);
  const [userComment, setUserComment] = useState<string>('');
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [ratings, setRatings] = useState<any[]>([]);
  const [averageRating, setAverageRating] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState<number>(0);

  // Custom Prompt 相关状态
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [showPromptHelp, setShowPromptHelp] = useState(false);

  const getChainName = (id: number) => {
    switch (id) {
      case 56: return 'BSC Mainnet';
      case 97: return 'BSC Testnet';
      case 137: return 'Polygon';
      case 42161: return 'Arbitrum One';
      case 50312: return 'Somnia';
      case 101: return 'Solana Mainnet';
      case 999: return 'Solana Devnet';
      default: return `Chain ID ${id}`;
    }
  };

  const toChainHex = (id: number) => `0x${id.toString(16)}`;

  useEffect(() => {
    fetchAgentDetails();
    fetchAgentKnowledge();
    // 暂时注释增强信息获取，避免404错误
    // fetchEnhancedInfo();
  }, [agentId]);

  const fetchAgentDetails = async () => {
    if (agentId) {
      try {
        const chainIdRaw = await web3Instance.eth.getChainId();
        const chainId = Number(chainIdRaw);
        const details = await getAgentDetails(Number(agentId), chainId);
        console.log('[MCP Debug] Loaded agent details:', details);
        console.log('[MCP Debug] mcp_enabled from backend:', details.mcp_enabled);
        setAgent(details);
        setEditedAgent(details);
        setMcpEnabled(details.mcp_enabled || false);
        setCustomPrompt(details.custom_prompt || ''); // 加载自定义 prompt
        console.log('[MCP Debug] Set mcpEnabled state to:', details.mcp_enabled || false);
        console.log('[CustomPrompt] Loaded custom_prompt:', details.custom_prompt ? '(defined)' : '(not defined)');

        // 获取Agent价格和统计信息
        try {
          const priceData = await getAgentPrice(Number(agentId));
          setAgentPriceState(priceData.price || 0);
          setTempPrice((priceData.price || 0).toString());

          const statsData = await getAgentStats(Number(agentId));
          setAgentStats(statsData);
        } catch (priceError) {
          console.error('Error fetching agent price/stats:', priceError);
        }

        // 获取Agent评分信息
        try {
          setAverageRating(details.average_rating || 0);
          setRatingCount(details.rating_count || 0);

          const ratingsData = await getAgentRatings(Number(agentId), 5);
          setRatings(ratingsData);

          const userRatingData = await getUserRating(Number(agentId));
          if (userRatingData && userRatingData.rating) {
            setUserRating(userRatingData.rating);
            setUserComment(userRatingData.comment || '');
          }
        } catch (ratingError) {
          console.error('Error fetching agent ratings:', ratingError);
        }
      } catch (error) {
        console.error('Error fetching agent details:', error);
      }
    }
  };

  const fetchAgentKnowledge = async () => {
    if (agentId) {
      try {
        const chainIdRaw = await web3Instance.eth.getChainId();
        const chainId = Number(chainIdRaw);
        const knowledgeData = await getAgentKnowledge(Number(agentId), chainId);
        setKnowledge(knowledgeData);
      } catch (error) {
        console.error('Error fetching agent knowledge:', error);
      }
    }
  };

  const fetchEnhancedInfo = async () => {
    if (agentId) {
      try {
        const info = await getAgentEnhancedInfo(Number(agentId));
        setEnhancedInfo(info);
        setVectorStats(info.vectorStats);
      } catch (error) {
        // RAG功能可能未启用，不显示错误
        console.log('Enhanced features not available for this agent');
      }
    }
  };

  const handleMCPEnabledChange = async (enabled: boolean) => {
    setMcpEnabled(enabled);
    console.log(`MCP ${enabled ? 'enabled' : 'disabled'} for agent ${agentId}`);

    try {
      // Update agent's MCP enabled status
      const updateData = { mcp_enabled: enabled };
      console.log('[MCP Debug] Updating agent with data:', updateData);
      await updateAgent(agent!.id, updateData);
      console.log('MCP status saved successfully');
    } catch (error) {
      console.error('Failed to save MCP status:', error);
      // Revert on error
      setMcpEnabled(!enabled);
    }
  };

  const handleSavePrice = async () => {
    if (!agent) return;
    setIsLoading(true);

    try {
      const newPrice = parseInt(tempPrice);

      if (isNaN(newPrice) || newPrice < 0) {
        alert('Please enter a valid price (non-negative integer)');
        setIsLoading(false);
        return;
      }

      await setAgentPrice(agent.id, newPrice);
      setAgentPriceState(newPrice);
      setIsPriceEditing(false);
      alert('Price set successfully!');
      setIsLoading(false);
    } catch (error) {
      console.error('Error setting agent price:', error);
      alert('Failed to set price, please try again');
      setIsLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!agent || userRating === 0) {
      alert('Please select a rating');
      return;
    }

    // Prevent owner from rating their own agent
    if (agent.owner?.toLowerCase() === currentAccount?.toLowerCase()) {
      alert('You cannot rate your own agent');
      setIsRatingModalOpen(false);
      return;
    }

    try {
      setIsLoading(true);
      await rateAgent(agent.id, userRating, userComment);

      // Refresh rating data
      const ratingsData = await getAgentRatings(agent.id, 5);
      setRatings(ratingsData);

      const details = await getAgentDetails(agent.id, agent.chainid);
      setAverageRating(details.average_rating || 0);
      setRatingCount(details.rating_count || 0);

      setIsRatingModalOpen(false);
      alert('Rating submitted successfully!');
      setIsLoading(false);
    } catch (error) {
      console.error('Error submitting rating:', error);
      alert('Failed to submit rating, please try again');
      setIsLoading(false);
    }
  };

  const handleSaveCustomPrompt = async () => {
    if (!agent) return;
    setIsLoading(true);

    try {
      await updateAgent(agent.id, {
        custom_prompt: customPrompt.trim() || null  // 空字符串转为 null
      });

      setIsPromptEditing(false);
      alert('Custom prompt saved successfully!');

      // 刷新 agent 数据
      await fetchAgentDetails();

      setIsLoading(false);
    } catch (error) {
      console.error('Error saving custom prompt:', error);
      alert('Failed to save custom prompt');
      setIsLoading(false);
    }
  };

  const handleTogglePublicity = async () => {
    if (!agent) return;
    setIsLoading(true)
    try {
      const chainIdRaw = await web3Instance.eth.getChainId();
      let currentChainId = Number(chainIdRaw);

      if (agent.chainid && currentChainId !== agent.chainid && (window as any).ethereum?.request) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: toChainHex(agent.chainid) }]
          });
          const afterSwitch = await web3Instance.eth.getChainId();
          currentChainId = Number(afterSwitch);
        } catch (switchErr) {
          console.error('Network switch rejected or failed:', switchErr);
          alert(`Please switch your wallet to ${getChainName(agent.chainid)} and try again.`);
          setIsLoading(false);
          return;
        }
      }

      if (currentChainId !== agent.chainid) {
        alert(`Please switch your wallet to ${getChainName(agent.chainid)} and try again.`);
        setIsLoading(false);
        return;
      }

      // On-chain first
      const agentRegistry = new AgentRegistry(web3Instance!, currentChainId);
      await agentRegistry.toggleAgentPublicity(agent.id, currentAccount!);

      // Immediate success feedback for on-chain success
      alert('On-chain update succeeded. Updating backend...');

      // Backend update in a softer try/catch
      try {
        await toggleAgentPublicity(agent.id, currentChainId);
        await fetchAgentDetails();
      } catch (backendErr) {
        console.warn('Backend toggle update failed, UI will refresh later:', backendErr);
        alert('Backend update pending. Local state will refresh shortly.');
      }

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
      const chainIdRaw = await web3Instance.eth.getChainId();
      const chainId = Number(chainIdRaw);
      await updateAgent(agent.id, { ...editedAgent, chainid: chainId });
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
                  <option value="gpt-5-nano">GPT-5 Nano</option>
                  <option value="gpt-5-mini">GPT-5 Mini</option>
                  <option value="claude-3-7-sonnet-20250219">Claude 3-7 Sonnet 20250219</option>
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4 20250514</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4 20250514</option>
                  <option value="deepseek-chat">DeepSeek Chat</option>
                  <option value="deepseek-reasoner">DeepSeek Reasoner</option>
                  <option value="chaingpt-llm">ChainGPT LLM</option>
                  <option value="smart-contract-generator">ChainGPT Smart Contract Generator</option>
                  <option value="smart-contract-auditor">ChainGPT Smart Contract Auditor</option>
                  <option value="ai-nft-generator">ChainGPT NFT/Image Generator</option>
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
                <div className="flex align-items" style={{marginTop: '20px'}}>
                  <div><strong style={{marginRight: '8px'}}>Chain:</strong>{getChainName(agent.chainid)}</div>
                </div>

                {/* Agent Pricing System - Price Display and Setting */}
                <div className="flex align-items" style={{marginTop: '20px'}}>
                  <div><strong style={{marginRight: '8px'}}>Price:</strong></div>
                  {isPriceEditing && agent.owner?.toLowerCase() === currentAccount?.toLowerCase() ? (
                    <div className="flex align-items">
                      <input
                        type="number"
                        min="0"
                        value={tempPrice}
                        onChange={(e) => setTempPrice(e.target.value)}
                        style={{width: '100px', marginRight: '8px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #d9d9d9'}}
                        disabled={isLoading}
                      />
                      <span style={{marginRight: '8px'}}>Credits</span>
                      <button
                        disabled={isLoading}
                        onClick={handleSavePrice}
                        style={{marginRight: '8px', padding: '5px 10px', cursor: isLoading ? 'not-allowed' : 'pointer'}}
                        className="Save-button"
                      >
                        Save
                      </button>
                      <button
                        disabled={isLoading}
                        onClick={() => {
                          setIsPriceEditing(false);
                          setTempPrice(agentPrice.toString());
                        }}
                        style={{padding: '5px 10px', cursor: isLoading ? 'not-allowed' : 'pointer'}}
                        className="Cancel-button"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex align-items">
                      <span style={{
                        color: agentPrice > 0 ? '#FF6B00' : '#52c41a',
                        fontWeight: agentPrice > 0 ? 'bold' : 'normal',
                        marginRight: '10px'
                      }}>
                        {agentPrice > 0 ? `${agentPrice} Credits/call` : 'Free'}
                      </span>
                      {agent.owner?.toLowerCase() === currentAccount?.toLowerCase() && (
                        <button
                          onClick={() => {
                            setIsPriceEditing(true);
                            setTempPrice(agentPrice.toString());
                          }}
                          disabled={isLoading}
                          className={isLoading ? 'Train-Agent disabled' : 'Train-Agent'}
                        >
                          Set Price
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 智能检索状态 - 自然集成到Agent信息中 */}
                {enhancedInfo?.capabilities?.vector_search && (
                  <div className="flex align-items" style={{marginTop: '20px'}}>
                    <div><strong style={{marginRight: '8px'}}>智能检索:</strong>✅ 已启用
                      {vectorStats?.totalChunks > 0 && (
                        <span style={{color: '#666', fontSize: '12px', marginLeft: '8px'}}>
                          ({vectorStats.totalChunks} 个知识片段)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {agent.owner?.toLowerCase() === currentAccount?.toLowerCase() && (
              <>
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

                {/* Agent Earnings Statistics */}
                <div style={{marginTop: '30px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px'}}>
                  <div style={{fontWeight: 'bold', fontSize: '18px', marginBottom: '15px', color: '#222'}}>
                    Earnings Statistics
                  </div>
                  <div className="flex" style={{justifyContent: 'space-around'}}>
                    <div style={{textAlign: 'center', padding: '10px'}}>
                      <div style={{fontSize: '28px', fontWeight: 'bold', color: '#1890ff'}}>
                        {agentStats.total_calls}
                      </div>
                      <div style={{fontSize: '14px', color: '#666', marginTop: '5px'}}>Total Calls</div>
                    </div>
                    <div style={{textAlign: 'center', padding: '10px'}}>
                      <div style={{fontSize: '28px', fontWeight: 'bold', color: '#52c41a'}}>
                        {agentStats.total_earnings}
                      </div>
                      <div style={{fontSize: '14px', color: '#666', marginTop: '5px'}}>Total Earnings (Credits)</div>
                    </div>
                    {agentPrice > 0 && agentStats.total_calls > 0 && (
                      <div style={{textAlign: 'center', padding: '10px'}}>
                        <div style={{fontSize: '28px', fontWeight: 'bold', color: '#faad14'}}>
                          {(agentStats.total_earnings / agentStats.total_calls).toFixed(2)}
                        </div>
                        <div style={{fontSize: '14px', color: '#666', marginTop: '5px'}}>Average Earnings/Call</div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Agent Rating Section - Available to all users */}
            <div style={{marginTop: '30px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px'}}>
                <div>
                  <h3 style={{margin: 0, marginBottom: '12px', fontSize: '18px'}}>Rating & Reviews</h3>
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                    <span style={{fontSize: '32px', fontWeight: 'bold'}}>
                      {(Number(averageRating) || 0).toFixed(1)}
                    </span>
                    <div>
                      <div style={{display: 'flex', marginBottom: '4px'}}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span key={star} style={{fontSize: '18px', color: star <= (Number(averageRating) || 0) ? '#faad14' : '#d9d9d9'}}>
                            ★
                          </span>
                        ))}
                      </div>
                      <div style={{fontSize: '13px', color: '#666'}}>
                        {Number(ratingCount) || 0} {Number(ratingCount) === 1 ? 'rating' : 'ratings'}
                      </div>
                    </div>
                  </div>
                </div>
                {agent.owner?.toLowerCase() !== currentAccount?.toLowerCase() && (
                  <button
                    onClick={() => setIsRatingModalOpen(true)}
                    className="Train-Agent"
                  >
                    {userRating > 0 ? 'Update Rating' : 'Rate Agent'}
                  </button>
                )}
              </div>

              {/* Recent Ratings */}
              {ratings.length > 0 && (
                <div style={{marginTop: '24px', borderTop: '1px solid #e8e8e8', paddingTop: '16px'}}>
                  <h4 style={{fontSize: '15px', marginBottom: '12px', color: '#333', fontWeight: '600'}}>Recent Reviews</h4>
                  {ratings.map((rating, index) => (
                    <div key={index} style={{padding: '12px', backgroundColor: '#f9f9f9', borderRadius: '6px', marginBottom: '10px'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                          <div style={{display: 'flex'}}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span key={star} style={{fontSize: '14px', color: star <= rating.rating ? '#faad14' : '#d9d9d9'}}>
                                ★
                              </span>
                            ))}
                          </div>
                          <span style={{fontSize: '12px', color: '#999'}}>
                            {new Date(rating.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#666',
                          fontFamily: 'monospace',
                          backgroundColor: '#e8e8e8',
                          padding: '2px 6px',
                          borderRadius: '3px'
                        }}>
                          {rating.user_id.substring(0, 6)}...{rating.user_id.substring(rating.user_id.length - 4)}
                        </div>
                      </div>
                      {rating.comment && (
                        <div style={{fontSize: '14px', color: '#333', marginTop: '6px', lineHeight: '1.5'}}>{rating.comment}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Prompt Section - Only for owner */}
            {agent.owner?.toLowerCase() === currentAccount?.toLowerCase() && (
              <div style={{marginTop: '30px', padding: '20px', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px solid #e8e8e8'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <h3 style={{margin: 0, fontSize: '16px', fontWeight: '600', color: '#222'}}>
                      🎓 Custom Prompt (Advanced)
                    </h3>
                    <button
                      onClick={() => setShowPromptHelp(!showPromptHelp)}
                      style={{padding: '2px 8px', fontSize: '12px', backgroundColor: '#e8e8e8', border: 'none', borderRadius: '4px', cursor: 'pointer'}}
                    >
                      {showPromptHelp ? 'Hide Help' : 'Show Help'}
                    </button>
                  </div>
                  {!isPromptEditing && (
                    <button
                      onClick={() => setIsPromptEditing(true)}
                      disabled={isLoading}
                      className={isLoading ? 'Train-Agent disabled' : 'Train-Agent'}
                    >
                      {agent.custom_prompt ? 'Edit Prompt' : 'Add Custom Prompt'}
                    </button>
                  )}
                </div>

                {/* Help Section */}
                {showPromptHelp && (
                  <div style={{padding: '15px', backgroundColor: '#fff3cd', borderLeft: '4px solid #ffc107', marginBottom: '15px', fontSize: '13px', lineHeight: '1.6'}}>
                    <strong>💡 Tips for Custom Prompts:</strong>
                    <ul style={{marginTop: '8px', marginBottom: '0'}}>
                      <li>Leave blank to use auto-generated prompt based on Name/Description/Role/Goal</li>
                      <li>Be specific about response format, tone, and style</li>
                      <li>Define expertise boundaries clearly</li>
                      <li>Available template variables: <code style={{backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: '3px', margin: '0 4px'}}>{'{{agent.name}}'}, {'{{agent.description}}'}, {'{{agent.role}}'}, {'{{agent.goal}}'}, {'{{relevantKnowledge}}'}, {'{{previousMessages}}'}, {'{{relevantCode}}'}</code></li>
                    </ul>
                  </div>
                )}

                {/* Prompt Editor */}
                {isPromptEditing ? (
                  <div>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder={`Enter your custom system prompt here...

Example:
You are {{agent.name}}, a specialized {{agent.role}}.

Your expertise: {{agent.description}}
Your goal: {{agent.goal}}

Relevant Knowledge:
{{relevantKnowledge}}

Previous Conversation:
{{previousMessages}}

Instructions:
- Always respond in a professional tone
- Provide code examples when applicable
- Focus on security best practices`}
                      disabled={isLoading}
                      style={{width: '100%', minHeight: '200px', padding: '12px', fontSize: '14px', fontFamily: 'monospace', lineHeight: '1.5', border: '1px solid #d9d9d9', borderRadius: '4px', resize: 'vertical', backgroundColor: isLoading ? '#f5f5f5' : '#fff'}}
                    />
                    <div style={{marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
                      <button
                        onClick={() => {
                          setIsPromptEditing(false);
                          setCustomPrompt(agent.custom_prompt || '');
                        }}
                        disabled={isLoading}
                        className={isLoading ? 'Cancel-button disabled' : 'Cancel-button'}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveCustomPrompt}
                        disabled={isLoading}
                        className={isLoading ? 'Save-button disabled' : 'Save-button'}
                      >
                        {isLoading ? 'Saving...' : 'Save Prompt'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {agent.custom_prompt ? (
                      <div style={{padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: '1.5', maxHeight: '200px', overflowY: 'auto'}}>
                        {agent.custom_prompt}
                      </div>
                    ) : (
                      <div style={{padding: '20px', textAlign: 'center', color: '#999', fontSize: '14px'}}>
                        No custom prompt defined. Using auto-generated prompt based on agent configuration.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rating Modal */}
        {isRatingModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }} onClick={() => setIsRatingModalOpen(false)}>
            <div style={{
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%'
            }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{marginTop: 0}}>Rate this Agent</h3>

              <div style={{marginBottom: '20px'}}>
                <div style={{fontSize: '14px', marginBottom: '8px'}}>Your Rating:</div>
                <div style={{display: 'flex', gap: '8px'}}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      onClick={() => setUserRating(star)}
                      style={{
                        fontSize: '32px',
                        cursor: 'pointer',
                        color: star <= userRating ? '#faad14' : '#d9d9d9',
                        transition: 'color 0.2s'
                      }}
                    >
                      ★
                    </span>
                  ))}
                </div>
              </div>

              <div style={{marginBottom: '20px'}}>
                <div style={{fontSize: '14px', marginBottom: '8px'}}>Comment (optional):</div>
                <textarea
                  value={userComment}
                  onChange={(e) => setUserComment(e.target.value)}
                  placeholder="Share your experience with this agent..."
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #d9d9d9',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
                <button
                  onClick={() => setIsRatingModalOpen(false)}
                  disabled={isLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f0f0f0',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitRating}
                  disabled={isLoading || userRating === 0}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: userRating === 0 ? '#ccc' : '#1890ff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (isLoading || userRating === 0) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isLoading ? 'Submitting...' : 'Submit Rating'}
                </button>
              </div>
            </div>
          </div>
        )}
        {showTraining && (
          <AgentTraining
            agentId={Number(agentId)}
            onTrainingComplete={() => {
              setShowTraining(false);
              fetchAgentDetails();
              fetchEnhancedInfo(); // 刷新RAG信息
            }}
            agentChainId={agent.chainid}
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

      {/* MCP Configuration Section - Phase 1 Step 2 */}
      {(() => {
        console.log('MCP Debug - Agent owner:', agent.owner, 'Current account:', currentAccount, 'Match:', agent.owner?.toLowerCase() === currentAccount?.toLowerCase());
        return null;
      })()}
      {agent.owner?.toLowerCase() === currentAccount?.toLowerCase() && (
        <div className="mcp-configuration-section">
          <div className="long-border"></div>
          <MCPConfiguration
            agentId={agent.id}
            chainId={agent.chainid}
            mcpEnabled={mcpEnabled}
            onMCPEnabledChange={handleMCPEnabledChange}
          />
        </div>
      )}
    </div>
  );

};

export default AgentDetails;

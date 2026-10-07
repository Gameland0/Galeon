import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Agent, ChatContext, Team } from './ChatContext';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import logoimg from "../image/galeon.jpg";
import icon_Agent from '../image/icon_Agent.png';
import icon_Team from '../image/icon_Team.png';
import icon_Marketplace from '../image/icon_Marketplace.png';
import icon_Game from '../image/icon_game.svg';
import selected from '../image/selected.png'
import icon_add from '../image/icon_add.png'

export const ChatSidebar: React.FC = () => {
  const { 
    agents, 
    teams, 
    selectedAgent, 
    selectedTeam,
    isLoading,
    handleAgentSelection, 
    handleTeamSelection, 
    showMarketplace, 
    setShowMarketplace 
  } = useContext(ChatContext);
  
  const { 
    getCurrentAccount, 
    getCurrentWalletType,
    disconnectWallet
  } = useContext(MultiWalletContext);
  
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false)

  const getAgentColor = (agentId: number) => {
    const hue = agentId * 137.508; // Use golden angle approximation
    return `hsl(${hue % 360}, 50%, 75%)`;
  };

  const gototeam = () => {
    if (isLoading) return
    navigate('/team-management')
  }
  
  const gotoGameMarket = () => {
    if (isLoading) return
    navigate('/game-marketplace')
  }
  

  const filterAgent = (agentid: number) => {
    if (!agentid) return false
    const data = agents.filter((item: any) => {
      return item.id === agentid
    })
    if (data.length) return false
    return true
  }

  const handleDisconnect = () => {
    disconnectWallet();
    navigate('/login');
  }

  const account = getCurrentAccount();
  const walletType = getCurrentWalletType();

  return (
    <div className="sidebar">
      <div className="logo">
        <img src={logoimg} alt="" />
      </div>
      
      {/* 钱包信息显示 - 只显示连接状态 */}
      {account && (
        <div className="wallet-status">
          <div className="wallet-info-display">
            <div className="wallet-type-display">
              <span className="wallet-icon">
                {walletType === 'metamask' ? '🦊' : '👻'}
              </span>
              <span className="wallet-name">
                {walletType === 'metamask' ? 'MetaMask' : 'Phantom'}
              </span>
            </div>
            <div className="wallet-address-display">
              {account.slice(0, 6)}...{account.slice(-4)}
            </div>
            <button className="disconnect-btn" onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        </div>
      )}
      
      <div className="title">
        <img src={icon_Agent} alt="" />
        <div>Your Agents</div>
      </div>
      
      {showAll? (
        agents.map((agent: Agent, index: number) => (
          <div 
            key={index} 
            className={`chat-agent-item ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
            style={{borderColor: getAgentColor(agent.id)}}
          >
            <h4>{agent.name}</h4>
            <p className="ellipsis-multiline">{agent.description}</p>
            <div className="agent-buttons">
              <button 
                onClick={() => handleAgentSelection(agent)}
                disabled={isLoading}
                className={`select-btn ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
              >
                {selectedAgent?.id === agent.id ? 'Deselect' : 'Select'}
              </button>
              <Link to={`/agent/${agent.id}`} className={isLoading? 'view-details-btn disabled-link':'view-details-btn'}>View Details</Link>
            </div>
          </div>
        ))
      ):(
        agents.slice(0, 3).map((agent: Agent, index: number) => (
          <div 
            key={index} 
            className={`chat-agent-item ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
            style={{borderColor: getAgentColor(agent.id)}}
          >
            <h4>{agent.name}</h4>
            <p className="ellipsis-multiline">{agent.description}</p>
            <div className="agent-buttons">
              <button 
                onClick={() => handleAgentSelection(agent)}
                disabled={isLoading}
                className={`select-btn ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
              >
                {selectedAgent?.id === agent.id ? 'Deselect' : 'Select'}
              </button>
              <Link to={`/agent/${agent.id}`} className={isLoading? 'view-details-btn disabled-link':'view-details-btn'}>View Details</Link>
            </div>
          </div>
        ))
      )}
      {agents.length ? (
        !showAll ? (
          <div className="See-All" onClick={()=> setShowAll(true)}>
            See All
          </div>
        ):(
          <div className="See-All" onClick={()=> setShowAll(false)}>
            Hide
          </div>
        )
      ):''}
      
      <div className="title">
        <img src={icon_Marketplace} alt="" />
        <div className="pointer" onClick={() => isLoading ? setShowMarketplace(false) : setShowMarketplace(!showMarketplace)}>
          {showMarketplace ? 'Hide Marketplace' : 'Show Marketplace'}
        </div>
      </div>
      {filterAgent(selectedAgent?.id) ? (
        <div className="Marketplace-agent">
          <img src={selected} alt="" />
          <div>{selectedAgent?.name}</div>
        </div>
      ) : ''}

      {/* <div className="title">
        <img src={icon_Game} alt="" />
        <div className="pointer" onClick={gotoGameMarket}>
          Game Marketplace
        </div>
      </div> */}

      <div className="title">
        <div style={{fontSize: '20px', marginRight: '8px'}}>💰</div>
        <div className="pointer" onClick={() => navigate('/creator/dashboard')}>
          Creator Center
        </div>
      </div>

      {account?.toLowerCase() === process.env.REACT_APP_ADMIN_WALLET_ADDRESS?.toLowerCase() && (
        <div className="title">
          <div style={{fontSize: '20px', marginRight: '8px'}}>⚙️</div>
          <div className="pointer" onClick={() => navigate('/admin/withdrawals')}>
            Admin Panel
          </div>
        </div>
      )}

    </div>
  );
};

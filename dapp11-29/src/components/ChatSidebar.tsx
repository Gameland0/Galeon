import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Agent, ChatContext, Team } from './ChatContext';
import logoimg from "../image/Gameland.png";
import icon_Agent from '../image/icon_Agent.png';
import icon_Team from '../image/icon_Team.png';
import icon_Marketplace from '../image/icon_Marketplace.png';
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

  const filterAgent = (agentid: number) => {
    if (!agentid) return false
    const data = agents.filter((item: any) => {
      return item.id === agentid
    })
    if (data.length) return false
    return true
  }

  return (
    <div className="sidebar">
      <div className="logo">
        <img src={logoimg} alt="" />
      </div>
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
      {/* <button onClick={() => setShowMarketplace(!showMarketplace)} className="marketplace-button">
        {showMarketplace ? 'Hide Marketplace' : 'Show Marketplace'}
      </button> */}
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
      <div className="title">
        <img src={icon_Team} alt="" />
        <div>Your Teams</div>
      </div>
      {teams.map((team: Team, index: number) => (
        <div 
          key={index} 
          className={`chat-agent-item ${selectedTeam?.teamid === team.teamid ? 'selected' : ''}`}
          style={{borderColor: getAgentColor(team.id)}}
        >
          <h4>{team.name}</h4>
          <p>{team.description}</p>
          <button className={selectedTeam?.teamid === team.teamid ? 'selected' : ''} disabled={isLoading} onClick={() => handleTeamSelection(team)}>
            {selectedTeam?.teamid === team.teamid ? 'Deselect' : 'Select'}
          </button>
        </div>
      ))}
      <div className="add-to pointer" onClick={gototeam}>
        Manage Teams
      </div>

      {/* <Link to="/team-management" className="create-team-button">Manage Teams</Link> */}
    </div>
  );
};

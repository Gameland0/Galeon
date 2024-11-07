import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { Agent, ChatContext, Team } from './ChatContext';

export const ChatSidebar: React.FC = () => {
  const { 
    agents, 
    teams, 
    selectedAgent, 
    selectedTeam,
    handleAgentSelection, 
    handleTeamSelection, 
    showMarketplace, 
    setShowMarketplace 
  } = useContext(ChatContext);

  const getAgentColor = (agentId: number) => {
    const hue = agentId * 137.508; // Use golden angle approximation
    return `hsl(${hue % 360}, 50%, 75%)`;
  };

  return (
    <div className="sidebar">
      <h3>Your Agents</h3>
      {agents.map((agent: Agent, index: number) => (
        <div 
          key={index} 
          className={`agent-item ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
          style={{borderColor: getAgentColor(agent.id)}}
        >
          <h4>{agent.name}</h4>
          <p>{agent.description}</p>
          <div className="agent-buttons">
            <button 
              onClick={() => handleAgentSelection(agent)}
              className={`select-btn ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
            >
              {selectedAgent?.id === agent.id ? 'Deselect' : 'Select'}
            </button>
            <Link to={`/agent/${agent.id}`} className="view-details-btn">View Details</Link>
          </div>
        </div>
      ))}
      <button onClick={() => setShowMarketplace(!showMarketplace)} className="marketplace-button">
        {showMarketplace ? 'Hide Marketplace' : 'Show Marketplace'}
      </button>
      <h3>Your Teams</h3>
      {teams.map((team: Team, index: number) => (
        <div 
          key={index} 
          className={`team-item ${selectedTeam?.id === team.id ? 'selected' : ''}`}
        >
          <h4>{team.name}</h4>
          <p>{team.description}</p>
          <button onClick={() => handleTeamSelection(team)}>
            {selectedTeam?.id === team.id ? 'Deselect' : 'Select'}
          </button>
        </div>
      ))}
      <Link to="/team-management" className="create-team-button">Manage Teams</Link>
    </div>
  );
};

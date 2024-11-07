import React, { useState, useEffect, useContext } from 'react';
import { getAgents, createTeam, getTeams, updateTeam, getTeamById, getMarketplaceAgents, updateTeamAgentRoles, deleteTeam } from '../services/api';
import { Web3Context } from '../contexts/Web3Context';
import { Link } from 'react-router-dom';
import '../styles/TeamManagement.css';
import { Agent } from './ChatContext';

interface Team {
  id: string;
  name: string;
  description: string;
  agents: Agent[];
}

interface AgentItemProps {
  agent: Agent;
  isSelected: boolean;
  onSelect: (agent: Agent) => void;
  onRoleAssign: (agentId: number, role: string) => void;
  teamRoles: string[];
  role: any;
}

const AgentItem: React.FC<AgentItemProps> = ({ agent, isSelected, onSelect, onRoleAssign, teamRoles, role }) => (
  <div className={`agent-item ${isSelected ? 'selected' : ''}`}>
    <span>{agent.name}</span>
    <select
      value={role}
      onChange={(e) => onRoleAssign(agent.id, e.target.value)}
      disabled={!isSelected}
    >
      <option value="">Select Role</option>
      {teamRoles.map((role: any) => (
        <option key={role} value={role}>{role}</option>
      ))}
    </select>
    <button onClick={() => onSelect(agent)}>
      {isSelected ? 'Deselect' : 'Select'}
    </button>
  </div>
);


const TeamManagement: React.FC = () => {
  const { account } = useContext(Web3Context);
  const [userAgents, setUserAgents] = useState<Agent[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<Agent[]>([]);
  const [deletedAgents, setDeletedAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeam, setNewTeam] = useState<Omit<Team, 'id'>>({ name: '', description: '', agents: [] });
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [teamRoles, setTeamRoles] = useState<string[]>([
    'task_decomposer', 
    'executor', 
    'code_reviewer', 
    'optimizer',
    'frontend_developer',
    'backend_developer',
    'solidity_developer',
    'rust_developer',
    'ui_designer',
    'database_specialist',
    'security_expert',
    'game_developer',
    'tokenomics_expert',
    'move_developer',
    'func_developer',
    'cosmwasm_developer',
    'haskell_developer',
    'vyper_developer'
  ]);


  useEffect(() => {
    if (account) {
      fetchUserAgents();
      fetchMarketplaceAgents();
      fetchTeams();
    }
  }, [account]);

  const fetchUserAgents = async () => {
    try {
      const fetchedAgents = await getAgents(account);
      setUserAgents(fetchedAgents.map((agent: any) => ({ ...agent, isMarketplace: false })));
    } catch (error) {
      console.error('Error fetching user agents:', error);
    }
  };

  const fetchMarketplaceAgents = async () => {
    try {
      const fetchedAgents = await getMarketplaceAgents();
      // Filter out user's own agents from marketplace agents
      const filteredAgents = fetchedAgents.filter((agent: Agent) => agent.owner !== account);
      setMarketplaceAgents(filteredAgents);
    } catch (error) {
      console.error('Error fetching marketplace agents:', error);
    }
  };


  const fetchTeams = async () => {
    try {
      const fetchedTeams = await getTeams();
      setTeams(fetchedTeams);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };
  

  const handleCreateTeam = async () => {
    if (!newTeam.name ) {
      alert('Team name cannot be empty!');
      return
    }
    if (!newTeam.description) {
      alert('Team name cannot be empty!');
      return
    }
    try {
      const teamAgents = newTeam.agents.map(agent => ({
        ...agent,
        role: agent.role || 'executor' // 默认角色为executor
      }));
  
      const createdTeam = await createTeam({
        ...newTeam,
        agents: teamAgents
      });
  
      // 更新团队中代理的角色
      await updateTeamAgentRoles(createdTeam.id, teamAgents.map(agent => ({
        agentId: agent.id,
        role: agent.role
      })));
  
      setNewTeam({ name: '', description: '', agents: [] });
      setShowCreateForm(false);
      fetchTeams();
    } catch (error) {
      console.error('Error creating team:', error);
    }
  };
  
  const handleRoleAssignment = (agentId: number, role: string) => {
    setNewTeam(prev => ({
      ...prev,
      agents: prev.agents.map(agent =>
        agent.id === agentId ? { ...agent, role } : agent
      )
    }));
  };

  const handleUpdateTeam = async () => {
    if (!editingTeam) return;
    try {
      await updateTeam(editingTeam.id, editingTeam);
      setEditingTeam(null);
      fetchTeams();
    } catch (error) {
      console.error('Error updating team:', error);
    }
  };

  const handleEditTeam = async (teamId: string) => {
    try {
      const team = await getTeamById(teamId);
      if (team) {
        // 过滤掉已删除的 agents
        const activeAgents = team.agents.filter((agent: any) => agent.id !== null);
        const deletedAgents = team.agents.filter((agent: any) => agent.id === null);
        
        setEditingTeam({...team, agents: activeAgents});
        
        if (deletedAgents.length > 0) {
          alert(`Some agents in this team have been deleted and are no longer usable: ${deletedAgents.map((a: any) => a.name).join(', ')}`);
        }
      }
    } catch (error) {
      console.error('Error fetching team details:', error);
      alert('Failed to fetch team details. Please try again.');
    }
  };  

  const handleDeleteTeam = async (teamId: string) => {
    if (window.confirm('Are you sure you want to delete this team?')) {
      try {
        await deleteTeam(teamId);
        fetchTeams();
        alert('Team deleted successfully!');
      } catch (error) {
        console.error('Error deleting team:', error);
        alert('Failed to delete team. Please try again.');
      }
    }
  };

  useEffect(() => {
    console.log('New team state:', newTeam);  // 用于调试
  }, [newTeam]);


  const handleAgentSelection = (agent: Agent) => {
    setNewTeam(prev => {
      const isAgentSelected = prev.agents.some(a => a.id === agent.id);
      if (isAgentSelected) {
        return {
          ...prev,
          agents: prev.agents.filter(a => a.id !== agent.id)
        };
      } else {
        return {
          ...prev,
          agents: [...prev.agents, { ...agent, role: '' }]
        };
      }
    });
  };


  return (
    <div className="team-management">
      <Link to="/chat" className="back-button">Back to Chat</Link>
      <h2>Team Management</h2>
      <button className="toggle-form-btn" onClick={() => setShowCreateForm(!showCreateForm)}>
        {showCreateForm ? 'Cancel' : 'Create New Team'}
      </button>
      {showCreateForm && (
        <div className="create-team-form">
          <h3>Create New Team</h3>
          <input
            type="text"
            placeholder="Team Name"
            value={newTeam.name}
            onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
          />
          <textarea
            placeholder="Team Description"
            value={newTeam.description}
            onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
          />
          <div className="agent-selection">
            <h4>Select Agents and Assign Roles</h4>
            <div className="user-agents">
              <h5>Your Agents</h5>
              {userAgents.map(agent => (
                <AgentItem 
                  key={agent.id} 
                  agent={agent} 
                  isSelected={newTeam.agents.some(a => a.id === agent.id)}
                  onSelect={handleAgentSelection}
                  onRoleAssign={handleRoleAssignment}
                  teamRoles={teamRoles}
                  role={newTeam.agents.find(a => a.id === agent.id)?.role}
                />
              ))}
            </div>
            <div className="marketplace-agents">
              <h5>Marketplace Agents</h5>
              {marketplaceAgents.map(agent => (
                <AgentItem 
                  key={agent.id} 
                  agent={agent} 
                  isSelected={newTeam.agents.some(a => a.id === agent.id)}
                  onSelect={handleAgentSelection}
                  onRoleAssign={handleRoleAssignment}
                  teamRoles={teamRoles}
                  role={newTeam.agents.find(a => a.id === agent.id)?.role}
                />
              ))}
            </div>
          </div>
          <button className="create-team-btn" onClick={handleCreateTeam}>Create Team</button>
        </div>
      )}



      <div className="team-list">
        <h3>Existing Teams</h3>
        {teams.map(team => (
          <div key={team.id} className="team-item">
            <h4>Crew Name: {team.name}</h4>
            <p>Description: {team.description}</p >
            <div className="team-actions">
              <button onClick={() => handleEditTeam(team.id)} className="Edit">Edit</button>
              <Link to={`/chat?teamId=${team.id}`} className="use-team-btn">Use Team</Link>
              <button onClick={() => handleDeleteTeam(team.id)} className="Delete">Delete Team</button>
            </div>
          </div>
        ))}
      </div>

      {editingTeam && (
        <div className="edit-team-form">
          <h3>Edit Team</h3>
          <input
            type="text"
            value={editingTeam.name}
            onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
          />
          <textarea
            value={editingTeam.description}
            onChange={(e) => setEditingTeam({ ...editingTeam, description: e.target.value })}
          />
          <div className="agent-selection">
            <h4>Edit Team Agents</h4>
            {editingTeam.agents.map((agent) => (
              <div key={agent.id} className="agent-item">
                <span>{agent.name}</span>
                <select
                  value={agent.role}
                  onChange={(e) => {
                    const updatedAgents = editingTeam.agents.map(a =>
                      a.id === agent.id ? { ...a, role: e.target.value } : a
                    );
                    setEditingTeam({ ...editingTeam, agents: updatedAgents });
                  }}
                >
                  {teamRoles.map(role => (
                    <option key={role} value={role}>{role.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            ))}
            {deletedAgents.length > 0 && (
              <div className="deleted-agents">
                <h5>Deleted Agents</h5>
                {deletedAgents.map((agent, index) => (
                  <div key={index} className="deleted-agent-item">
                    <span>{agent.name} (Role: {agent.role})</span>
                    <p className="warning">This agent has been deleted and is no longer usable.</p >
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="edit-team-actions">
            <button onClick={handleUpdateTeam}>Update Team</button>
            <button onClick={() => setEditingTeam(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;

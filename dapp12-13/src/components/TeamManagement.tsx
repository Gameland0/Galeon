import React, { useState, useEffect, useContext } from 'react';
import { getAgents, createTeam, getTeams, updateTeam, getTeamById, getMarketplaceAgents, updateTeamAgentRoles, deleteTeam, getUserInfo, updataUserInfo } from '../services/api';
import { Web3Context } from '../contexts/Web3Context';
import { Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { TeamRegistry } from '../contracts/TeamRegistry';
import { USDTContract } from '../contracts/USDTContract'
import '../styles/TeamManagement.css';
import { Agent } from './ChatContext';
import Web3 from 'web3';
import icon_Hide from '../image/icon_Hide.png'

interface Team {
  teamid: string;
  name: string;
  description: string;
  agents: Agent[];
}

interface TeamAgent {
  id: number;
  name: string;
  role: string;
}

interface AgentItemProps {
  agent: Agent;
  isSelected: boolean;
  onSelect: (agent: Agent) => void;
  onRoleAssign: (agentId: number, role: string) => void;
  teamRoles: string[];
  role: any;
}

interface NewTeam extends Omit<Team, 'id'> {
  agents: Agent[];
}

const AgentItem: React.FC<AgentItemProps> = ({ agent, isSelected, onSelect, onRoleAssign, teamRoles, role }) => (
  <div className={`agent-item ${isSelected ? 'selected' : ''}`}>
    <div className="flex align-items">
      <div className="border"></div>
      <div style={{fontSize: '14px'}}>{agent.name}</div>
    </div>
    <div className="flex align-items">
      <div className="Select">
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
      </div>
      <button onClick={() => onSelect(agent)}>
        {isSelected ? 'Deselect' : 'Select'}
      </button>
    </div>
  </div>
);

const TeamManagement: React.FC = () => {
  const web3Instance = new Web3((window as any).ethereum);
  const { account, networkId } = useContext(Web3Context);
  const [userAgents, setUserAgents] = useState<Agent[]>([]);
  const [marketplaceAgents, setMarketplaceAgents] = useState<Agent[]>([]);
  const [deletedAgents, setDeletedAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeam, setNewTeam] = useState<Omit<Team, 'teamid'>>({ name: '', description: '', agents: [] });
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [refresh, setrefresh] = useState(false);
  const [showbuyTeam, setShowbuyTeam] = useState(false);
  const [isLoading, setisLoading] = useState(false);
  const [teamlimit, setTeamLimit] = useState(1);
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
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (account) {
      fetchUserAgents();
      fetchMarketplaceAgents();
      fetchTeams();
    }
  }, [account, refresh]);

  useEffect(() => {
    if (account) {
      getTeamLimt()
    }
  }, [account, refresh]);

  const fetchUserAgents = async () => {
    try {
      const fetchedAgents = await getAgents(account);
      setUserAgents(fetchedAgents.map((agent: any) => ({ ...agent, isMarketplace: false })));
    } catch (error) {
      console.error('Error fetching user agents:', error);
    }
  };

  const getTeamLimt = async () => {
    const teamLimit = await getUserInfo();
    setTeamLimit(teamLimit[0].teammax)
  }

  const fetchMarketplaceAgents = async () => {
    try {
      const fetchedAgents = await getMarketplaceAgents();
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
    
    if (teams.length >= teamlimit) {
      alert('Maximum team limit reached')
      return
    }
    if (!newTeam.name ) {
      alert('Team name cannot be empty!');
      return
    }
    if (!newTeam.description) {
      alert('Team name cannot be empty!');
      return
    }
    if (newTeam.description.length>120) {
      alert('Description cannot exceed 120 characters.');
      return
    }
    if (!newTeam.agents || newTeam.agents.length < 2) {
      alert('Please select at least 2 agents for the team!');
      return;
    }
    if (newTeam.agents.length > 5) {
      alert('You can only select up to 5 agents for a team!');
      return;
    }
    setisLoading(true)
    setIsCreating(true);

    try {

      const accounts = await web3Instance.eth.getAccounts();
      const chainId = await web3Instance.eth.getChainId();
      const teamRegistry = new TeamRegistry(web3Instance,chainId);
      const teamAgent = [] as any
      const teamAgents = newTeam.agents.map(agent => ({
        ...agent,
        role: agent.role || 'executor'
      }));
      const teamId = uuidv4();
      newTeam.agents.map(agent => teamAgent.push([agent.id,agent.role|| 'executor']));
      // 链上注册团队
      const tx = await teamRegistry.registerTeam(
        newTeam.name,
        newTeam.description,
        teamAgent,
        accounts[0],
        teamId
      );
      
      const createdTeam = await createTeam({
        ...newTeam,
        transactionHash: 'tx.hash',
        agents: teamAgents,
        teamId: teamId,
        chainid: chainId
      });
  
      // 更新团队中代理的角色
      try {
        await updateTeamAgentRoles(teamId, teamAgents.map(agent => ({
          agentId: agent.id,
          role: agent.role,
          chainid: chainId
        })));
      } catch (error) {
        await deleteTeam(teamId);
        setisLoading(false)
        return
      }
  
      setNewTeam({ name: '', description: '', agents: [] });
      setShowCreateForm(false);
      setisLoading(false)
      fetchTeams();
    } catch (error) {
      console.error('Error creating team:', error);
      setisLoading(false)
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
    setisLoading(true)
    try {
      const accounts = await web3Instance.eth.getAccounts();
      const chainId = await web3Instance.eth.getChainId();
      const teamRegistry = new TeamRegistry(web3Instance,chainId);
      const teamAgent = [] as any
      editingTeam.agents.map(agent => teamAgent.push([agent.id, agent.role|| 'executor']));
      const tx = await teamRegistry.updateTeam(
        editingTeam.name,
        editingTeam.description,
        editingTeam.teamid,
        teamAgent,
        accounts[0]
      )
      const param = {...editingTeam, transactionHash: tx, chainid: chainId }
      await updateTeam(editingTeam.teamid, param);
      setEditingTeam(null);
      fetchTeams();
      setisLoading(false)
    } catch (error) {
      console.error('Error updating team:', error);
      setisLoading(false)
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
      setisLoading(true)
      try {
        await deleteTeam(teamId);
        fetchTeams();
        alert('Team deleted successfully!');
        setisLoading(false)
      } catch (error) {
        console.error('Error deleting team:', error);
        alert('Failed to delete team. Please try again.');
        setisLoading(false)
      }
    }
  };

  const buyTeam = async () => {
    setShowbuyTeam(false)
    try {
      const accounts = await web3Instance.eth.getAccounts();
      const chainId = await web3Instance.eth.getChainId();
      const teamRegistry = new TeamRegistry(web3Instance,chainId);
      const tx = await teamRegistry.buyTeamAmount(accounts[0])
      alert('Purchase Success')
    } catch (error) {
      alert(`Error buyTeam team: ${error}`)
      console.error('Error buyTeam team:', error);
    }
  }

  const buyTeamUsdt = async () => {
    setisLoading(true)
    setShowbuyTeam(false)
    try {
      const accounts = await web3Instance.eth.getAccounts();
      const chainId = await web3Instance.eth.getChainId();
      const teamRegistry = new TeamRegistry(web3Instance,chainId);
      const usdtContract = new USDTContract(web3Instance, chainId);
      await usdtContract.Approve(accounts[0])
      const tx = await teamRegistry.buyTeamAmount_usdt(accounts[0])
      await updataUserInfo()
      // await teamRegistry.setBuyAmount(accounts[0])
      alert('Purchase Success')
      setrefresh(!refresh)
      setisLoading(false)
    } catch (error: any) {
      alert(`Error buyTeam team: ${error}`)
      console.error('Error buyTeam team:', error);
      setisLoading(false)
    }
  }

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
      <div className="team-contex">
        <Link to="/chat" className="back-button">
          <div className="flex align-items space-between">
            <div style={{marginLeft: '8px'}}>Back to Chat</div>
            <div className="Hide"><img src={icon_Hide} alt="icon_Hide" /></div>
          </div>
        </Link>
        <h3>Team Management (Slot: {teamlimit || 1} )</h3>
        <button 
          className={isLoading? 'buy-slot-btn disabled':'buy-slot-btn'}
          onClick={buyTeamUsdt}
          disabled={isLoading}
        >
          {isLoading ? 'Buy Team Slot (loading...)':'Buy Team Slot'}
        </button>
        {/* {showbuyTeam ? (
          <div className="buyTeam">
          <div onClick={buyTeamUsdt}>USDT</div>
          <div onClick={buyTeam}>{networkId === 97? 'TBNB' : 'POL'}</div>
        </div>
        ):''} */}
        <button className={showCreateForm ? 'Cancel':'toggle-form-btn'} onClick={() => setShowCreateForm(!showCreateForm)} disabled={isLoading}>
          {showCreateForm ? 'Cancel' : 'Create New Team'}
        </button>
        {showCreateForm && (
          <div className="create-team-form">
            <h3>Create New Team</h3>
            <input
              type="text"
              placeholder="Team Name"
              value={newTeam.name}
              onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value.replace(/\s/g, '') })}
            />
            <textarea
              placeholder="Team Description"
              value={newTeam.description}
              onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
            />
            <div className="agent-selection">
              <h4>Select Agents and Assign Roles</h4>
              <div className="user-agents">
                <div className="title">Your Agents</div>
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
                <div className="title">Marketplace Agents</div>
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
            <button className={isLoading? 'create-team-btn disabled':'create-team-btn'} onClick={handleCreateTeam} disabled={isLoading}>{isLoading ? 'Create Team (loading...)':'Create Team'}</button>
          </div>
        )}
        <div className="team-list">
          <h3>Existing Teams</h3>
          {teams.map(team => (
            <div key={team.teamid} className="team-item">
              <h4>Crew Name: {team.name}</h4>
              <p>Description: {team.description}</p >
              <div className="team-actions">
                <button disabled={isLoading} onClick={() => handleEditTeam(team.teamid)} className={isLoading? 'disabled Edit':'Edit'}>Edit</button>
                <Link to={`/chat?teamId=${team.teamid}`} className="use-team-btn">Use Team</Link>
                <button disabled={isLoading} onClick={() => handleDeleteTeam(team.teamid)} className={isLoading? 'disabled Delete':'Delete'}>Delete Team</button>
              </div>
            </div>
          ))}
        </div>
        {editingTeam && (
          <div className="edit-team-form">
            <h3>Edit Team</h3>
            <div className="flex align-items">
              <div style={{marginRight:'8px',color: '#888888'}}>Crew Name:</div>
              <input
                type="text"
                value={editingTeam.name}
                disabled={isLoading}
                onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
              />
            </div>
            <div className="flex align-items">
              <div style={{marginRight:'8px',color: '#888888'}}>Description:</div>
              <textarea
                value={editingTeam.description}
                disabled={isLoading}
                onChange={(e) => setEditingTeam({ ...editingTeam, description: e.target.value })}
              />
            </div>
            <div className="agent-selection">
              <h4>Edit Team Agents</h4>
              {editingTeam.agents.map((agent) => (
                <div key={agent.id} className="agent-item">
                  <div className="flex align-items">
                    <div className="border"></div>
                    <div>{agent.name}</div>
                  </div>
                  <div className="Select">
                    <select
                      value={agent.role}
                      disabled={isLoading}
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
              <button className={isLoading? 'disabled':''} onClick={handleUpdateTeam} disabled={isLoading}>{isLoading? 'Update Team (loading...)':'Update Team'}</button>
              <button className={isLoading? 'disabled':''} onClick={() => setEditingTeam(null)} disabled={isLoading}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamManagement;

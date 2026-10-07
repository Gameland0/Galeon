import React, { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';
import { SolanaAgentClient, AgentData, TeamData, SolanaAgent, SolanaTeam } from '../contracts/SolanaAgentClient';
import { SolanaIpfsService, AgentConfig, IpfsContentType } from '../services/solanaIpfsService';
import '../styles/SolanaAgentManager.css';

// Solana Agent管理组件
// 集成Agent创建、团队管理和IPFS存储功能

const PROGRAM_ID = 'DHU9UBVaZNtw77FabwS7JmCxrgnNPA6Zg18xBPfB3rZ'; // 最新部署的程序ID
const TREASURY_PUBKEY = 'Treasury1111111111111111111111111111111'; // 需要替换为实际的财库地址

interface TeamRole {
  value: string;
  label: string;
}

const TEAM_ROLES: TeamRole[] = [
  { value: 'task_decomposer', label: 'Task Decomposer' },
  { value: 'executor', label: 'Executor' },
  { value: 'code_reviewer', label: 'Code Reviewer' },
  { value: 'optimizer', label: 'Optimizer' },
  { value: 'frontend_developer', label: 'Frontend Developer' },
  { value: 'backend_developer', label: 'Backend Developer' },
  { value: 'solidity_developer', label: 'Solidity Developer' },
  { value: 'rust_developer', label: 'Rust Developer' },
  { value: 'ui_designer', label: 'UI Designer' },
  { value: 'database_specialist', label: 'Database Specialist' },
  { value: 'security_expert', label: 'Security Expert' },
  { value: 'game_developer', label: 'Game Developer' },
  { value: 'tokenomics_expert', label: 'Tokenomics Expert' },
  { value: 'move_developer', label: 'Move Developer' },
  { value: 'project_manager', label: 'Project Manager' }
];

export const SolanaAgentManager: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // 服务实例
  const [client, setClient] = useState<SolanaAgentClient | null>(null);
  const [ipfsService] = useState(() => new SolanaIpfsService());
  
  // 状态管理
  const [agents, setAgents] = useState<SolanaAgent[]>([]);
  const [teams, setTeams] = useState<SolanaTeam[]>([]);
  const [userTeamLimit, setUserTeamLimit] = useState({ teamLimit: 1, teamsCreated: 0 });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'agents' | 'teams'>('agents');
  
  // Agent创建表单
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentForm, setAgentForm] = useState({
    name: '',
    description: '',
    type: '',
    image: null as File | null,
  });
  
  // 团队创建表单
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: '',
    description: '',
    selectedAgents: [] as Array<{ agentId: number; role: string }>,
  });

  // 初始化客户端
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      const agentClient = new SolanaAgentClient(connection, wallet, PROGRAM_ID);
      setClient(agentClient);
    } else {
      setClient(null);
      setAgents([]);
      setTeams([]);
    }
  }, [wallet.connected, wallet.publicKey, connection]);

  // 加载用户数据
  const loadUserData = useCallback(async () => {
    if (!client || !wallet.publicKey) return;
    
    try {
      setLoading(true);
      const [userAgents, userTeams, teamLimit] = await Promise.all([
        client.getUserAgents(),
        client.getUserTeams(),
        client.getUserTeamLimit()
      ]);
      
      setAgents(userAgents);
      setTeams(userTeams);
      setUserTeamLimit(teamLimit);
    } catch (error) {
      console.error('Error loading user data:', error);
      // 如果是因为账户不存在，尝试初始化
      if (error.message.includes('Account does not exist')) {
        try {
          await client.initializeUserLimit();
          console.log('User limit initialized');
          // 重新加载数据
          setTimeout(() => loadUserData(), 2000);
        } catch (initError) {
          console.error('Error initializing user limit:', initError);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [client, wallet.publicKey]);

  useEffect(() => {
    if (client) {
      loadUserData();
    }
  }, [client, loadUserData]);

  // ===== Agent相关操作 =====

  const handleCreateAgent = async () => {
    if (!client || !agentForm.name || !agentForm.description || !agentForm.type) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);

      // 1. 创建Agent配置对象
      const agentConfig: AgentConfig = {
        name: agentForm.name,
        description: agentForm.description,
        type: agentForm.type,
        version: '1.0.0',
        capabilities: [],
        created_at: Math.floor(Date.now() / 1000),
      };

      // 2. 上传配置到IPFS
      const configMetadata = await ipfsService.uploadAgentConfig(agentConfig);
      console.log('Agent config uploaded to IPFS:', configMetadata.contentHash);

      // 3. 上传图片到IPFS (如果有)
      let imageUrl = '';
      if (agentForm.image) {
        const imageMetadata = await ipfsService.uploadImage(agentForm.image);
        imageUrl = ipfsService.getImageUrl(imageMetadata.contentHash);
        console.log('Agent image uploaded to IPFS:', imageMetadata.contentHash);
      }

      // 4. 在Solana上注册Agent
      const agentData: AgentData = {
        name: agentForm.name,
        description: agentForm.description,
        agentType: agentForm.type,
        ipfsHash: configMetadata.contentHash,
        imageUrl: imageUrl,
      };

      const txSignature = await client.registerAgent(agentData);
      console.log('Agent registered on Solana:', txSignature);

      // 5. 等待交易确认
      await client.confirmTransaction(txSignature);
      alert(`Agent created successfully! Transaction: ${txSignature}`);

      // 6. 重置表单并刷新数据
      setAgentForm({ name: '', description: '', type: '', image: null });
      setShowAgentForm(false);
      await loadUserData();

    } catch (error) {
      console.error('Error creating agent:', error);
      
      // 提供更详细的错误信息
      let errorMessage = 'Failed to create agent: ';
      
      if (error.message?.includes('already in use')) {
        errorMessage += 'The agent account already exists. This might be due to a recent creation. Please try again in a few seconds.';
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage += 'Insufficient SOL balance. Please ensure you have enough SOL in your wallet.';
      } else if (error.message?.includes('User rejected')) {
        errorMessage += 'Transaction was cancelled by the user.';
      } else if (error.logs) {
        // 如果有链上日志，显示它们
        errorMessage += 'Transaction failed. Logs: ' + error.logs.join(' ');
      } else {
        errorMessage += error.message || 'Unknown error occurred';
      }
      
      alert(errorMessage);
      
      // 如果是账户已存在的错误，可能需要初始化注册表
      if (error.message?.includes('already in use')) {
        console.log('Checking if registry needs initialization...');
        setTimeout(async () => {
          try {
            // 尝试初始化注册表
            await client.initializeRegistry();
            console.log('Registry initialized successfully');
            setTimeout(() => loadUserData(), 1000);
          } catch (initError) {
            console.log('Registry already initialized or init failed:', initError);
            loadUserData();
          }
        }, 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAgentPublic = async (agentId: number) => {
    if (!client) return;

    try {
      setLoading(true);
      const txSignature = await client.toggleAgentPublic(agentId);
      await client.confirmTransaction(txSignature);
      console.log('Agent publicity toggled:', txSignature);
      await loadUserData();
    } catch (error) {
      console.error('Error toggling agent publicity:', error);
      alert('Failed to toggle agent publicity: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ===== 团队相关操作 =====

  const handleCreateTeam = async () => {
    if (!client || !teamForm.name || !teamForm.description) {
      alert('Please fill in team name and description');
      return;
    }

    if (teamForm.selectedAgents.length < 2) {
      alert('Please select at least 2 agents for the team');
      return;
    }

    if (teamForm.selectedAgents.length > 5) {
      alert('Maximum 5 agents allowed per team');
      return;
    }

    try {
      setLoading(true);

      // 1. 检查团队限制
      if (userTeamLimit.teamsCreated >= userTeamLimit.teamLimit) {
        const shouldPurchase = window.confirm(
          `You have reached your team limit (${userTeamLimit.teamLimit}). Would you like to purchase an additional team slot?`
        );
        
        if (shouldPurchase) {
          const purchaseTx = await client.purchaseTeamSlot();
          await client.confirmTransaction(purchaseTx);
          console.log('Team slot purchased:', purchaseTx);
          // 更新限制信息
          const newLimit = await client.getUserTeamLimit();
          setUserTeamLimit(newLimit);
        } else {
          return;
        }
      }

      // 2. 创建团队
      const teamUuid = uuidv4();
      const teamData: TeamData = {
        teamUuid: teamUuid,
        name: teamForm.name,
        description: teamForm.description,
      };

      const createTx = await client.createTeam(teamData);
      await client.confirmTransaction(createTx);
      console.log('Team created:', createTx);

      // 3. 获取新创建的团队ID（这里需要解析事件或重新查询）
      await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒确保数据同步
      const updatedTeams = await client.getUserTeams();
      const newTeam = updatedTeams.find(t => t.teamUuid === teamUuid);
      
      if (!newTeam) {
        throw new Error('Failed to find newly created team');
      }

      // 4. 添加Agent到团队
      for (const { agentId, role } of teamForm.selectedAgents) {
        const addAgentTx = await client.addAgentToTeam(newTeam.id, agentId, role);
        await client.confirmTransaction(addAgentTx);
        console.log('Agent added to team:', addAgentTx);
      }

      alert(`Team created successfully with ${teamForm.selectedAgents.length} agents!`);

      // 5. 重置表单并刷新数据
      setTeamForm({ name: '', description: '', selectedAgents: [] });
      setShowTeamForm(false);
      await loadUserData();

    } catch (error) {
      console.error('Error creating team:', error);
      alert('Failed to create team: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAgentToTeamForm = (agentId: number) => {
    if (teamForm.selectedAgents.length >= 5) {
      alert('Maximum 5 agents allowed per team');
      return;
    }

    if (teamForm.selectedAgents.some(a => a.agentId === agentId)) {
      alert('Agent already selected');
      return;
    }

    setTeamForm(prev => ({
      ...prev,
      selectedAgents: [...prev.selectedAgents, { agentId, role: 'executor' }]
    }));
  };

  const handleRemoveAgentFromTeamForm = (agentId: number) => {
    setTeamForm(prev => ({
      ...prev,
      selectedAgents: prev.selectedAgents.filter(a => a.agentId !== agentId)
    }));
  };

  const handleUpdateAgentRole = (agentId: number, role: string) => {
    setTeamForm(prev => ({
      ...prev,
      selectedAgents: prev.selectedAgents.map(a => 
        a.agentId === agentId ? { ...a, role } : a
      )
    }));
  };

  // ===== 渲染方法 =====

  if (!wallet.connected) {
    return (
      <div className="solana-agent-manager">
        <div className="connect-wallet">
          <h2>Solana Agent Manager</h2>
          <p>Please connect your Solana wallet to manage agents and teams</p>
          <button onClick={() => wallet.connect()}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="solana-agent-manager">
      <div className="header">
        <h2>Solana Agent Manager</h2>
        <div className="wallet-info">
          <span>Connected: {wallet?.publicKey?.toBase58().slice(0, 8)}...</span>
          <span>Teams: {userTeamLimit.teamsCreated}/{userTeamLimit.teamLimit}</span>
        </div>
      </div>

      <div className="tabs">
        <button 
          className={activeTab === 'agents' ? 'active' : ''} 
          onClick={() => setActiveTab('agents')}
        >
          My Agents ({agents.length})
        </button>
        <button 
          className={activeTab === 'teams' ? 'active' : ''} 
          onClick={() => setActiveTab('teams')}
        >
          My Teams ({teams.length})
        </button>
      </div>

      {loading && <div className="loading">Loading...</div>}

      {activeTab === 'agents' && (
        <div className="agents-section">
          <div className="section-header">
            <h3>Your Agents</h3>
            <button onClick={() => setShowAgentForm(true)} disabled={loading}>
              Create New Agent
            </button>
          </div>

          <div className="agents-grid">
            {agents.map((agent) => (
              <div key={agent.id} className="agent-card">
                {agent.imageUrl && (
                  <img src={agent.imageUrl} alt={agent.name} className="agent-image" />
                )}
                <div className="agent-info">
                  <h4>{agent.name}</h4>
                  <p>{agent.description}</p>
                  <span className="agent-type">{agent.agentType}</span>
                  <div className="agent-actions">
                    <button 
                      onClick={() => handleToggleAgentPublic(agent.id)}
                      className={agent.isPublic ? 'public' : 'private'}
                    >
                      {agent.isPublic ? 'Public' : 'Private'}
                    </button>
                    <span className="agent-date">
                      Created: {new Date(agent.createdAt * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {agents.length === 0 && !loading && (
            <div className="empty-state">
              <p>No agents created yet. Create your first agent to get started!</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'teams' && (
        <div className="teams-section">
          <div className="section-header">
            <h3>Your Teams</h3>
            <button 
              onClick={() => setShowTeamForm(true)} 
              disabled={loading || agents.length < 2}
              title={agents.length < 2 ? 'Need at least 2 agents to create a team' : ''}
            >
              Create New Team
            </button>
          </div>

          <div className="teams-grid">
            {teams.map((team) => (
              <div key={team.id} className="team-card">
                <div className="team-info">
                  <h4>{team.name}</h4>
                  <p>{team.description}</p>
                  <div className="team-stats">
                    <span>Agents: {team.agentCount}/{team.maxAgents}</span>
                    <span className={team.isActive ? 'active' : 'inactive'}>
                      {team.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <span className="team-date">
                    Created: {new Date(team.createdAt * 1000).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {teams.length === 0 && !loading && (
            <div className="empty-state">
              <p>No teams created yet. Create your first team to get started!</p>
            </div>
          )}
        </div>
      )}

      {/* Agent创建表单 */}
      {showAgentForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Create New Agent</h3>
              <button onClick={() => setShowAgentForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Agent Name *</label>
                <input
                  type="text"
                  value={agentForm.name}
                  onChange={(e) => setAgentForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter agent name (max 32 characters)"
                  maxLength={32}
                />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={agentForm.description}
                  onChange={(e) => setAgentForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your agent (max 200 characters)"
                  maxLength={200}
                />
              </div>
              <div className="form-group">
                <label>Agent Type *</label>
                <select
                  value={agentForm.type}
                  onChange={(e) => setAgentForm(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option value="">Select agent type</option>
                  <option value="assistant">Assistant</option>
                  <option value="analyst">Analyst</option>
                  <option value="developer">Developer</option>
                  <option value="researcher">Researcher</option>
                  <option value="designer">Designer</option>
                </select>
              </div>
              <div className="form-group">
                <label>Agent Image (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAgentForm(prev => ({ 
                    ...prev, 
                    image: e.target.files?.[0] || null 
                  }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAgentForm(false)} disabled={loading}>
                Cancel
              </button>
              <button onClick={handleCreateAgent} disabled={loading}>
                {loading ? 'Creating...' : 'Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 团队创建表单 */}
      {showTeamForm && (
        <div className="modal-overlay">
          <div className="modal large">
            <div className="modal-header">
              <h3>Create New Team</h3>
              <button onClick={() => setShowTeamForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Team Name *</label>
                <input
                  type="text"
                  value={teamForm.name}
                  onChange={(e) => setTeamForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter team name (max 64 characters)"
                  maxLength={64}
                />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={teamForm.description}
                  onChange={(e) => setTeamForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your team (max 200 characters)"
                  maxLength={200}
                />
              </div>
              <div className="form-group">
                <label>Select Agents (2-5 required)</label>
                <div className="agent-selection">
                  {agents.map((agent) => (
                    <div key={agent.id} className="agent-select-item">
                      <div className="agent-info">
                        <span className="agent-name">{agent.name}</span>
                        <span className="agent-type">({agent.agentType})</span>
                      </div>
                      <div className="agent-actions">
                        {teamForm.selectedAgents.some(a => a.agentId === agent.id) ? (
                          <>
                            <select
                              value={teamForm.selectedAgents.find(a => a.agentId === agent.id)?.role || 'executor'}
                              onChange={(e) => handleUpdateAgentRole(agent.id, e.target.value)}
                            >
                              {TEAM_ROLES.map(role => (
                                <option key={role.value} value={role.value}>
                                  {role.label}
                                </option>
                              ))}
                            </select>
                            <button onClick={() => handleRemoveAgentFromTeamForm(agent.id)}>
                              Remove
                            </button>
                          </>
                        ) : (
                          <button onClick={() => handleAddAgentToTeamForm(agent.id)}>
                            Add to Team
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="selection-summary">
                  Selected: {teamForm.selectedAgents.length}/5 agents
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowTeamForm(false)} disabled={loading}>
                Cancel
              </button>
              <button onClick={handleCreateTeam} disabled={loading}>
                {loading ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
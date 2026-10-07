import React, { useState, useEffect, useContext } from 'react';
import { getAgents, createTeam, getTeams, updateTeam, getTeamById, getMarketplaceAgents, updateTeamAgentRoles, deleteTeam, getUserInfo, updataUserInfo } from '../services/api';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { TeamRegistry } from '../contracts/TeamRegistry';
import { USDTContract } from '../contracts/USDTContract';
import { SolanaAgentClient } from '../contracts/SolanaAgentClient';
import { SolanaTeamSlotPurchaseClient } from '../contracts/SolanaTeamSlotPurchaseClient';
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
  const { getCurrentAccount, getCurrentWalletType, networkId, web3: contextWeb3, getSolanaConnection } = useContext(MultiWalletContext);
  const account = getCurrentAccount();
  const web3Instance = contextWeb3;
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
    'vyper_developer',
    'project_manager'
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState('');

  useEffect(() => {
    console.log('TeamManagement useEffect triggered, account:', account, 'refresh:', refresh);
    if (account) {
      fetchUserAgents();
      fetchMarketplaceAgents();
      fetchTeams();
    } else {
      console.log('No account available, skipping data fetch');
    }
  }, [account, refresh]);

  useEffect(() => {
    if (account) {
      getTeamLimt()
    }
  }, [account, refresh]);

  const fetchUserAgents = async () => {
    if (!account) {
      console.log('No account available, cannot fetch user agents');
      return;
    }
    
    try {
      console.log('Fetching user agents for account:', account);
      const fetchedAgents = await getAgents(account);
      console.log('Fetched user agents:', fetchedAgents);
      
      if (Array.isArray(fetchedAgents)) {
        setUserAgents(fetchedAgents.map((agent: any) => ({ ...agent, isMarketplace: false })));
      } else {
        console.error('Unexpected response format for agents:', fetchedAgents);
        setUserAgents([]);
      }
    } catch (error) {
      console.error('Error fetching user agents:', error);
      setUserAgents([]);
    }
  };

  const getTeamLimt = async () => {
    try {
      const walletType = getCurrentWalletType();
      
      if (walletType === 'phantom') {
        // Solana链获取团队限制
        await getSolanaTeamLimit();
      } else {
        // EVM链获取团队限制
        const teamLimit = await getUserInfo();
        if (teamLimit && Array.isArray(teamLimit) && teamLimit.length > 0) {
          setTeamLimit(teamLimit[0].teammax || 1);
        } else {
          console.error('Invalid team limit response:', teamLimit);
          setTeamLimit(1);
        }
      }
    } catch (error) {
      console.error('Error fetching team limit:', error);
      setTeamLimit(1);
    }
  }

  const getSolanaTeamLimit = async () => {
    try {
      const solanaConnection = getSolanaConnection();
      if (!solanaConnection) {
        console.error('Solana connection not available');
        setTeamLimit(1);
        return;
      }

      // 获取Phantom钱包
      const phantomWallet = (window as any).phantom?.solana;
      if (!phantomWallet || !phantomWallet.isPhantom || !phantomWallet.publicKey) {
        console.error('Phantom wallet not connected');
        setTeamLimit(1);
        return;
      }

      // 创建钱包适配器
      const walletAdapter = {
        publicKey: phantomWallet.publicKey,
        connected: phantomWallet.isConnected,
        signTransaction: phantomWallet.signTransaction.bind(phantomWallet),
        signAllTransactions: phantomWallet.signAllTransactions.bind(phantomWallet),
        connecting: false,
        disconnecting: false,
        connect: async () => {},
        disconnect: async () => {},
        sendTransaction: async () => '',
        signIn: async () => ({ account: null, signedMessage: null, signature: null }),
        autoConnect: false,
        wallets: [],
        wallet: null,
        select: () => {},
        signMessage: phantomWallet.signMessage?.bind(phantomWallet),
      } as any;
      
      const slotPurchaseClient = new SolanaTeamSlotPurchaseClient(
        solanaConnection,
        walletAdapter
      );
      
      // 获取用户团队限制
      const userLimit = await slotPurchaseClient.getUserLimit();
      
      if (userLimit) {
        console.log('Solana user limit:', userLimit);
        setTeamLimit(userLimit.teamLimit || 1);
      } else {
        console.log('No Solana user limit found, using default');
        setTeamLimit(1);
      }
    } catch (error) {
      console.error('Error fetching Solana team limit:', error);
      setTeamLimit(1);
    }
  }

  const fetchMarketplaceAgents = async () => {
    try {
      console.log('Fetching marketplace agents...');
      const fetchedAgents = await getMarketplaceAgents();
      console.log('Fetched marketplace agents:', fetchedAgents);
      console.log('Current account:', account);
      
      if (Array.isArray(fetchedAgents)) {
        const filteredAgents = account 
          ? fetchedAgents.filter((agent: Agent) => agent.owner !== account)
          : fetchedAgents;
        console.log('Filtered marketplace agents:', filteredAgents);
        setMarketplaceAgents(filteredAgents);
      } else {
        console.error('Unexpected response format for marketplace agents:', fetchedAgents);
        setMarketplaceAgents([]);
      }
    } catch (error) {
      console.error('Error fetching marketplace agents:', error);
      setMarketplaceAgents([]);
    }
  };

  const fetchTeams = async () => {
    try {
      console.log('Fetching teams...');
      const fetchedTeams = await getTeams();
      console.log('Fetched teams:', fetchedTeams);
      
      if (Array.isArray(fetchedTeams)) {
        setTeams(fetchedTeams);
      } else {
        console.error('Unexpected response format for teams:', fetchedTeams);
        setTeams([]);
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
      setTeams([]);
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
    setisLoading(true);
    setIsCreating(true);
    setCreationStatus('Creating team...');

    try {
      // 确保用户已连接钱包
      if (!account) {
        alert('Please connect wallet first');
        return;
      }

      const walletType = getCurrentWalletType();
      const teamId = uuidv4();
      let tx: any;
      let teamData: any;
      let teamAgents: any;
      let chainId: any;

      if (walletType === 'phantom') {
        // 使用Solana团队注册
        console.log('🔗 使用Solana合约注册团队开始...');
        
        const solanaConnection = getSolanaConnection();
        if (!solanaConnection) {
          throw new Error('Solana connection not available');
        }

        // 获取当前连接的Solana钱包
        const phantomWallet = (window as any).phantom?.solana;
        if (!phantomWallet || !phantomWallet.isPhantom) {
          throw new Error('Phantom wallet not found');
        }

        // 创建符合WalletContextState接口的钱包对象
        const walletAdapter = {
          publicKey: phantomWallet.publicKey,
          connected: phantomWallet.isConnected,
          signTransaction: phantomWallet.signTransaction.bind(phantomWallet),
          signAllTransactions: phantomWallet.signAllTransactions.bind(phantomWallet),
          signMessage: phantomWallet.signMessage.bind(phantomWallet),
        };

        const solanaClient = new SolanaAgentClient(
          solanaConnection,
          walletAdapter as any,
          "DHU9UBVaZNtw77FabwS7JmCxrgnNPA6Zg18xBPfB3rZ" // Agent Registry程序ID
        );

        // 转换agents格式为Solana格式
        const agentRoles = newTeam.agents.map(agent => ({
          id: agent.id,
          role: agent.role || 'executor'
        }));

        teamAgents = newTeam.agents.map(agent => ({
          ...agent,
          role: agent.role || 'executor'
        }));
        
        // 根据Solana网络设置正确的chainId
        const connection = getSolanaConnection();
        if (connection) {
          // 通过RPC URL判断网络类型
          const rpcUrl = connection.rpcEndpoint;
          if (rpcUrl.includes('mainnet')) {
            chainId = 101; // Solana Mainnet
          } else if (rpcUrl.includes('testnet')) {
            chainId = 102; // Solana Testnet
          } else {
            chainId = 103; // Solana Devnet (默认)
          }
        } else {
          chainId = 103; // 默认为Devnet
        }
        
        console.log('🔗 Solana网络信息:', {
          rpcUrl: connection?.rpcEndpoint,
          chainId: chainId,
          network: chainId === 101 ? 'Mainnet' : chainId === 102 ? 'Testnet' : 'Devnet'
        });

        tx = await solanaClient.registerSolanaTeam(
          teamId,
          newTeam.name,
          newTeam.description,
          agentRoles,
          async (success: boolean, error?: any) => {
            console.log('🔔 Team registration confirmation received:', { success, error });
            if (success) {
              console.log('✅ Solana团队注册交易已确认，开始保存到数据库');
              setCreationStatus('区块链确认成功，正在保存团队信息...');
              try {
                // 交易确认成功后保存到数据库
                const teamData = {
                  ...newTeam,
                  transactionHash: tx,
                  agents: teamAgents,
                  teamId: teamId,
                  chainid: chainId
                };
                
                const createdTeam = await createTeam(teamData);
                console.log('✅ 团队保存到数据库成功:', createdTeam);
                
                // 更新团队中代理的角色
                try {
                  console.log('🔄 更新团队代理角色...');
                  await updateTeamAgentRoles(teamId, teamAgents.map(agent => ({
                    agentId: agent.id,
                    role: agent.role,
                    chainid: chainId
                  })));
                  console.log('✅ 团队代理角色更新成功');
                  
                  // 成功完成所有操作
                  setCreationStatus('团队创建成功！');
                  setNewTeam({ name: '', description: '', agents: [] });
                  setShowCreateForm(false);
                  setisLoading(false);
                  setIsCreating(false);
                  await fetchTeams();
                  console.log('✅ Solana团队创建完成，列表已刷新');
                  setTimeout(() => setCreationStatus(''), 3000); // 3秒后清除状态
                  
                } catch (roleError) {
                  console.error('❌ 更新团队代理角色失败:', roleError);
                  setCreationStatus('');
                  await deleteTeam(teamId);
                  setisLoading(false);
                  setIsCreating(false);
                  alert('Failed to update team agent roles: ' + roleError.message);
                }
                
              } catch (dbError) {
                console.error('❌ 保存团队到数据库失败:', dbError);
                setCreationStatus('');
                setisLoading(false);
                setIsCreating(false);
                alert('Team created on blockchain but failed to save to database: ' + dbError.message);
              }
            } else {
              console.error('❌ Solana团队注册交易失败:', error);
              setCreationStatus('');
              setisLoading(false);
              setIsCreating(false);
              alert('Solana team registration transaction failed: ' + (error?.message || 'Unknown error'));
            }
          }
        );

        console.log('✅ Solana合约注册交易已发送，交易哈希:', tx);
        setCreationStatus('Transaction sent, waiting for blockchain confirmation (may take a few minutes)...');
        
        // 对于Solana，直接返回，数据库操作在异步确认回调中处理
        return;

      } else {
        // 使用EVM团队注册
        console.log('🔗 使用EVM合约注册团队开始...');
        
        if (!web3Instance) {
          throw new Error('Web3 instance not available');
        }
        
        chainId = Number(await web3Instance.eth.getChainId());
        const teamRegistry = new TeamRegistry(web3Instance, chainId);
        const teamAgent = [] as any;
        teamAgents = newTeam.agents.map(agent => ({
          ...agent,
          role: agent.role || 'executor'
        }));
        
        newTeam.agents.map(agent => teamAgent.push([agent.id, agent.role || 'executor']));
        
        tx = await teamRegistry.registerTeam(
          newTeam.name,
          newTeam.description,
          teamAgent,
          account,
          teamId
        );

        teamData = {
          ...newTeam,
          transactionHash: tx.transactionHash || tx.hash,
          agents: teamAgents,
          teamId: teamId,
          chainid: chainId
        };

        console.log('✅ EVM合约注册成功，交易哈希:', tx.transactionHash || tx.hash);
        
        teamData = {
          ...newTeam,
          transactionHash: tx.transactionHash || tx.hash,
          agents: teamAgents,
          teamId: teamId,
          chainid: chainId
        };
        
        console.log('💾 准备保存团队到数据库:', teamData);
        
        const createdTeam = await createTeam(teamData);
        console.log('✅ 团队保存到数据库成功:', createdTeam);
    
        // 更新团队中代理的角色
        try {
          console.log('🔄 更新团队代理角色...');
          await updateTeamAgentRoles(teamId, teamAgents.map(agent => ({
            agentId: agent.id,
            role: agent.role,
            chainid: chainId
          })));
          console.log('✅ 团队代理角色更新成功');
        } catch (error) {
          console.error('❌ 更新团队代理角色失败:', error);
          await deleteTeam(teamId);
          setisLoading(false)
          setIsCreating(false);
          return
        }
    
        console.log('🔄 刷新团队列表...');
        setNewTeam({ name: '', description: '', agents: [] });
        setShowCreateForm(false);
        setisLoading(false)
        setIsCreating(false);
        await fetchTeams();
        console.log('✅ EVM团队创建完成，列表已刷新');
      }
    } catch (error) {
      console.error('Error creating team:', error);
      setCreationStatus('');
      setisLoading(false);
      setIsCreating(false);
      alert('Error creating team: ' + error.message);
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
    if (!account) {
      alert('Please connect wallet first');
      return;
    }
    setisLoading(true)
    try {
      const chainId = Number(await web3Instance.eth.getChainId());
      const teamRegistry = new TeamRegistry(web3Instance,chainId);
      const teamAgent = [] as any
      editingTeam.agents.map(agent => teamAgent.push([agent.id, agent.role|| 'executor']));
      const tx = await teamRegistry.updateTeam(
        editingTeam.name,
        editingTeam.description,
        editingTeam.teamid,
        teamAgent,
        account
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

  // 注意：新的Solana合约只支持USDC购买，SOL购买已被移除
  // EVM链仍支持原生代币购买，请使用buyTeamUsdt函数进行USDC购买

  const buyTeamUsdt = async () => {
    setisLoading(true)
    setShowbuyTeam(false)
    try {
      if (!account) {
        throw new Error('No wallet account found. Please connect your wallet.');
      }
      
      const walletType = getCurrentWalletType();
      
      if (walletType === 'phantom') {
        // Solana钱包逻辑
        console.log('🔗 Using Solana team slot purchase...');
        
        const solanaConnection = getSolanaConnection();
        if (!solanaConnection) {
          throw new Error('Solana connection not available');
        }
        
        // 获取Phantom钱包
        const phantomWallet = (window as any).phantom?.solana;
        if (!phantomWallet || !phantomWallet.isPhantom) {
          throw new Error('Phantom wallet not found');
        }
        
        // 创建钱包适配器
        const walletAdapter = {
          publicKey: phantomWallet.publicKey,
          connected: phantomWallet.isConnected,
          signTransaction: phantomWallet.signTransaction.bind(phantomWallet),
          signAllTransactions: phantomWallet.signAllTransactions.bind(phantomWallet),
          signMessage: phantomWallet.signMessage.bind(phantomWallet),
          // 添加其他必需的WalletContextState属性
          autoConnect: false,
          wallets: [],
          wallet: null,
          connecting: false,
          disconnecting: false,
          connect: async () => {},
          disconnect: async () => {},
          sendTransaction: async () => '',
          signIn: async () => ({ account: null, signedMessage: null, signature: null }),
        } as any;
        
        const slotPurchaseClient = new SolanaTeamSlotPurchaseClient(
          solanaConnection,
          walletAdapter
        );
        
        // 调用Solana的购买团队槽位方法（使用USDC）
        const tx = await slotPurchaseClient.buyTeamSlotUsdc((success: boolean, error?: any) => {
          if (success) {
            console.log('🎉 Transaction confirmed on blockchain!');
            // 交易确认后更新Solana数据
            getSolanaTeamLimit();
          } else {
            console.error('❌ Transaction failed:', error);
          }
        });
        
        console.log('✅ Solana team slot purchase transaction sent:', tx);
        // 立即显示成功消息，但数据在交易确认后更新
        alert('Purchase transaction sent! Team limit will update once confirmed.');
        // 先更新一次数据，防止用户等待太久
        setTimeout(() => {
          getSolanaTeamLimit();
        }, 3000); // 3秒后尝试获取数据
        setrefresh(!refresh);
        
      } else {
        // EVM钱包逻辑（原有代码）
        if (!web3Instance) {
          throw new Error('Web3 instance not available');
        }
        
        // Validate account address format
        if (!web3Instance.utils.isAddress(account)) {
          throw new Error('Invalid wallet address format.');
        }
        
        const chainId = Number(await web3Instance.eth.getChainId());
        const teamRegistry = new TeamRegistry(web3Instance, chainId);
        const usdtContract = new USDTContract(web3Instance, chainId);
        await usdtContract.Approve(account);
        const tx = await teamRegistry.buyTeamAmount_usdt(account);
        await updataUserInfo();
        alert('Purchase Success');
        setrefresh(!refresh);
      }
      
      setisLoading(false);
    } catch (error: any) {
      alert(`Error buying team slot: ${error.message || error}`);
      console.error('Error buying team slot:', error);
      setisLoading(false);
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
                <div className="title">Your Agents ({userAgents.length})</div>
                {userAgents.length === 0 ? (
                  <div className="no-agents">No agents found. Please create agents first.</div>
                ) : (
                  userAgents.map(agent => (
                    <AgentItem 
                      key={agent.id} 
                      agent={agent} 
                      isSelected={newTeam.agents.some(a => a.id === agent.id)}
                      onSelect={handleAgentSelection}
                      onRoleAssign={handleRoleAssignment}
                      teamRoles={teamRoles}
                      role={newTeam.agents.find(a => a.id === agent.id)?.role}
                    />
                  ))
                )}
              </div>
              <div className="marketplace-agents">
                <div className="title">Marketplace Agents ({marketplaceAgents.length})</div>
                {marketplaceAgents.length === 0 ? (
                  <div className="no-agents">No marketplace agents available.</div>
                ) : (
                  marketplaceAgents.map(agent => (
                    <AgentItem 
                      key={agent.id} 
                      agent={agent} 
                      isSelected={newTeam.agents.some(a => a.id === agent.id)}
                      onSelect={handleAgentSelection}
                      onRoleAssign={handleRoleAssignment}
                      teamRoles={teamRoles}
                      role={newTeam.agents.find(a => a.id === agent.id)?.role}
                    />
                  ))
                )}
              </div>
            </div>
            {creationStatus && (
              <div className="creation-status" style={{color: '#666', fontSize: '14px', marginBottom: '10px'}}>
                {creationStatus}
              </div>
            )}
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

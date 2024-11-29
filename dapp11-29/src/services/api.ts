import axios from 'axios';
import Web3 from 'web3';
import { 
  Connection, 
  Keypair, 
  SystemProgram,
  Transaction, 
  TransactionInstruction,
  PublicKey,
} from '@solana/web3.js';

const API_URL = process.env.NODE_ENV === 'production' ? 'https://aiservice.gameland.network/api' : 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_URL,
  // baseURL:'https://aiservice.gameland.network/api'
});

api.interceptors.request.use((config: any) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

export interface Agent {
  id: number;
  name: string;
  description: string;
  type: string;
  is_public: boolean;
  owner: string;
  imageUrl?: string;
  agentid: number;
  chainid: number;
  trainingData?: {
    ipfsHash: string;
    trained_at: string;
    userAddress: string;
  }[];
}

interface CompileContractInput {
  source: string;
}

interface CompileContractResult {
  success: boolean;
  contractName?: string;
  abi?: any[];
  bytecode?: string;
  error?: string;
  warnings?: string[];
}

export interface CreditInfo {
  creditBalance: number;
  lastUsedAt?: string;
  lastResetAt?: string;
}

export const sendMessage = async (message: string, chainid: number, agentId?: number, conversationId?: string) => {
  const response = await api.post('/chat', { message, agentId, conversationId, chainid });
  return response.data;
};

export const createMultiAgentTeam = async (teamName: string, agentIds: number[]) => {
  const response = await api.post('/agents/multi-agent-team', { teamName, agentIds });
  return response.data;
};

export const getMultiAgentTeams = async () => {
  const response = await api.get('/agents/multi-agent-teams');
  return response.data;
};

export const getConversationHistory = async (conversationId: string) => {
  const response = await api.get(`/chat/history/${conversationId}`);
  return response.data;
};

export const clearConversation = async () => {
  const response = await api.delete('/chat/history');
  return response.data;
};

export const getAgents = async (address: any) => {
  const response = await api.get(`/agents/where/${address}`);
  return response.data;
};

export const createAgent = async (agentData: any) => {
  const response = await api.post('/agents', agentData);
  return response.data;
};

export const finalizeAgentCreation = async (agentData: any) => {
  const response = await api.post('/agents/finalize', agentData);
  return response.data;
};

export const getMarketplaceAgents = async () => {
  const response = await api.get('/agents/marketplace');
  return response.data;
};

export const toggleAgentPublicity = async (agentId: number, chainid: number) => {
  const response = await api.put(`/agents/${agentId}/toggle-publicity`);
  return response.data;
};

export const getAgentDetails = async (agentId: number, chainId: number): Promise<Agent> => {
  const response = await api.get(`/agents/${agentId}`);
  return response.data;
};

export const getAgentResponse = async (agentId: number, message: string, context: any[] = [], instruction?: string) => {
  const response = await api.post(`/chat/agent/${agentId}/responses`, { message, context, instruction });
  return response.data;
};

export const updateAgent = async (agentId: number, agentData: Partial<Agent>) => {
  const response = await api.put(`/agents/${agentId}`, agentData);
  return response.data;
};

export const updateAgentHash = async (agentId: number, agentData: any) => {
  const response = await api.put(`/agents/${agentId}/updateHash`, agentData);
  return response.data;
};

export const deleteAgent = async (agentId: number) => {
  const response = await api.delete(`/agents/${agentId}`);
  return response.data;
};

export const trainAgent = async (agentId: number, trainingData: string, userAddress: string, trainingType: string, chainid: number) => {
  const response = await api.post(`/agents/${agentId}/train`, { trainingData, userAddress, trainingType, chainid });
  return response.data;
};

export const connectWallet = async (address: string, chainId: number, message: string, signature: string) => {
  const response = await api.post('/users/connect', { address, chainId, message, signature });
  localStorage.setItem('token', response.data.token);
  return response.data;
};

export const getAgentKnowledge = async (agentId: number, chainid: number) => {
  const response = await api.get(`/agents/${agentId}/knowledge`);
  return response.data;
};

export const createTeam = async (teamData: any) => {
  console.log('createTeam Data:',teamData)
  const response = await api.post('/teams', teamData);
  return response.data;
};

export const getTeams = async () => {
  const response = await api.get('/teams');
  return response.data;
};

export const getTeamById = async (teamId: string) => {
  const response = await api.get(`/teams/${teamId}`);
  return response.data;
};

export const updateTeam = async (teamId: string, teamData: any) => {
  const response = await api.put(`/teams/${teamId}`, teamData);
  return response.data;
};

export const deleteTeam = async (teamId: string) => {
  const response = await api.delete(`/teams/${teamId}`);
  return response.data;
};

export const sendTeamMessage = async (teamId: string, message: string, conversationId: string, chainid: number) => {
  const response = await api.post(`/chat/team/${teamId}`, { message, conversationId, chainid });
  return response.data;
};

export const continueWorkflow = async (workflowId: string) => {
  const response = await api.post('/chat/continue-workflow', { workflowId });
  return response.data;
};

export const communicateWithAgent = async (senderId: number, receiverId: number, message: string, conversationId: string) => {
  const response = await api.post('/agents/communicate', { senderId, receiverId, message, conversationId });
  return response.data;
};

export const updateAgentRoleAndGoal = async (agentId: number, role: string, goal: string) => {
  const response = await api.put(`/agents/${agentId}/role-goal`, { role, goal });
  return response.data;
};

export const decomposeTask = async (task: string) => {
  const response = await api.post('/chat/decompose-task', { task });
  return response.data;
};

export const processSpecificAgentMessage = async (agentId: number, message: string, workflowId: string | null) => {
  const response = await api.post('/chat/specific-agent', { agentId, message, workflowId });
  return response.data;
};

export const refineTaskDecomposition = async (conversationId: string, taskDecomposition: any) => {
  const response = await api.post(`/chat/refine-task-decomposition/${conversationId}`, { taskDecomposition });
  return response.data;
};

export const completeTaskDecomposition = async (conversationId: string) => {
  const response = await api.post(`/chat/complete-task-decomposition/${conversationId}`);
  return response.data;
};

export const getTaskDecomposition = async (conversationId: string) => {
  const response = await api.get(`/chat/task-decomposition/${conversationId}`);
  return response.data;
};

export const verifyAgent = async (agentId: number, prompt: string) => {
  const response = await api.post(`/agents/${agentId}/verify`, { prompt });
  return response.data;
};

export const updateTeamAgentRoles = async (teamId: string, agentRoles: { agentId: number; role: string, chainid: number }[]) => {
  const response = await api.put(`/teams/${teamId}/agent-roles`, { agentRoles });
  return response.data;
};

export const executeLangChainTeamTask = async (teamId: string, task: string) => {
  const response = await api.post(`/teams/${teamId}/execute-langchain-task`, { task });
  return response.data;
};

export const downloadFile = (filename: any) => {
  return api.get(`/download/${filename}`, {
    responseType: 'blob',
  });
};

export const getContractBytecode = async (contractId: string) => {
  try {
    const response = await api.get(`/contract/bytecode/${contractId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching contract bytecode:', error);
    throw error;
  }
};

export const compileContract = async (input: CompileContractInput): Promise<CompileContractResult> => {
  const response = await api.post('/compile', input);
  return response.data;
};

export const getContractABI = async (address: string) => {
  const response = await api.get(`/contract/${address}/abi`);
  return response.data;
};

export const getGasPrice = async (networkId: number) => {
  // 这里可以根据不同网络返回不同的 gas 价格策略
  const web3 = new Web3((window as any).ethereum);
  const gasPrice = await web3.eth.getGasPrice();
  return Web3.utils.toBN(gasPrice).mul(Web3.utils.toBN(120)).div(Web3.utils.toBN(100)).toString(); // 增加 20%
};

export const deployContract = async (
  abi: any[], 
  bytecode: string, 
  params: any[], 
  from: string,
  networkId: number,
  gasPrice: string
) => {
  if (!window.ethereum) {
    throw new Error('No web3 provider found');
  }

  const web3 = new Web3(window.ethereum);
  
  // 切换到正确的网络
  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: web3.utils.toHex(networkId) }]
  });
  const isZkEVM = networkId === 1101 || networkId === 2442;

  // 创建合约实例
  const contract = new web3.eth.Contract(abi);
  
  // 准备部署交易
  const deploy = contract.deploy({
    data: bytecode,
    arguments: params
  });
  const gaslimit =  isZkEVM? 1.2: 1.1
  // 估算 gas
  const gas = await deploy.estimateGas({ from });

  // 发送部署交易
  const deployedContract = await deploy.send({
    from,
    gas: Math.round(gas * gaslimit), // 添加 10% buffer
    gasPrice
  });

  return deployedContract.options.address;
};

export const compileSolanaProgram = async (data: any) => {
  try {
    const response = await api.post('/compile/solana',  data);
    return response.data;
  } catch (error) {
    console.error('Error compiling Solana program:', error);
    throw error;
  }
};

export const estimateSolanaFee = async (instructions: Uint8Array) => {
  try {
    const response = await api.post('/estimate/solana-fee', { instructions: Buffer.from(instructions).toString('hex') });
    return response.data.estimatedFee;
  } catch (error) {
    console.error('Error estimating Solana fee:', error);
    throw error;
  }
};

export const deploySolanaContract = async (
  contractData: {
    rustFiles: Array<{
      name: string;
      content: string;
    }>;
    type: 'solana'
  }
) => {
  try {
    // 获取钱包和连接
    const provider = window.solana;
    if (!provider) {
      throw new Error('No Solana wallet found');
    }

    // 创建 Solana 连接
    const connection = new Connection(
      process.env.REACT_APP_SOLANA_NETWORK || 'https://api.devnet.solana.com',
      'confirmed'
    );

    // 创建程序密钥对
    const programKeypair = Keypair.generate();
    const programId = programKeypair.publicKey;

    // 获取交易费用和区块哈希
    const { blockhash } = await connection.getRecentBlockhash();

    // 创建交易对象
    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: provider.publicKey 
    });

    // 计算程序所需空间
    const programSpace = contractData.rustFiles[0].content.length;

    // 计算程序部署所需的最小租金
    const rentExemptionAmount = await connection.getMinimumBalanceForRentExemption(programSpace);

    // 创建程序账户
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: provider.publicKey,
      newAccountPubkey: programId,
      lamports: rentExemptionAmount,
      space: programSpace,
      programId: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
    });

    // 创建写入程序数据的指令
    const deployDataInstruction = new TransactionInstruction({
      keys: [
        { pubkey: programId, isSigner: true, isWritable: true },
        { pubkey: provider.publicKey, isSigner: true, isWritable: false }
      ],
      programId: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
      data: Buffer.from(contractData.rustFiles[0].content)
    });

    // 添加指令到交易中
    transaction.add(createAccountInstruction);
    transaction.add(deployDataInstruction);

    // 请求用户签名
    const signed = await provider.signTransaction(transaction);
    
    // 发送并确认交易
    const signature = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(signature);

    return {
      programId: programId.toString(),
      signature
    };

  } catch (error) {
    console.error('Error deploying Solana contract:', error);
    throw error;
  }
};

export const getUserCredit = async (): Promise<CreditInfo> => {
  const response = await api.get('/credits');
  return response.data;
};

export const getUserInfo = async () => {
  const response = await api.get(`/usersInfo`)
  return response.data;
}

export const updataUserInfo = async () => {
  const response = await api.put(`/usersInfo/updata`)
  return response.data;
}
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Modal, Upload, message } from 'antd';
import axios from 'axios';
import { UploadOutlined } from '@ant-design/icons';
import { Web3Context } from '../contexts/Web3Context';
import { AgentRegistry } from '../contracts/AgentRegistry';
import { SolanaAgentClient } from '../contracts/SolanaAgentClient';
import Web3 from 'web3';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { v4 as uuidv4 } from 'uuid';
import {
  sendMessage,
  getConversationHistory,
  clearConversation,
  getAgents,
  createAgent,
  finalizeAgentCreation,
  getTeams,
  sendTeamMessage,
  getTeamById,
  getContractBytecode,
  api,
  updateAgentHash,
  deleteAgent,
  sendGameRequest,
  saveGameSourceMetadata,
  getMarketplaceAgents,
  createTeam
} from '../services/api';
import { MultiWalletContext } from '../contexts/MultiWalletContext';

// Debug configuration
const MCP_DEBUG = false;

// Network detection and URL generation utilities
const detectSolanaNetwork = (connection: Connection): string => {
  const endpoint = connection?.rpcEndpoint || '';
  if (endpoint.includes('mainnet') || endpoint.includes('mainnet-beta')) {
    return 'mainnet';
  } else if (endpoint.includes('testnet')) {
    return 'testnet';  
  } else if (endpoint.includes('devnet')) {
    return 'devnet';
  }
  return 'mainnet'; // Default to mainnet if detection fails
};

const generateExplorerUrl = (signature: string, network: string): string => {
  const baseUrl = 'https://explorer.solana.com/tx/';
  if (network === 'mainnet') {
    return `${baseUrl}${signature}`;
  } else {
    return `${baseUrl}${signature}?cluster=${network}`;
  }
};


export const ChatContext = createContext<any>(null);

const IPFS_API_URL = 'https://ipfs.infura.io:5001/api/v0';
const INFURA_PROJECT_ID = '002508d44ea34eb6924c20e90b84a302';
const INFURA_PROJECT_SECRET = '134e00a4bb354266899891aea32a6dee';

export interface Contract {
  name: string;
  source: string;
  type: 'solidity' | 'solana-anchor' | 'solana-cargo';
  abi: any[];
  bytecode: string;
  address?: string;
  dependencies?: string[];
  isDeployed: boolean;
  compilerVersion: string
}

export interface Message {
  sender: string;
  content: string;
  agent?: {
    id: number;
    name: string;
  };
  conversationId: string;
  files?: Array<{
    name: string;
    type: 'image' | 'file';
    data: string;
    size: number;
    language?: string;
    path?: string;
    content?: any;
  }>;
}

export interface Agent {
  id: number;
  name: string;
  description: string;
  type: string;
  is_public: boolean;
  owner: string;
  role?: string;
  goal?: string;
  transaction_hash: string;
  image_url?: string;
  created_at: string;
  chainid: number;
  trainingData?: {
    ipfsHash: string;
    trained_at: string;
    userAddress: string;
  }[];
}

export interface Team {
  id: number;
  name: string;
  description: string;
  teamid: string;
  agents: Agent[];
}

export interface TaskDecomposition {
  message: string;
  tasks: {
    description: string;
    assignedAgent: Agent | null;
    agentType: string;
    requiredSkills: string[];
    expectedOutput: string;
    meetsExpectations?: boolean;
  }[];
}

export interface GameCodeComponents {
  gameCode: string;
  contractCode?: string;
  contractABI?: any;
}

export interface GameContext {
  gameCode: string | null;
  gameState: {
    score: number;
    level: number; 
    status: 'ready' | 'playing' | 'paused' | 'ended';
    web3State: Web3GameState;
  } | null;
  gameSession: string | null;
  contractAddress: string | null;
  contractABI: any;
  contractCode: string | null;
}

export enum GameType {
  SIMPLE = 'simple',
  SCORE_BASED = 'score',
  NFT_BASED = 'nft',
  TOKEN_BASED = 'token',
  FULL_CHAIN = 'fullChain'
}

// Web3游戏状态接口
export interface Web3GameState {
  connected: boolean;
  account: string | null;
  balance: string;
  highScore: number;
  contractAddress: string | null; 
  rewards: number;
}

export interface GameCode {
  gameId?: string;
  originalCode: string;
  compiledCode: string | null;
  contractAddress?: string;
  contractABI?: any;
  gameType?: string;
  files: {
    name: string;
    content: string;
    type: 'game' | 'contract';
    language: string;
    abi?: any[];
  }[];
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const web3Instance = new Web3((window as any).ethereum);
  const { account, web3 } = useContext(Web3Context);
  const { 
    getCurrentAccount, 
    credits, 
    refreshCredits, 
    isAuthenticated, 
    connectMetaMask, 
    connectPhantom, 
    getCurrentWalletType,
    primaryWallet,
    getWeb3Instance,
    getSolanaConnection
  } = useContext(MultiWalletContext);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [newAgentData, setNewAgentData] = useState({ name: '', description: '', role:'', goal:'', type: '', imageUrl: '', skills:''});
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [marketplaceAgents, setMarketplaceAgents] = useState<Agent[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedSpecificAgent, setSelectedSpecificAgent] = useState<Agent | null>(null);
  const [conversationId, setConversationId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [taskDecomposition, setTaskDecomposition] = useState<TaskDecomposition | null>(null);
  const [deployModalVisible, setDeployModalVisible] = useState(false);
  const [contractData, setContractData] = useState<{ abi: any; bytecode: string } | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [deployedContracts, setDeployedContracts] = useState<Set<string>>(new Set());
  const [isGameMode, setIsGameMode] = useState(false);
  const [gameContext, setGameContext] = useState<GameContext>({
    gameCode: null,
    gameState: {
      score: 0,
      level: 1,
      status: 'ready',
      web3State: {
        connected: false,
        account: null,
        balance: '0',
        highScore: 0,
        contractAddress: null,
        rewards: 0
      }
    },
    gameSession: null,
    contractAddress: null,
    contractABI: null,
    contractCode: null
  });
  const [gameCode, setGameCode] = useState<GameCode | null>(null);
  const [gameContract, setGameContract] = useState<any>(null);

  const updateGameCode = (code: GameCode) => {
    // 替换钱包地址占位符
    const updatedFiles = code.files.map(file => ({
      ...file,
      content: file.content.replace(/{{WALLET_ADDRESS}}/g, getCurrentAccount() || '')
    }));

    setGameCode({
      ...code,
      files: updatedFiles
    });
  };

  const updateGameState = (newState: Partial<GameContext>) => {
    setGameContext(prev => ({
      ...prev,
      ...newState
    }));
  };

  const resetGameState = () => {
    setGameContext({
      gameCode: null,
      gameState: {
        score: 0,
        level: 1,
        status: 'ready',
        web3State: {
          connected: false,
          account: null,
          balance: '0',
          highScore: 0,
          contractAddress: null,
          rewards: 0
        }
      },
      gameSession: null,
      contractAddress: null,
      contractABI: null,
      contractCode: null
    });
  };

  const replaceContractAddress = (address: string) => {
    if (!gameCode) return;

    const updatedFiles = gameCode.files.map(file => ({
      ...file,
      content: file.content.replace(/{{CONTRACT_ADDRESS}}/g, address)
    }));

    setGameCode({
      ...gameCode,
      compiledCode: gameCode.originalCode.replace(/{{CONTRACT_ADDRESS}}/g, address),
      contractAddress: address,
      files: updatedFiles
    });
  };

  const updateContractInfo = (address: string, abi: any[], chainid: any) => {
    if (!gameCode) return;


    // 更新所有文件中的占位符
    const updatedFiles = gameCode.files.map(file => ({
      ...file,
      content: file.content
        .replace(/{{CONTRACT_ADDRESS}}/g, address)
        .replace(/{{CONTRACT_ABI}}/g, JSON.stringify(abi))
        .replace(/{{NETWORK_ID}}/g, chainid.toString())
    }));

    const updatedGameCode = {
      ...gameCode,
      contractAddress: address,
      contractABI: abi,
      files: updatedFiles
    };

    setGameCode(updatedGameCode);

    // 🔧 修复：区分EVM和Solana合约处理
    // 检查是否为Solana地址（Base58，不以0x开头）
    const isSolanaAddress = address && !address.startsWith('0x') && address.length >= 32;
    
    if (isSolanaAddress) {
      // Solana合约不需要创建web3合约实例
      // 可以在这里添加Solana程序实例化逻辑（如果需要）
    } else if (web3 && address && abi) {
      // 只为EVM合约创建web3合约实例
      const contract = new web3.eth.Contract(abi, address);
      setGameContract(contract);
    }
  };

  // 🔧 新增：处理MCP交易签名
  const handleMCPTransaction = async (transactionData: any, currentConversationId: string) => {
    MCP_DEBUG && console.log('[MCP Frontend] Handling transaction:', transactionData);
    
    try {
      if (primaryWallet === 'phantom') {
        // Solana交易处理 - 支持转账和交换
        // 🔧 修复: 优先使用 window.phantom?.solana (Phantom 官方推荐)
        const phantomProvider = (window as any).phantom?.solana || (window as any).solana;
        if (!phantomProvider || !phantomProvider.publicKey) {
          throw new Error('Phantom wallet not connected');
        }

        // 检查Phantom钱包的当前网络设置
        try {
          const phantomNetwork = await phantomProvider.request({
            method: 'solana_getCluster'
          });
          MCP_DEBUG && console.log('[MCP Frontend] Phantom wallet network:', phantomNetwork);
        } catch (error) {
          MCP_DEBUG && console.log('[MCP Frontend] Could not get Phantom network:', error);
        }

        // 动态获取与Phantom钱包网络匹配的连接
        let dynamicConnection = getSolanaConnection();
        
        // 如果没有连接或者连接的RPC不匹配钱包网络，创建新连接
        try {
          const cluster = await phantomProvider.request({ method: 'solana_getCluster' });
          MCP_DEBUG && console.log('[MCP Frontend] Current Phantom cluster:', cluster);
          
          let expectedRpcEndpoint;
          if (cluster === 'devnet') {
            expectedRpcEndpoint = 'https://api.devnet.solana.com';
          } else if (cluster === 'testnet') {
            expectedRpcEndpoint = 'https://api.testnet.solana.com';
          } else {
            expectedRpcEndpoint = 'https://api.mainnet-beta.solana.com';
          }
          
          // 检查当前连接是否匹配
          if (!dynamicConnection || !dynamicConnection.rpcEndpoint.includes(cluster)) {
            MCP_DEBUG && console.log('[MCP Frontend] Creating new connection for cluster:', cluster);
            const { Connection } = await import('@solana/web3.js');
            dynamicConnection = new Connection(expectedRpcEndpoint, 'confirmed');
          }
        } catch (error) {
          console.warn('[MCP Frontend] Failed to detect wallet network, using existing connection:', error);
        }

        const connection = dynamicConnection;
        MCP_DEBUG && console.log('[MCP Frontend] 🚀🚀🚀 TRANSACTION PROCESSING STARTED 🚀🚀🚀');
        MCP_DEBUG && console.log('[MCP Frontend] Connection:', connection);
        MCP_DEBUG && console.log('[MCP Frontend] Connection RPC endpoint:', connection?.rpcEndpoint);
        MCP_DEBUG && console.log('[MCP Frontend] Transaction data type:', transactionData?.type);
        
        if (!connection) {
          throw new Error('Solana connection not available');
        }

        let transaction;
        let successMessage;
        let mintKeypair = null; // Declare mint keypair variable for token deployments

        MCP_DEBUG && console.log('[MCP Frontend] Transaction type check:', transactionData.type);
        console.log('[MCP Frontend] Type equals deploy_token?', transactionData.type === 'deploy_token');
        
        if (transactionData.type === 'transfer') {
          // Process transfer transaction using backend's serialized transaction
          const { Transaction: SolanaTransaction } = await import('@solana/web3.js');
          
          console.log('[MCP Frontend] Processing transfer transaction...');
          console.log('[MCP Frontend] Using backend serialized transaction');
          
          // Deserialize the transaction from backend
          const transactionBuffer = Buffer.from(transactionData.serializedTransaction, 'base64');
          transaction = SolanaTransaction.from(transactionBuffer);
          
          console.log('[MCP Frontend] Transaction deserialized successfully');
          
          // Detect current network for explorer URL
          const currentNetwork = detectSolanaNetwork(connection);
          const explorerUrl = generateExplorerUrl('{signature}', currentNetwork);
          
          successMessage = `✅ Transfer successful!\n\n📝 Transaction: {signature}\n💰 Amount: ${transactionData.amount} SOL\n📬 To: ${transactionData.to}\n⛽ Fee: ${transactionData.estimatedFee || '~0.000005'} SOL\n\n🔍 View on Explorer: ${explorerUrl}`;
          
        } else if (transactionData.type === 'swap') {
          // 🔄 处理交换交易 - 新增
          const { VersionedTransaction } = await import('@solana/web3.js');
          
          console.log('[MCP Frontend] Processing swap transaction...');
          console.log('[MCP Frontend] Swap details:', {
            from: transactionData.fromToken,
            to: transactionData.toToken,
            inputAmount: transactionData.inputAmount,
            expectedOutput: transactionData.expectedOutput,
            priceImpact: transactionData.priceImpact
          });
          
          // 直接使用后端提供的序列化交易，避免前端RPC调用
          console.log('[MCP Frontend] Using backend serialized transaction directly');
          const transactionBuffer = Buffer.from(transactionData.serializedTransaction, 'base64');
          transaction = VersionedTransaction.deserialize(transactionBuffer);
          
          // Detect current network for explorer URL (reuse the same connection)
          const currentNetwork = detectSolanaNetwork(connection);
          const swapExplorerUrl = generateExplorerUrl('{signature}', currentNetwork);
          
          successMessage = `🔄 Swap successful!\n\n📝 Transaction: {signature}\n🔀 Swap: ${transactionData.inputAmount} ${transactionData.fromToken} → ~${transactionData.expectedOutput} ${transactionData.toToken}\n📊 Price Impact: ${transactionData.priceImpact.toFixed(3)}%\n⚡ Slippage: ${transactionData.slippage}%\n⛽ Fee: ~0.01 SOL\n\n🔍 View on Explorer: ${swapExplorerUrl}`;
        
        } else if (transactionData.type === 'deploy_token') {
          // 🪙 处理Token部署交易 - 新增
          console.log('[MCP Frontend] 🔥🔥🔥 DEPLOY TOKEN BRANCH EXECUTING 🔥🔥🔥');
          console.log('[MCP Frontend] Processing token deployment transaction...');
          console.log('[MCP Frontend] Full transaction data:', JSON.stringify(transactionData, null, 2));
          console.log('[MCP Frontend] Token details:', {
            name: transactionData.name,
            symbol: transactionData.symbol,
            decimals: transactionData.decimals,
            supply: transactionData.supply,
            mintAddress: transactionData.mintAddress,
            mintKeypair: transactionData.mintKeypair ? 'Present' : 'Missing',
            transactionData: transactionData.transactionData,
            instructions: transactionData.instructions
          });

          // Token部署需要创建实际的Solana交易
          const { Transaction: SolanaTransaction, Keypair, SystemProgram, PublicKey } = await import('@solana/web3.js');
          const { TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMintLen, createAssociatedTokenAccountInstruction, createMintToInstruction, getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
          
          // 获取实际的指令数组（在transactionData.instructions中）
          const actualInstructions = transactionData.transactionData && transactionData.transactionData.instructions;
          
          if (actualInstructions && Array.isArray(actualInstructions)) {
            console.log('[MCP Frontend] Found instructions array, building transaction from instructions');
            console.log('[MCP Frontend] Instructions count:', actualInstructions.length);
            console.log('[MCP Frontend] All instructions:', actualInstructions);
            
            // 使用后端提供的blockhash保持一致性
            const backendBlockhash = transactionData.transactionData.blockhash;
            console.log('[MCP Frontend] Using backend blockhash for consistency:', backendBlockhash);
            
            transaction = new SolanaTransaction({
              recentBlockhash: backendBlockhash,
              feePayer: phantomProvider.publicKey
            });
            
            // 获取mint地址用于ATA计算
            const mintAddress = transactionData.mintAddress ? new PublicKey(transactionData.mintAddress) : null;
            console.log('[MCP Frontend] Mint address for ATA calculation:', mintAddress?.toString());
            
            // 首先打印所有指令的概览
            console.log('[MCP Frontend] All instructions overview:');
            actualInstructions.forEach((inst, idx) => {
              console.log(`[MCP Frontend] Instruction ${idx}: programId = ${inst.programId}, keys count = ${inst.keys?.length || 0}`);
            });
            
            // 预先计算正确的ATA地址
            let correctATAAddress;
            if (mintAddress) {
              const { getAssociatedTokenAddress } = await import('@solana/spl-token');
              correctATAAddress = await getAssociatedTokenAddress(
                mintAddress,
                phantomProvider.publicKey
              );
              console.log('[MCP Frontend] Pre-calculated correct ATA address:', correctATAAddress.toString());
            }

            // 重建指令对象
            for (let i = 0; i < actualInstructions.length; i++) {
              const inst = actualInstructions[i];
              console.log(`[MCP Frontend] Processing instruction ${i}:`, inst);
              
              // 检查指令格式
              if (!inst.keys || !Array.isArray(inst.keys)) {
                console.error('[MCP Frontend] Invalid instruction format:', inst);
                continue;
              }
              
              // 检查是否是ATA指令
              const isATAInstruction = inst.programId === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
              console.log(`[MCP Frontend] Instruction ${i} - programId:`, inst.programId);
              console.log(`[MCP Frontend] Instruction ${i} - isATAInstruction:`, isATAInstruction);
              console.log(`[MCP Frontend] Instruction ${i} - mintAddress:`, mintAddress?.toString());
              console.log(`[MCP Frontend] Instruction ${i} - keys:`, inst.keys);
              
              if (isATAInstruction && mintAddress) {
                console.log('[MCP Frontend] Found ATA instruction, recalculating ATA address...');
                
                // 使用@solana/spl-token来计算正确的ATA地址
                try {
                  const { getAssociatedTokenAddress } = await import('@solana/spl-token');
                  const correctATAAddress = await getAssociatedTokenAddress(
                    mintAddress,
                    phantomProvider.publicKey
                  );
                  console.log('[MCP Frontend] Calculated correct ATA address:', correctATAAddress.toString());
                  
                  // 检查ATA账户是否已经存在
                  let ataAccountExists = false;
                  try {
                    const connection = getSolanaConnection();
                    if (!connection) {
                      throw new Error('Solana connection not available');
                    }
                    const ataAccountInfo = await connection.getAccountInfo(correctATAAddress);
                    ataAccountExists = ataAccountInfo !== null;
                    console.log('[MCP Frontend] ATA account exists:', ataAccountExists);
                    
                    if (ataAccountExists) {
                      console.log('[MCP Frontend] ATA账户已存在，跳过创建指令');
                      // 如果ATA账户已存在，跳过这个创建指令
                      return;
                    }
                  } catch (accountCheckError) {
                    console.warn('[MCP Frontend] Failed to check ATA account existence:', accountCheckError);
                    // 如果检查失败，继续执行原逻辑
                  }
                  
                  // 重建keys，替换ATA地址
                  const keys = inst.keys.map((key: any, keyIndex: number) => {
                    let pubkeyStr = key.pubkey;
                    console.log(`[MCP Frontend] Processing ATA key ${keyIndex}, original:`, pubkeyStr);
                    
                    // 对于ATA创建指令，key的顺序通常是：
                    // 0: ATA地址（要创建的账户）
                    // 1: 相关的token账户或其他地址
                    // 2: 钱包地址（owner）
                    // 3: mint地址
                    // 4: 系统程序
                    // 5: token程序
                    
                    if (keyIndex === 0) {
                      // 第一个key必须是钱包地址作为payer (EOA, isSigner: true)
                      pubkeyStr = phantomProvider.publicKey.toString();
                      console.log(`[MCP Frontend] Set wallet as payer for key ${keyIndex}:`, pubkeyStr);
                    } else if (keyIndex === 1) {
                      // 第二个key是ATA地址
                      pubkeyStr = correctATAAddress.toString();
                      console.log(`[MCP Frontend] Set ATA address for key ${keyIndex}:`, pubkeyStr);
                    } else if (keyIndex === 2) {
                      // 第三个key是owner，通常也是钱包地址
                      pubkeyStr = phantomProvider.publicKey.toString();
                      console.log(`[MCP Frontend] Set wallet as owner for key ${keyIndex}:`, pubkeyStr);
                    } else if (pubkeyStr === "11111111111111111111111111111111") {
                      // 替换占位符地址为钱包地址
                      if (keyIndex === 2 || keyIndex === 4) {
                        // key 2通常是owner，key 4是系统程序
                        if (keyIndex === 2) {
                          pubkeyStr = phantomProvider.publicKey.toString();
                          console.log(`[MCP Frontend] Replaced placeholder with wallet in key ${keyIndex}:`, pubkeyStr);
                        }
                        // key 4保持为系统程序
                      }
                    }
                    
                    // 智能判断签名者状态
                    const isATAAddress = pubkeyStr === correctATAAddress.toString();
                    const isWalletAddress = pubkeyStr === phantomProvider.publicKey.toString();
                    const isSystemProgram = pubkeyStr === "11111111111111111111111111111111";
                    const isTokenProgram = pubkeyStr === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                    const isATAProgram = pubkeyStr === "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
                    
                    let correctedIsSigner;
                    if (keyIndex === 0) {
                      // Key 0 (payer) 必须是signer
                      correctedIsSigner = true;
                    } else if (isATAAddress) {
                      // ATA地址永远不需要签名
                      correctedIsSigner = false;
                    } else if (isWalletAddress && keyIndex === 2) {
                      // Key 2 (owner) 如果是钱包地址不需要签名（在ATA创建中）
                      correctedIsSigner = false;
                    } else if (isSystemProgram || isTokenProgram || isATAProgram) {
                      // 系统程序不需要签名
                      correctedIsSigner = false;
                    } else {
                      // 其他地址保持原始状态
                      correctedIsSigner = key.isSigner;
                    }
                    
                    console.log(`[MCP Frontend] Final ATA key ${keyIndex}:`, pubkeyStr, 'isATA:', isATAAddress, 'isWallet:', isWalletAddress, 'isSigner:', correctedIsSigner);
                    return {
                      pubkey: new PublicKey(pubkeyStr),
                      isSigner: correctedIsSigner,
                      isWritable: key.isWritable
                    };
                  });
                  
                  const instruction = {
                    programId: new PublicKey(inst.programId),
                    keys,
                    data: Buffer.from(inst.data)
                  };
                  
                  transaction.add(instruction);
                } catch (ataError) {
                  console.error('[MCP Frontend] Error calculating ATA address:', ataError);
                  // Fallback to original logic
                  const keys = inst.keys.map((key: any) => {
                    let pubkeyStr = key.pubkey;
                    if (pubkeyStr === "11111111111111111111111111111111") {
                      pubkeyStr = phantomProvider.publicKey.toString();
                    }
                    return {
                      pubkey: new PublicKey(pubkeyStr),
                      isSigner: key.isSigner,
                      isWritable: key.isWritable
                    };
                  });
                  
                  const instruction = {
                    programId: new PublicKey(inst.programId),
                    keys,
                    data: Buffer.from(inst.data)
                  };
                  
                  transaction.add(instruction);
                }
              } else {
                // 普通指令处理
                console.log(`[MCP Frontend] Processing non-ATA instruction ${i}:`, inst);
                
                const keys = inst.keys.map((key: any, keyIndex: number) => {
                  let pubkeyStr = key.pubkey;
                  // 替换占位符地址为实际的用户钱包地址
                  if (pubkeyStr === "11111111111111111111111111111111") {
                    pubkeyStr = phantomProvider.publicKey.toString();
                    console.log('[MCP Frontend] Replaced placeholder address with wallet:', pubkeyStr);
                  }
                  
                  // 对于MintTo指令，需要确保目标账户是正确的ATA地址
                  if (i === 3 && keyIndex === 1 && correctATAAddress) {
                    // Instruction 3, Key 1 应该是目标ATA地址
                    if (pubkeyStr !== correctATAAddress.toString()) {
                      console.log(`[MCP Frontend] Replacing MintTo target with correct ATA: ${pubkeyStr} -> ${correctATAAddress.toString()}`);
                      pubkeyStr = correctATAAddress.toString();
                    } else {
                      console.log(`[MCP Frontend] MintTo target is already correct ATA: ${pubkeyStr}`);
                    }
                  }
                  
                  console.log(`[MCP Frontend] Instruction ${i} key ${keyIndex}:`, pubkeyStr, 'isSigner:', key.isSigner, 'isWritable:', key.isWritable);
                  
                  return {
                    pubkey: new PublicKey(pubkeyStr),
                    isSigner: key.isSigner,
                    isWritable: key.isWritable
                  };
                });
                
                // Special handling for InitializeMint instruction (Instruction 1)
                if (i === 1 && inst.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
                  console.log(`[MCP Frontend] Processing InitializeMint instruction - checking data for authority replacement`);
                  console.log(`[MCP Frontend] Original data length: ${inst.data.length}`);
                  console.log(`[MCP Frontend] Original data: [${inst.data.join(', ')}]`);
                  
                  // InitializeMint data format: [instruction_type(1), decimals(1), mintAuthority(32), freeze_authority_option(1), freezeAuthority(32)] = 67 bytes
                  // We need to replace the placeholder authorities in the data
                  let processedData = [...inst.data];
                  if (processedData.length >= 67) {
                    const walletBytes = phantomProvider.publicKey.toBytes();
                    
                    // Replace mintAuthority (bytes 2-33)
                    for (let j = 2; j <= 33; j++) {
                      processedData[j] = walletBytes[j - 2];
                    }
                    
                    // Replace freezeAuthority (bytes 35-66) - set to wallet as well
                    for (let j = 35; j <= 66; j++) {
                      processedData[j] = walletBytes[j - 35];
                    }
                    
                    console.log(`[MCP Frontend] Replaced authorities in InitializeMint data with wallet: ${phantomProvider.publicKey.toString()}`);
                    console.log(`[MCP Frontend] Processed data length: ${processedData.length}`);
                    console.log(`[MCP Frontend] Processed data: [${processedData.slice(0, 10).join(', ')}...${processedData.slice(-5).join(', ')}]`);
                  } else {
                    console.error(`[MCP Frontend] InitializeMint data too short: ${processedData.length} bytes, expected 67`);
                  }
                  
                  const instruction = {
                    programId: new PublicKey(inst.programId),
                    keys,
                    data: Buffer.from(processedData)
                  };
                  
                  transaction.add(instruction);
                } else {
                  // Normal instruction processing
                  const instruction = {
                    programId: new PublicKey(inst.programId),
                    keys,
                    data: Buffer.from(inst.data)
                  };
                  
                  transaction.add(instruction);
                }
              }
            }
            console.log('[MCP Frontend] Transaction built from instructions');
            
            // Pre-sign with mint keypair before Phantom (this is the only way that works)
            if (transactionData.mintKeypair) {
              console.log('[MCP Frontend] Pre-signing transaction with mint keypair');
              const { Keypair } = await import('@solana/web3.js');
              mintKeypair = Keypair.fromSecretKey(new Uint8Array(transactionData.mintKeypair));
              transaction.partialSign(mintKeypair);
              console.log('[MCP Frontend] Transaction pre-signed with mint keypair, Phantom will add wallet signature');
            }
            
          } else if (transactionData.mintKeypair) {
            console.log('[MCP Frontend] Building transaction from mintKeypair');
            // 使用mintKeypair创建token
            const { Keypair } = await import('@solana/web3.js');
            mintKeypair = Keypair.fromSecretKey(new Uint8Array(transactionData.mintKeypair));
            const { blockhash } = await connection.getLatestBlockhash();
            
            // 获取创建mint账户所需的最小租金
            const mintLen = getMintLen([]);
            const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
            
            transaction = new SolanaTransaction({
              recentBlockhash: blockhash,
              feePayer: phantomProvider.publicKey
            });
            
            // 1. 创建mint账户
            transaction.add(
              SystemProgram.createAccount({
                fromPubkey: phantomProvider.publicKey,
                newAccountPubkey: mintKeypair.publicKey,
                space: mintLen,
                lamports,
                programId: TOKEN_PROGRAM_ID
              })
            );
            
            // 2. 初始化mint
            transaction.add(
              createInitializeMintInstruction(
                mintKeypair.publicKey,
                transactionData.decimals || 9,
                phantomProvider.publicKey, // mint authority
                phantomProvider.publicKey, // freeze authority  
                TOKEN_PROGRAM_ID
              )
            );
            
            // 3. 创建关联代币账户
            const associatedTokenAccount = await getAssociatedTokenAddress(
              mintKeypair.publicKey,
              phantomProvider.publicKey
            );
            
            transaction.add(
              createAssociatedTokenAccountInstruction(
                phantomProvider.publicKey, // payer
                associatedTokenAccount, // associated token account
                phantomProvider.publicKey, // owner
                mintKeypair.publicKey // mint
              )
            );
            
            // 4. 铸造代币到关联账户
            const mintAmount = BigInt(transactionData.supply) * BigInt(10 ** (transactionData.decimals || 9));
            transaction.add(
              createMintToInstruction(
                mintKeypair.publicKey, // mint
                associatedTokenAccount, // destination
                phantomProvider.publicKey, // authority
                mintAmount,
                [],
                TOKEN_PROGRAM_ID
              )
            );
            
            // Pre-sign with mint keypair before Phantom
            transaction.partialSign(mintKeypair);
            
            console.log('[MCP Frontend] Token deployment transaction created with mint keypair');
            console.log('[MCP Frontend] Transaction pre-signed with mint keypair, Phantom will add wallet signature');
            
            // 🔧 调试：打印Instruction 2的详细账户信息
            if (transaction.instructions[2]) {
              const ix2 = transaction.instructions[2];
              console.log('[MCP Frontend] === Instruction 2 Debug Info ===');
              console.log('[MCP Frontend] Instruction 2 ProgramId:', ix2.programId.toBase58());
              console.log('[MCP Frontend] Instruction 2 Keys:');
              ix2.keys.forEach((k, i) => {
                console.log(`[MCP Frontend] Key ${i}: ${k.pubkey.toBase58()}, signer: ${k.isSigner}, writable: ${k.isWritable}`);
              });
              console.log('[MCP Frontend] Expected wallet address:', phantomProvider.publicKey.toBase58());
              console.log('[MCP Frontend] Expected mint address:', mintKeypair.publicKey.toBase58());
              console.log('[MCP Frontend] Expected ATA address:', associatedTokenAccount.toBase58());
              console.log('[MCP Frontend] === End Debug Info ===');
            }
            
          } else {
            console.error('[MCP Frontend] No valid transaction data found');
            console.error('[MCP Frontend] Available data:', {
              hasActualInstructions: !!actualInstructions,
              hasMintKeypair: !!transactionData.mintKeypair,
              hasTransactionData: !!transactionData.transactionData
            });
            throw new Error('Token deployment transaction data not properly formatted. Check console for details.');
          }

          // Detect current network for explorer URL
          const currentNetwork = detectSolanaNetwork(connection);
          const tokenExplorerUrl = generateExplorerUrl('{signature}', currentNetwork);
          
          successMessage = `🪙 Token deployment successful!\n\n📝 Transaction: {signature}\n🏷️ Token: ${transactionData.name} (${transactionData.symbol})\n🔢 Decimals: ${transactionData.decimals}\n💰 Total Supply: ${transactionData.supply.toLocaleString()}\n🏠 Mint Address: ${transactionData.mintAddress}\n⛽ Fee: ${transactionData.estimatedFee} SOL\n\n🔍 View on Explorer: ${tokenExplorerUrl}`;
        
        } else {
          throw new Error(`Unsupported transaction type: ${transactionData.type || 'unknown'}`);
        }
        
        // 🔧 使用Phantom的signAndSendTransaction方法
        console.log(`[MCP Frontend] Executing ${transactionData.type} transaction...`);
        console.log('[MCP Frontend] Transaction object:', transaction);
        console.log('[MCP Frontend] Transaction type:', typeof transaction);
        console.log('[MCP Frontend] Transaction is undefined?', transaction === undefined);
        console.log('[MCP Frontend] Transaction is null?', transaction === null);
        
        if (!transaction) {
          throw new Error('Transaction object is null or undefined');
        }
        
        let signedTransaction;
        let signature;
        
        try {
          if (mintKeypair && transactionData.type === 'deploy_token') {
            // For token deployment with mint keypair, we need to sign with both wallet and mint keypair
            console.log('[MCP Frontend] Token deployment requires additional mint keypair signing...');
            
            // First, partially sign with mint keypair
            transaction.partialSign(mintKeypair);
            console.log('[MCP Frontend] Transaction partially signed with mint keypair');
            
            // Then use Phantom to sign and send
            const result = await phantomProvider.signAndSendTransaction(transaction);
            signature = result.signature || result;
            console.log('[MCP Frontend] Token deployment transaction sent successfully:', signature);
          } else {
            // For regular transactions, use signAndSendTransaction directly
            console.log('[MCP Frontend] Using Phantom signAndSendTransaction...');
            const result = await phantomProvider.signAndSendTransaction(transaction);
            signature = result.signature || result;
            console.log('[MCP Frontend] Transaction sent successfully by wallet, signature:', signature);
          }
          
        } catch (signError: any) {
          console.error('[MCP Frontend] Transaction signing/sending failed with error:', signError);
          console.error('[MCP Frontend] Error type:', typeof signError);
          console.error('[MCP Frontend] Error constructor:', signError?.constructor?.name);
          console.error('[MCP Frontend] Error message:', signError?.message);
          console.error('[MCP Frontend] Error code:', signError?.code);
          console.error('[MCP Frontend] Error stack:', signError?.stack);
          console.error('[MCP Frontend] Full error object:', JSON.stringify(signError, null, 2));
          
          // Re-throw with more details
          throw new Error(`Phantom wallet signing failed: ${signError?.message || signError?.toString() || 'Unknown error'}`);
        }
        
        console.log(`[MCP Frontend] ${transactionData.type} transaction successful:`, signature);
        
        // 额外确认交易状态
        try {
          const confirmation = await connection.getSignatureStatus(signature);
          console.log('[MCP Frontend] Transaction confirmation:', confirmation);
        } catch (confirmError) {
          console.warn('[MCP Frontend] Could not get confirmation status, but transaction was sent:', confirmError);
        }
        
        // 显示成功消息，将{signature}替换为实际签名
        const finalMessage: Message = {
          sender: 'system',
          content: successMessage.replace(/{signature}/g, signature),
          conversationId: currentConversationId
        };
        setMessages(prevMessages => [...prevMessages, finalMessage]);
        
      } else if (primaryWallet === 'metamask') {
        // EVM/LI.FI交易处理
        console.log('[MCP Frontend] Processing EVM/LI.FI transaction:', transactionData);
        
        const ethereum = (window as any).ethereum;
        if (!ethereum) {
          throw new Error('MetaMask not installed or not accessible');
        }
        
        // 确保连接到正确的网络
        const currentChainId = await ethereum.request({ method: 'eth_chainId' });
        const expectedChainId = '0x' + transactionData.chainId.toString(16);
        
        if (currentChainId !== expectedChainId) {
          console.log(`[MCP Frontend] Switching network from ${currentChainId} to ${expectedChainId}`);
          try {
            await ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: expectedChainId }],
            });
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              throw new Error(`Network ${transactionData.chainId} not added to MetaMask. Please add it manually.`);
            }
            throw switchError;
          }
        }
        
        // 构建交易对象
        const txParams = {
          from: transactionData.from,
          to: transactionData.to,
          value: transactionData.value || '0x0',
          data: transactionData.data || '0x',
          gas: transactionData.gasLimit,
          gasPrice: transactionData.gasPrice
        };
        
        console.log('[MCP Frontend] Sending transaction:', txParams);
        
        // 发送交易
        const txHash = await ethereum.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });
        
        console.log('[MCP Frontend] Transaction sent successfully:', txHash);
        
        // 生成成功消息
        let successMessage = '';
        const explorerUrls = {
          1: 'https://etherscan.io/tx/',
          137: 'https://polygonscan.com/tx/',
          42161: 'https://arbiscan.io/tx/',
          56: 'https://bscscan.com/tx/',
          43114: 'https://snowtrace.io/tx/',
          8453: 'https://basescan.org/tx/',
          10: 'https://optimistic.etherscan.io/tx/'
        };
        
        const explorerUrl = explorerUrls[transactionData.chainId] || `https://etherscan.io/tx/`;
        
        if (transactionData.type === 'lifi_transfer') {
          successMessage = `💸 Transfer successful!\n\n📝 Transaction: ${txHash}\n${transactionData.data?.summary || ''}\n⛽ Gas: ${transactionData.data?.estimatedGas || 'Unknown'}\n🔍 View on Explorer: ${explorerUrl}${txHash}`;
        } else if (transactionData.type === 'lifi_swap') {
          successMessage = `🔄 Swap successful!\n\n📝 Transaction: ${txHash}\n${transactionData.data?.summary || ''}\n📊 Exchange Rate: 1:${transactionData.data?.exchangeRate || 'Unknown'}\n⛽ Gas: ${transactionData.data?.estimatedGas || 'Unknown'}\n${transactionData.data?.priceImpactLevel?.warning ? `⚠️ ${transactionData.data.priceImpactLevel.warning}` : ''}\n🔍 View on Explorer: ${explorerUrl}${txHash}`;
        } else if (transactionData.type === 'lifi_bridge') {
          successMessage = `🌉 Bridge successful!\n\n📝 Transaction: ${txHash}\n${transactionData.data?.summary || ''}\n💰 Bridge Fees: ${transactionData.data?.bridgeFees || 'Unknown'}\n⏱️ Est. Duration: ${transactionData.data?.executionDuration || '5-30'} minutes\n⛽ Gas: ${transactionData.data?.estimatedGas || 'Unknown'}\n${transactionData.data?.warning ? `⚠️ ${transactionData.data.warning}` : ''}\n🔍 View on Explorer: ${explorerUrl}${txHash}`;
        } else {
          successMessage = `✅ Transaction successful!\n\n📝 Transaction: ${txHash}\n🔍 View on Explorer: ${explorerUrl}${txHash}`;
        }
        
        // 显示成功消息
        const finalMessage: Message = {
          sender: 'system',
          content: successMessage,
          conversationId: currentConversationId
        };
        
        setMessages(prevMessages => [...prevMessages, finalMessage]);
      } else {
        throw new Error('No supported wallet connected for transaction signing');
      }
      
    } catch (error: any) {
      console.error('[MCP Frontend] Transaction error:', error);
      
      // 更详细的错误信息
      let errorMessage = 'Transaction failed: ';
      if (error.code === 4001) {
        errorMessage += 'User rejected the transaction';
      } else if (error.code === -32003) {
        errorMessage += 'Transaction rejected by wallet';
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Unknown error occurred';
      }
      
      // 显示错误消息
      const errorMsg: Message = {
        sender: 'system',
        content: `❌ ${errorMessage}`,
        conversationId: currentConversationId
      };
      setMessages(prevMessages => [...prevMessages, errorMsg]);
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const initializeWeb3Game = async () => {
    if (!web3 || !gameCode?.contractAddress || !gameCode?.contractABI) return;

    try {
      const contract = new web3.eth.Contract(
        gameCode.contractABI,
        gameCode.contractAddress
      );
      setGameContract(contract);
    } catch (error) {
      console.error('Failed to initialize game contract:', error);
    }
  };

  useEffect(() => {
    const currentAccount = getCurrentAccount();
    if (currentAccount && gameCode) {
      initializeWeb3Game();
    }
  }, [getCurrentAccount(), gameCode?.contractAddress]);

  useEffect(() => {
    const urlConversationId = searchParams.get('conversationId');
    if (urlConversationId) {
      setConversationId(urlConversationId);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      const currentAccount = getCurrentAccount();
      const token = localStorage.getItem('token');
      if (!currentAccount || !isAuthenticated || !token) {
        return;
      }

        await Promise.all([
          fetchAgents(),
          fetchTeams()
        ]);

        const searchParams = new URLSearchParams(location.search);
        const teamId = searchParams.get('teamId');
        const cId = searchParams.get('conversationId');

        if (cId) {
          setConversationId(cId);
        } else if (teamId) {
          await fetchTeamById(teamId);
          const teamConversationId = getTeamConversationId(currentAccount, teamId);
          setConversationId(teamConversationId);
          setMessages([]);
      }
    };

    fetchData();
  }, [getCurrentAccount(), location.search]);

  useEffect(()=> {
    if (newAgentData.type) {
      addIPFS()
    }
  }, [newAgentData])

  const toggleGameMode = () => {
    setIsGameMode(!isGameMode);
    if (!isGameMode) {
      message.success('Game Mode on! Let the fun (and coding) begin!');
    } else {
      // resetGameState();
      message.success('Game Mode off! See you next time for more fun (and coding)!');
    }
  };

  const setDeployedContract = (contractName: string) => {
    if (!isGameMode) {
      setDeployedContracts(prev => new Set([...prev, contractName]));
    }
  };

  const fetchAgents = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!isAuthenticated || !token) {
        return;
      }
      // 优先使用MultiWalletContext的账户，如果没有则使用Web3Context的账户
      const currentAccount = getCurrentAccount() || account;
      if (!currentAccount) {
        return;
      }
      
      const fetchedAgents = await getAgents(currentAccount);
      setAgents(fetchedAgents);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchConversationHistory = async (cId: string) => {
    try {
      const history = await getConversationHistory(cId);
      setMessages(history.map((item: any) => ({
        sender: item.role,
        content: item.content,
        agent: item.agent_id ? agents.find(agent => agent.id === item.agent_id) : undefined,
        conversationId: item.conversation_id
      })));
    } catch (error) {
      console.error('Error fetching conversation history:', error);
    }
  };

  const fetchTeams = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!isAuthenticated || !token) {
        return;
      }
      const fetchedTeams = await getTeams();
      setTeams(fetchedTeams);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const fetchTeamById = async (teamId: string) => {
    try {
      const team = await getTeamById(teamId);
      if (team) {
        setSelectedTeam(team);
      }
    } catch (error) {
      console.error('Error fetching team:', error);
    }
  };

  const handleAgentSelection = (agent: Agent) => {
    if (selectedAgent?.id === agent.id) {
      setSelectedAgent(null);
    } else {
      setSelectedAgent(agent);
      setSelectedTeam(null);
      setSelectedSpecificAgent(null);
    }
  };

  // 🔧 生成团队固定conversationId的函数
  const getTeamConversationId = (userId: string, teamId: string) => {
    // 🔧 CRITICAL FIX: 统一使用小写地址格式，确保与后端userId一致
    return `team_${userId.toLowerCase()}_${teamId}`;
  };

  const handleTeamSelection = async (team: Team) => {
    setSelectedAgent(null);
    setMessages([]); // 🔧 立即清空当前消息
    
    // 🔧 获取完整的团队信息（包含agents）
    const fullTeam = await getTeamById(team.teamid);
    setSelectedTeam(fullTeam);
    
    // 🔧 生成固定的conversationId
    const teamConversationId = getTeamConversationId(getCurrentAccount(), team.teamid);
    setConversationId(teamConversationId);
    
    // 🔧 DISABLED: 屏蔽团队历史消息加载，保持界面清洁
    // 后端上下文处理仍然正常工作，AI可以获取完整历史进行理解
    
    // 🔧 导航到团队对话页面（放在最后，避免触发useEffect自动加载）
    navigate(`/chat?teamId=${team.teamid}&conversationId=${teamConversationId}`);
  };

  const handleSendMessage = async (files?: Array<{name: string, type: 'image' | 'file', data: string, size: number}>) => {
    if ((!input.trim() && (!files || files.length === 0)) || isLoading) return;
    setIsLoading(true);
    
    // 🔧 关键修复：为团队对话使用固定conversationId，个人对话才生成新的
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      if (selectedTeam) {
        const currentAccount = getCurrentAccount();
        if (currentAccount) {
          currentConversationId = getTeamConversationId(currentAccount, selectedTeam.teamid);
        } else {
          currentConversationId = uuidv4();
        }
      } else {
        currentConversationId = uuidv4();
      }
    setConversationId(currentConversationId);
    }
    // 确保获取最新的chainId，特别是对于MetaMask
    let chainId;
    if (primaryWallet === 'metamask' && window.ethereum) {
      try {
        // 使用 net_version 获取网络ID，与 MultiWalletContext 保持一致
        const networkIdRaw = await window.ethereum.request({ method: 'net_version' });
        chainId = parseInt(networkIdRaw, 10);
        // console.log('[MCP Frontend] Got chainId from MetaMask:', chainId);
      } catch (error) {
        console.error('[MCP Frontend] Failed to get chainId from MetaMask:', error);
        // 回退到web3Instance
        const chainIdRaw = await web3Instance.eth.getChainId();
        chainId = Number(chainIdRaw);
      }
    } else {
      const chainIdRaw = await web3Instance.eth.getChainId();
      chainId = Number(chainIdRaw);
    }
    const mentionRegex = /@(\w+)/;
    const mentionMatch = input.match(mentionRegex);
  
    if (mentionMatch) {
      const mentionedAgentName = mentionMatch[1];
      if (selectedTeam) {
        const mentionedAgent = selectedTeam.agents.find(a => 
          a.name.toLowerCase() === mentionedAgentName.toLowerCase()
        );
        if (mentionedAgent) {
          setSelectedAgent(mentionedAgent);
          if (selectedTeam) {
            setSelectedTeam(null)
          }
          
          const userMessage: Message = {
            sender: 'user',
            content: input,
            conversationId: currentConversationId
          };
          setMessages(prevMessages => [...prevMessages, userMessage]);
          setInput('');
          setIsLoading(false)
          return
        }
      } else {
        const mentionedAgent = [...agents,...marketplaceAgents].find(a => 
          a.name.toLowerCase() === mentionedAgentName.toLowerCase()
        );
        if (mentionedAgent) {
          setSelectedAgent(mentionedAgent);
          if (selectedTeam) {
            setSelectedTeam(null)
          }
          
          const userMessage: Message = {
            sender: 'user',
            content: input,
            conversationId: currentConversationId
          };
          setMessages(prevMessages => [...prevMessages, userMessage]);
          setInput('');
          setIsLoading(false)
          return
        }
      }
      const mentionedTeam = teams.find(a => a.name.toLowerCase() === mentionedAgentName.toLowerCase());
      if (mentionedTeam) {
        setSelectedTeam(mentionedTeam)
        navigate(`/chat?teamId=${mentionedTeam.teamid}`, { replace: true });
        if (selectedAgent) {
          setSelectedAgent(null)
        }
        const userMessage: Message = {
          sender: 'user',
          content: input,
          conversationId: currentConversationId
        };
        setMessages(prevMessages => [...prevMessages, userMessage]);
        setInput('');
        setIsLoading(false)
        return
      }
    }

    const userMessage: Message = {
      sender: 'user',
      content: input,
      conversationId: currentConversationId,
      files: files  // 📎 新增：添加文件信息
    };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInput('');

    if (input.toLowerCase().includes('create agent')) {
      setIsCreatingAgent(true);
      setIsLoading(false);
      setNewAgentData({ name: '', description: '', role:'', goal:'', type: '', imageUrl: '', skills:''})
      const createMessage: Message = {
        sender: 'system',
        content: "Great! Let's create a new agent. What would you like to name your agent?",
        conversationId: currentConversationId
      };
      setMessages(prevMessages => [...prevMessages, createMessage]);
    } else if (isCreatingAgent) {
      await handleAgentCreationStep(input);
    } else {
      try {
        let response: any;
        
        // 🔧 关键修复：检测区块链操作的函数
        const isBlockchainOperation = (message: string): boolean => {
          const lowerMessage = message.toLowerCase();
          
          // 检测区块链操作关键词
          const blockchainKeywords = [
            // 交易相关
            'transfer', 'send', 'swap', 'exchange', 'bridge', 'stake', 'unstake',
            'mint', 'burn', 'approve', 'deposit', 'withdraw',
            // 中文关键词
            '转账', '发送', '兑换', '跨链', '质押', '铸造', '销毁',
            // 查询相关
            'balance', 'price', 'check', '余额', '价格', '查询',
          ];
          
          // 检测是否包含区块链关键词
          const hasBlockchainKeyword = blockchainKeywords.some(keyword => 
            lowerMessage.includes(keyword)
          );
          
          // 检测是否包含加密货币符号
          const cryptoTokens = ['eth', 'btc', 'sol', 'matic', 'usdt', 'usdc', 'bnb', 'avax', 'link', 'uni', 'arb'];
          const hasCryptoToken = cryptoTokens.some(token => lowerMessage.includes(token));
          
          // 检测是否包含区块链地址格式
          const hasEthAddress = /0x[a-fA-F0-9]{40}/.test(message); // 以太坊地址
          const hasSolanaAddress = /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(message) && !hasEthAddress; // Solana地址（排除以太坊地址）
          
          return hasBlockchainKeyword || hasCryptoToken || hasEthAddress || hasSolanaAddress;
        };

        // 🔧 检测当前消息是否为区块链操作
        const isBlockchainOp = isBlockchainOperation(input);
        
        if (selectedTeam) {
          if (isGameMode && !isBlockchainOp) {
            // 🔧 只有在游戏模式且不是区块链操作时，才走游戏请求路由
            console.log('[Frontend] Routing to game service - Game Mode ON, Non-blockchain operation');
            response = await sendGameRequest(input, selectedTeam.teamid, currentConversationId, files);
          } else {
            // 🔧 区块链操作或非游戏模式，使用团队消息路由
            console.log('[Frontend] Routing to team service - Blockchain operation detected or Game Mode OFF');
            response = await sendTeamMessage(selectedTeam.teamid, input, currentConversationId, chainId, files);
          }
        } else if (selectedAgent) {
          // 检测钱包网络状态（支持多种钱包）
          let walletInfo = null;
          if (primaryWallet === 'phantom') {
            const connection = getSolanaConnection();
            let network = 'mainnet'; // 默认值
            if (connection && connection.rpcEndpoint) {
              if (connection.rpcEndpoint.includes('devnet')) {
                network = 'devnet';
              } else if (connection.rpcEndpoint.includes('testnet')) {
                network = 'testnet';
              }
            }
            walletInfo = {
              type: 'phantom',
              network: network,
              address: getCurrentAccount()
            };
          } else if (primaryWallet === 'metamask') {
            walletInfo = {
              type: 'metamask', 
              chainId: chainId,
              address: getCurrentAccount()
            };
          }
          // console.log('[MCP Frontend] Detected wallet info:', walletInfo);

          response = await sendMessage(input, chainId, selectedAgent.id, currentConversationId, walletInfo, files);
          // console.log('[MCP Frontend Debug] Response from sendMessage:', response);
        } else {
          // 检测钱包网络状态（支持多种钱包）
          let walletInfo = null;
          if (primaryWallet === 'phantom') {
            const connection = getSolanaConnection();
            let network = 'mainnet'; // 默认值
            if (connection && connection.rpcEndpoint) {
              if (connection.rpcEndpoint.includes('devnet')) {
                network = 'devnet';
              } else if (connection.rpcEndpoint.includes('testnet')) {
                network = 'testnet';
              }
            }
            walletInfo = {
              type: 'phantom',
              network: network,
              address: getCurrentAccount()
            };
          } else if (primaryWallet === 'metamask') {
            walletInfo = {
              type: 'metamask',
              chainId: chainId,
              address: getCurrentAccount()
            };
          }
          console.log('[MCP Frontend] Detected wallet info:', walletInfo);

          response = await sendMessage(input, chainId, undefined, currentConversationId, walletInfo, files);
          console.log('[MCP Frontend Debug] Response from sendMessage (no agent):', response);
        }     

        // 🔧 新增：处理MCP交易响应
        if (response && response.data && response.data.requiresSignature) {
          console.log('[MCP Frontend] Detected transaction requiring signature:', response.data);
          
          try {
            // 获取交易数据 - 注意服务器可能在不同层级返回数据
            const transactionData = response.data.transaction || response.data.data;
            
            // 从response.data.data中获取instructions（根据服务器日志）
            if (transactionData && response.data.data && response.data.data.instructions) {
              // 将instructions添加到transactionData对象中
              transactionData.instructions = response.data.data.instructions;
              console.log('[MCP Frontend] Added instructions from response.data.data');
            }
            
            // 修复：检查交易数据存在，而不仅仅是serializedTransaction
            if (transactionData && (transactionData.serializedTransaction || transactionData.type)) {
              await handleMCPTransaction(transactionData, currentConversationId);
              return; // 交易处理完成后直接返回
            } else {
              console.log('[MCP Frontend] No valid transaction data found in response');
              console.log('[MCP Frontend] Response structure:', {
                hasResponseData: !!response.data,
                hasTransaction: !!response.data?.transaction,
                hasDataData: !!response.data?.data,
                hasInstructions: !!response.data?.data?.instructions
              });
            }
          } catch (error) {
            console.error('[MCP Frontend] Error handling transaction:', error);
            const errorMessage: Message = {
              sender: 'system',
              content: `Transaction failed: ${error.message}`,
              conversationId: currentConversationId
            };
            setMessages(prevMessages => [...prevMessages, errorMessage]);
            setIsLoading(false);
            return;
          }
        }

        // keep response handling as-is
        // console.log('[MCP Frontend Debug] Response type:', response?.type);
        // console.log('[MCP Frontend Debug] Response has files:', !!response?.files);

        if (response.content && typeof response.content === 'string' && response.content.includes('THREE.')) {
          const threeJSCode = response.content.replace(/```js\n|```/g, '');
          const aiMessage: Message = {
            sender: response.type === 'game' ? 'game' : 'agent',
            content: '```js\n' + threeJSCode + '\n```',
            agent: response.agent,
            conversationId: currentConversationId
          };
          setMessages(prevMessages => [...prevMessages, aiMessage]);
        } else {
          if (response.taskDecomposition) {
            // 显示任务分解信息
            if (response.content) {
              const aiMessage: Message = {
                sender: response.type === 'game' ? 'game' : 'agent',
                content: response.content,
                agent: response.agent,
                conversationId: currentConversationId
              };
              setMessages(prevMessages => [...prevMessages, aiMessage]);
            }      
          
            const decompositionMessage: Message = {
              sender: 'system',
              content: response.taskDecomposition,
              conversationId: currentConversationId
            };
            setMessages(prevMessages => [...prevMessages, decompositionMessage]);
    
            // 显示每个子任务的结果
            response.results.forEach((result: any) => {
              
              const resultMessage: Message = {
                sender: response.type === 'game' ? 'game' : 'agent',
                content: `### Task\n${result.task}\n\n### Original Code\n\n\`\`\`${result.originalCodeLanguage || 'text'}\n${result.originalCode}\n\`\`\`\n\n### Review\n${result.review}\n\n### Updated Code\n\n\`\`\`${result.updatedCodeLanguage || 'text'}\n${result.updatedCode}\n\`\`\``,
                agent: result.agent,
                conversationId: currentConversationId,
                files: result.files // 确保 files 被正确传递
              };
              setMessages(prevMessages => [...prevMessages, resultMessage]);
            });      
          } else {
            // 单一任务的响应
            if (response.results) {
              response.results.forEach((result: any) => {
                  
                const resultMessage: Message = {
                  sender: response.type === 'game' ? 'game' : 'agent',
                  content: `### Original Code\n\n\`\`\`${result.originalCodeLanguage || 'text'}\n${result.originalCode}\n\`\`\`\n\n### Review\n${result.review}\n\n### Updated Code\n\n\`\`\`${result.updatedCodeLanguage || 'text'}\n${result.updatedCode}\n\`\`\``,
                  agent: result.agent,
                  conversationId: currentConversationId,
                  files: result.files // 确保 files 被正确传递
                };
                setMessages(prevMessages => [...prevMessages, resultMessage]);
              });
            }
            if (response.content) {
              
              const aiMessage: Message = {
                sender: response.type === 'game' ? 'game' : 'agent',
                content: response.content,
                agent: response.agent,
                conversationId: currentConversationId,
                files: response.files
              };
              setMessages(prevMessages => [...prevMessages, aiMessage]);
            }
            if (response.type === 'game') {
              
              const gameFiles = response.files.map((file: any) => ({
                ...file,
                content: file.content
              }));
              
              
              updateGameCode({
                originalCode: response.content,
                compiledCode: null,
                files: gameFiles,
                gameType: response.gameType,
                contractAddress: ''
              });
            }
          }
        }
         const token = localStorage.getItem('token');
         if (isAuthenticated && token) {
        await refreshCredits();
         } else {
         }
      } catch (error: any) {
        console.error('Error processing message:', error);
        const tip = 'Sorry, an error occurred while processing your request. Please try again.'
        const mes = error.response?.data?.details || error.response?.data?.error || error.message || tip
        const errorMessage: Message = {
          sender: 'system',
          content: mes,
          conversationId: currentConversationId
        };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
      } finally {
        setIsLoading(false);
      }   
    }
  };

  const handleAgentCreationStep = async (input: string) => {
    setIsLoading(false);
    if (!newAgentData.name) {
      if (!input.replace(/\s/g, '')) {
        const descriptionPrompt: Message = {
          sender: 'system',
          content: "The name cannot be empty, please re-enter.",
          conversationId: conversationId
        };
        setMessages(prevMessages => [...prevMessages, descriptionPrompt]);
        return
      }
      setNewAgentData({ ...newAgentData, name: input.replace(/\s/g, '')});
      const descriptionPrompt: Message = {
        sender: 'system',
        content: "Great name! Now, please provide a description for your agent.(No more than 120 characters)",
        conversationId: conversationId
      };
      setMessages(prevMessages => [...prevMessages, descriptionPrompt]);
    } else if (!newAgentData.description) {
      if (input.replace(/\s/g, "").length > 120) {
        const rolePrompt: Message = {
          sender: 'system',
          content: "Description cannot exceed 120 characters.",
          conversationId: conversationId
        };
        setMessages(prevMessages => [...prevMessages, rolePrompt]);
        return
      }
      setNewAgentData({ ...newAgentData, description: input });
      const rolePrompt: Message = {
        sender: 'system',
        content: "Excellent description! What role should this agent have?",
        conversationId: conversationId
      };
      setMessages(prevMessages => [...prevMessages, rolePrompt]);
    } else if (!newAgentData.role) {
      setNewAgentData({ ...newAgentData, role: input });
      const goalPrompt: Message = {
        sender: 'system',
        content: "Excellent! What type of agent is this? (e.g., 'chatbot', 'task', 'analysis')",
        conversationId: conversationId
      };
      setMessages(prevMessages => [...prevMessages, goalPrompt]);
    } else if (!newAgentData.type) {
      setNewAgentData({ ...newAgentData, type: input });
    }
  };

  const addIPFS = () => {
    const modal = Modal.info({
      title: 'Upload Agent Image',
      okText: 'Skip',
      content: (
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                modal.destroy();
                setIsLoading(true);
                const formData = new FormData();
                formData.append('file', file);

                const auth = 'Basic ' + btoa(`${INFURA_PROJECT_ID}:${INFURA_PROJECT_SECRET}`);
                // 上传图片到 IPFS
                const response = await axios.post(`${IPFS_API_URL}/add`, formData, {
                  headers: {
                    'Authorization': auth,
                    'Content-Type': 'multipart/form-data'
                  }
                });

                const imageUrl = `https://ipfs.io/ipfs/${response.data.Hash}`;
                // 完成 agent 创建
                await handleCreateAgentWithImage(imageUrl);
              } catch (error) {
                console.error('Error uploading image:', error);
                const errorMessage: Message = {
                  sender: 'system',
                  content: `Error uploading image: ${(error as Error).message}`,
                  conversationId: conversationId
                };
                setMessages(prevMessages => [...prevMessages, errorMessage]);
              } finally {
                setIsLoading(false);
              }
            };
            reader.readAsDataURL(file);
            return false;
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p>Please select an image for your agent</p >
            <button style={{ padding: '8px 16px' }}>
              <UploadOutlined /> Select Image
            </button>
          </div>
        </Upload>
      ),
      onOk: async () => {
        // Skip 按钮点击时，直接创建 agent
        await handleCreateAgentWithImage();
      }
    });
  }

  const handleCreateAgentWithImage = async (imageUrl?: string) => {
    try {
      const currentAccount = getCurrentAccount();
      if (!currentAccount) {
        throw new Error('No wallet connected');
      }

      const agentDataWithImage = {
        ...newAgentData,
        imageUrl: imageUrl || ''
      };
      
      // 创建Agent数据库记录
      const response = await createAgent(agentDataWithImage);
      const { ipfsHash } = response;

      let createdAgent;
      let tx;

      if (primaryWallet === 'metamask') {
        // EVM流程
        const web3Instance = getWeb3Instance();
        if (!web3Instance) {
          throw new Error('MetaMask not connected');
        }

        const chainIdRaw = await web3Instance.eth.getChainId();
        const chainId = Number(chainIdRaw);
        
        createdAgent = await finalizeAgentCreation({
          ...agentDataWithImage,
          ipfsHash,
          address: currentAccount,
          transactionHash: '',
          chainid: chainId
        });
        
        // 调用EVM合约
        const agentRegistry = new AgentRegistry(web3Instance, chainId);
        try {
          tx = await agentRegistry.registerAgent(
            createdAgent.id,
            agentDataWithImage.name,
            agentDataWithImage.description,
            agentDataWithImage.type,
            ipfsHash,
            currentAccount
          ); 
          updateAgentHash(createdAgent.id, { transactionHash: tx.hash });
        } catch (error) {
          await deleteAgent(createdAgent.id);
          throw error;
        }

      } else if (primaryWallet === 'phantom') {
        // Solana流程
        let solanaConnection = getSolanaConnection();
        if (!solanaConnection) {
          // 如果没有连接，创建一个新的连接
          solanaConnection = new Connection(clusterApiUrl('devnet'));
        }

        // 创建数据库记录（Solana使用chainid: 999表示Solana）
        createdAgent = await finalizeAgentCreation({
          ...agentDataWithImage,
          ipfsHash,
          address: currentAccount,
          transactionHash: '',
          chainid: 999 // Solana标识
        });

        // 调用Solana合约
        try {
          // 检查Phantom钱包是否可用
          // 🔧 修复: 优先使用 window.phantom?.solana (Phantom 官方推荐)
          const phantomProvider = (window as any).phantom?.solana || (window as any).solana;
          if (!phantomProvider || !phantomProvider.publicKey) {
            throw new Error('Phantom wallet not connected. Please connect your wallet first.');
          }

          console.log('🔍 Debugging Solana transaction:');
          console.log('- Network:', solanaConnection.rpcEndpoint);
          console.log('- Wallet Address:', phantomProvider.publicKey.toString());
          console.log('- Agent Name:', agentDataWithImage.name);
          console.log('- Agent Type:', agentDataWithImage.type);
          console.log('- IPFS Hash:', ipfsHash);

          const solanaClient = new SolanaAgentClient(solanaConnection, { 
            publicKey: phantomProvider.publicKey, 
            connected: true,
            signTransaction: phantomProvider.signTransaction,
            signAllTransactions: phantomProvider.signAllTransactions
          } as any, 'DHU9UBVaZNtw77FabwS7JmCxrgnNPA6Zg18xBPfB3rZ');

          console.log('🚀 Calling registerAgent...');
          const signature = await solanaClient.registerAgent({
            name: agentDataWithImage.name,
            description: agentDataWithImage.description,
            agentType: agentDataWithImage.type,
            ipfsHash: ipfsHash,
            imageUrl: agentDataWithImage.imageUrl || ''
          }, (success: boolean, error?: any) => {
            // 交易确认回调 - 静默处理，不显示UI消息
            console.log('🎯 Callback received! Success:', success, 'Error:', error);
            if (!success && error) {
              console.error('❌ Agent registration failed during confirmation:', error);
            }
          });

          console.log('✅ Agent registration transaction sent. Signature:', signature);
          updateAgentHash(createdAgent.id, { transactionHash: signature });
        } catch (error) {
          console.error('❌ Solana Agent Registration Error:', error);
          console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
          });
          
          // 检查是否是超时错误，如果是，可能交易实际成功了
          if (error.message && error.message.includes('Transaction was not confirmed')) {
            const timeoutMatch = error.message.match(/Check signature (\w+)/);
            if (timeoutMatch) {
              const signature = timeoutMatch[1];
              console.log('🔄 Transaction timeout detected, signature:', signature);
              console.log('⏳ Transaction may have succeeded but confirmation was delayed.');
              const timeoutNetwork = detectSolanaNetwork(getSolanaConnection() as Connection);
              const timeoutExplorerUrl = generateExplorerUrl(signature, timeoutNetwork);
              console.log('🔗 Check transaction status at:', timeoutExplorerUrl);
              
              // 不删除Agent，因为交易可能成功了
              // 让用户知道需要检查交易状态
              throw new Error(`Transaction timed out but may have succeeded. Check status at: ${timeoutExplorerUrl}`);
            }
          }
          
          await deleteAgent(createdAgent.id);
          throw error;
        }
      } else {
        throw new Error('No supported wallet connected');
      }

      createdAgent.trainingData = [];
      
      const successMessage: Message = {
        sender: 'system',
        content: `Great! Your new agent "${createdAgent.name}" has been created successfully on ${primaryWallet === 'metamask' ? 'EVM' : 'Solana'} chain. You can now train it or start using it.`,
        conversationId: conversationId
      };
      setMessages(prevMessages => [...prevMessages, successMessage]);
      setIsCreatingAgent(false);
      fetchAgents();
    } catch (error) {
      console.error('Error creating agent:', error);
      const errorMessage: Message = {
        sender: 'system',
        content: `I'm sorry, there was an error creating your agent: ${(error as Error).message}`,
        conversationId: conversationId
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      setIsCreatingAgent(false);
    }
  };

  const handleClearConversation = async () => {
    try {
      await clearConversation();
      setMessages([]);
      setConversationId('');
      setTaskDecomposition(null);
      navigate('/chat', { replace: true });
    } catch (error) {
      console.error('Error clearing conversation:', error);
    }
  };

  const handleDeployClick = async (contractId: string) => {
    try {
      const data = await getContractBytecode(contractId);
      setContractData(data);
      setDeployModalVisible(true);
    } catch (error) {
      console.error('Error fetching contract data:', error);
    }
  };

  const handleDeploySuccess = async (address: string, chainType: string) => {
    try {
      // 生成游戏ID (如果还没有)
      const gameId = gameCode?.gameId || uuidv4();
      
      // 更新游戏代码状态
      setGameCode(prevGameCode => {
        if (!prevGameCode) return null;
        
        const updatedGameCode = {
          ...prevGameCode,
          gameId,
          contractAddress: address
        };
        
        return updatedGameCode;
      });

      // 保存游戏源码元数据
      if (selectedContracts.length > 0 && contracts.length > 0) {
        const selectedContract = contracts.find(c => selectedContracts.includes(c.name));
        if (selectedContract && selectedContract.abi) {
          try {
            await saveGameSourceMetadata({
              gameId,
              sourceCodeType: 'custom',
              compilerVersion: selectedContract.compilerVersion || '0.8.0',
              hasEndGameNotification: true,
              marketplaceStatus: 'draft'
            });
          } catch (error) {
            console.error('Failed to save game source metadata:', error);
          }
        }
      }
      
      // 保存部署信息到会话消息
      setMessages((prev: any) => [...prev, {
        sender: 'system',
        content: `Contract deployed successfully at ${address} on ${chainType}. Game ID: ${gameId}`,
        conversationId
      }]);
      
      // 如果在游戏模式，更新游戏上下文
      if (isGameMode) {
        setGameContext(prev => ({
          ...prev,
          gameId,
          contractAddress: address
        }));
      }
      
      return { success: true, address, chainType, gameId };
    } catch (error) {
      console.error('Error in handleDeploySuccess:', error);
      message.error('Failed to process deployment success');
      return { success: false, error };
    }
  };

  const addContract = (name: string, source: string, type: string) => {
    
    if (!contracts) {
      setContracts((prev: any) => {
        if (!isGameMode) {
          if (prev.some((c: any) => c.name === name)) return prev;
        }
        const newContract = { name, source, abi: [], bytecode: '', type, isDeployed: false };
        return [...prev, newContract];
      });
    } else {
      const filterdata = contracts.filter((item: any) => {
        return item.name === name
      })
      if (!filterdata.length) {
        setContracts((prev: any) => {
          if (!isGameMode) {
            if (prev.some((c: any) => c.name === name)) return prev;
          }
          const newContract = { name, source, abi: [], bytecode: '', type, isDeployed: false };
            return [...prev, newContract];
        });
      }
    }
  };

  const updateContract = (name: string, source: string, type: string) => {
    setContracts((prev: any) => {
      const index = prev.findIndex((c: any) => c.name === name);
      if (index !== -1) {
        // 更新现有合约
        const updatedContracts = [...prev];
        updatedContracts[index] = { 
          ...updatedContracts[index], 
          source, 
          type,
          updatedAt: new Date().toISOString()
        };
        return updatedContracts;
      }
      // 如果合约不存在，添加新合约
      return [...prev, { name, source, type, abi: [], bytecode: '', isDeployed: false }];
    });
  };
  
  const deployContract = async (contract: Contract, params: any[]): Promise<string> => {
    if (!web3) throw new Error('Web3 not initialized');
    const accounts = await web3.eth.getAccounts();
    const newContract = new web3.eth.Contract(contract.abi);
    const gasEstimate = await newContract.deploy({
      data: contract.bytecode,
      arguments: params
    }).estimateGas({from: accounts[0]});
    
    const deployed = await newContract.deploy({
      data: contract.bytecode,
      arguments: params
    }).send({
      from: accounts[0],
      gas: gasEstimate.toString()
    });
    return deployed.options.address;
  };

  const getContractInstance = (contract: Contract) => {
    if (!web3 || !contract.address) throw new Error('Web3 not initialized or contract not deployed');
    return new web3.eth.Contract(contract.abi, contract.address);
  };


  return (
    <ChatContext.Provider value={{
      messages,
      setMessages,
      input,
      setInput,
      agents,
      setAgents,
      selectedAgent,
      setSelectedAgent,
      isCreatingAgent,
      setIsCreatingAgent,
      newAgentData,
      setNewAgentData,
      showMarketplace,
      setShowMarketplace,
      marketplaceAgents,
      setMarketplaceAgents,
      selectedTeam,
      setSelectedTeam,
      teams,
      setTeams,
      selectedSpecificAgent,
      setSelectedSpecificAgent,
      conversationId,
      setConversationId,
      isLoading,
      setIsLoading,
      taskDecomposition,
      setTaskDecomposition,
      deployModalVisible,
      setDeployModalVisible,
      contractData,
      setContractData,
      selectedContracts,
      setSelectedContracts,
      handleAgentSelection,
      handleTeamSelection,
      handleSendMessage,
      handleClearConversation,
      fetchAgents,
      fetchTeams,
      fetchTeamById,
      handleDeployClick,
      handleDeploySuccess,
      contracts,
      setContracts,
      addContract,
      updateContract,
      deployContract,
      getContractInstance,
      deployedContracts,
      setDeployedContract,
      isGameMode,
      toggleGameMode,
      gameContext,
      setGameContext,
      updateGameState,
      resetGameState,
      gameCode,
      setGameCode,
      updateGameCode,
      updateContractInfo,
      gameContract,
      setGameContract,
      replaceContractAddress
    }}>
      {children}
    </ChatContext.Provider>
  );
};
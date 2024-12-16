import React, { createContext, useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Modal, Upload } from 'antd';
import axios from 'axios';
import { UploadOutlined } from '@ant-design/icons';
import { Web3Context } from '../contexts/Web3Context';
import { AgentRegistry } from '../contracts/AgentRegistry';
import Web3 from 'web3';
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
  deleteAgent
} from '../services/api';

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
    language: string;
    path: string;
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

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const web3Instance = new Web3((window as any).ethereum);
  const { account, web3, refreshCredits } = useContext(Web3Context);
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

  useEffect(() => {
    const urlConversationId = searchParams.get('conversationId');
    if (urlConversationId) {
      setConversationId(urlConversationId);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      if (account) {
        await Promise.all([
          fetchAgents(),
          fetchTeams()
        ]);

        const searchParams = new URLSearchParams(location.search);
        const teamId = searchParams.get('teamId');
        const cId = searchParams.get('conversationId');

        if (cId) {
          setConversationId(cId);
          await fetchConversationHistory(cId);
        } else if (teamId) {
          await fetchTeamById(teamId);
        }
      }
    };

    fetchData();
  }, [account, location.search]);

  useEffect(()=> {
    if (newAgentData.type) {
      addIPFS()
    }
  }, [newAgentData])

  const setDeployedContract = (contractName: string) => {
    setDeployedContracts(prev => new Set([...prev, contractName]));
  };

  const fetchAgents = async () => {
    try {
      const accounts = await web3Instance.eth.getAccounts();
      const fetchedAgents = await getAgents(accounts[0]);
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

  const handleTeamSelection = async (team: Team) => {
    if (selectedTeam?.teamid === team.teamid) {
      setSelectedTeam(null);
      navigate(`/chat`, { replace: true });
      setConversationId('')
    } else {
      setSelectedTeam(team);
      navigate(`/chat?teamId=${team.teamid}`, { replace: true });
      setSelectedAgent(null);
      setSelectedSpecificAgent(null);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    setIsLoading(true);
    let currentConversationId = conversationId || uuidv4();
    setConversationId(currentConversationId);
    const chainId = await web3Instance.eth.getChainId();
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
      conversationId: currentConversationId
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
        if (selectedTeam) {
          response = await sendTeamMessage(selectedTeam.teamid, input, currentConversationId, chainId);
        } else if (selectedAgent) {
          response = await sendMessage(input,chainId, selectedAgent.id, currentConversationId);
        } else {
          response = await sendMessage(input, chainId, undefined, currentConversationId);
        }     

        if (response.content && response.content.includes('THREE.')) {
          const threeJSCode = response.content.replace(/```js\n|```/g, '');
          const aiMessage: Message = {
            sender: 'agent',
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
                sender: 'agent',
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
                sender: 'agent',
                content: `<h3>Task:</h3> ${result.task}\n\n<h3>Original Code:</h3> ${result.originalCode}\n\n<h3>Review:</h3> ${result.review}\n\n<h3>Updated Code:</h3> ${result.updatedCode}}`,
                agent: result.agent,
                conversationId: currentConversationId,
                files: result.files
              };
              setMessages(prevMessages => [...prevMessages, resultMessage]);
            });      
          } else {
            // 单一任务的响应
            if (response.results) {
              response.results.forEach((result: any) => {
                const resultMessage: Message = {
                  sender: 'agent',
                  content: result.originalCode+result.review+result.updatedCode,
                  agent: result.agent,
                  conversationId: currentConversationId
                };
                setMessages(prevMessages => [...prevMessages, resultMessage]);
              });
            }
            if (response.content) {
              const aiMessage: Message = {
                sender: 'agent',
                content: response.content,
                agent: response.agent,
                conversationId: currentConversationId,
                files: response.files
              };
              setMessages(prevMessages => [...prevMessages, aiMessage]);
            }
          }
        }
        refreshCredits()
      } catch (error: any) {
        console.error('Error processing message:', error);
        const tip = 'Sorry, an error occurred while processing your request. Please try again.'
        const mes = error.response.data.details || error.response.data.error || tip
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
      const accounts = await web3Instance.eth.getAccounts();
      
      const agentDataWithImage = {
        ...newAgentData,
        imageUrl: imageUrl || ''
      };
      
      const response = await createAgent(agentDataWithImage);
      const chainId = await web3Instance.eth.getChainId();
      const { ipfsHash } = response;

      const createdAgent = await finalizeAgentCreation({
        ...agentDataWithImage,
        ipfsHash,
        address: accounts[0],
        transactionHash: '',
        chainid: chainId
      });
      
      const agentRegistry = new AgentRegistry(web3Instance, chainId);
      let tx
      try {
        tx = await agentRegistry.registerAgent(
          createdAgent.id,
          agentDataWithImage.name,
          agentDataWithImage.description,
          agentDataWithImage.type,
          ipfsHash,
          accounts[0]
        ); 
      } catch (error) {
        await deleteAgent(createdAgent.id);
        const errorMessage: Message = {
          sender: 'system',
          content: `I'm sorry, there was an error creating your agent: ${(error as Error).message}`,
          conversationId: conversationId
        };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
        setIsCreatingAgent(false);
        return
      }
      updateAgentHash(createdAgent.id, { transactionHash: tx.hash })
      createdAgent.trainingData = [];
      
      const successMessage: Message = {
        sender: 'system',
        content: `Great! Your new agent "${createdAgent.name}" has been created successfully. You can now train it or start using it.`,
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

  const handleDeploySuccess = (address: string, chainType: string) => {
    setMessages(prevMessages => [
      ...prevMessages,
      {
        sender: 'system',
        content: `Contract deployed successfully on ${chainType} at address: ${address}`,
        conversationId: conversationId
      }
    ]);
  };

  const addContract = (name: string, source: string, type: string) => {
    setContracts((prev: any) => {
      if (prev.some((c: any) => c.name === name)) return prev;
      return [...prev, { name, source, abi: [], bytecode: '', type, isDeployed: false }];
    });
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
    const deployed = await newContract.deploy({
      data: contract.bytecode,
      arguments: params
    }).send({
      from: accounts[0],
      gas: await newContract.deploy({
        data: contract.bytecode,
        arguments: params
      }).estimateGas({from: accounts[0]})
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
    }}>
      {children}
    </ChatContext.Provider>
  );
};
import axios from 'axios';

const API_URL = process.env.NODE_ENV === 'production' ? 'https://aiservice.gameland.network/api' : 'http://localhost:5000/api';

const api = axios.create({
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
  trainingData?: {
    ipfsHash: string;
    trained_at: string;
    userAddress: string;
  }[];
}

export const sendMessage = async (message: string, agentId?: number, conversationId?: string) => {
  const response = await api.post('/chat', { message, agentId, conversationId });
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

export const toggleAgentPublicity = async (agentId: number) => {
  const response = await api.put(`/agents/${agentId}/toggle-publicity`);
  return response.data;
};

export const getAgentDetails = async (agentId: number): Promise<Agent> => {
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

export const deleteAgent = async (agentId: number) => {
  const response = await api.delete(`/agents/${agentId}`);
  return response.data;
};

export const trainAgent = async (agentId: number, trainingData: string, userAddress: string, trainingType: string) => {
  const response = await api.post(`/agents/${agentId}/train`, { trainingData, userAddress, trainingType });
  return response.data;
};

export const connectWallet = async (address: string, chainId: number, message: string, signature: string) => {
  const response = await api.post('/users/connect', { address, chainId, message, signature });
  localStorage.setItem('token', response.data.token);
  return response.data;
};

export const getAgentKnowledge = async (agentId: number) => {
  const response = await api.get(`/agents/${agentId}/knowledge`);
  return response.data;
};

export const createTeam = async (teamData: any) => {
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

export const sendTeamMessage = async (teamId: string, message: string, conversationId: string) => {
  const response = await api.post(`/chat/team/${teamId}`, { message, conversationId });
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

export const updateTeamAgentRoles = async (teamId: string, agentRoles: { agentId: number; role: string }[]) => {
  const response = await api.put(`/teams/${teamId}/agent-roles`, { agentRoles });
  return response.data;
};

export const executeLangChainTeamTask = async (teamId: string, task: string) => {
  const response = await api.post(`/teams/${teamId}/execute-langchain-task`, { task });
  return response.data;
};


import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

export const httpapi = axios.create({
  baseURL: API_URL,
});

httpapi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['x-access-token'] = token;
  }
  return config;
});

export const loginWithWallet = (address: string, chainId: number) =>
  httpapi.post('/users/login', { address, chainId });

export const startDialogue = (agentId: string, message: string) =>
  httpapi.post('/dialogue', { agentId, message });

export const getDialogueHistory = (agentId: string) =>
  httpapi.get(`/dialogue/${agentId}`);

export const uploadFile = (agentId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('agentId', agentId);
  return httpapi.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const startTraining = (agentId: string, trainingData: string) =>
  httpapi.post('/training', { agentId, trainingData });

export const getMarketplaceAgents = async () => {
  try {
    const response = await httpapi.get('/marketplace/agents');
    return response.data;
  } catch (error) {
    console.error('Error fetching marketplace agents:', error);
    throw error;
  }
};

export const sendMessage = async (message: string) => {
  try {
    const response = await httpapi.post('/chat', { message });
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};


export const deployAgent = async (description: string, ownerAddress: string) => {
  try {
    const response = await httpapi.post('/agents/deploy', { description, ownerAddress });
    return response.data;
  } catch (error) {
    console.error('Error deploying agent:', error);
    throw error;
  }
};


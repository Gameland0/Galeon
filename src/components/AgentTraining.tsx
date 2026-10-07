import React, { useContext, useState } from 'react';
import { trainAgent } from '../services/api';
import { Web3Context } from '../contexts/Web3Context';
import { AgentRegistry } from '../contracts/AgentRegistry';
import Web3 from 'web3';
import { MultiWalletContext } from '../contexts/MultiWalletContext';

interface AgentTrainingProps {
  agentId: number;
  onTrainingComplete: () => void;
  agentChainId?: number;
}

const AgentTraining: React.FC<AgentTrainingProps> = ({ agentId, onTrainingComplete, agentChainId }) => {
  const web3Instance = new Web3((window as any).ethereum)
  const [currentStep, setCurrentStep] = useState(0);
  const [trainingData, setTrainingData] = useState('');
  const [trainingType, setTrainingType] = useState<'text' | 'url' | 'hyperlink'>('text');
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { web3, account } = useContext(Web3Context);
  const { getCurrentAccount, getWeb3Instance } = useContext(MultiWalletContext);
  const [isLoading, setIsLoading] = useState(false);

  const toChainHex = (id: number) => `0x${id.toString(16)}`;

  const handleTrainAgent = async () => {
    setIsTraining(true);
    setError(null);
    try {
      const chainIdRaw = await web3Instance.eth.getChainId();
      let chainId = Number(chainIdRaw);
      const currentAccount = getCurrentAccount() || (account as string);

      // 使用统一的训练API（后端自动集成RAG）
      const response = await trainAgent(agentId, trainingData, currentAccount as string, trainingType, chainId);

      // 根据后端返回判断是否启用了RAG
      if (response.ragEnabled) {
        alert(`Training completed! Smart retrieval enabled with ${response.vectorChunks} document chunks vectorized.`);
      } else {
        alert('Training data saved (IPFS/DB). Recording on-chain...');
      }

      // On-chain recording (soft failure handling)
      try {
        const onChainWeb3 = getWeb3Instance() || web3;
        if (onChainWeb3 && currentAccount) {
          if (agentChainId && chainId !== agentChainId && (window as any).ethereum?.request) {
            await (window as any).ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: toChainHex(agentChainId) }]
            });
            const afterSwitch = await onChainWeb3.eth.getChainId();
            chainId = Number(afterSwitch);
          }
          if (!agentChainId || chainId === agentChainId) {
            const agentRegistry = new AgentRegistry(onChainWeb3, chainId);
            await agentRegistry.addTrainingData(agentId, response.ipfsHash, currentAccount);
          }
        }
      } catch (chainErr) {
        console.warn('On-chain training record failed:', chainErr);
        alert('On-chain record pending. It may complete later.');
      }

      setIsTraining(false);
      onTrainingComplete();
    } catch (error) {
      console.error('Error training agent:', error);
      setError('Failed to train agent. Please try again.');
      setIsTraining(false);
    }
  };

  return (
    <div className="agent-training">
      <h3>Train Your Agent</h3>
      <div className="training-select">
        <select 
          value={trainingType} 
          onChange={(e) => setTrainingType(e.target.value as 'text' | 'url' | 'hyperlink')}
          disabled={isTraining}
        >
          <option value="text">Plain Text</option>
          <option value="url">URL</option>
          <option value="hyperlink">Hyperlink</option>
        </select>
      </div>
      <textarea
        value={trainingData}
        onChange={(e) => setTrainingData(e.target.value)}
        placeholder={
          trainingType === 'text' ? "Enter training data here..." :
          trainingType === 'url' ? "Enter URL here..." :
          "Enter hyperlink here (format: [text](url))..."
        }
        disabled={isTraining}
      />
      <div className="Start-Training">
        <button onClick={handleTrainAgent} disabled={isTraining || !trainingData.trim()}>
          {isTraining ? 'Training...' : 'Start Training'}
        </button>
      </div>
      {error && <p className="error">{error}</p >}
    </div>
  );
};

export default AgentTraining;
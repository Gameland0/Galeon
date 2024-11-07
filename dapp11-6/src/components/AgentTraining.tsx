import React, { useContext, useState } from 'react';
import { trainAgent } from '../services/api';
import { Web3Context } from '../contexts/Web3Context';
import { AgentRegistry } from '../contracts/AgentRegistry';


// interface TrainingStep {
//   title: string;
//   description: string;
// }

// const trainingSteps: TrainingStep[] = [
//   { title: "准备数据", description: "上传或输入您的训练数据" },
//   { title: "数据处理", description: "系统正在处理您的数据" },
//   { title: "模型更新", description: "正在更新Agent的知识库" },
//   { title: "验证", description: "测试新训练的Agent" }
// ];

interface AgentTrainingProps {
  agentId: number;
  onTrainingComplete: () => void;
}

const AgentTraining: React.FC<AgentTrainingProps> = ({ agentId, onTrainingComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [trainingData, setTrainingData] = useState('');
  const [trainingType, setTrainingType] = useState<'text' | 'url' | 'hyperlink'>('text');
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { web3, account } = useContext(Web3Context);

  const handleTrainAgent = async () => {
    setIsTraining(true);
    setError(null);
    try {
      const response = await trainAgent(agentId, trainingData, account as string, trainingType);
      console.log('Training response:', response);

      if (web3 && account) {
        const agentRegistry = new AgentRegistry(web3);
        await agentRegistry.addTrainingData(agentId, response.ipfsHash, account);
      }
      alert('Training data added successfully!');
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
      <select 
        value={trainingType} 
        onChange={(e) => setTrainingType(e.target.value as 'text' | 'url' | 'hyperlink')}
        disabled={isTraining}
      >
        <option value="text">Plain Text</option>
        <option value="url">URL</option>
        <option value="hyperlink">Hyperlink</option>
      </select>
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
      <button onClick={handleTrainAgent} disabled={isTraining || !trainingData.trim()}>
        {isTraining ? 'Training...' : 'Start Training'}
      </button>
      {error && <p className="error">{error}</p >}
    </div>
  );

};


export default AgentTraining;
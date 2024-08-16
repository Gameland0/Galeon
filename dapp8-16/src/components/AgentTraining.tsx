import React, { useState } from 'react';
import { startTraining } from '../services/api';

interface AgentTrainingProps {
  agentId: string;
}

const AgentTraining: React.FC<AgentTrainingProps> = ({ agentId }) => {
  const [trainingData, setTrainingData] = useState('');
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTraining(true);
    setError(null);
    try {
      await startTraining(agentId, trainingData);
      setTrainingData('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during training');
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <div className="agent-training">
      <h3>Train Agent</h3>
      <form onSubmit={handleSubmit}>
        <textarea
          value={trainingData}
          onChange={(e) => setTrainingData(e.target.value)}
          placeholder="Enter training data"
          required
        />
        <button type="submit" disabled={isTraining}>
          {isTraining ? 'Training...' : 'Start Training'}
        </button>
      </form>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};

export default AgentTraining;

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import FileUpload from '../components/FileUpload';
import AgentTraining from '../components/AgentTraining';

const AgentDetails: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();

  return (
    <div className="agent-details">
      <h2>Agent Details</h2>
      <Link to="/chat">Back to Chat</Link>
      <FileUpload agentId={agentId || ''} />
      <AgentTraining agentId={agentId || ''} />
    </div>
  );
};

export default AgentDetails;

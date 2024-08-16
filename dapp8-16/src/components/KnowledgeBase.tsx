import React, { useState, useEffect } from 'react';
import axios from 'axios';

const KnowledgeBase: React.FC<{ agentId: string }> = ({ agentId }) => {
  const [knowledge, setKnowledge] = useState<Array<{ id: string, ipfs_hash: string }>>([]);

  useEffect(() => {
    fetchKnowledge();
  }, [agentId]);

  const fetchKnowledge = async () => {
    try {
      const response = await axios.get(`/api/knowledge/${agentId}`, {
        headers: { 'x-access-token': localStorage.getItem('token') }
      });
      setKnowledge(response.data);
    } catch (error) {
      console.error('Error fetching knowledge:', error);
    }
  };

  return (
    <div>
      <h2>Knowledge Base</h2>
      <ul>
        {knowledge.map((item) => (
          <li key={item.id}>IPFS Hash: {item.ipfs_hash}</li>
        ))}
      </ul>
    </div>
  );
};

export default KnowledgeBase;

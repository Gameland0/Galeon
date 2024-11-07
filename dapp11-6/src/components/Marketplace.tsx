// import React, { useContext, useEffect } from 'react';
// import { ChatContext } from './ChatContext';
// import { getMarketplaceAgents } from '../services/api';

// const Marketplace = () => {
//   const { showMarketplace, selectedAgent, setSelectedAgent, marketplaceAgents, setMarketplaceAgents } = useContext(ChatContext);

//   useEffect(() => {
//     if (showMarketplace) {
//       fetchMarketplaceAgents();
//     }
//   }, [showMarketplace]);

//   const fetchMarketplaceAgents = async () => {
//     try {
//       const agents = await getMarketplaceAgents();
//       setMarketplaceAgents(agents);
//     } catch (error) {
//       console.error('Error fetching marketplace agents:', error);
//     }
//   };

//   if (!showMarketplace) return null;

//   return (
//     <div className="marketplace">
//       <h2>Agent Marketplace</h2>
//       <div className="agent-list">
//         {marketplaceAgents.map((agent: any) => (
//           <div key={agent.id} className="agent-card marketplace-agent">
//             <h3>{agent.name}</h3>
//             <p className="agent-description">{agent.description}</p>
//             <p><strong>Type:</strong> {agent.type}</p>
//             {agent.imageUrl && <img src={agent.imageUrl} alt={agent.name} className="agent-image" />}
//             <p><strong>Owner:</strong> {agent.owner}</p>
//             <p><strong>Hash:</strong> <span className="Hash">{agent.transaction_hash}</span> </p>
//             <p><strong>Created At:</strong> {new Date(agent.created_at).toLocaleString()}</p>
//             {selectedAgent&&selectedAgent.id === agent.id? (
//               <button onClick={() => setSelectedAgent(null)} className="use-agent-btn">Deselect Agent</button>
//             ):(
//               <button onClick={() => setSelectedAgent(agent)} className="use-agent-btn">Use This Agent</button>
//             )}
//           </div>
//          ))}
//       </div>
//     </div>
//   );
// };

// export default Marketplace;
import React, { useContext, useEffect } from 'react';
import { ChatContext } from './ChatContext';
import { getMarketplaceAgents } from '../services/api';
import '../styles/Marketplace.css'; 

const Marketplace = () => {
  const { showMarketplace, selectedAgent, setSelectedAgent, marketplaceAgents, setMarketplaceAgents } = useContext(ChatContext);

  useEffect(() => {
    if (showMarketplace) {
      fetchMarketplaceAgents();
    }
  }, [showMarketplace]);

  const fetchMarketplaceAgents = async () => {
    try {
      const agents = await getMarketplaceAgents();
      setMarketplaceAgents(agents);
    } catch (error) {
      console.error('Error fetching marketplace agents:', error);
    }
  };

  if (!showMarketplace) return null;

  return (
    <div className="marketplace">
      <h2>Agent Marketplace</h2>
      <div className="agent-grid">
        {marketplaceAgents.map((agent: any) => (
          <div key={agent.id} className="agent-card">
            <div className="agent-header">
              {agent.imageUrl && < img src={agent.imageUrl} alt={agent.name} className="agent-image" />}
              <h3>{agent.name}</h3>
            </div>
            <p className="agent-type">{agent.type}</p >
            <p className="agent-description">{agent.description}</p >
            <p className="agent-owner Hash"><strong>Owner:</strong> {agent.owner}</p >
            <p className="agent-created"><strong>Created:</strong> {new Date(agent.created_at).toLocaleDateString()}</p >
            <div className="agent-actions">
              {selectedAgent && selectedAgent.id === agent.id ? (
                <button onClick={() => setSelectedAgent(null)} className="Market-deselect-btn">Deselect Agent</button>
              ) : (
                <button onClick={() => setSelectedAgent(agent)} className="Market-select-btn">Use This Agent</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Marketplace;

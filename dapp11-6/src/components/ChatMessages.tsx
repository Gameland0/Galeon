import React, { useContext, useRef, useEffect, useState } from 'react';
import { ChatContext } from './ChatContext';
import {AsyncMessage} from './AsyncMessage';
import Marketplace from './Marketplace'
import TaskDecompositionDisplay from './TaskDecompositionDisplay';
import ThreeJSPreview from './ThreeJSPreview'; 
import { executeThreeJSCode } from '../utils/ThreeJSExecution';
import DraggableModal from './DraggableModal';


export const ChatMessages: React.FC = () => {
  const { messages, selectedAgent, selectedTeam, selectedSpecificAgent, showMarketplace } = useContext(ChatContext);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [threeJSCode, setThreeJSCode] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);


  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    console.log('messages',messages)
  }, [messages]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (latestMessage && latestMessage.content.includes('THREE.')) {
      const codeMatch = latestMessage.content.match(/```js\n([\s\S]*?)```/);
      if (codeMatch) {
        setThreeJSCode(executeThreeJSCode(codeMatch[1]));
        setIsPreviewOpen(true);
      }
    }
  }, [messages]);


  const getAgentColor = (agentId: number) => {
    const hue = agentId * 137.508; // 使用黄金角近似值
    return `hsl(${hue % 360}, 50%, 75%)`;
  };

  
   return (
    <div className="chat-main">
      {showMarketplace ? (
        <Marketplace />
      ) : (
        <>
          <div className="selected-entity">
            {selectedSpecificAgent ? (
              <p>Selected Specific Agent: <span style={{color: getAgentColor(selectedSpecificAgent.id)}}>{selectedSpecificAgent.name}</span></p >
            ) : selectedTeam ? (
              <>
                <p>Selected Team: <span style={{color: '#4CAF50'}}>{selectedTeam.name}</span></p >
                <p>Team Agents:</p >
                <ul>
                  {selectedTeam.agents && selectedTeam.agents.length > 0 ? selectedTeam.agents.map((agent: any) => (
                    <li key={agent.id}>
                      {agent.name} (Role: {agent.role})
                      <ul>
                        {agent.capabilities && agent.capabilities.map((cap:any, index:number) => (
                          <li key={index}>{cap}</li>
                        ))}
                      </ul>
                    </li>
                  )) : 
                  'No agents in this team'}
                </ul>
              </>
            ) : selectedAgent ? (
              <>
                <p>Selected Agent: <span>{selectedAgent.name}</span></p >
              </>
            ) : (
              <p>No agent or team selected. You can @mention an agent in your message or select a team to chat with.</p >
            )}
          </div>
          <div className="messages-container">
            <div className="messages">
              {messages.map((msg: any, index: any) => (
                <React.Fragment key={`${msg.conversationId}-${index}`}>
                  {msg.sender === 'system' && msg.content.tasks ? (
                    <TaskDecompositionDisplay taskDecomposition={msg.content} />
                  ) : (
                    <AsyncMessage msg={msg} index={index} />
                  )}
                </React.Fragment>
              ))}
              <div ref={messagesEndRef} />
              <DraggableModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)}>
                <ThreeJSPreview code={threeJSCode} />
              </DraggableModal>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
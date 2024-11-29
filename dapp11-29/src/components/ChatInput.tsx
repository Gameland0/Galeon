import React, { useContext, useEffect } from 'react';
import { ChatContext } from './ChatContext';
import { Web3Context } from '../contexts/Web3Context';
import clear from '../image/icon_clear.png'

export const ChatInput: React.FC = () => {
  const { input, setInput, handleSendMessage, isLoading, handleClearConversation } = useContext(ChatContext);
  const { credits, refreshCredits } = useContext(Web3Context);
  
  if (!credits) {
    refreshCredits()
  }

  return (
    <div className="input-area">
            <div className="credit-info">
                Credits: {credits?.creditBalance || 0}
            </div>
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && 
                    (credits?.creditBalance || 0) > 0 && handleSendMessage()}
                placeholder={(credits?.creditBalance || 0) > 0 ? 
                    "Type your massage here or Type “Create agent”" : "No credits available"}
                disabled={isLoading || (credits?.creditBalance || 0) <= 0}
            />
            <button 
                className="send-button"
                onClick={handleSendMessage} 
                disabled={isLoading || (credits?.creditBalance || 0) <= 0}
            >
                {isLoading ? 'Sending...' : 'Send'}
            </button>
            <button className="clear-button" onClick={handleClearConversation} disabled={isLoading}>
                <img src={clear} alt="" />
            </button>
    </div>

  );
};

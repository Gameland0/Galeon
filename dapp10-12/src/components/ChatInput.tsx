import React, { useContext } from 'react';
import { ChatContext } from './ChatContext';

export const ChatInput: React.FC = () => {
  const { input, setInput, handleSendMessage, isLoading, handleClearConversation } = useContext(ChatContext);

  return (
    <div className="input-area">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
        placeholder="Type your message here..."
        disabled={isLoading}
      />
      <button onClick={handleSendMessage} disabled={isLoading}>
        {isLoading ? 'Sending...' : 'Send'}
      </button>
      <button onClick={handleClearConversation} disabled={isLoading}>Clear Conversation</button>
    </div>
  );
};

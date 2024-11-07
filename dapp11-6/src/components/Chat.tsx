import React, { useContext, useState } from 'react';
import { ChatContext, ChatProvider } from './ChatContext';
import { ChatSidebar } from './ChatSidebar';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ContractDeployment } from './ContractDeployment';

const Chat: React.FC = () => {
  const context = useContext(ChatContext);
  
  if (!context) {
    return <div>Loading...</div>;
  }

  return (
    <ChatProvider>  
      <div className="chat-container">
        <ChatSidebar />
        <div className="chat-main">
          <ChatMessages />
          <ChatInput />
        </div>
        <ContractDeployment />
      </div>
    </ChatProvider>
  );
};

export default Chat;


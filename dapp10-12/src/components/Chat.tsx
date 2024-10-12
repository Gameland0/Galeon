import React, { useContext, useState } from 'react';
import { ChatContext, ChatProvider } from './ChatContext';
import { ChatSidebar } from './ChatSidebar';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';

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
      </div>
    </ChatProvider>
  );
};

export default Chat;


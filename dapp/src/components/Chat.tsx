import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { sendMessage } from '../services/api';

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Array<{ sender: string; content: string }>>([]);
  const [input, setInput] = useState('');

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    try {
      const response = await sendMessage(input);
      setMessages(prevMessages => [
        ...prevMessages,
        { sender: 'user', content: input },
        { sender: 'system', content: response[0].message }
      ]);
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
      // 可以在这里添加错误处理逻辑，例如显示错误消息给用户
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            {msg.sender === 'system' 
              ? <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content) }} />
              : <p>{msg.content}</p >
            }
          </div>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
      />
      <button onClick={handleSendMessage}>Send</button>
    </div>
  );
};

export default Chat;

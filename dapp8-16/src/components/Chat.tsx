import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { sendMessage, deployContract } from '../services/api';
import ReactMarkdown from 'react-markdown';
import { Dialog, DialogContent, DialogTitle, Button, Select, MenuItem } from '@material-ui/core';

interface Message {
  sender: string;
  content: string;
  agent?: any;
  airdropContract?: string;
}

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<any[]>([]);
  const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);
  const [selectedChain, setSelectedChain] = useState('');
  const [currentContract, setCurrentContract] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { sender: 'user', content: input };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInput('');

    try {
      const response = await sendMessage(input);
      const aiMessage: Message = { 
        sender: 'system', 
        content: response[0].message,
        agent: response[0].agent,
        airdropContract: response[0].airdropContract
      };
      setMessages(prevMessages => [...prevMessages, aiMessage]);
      if (aiMessage.agent) {
        setAgents(prevAgents => [...prevAgents, aiMessage.agent]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        sender: 'system',
        content: "I'm sorry, I encountered an error while processing your request. Could you please try again?"
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    }
  };

  const handleDeployContract = (contractCode: string) => {
    setCurrentContract(contractCode);
    setIsDeployDialogOpen(true);
  };

  const confirmDeployContract = async () => {
    try {
      const result = await deployContract(currentContract, selectedChain);
      setMessages(prevMessages => [
        ...prevMessages,
        { 
          sender: 'system', 
          content: `Contract deployed successfully on ${selectedChain}. Contract address: ${result.contractAddress}` 
        }
      ]);
    } catch (error) {
      console.error('Error deploying contract:', error);
      setMessages(prevMessages => [
        ...prevMessages,
        { 
          sender: 'system', 
          content: "An error occurred while deploying the contract. Please try again later." 
        }
      ]);
    } finally {
      setIsDeployDialogOpen(false);
    }
  };

  interface CodeProps extends React.HTMLAttributes<HTMLElement> {
    inline?: boolean;
    node?: any;
    className?: string;
    children?: React.ReactNode;
  }
  
  const renderMessage = (msg: Message, index: number) => {
    let content;
    if (msg.sender === 'system') {
      content = (
        <ReactMarkdown
          components={{
            code({node, inline, className, children, ...props}: CodeProps) {
              if (inline) {
                return <code className={className} {...props}>{children}</code>
              }
              return (
                <div>
                  <pre><code className={className} {...props}>{children}</code></pre>
                  {msg.airdropContract && (
                    <Button onClick={() => handleDeployContract(msg.airdropContract!)}>
                      Deploy Contract
                    </Button>
                  )}
                </div>
              )
            }
          }}
        >
          {msg.content}
        </ReactMarkdown>
      );
    } else {
      content = <p>{msg.content}</p >;
    }
  
    return (
      <div key={index} className={`message ${msg.sender}`}>
        {content}
      </div>
    );
  };
  
  
  

  return (
    <div className="chat-container">
      <div className="agents-list">
        <h3>Your Agents</h3>
        {agents.map((agent, index) => (
          <div key={index} className="agent-item">
            < img src={agent.image} alt={agent.name} />
            <div>
              <h4>{agent.name}</h4>
              <p>{agent.description}</p >
            </div>
          </div>
        ))}
      </div>
      <div className="messages">
        {messages.map((msg, index) => renderMessage(msg, index))}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type your message here or 'create agent' to start..."
        />
        <button onClick={handleSendMessage}>Send</button>
      </div>
      <Dialog open={isDeployDialogOpen} onClose={() => setIsDeployDialogOpen(false)}>
        <DialogTitle>Deploy Contract</DialogTitle>
        <DialogContent>
          <Select
            value={selectedChain}
            onChange={(e: any) => setSelectedChain(e.target.value as string)}
          >
            <MenuItem value="ethereum">Ethereum</MenuItem>
            <MenuItem value="binance">Binance Smart Chain</MenuItem>
            <MenuItem value="polygon">Polygon</MenuItem>
          </Select>
          <Button onClick={confirmDeployContract}>Confirm Deploy</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chat;

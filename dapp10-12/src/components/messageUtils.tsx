import { Message } from './ChatContext';
import { parseMarkdown } from './markdownUtils';

export const renderMessage = async (msg: Message, index: number) => {
  if (!msg || typeof msg !== 'object') {
    console.error('Invalid message object:', msg);
    return null;
  }
  let content = msg.content || '';
  const sender = msg.sender || 'unknown';
  
  // Handle @mentions
  if (typeof content === 'string') {
    const mentionRegex = /@(\w+)/g;
    content = content.replace(mentionRegex, '**@$1**');
  }

  const messageContent = sender === 'user'
    ? <p>{content}</p>
    : (
      <div 
        className="markdown-content" 
        dangerouslySetInnerHTML={{ __html: await parseMarkdown(content) }} 
      />
    );

  return (
    <div key={index} className={`message ${sender}`}>
      {msg.agent && <div className="agent-tag" style={{backgroundColor: getAgentColor(msg.agent.id)}}>{msg.agent.name}</div>}
      {messageContent}
    </div>
  );
};

const getAgentColor = (agentId: number) => {
  const hue = agentId * 137.508; // Use golden angle approximation
  return `hsl(${hue % 360}, 50%, 75%)`;
};

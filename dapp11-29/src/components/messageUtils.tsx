import { downloadFile } from '../services/api';
import { Message } from './ChatContext';
import { parseMarkdown } from './markdownUtils';
import JSZip from 'jszip';

const handleDownload = async (filename: any) => {
  // try {
  //   const response = await downloadFile(filename.files[0].name);
  //   const url = window.URL.createObjectURL(new Blob([response.data]));
  //   const link = document.createElement('a');
  //   link.href = url;
  //   link.setAttribute('download', filename.files[0].name);
  //   document.body.appendChild(link);
  //   link.click();
  //   link.remove();
  // } catch (error) {
  //   console.error('Download failed:', error);
  // }
  if (filename.files.length === 1) {
    // 单文件下载
    try {
      const response = await downloadFile(filename.files[0].name);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename.files[0].name);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download failed:', error);
    }
  } else {
    // 多文件下载
    try {
      const zip = new JSZip();
      for (const file of filename.files) {
        const response = await downloadFile(file.name);
        zip.file(file.name, response.data);
      }
      const content = await zip.generateAsync({type: "blob"});
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'code_files.zip');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download failed:', error);
    }
  }

};

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
        dangerouslySetInnerHTML={{ __html: await parseMarkdown(content)}} 
      />
    );

  return (
    <div key={index} className={`message ${sender}`}>
      {msg.agent && <div className="agent-tag" style={{backgroundColor: getAgentColor(msg.agent.id)}}>{msg.agent.name}</div>}
      {msg.files?.length ? (
        <a onClick={() => handleDownload(msg)} className="download-btn">
          Download Code
        </a >
      ):""}
      {messageContent}
    </div>
  );
};

const getAgentColor = (agentId: number) => {
  const hue = agentId * 137.508; // Use golden angle approximation
  return `hsl(${hue % 360}, 50%, 75%)`;
};

import { downloadFile } from '../services/api';
import { Message } from './ChatContext';
import { parseMarkdown } from './markdownUtils';
import JSZip from 'jszip';
import MarkdownRenderer from './MarkdownRenderer';
import PriceChart from './PriceChart';
import MarketAnalysisRenderer from './MarketAnalysisRenderer';

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
  
  // Handle MCP responses - check if content is JSON object
  if (typeof content === 'object' && content !== null) {
    try {
      console.log('[MCP Debug] Processing object content:', content);
      console.log('[MCP Debug] Content type:', typeof content);
      console.log('[MCP Debug] Content keys:', Object.keys(content as any));
      
      // Check if it's a market analysis response - comprehensive detection
      const hasMarketAnalysis = (content as any).marketAnalysis && typeof (content as any).marketAnalysis === 'object';
      const hasMarketSource = (content as any).source === 'Market Analysis';
      const hasTokenSymbol = (content as any).tokenSymbol;
      const hasPrice = typeof (content as any).price === 'number';
      
      // Force detection for any object with marketAnalysis field
      const isMarketAnalysis = hasMarketAnalysis;
      
      console.log('[MCP Debug] Market analysis checks:', {
        hasMarketAnalysis,
        hasMarketSource, 
        hasTokenSymbol,
        hasPrice,
        isMarketAnalysis,
        sourceValue: (content as any).source,
        priceValue: (content as any).price,
        tokenSymbolValue: (content as any).tokenSymbol,
        marketAnalysisType: typeof (content as any).marketAnalysis
      });
      
      if (isMarketAnalysis) {
        console.log('[MCP Debug] Market analysis detected, rendering...');
        // Determine the correct data structure
        let analysisData = content;
        if ((content as any).success && (content as any).data?.operation === 'market_analysis') {
          analysisData = (content as any).data;
        } else if ((content as any).data?.operation === 'market_analysis') {
          analysisData = (content as any).data;
        } else if ((content as any).source === 'Market Analysis' && (content as any).marketAnalysis) {
          // Current data structure: { source: 'Market Analysis', marketAnalysis: {...}, price: ... }
          analysisData = content;
        }
        
        return (
          <div key={index} className={`message ${sender}`} style={{ maxWidth: '95%', width: '95%' }}>
            {msg.agent && <div className="agent-tag" style={{backgroundColor: getAgentColor(msg.agent.id)}}>{msg.agent.name}</div>}
            <MarketAnalysisRenderer data={analysisData as any} />
          </div>
        );
      }
      // Check if it's a price chart response
      else if ((content as any).type === 'priceChart') {
        return (
          <div key={index} className={`message ${sender}`} style={{ maxWidth: '95%', width: '95%' }}>
            {msg.agent && <div className="agent-tag" style={{backgroundColor: getAgentColor(msg.agent.id)}}>{msg.agent.name}</div>}
            <PriceChart data={content as any} />
          </div>
        );
      }
      // Check if it's a parsed JSON object with formattedMessage
      else if ((content as any).formattedMessage) {
        content = (content as any).formattedMessage;
      } else {
        // Fallback to stringified JSON if no special handling
        content = JSON.stringify(content, null, 2);
      }
    } catch (error) {
      console.error('Error handling MCP response:', error);
      content = JSON.stringify(content, null, 2);
    }
  }
  
  // Handle string content that might be JSON
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        console.log('[MCP Debug] Parsed JSON object:', parsed);
        console.log('[MCP Debug] Parsed object keys:', Object.keys(parsed));
        
        // Check if it's a market analysis response - same logic as object detection
        const hasMarketAnalysis = parsed.marketAnalysis && typeof parsed.marketAnalysis === 'object';
        const hasMarketSource = parsed.source === 'Market Analysis';
        const isMarketAnalysis = hasMarketAnalysis;
        
        console.log('[MCP Debug] Parsed market analysis checks:', {
          hasMarketAnalysis,
          hasMarketSource,
          isMarketAnalysis,
          sourceValue: parsed.source,
          marketAnalysisType: typeof parsed.marketAnalysis
        });
        
        if (isMarketAnalysis) {
          console.log('[MCP Debug] Parsed market analysis detected, rendering...');
          return (
            <div key={index} className={`message ${sender}`} style={{ maxWidth: '95%', width: '95%' }}>
              {msg.agent && <div className="agent-tag" style={{backgroundColor: getAgentColor(msg.agent.id)}}>{msg.agent.name}</div>}
              <MarketAnalysisRenderer data={parsed} />
            </div>
          );
        }
        // Check if it's a price chart response
        else if (parsed.type === 'priceChart') {
          return (
            <div key={index} className={`message ${sender}`} style={{ maxWidth: '95%', width: '95%' }}>
              {msg.agent && <div className="agent-tag" style={{backgroundColor: getAgentColor(msg.agent.id)}}>{msg.agent.name}</div>}
              <PriceChart data={parsed} />
            </div>
          );
        }
        // Check for formattedMessage
        else if (parsed.formattedMessage) {
          content = parsed.formattedMessage;
        }
      }
    } catch (error) {
      // Not JSON, proceed with string content
    }
    
    // Handle @mentions
    const mentionRegex = /@(\w+)/g;
    content = content.replace(mentionRegex, '**@$1**');
  }

  const messageContent = sender === 'user'
    ? <p>{content}</p>
    : (
      <div className="markdown-content">
        {content.includes('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━') ? (
          // MCP formatted message - render as pure text to preserve ASCII charts
          <pre style={{ 
            whiteSpace: 'pre-wrap',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            lineHeight: '1.4',
            margin: 0,
            fontSize: '14px',
            color: 'inherit',
            background: 'transparent'
          }}>
            {content}
          </pre>
        ) : (
          // Regular markdown content
          <MarkdownRenderer content={content} />
        )}
      </div>
    );

  return (
    <div key={index} className={`message ${sender}`}>
      {msg.agent && <div className="agent-tag" style={{backgroundColor: getAgentColor(msg.agent.id)}}>{msg.agent.name}</div>}
      {/* 📎 修改：仅对代码文件显示下载按钮，不对图片显示 */}
      {msg.files?.length && msg.files.some(f => f.language || f.path) ? (
        <a onClick={() => handleDownload(msg)} className="download-btn">
          Download Code
        </a >
      ):""}
      {messageContent}

      {/* 📎 新增：显示图片附件 */}
      {msg.files && msg.files.length > 0 && msg.files.some(f => f.type === 'image' || (f.data && f.data?.startsWith('data:image'))) && (
        <div style={{
          marginTop: '12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          {msg.files
            .filter(file => file.type === 'image' || (file.data && file.data?.startsWith('data:image')))
            .map((file, idx) => (
              <div key={idx}>
                <div style={{
                  position: 'relative',
                  display: 'inline-block'
                }}>
                  <img
                    src={file.data}
                    alt={file.name}
                    style={{
                      maxWidth: '400px',
                      maxHeight: '300px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: '1px solid #e8e8e8'
                    }}
                    onClick={() => {
                      const modal = document.createElement('div');
                      modal.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        background: rgba(0,0,0,0.9);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10000;
                        cursor: pointer;
                      `;
                      const img = document.createElement('img');
                      img.src = file.data || '';
                      img.style.cssText = 'max-width: 90%; max-height: 90%; border-radius: 8px;';
                      modal.appendChild(img);
                      modal.onclick = () => document.body.removeChild(modal);
                      document.body.appendChild(modal);
                    }}
                  />
                  <div style={{
                    fontSize: '12px',
                    color: '#999',
                    marginTop: '4px',
                    textAlign: 'center'
                  }}>
                    {file.name}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

const getAgentColor = (agentId: number) => {
  const hue = agentId * 137.508; // Use golden angle approximation
  return `hsl(${hue % 360}, 50%, 75%)`;
};

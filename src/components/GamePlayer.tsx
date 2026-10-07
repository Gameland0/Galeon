import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Tag, Spin, message } from 'antd';
import { PlayCircleOutlined, CloseOutlined } from '@ant-design/icons';
import GameTypeDetector from '../utils/GameTypeDetector';

interface GameFile {
  name: string;
  content: string;
  type?: string;
}

interface GamePlayerProps {
  visible: boolean;
  onClose: () => void;
  gameFiles: GameFile[];
  gameId?: string;
  gameTitle?: string;
  gameType?: string;
  isVsGame?: boolean;
  onGameEnd?: (score: number) => void;
}

const GamePlayer: React.FC<GamePlayerProps> = ({
  visible,
  onClose,
  gameFiles,
  gameId,
  gameTitle = 'Game',
  gameType = 'game',
  isVsGame = false,
  onGameEnd
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [currentScore, setCurrentScore] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [gameContent, setGameContent] = useState('');

  // 构建游戏HTML内容
  const buildGameContent = () => {
    if (!gameFiles || gameFiles.length === 0) {
      console.warn('🔧 No files found for game');
      return '<html><body><h1>No game content available</h1></body></html>';
    }

    // 查找各类型文件
    const htmlFile = gameFiles.find((f: GameFile) => 
      f.name === 'game.html' || f.name.endsWith('.html')
    );
    const jsFile = gameFiles.find((f: GameFile) => 
      f.name === 'game.js' || f.name.endsWith('.js')
    );
    const cssFile = gameFiles.find((f: GameFile) => 
      f.name === 'game.css' || f.name.endsWith('.css')
    );

    // 如果HTML文件包含完整内容（包括script标签），直接使用
    if (htmlFile?.content && htmlFile.content.includes('<script')) {
      console.log('🎮 使用完整的HTML文件（包含AI模块）');
      
      let htmlContent = htmlFile.content;
      
      // 确保包含GAME_END通信
      if (!htmlContent.includes('window.parent.postMessage') || !htmlContent.includes('GAME_END')) {
        htmlContent = htmlContent.replace(
          /<script[^>]*>/i,
          `<script>
            // 🔧 确保GAME_END通信正常工作
            window.sendGameEndMessage = function(score){
              try {
                var sc = (typeof score === 'number' ? score : (parseInt(score) || 0));
                window.parent.postMessage({ type: 'GAME_END', score: sc }, '*');
              } catch (e) {
                console.warn('sendGameEndMessage failed:', e);
              }
            };
          </script>
          <script>`
        );
      }
      
      return htmlContent;
    }

    // 否则组装HTML内容
    let pureBodyContent = '';
    if (htmlFile?.content) {
      const bodyMatch = htmlFile.content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        pureBodyContent = bodyMatch[1].trim();
      }
    }
    
    let pureGameJS = '';
    if (jsFile?.content) {
      pureGameJS = jsFile.content.trim();
    }
    
    const assembledHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${gameTitle}</title>
          <style>
            body { 
              margin: 0; 
              padding: 20px; 
              font-family: Arial, sans-serif; 
              background: #f0f0f0; 
            }
            ${cssFile?.content || ''}
          </style>
        </head>
        <body>
          ${pureBodyContent || `
            <div id="gameContainer">
              <h1>${gameTitle}</h1>
              <div id="score">Score: 0</div>
              <canvas id="gameCanvas" width="300" height="600"></canvas>
              <button id="startButton">Start Game</button>
            </div>
          `}
          
          <script>
            // 🔧 游戏结束消息发送
            window.sendGameEndMessage = function(score){
              try {
                var sc = (typeof score === 'number' ? score : (parseInt(score) || 0));
                window.parent.postMessage({ type: 'GAME_END', score: sc }, '*');
              } catch (e) {
                console.warn('sendGameEndMessage failed:', e);
              }
            };
            
            // 🔧 游戏代码
            ${pureGameJS}
          </script>
        </body>
      </html>
    `;
    
    return assembledHtml;
  };

  // 🎮 处理AI请求
  const handleAIRequest = async (data: any) => {
    setAiThinking(true);
    
    try {
      console.log('🎮 GamePlayer: 发送AI请求到后端...');
      
      // 智能检测游戏类型
      let detectedGameType = data.gameType;
      if (!detectedGameType && data.boardState) {
        const boardSize = Array.isArray(data.boardState) ? data.boardState.length : 0;
        if (boardSize === 3) detectedGameType = 'tictactoe';
        else if (boardSize === 15) detectedGameType = 'gomoku';
        else if (boardSize === 8) detectedGameType = 'reversi';
      }
      
      // 准备请求数据
      const requestBody = {
        gameType: detectedGameType || gameType,
        boardState: data.boardState,
        gameContext: data.gameContext,
        availableMoves: data.availableMoves,
        currentPlayer: data.currentPlayer || 'O',
        moveFormat: data.moveFormat,
        boardStructure: data.boardStructure,
        gameHistory: data.gameHistory || [],
        aiSymbol: data.aiSymbol || 'O',
        playerSymbol: data.playerSymbol || 'X'
      };
      
      // 调用后端AI接口
      const response = await fetch('/api/game/ai/vs-move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`AI请求失败: ${response.status}`);
      }
      
      const aiResponse = await response.json();
      
      if (aiResponse && aiResponse.success) {
        console.log('🎮 AI响应成功:', aiResponse);
        
        // 发送AI响应回游戏
        if (iframeRef.current?.contentWindow) {
          // 主要响应消息
          const responseMessage = {
            type: 'AI_MOVE_RESPONSE',
            requestId: data.requestId,
            ...aiResponse
          };
          
          iframeRef.current.contentWindow.postMessage(responseMessage, '*');
          console.log('🎮 已发送AI响应到游戏');
          
          // 🔥 强化AI下棋显示通知（多种格式）
          setTimeout(() => {
            const messages = [
              {
                type: 'FORCE_AI_MOVE_DISPLAY',
                move: aiResponse.move,
                player: data.aiSymbol || 'O',
                position: aiResponse.move,
                timestamp: Date.now()
              },
              {
                type: 'AI_MOVE_CONFIRMED', 
                move: aiResponse.move,
                player: data.aiSymbol || 'O'
              },
              {
                type: 'UPDATE_GAME_STATE',
                action: 'place_piece',
                position: aiResponse.move,
                player: data.aiSymbol || 'O'
              },
              {
                type: 'GAME_UPDATE',
                move: aiResponse.move,
                player: data.aiSymbol || 'O'
              }
            ];
            
            messages.forEach((msg, index) => {
              setTimeout(() => {
                try {
                  iframeRef.current?.contentWindow?.postMessage(msg, '*');
                  console.log(`🎮 发送强化消息 ${index + 1}:`, msg.type);
                } catch (e) {
                  console.warn(`🔥 消息 ${index + 1} 发送失败:`, e);
                }
              }, index * 50); // 逐次发送，间隔50ms
            });
          }, 100); // 100ms延迟确保原消息先处理
          
          // 额外的重试机制
          setTimeout(() => {
            if (iframeRef.current?.contentWindow) {
              // 再次发送确认消息
              iframeRef.current.contentWindow.postMessage({
                type: 'AI_MOVE_CONFIRMED',
                move: aiResponse.move,
                player: data.aiSymbol || 'O'
              }, '*');
            }
          }, 500);
        }
      } else {
        console.error('🎮 AI响应失败:', aiResponse?.message);
      }
    } catch (error) {
      console.error('🎮 AI请求错误:', error);
      message.error('AI服务暂时不可用');
    } finally {
      setAiThinking(false);
    }
  };

  // 消息监听器
  useEffect(() => {
    const handleGameMessage = (event: MessageEvent) => {
      // 只处理来自iframe的消息
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }
      
      // 处理游戏结束消息
      if (event.data?.type === 'GAME_END') {
        const score = typeof event.data.score === 'number' ? event.data.score : 0;
        console.log('🎮 游戏结束，分数:', score);
        setCurrentScore(score);
        if (onGameEnd) {
          onGameEnd(score);
        }
      }
      
      // 处理AI对战请求
      if (event.data?.type === 'AI_MOVE_REQUEST' || event.data?.type === 'AI_REQUEST') {
        console.log('🎮 GamePlayer收到AI请求:', event.data);
        if (event.data.gameType || event.data.boardState) {
          handleAIRequest(event.data);
        }
      }
    };

    window.addEventListener('message', handleGameMessage);
    return () => window.removeEventListener('message', handleGameMessage);
  }, []);

  // 组件加载时构建游戏内容
  useEffect(() => {
    if (visible && gameFiles && gameFiles.length > 0) {
      const content = buildGameContent();
      setGameContent(content);
      console.log('🎮 GamePlayer: 游戏内容已构建');
    }
  }, [visible, gameFiles]);

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <PlayCircleOutlined />
          <span>{gameTitle}</span>
          {isVsGame && (
            <Tag color="purple">AI对战</Tag>
          )}
          {aiThinking && (
            <Tag color="orange">
              🤖 AI思考中...
            </Tag>
          )}
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose} icon={<CloseOutlined />}>
          关闭
        </Button>
      ]}
      width={1000}
      destroyOnClose
      className="game-player-modal"
    >
      <div className="game-iframe-container">
        {aiThinking && (
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '5px 10px',
            borderRadius: '5px',
            zIndex: 10
          }}>
            <Spin size="small" style={{ marginRight: '8px' }} />
            AI思考中...
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          srcDoc={gameContent}
          sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
          className="game-iframe"
          title="Game Player"
          width="100%"
          height="600"
          style={{ border: 'none', borderRadius: '4px' }}
          onLoad={() => {
            setIframeLoaded(true);
            console.log('🎮 GamePlayer iframe加载完成');
            if (iframeRef.current?.contentWindow) {
              console.log('🎮 iframe contentWindow可用');
            }
          }}
        />
        
        {currentScore > 0 && (
          <div style={{
            marginTop: '10px',
            padding: '10px',
            background: '#f0f0f0',
            borderRadius: '4px',
            textAlign: 'center'
          }}>
            当前分数: {currentScore}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default GamePlayer;
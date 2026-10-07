import React, { useContext, useEffect, useRef, useState } from 'react';
import { downloadFile, saveGameMetadata, GameMetadata, saveGameSourceCode, saveGameFiles, saveGameSourceMetadata } from '../services/api';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { ChatContext } from './ChatContext';
import { Alert, Button, Card, Form, Input, InputNumber, message, Modal, Select, Space, Tag, Upload } from 'antd';
import { gameService } from '../services/gameService';
import { UploadOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { Web3Context } from '../contexts/Web3Context';
import GameTypeDetector from '../utils/GameTypeDetector';
// import { assembleGameHtml } from '../services/api'; // 🔧 No longer using backend assembly

const GAME_EVENTS = {
  START: 'gameStart',
  END: 'gameEnd',
  SCORE_UPDATE: 'scoreUpdate'
};

interface GamePreviewProps {
  msg: {
    content: string;
    blockchainFeatures: any;
    gameType: any;
    files: {
      name: string;
      path: string;
      content: string;
    }[];
    gameFileUrl?: string; // 🔧 New: Game preview file URL
    isVsGame?: boolean; // 🎮 New: AI battle game identifier
  };
}

const GamePreview = ({ msg }: GamePreviewProps) => {
  const { getCurrentAccount, isAuthenticated, getCurrentWalletType, getWeb3Instance, getSolanaConnection } = useContext(MultiWalletContext);
  const { gameCode, setDeployModalVisible, addContract, setGameCode } = useContext(ChatContext);
  const [currentScore, setCurrentScore] = useState(0);
  const [isGameEnded, setIsGameEnded] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isPublishModalVisible, setIsPublishModalVisible] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [form] = Form.useForm();
  const iframeRef = useRef(null as HTMLIFrameElement | null);
  const gameEndMessageCountRef = useRef(0);
  const [assembledHtml, setAssembledHtml] = useState<string>('');

  // 🐛 New: Debug state
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // 🎮 New: AI battle related state
  const [aiThinking, setAiThinking] = useState(false);
  const [aiMove, setAiMove] = useState<any>(null);

  const currentAccount = getCurrentAccount();
  const walletType = getCurrentWalletType();



  const findcontract = () => {
    // Check if gameCode and files exist
    if (!gameCode || !gameCode.files || !Array.isArray(gameCode.files)) {
      return false;
    }
    
    // 🔧 Fix: More lenient contract file checking (supports more formats)
    const contractFile = gameCode.files.find((f: any) => {
      // Standard check
      if (f.language === 'solidity' || f.language === 'rust' ||
      f.name?.toLowerCase().includes('.sol') ||
      f.name?.toLowerCase().includes('.rs') ||
          f.type === 'contract' ||
          f.type === 'solana-anchor' ||
          f.type === 'solidity') {
        return true;
      }
      
      // Additional check: files containing contract keywords
      const fileName = (f.name || '').toLowerCase();
      const fileContent = (f.content || '').toLowerCase();
      
      // Determine by filename
      if (fileName.includes('contract') || (fileName.includes('game') && fileName.includes('.sol'))) {
        return true;
      }
  
      // Determine by file content (Solidity keywords)
      if (fileContent.includes('pragma solidity') || 
          fileContent.includes('contract ') ||
          fileContent.includes('interface ')) {
        return true;
      }
      
      // Determine by file content (Rust keywords)
      if (fileContent.includes('use anchor_') ||
          fileContent.includes('#[program]') ||
          fileContent.includes('pub mod ')) {
        return true;
      }
      
      return false;
    });
    
    if (!contractFile) {
      return false;
    }
    
    // Found contract file
    return true;
  }
  
  useEffect(() => {
    let lastGameEndTime = 0;
    
    const handleGameMessage = (event: MessageEvent) => {
      try {
        const t = String(event.data?.type || '').toUpperCase();
        if (t === 'GAME_END') {
          const now = Date.now();
          
          // Simplified debounce: process game end message only once within 500ms
          if (now - lastGameEndTime < 500) {
            return;
          }
          
          lastGameEndTime = now;
          
          const scoreNum = Number(event.data?.score);
          const normalized = Number.isFinite(scoreNum) ? scoreNum : 0;
          setCurrentScore(normalized);
          setIsGameEnded(true);
        }
        
        // 🔥 New: Handle AI move display confirmation
        if (event.data?.type === 'AI_MOVE_DISPLAYED' || event.data?.type === 'MOVE_CONFIRMED') {
          // Can update UI state here, show AI has acted, etc.
        }
        
        // 🔥 New: Handle game state update notification
        if (event.data?.type === 'GAME_STATE_UPDATED') {
          // Can handle game state changes here, such as display confirmation after AI moves
        }
        
        // 🎮 Handle AI battle requests - supports new hybrid AI system
        if (event.data?.type === 'AI_MOVE_REQUEST' || event.data?.type === 'AI_REQUEST') {
          // 🔧 Fix: More lenient judgment condition - handle any AI request
          if (event.data.gameType || event.data.boardState) {
            handleAIRequest(event.data);
          } else {
            console.warn('🎮 Received AI request but missing required parameters');
            
            // Show debug information
            const debugDiv = document.createElement('div');
            debugDiv.style.cssText = `
              position: fixed; top: 10px; left: 50%;
              transform: translateX(-50%);
              background: rgba(255,165,0,0.9); color: black;
              padding: 10px 20px; border-radius: 5px; z-index: 2000;
              font-size: 12px; max-width: 400px;
            `;
            debugDiv.innerHTML = `
              <div>🎮 AI Request Debug Info</div>
              <div>Message Type: ${event.data.type}</div>
              <div>gameType: ${event.data.gameType || 'undefined'}</div>
              <div>requestType: ${event.data.requestType || 'undefined'}</div>
              <div>boardState: ${event.data.boardState ? 'present' : 'missing'}</div>
            `;
            document.body.appendChild(debugDiv);
            
            setTimeout(() => debugDiv.remove(), 5000);
          }
        }
      } catch (error) {
        console.warn('Error handling game message:', error);
      }
    };

    window.addEventListener('message', handleGameMessage);

    return () => {
      window.removeEventListener('message', handleGameMessage);
    };
  }, []);

  // 🚨 New: AI move intelligent correction function
  const findBestAlternativeMove = (boardState: any, originalMove: {row: number, col: number}, boardSize: number) => {
    const { row, col } = originalMove;
    
    // Prioritize checking empty positions around the original position
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    
    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      
      if (newRow >= 0 && newRow < boardSize && newCol >= 0 && newCol < boardSize) {
        let isEmpty = false;
        
        if (Array.isArray(boardState) && Array.isArray(boardState[0])) {
          // 2D array format
          isEmpty = !boardState[newRow] || !boardState[newRow][newCol];
        } else if (Array.isArray(boardState)) {
          // 1D array format
          const index = newRow * boardSize + newCol;
          isEmpty = !boardState[index];
        }
        
        if (isEmpty) {
          return { row: newRow, col: newCol };
        }
      }
    }
    
    // If all surrounding positions are occupied, find any empty position on the board
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        let isEmpty = false;
        
        if (Array.isArray(boardState) && Array.isArray(boardState[0])) {
          isEmpty = !boardState[r] || !boardState[r][c];
        } else if (Array.isArray(boardState)) {
          const index = r * boardSize + c;
          isEmpty = !boardState[index];
        }
        
        if (isEmpty) {
          return { row: r, col: c };
        }
      }
    }
    
    return null; // Board is full
  };

  // 🚨 New: Gomoku-specific move validation and correction
  const validateAndCorrectGomokuMove = (boardState: any, move: {row: number, col: number}, boardSize: number) => {
    const { row, col } = move;
    
    // Detect player threats (assuming player is 'X', AI is 'O')
    const threats = findThreats(boardState, 'X', boardSize);
    
    if (threats.length > 0) {
      // Threats exist, find the best blocking position
      for (const threat of threats) {
        const blockPositions = getBlockingPositions(threat);
        for (const blockPos of blockPositions) {
          if (isValidPosition(boardState, blockPos, boardSize)) {
            return blockPos;
          }
        }
      }
    }
    
    // If current position is valid and there's no better blocking choice, keep original move
    if (isValidPosition(boardState, move, boardSize)) {
      return move;
    }
    
    // Otherwise find the best position
    return findBestStrategicMove(boardState, boardSize);
  };

  // Helper function: Detect threats
  const findThreats = (boardState: any, player: string, boardSize: number) => {
    const threats = [];
    const directions = [[0,1], [1,0], [1,1], [1,-1]]; // Horizontal, vertical, diagonal
    
    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        for (const [dr, dc] of directions) {
          const line = [];
          for (let i = 0; i < 5; i++) {
            const r = row + i * dr;
            const c = col + i * dc;
            if (r >= 0 && r < boardSize && c >= 0 && c < boardSize) {
              const cell = getCellValue(boardState, r, c);
              line.push({row: r, col: c, value: cell});
            }
          }
          
          if (line.length === 5) {
            const playerCount = line.filter(cell => cell.value === player).length;
            const emptyCount = line.filter(cell => !cell.value).length;
            
            // Detect 4-in-a-row or 3-in-a-row+1-empty threats
            if (playerCount >= 3 && emptyCount >= 1) {
              threats.push({
                line: line,
                direction: [dr, dc],
                playerCount: playerCount,
                emptyPositions: line.filter(cell => !cell.value)
              });
            }
          }
        }
      }
    }
    
    return threats;
  };

  // Helper function: Get blocking positions
  const getBlockingPositions = (threat: any) => {
    return threat.emptyPositions.map((pos: any) => ({row: pos.row, col: pos.col}));
  };

  // Helper function: Check if position is valid
  const isValidPosition = (boardState: any, pos: {row: number, col: number}, boardSize: number) => {
    const { row, col } = pos;
    if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) {
      return false;
    }
    
    const cellValue = getCellValue(boardState, row, col);
    return !cellValue; // Empty position is valid
  };

  // Helper function: Get board cell value
  const getCellValue = (boardState: any, row: number, col: number) => {
    if (Array.isArray(boardState) && Array.isArray(boardState[0])) {
      return boardState[row] && boardState[row][col];
    } else if (Array.isArray(boardState)) {
      const boardSize = Math.sqrt(boardState.length);
      const index = row * boardSize + col;
      return boardState[index];
    }
    return null;
  };

  // Helper function: Find best strategic position
  const findBestStrategicMove = (boardState: any, boardSize: number) => {
    // Simple strategy: choose empty positions near the center
    const center = Math.floor(boardSize / 2);
    const candidates = [
      {row: center, col: center},
      {row: center-1, col: center},
      {row: center+1, col: center},
      {row: center, col: center-1},
      {row: center, col: center+1}
    ];
    
    for (const candidate of candidates) {
      if (isValidPosition(boardState, candidate, boardSize)) {
        return candidate;
      }
    }
    
    // If center area is all occupied, return any empty position
    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        const pos = {row, col};
        if (isValidPosition(boardState, pos, boardSize)) {
          return pos;
        }
      }
    }
    
    return null;
  };


  // 🤖 Show AI analysis results
  const showAIAnalysis = (analysis: string, move: any, score?: number) => {
    
    // Can add UI display logic here
    // For example, display in debug panel or popup tips
    try {
      const debugInfo = document.querySelector('.debug-info') as HTMLElement;
      if (debugInfo) {
        const analysisHtml = `
          <div style="background: #e3f2fd; padding: 10px; margin: 5px 0; border-radius: 4px;">
            <div style="font-weight: bold; color: #1976d2;">🤖 AI Analysis</div>
            <div style="margin: 5px 0;"><strong>Move:</strong> ${JSON.stringify(move)}</div>
            ${score !== undefined ? `<div style="margin: 5px 0;"><strong>Score:</strong> ${score}</div>` : ''}
            <div style="margin: 5px 0; font-style: italic;">${analysis}</div>
          </div>
        `;
        debugInfo.innerHTML = analysisHtml + debugInfo.innerHTML;
      }
    } catch (error) {
      console.warn('🤖 Failed to display analysis results:', error);
    }
  };
  
  // 🎮 New: Handle AI battle requests
  const handleAIRequest = async (data: any) => {
    // 🤖 Handle AI analysis requests
    if (data.type === 'AI_ANALYSIS_REQUEST' || data.requestType === 'analysis') {
      
      try {
        const response = await fetch('/api/game/ai/analyze-move', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            boardState: data.boardState,
            chosenMove: data.chosenMove,
            score: data.score,
            gameType: data.gameType,
            requestType: 'analysis'
          })
        });
        
        if (response.ok) {
          const analysisResult = await response.json();
          if (analysisResult.success) {
            showAIAnalysis(analysisResult.analysis, data.chosenMove, data.score);
          }
        }
      } catch (error) {
        console.warn('🤖 AI analysis request failed:', error);
      }
      
      return;
    }
    
    // 🎯 Solution A: Directly call backend API, backend handles local strategy internally
    
    // 🔥 Handle format (compatible with new and old formats)
    let boardState, availableMoves, moveFormat;
    // 🎮 Extract game basic information
    const gameType = data.gameType;
    const gameContext = data.gameContext;
    const boardStructure = data.boardStructure;
    
    if (data.payload) {
      // New format: contains threat detection results (but prioritize just calculated threats)
      boardState = data.payload.board;
      availableMoves = data.payload.candidates;
    } else {
      // Old format: directly pass board (using local strategy calculated results)
      boardState = data.boardState || [];
      availableMoves = data.availableMoves;
      moveFormat = data.moveFormat;
    }
    
    // 🔧 Intelligent board information analysis
    
    // 🔥 Correctly calculate board size
    let totalCells, boardSize, detectedGameType, detectionInfo;
    
    if (Array.isArray(boardState) && Array.isArray(boardState[0])) {
      // 2D array format
      totalCells = boardState.length * boardState[0].length;
      boardSize = boardState.length; // Assume square board
    } else {
      // 1D array format  
      totalCells = boardState.length;
      boardSize = Math.sqrt(totalCells);
    }
    
    // 🎮 Use intelligent game type detector
    const detectionResult = GameTypeDetector.detect({
      gameType: gameType,
      gameContext: gameContext,
      boardState: boardState,
      availableMoves: availableMoves,
      boardStructure: boardStructure
    });
    
    // Handle detection results
    if (detectionResult.confidence === 'error') {
      // Error configuration: show error message and try to correct
      console.error('🚨 Game configuration error:', detectionResult.error);
      
      if (detectionResult.correctedType) {
        detectedGameType = detectionResult.correctedType;
        detectionInfo = detectionResult;
      } else {
        // Cannot correct, use simple detection
        detectedGameType = totalCells === 9 ? 'tictactoe' : 
                          totalCells === 225 ? 'gomoku' : 'unknown';
      }
    } else {
      detectedGameType = detectionResult.type;
      detectionInfo = detectionResult;
    }
    
    // Show AI thinking state
    setAiThinking(true);
    
    // Show debug information on page
    const debugInfo = document.createElement('div');
    debugInfo.id = 'ai-debug-info';
    debugInfo.style.cssText = `
      position: fixed; top: 50px; right: 10px; 
      background: rgba(0,0,0,0.8); color: white; 
      padding: 10px; border-radius: 5px; z-index: 2000;
      max-width: 300px; font-size: 12px;
    `;
    debugInfo.innerHTML = `
      <div>🎮 AI Battle Debug Info</div>
      <div>Game Type: ${data.gameType}</div>
      <div>Request Time: ${new Date().toLocaleTimeString()}</div>
      <div>Status: Sending request...</div>
    `;
    document.body.appendChild(debugInfo);
    
    try {
      // 🔥 将棋盘状态转换为精简的占用位置格式
      const occupiedPositions = [];
      let lastMove = null;
      
      if (boardState && Array.isArray(boardState)) {
        for (let row = 0; row < boardState.length; row++) {
          if (Array.isArray(boardState[row])) {
            for (let col = 0; col < boardState[row].length; col++) {
              const piece = boardState[row][col];
              if (piece && piece !== '') {
                const position = { row, col, piece };
                occupiedPositions.push(position);
                // 假设最后一个非空位置是最后一步（可以根据gameHistory改进）
                lastMove = position;
              }
            }
          }
        }
      }
      
      
      // 🔥 智能判断：如果棋子较少，使用精简格式；否则使用传统格式
      const useOptimizedFormat = occupiedPositions.length <= 50; // Threshold is adjustable
      
      const requestBody = useOptimizedFormat ? {
        // 🎯 Optimized format: compact request - completely remove boardState
        gameType: detectedGameType,  // 🔧 Use detected game type
        occupiedPositions: occupiedPositions,
        lastMove: lastMove,
        boardSize: boardSize || 15,
        // 🔥 Completely remove boardState, only use compact format
        gameContext: data.gameContext,
        difficulty: 'hard',
        aiLevel: 'expert',
        moveFormat: data.moveFormat,
        boardStructure: data.boardStructure,
        currentPlayer: data.currentPlayer || 'O',
        // 🎯 New: Pass symbol information
        aiSymbol: data.aiSymbol || 'O',
        playerSymbol: data.playerSymbol || 'X',
        players: data.players || { ai: 'O', human: 'X' },
        gameHistory: data.gameHistory || [],
        gameVariant: detectedGameType
      } : {
        // 🎯 Traditional format: complete board
        gameType: detectedGameType,  // 🔧 Use detected game type
        boardState: boardState,
        gameContext: data.gameContext,
        availableMoves: availableMoves || data.availableMoves,
        difficulty: 'hard',
        aiLevel: 'expert',
        moveFormat: data.moveFormat,
        boardStructure: data.boardStructure,
        currentPlayer: data.currentPlayer || 'O',
        // 🎯 New: Pass symbol information
        aiSymbol: data.aiSymbol || 'O',
        playerSymbol: data.playerSymbol || 'X',
        players: data.players || { ai: 'O', human: 'X' },
        gameHistory: data.gameHistory || [],
        gameVariant: detectedGameType
      };
      
      // 🎯 Solution A: One call, backend handles all logic internally
      
      let aiResponse;
      try {
        const response = await fetch('/api/game/ai/vs-move', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        aiResponse = await response.json();
      } catch (error) {
        console.error('🎮 AI request failed:', error);
        setAiThinking(false);
        message.error(`AI service connection failed: ${error.message}`);
        return;
      }
      
      // 🚨 Fix: Validate AI response object
      if (!aiResponse) {
        console.error('🚨 AI response is empty');
        const debugInfo = document.getElementById('ai-debug-info');
        if (debugInfo) {
          debugInfo.innerHTML = `
            <div>🎮 AI Battle Debug Info</div>
            <div>Status: ❌ AI response is empty</div>
            <div>Error: Server returned empty response</div>
          `;
        }
        message.error('AI service returned empty response');
        return;
      }
      
      // Update debug information
      const debugInfo = document.getElementById('ai-debug-info');
      
      if (aiResponse && aiResponse.success) {
        
        // 🚨 Fix: Validate AI response required fields (note 0 is a valid move)
        if (aiResponse.move === undefined || aiResponse.move === null) {
          console.error('🚨 AI response missing move field');
          if (debugInfo) {
            debugInfo.innerHTML = `
              <div>🎮 AI Battle Debug Info</div>
              <div>Status: ❌ AI response invalid</div>
              <div>Error: Missing move field</div>
            `;
          }
          return;
        }
        
        // 🚨 Key validation: Check AI move validity and intelligent correction
        if (typeof aiResponse.move === 'object' && aiResponse.move.row !== undefined && aiResponse.move.col !== undefined) {
          const { row, col } = aiResponse.move;
          
          // Validate if position is already occupied
          let isOccupied = false;
          let occupiedBy = '';
          
          if (Array.isArray(boardState) && Array.isArray(boardState[0])) {
            // 2D数组格式
            if (boardState[row] && boardState[row][col]) {
              isOccupied = true;
              occupiedBy = boardState[row][col];
            }
          } else if (Array.isArray(boardState)) {
            // 1D数组格式
            const index = row * boardSize + col;
            if (boardState[index]) {
              isOccupied = true;
              occupiedBy = boardState[index];
            }
          }
          
          // 🚨 New: AI move intelligent correction system
          let correctedMove = aiResponse.move;
          let wasCorrected = false;
          
          if (isOccupied) {
            console.warn('🚨 AI trying to place on occupied position, attempting intelligent correction...', {
              originalPosition: {row, col},
              occupiedBy: occupiedBy
            });
            
            // 寻找最佳替代位置
            correctedMove = findBestAlternativeMove(boardState, {row, col}, boardSize);
            if (correctedMove) {
              wasCorrected = true;
            } else {
              console.error('❌ Cannot find valid alternative position');
              if (debugInfo) {
                debugInfo.innerHTML = `
                  <div>🎮 AI Battle Debug Info</div>
                  <div>Status: ❌ AI move invalid and cannot be corrected!</div>
                  <div>Original Position: (${row}, ${col})</div>
                  <div>Occupied By: ${occupiedBy}</div>
                `;
              }
              return;
            }
          }
          
          // 🚨 新增：五子棋威胁阻挡验证和修正
          if (detectedGameType === 'gomoku') {
            const betterMove = validateAndCorrectGomokuMove(boardState, correctedMove, boardSize);
            if (betterMove && (betterMove.row !== correctedMove.row || betterMove.col !== correctedMove.col)) {
              correctedMove = betterMove;
              wasCorrected = true;
            }
          }
          
          // 🔄 重新启用修正更新，使用智能修正后的选择
          if (wasCorrected) {
          }
          
        }
        
        if (debugInfo) {
          debugInfo.innerHTML = `
            <div>🎮 AI Battle Debug Info</div>
            <div>Status: ✅ Response successful</div>
            <div>AI Move: ${JSON.stringify(aiResponse.move)}</div>
            <div>Confidence: ${aiResponse.confidence}</div>
          `;
        }
        
        setAiMove(aiResponse);
        
        // 🔒 发送AI走法回游戏 - 安全代理响应
        const sendAIResponse = () => {
          const message = {
            type: 'AI_MOVE_RESPONSE',
            requestId: data.requestId, // 🔒 匹配原始请求ID
            ...aiResponse  // 直接展开原始AI响应数据
          };
          
          
          // 🔧 增强的发送策略
          const attemptSend = (retryCount = 0) => {
            if (retryCount > 3) {
              console.error('🎮 Send failed, reached maximum retry attempts');
              return;
            }
            
            if (iframeRef.current?.contentWindow) {
              try {
                iframeRef.current.contentWindow.postMessage(message, '*');
                
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
                      } catch (e) {
                        console.warn(`🔥 消息 ${index + 1} 发送失败:`, e);
                      }
                    }, index * 50); // 逐次发送，间隔50ms
                  });
                }, 100); // 100ms延迟确保原消息先处理
                
                // 🔧 重置AI思考状态，避免连续触发
                setAiThinking(false);
                return;
              } catch (error) {
                console.warn('🎮 Send failed:', error);
              }
            }
            
            if (iframeRef.current) {
              const iframe = iframeRef.current;
              
              // 检查iframe是否完全加载
              const checkAndSend = () => {
                if (iframe.contentWindow && iframe.contentDocument?.readyState === 'complete') {
                  try {
                    iframe.contentWindow.postMessage(message, '*');
                    
                    // 🔥 延迟版本的多种显示通知
                    setTimeout(() => {
                      const messages = [
                        { type: 'FORCE_AI_MOVE_DISPLAY', move: aiResponse.move, player: data.aiSymbol || 'O' },
                        { type: 'AI_MOVE_CONFIRMED', move: aiResponse.move, player: data.aiSymbol || 'O' },
                        { type: 'UPDATE_GAME_STATE', action: 'place_piece', position: aiResponse.move, player: data.aiSymbol || 'O' }
                      ];
                      
                      messages.forEach((msg, index) => {
                        setTimeout(() => {
                          try {
                            iframe.contentWindow?.postMessage(msg, '*');
                          } catch (e) {
                            console.warn(`🔥 延迟消息 ${index + 1} 发送失败:`, e);
                          }
                        }, index * 30);
                      });
                    }, 150);
                    
                    // 🔧 重置AI思考状态，避免连续触发
                    setAiThinking(false);
                    return;
                  } catch (error) {
                    console.warn('🎮 Delayed send failed:', error);
                  }
                }
                
                // 如果还是不行，等待一段时间后重试
                if (retryCount < 3) {
                  setTimeout(() => attemptSend(retryCount + 1), 200 * (retryCount + 1));
                }
              };
              
              if (iframe.contentDocument?.readyState !== 'complete') {
                const handleLoad = () => {
                  iframe.removeEventListener('load', handleLoad);
                  checkAndSend();
                };
                iframe.addEventListener('load', handleLoad);
              } else {
                checkAndSend();
              }
            } else {
              console.error('🎮 Cannot access game iframe - iframe reference does not exist');
              console.error('🎮 Debug info:', {
                modal: isModalVisible,
                loaded: iframeLoaded,
                iframeRefCurrent: iframeRef.current,
                querySelector: document.querySelector('.game-iframe'),
                queryById: document.querySelector('#game-iframe')
              });
              
              // 🔧 重试机制：等待iframe初始化
              if (retryCount < 5) {
                setTimeout(() => attemptSend(retryCount + 1), 200);
              } else {
                console.error('🎮 iframe initialization timeout, giving up sending');
              }
            }
          };
          
          // 立即尝试发送
          attemptSend();
        };
        
        // 立即尝试发送，如果失败则延迟重试
        try {
          sendAIResponse();
        } catch (error) {
          console.warn('🎮 First send failed, retrying after 500ms:', error);
          setTimeout(() => {
            try {
              sendAIResponse();
            } catch (retryError) {
              console.error('🎮 Retry send also failed:', retryError);
            }
          }, 500);
        }
      } else {
        console.error('🎮 AI request failed:', aiResponse.message);
        // 🔧 失败时也要重置AI思考状态
        setAiThinking(false);
        
        if (debugInfo) {
          debugInfo.innerHTML = `
            <div>🎮 AI Battle Debug Info</div>
            <div>Status: ❌ Request failed</div>
            <div>Error: ${aiResponse.message}</div>
          `;
        }
        
        message.error('AI thinking failed, please retry');
      }
    } catch (error) {
      console.error('🎮 AI request error:', error);
      
      const debugInfo = document.getElementById('ai-debug-info');
      if (debugInfo) {
        debugInfo.innerHTML = `
          <div>🎮 AI Battle Debug Info</div>
          <div>Status: ❌ Network error</div>
          <div>Error: ${error.message}</div>
        `;
      }
      
      message.error('AI service temporarily unavailable');
    } finally {
      setAiThinking(false);
      
      // 5秒后移除调试信息
      setTimeout(() => {
        const debugInfo = document.getElementById('ai-debug-info');
        if (debugInfo) {
          debugInfo.remove();
        }
      }, 5000);
    }
  };

  const handleFileDownload = async (file: any) => {
    try {
        // 根据文件类型生成正确的内容
        let content = file.content;
        let mimeType = 'text/plain';
        
        if (file.name === 'game.html') {
          // 生成完整的HTML内容
          content = buildGameContent();
          mimeType = 'text/html';
        } else if (file.name === 'game.js') {
          // 清理JavaScript内容
          const cleanedJs = cleanJsContent(content);
          content = cleanedJs;
          mimeType = 'application/javascript';
        } else if (file.name === 'game.css') {
          // 清理CSS内容
          const cleanedCss = cleanCssContent(content);
          content = cleanedCss;
          mimeType = 'text/css';
        }
        
        // 如果内容为空，使用原始文件内容作为备用
        if (!content && file.content) {
          content = file.content;
        }
        
        // 最终检查：如果仍然没有内容，显示错误
        if (!content) {
          console.error('🔧 GamePreview: No content available for file:', file.name);
          message.error(`No content available for ${file.name}`);
          return;
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        
        message.success(`Downloaded ${file.name} (${content.length} bytes)`);
    } catch (error) {
      console.error('Download failed:', error);
      message.error(`Failed to download ${file.name}: ${error.message}`);
    }
  };

  // 简化的JS内容清理函数，仅用于文件下载
  const cleanJsContent = (content: string) => {
    if (!content) return '';
    
    let cleanedContent = content.trim();
    
    // 如果内容以HTML标签开始，尝试提取JavaScript
    if (cleanedContent.startsWith('<')) {
      const scriptMatch = cleanedContent.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (scriptMatch && scriptMatch[1].trim()) {
        cleanedContent = scriptMatch[1].trim();
      } else {
        return content; // 如果无法提取，返回原内容
      }
    }
    
    return cleanedContent;
  };



  // 简化的CSS内容清理函数，仅用于文件下载
  const cleanCssContent = (content: string) => {
    if (!content) return '';
    const trimmedContent = content.trim();
    if (trimmedContent.startsWith('<')) {
      const styleMatch = trimmedContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (styleMatch) {
        return styleMatch[1];
      }
      return content; // 如果无法提取，返回原内容
    }
    return content;
  };



  const buildGameContent = () => {
    // 🔧 修复：优先使用完整的HTML文件，保留所有script标签
    const files = msg.files || [];
    
    if (files.length === 0) {
      console.warn('🔧 No files found in msg.files');
      return '<html><body><h1>No game content available</h1></body></html>';
    }

    const htmlFile = files.find((f: any) => f.name === 'game.html' || f.name.endsWith('.html'));
    
    // 🔧 优先策略：如果HTML文件包含script标签，直接使用它（保留AI模块）
    if (htmlFile?.content && htmlFile.content.includes('<script')) {
      
      // 检查是否已经包含GAME_END通信
      let htmlContent = htmlFile.content;
      
      if (!htmlContent.includes('window.parent.postMessage') || !htmlContent.includes('GAME_END')) {
        
        // 在第一个script标签前添加通信代码
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

    // 🔧 备用策略：组装独立的HTML、JS、CSS文件
    const jsFile = files.find((f: any) => f.name === 'game.js' || f.name.endsWith('.js'));
    const cssFile = files.find((f: any) => f.name === 'game.css' || f.name.endsWith('.css'));

    // 从Agent的HTML中提取纯净的body内容
    let pureBodyContent = '';
    if (htmlFile?.content) {
      const bodyMatch = htmlFile.content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        let bodyContent = bodyMatch[1];
        // 🔧 保留script标签，不要移除
        bodyContent = bodyContent.trim();
        pureBodyContent = bodyContent;
      }
    }
    
    // 从JS文件中提取游戏逻辑
    let pureGameJS = '';
    if (jsFile?.content) {
      let jsContent = jsFile.content;
      
      // 移除自动初始化调用
      jsContent = jsContent.replace(/\s*initGame\(\);\s*\}\);?\s*$/, '});');
      jsContent = jsContent.replace(/\s*initGame\(\);\s*$/, '');
      jsContent = jsContent.replace(/\s*\/\/\s*Auto-start.*$/gm, '');
      
      pureGameJS = jsContent.trim();
    }
    
    // 构建HTML
    const assembledHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Game</title>
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
              <h1>Game</h1>
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

  const handleDeploy = () => {
    // 检查gameCode和files是否存在
    if (!gameCode || !gameCode.files || !Array.isArray(gameCode.files)) {
      message.error('No game files found to deploy');
      return;
    }
    
    // 🔧 修复：检查所有类型的合约文件
    const contractFile = gameCode.files.find((f: any) => 
      f.language === 'solidity' || 
      f.language === 'rust' ||
      f.name?.toLowerCase().includes('.sol') ||
      f.name?.toLowerCase().includes('.rs') ||
      f.type === 'contract' ||
      f.type === 'solidity' ||
      f.type === 'solana-anchor'
    );
    
    if (!contractFile) {
      message.error('No contract file found to deploy');
      return;
    }
    
    // 🔧 修复：直接使用后端设置的合约类型
    const contractType = contractFile.type || 'solidity'; // 后端应该已经设置了正确的类型
    // Using contract type from backend
    
    // 使用找到的合约文件和类型
    addContract(contractFile.name, contractFile.content, contractType);
    setDeployModalVisible(true);
  };

  const claimReward = async () => {
    if (currentScore === null || currentScore === undefined || currentScore <= 0) {
      message.error('No valid score available to claim');
      return;
    }

    if (!gameCode?.contractAddress) {
      message.error('Smart contract address is missing');
      return;
    }

    try {
      // 🔧 根据合约地址类型判断是EVM还是Solana
      if (gameCode.contractAddress.startsWith('0x')) {
        // EVM合约
        await claimEVMReward();
      } else {
        // Solana合约
        await claimSolanaReward();
      }
      
      message.success('Reward claimed successfully!');
      // 🔧 成功claim reward后重置状态
      setIsGameEnded(false);
      setCurrentScore(0);
      setIsModalVisible(false);
      
    } catch (error: any) {
      message.error(`Failed to claim reward: ${error.message}`);
      console.error('Failed to claim reward:', error);
    }
  };

  // 🔧 EVM奖励处理逻辑
  const claimEVMReward = async () => {
    const web3 = getWeb3Instance();
    
    if (!web3) {
      throw new Error('Web3 instance not available');
    }

    if (!gameCode?.contractABI || !Array.isArray(gameCode.contractABI)) {
      throw new Error('Smart contract ABI is missing or invalid');
    }

    if (!gameCode?.contractAddress?.startsWith('0x') || gameCode.contractAddress.length !== 42) {
      throw new Error('Invalid EVM contract address');
    }

    // Creating EVM contract instance

    const contract = new web3.eth.Contract(gameCode.contractABI, gameCode.contractAddress);
        
        // 使用统一的 endGame 方法名
    const tx = await contract.methods.endGame(currentScore).send({
          from: currentAccount
        });
    
  };

  // 🔧 Solana奖励处理逻辑
  const claimSolanaReward = async () => {
    const connection = getSolanaConnection();
    
    if (!connection) {
      throw new Error('Solana connection not available');
    }

    if (!gameCode?.contractAddress || gameCode.contractAddress.startsWith('0x')) {
      throw new Error('Invalid Solana program ID');
    }

    // Processing Solana reward claim

    try {
      // 创建程序ID
      const programId = new PublicKey(gameCode.contractAddress);
      const playerPublicKey = new PublicKey(currentAccount!);
      
      // 获取Phantom wallet
      const provider = window.solana;
      if (!provider || !provider.isConnected) {
        throw new Error('Phantom wallet not connected');
      }

      // 创建游戏结束指令数据
      const instructionData = Buffer.alloc(8 + 8); // 8 bytes for instruction discriminator + 8 bytes for score
      instructionData.writeUInt8(1, 0); // endGame instruction discriminator (假设为1)
      instructionData.writeBigUInt64LE(BigInt(currentScore), 8);

      // 查找或创建游戏状态PDA
      const [gameStatePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state'), playerPublicKey.toBuffer()],
        programId
      );


      // 创建交易指令
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: playerPublicKey, isSigner: true, isWritable: false },
          { pubkey: gameStatePDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: instructionData,
      });

      // 创建交易
      const transaction = new Transaction().add(instruction);
      
      // 获取最新的区块哈希
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = playerPublicKey;


      // 使用Phantom签名并发送交易
      const signedTransaction = await provider.signTransaction(transaction);
      const txId = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // 确认交易
      await connection.confirmTransaction(txId, 'confirmed');
      
    } catch (error: any) {
      // 如果是Solana特定的错误，提供更友好的错误信息
      if (error.message.includes('Invalid public key')) {
        throw new Error('Invalid Solana address format');
      } else if (error.message.includes('Program account does not exist')) {
        throw new Error('Game program not found on Solana network');
      } else if (error.message.includes('Transaction simulation failed')) {
        throw new Error('Game program rejected the transaction. Make sure you have a valid score.');
      }
      throw error;
    }
  };

  const closeModal = () => {
    setIsModalVisible(false);
    // 🔧 不重置游戏状态和分数，让用户稍后还能claim reward
    // setIsGameEnded(false); // 保持游戏结束状态
    // setCurrentScore(0); // 保持分数
  };

  // 游戏开始时记录游戏统计信息
  const startGameSession = async () => {
    if (!isAuthenticated) {
      message.warning('Please login to preview the game');
      return;
    }
    if (!gameCode) {
      setIsModalVisible(true);
      return;
    }
    
    try {
      // 如果没有gameId，创建一个临时ID
      if (!gameCode.gameId) {
        // Game ID not found, using session for statistics
      } else {
        // 增加游戏播放次数，并传入玩家地址
        await gameService.incrementPlayCount(gameCode.gameId, currentAccount);
        // Game play count incremented
      }

      // 🔧 前端直接组装HTML，避免后端调用和跨域问题
      const assembleHtmlLocally = () => {
        if (!msg.files || msg.files.length === 0) {
          console.warn('🔧 No files provided for local HTML assembly');
          return buildGameContent();
        }

        const htmlFile = msg.files.find((f: any) => f.language === 'html');
        const cssFile = msg.files.find((f: any) => f.language === 'css');
        const jsFile = msg.files.find((f: any) => f.language === 'javascript');

        if (!htmlFile || !jsFile) {
          console.warn('🔧 Missing essential files (HTML or JS), using fallback');
          return buildGameContent();
        }

        const assembledHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${msg.gameType || 'Game'} Preview</title>
    <style>
        ${cssFile?.content || ''}
    </style>
</head>
<body>
    ${htmlFile.content || ''}
    <script>
        // 🔧 添加通信代码
        window.sendGameEndMessage = function(score) {
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'GAME_END', score: score || 0 }, '*');
            }
        };
        
        window.sendGameStartMessage = function() {
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'GAME_START' }, '*');
            }
        };
        
        window.sendScoreUpdate = function(score) {
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'SCORE_UPDATE', score: score || 0 }, '*');
            }
        };
        
        // 🔧 游戏代码（保持原始，不做复杂处理）
        ${jsFile.content || ''}
    </script>
</body>
</html>`;

        return assembledHtml;
      };

      // 使用buildGameContent确保有完整的游戏控制逻辑
      const gameHtml = buildGameContent();
      setAssembledHtml(gameHtml);
      // Using buildGameContent for complete game control
    } catch (error) {
      console.error('Failed to build game content:', error);
      setAssembledHtml('');
    }
    
    // 🔧 修复：如果已经有未claim的分数，询问用户是否要重置
    if (isGameEnded && currentScore > 0) {
      const userWantsToContinue = window.confirm(
        `You have an unclaimed score of ${currentScore}. Starting a new game will lose this score. Continue?`
      );
      if (!userWantsToContinue) {
        return; // 用户选择不继续，保持当前状态
      }
    }
    
    // 🔧 只在用户确认后才重置游戏状态
    // 重置游戏状态
    setIsGameEnded(false);
    setCurrentScore(0);
    // Game state reset for new session
    
    // 无论统计是否成功，都打开游戏
    setIsModalVisible(true);
  };

  // 打开发布游戏表单
  const showPublishModal = () => {
    // 预填表单数据，确保 msg.gameType 的安全处理
    const defaultType = msg.gameType || 'game';
    form.setFieldsValue({
      title: msg.gameType ? `${msg.gameType} Game` : 'My Game',
      description: msg.blockchainFeatures?.length > 0 
        ? `A blockchain-enabled ${defaultType} game` 
        : `A fun ${defaultType} game`,
      category: mapGameTypeToCategory(msg.gameType),
      price: 0,
      currency: 'ETH'
    });
    
    setIsPublishModalVisible(true);
  };

  // 映射游戏类型到类别
  const mapGameTypeToCategory = (gameType: string) => {
    const categoryMap: {[key: string]: string} = {
      'SHOOTER': 'Action',
      'PLATFORM': 'Arcade',
      'PUZZLE': 'Puzzle'
    };
    
    return categoryMap[gameType] || 'Arcade';
  };

  // 提交游戏上架表单
  const handlePublishGame = async (values: any) => {
    setIsPublishing(true);
    try {
      
      if (!gameCode) {
        throw new Error('No game code available');
      }
      
      // 使用现有的 gameId 或者生成一个新的（如果不存在）
      const gameId = gameCode.gameId || uuidv4();
      
      // 构建游戏元数据对象
      const metadata: GameMetadata = {
        gameId,
        title: values.title,
        description: values.description || `A fun ${msg.gameType} game`,
        thumbnailUrl: values.thumbnailUrl || '',
        price: 0, // 强制设置为免费游戏
        currency: 'FREE', // 强制设置为免费
        category: values.category || 'Arcade',
        tags: values.tags?.split(',').map((tag: string) => tag.trim()) || [],
        contractAddress: gameCode.contractAddress || '',
        contractAbi: gameCode.contractABI || [],
        gameType: msg.gameType || 'custom'
        // Note: creator_id will be added by the server using req.userId
      };
      
      
      // 检查必要的游戏信息
      if (!metadata.title) {
        throw new Error('Game title is required');
      }
      
      // 保存源码元数据
      const sourceMetadataResult = await saveGameSourceMetadata({
        gameId,
        sourceCodeType: msg.gameType || 'custom',
        compilerVersion: '1.0.0',
        hasEndGameNotification: true,
        marketplaceStatus: 'draft'
      });
      
      if (!sourceMetadataResult.success) {
        console.warn("Warning: Source metadata save issue:", sourceMetadataResult.error);
        // 继续执行，不要因为元数据问题阻止发布
      }
      
      // 保存游戏元数据
      const gameMetadataResult = await saveGameMetadata(metadata);
      
      if (!gameMetadataResult.success) {
        console.warn("Warning: Game metadata save issue:", gameMetadataResult.error);
        // 继续执行，不要因为元数据问题阻止发布
      }
      
      // 最后发布到市场
      const result = await gameService.publishGameToMarket(gameId, metadata);
      
      if (result.success) {
        message.success('Game published to marketplace successfully!');
        // 持久化游戏源码文件到数据库
        await saveGameFiles(
          gameId,
          gameCode.files.map((f: any) => ({ name: f.name, content: f.content, type: f.type })),
          msg.gameType || 'custom'
        );
        // 更新上下文中的 gameId，使后续操作可以正确引用
        setGameCode({
          ...gameCode,
          gameId
        });
        setIsPublishModalVisible(false);
        form.resetFields();
      } else {
        throw new Error(result.error || result.message || 'Failed to publish game');
      }
    } catch (error: any) {
      console.error('Game publish error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      message.error(`Failed to publish game: ${error.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // 🔧 添加调试日志
  // GamePreview render

  return (
    <div className="game-preview">
      <Card title="🎮 Game Preview" className="preview-card">
        {/* 需要合约部署后才能预览游戏 */}
        {!gameCode?.contractAddress ? (
          <>
            <Alert
              message="⚠️ Smart Contract Deployment Required"
              description="Your game is ready! Deploy the smart contract below to start playing and earning blockchain rewards."
              type="warning"
              showIcon
              style={{ marginBottom: '16px' }}
            />
            {/* 🔧 修复：使用专门的样式类确保部署按钮不被遮挡 */}
            {findcontract() && (
              <div className="contract-deploy-section">
                <p style={{ 
                  color: '#28a745', 
                  fontWeight: 'bold', 
                  marginBottom: '16px',
                  fontSize: '16px'
                }}>
                  📋 Smart Contract Ready for Deployment
                </p>
                <Button 
                  type="primary" 
                  size="large"
                  onClick={handleDeploy}
                  className="contract-deploy-button"
                >
                  🚀 Deploy Smart Contract
                </Button>
                <p style={{ 
                  color: '#6c757d', 
                  fontSize: '14px', 
                  marginTop: '12px',
                  marginBottom: '0'
                }}>
                  Deploy your contract to start playing and earning rewards
                </p>
              </div>
            )}
          </>
        ) : (
          <>
        {/* 🔧 修复：2行垂直布局 - 第1行按钮，第2行文件列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 第1行：游戏控制按钮 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {isAuthenticated ? (
              <Button type="primary" onClick={startGameSession}>
                Open Game Preview
              </Button>
            ) : (
              <Button disabled>
                Please login to preview game
              </Button>
            )}
            
            {/* 🎮 新增：AI对战游戏状态显示 */}
            {msg.isVsGame && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag color="purple" icon={<span>🤖</span>}>
                  AI Battle Mode
                </Tag>
                {aiThinking && (
                  <Tag color="orange">
                    AI Thinking...
                  </Tag>
                )}
                {aiMove && (
                  <Tag color="green">
                    AI Acted
                  </Tag>
                )}
              </div>
            )}
          </div>
          
          {/* 第2行：文件下载区域 */}
          {msg.files && msg.files.length > 0 && (
            <div>
              <h4 style={{ 
                marginBottom: '8px', 
                fontSize: '14px', 
                color: '#666', 
                marginTop: '0'
              }}>
                Generated Files:
              </h4>
              <Space wrap>
                {msg.files.map((file: any, index: number) => (
                  <Button 
                    key={index}
                    size="small"
                    onClick={() => {
                      const blob = new Blob([file.content], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = file.name;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    type={file.type === 'contract' ? 'primary' : 'default'}
                    style={{ marginBottom: '4px' }}
                  >
                    📄 {file.name}
                  </Button>
                ))}
              </Space>
            </div>
          )}
        </div>
        <Modal
            title="🎮 Game Preview"
            open={isModalVisible}
            onCancel={closeModal}
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    iframe: {iframeLoaded ? '✅' : '⏳'}
                  </span>
                </div>
                {isGameEnded && currentScore > 0 ? (
                  <Space>
                    <span style={{ marginRight: 8 }}>Score: {currentScore}</span>
                    <Button 
                      onClick={() => {
                        setIsModalVisible(false);
                      }}
                    >
                      Close
                    </Button>
                    <Button className="Claim-Button" type="primary" onClick={claimReward}>
                      Claim Reward
                    </Button>
                  </Space>
                ) : (
                  <Button 
                    onClick={() => {
                      setIsModalVisible(false);
                    }}
                  >
                    Close
                  </Button>
                )}
              </div>
            }
            width={1000}
          >
           {/* 🐛 简化调试面板 */}
           
           <iframe
               ref={iframeRef}
               src={msg.gameFileUrl || undefined}
               srcDoc={msg.gameFileUrl ? undefined : buildGameContent()}
               sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-pointer-lock allow-popups"
               className="game-iframe"
               title="Game Preview"
               width="960"
               height="760"
               style={{ border: 'none', outline: 'none' }}
               onLoad={() => {
                 setIframeLoaded(true);
                 
                 // 🔧 确保iframe完全就绪后才进行通信
                 setTimeout(() => {
                   if (!iframeRef.current?.contentWindow) {
                     console.warn('🎮 iframe contentWindow unavailable');
                   }
                 }, 100);
               }}
             />
          </Modal>
          </>
        )}

        {/* 🔧 修复：恢复原来的显示逻辑 */}
        {isGameEnded && (
          <Alert
            message={currentScore > 0 ? `Game Ended! Score: ${currentScore}` : `Game Ended!`}
            type="success"
            className="Claim-Alert"
            action={
              currentScore > 0 && (
                <Button className="Claim-Button" type="primary" onClick={claimReward}>
                  Claim Reward
                </Button>
              )
            }
          />
        )}
      </Card>
      {/* 🔧 修复：只在合约部署后显示发布和下载按钮 */}
      {gameCode?.contractAddress && (
        <div className="action-buttons-section" style={{ marginTop: '16px' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Button 
              type="primary" 
              size="large"
              onClick={showPublishModal}
              style={{ minWidth: '200px' }}
            >
              📢 Publish Game to Marketplace
            </Button>
            

          </Space>
        </div>
      )}

      {/* 游戏上架表单 */}
      <Modal
        title="Publish Game to Marketplace"
        open={isPublishModalVisible}
        onCancel={() => setIsPublishModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handlePublishGame}
        >
          <Form.Item
            name="title"
            label="Game Title"
            rules={[{ required: true, message: 'Please enter a title' }]}
          >
            <Input placeholder="Enter game title" />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="Game Description"
            rules={[{ required: true, message: 'Please enter a description' }]}
          >
            <Input.TextArea placeholder="Describe your game" rows={4} />
          </Form.Item>
          
          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Please select a category' }]}
          >
            <Select>
              <Select.Option value="Action">Action</Select.Option>
              <Select.Option value="Arcade">Arcade</Select.Option>
              <Select.Option value="Puzzle">Puzzle</Select.Option>
              <Select.Option value="Strategy">Strategy</Select.Option>
              <Select.Option value="Educational">Educational</Select.Option>
              <Select.Option value="Blockchain">Blockchain</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="tags"
            label="Tags"
            help="Separate tags with commas"
          >
            <Input placeholder="e.g. shooter, blockchain, nft" />
          </Form.Item>
          
          <Form.Item
            name="thumbnailUrl"
            label="Thumbnail URL"
          >
            <Input placeholder="Enter image URL for game thumbnail" />
          </Form.Item>
          
          <Form.Item
            name="price"
            label="Price"
            extra="Payment functionality is temporarily not supported. All games are currently free."
          >
            <InputNumber 
              min={0} 
              step={0.01} 
              style={{ width: '100%' }} 
              disabled={true}
              value={0}
              placeholder="Free"
            />
          </Form.Item>
          
          <Form.Item
            name="currency"
            label="Currency"
            initialValue="FREE"
            extra="Only free games are supported at this time."
          >
            <Select disabled={true}>
              <Select.Option value="FREE">FREE</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button onClick={() => setIsPublishModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={isPublishing}>
                Publish Game
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default GamePreview;

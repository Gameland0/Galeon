// 本地AI引擎管理器
import { GameDetector } from './game-detector';
import { GameInfo, GameResult, Move, SearchOptions } from './universal-board-ai-interface';

export interface LocalAIResult {
  success: boolean;
  move?: any;
  score?: number;
  gameType?: string;
  error?: string;
  source: 'local' | 'fallback';
}

export class LocalAIEngine {
  
  /**
   * 同步计算最佳走法
   */
  static calculateMove(boardState: any[]): LocalAIResult {
    try {
      console.log('🎯 开始本地AI计算...');
      
      // 检查引擎是否可用
      if (!window.UniversalBoardAI) {
        console.warn('🎯 通用AI引擎未加载');
        return {
          success: false,
          error: 'UniversalBoardAI not loaded',
          source: 'local'
        };
      }
      
      // 检测游戏类型
      const gameInfo = GameDetector.detectGame();
      console.log('🎮 检测到游戏:', gameInfo);
      
      // 转换棋盘状态
      const gameState = GameDetector.convertBoardState(boardState, gameInfo.type);
      console.log('🎯 棋盘状态转换完成:', gameState);
      
      // 调用对应的AI引擎
      const result = LocalAIEngine.callGameEngine(gameState, gameInfo);
      
      if (result && result.bestMove !== undefined) {
        // 转换走法格式
        const gameMove = GameDetector.convertMoveToGameFormat(result.bestMove, gameInfo.type);
        
        console.log('🎯 本地AI计算成功:', {
          originalMove: result.bestMove,
          gameMove: gameMove,
          score: result.score,
          gameType: gameInfo.type
        });
        
        return {
          success: true,
          move: gameMove,
          score: result.score,
          gameType: gameInfo.type,
          source: 'local'
        };
      }
      
      return {
        success: false,
        error: 'No valid move found',
        source: 'local'
      };
      
    } catch (error) {
      console.error('🎯 本地AI计算失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'local'
      };
    }
  }
  
  /**
   * 异步计算最佳走法（使用WebWorker）
   */
  static calculateMoveAsync(boardState: any[], callback: (result: LocalAIResult) => void): void {
    try {
      console.log('🎯 开始异步AI计算（WebWorker）...');
      
      // 检查引擎是否可用
      if (!window.UniversalBoardAI) {
        callback({
          success: false,
          error: 'UniversalBoardAI not loaded',
          source: 'local'
        });
        return;
      }
      
      const gameInfo = GameDetector.detectGame();
      
      // 检查是否支持WebWorker
      if (!window.UniversalBoardAI.createSearchWorker) {
        console.log('🎯 不支持WebWorker，回退到同步计算');
        const result = LocalAIEngine.calculateMove(boardState);
        callback(result);
        return;
      }
      
      try {
        // 创建对应的适配器
        const adapterClass = window.UniversalBoardAI[gameInfo.adapter as keyof typeof window.UniversalBoardAI];
        if (!adapterClass) {
          throw new Error(`Adapter ${gameInfo.adapter} not found`);
        }
        
        const adapter = new (adapterClass as any)();
        const worker = window.UniversalBoardAI.createSearchWorker(adapter);
        
        const gameState = GameDetector.convertBoardState(boardState, gameInfo.type);
        const options: SearchOptions = {
          maxDepth: gameInfo.defaultDepth,
          timeMs: gameInfo.defaultTime
        };
        
        console.log('🎯 发送计算任务到WebWorker:', { gameType: gameInfo.type, options });
        
        // 设置超时
        const timeoutId = setTimeout(() => {
          console.warn('🎯 WebWorker计算超时');
          worker.terminate();
          callback({
            success: false,
            error: 'Calculation timeout',
            source: 'local'
          });
        }, options.timeMs + 1000); // 额外1秒超时缓冲
        
        worker.onmessage = (e) => {
          clearTimeout(timeoutId);
          
          if (e.data.type === 'result') {
            const result = e.data.payload;
            const gameMove = GameDetector.convertMoveToGameFormat(result.bestMove, gameInfo.type);
            
            console.log('🎯 WebWorker计算成功:', {
              originalMove: result.bestMove,
              gameMove: gameMove,
              score: result.score
            });
            
            callback({
              success: true,
              move: gameMove,
              score: result.score,
              gameType: gameInfo.type,
              source: 'local'
            });
          } else {
            callback({
              success: false,
              error: 'Invalid worker response',
              source: 'local'
            });
          }
          
          worker.terminate();
        };
        
        worker.onerror = (error) => {
          clearTimeout(timeoutId);
          console.error('🎯 WebWorker错误:', error);
          worker.terminate();
          
          callback({
            success: false,
            error: 'Worker error: ' + error.message,
            source: 'local'
          });
        };
        
        // 发送计算任务
        worker.postMessage({
          type: 'search',
          state: gameState,
          options: options
        });
        
      } catch (error) {
        console.error('🎯 WebWorker创建失败:', error);
        // 回退到同步计算
        const result = LocalAIEngine.calculateMove(boardState);
        callback(result);
      }
      
    } catch (error) {
      console.error('🎯 异步AI计算失败:', error);
      callback({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'local'
      });
    }
  }
  
  /**
   * 调用特定游戏的AI引擎
   */
  private static callGameEngine(gameState: any, gameInfo: GameInfo): GameResult | null {
    const engine = window.UniversalBoardAI!;
    
    switch(gameInfo.type) {
      case 'gomoku':
        if (engine.bestMoveGomoku) {
          return engine.bestMoveGomoku(gameState, gameInfo.defaultDepth, gameInfo.defaultTime);
        }
        break;
        
      case 'reversi':
        if (engine.bestMoveReversi) {
          return engine.bestMoveReversi(gameState, gameInfo.defaultDepth, gameInfo.defaultTime);
        }
        break;
        
      case 'tictactoe':
        if (engine.bestMoveTicTacToe) {
          return engine.bestMoveTicTacToe(gameState, gameInfo.defaultDepth, gameInfo.defaultTime);
        }
        break;
        
      case 'chess':
        if (engine.bestMoveChess) {
          return engine.bestMoveChess(gameState, gameInfo.defaultDepth, gameInfo.defaultTime);
        }
        break;
    }
    
    console.error('🎯 找不到对应的引擎函数:', gameInfo);
    return null;
  }
  
  /**
   * 检查本地引擎是否可用
   */
  static isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.UniversalBoardAI;
  }
  
  /**
   * 获取引擎状态信息
   */
  static getEngineStatus(): {
    available: boolean;
    supportedGames: string[];
    hasWebWorker: boolean;
  } {
    if (!window.UniversalBoardAI) {
      return {
        available: false,
        supportedGames: [],
        hasWebWorker: false
      };
    }
    
    const engine = window.UniversalBoardAI;
    const supportedGames: string[] = [];
    
    if (engine.bestMoveGomoku) supportedGames.push('gomoku');
    if (engine.bestMoveReversi) supportedGames.push('reversi'); 
    if (engine.bestMoveTicTacToe) supportedGames.push('tictactoe');
    if (engine.bestMoveChess) supportedGames.push('chess');
    
    return {
      available: true,
      supportedGames: supportedGames,
      hasWebWorker: !!engine.createSearchWorker
    };
  }
}
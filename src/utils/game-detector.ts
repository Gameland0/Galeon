// 游戏类型检测和适配器管理器
import { GameType, GameInfo, Move, GameState } from './universal-board-ai-interface';

export class GameDetector {
  
  /**
   * 检测当前游戏类型和相关配置
   */
  static detectGame(): GameInfo {
    const pageTitle = document.title.toLowerCase();
    const pageContent = document.body.textContent.toLowerCase();
    const boardElements = document.querySelectorAll('.cell, .square, .grid-cell, td, [data-row], [data-col]');
    
    console.log('🎮 游戏检测:', {
      title: pageTitle,
      elementCount: boardElements.length,
      hasGomoku: pageContent.includes('gomoku') || pageContent.includes('五子棋'),
      hasReversi: pageContent.includes('reversi') || pageContent.includes('黑白棋'),
      hasTicTac: pageContent.includes('tic') || pageContent.includes('井字'),
      hasChess: pageContent.includes('chess') || pageContent.includes('象棋')
    });
    
    // 五子棋检测
    if (boardElements.length === 225 || 
        pageContent.includes('gomoku') || 
        pageContent.includes('五子棋') ||
        pageTitle.includes('gomoku')) {
      return {
        type: 'gomoku',
        adapter: 'GomokuAdapter',
        bestMoveFunction: 'bestMoveGomoku',
        boardSize: [15, 15],
        defaultDepth: 3,
        defaultTime: 800
      };
    }
    
    // 黑白棋检测
    if (boardElements.length === 64 || 
        pageContent.includes('reversi') || 
        pageContent.includes('黑白棋') ||
        pageContent.includes('othello')) {
      return {
        type: 'reversi',
        adapter: 'ReversiAdapter',
        bestMoveFunction: 'bestMoveReversi',
        boardSize: [8, 8],
        defaultDepth: 6,
        defaultTime: 1000
      };
    }
    
    // 井字棋检测
    if (boardElements.length === 9 || 
        pageContent.includes('tic-tac-toe') || 
        pageContent.includes('tictactoe') ||
        pageContent.includes('井字棋')) {
      return {
        type: 'tictactoe',
        adapter: 'TicTacToeAdapter',
        bestMoveFunction: 'bestMoveTicTacToe',
        boardSize: [3, 3],
        defaultDepth: 9,
        defaultTime: 500
      };
    }
    
    // 象棋检测
    if (pageContent.includes('chinese chess') || 
        pageContent.includes('象棋') || 
        pageContent.includes('中国象棋')) {
      return {
        type: 'chess',
        adapter: 'ChineseChessAdapter',
        bestMoveFunction: 'bestMoveChess',
        boardSize: [10, 9],
        defaultDepth: 4,
        defaultTime: 2000
      };
    }
    
    // 默认使用五子棋
    console.log('🎮 未检测到特定游戏类型，默认使用五子棋');
    return {
      type: 'gomoku',
      adapter: 'GomokuAdapter',
      bestMoveFunction: 'bestMoveGomoku',
      boardSize: [15, 15],
      defaultDepth: 3,
      defaultTime: 800
    };
  }
  
  /**
   * 将通用棋盘状态转换为特定游戏引擎的格式
   */
  static convertBoardState(boardState: any[], gameType: GameType): GameState {
    switch(gameType) {
      case 'gomoku':
        return GameDetector.convertToGomoku(boardState);
      case 'reversi':
        return GameDetector.convertToReversi(boardState);
      case 'tictactoe':
        return GameDetector.convertToTicTacToe(boardState);
      case 'chess':
        return GameDetector.convertToChess(boardState);
      default:
        return GameDetector.convertToGomoku(boardState);
    }
  }
  
  /**
   * 转换为五子棋状态
   */
  private static convertToGomoku(boardState: any[]): GameState {
    // 处理二维数组
    if (Array.isArray(boardState) && Array.isArray(boardState[0])) {
      return {
        board: boardState.map(row => row.map(cell => {
          if (cell === 'X' || cell === '●') return 1; // AI棋子
          if (cell === 'O' || cell === '○') return -1; // 玩家棋子
          return 0; // 空位
        })),
        currentPlayer: 'AI',
        gameType: 'gomoku'
      };
    }
    
    // 处理一维数组，转换为15x15
    const board: number[][] = Array(15).fill(null).map(() => Array(15).fill(0));
    boardState.forEach((cell, index) => {
      const row = Math.floor(index / 15);
      const col = index % 15;
      if (row < 15 && col < 15) {
        if (cell === 'X' || cell === '●') board[row][col] = 1;
        else if (cell === 'O' || cell === '○') board[row][col] = -1;
        else board[row][col] = 0;
      }
    });
    
    return {
      board: board,
      currentPlayer: 'AI',
      gameType: 'gomoku'
    };
  }
  
  /**
   * 转换为黑白棋状态
   */
  private static convertToReversi(boardState: any[]): GameState {
    // 处理8x8黑白棋棋盘
    let board: number[][];
    
    if (Array.isArray(boardState) && Array.isArray(boardState[0]) && boardState.length === 8) {
      board = boardState.map(row => row.map(cell => {
        if (cell === 'X' || cell === '●' || cell === 'black') return 1; // AI棋子（黑子）
        if (cell === 'O' || cell === '○' || cell === 'white') return -1; // 玩家棋子（白子）
        return 0; // 空位
      }));
    } else {
      // 从一维数组转换
      board = Array(8).fill(null).map(() => Array(8).fill(0));
      boardState.forEach((cell, index) => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        if (row < 8 && col < 8) {
          if (cell === 'X' || cell === '●' || cell === 'black') board[row][col] = 1;
          else if (cell === 'O' || cell === '○' || cell === 'white') board[row][col] = -1;
          else board[row][col] = 0;
        }
      });
    }
    
    return {
      board: board,
      currentPlayer: 'AI',
      gameType: 'reversi'
    };
  }
  
  /**
   * 转换为井字棋状态
   */
  private static convertToTicTacToe(boardState: any[]): GameState {
    const board: number[][] = Array(3).fill(null).map(() => Array(3).fill(0));
    
    if (Array.isArray(boardState)) {
      boardState.forEach((cell, index) => {
        const row = Math.floor(index / 3);
        const col = index % 3;
        if (row < 3 && col < 3) {
          if (cell === 'X') board[row][col] = 1; // AI棋子
          else if (cell === 'O') board[row][col] = -1; // 玩家棋子
          else board[row][col] = 0;
        }
      });
    }
    
    return {
      board: board,
      currentPlayer: 'AI',
      gameType: 'tictactoe'
    };
  }
  
  /**
   * 转换为象棋状态（简化版）
   */
  private static convertToChess(boardState: any[]): GameState {
    // 象棋的状态转换比较复杂，这里提供基本框架
    const board: string[][] = Array(10).fill(null).map(() => Array(9).fill(''));
    
    // 这里需要根据具体的象棋引擎格式进行转换
    // 暂时返回基本结构
    return {
      board: board,
      currentPlayer: 'AI',
      gameType: 'chess'
    };
  }
  
  /**
   * 将引擎返回的走法转换为游戏可执行的格式
   */
  static convertMoveToGameFormat(move: Move, gameType: GameType): any {
    switch(gameType) {
      case 'gomoku':
      case 'reversi':
        // 坐标格式
        return {
          row: move.row,
          col: move.col
        };
        
      case 'tictactoe':
        // 索引格式
        if (move.row !== undefined && move.col !== undefined) {
          return move.row * 3 + move.col;
        }
        return move.index || 0;
        
      case 'chess':
        // 象棋移动格式
        return {
          from: move.from,
          to: move.to,
          piece: move.piece
        };
        
      default:
        return move;
    }
  }
}
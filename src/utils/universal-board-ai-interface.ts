// 通用棋类AI引擎接口定义
// 这个文件定义了与你的 universal-board-ai.ts 引擎的接口

export interface Move {
  row?: number;
  col?: number;
  from?: string;
  to?: string;
  index?: number;
  piece?: string;
}

export interface GameResult {
  bestMove: Move;
  score: number;
  depth?: number;
  alternatives?: Move[];
}

export interface GameState {
  board: any[][];
  currentPlayer: string;
  gameType: string;
  moveHistory?: Move[];
}

export interface SearchOptions {
  maxDepth: number;
  timeMs: number;
  useOpeningBook?: boolean;
  enablePruning?: boolean;
}

// 游戏类型定义
export type GameType = 'gomoku' | 'reversi' | 'tictactoe' | 'chess';

// 游戏信息接口
export interface GameInfo {
  type: GameType;
  adapter: string;
  bestMoveFunction: string;
  boardSize: [number, number];
  defaultDepth: number;
  defaultTime: number;
}

// 通用AI引擎接口
export interface UniversalBoardAI {
  // 五子棋
  bestMoveGomoku(state: GameState, depth: number, timeMs: number): GameResult;
  GomokuAdapter: any;
  
  // 黑白棋
  bestMoveReversi(state: GameState, depth: number, timeMs: number): GameResult;
  ReversiAdapter: any;
  
  // 井字棋
  bestMoveTicTacToe(state: GameState, depth: number, timeMs: number): GameResult;
  TicTacToeAdapter: any;
  
  // 象棋
  bestMoveChess(state: GameState, depth: number, timeMs: number): GameResult;
  ChineseChessAdapter: any;
  
  // WebWorker支持
  createSearchWorker(adapter: any): Worker;
}

// 窗口扩展，声明全局的UniversalBoardAI对象
declare global {
  interface Window {
    UniversalBoardAI?: UniversalBoardAI;
  }
}

export default UniversalBoardAI;
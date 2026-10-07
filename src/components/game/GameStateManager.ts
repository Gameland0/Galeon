export interface GameState {
    score: number;
    level: number;
    lives?: number;
    highScore?: number;
    checkpoint?: string|null;
    moves?: number;
    status: 'menu' | 'playing' | 'paused' | 'gameOver';
    timeElapsed?: number;
  }
  
  export interface GameOptions {
    type: 'SHOOTER' | 'PLATFORM' | 'PUZZLE';
    difficulty?: 'easy' | 'medium' | 'hard';
    canvas?: {
      width: number;
      height: number;
    };
  }
  
  export class GameStateManager {
    private state: GameState;
    private options: GameOptions;
    private listeners: ((state: GameState) => void)[] = [];
  
    constructor(options: GameOptions) {
      this.options = options;
      this.state = this.getInitialState(options.type);
    }
  
    private getInitialState(type: string): GameState {
      const baseState = {
        score: 0,
        level: 1,
        status: 'menu' as const,
        timeElapsed: 0
      };
  
      switch (type) {
        case 'SHOOTER':
          return {
            ...baseState,
            lives: 3
          };
        case 'PLATFORM':
          return {
            ...baseState,
            lives: 3,
            checkpoint: null
          };
        case 'PUZZLE':
          return {
            ...baseState,
            moves: 0
          };
        default:
          return baseState;
      }
    }
  
    public subscribe(listener: (state: GameState) => void) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter(l => l !== listener);
      };
    }
  
    private notify() {
      this.listeners.forEach(listener => listener(this.state));
    }
  
    public updateState(update: Partial<GameState>) {
      this.state = { ...this.state, ...update };
      this.notify();
    }
  
    public getState(): GameState {
      return { ...this.state };
    }
  
    public startGame() {
      this.updateState({
        status: 'playing',
        timeElapsed: 0
      });
    }
  
    public pauseGame() {
      if (this.state.status === 'playing') {
        this.updateState({ status: 'paused' });
      }
    }
  
    public resumeGame() {
      if (this.state.status === 'paused') {
        this.updateState({ status: 'playing' });
      }
    }
  
    public endGame() {
      const highScore = Math.max(this.state.score, this.state.highScore || 0);
      this.updateState({
        status: 'gameOver',
        highScore
      });
    }
  
    public resetGame() {
      const highScore = this.state.highScore;
      this.state = this.getInitialState(this.options.type);
      this.state.highScore = highScore;
      this.notify();
    }
  
    public updateScore(points: number) {
      this.updateState({
        score: this.state.score + points
      });
    }
  
    public updateLevel(level: number) {
      this.updateState({ level });
    }
  
    public loseLife() {
      if (typeof this.state.lives === 'number') {
        const newLives = this.state.lives - 1;
        this.updateState({ lives: newLives });
        
        if (newLives <= 0) {
          this.endGame();
        }
      }
    }
  
    public setCheckpoint(checkpoint: string) {
      if (this.options.type === 'PLATFORM') {
        this.updateState({ checkpoint });
      }
    }
  
    public incrementMoves() {
      if (this.options.type === 'PUZZLE' && typeof this.state.moves === 'number') {
        this.updateState({
          moves: this.state.moves + 1
        });
      }
    }
  
    public updateTimeElapsed(delta: number) {
      if (this.state.status === 'playing') {
        this.updateState({
          timeElapsed: (this.state.timeElapsed || 0) + delta
        });
      }
    }
  
    public getGameOptions(): GameOptions {
      return { ...this.options };
    }
  }
  
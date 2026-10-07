export class GameStateUtils {
    static saveState(sessionId: string, state: any) {
      try {
        localStorage.setItem(`game_state_${sessionId}`, JSON.stringify(state));
        return true;
      } catch (error) {
        console.error('Error saving game state:', error);
        return false;
      }
    }
  
    static loadState(sessionId: string) {
      try {
        const state = localStorage.getItem(`game_state_${sessionId}`);
        return state ? JSON.parse(state) : null;
      } catch (error) {
        console.error('Error loading game state:', error);
        return null;
      }
    }
  
    static clearState(sessionId: string) {
      try {
        localStorage.removeItem(`game_state_${sessionId}`);
        return true;
      } catch (error) {
        console.error('Error clearing game state:', error);
        return false;
      }
    }
  
    static getGameSession(sessionId: string) {
      return {
        id: sessionId,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        state: this.loadState(sessionId) || {}
      };
    }
  
    static updateSession(sessionId: string, state: any) {
      const session = this.getGameSession(sessionId);
      session.lastUpdated = Date.now();
      session.state = state;
      this.saveState(sessionId, session);
      return session;
    }
  }
  
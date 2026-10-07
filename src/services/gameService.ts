import { api } from '../services/api';

export enum GameType {
  SIMPLE = 'simple',
  SCORE_BASED = 'score',
  NFT_BASED = 'nft',
  TOKEN_BASED = 'token',
  FULL_CHAIN = 'fullChain'
}

export const gameService = {
  // Get game state
  async getGameState(sessionId: string) {
    const response = await api.get(`/game/state/${sessionId}`);
    return response.data;
  },

  // Submit score with optional playerAddress for recording ratings
  async submitScore(gameId: string, score: number, playerAddress?: string | null) {
    const payload: any = { gameId, score };
    if (playerAddress) payload.playerAddress = playerAddress;
    const response = await api.post(`/game/score`, payload);
    return response.data;
  },

  // Get leaderboard entries
  async getLeaderboard(gameId: string, limit: number = 10) {
    const response = await api.get(`/game/leaderboard`, {
      params: { gameId, limit }
    });
    return response.data;
  },

  // Get contract info
  async getContractInfo(gameType: GameType, chainId: number) {
    const response = await api.get(`/game/contract`, {
      params: { gameType, chainId }
    });
    return response.data;
  },

  // 保存游戏源码
  async saveGameSourceCode(gameId: string, sourceCode: string, gameType: GameType) {
    const response = await api.post(`/game/source`, {
      gameId,
      sourceCode,
      gameType
    });
    return response.data;
  },

  // 保存游戏文件（多文件版本）
  async saveGameFiles(gameId: string, files: Array<{name: string, content: string, type: string}>, gameType: string) {
    const response = await api.post('/game/files', {
      gameId,
      files,
      gameType
    });
    return response.data;
  },

  // 获取游戏源码
  async getGameSourceCode(gameId: string) {
    const response = await api.get(`/game/source/${gameId}`);
    return response.data;
  },

  // 增加游戏播放次数，接收可选的钱包地址用于去重统计
  async incrementPlayCount(gameId: string, playerAddress?: string | null) {
    const payload: any = { gameId };
    if (playerAddress) payload.playerAddress = playerAddress;
    const response = await api.post(`/game/stats/play`, payload);
    return response.data;
  },

  // 获取游戏统计数据
  async getGameStats(gameId: string) {
    const response = await api.get(`/game/stats/${gameId}`);
    return response.data;
  },

  // 发布游戏到市场
  async publishGameToMarket(gameId: string, metadata: any) {
    const response = await api.post(`/game/market/publish`, {
      gameId,
      metadata
    });
    return response.data;
  },
  
  // 从市场获取游戏列表
  async getGamesFromMarket(filter?: { gameType?: GameType, page?: number, limit?: number, category?: string, search?: string, sortBy?: string }) {
    console.log("gameService: calling API getGamesFromMarket with filter:", filter);
    try {
      const response = await api.get(`/game/market/list`, {
        params: filter
      });
      console.log("gameService: API response from getGamesFromMarket:", response.data);
      
      // 处理可能的不同响应格式
      if (Array.isArray(response.data)) {
        console.log("gameService: response is array, adapting to expected format");
        return {
          games: response.data,
          pagination: {
            total: response.data.length,
            page: filter?.page || 1,
            limit: filter?.limit || response.data.length
          }
        };
      }
      
      return response.data;
    } catch (error) {
      console.error("gameService: Error in getGamesFromMarket:", error);
      // 返回错误但保持标准格式，让UI层能正常处理
      return {
        games: [],
        pagination: {
          total: 0,
          page: filter?.page || 1,
          limit: filter?.limit || 10
        },
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },

  // 获取单个游戏详情
  async getGameById(gameId: string) {
    try {
      // 首先尝试从专门的API获取游戏详情
      const response = await api.get(`/game/market/${gameId}`);
      return response.data;
    } catch (error) {
      // 如果专门的API不存在，则从游戏列表中获取
      const gamesResponse = await this.getGamesFromMarket();
      const game = gamesResponse.games?.find((g: any) => g.id === gameId);
      
      if (!game) {
        throw new Error('Game not found');
      }
      
      return { game };
    }
  }
};
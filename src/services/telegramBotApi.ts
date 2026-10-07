/**
 * Telegram Bot 绑定 API 服务层
 * 用于 Web端生成/验证 TG 绑定码
 */

import { api } from './api';

export interface BindCodeResponse {
  success: boolean;
  data?: {
    bindCode: string;
    expiresAt: string;
    instruction: string;
  };
  error?: string;
}

export interface VerifyBindCodeResponse {
  success: boolean;
  data?: {
    telegramId: number;
    telegramUsername: string;
    message: string;
  };
  error?: string;
}

/**
 * Web端生成TG绑定码（方向: WEB → TG）
 * 用户在Web端点击生成，然后在TG Bot中输入 /bind <code>
 */
export async function generateBindCode(accessToken: string): Promise<BindCodeResponse> {
  const res = await api.post('/auto-trade/telegram-bot/bindcode', {}, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.data;
}

/**
 * Web端验证TG绑定码（方向: TG → Web）
 * 用户在TG Bot中 /bindweb 生成码，然后在Web端输入验证
 */
export async function verifyBindCode(accessToken: string, bindCode: string): Promise<VerifyBindCodeResponse> {
  const res = await api.post('/auto-trade/telegram-bot/verify-bindcode', { bindCode }, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.data;
}

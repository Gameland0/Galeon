/**
 * usePredictionWS — 预测市场 WebSocket hook
 *
 * 连接到 /ws/prediction，认证后监听：
 *   - POINTS_UPDATE: 积分余额变化
 *   - EVENT_SETTLED: 事件结算结果
 */

import { useEffect, useRef, useCallback } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL ||
  (window.location.protocol === 'https:' ? 'wss' : 'ws') + '://' + window.location.host.replace(/:\d+$/, ':8080') + '/ws/prediction';

interface WSHandlers {
  onPointsUpdate?: (balance: number) => void;
  onEventSettled?: (data: { eventId: string; symbol: string; payout: number; isWinner: boolean; netPnl: number }) => void;
}

export function usePredictionWS(address: string | null | undefined, handlers: WSHandlers) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<NodeJS.Timeout | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const connect = useCallback(() => {
    if (!address) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', address }));
        // 心跳保活
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'POINTS_UPDATE' && handlersRef.current.onPointsUpdate) {
            handlersRef.current.onPointsUpdate(msg.balance);
          }
          if (msg.type === 'EVENT_SETTLED' && handlersRef.current.onEventSettled) {
            handlersRef.current.onEventSettled(msg);
          }
        } catch {}
      };

      ws.onclose = () => {
        if (pingRef.current) clearInterval(pingRef.current);
        // 5秒后重连
        setTimeout(() => connect(), 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {}
  }, [address]);

  useEffect(() => {
    connect();
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // 防止触发重连
        wsRef.current.close();
      }
    };
  }, [connect]);
}

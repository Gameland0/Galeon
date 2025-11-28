import { useEffect, useState, useCallback } from 'react';
import { message } from 'antd';

// Phantom 钱包类型定义
interface PhantomWindow extends Window {
  phantom?: {
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: string }>;
      disconnect: () => Promise<void>;
      on: (event: string, callback: () => void) => void;
      off: (event: string, callback: () => void) => void;
      removeAllListeners: () => void;
      isConnected: boolean;
      publicKey?: { toString: () => string };
    };
  };
}

interface WalletState {
  wallet: any;
  connected: boolean;
  publicKey: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export const usePhantomWallet = (): WalletState => {
  const [wallet, setWallet] = useState<any>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 检查钱包是否已安装
  const checkIfPhantomInstalled = useCallback(() => {
    const phantom = (window as unknown as PhantomWindow).phantom?.solana;
    return phantom && phantom.isPhantom;
  }, []);

  // 初始化钱包状态
  const initWallet = useCallback(async () => {
    try {
      const phantom = (window as unknown as PhantomWindow).phantom?.solana;
      
      if (phantom) {
        setWallet(phantom);
        
        // 检查是否已连接
        if (phantom.isConnected && phantom.publicKey) {
          setConnected(true);
          setPublicKey(phantom.publicKey.toString());
        }
      }
    } catch (err) {
      console.error('Wallet initialization error:', err);
      setError('Failed to initialize wallet');
    }
  }, []);

  // 连接钱包
  const connect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      if (!checkIfPhantomInstalled()) {
        // 如果未安装 Phantom，打开安装页面
        window.open('https://phantom.app/', '_blank');
        throw new Error('Please install Phantom wallet from phantom.app');
      }

      const phantom = (window as unknown as PhantomWindow).phantom?.solana;
      
      if (!phantom) {
        throw new Error('Phantom wallet not found');
      }

      // 请求连接
      const response = await phantom.connect();
      setConnected(true);
      setPublicKey(response.publicKey);
      message.success('Wallet connected successfully');
      
    } catch (err: any) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
      message.error(err.message || 'Failed to connect wallet');
      
    } finally {
      setIsConnecting(false);
    }
  };

  // 断开钱包连接
  const disconnect = async () => {
    try {
      if (wallet) {
        await wallet.disconnect();
        setConnected(false);
        setPublicKey(null);
        message.success('Wallet disconnected');
      }
    } catch (err: any) {
      console.error('Disconnect error:', err);
      setError(err.message || 'Failed to disconnect wallet');
      message.error(err.message || 'Failed to disconnect wallet');
    }
  };

  // 设置钱包事件监听
  useEffect(() => {
    const setupWalletEvents = async () => {
      const phantom = (window as unknown as PhantomWindow).phantom?.solana;
      
      if (phantom) {
        // 连接事件
        const handleConnect = () => {
          setConnected(true);
          if (phantom.publicKey) {
            setPublicKey(phantom.publicKey.toString());
          }
        };

        // 断开连接事件
        const handleDisconnect = () => {
          setConnected(false);
          setPublicKey(null);
        };

        // 账户变更事件
        const handleAccountChange = () => {
          if (phantom.publicKey) {
            setPublicKey(phantom.publicKey.toString());
          } else {
            setConnected(false);
            setPublicKey(null);
          }
        };

        phantom.on('connect', handleConnect);
        phantom.on('disconnect', handleDisconnect);
        phantom.on('accountChanged', handleAccountChange);

        // 初始化钱包状态
        await initWallet();

        // 清理函数
        return () => {
          phantom.off('connect', handleConnect);
          phantom.off('disconnect', handleDisconnect);
          phantom.off('accountChanged', handleAccountChange);
        };
      }
    };

    setupWalletEvents();
  }, [initWallet]);

  return {
    wallet,
    connected,
    publicKey,
    isConnecting,
    error,
    connect,
    disconnect
  };
};

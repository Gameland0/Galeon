import React, { createContext, useState, useEffect, useCallback } from 'react';
import Web3 from 'web3';
import { Connection } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { getUserCredit, CreditInfo, connectWallet as apiConnectWallet } from '../services/api';

// 钱包类型
export type WalletType = 'metamask' | 'phantom';

// 多钱包上下文类型
interface MultiWalletContextType {
  // 当前主要钱包类型
  primaryWallet: WalletType | null;
  
  // MetaMask 相关
  web3: Web3 | null;
  evmAccount: string | null;
  networkId: number | null;
  
  // Phantom 相关
  solanaConnection: Connection | null;
  solanaAccount: string | null;
  
  // 通用状态
  isAuthenticated: boolean;
  credits: CreditInfo | null;
  
  // 连接状态
  isConnecting: boolean;
  
  // 方法
  connectMetaMask: () => Promise<void>;
  connectPhantom: () => Promise<void>;
  disconnectWallet: () => void;
  setIsAuthenticated: (value: boolean) => void;
  refreshCredits: () => Promise<void>;
  
  // 获取当前活跃账户
  getCurrentAccount: () => string | null;
  getCurrentWalletType: () => WalletType | null;
  
  // 🔧 新增：获取当前钱包实例的方法
  getWeb3Instance: () => Web3 | null;
  getSolanaConnection: () => Connection | null;
}

export const MultiWalletContext = createContext<MultiWalletContextType>({
  primaryWallet: null,
  web3: null,
  evmAccount: null,
  networkId: null,
  solanaConnection: null,
  solanaAccount: null,
  isAuthenticated: false,
  credits: null,
  isConnecting: false,
  connectMetaMask: async () => {},
  connectPhantom: async () => {},
  disconnectWallet: () => {},
  setIsAuthenticated: () => {},
  refreshCredits: async () => {},
  getCurrentAccount: () => null,
  getCurrentWalletType: () => null,
  getWeb3Instance: () => null,
  getSolanaConnection: () => null,
});

export const MultiWalletProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  // 状态管理
  const [primaryWallet, setPrimaryWallet] = useState<WalletType | null>(null);
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [evmAccount, setEvmAccount] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [solanaConnection, setSolanaConnection] = useState<Connection | null>(null);
  const [solanaAccount, setSolanaAccount] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [credits, setCredits] = useState<CreditInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // 获取Phantom钱包当前网络配置的方法
  const getPhantomNetworkConfig = async (provider: any) => {
    // 默认配置 - 使用Solana官方RPC端点
    let rpcEndpoint = 'https://api.mainnet-beta.solana.com';
    let detectedNetwork = 'mainnet';
    
    try {
      // 方法1: 使用 solana_getCluster API
      const cluster = await provider.request({ method: 'solana_getCluster' });
      console.log('🔍 Phantom wallet cluster:', cluster);
      
      if (cluster === 'devnet') {
        rpcEndpoint = 'https://api.devnet.solana.com';
        detectedNetwork = 'devnet';
      } else if (cluster === 'testnet') {
        rpcEndpoint = 'https://api.testnet.solana.com';
        detectedNetwork = 'testnet';
      } else if (cluster === 'mainnet-beta' || cluster === 'mainnet') {
        rpcEndpoint = 'https://api.mainnet-beta.solana.com';
        detectedNetwork = 'mainnet';
      }
      
      console.log('🔍 Network detection successful:', detectedNetwork);
    } catch (networkError) {
      console.warn('🔍 Failed to detect Phantom network, using mainnet default:', networkError);
    }
    
    return { network: detectedNetwork, rpcEndpoint };
  };

  // 初始化时尝试恢复已保存的钱包连接
  useEffect(() => {
    const restoreSavedConnection = async () => {
      const savedWalletType = localStorage.getItem('primaryWallet') as WalletType;
      const savedAuthenticated = localStorage.getItem('isAuthenticated');
      const savedAccount = localStorage.getItem('connectedAccount');
      
      if (savedWalletType && savedAuthenticated === 'true' && savedAccount) {
        try {
          // 只恢复状态，不重新连接钱包
          if (savedWalletType === 'metamask') {
            if (typeof (window as any).ethereum !== 'undefined') {
              const web3Instance = new Web3((window as any).ethereum);
              const accounts = await web3Instance.eth.getAccounts();
              if (accounts.length > 0 && accounts[0].toLowerCase() === savedAccount.toLowerCase()) {
                setWeb3(web3Instance);
                setEvmAccount(accounts[0]);
                const networkIdRaw: string = await (window as any).ethereum.request({ method: 'net_version' });
                const networkId = parseInt(networkIdRaw, 10);
                setNetworkId(networkId);
                setPrimaryWallet('metamask');
                setIsAuthenticated(true);
              } else {
                // 账户不匹配，清理保存的状态
                localStorage.removeItem('primaryWallet');
                localStorage.removeItem('isAuthenticated');
                localStorage.removeItem('connectedAccount');
              }
            }
          } else if (savedWalletType === 'phantom') {
            // 🔧 修复: 使用 window.phantom?.solana (与 connectPhantom 一致)
            const provider = (window as any).phantom?.solana || (window as any).solana;
            if (provider && provider.isPhantom && provider.isConnected) {
              try {
                const publicKey = provider.publicKey?.toString();
                if (publicKey && publicKey === savedAccount) {
                  setSolanaAccount(publicKey);
                  setPrimaryWallet('phantom');
                  setIsAuthenticated(true);
                  
                  // 获取网络配置 (恢复时)
                  console.log('🔍 Starting Phantom network detection (restore)...');
                  const networkConfig = await getPhantomNetworkConfig(provider);
                  const rpcEndpoint = networkConfig.rpcEndpoint;
                  const detectedNetwork = networkConfig.network;
                  
                  console.log('🚀 Restored network configuration:');
                  console.log('🚀 Detected network:', detectedNetwork);
                  console.log('🚀 RPC endpoint:', rpcEndpoint);
                  const connection = new Connection(rpcEndpoint, 'confirmed');
                  setSolanaConnection(connection);
                }
              } catch (error) {
                console.error('Failed to restore Phantom connection:', error);
                localStorage.removeItem('primaryWallet');
                localStorage.removeItem('isAuthenticated');
                localStorage.removeItem('connectedAccount');
              }
            }
          }
        } catch (error) {
          console.error('Failed to restore wallet connection:', error);
          // 清理无效的保存状态
          localStorage.removeItem('primaryWallet');
          localStorage.removeItem('isAuthenticated');
          localStorage.removeItem('connectedAccount');
        }
      }
    };

    restoreSavedConnection();
  }, []);

  // MetaMask 连接
  const connectMetaMask = async () => {
    // 防止重复连接
    if (isConnecting) {
      throw new Error('Connection already in progress. Please wait or check MetaMask popup.');
    }

    // 检测并获取正确的MetaMask provider
    const ethereum = (window as any).ethereum;
    let provider = null;
    
    if (!ethereum) {
      throw new Error('No Ethereum wallet found. Please install MetaMask.');
    }


    // 如果有多个钱包，尝试找到MetaMask
    if (ethereum.providers && ethereum.providers.length > 0) {
      // 多钱包环境，查找MetaMask
      const metamaskProvider = ethereum.providers.find((p: any) => p.isMetaMask);
      if (metamaskProvider) {
        provider = metamaskProvider;
      } else {
        throw new Error('MetaMask not found. Please install MetaMask or disable other wallets temporarily.');
      }
    } else if (ethereum.isMetaMask) {
      // 单个MetaMask环境
      provider = ethereum;
    } else {
      // 可能是其他钱包（如OKX）伪装成主provider
      throw new Error(`Wrong wallet detected. Expected MetaMask, found: ${ethereum.isOKX ? 'OKX' : ethereum.isCoinbaseWallet ? 'Coinbase' : 'Unknown wallet'}.\n\nPlease:\n1. Disable other wallet extensions temporarily\n2. Or use MetaMask as the default wallet\n3. Refresh the page and try again`);
    }

    if (!provider || !provider.request) {
      throw new Error('MetaMask provider not properly initialized.');
    }
    
    setIsConnecting(true);
    
    try {
      // 先检查是否已经连接
      let accounts: string[] = [];
      
      try {
        accounts = await provider.request({ method: 'eth_accounts' });
      } catch (err) {
      }
      
      // 如果没有账户，请求连接
      if (!accounts || accounts.length === 0) {
        
        // 添加用户提示
        
        // 添加小延迟确保弹窗可以正确显示
        await new Promise(resolve => setTimeout(resolve, 100));
        
        accounts = await provider.request({ method: 'eth_requestAccounts' });
      }
      
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found. Please unlock MetaMask and try again.');
      }
      
      const account = accounts[0];
      
      // 初始化 Web3
      const web3Instance = new Web3(provider);
      setWeb3(web3Instance);
      setEvmAccount(account);

      // 获取网络 ID
      const networkIdRaw: string = await provider.request({ method: 'net_version' });
      const networkId = parseInt(networkIdRaw, 10);
      setNetworkId(networkId);
        
        setPrimaryWallet('metamask');
        localStorage.setItem('primaryWallet', 'metamask');
      localStorage.setItem('connectedAccount', account);
        
      // 🔧 后端认证: 签名并调用apiConnectWallet
      const authMessage = `AI-Dapp Authentication: ${Date.now()}`;

      // 添加延迟避免触发 MetaMask 熔断器
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        // Use web3.eth.personal.sign to sign the plain text message
        const signature = await web3Instance.eth.personal.sign(authMessage, account, '');

        // 调用后端进行钱包连接和获取 token
        const { token } = await apiConnectWallet(account, networkId, authMessage, signature);

        // 保存 token 并标记已认证
        localStorage.setItem('token', token);
        setIsAuthenticated(true);
        localStorage.setItem('isAuthenticated', 'true');
      } catch (signError: any) {
        // 如果是熔断器错误，给出明确提示
        if (signError.code === -32603) {
          throw new Error('MetaMask circuit breaker is active. Please:\n\n1. Close all MetaMask popups\n2. Wait 30 seconds\n3. Refresh the page\n4. Try connecting again\n\nIf problem persists, reset MetaMask: Settings → Advanced → Clear activity data');
        }
        throw signError;
      }
        
    } catch (error: any) {
      console.error('🦊 Failed to connect MetaMask:', error);
      console.error('🦊 Error details:', {
        code: error.code,
        message: error.message,
        data: error.data
      });
      
      // 详细的错误处理
      let errorMessage = 'Failed to connect MetaMask';
      if (error.code === 4001) {
        errorMessage = '❌ Connection was rejected. Please:\n\n1. Click the MetaMask extension icon in your browser\n2. Click "Connect" button again\n3. Approve the connection in the MetaMask popup\n\n💡 If you don\'t see a popup, try clicking the MetaMask extension icon.';
      } else if (error.code === -32002) {
        errorMessage = '⏳ A MetaMask request is already pending. Please check your MetaMask extension popup and approve it, then try again.';
      } else if (error.code === -32603) {
        errorMessage = '🔄 Internal error occurred. Please refresh the page and try again.';
      } else if (error.code === 4100) {
        errorMessage = '🔒 Please unlock MetaMask first, then try connecting again.';
      } else if (error.message && error.message.includes('User denied')) {
        errorMessage = '❌ Connection was denied. Please try again and approve the connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // 清理状态
      setWeb3(null);
      setEvmAccount(null);
      setNetworkId(null);
      setPrimaryWallet(null);
      localStorage.removeItem('primaryWallet');
      localStorage.removeItem('connectedAccount');
      
      throw new Error(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  };

  // Phantom 连接
  const connectPhantom = async () => {
    // 防止重复连接
    if (isConnecting) {
      throw new Error('Connection already in progress. Please wait or check Phantom popup.');
    }

    // 🔧 修复: 优先使用 window.phantom?.solana (Phantom 官方推荐)
    // window.solana 已废弃，在多钱包环境下可能指向错误的 provider 导致 "Unexpected error"
    const provider = (window as any).phantom?.solana || (window as any).solana;

    if (!provider || !provider.isPhantom) {
      throw new Error('Phantom wallet not found. Please install Phantom wallet.');
    }

    setIsConnecting(true);
    try {
      // 🔧 修复: 先断开旧连接，避免 Phantom 扩展 service worker 失效后残留状态
      try {
        await provider.disconnect();
      } catch (_) {
        // 忽略断开失败
      }

      // 连接钱包 (带重试: Phantom 扩展 service worker 可能需要时间重新唤醒)
      let response;
      try {
        response = await provider.connect();
      } catch (firstError: any) {
        // 如果首次失败且是 "Unexpected error"，等待后重试一次
        if (firstError?.message?.includes('Unexpected error')) {
          console.warn('⚠️ Phantom connect failed, retrying in 1s...', firstError.message);
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            response = await provider.connect();
          } catch (retryError: any) {
            // 重试也失败，提示用户刷新页面
            throw new Error(
              'Phantom wallet connection failed. The extension may need to be refreshed.\n\n' +
              'Please try:\n' +
              '1. Refresh this page (Ctrl+R / Cmd+R)\n' +
              '2. If still failing, close and reopen the browser'
            );
          }
        } else {
          throw firstError;
        }
      }
      const publicKey = response.publicKey.toString();
      
      setSolanaAccount(publicKey);
      setPrimaryWallet('phantom');
      
      // 获取Phantom钱包网络配置
      console.log('🔍 Starting Phantom network detection...');
      const networkConfig = await getPhantomNetworkConfig(provider);
      const rpcEndpoint = networkConfig.rpcEndpoint;
      const detectedNetwork = networkConfig.network;
      
      console.log('🚀 Final network configuration:');
      console.log('🚀 Detected network:', detectedNetwork);
      console.log('🚀 RPC endpoint:', rpcEndpoint);
      console.log('🚀 Creating Solana connection...');
      
      const connection = new Connection(rpcEndpoint, 'confirmed');
      setSolanaConnection(connection);
      
      console.log('✅ Phantom wallet connected successfully on', detectedNetwork, 'network');
      
      localStorage.setItem('primaryWallet', 'phantom');
      localStorage.setItem('connectedAccount', publicKey);
      
      // 🔧 后端认证: 签名并调用apiConnectWallet
      const authMessageSol = `AI-Dapp Authentication: ${Date.now()}`;
      const { signature: signedSignature } = await provider.signMessage(
        new TextEncoder().encode(authMessageSol),
        'utf8'
      );
      const signatureSol = Buffer.from(signedSignature).toString('hex');
      // 调用后端进行钱包连接和获取 token
      const { token: solToken } = await apiConnectWallet(publicKey, 2, authMessageSol, signatureSol);
      // 保存 token 并标记已认证
      localStorage.setItem('token', solToken);
      setIsAuthenticated(true);
      localStorage.setItem('isAuthenticated', 'true');
      
    } catch (error) {
      console.error('Failed to connect Phantom:', error);
      // 清理状态
      setSolanaAccount(null);
      setPrimaryWallet(null);
      setSolanaConnection(null);
      localStorage.removeItem('primaryWallet');
      localStorage.removeItem('connectedAccount');
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  // 断开连接
  const disconnectWallet = () => {
    setWeb3(null);
    setEvmAccount(null);
    setNetworkId(null);
    setSolanaConnection(null);
    setSolanaAccount(null);
    setPrimaryWallet(null);
    setIsAuthenticated(false);
    setCredits(null);
    
    localStorage.removeItem('primaryWallet');
    localStorage.removeItem('connectedAccount');
    localStorage.removeItem('isAuthenticated');
  };

  // 获取当前活跃账户
  const getCurrentAccount = useCallback((): string | null => {
    if (primaryWallet === 'metamask') {
      return evmAccount;
    } else if (primaryWallet === 'phantom') {
      return solanaAccount;
    }
    return null;
  }, [primaryWallet, evmAccount, solanaAccount]);

  // 获取当前钱包类型
  const getCurrentWalletType = useCallback((): WalletType | null => {
    return primaryWallet;
  }, [primaryWallet]);

  // 🔧 新增：获取Web3实例
  const getWeb3Instance = useCallback((): Web3 | null => {
    if (primaryWallet === 'metamask') {
      return web3;
    }
    return null;
  }, [primaryWallet, web3]);

  // 🔧 新增：获取Solana连接
  const getSolanaConnection = useCallback((): Connection | null => {
    if (primaryWallet === 'phantom') {
      return solanaConnection;
    }
    return null;
  }, [primaryWallet, solanaConnection]);

  // 刷新积分 - 使用useCallback包装
  const refreshCredits = useCallback(async () => {
    const account = getCurrentAccount();
    if (account && isAuthenticated) {
      try {
        const creditInfo = await getUserCredit();
        setCredits(creditInfo);
      } catch (error) {
        console.error('Error fetching credits:', error);
        // 如果获取credit失败，可能需要重新认证
        if (error instanceof Error && error.message.includes('unauthorized')) {
        }
      }
    } else {
    }
  }, [getCurrentAccount, isAuthenticated]);

  // 监听账户变化
  useEffect(() => {
    if (primaryWallet === 'metamask' && web3 && (window as any).ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else if (evmAccount && accounts[0] !== evmAccount) {
          setEvmAccount(accounts[0]);
          localStorage.setItem('connectedAccount', accounts[0]);
          setIsAuthenticated(false);
          localStorage.removeItem('isAuthenticated');
        }
      };

      const handleChainChanged = (chainId: string) => {
        // chainId 是十六进制，需要转换为十进制
        setNetworkId(parseInt(chainId, 16));
      };

      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      (window as any).ethereum.on('chainChanged', handleChainChanged);

      return () => {
        (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
        (window as any).ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [web3, evmAccount, primaryWallet]);

  // 监听认证状态变化，刷新积分
  useEffect(() => {
    if (isAuthenticated) {
      refreshCredits();
    }
  }, [isAuthenticated, refreshCredits]);

  return (
    <MultiWalletContext.Provider value={{
      primaryWallet,
      web3,
      evmAccount,
      networkId,
      solanaConnection,
      solanaAccount,
      isAuthenticated,
      credits,
      isConnecting,
      connectMetaMask,
      connectPhantom,
      disconnectWallet,
      setIsAuthenticated,
      refreshCredits,
      getCurrentAccount,
      getCurrentWalletType,
      getWeb3Instance,
      getSolanaConnection,
    }}>
      {children}
    </MultiWalletContext.Provider>
  );
}; 
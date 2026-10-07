/**
 * Privy Wallet Context
 * Features:
 * 1. Manage Privy embedded wallet
 * 2. Provide wallet connect/disconnect
 * 3. Sign transactions
 * 4. Query balance
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { PrivyProvider, usePrivy, useWallets, useSessionSigners } from '@privy-io/react-auth';
import { useCreateWallet, toSolanaWalletConnectors } from '@privy-io/react-auth/solana'; // 🟣 Solana 钱包创建
import { ethers } from 'ethers';

// 🔧 创建单例 Provider 实例，避免每次调用 refreshBalance 时重复创建
// 这是导致每秒1000+次RPC请求的关键问题
const bscProvider = new ethers.JsonRpcProvider('https://bsc-rpc.publicnode.com');
const baseProvider = new ethers.JsonRpcProvider('https://mainnet.base.org');

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  privyUserId: string | null; // 🆕 Privy User ID (用作唯一用户标识)
  balance: {
    usdt: string;
    bnb: string;
    eth: string;
  };
  login: () => void;
  logout: () => Promise<void>;
  signTransaction: (tx: any) => Promise<string>;
  refreshBalance: () => Promise<void>;
  isLoading: boolean;
  isCreatingWallet: boolean; // 🆕 正在创建钱包状态
  walletCreationFailed: boolean;
  ready: boolean;
  authenticated: boolean;
  getAccessToken: () => Promise<string | null>;
  // 🆕 Session Signer 功能 (EVM)
  sessionSignerEnabled: boolean;
  enableSessionSigner: () => Promise<boolean>;
  checkSessionSignerStatus: () => boolean;
  // 🟣 Solana 支持
  solanaAddress: string | null;
  solanaBalance: string;
  solanaSessionSignerEnabled: boolean;
  enableSolanaSessionSigner: () => Promise<boolean>;
  checkSolanaSessionSignerStatus: () => boolean;
  refreshSolanaBalance: () => Promise<void>;
  createSolanaWallet: () => Promise<void>; // 🆕 创建 Solana 钱包
  isCreatingSolanaWallet: boolean; // 🆕 正在创建 Solana 钱包状态
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

/**
 * Privy Configuration
 */
export const PrivyConfig = {
  appId: 'cmhefv4te0032jp0cqsa4kmh2',
  config: {
    appearance: {
      theme: 'dark',
      accentColor: '#6366f1',
    },
    embeddedWallets: {
      createOnLogin: 'all-users', // 所有用户登录时创建钱包（EVM + Solana）
      requireUserPasswordOnCreate: false,
      noPromptOnSignature: true, // 签名时不提示(重要!)
    },
    // 🟣 Solana RPC 配置（多端点 fallback）
    solana: {
      rpcs: [
        {
          url: 'https://solana-rpc.publicnode.com',
        },
        {
          url: 'https://solana.drpc.org',
        },
        {
          url: 'https://api.mainnet-beta.solana.com',
          subscriptionUrl: 'wss://api.mainnet-beta.solana.com',
        },
      ],
    },
    loginMethods: ['email', 'google', 'wallet'], // 支持邮箱、Google和外部钱包登录
    externalWallets: {
      solana: {
        connectors: toSolanaWalletConnectors(),
      },
    },
    supportedChains: [
      {
        id: 56, // BSC
        name: 'BNB Smart Chain',
        network: 'bsc',
        nativeCurrency: {
          name: 'BNB',
          symbol: 'BNB',
          decimals: 18,
        },
        rpcUrls: {
          default: {
            http: ['https://bsc-rpc.publicnode.com'],
          },
          public: {
            http: ['https://bsc-dataseed.bnbchain.org', 'https://binance.llamarpc.com'],
          },
        },
        blockExplorers: {
          default: {
            name: 'BscScan',
            url: 'https://bscscan.com',
          },
        },
      },
      {
        id: 8453, // Base
        name: 'Base',
        network: 'base',
        nativeCurrency: {
          name: 'ETH',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: {
          default: {
            http: ['https://mainnet.base.org'],
          },
          public: {
            http: ['https://mainnet.base.org', 'https://base.llamarpc.com'],
          },
        },
        blockExplorers: {
          default: {
            name: 'BaseScan',
            url: 'https://basescan.org',
          },
        },
      },
      // 🟣 Solana Mainnet
      {
        id: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // Solana Mainnet CAIP2
        name: 'Solana',
        network: 'solana-mainnet',
        nativeCurrency: {
          name: 'SOL',
          symbol: 'SOL',
          decimals: 9,
        },
        rpcUrls: {
          default: {
            http: ['https://solana-rpc.publicnode.com'],
          },
          public: {
            http: ['https://solana.drpc.org', 'https://api.mainnet-beta.solana.com'],
          },
        },
        blockExplorers: {
          default: {
            name: 'Solscan',
            url: 'https://solscan.io',
          },
        },
      },
    ],
  },
};

/**
 * Internal Wallet Provider (using Privy hooks)
 */
function WalletProviderInner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, user, createWallet, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets(); // All wallets (EVM + Solana)
  const { createWallet: createSolanaWalletAPI } = useCreateWallet(); // 🟣 Solana 钱包创建 API
  const [balance, setBalance] = useState({
    usdt: '0',
    bnb: '0',
    eth: '0',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [walletCreationFailed, setWalletCreationFailed] = useState(false);
  const [sessionSignerEnabled, setSessionSignerEnabled] = useState(false);

  // 🟣 Solana 状态
  const [solanaBalance, setSolanaBalance] = useState('0');
  const [solanaSessionSignerEnabled, setSolanaSessionSignerEnabled] = useState(false);
  const [isCreatingSolanaWallet, setIsCreatingSolanaWallet] = useState(false);

  // 获取 EVM 嵌入式钱包 (Privy SDK v3.13.0+ 支持 chainType)
  const embeddedWallet = wallets.find(
    (wallet: any) => wallet.walletClientType === 'privy' &&
                     (wallet.chainType === 'ethereum' || !wallet.chainType)
  );

  // 🟣 获取 Solana 嵌入式钱包
  const solanaEmbeddedWallet = wallets.find(
    (wallet: any) => wallet.walletClientType === 'privy' && wallet.chainType === 'solana'
  );

  // 从 user.linkedAccounts 中查找 Solana 钱包
  const solanaLinkedAccount = user?.linkedAccounts?.find(
    (account: any) =>
      account.type === 'wallet' &&
      account.chainType === 'solana' &&
      (account.walletClient === 'privy' || account.walletClientType === 'privy')
  );

  const address = embeddedWallet?.address || null;
  // 优先使用 linkedAccounts 中的地址（因为 Solana 钱包可能未连接但已创建）
  const solanaAddress = (solanaLinkedAccount as any)?.address || solanaEmbeddedWallet?.address || null;
  const isConnected = ready && authenticated && !!address;

  // 🔍 Debug: 打印钱包信息
  // 🔧 修复：移除 embeddedWallet 和 solanaEmbeddedWallet 从依赖项
  // 这些是通过 wallets.find() 派生的对象引用，每次都会变化导致无限循环
  useEffect(() => {
    // Wallet debug logs removed
  }, [wallets, walletsReady, ready, authenticated, address, solanaAddress]); // 🔧 移除了 embeddedWallet 和 solanaEmbeddedWallet

  // 钱包地址和用户就绪后，向后端注册（创建 users 记录）
  useEffect(() => {
    if (!address || !authenticated || !user?.id) return;
    const timer = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        await fetch('/api/auto-trade/status', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {}
    }, 1000);
    return () => clearTimeout(timer);
  }, [address, authenticated, user?.id]);

  // 🆕 使用 useSessionSigners 来授权 session signer (TEE 模式)
  const { addSessionSigners } = useSessionSigners();

  // 🔧 新增：检测MetaMask地址变化，自动切换Privy账户
  useEffect(() => {
    const checkMetaMaskBinding = async () => {
      // 只在Privy ready和已认证时检查
      if (!ready || !authenticated || !user) return;

      // 获取当前连接的MetaMask地址
      const ethereum = (window as any).ethereum;
      if (!ethereum) return;

      try {
        const accounts = await ethereum.request({ method: 'eth_accounts' });
        if (accounts.length === 0) return;

        const currentMetaMaskAddress = accounts[0].toLowerCase();

        // 从localStorage获取之前绑定的MetaMask地址
        const savedMetaMaskAddress = localStorage.getItem('privy_bound_metamask_address');

        // console.log('🔍 [Privy] 检查MetaMask绑定:', {
        //   currentMetaMask: currentMetaMaskAddress,
        //   savedMetaMask: savedMetaMaskAddress,
        //   privyUserId: user.id,
        //   embeddedWallet: address,
        // });

        // 如果MetaMask地址变化了，说明用户换了钱包
        if (savedMetaMaskAddress && savedMetaMaskAddress !== currentMetaMaskAddress) {
          // console.log('⚠️ [Privy] 检测到MetaMask地址变化，强制退出Privy并重新登录');
          // console.log(`   旧地址: ${savedMetaMaskAddress}`);
          // console.log(`   新地址: ${currentMetaMaskAddress}`);

          // 清除Privy相关的localStorage
          localStorage.removeItem('privy_bound_metamask_address');
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('privy:') || key.includes('autoTrade_enabled')) {
              localStorage.removeItem(key);
            }
          });

          // 强制退出Privy
          await logout();

          // Prompt user to reconnect
          alert('Wallet address changed detected. Please reconnect to create a new auto-trading account.');
          return;
        }

        // 如果是第一次登录，保存MetaMask地址
        if (!savedMetaMaskAddress && currentMetaMaskAddress) {
          localStorage.setItem('privy_bound_metamask_address', currentMetaMaskAddress);
        }

      } catch (error) {
        console.error('❌ [Privy] 检查MetaMask绑定失败:', error);
      }
    };

    checkMetaMaskBinding();
  }, [ready, authenticated, user, logout]); // 移除 address 避免循环触发

  // 调试日志
  // 🔧 修复：移除 embeddedWallet 从依赖项
  useEffect(() => {
    // console.log('🔍 Privy Context 状态:', {
    //   ready,
    //   authenticated,
    //   hasUser: !!user,
    //   walletsCount: wallets.length,
    //   walletTypes: wallets.map(w => w.walletClientType),
    //   embeddedWalletFound: !!embeddedWallet,
    //   address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null,
    // });
  }, [ready, authenticated, user, wallets, address]); // 🔧 移除了 embeddedWallet

  // 如果用户已登录但没有嵌入式钱包，延迟后手动创建（等待 Privy session 就绪）
  useEffect(() => {
    const hasEmbeddedWallet = wallets.some((w: any) => w.walletClientType === 'privy');
    if (!ready || !authenticated || !user?.id || hasEmbeddedWallet || isCreatingWallet) return;

    const timer = setTimeout(() => {
      setIsCreatingWallet(true);
      setWalletCreationFailed(false);
      createWallet()
        .then(() => { setIsCreatingWallet(false); })
        .catch((error) => {
          if (!error?.message?.includes('already has an embedded wallet')) {
            console.error('Failed to create embedded wallet:', error);
            setWalletCreationFailed(true);
          }
          setIsCreatingWallet(false);
        });
    }, 1500); // 等待 1.5s 让 Privy session 完全就绪

    return () => clearTimeout(timer);
  }, [ready, authenticated, user?.id, wallets.length, createWallet, isCreatingWallet]);

  /**
   * Query balance
   * 🔧 使用 useCallback 包装，避免函数引用每次都变化导致子组件 useEffect 无限触发
   */
  const refreshBalance = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);

    try {
      // 🔧 使用单例 Provider 实例，避免重复创建（每次创建都会触发网络检测，发送大量RPC请求）

      // BNB 余额
      const bnbBalance = await bscProvider.getBalance(address);

      // ETH 余额
      const ethBalance = await baseProvider.getBalance(address);

      // USDT 余额 (BSC)
      const usdtContract = new ethers.Contract(
        '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
        ['function balanceOf(address) view returns (uint256)'],
        bscProvider
      );

      const usdtBalance = await usdtContract.balanceOf(address);

      setBalance({
        usdt: ethers.formatUnits(usdtBalance, 18),
        bnb: ethers.formatEther(bnbBalance),
        eth: ethers.formatEther(ethBalance),
      });
    } catch (error) {
      console.error('Failed to query balance:', error);
    } finally {
      setIsLoading(false);
    }
  }, [address]); // 🔧 只依赖 address，不依赖其他状态

  /**
   * Sign and send transaction
   */
  const signTransaction = async (txData: any): Promise<string> => {
    if (!embeddedWallet) {
      throw new Error('Wallet not connected');
    }

    try {
      // Get provider
      const provider = await embeddedWallet.getEthereumProvider();
      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();

      // Send transaction
      const tx = await signer.sendTransaction(txData);

      // Wait for confirmation
      await tx.wait();

      return tx.hash;
    } catch (error: any) {
      console.error('Transaction failed:', error);
      throw new Error(error.message || 'Transaction failed');
    }
  };

  /**
   * Enable auto trading (using Privy Session Signer - TEE mode)
   * Steps:
   * 1. Call provisionSessionSigner() to authorize wallet to backend
   * 2. Call backend API to confirm authorization success
   */
  const enableSessionSigner = async (): Promise<boolean> => {
    if (!embeddedWallet) throw new Error('Wallet not connected');
    if (!address) throw new Error('Wallet address not found');

    try {
      // 1. 调用 addSessionSigners 让用户授权 (TEE 模式)
      let signerError: any = null;
      try {
        await addSessionSigners({
          address: address,
          signers: [{
            signerId: 'pjmuv0ev4elyiejgc4tzko7w',
            policyIds: []
          }]
        });
      } catch (err: any) {
        // Privy SDK 在 Solana session signer 已启用时，evmAsk.js 重复注入 window.ethereum
        // 导致 "Cannot redefine property: ethereum"，但 delegate 可能已成功
        // 记录错误，继续调后端验证
        if (err.message?.includes('redefine property') || err.message?.includes('ethereum')) {
          console.warn('⚠️ addSessionSigners 注入冲突，继续后端验证...', err.message);
          signerError = err;
        } else {
          throw err;
        }
      }

      // 2. 调用后端 API 验证授权状态（无论 addSessionSigners 是否有注入冲突）
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('无法获取访问令牌');

      const response = await fetch('/api/auto-trade/enable-auto-trade', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
      });

      const result = await response.json();

      if (!response.ok) {
        // 后端确认未授权 — 如果是注入冲突导致的，提示刷新重试
        if (signerError) {
          throw new Error('EVM 授权冲突，请刷新页面后先启用 EVM，再启用 Solana');
        }
        throw new Error(result.message || result.hint || 'Failed to enable');
      }

      // 后端确认 delegated === true，启用成功
      setSessionSignerEnabled(true);
      localStorage.setItem(`autoTrade_enabled_${address}`, 'true');

      return true;

    } catch (error: any) {
      console.error('❌ 启用 Session Signer 失败:', error);

      setSessionSignerEnabled(false);
      localStorage.removeItem(`autoTrade_enabled_${address}`);

      throw error;
    }
  };

  const checkSessionSignerStatus = (): boolean => sessionSignerEnabled;

  /**
   * 🟣 Refresh Solana balance
   * 🔧 使用 useCallback 包装
   */
  const refreshSolanaBalance = useCallback(async () => {
    if (!solanaAddress) {
      return;
    }

    // 🔧 修复: 使用多个 RPC 端点做 fallback，避免单点故障
    const rpcEndpoints = [
      'https://solana-rpc.publicnode.com',
      'https://solana.drpc.org',
      'https://api.mainnet-beta.solana.com',
    ];

    for (const rpcUrl of rpcEndpoints) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [solanaAddress],
          }),
        });
        const result = await response.json();

        if (result.error) {
          throw new Error(result.error.message || 'RPC error');
        }

        const lamports = result.result?.value || 0;
        const sol = (lamports / 1e9).toFixed(4);
        setSolanaBalance(sol);
        return; // 成功则直接返回
      } catch (error) {
        console.warn(`🟣 [Solana Balance] RPC ${rpcUrl} failed:`, error);
        continue; // 尝试下一个 RPC
      }
    }
    console.error('🟣 [Solana Balance] All RPC endpoints failed');
  }, [solanaAddress]);

  /**
   * 🟣 Enable Solana auto trading (using Privy Session Signer)
   * 🧪 测试：使用与 EVM 相同的 Signer ID
   */
  const enableSolanaSessionSigner = async (): Promise<boolean> => {
    if (!solanaAddress) throw new Error('Solana wallet not found');

    try {
      // 🧪 关键测试：使用与 EVM 相同的 Signer ID
      const SHARED_SIGNER_ID = 'pjmuv0ev4elyiejgc4tzko7w';

      await addSessionSigners({
        address: solanaAddress, // Solana 地址
        signers: [{
          signerId: SHARED_SIGNER_ID, // ✅ 与 EVM 相同的 ID
          policyIds: []
        }]
      });

      // 调用后端 API 确认授权
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('无法获取访问令牌');

      const response = await fetch('/api/auto-trade/enable-solana-auto-trade', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.hint || 'Failed to enable Solana auto-trade');
      }

      setSolanaSessionSignerEnabled(true);
      localStorage.setItem(`solana_autoTrade_enabled_${solanaAddress}`, 'true');

      return true;

    } catch (error: any) {
      console.error('❌ [Solana] 启用 Session Signer 失败:', error);
      setSolanaSessionSignerEnabled(false);
      localStorage.removeItem(`solana_autoTrade_enabled_${solanaAddress}`);
      throw error;
    }
  };

  const checkSolanaSessionSignerStatus = (): boolean => solanaSessionSignerEnabled;

  /**
   * 🟣 Create Solana wallet
   */
  const createSolanaWallet = async () => {
    if (!authenticated || !ready) {
      console.error('❌ User not authenticated or not ready');
      throw new Error('User not authenticated');
    }

    // 🔧 从 user.linkedAccounts 检查是否已有 Solana 钱包（更可靠）
    const hasSolanaWallet = user?.linkedAccounts?.some(
      (account: any) =>
        account.type === 'wallet' &&
        account.chainType === 'solana' &&
        (account.walletClient === 'privy' || account.walletClientType === 'privy')
    );

    if (hasSolanaWallet || solanaAddress) {
      alert('Solana 钱包已存在，无需重复创建。');
      return;
    }

    setIsCreatingSolanaWallet(true);
    try {
      // 使用 Privy 的 Solana 专用 API 创建钱包
      // 从 @privy-io/react-auth/solana 导入的 useCreateWallet
      const newWallet = await createSolanaWalletAPI({
        createAdditional: true, // 允许创建额外钱包（用户已有 EVM 钱包，现在创建 Solana 钱包）
      });

      // 等待 Privy 后端保存数据
      await new Promise(resolve => setTimeout(resolve, 3000));

      alert('Solana wallet created successfully!');

    } catch (error: any) {
      console.error('❌ Failed to create Solana wallet:', error);
      console.error('❌ Error details:', error.message, error.stack);
      throw error;
    } finally {
      setIsCreatingSolanaWallet(false);
    }
  };

  // 包装 logout 函数，在退出前立即清空 state
  const handleLogout = async () => {
    // 立即清空所有 state
    setBalance({ usdt: '0', bnb: '0', eth: '0' });
    setSessionSignerEnabled(false);
    setIsCreatingWallet(false);

    // 🟣 清空 Solana 状态
    setSolanaBalance('0');
    setSolanaSessionSignerEnabled(false);

    // 清空 localStorage 中的自动交易状态
    if (address) {
      localStorage.removeItem(`autoTrade_enabled_${address}`);
    }
    if (solanaAddress) {
      localStorage.removeItem(`solana_autoTrade_enabled_${solanaAddress}`);
    }

    // 调用 Privy 的 logout
    await logout();
  };

  // 加载自动交易状态 (检查 Privy 的 delegated 标志)
  useEffect(() => {
    // console.log('🔍 [useEffect] Session Signer 检查触发:', {
    //   hasAddress: !!address,
    //   hasUser: !!user,
    //   address: address ? address.slice(0, 10) + '...' : null
    // });

    const loadStatus = async () => {
      if (!address || !user) {
        // console.log('⚠️ [useEffect] 条件不满足，跳过检查');
        return;
      }

      // console.log('🔍 检查 Session Signer 状态...');

      // 1. 检查是否有 Privy EVM 嵌入式钱包
      // 必须过滤 chainType，避免把 Solana 钱包的状态当成 EVM 的
      const embeddedAccount: any = user.linkedAccounts?.find(
        (account: any) =>
          account.type === 'wallet' &&
          (account.walletClient === 'privy' || account.walletClientType === 'privy') &&
          (account.chainType === 'ethereum' || !account.chainType)
      );

      const hasPrivyWallet = !!embeddedAccount;
      const isDelegated = embeddedAccount?.delegated === true;

      // console.log('🔍 Privy 钱包状态:', {
      //   hasPrivyWallet,
      //   delegated: isDelegated,
      //   walletClient: embeddedAccount?.walletClient || embeddedAccount?.walletClientType,
      //   accountType: embeddedAccount?.type,
      //   mode: 'TEE (嵌入式钱包默认支持后端签名)'
      // });

      // 2. 检查钱包是否已经被委托 (delegated === true)
      if (hasPrivyWallet && isDelegated) {
        // console.log('✅ Session Signer 已启用（钱包已委托）');
        setSessionSignerEnabled(true);
        localStorage.setItem(`autoTrade_enabled_${address}`, 'true');
      } else if (hasPrivyWallet && !isDelegated) {
        // console.log('⚠️ Privy 钱包存在，但尚未委托给后端');
        setSessionSignerEnabled(false);
        localStorage.setItem(`autoTrade_enabled_${address}`, 'false');
      } else {
        // console.log('⚠️ 未检测到 Privy 嵌入式钱包');
        setSessionSignerEnabled(false);
        localStorage.setItem(`autoTrade_enabled_${address}`, 'false');
      }
    };

    if (address && user) loadStatus();
  }, [address, user, getAccessToken]);

  // 🟣 加载 Solana 自动交易状态
  useEffect(() => {
    const loadSolanaStatus = async () => {
      if (!solanaAddress || !user) {
        return;
      }

      // 查找 Solana 嵌入式钱包
      const solanaAccount: any = user.linkedAccounts?.find(
        (account: any) =>
          account.type === 'wallet' &&
          account.chainType === 'solana' &&
          (account.walletClient === 'privy' || account.walletClientType === 'privy')
      );

      const hasSolanaWallet = !!solanaAccount;
      const isDelegated = solanaAccount?.delegated === true;

      if (hasSolanaWallet && isDelegated) {
        setSolanaSessionSignerEnabled(true);
        localStorage.setItem(`solana_autoTrade_enabled_${solanaAddress}`, 'true');
      } else {
        setSolanaSessionSignerEnabled(false);
        localStorage.setItem(`solana_autoTrade_enabled_${solanaAddress}`, 'false');
      }
    };

    if (solanaAddress && user) loadSolanaStatus();
  }, [solanaAddress, user]);

  // 自动刷新余额 (EVM)
  useEffect(() => {
    if (isConnected) {
      refreshBalance();

      // 每 30 秒刷新一次
      const interval = setInterval(refreshBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address]);

  // 🟣 自动刷新 Solana 余额
  useEffect(() => {
    if (solanaAddress) {
      refreshSolanaBalance();

      // 每 30 秒刷新一次
      const interval = setInterval(refreshSolanaBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [solanaAddress]);

  const value: WalletContextType = {
    isConnected,
    address,
    privyUserId: user?.id || null, // 🆕 暴露 Privy User ID
    balance,
    login,
    logout: handleLogout, // 使用包装后的 logout 函数
    signTransaction,
    refreshBalance,
    isLoading,
    isCreatingWallet, // 🆕 正在创建钱包状态
    walletCreationFailed,
    ready,
    authenticated,
    getAccessToken,
    // 🆕 Session Signer 功能 (EVM)
    sessionSignerEnabled,
    enableSessionSigner,
    checkSessionSignerStatus,
    // 🟣 Solana 支持
    solanaAddress,
    solanaBalance,
    solanaSessionSignerEnabled,
    enableSolanaSessionSigner,
    checkSolanaSessionSignerStatus,
    refreshSolanaBalance,
    createSolanaWallet,
    isCreatingSolanaWallet,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Wallet Provider (with Privy Provider)
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PrivyConfig.appId}
      config={PrivyConfig.config as any}
    >
      <WalletProviderInner>{children}</WalletProviderInner>
    </PrivyProvider>
  );
}

/**
 * Use wallet context
 */
export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}

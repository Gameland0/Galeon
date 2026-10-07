import React, { createContext, useState, useEffect } from 'react';
import Web3 from 'web3';
import { getUserCredit, CreditInfo } from '../services/api';


interface Web3ContextType {
  web3: Web3 | null;
  account: string | null;
  networkId: number | null;
  isAuthenticated: boolean;
  credits: CreditInfo | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  setIsAuthenticated: (value: boolean) => void;
  refreshCredits: () => Promise<void>;
}

export const Web3Context = createContext<Web3ContextType>({
  web3: null,
  account: null,
  networkId: null,
  isAuthenticated: false,
  credits: null,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  setIsAuthenticated: () => {},
  refreshCredits: async () => {},
});

export const Web3Provider: React.FC<{children:React.ReactNode}> = ({ children }) => {
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [credits, setCredits] = useState<CreditInfo | null>(null);

  useEffect(() => {
    const connectSavedWallet = async () => {
      const savedAccount = localStorage.getItem('connectedAccount');
      const savedAuthenticated = localStorage.getItem('isAuthenticated');
      if (savedAccount && savedAuthenticated === 'true' && typeof (window as any).ethereum !== 'undefined') {
        try {
          await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
          const web3Instance = new Web3((window as any).ethereum);
          setWeb3(web3Instance);
          const accounts = await web3Instance.eth.getAccounts();
          if (accounts[0].toLowerCase() === savedAccount.toLowerCase()) {
            setAccount(accounts[0]);
            const network = await web3Instance.eth.net.getId();
            setNetworkId(Number(network));
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('connectedAccount');
            localStorage.removeItem('isAuthenticated');
          }
        } catch (error) {
          console.error('Failed to connect to saved wallet:', error);
        }
      }
    };

    connectSavedWallet();
  }, []);

  const connectWallet = async () => {
    if (typeof (window as any).ethereum !== 'undefined') {
      try {
        await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        const web3Instance = new Web3((window as any).ethereum);
        setWeb3(web3Instance);
        const accounts = await web3Instance.eth.getAccounts();
        setAccount(accounts[0]);
        const network = await web3Instance.eth.net.getId();
        setNetworkId(Number(network));
        localStorage.setItem('connectedAccount', accounts[0]);
      } catch (error) {
        console.error('Failed to connect to wallet:', error);
      }
    } else {
      console.error('Ethereum object not found, install MetaMask.');
    }
  };

  const disconnectWallet = () => {
    setWeb3(null);
    setAccount(null);
    setNetworkId(null);
    setIsAuthenticated(false);
    localStorage.removeItem('connectedAccount');
    localStorage.removeItem('isAuthenticated');
  };

  // 🔧 修复：禁用重复的MetaMask事件监听器，避免内存泄漏
  // MultiWalletContext已经处理了这些事件，避免重复监听导致101个监听器
  /*
  // 🔧 修复：Web3Context已废弃，移除重复的MetaMask事件监听器避免内存泄漏
  // MultiWalletContext现在负责处理所有钱包事件
  /*
  useEffect(() => {
    if (web3 && (window as any).ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else if (account && accounts[0] !== account) {
          setAccount(accounts[0]);
          localStorage.setItem('connectedAccount', accounts[0]);
          setIsAuthenticated(false);
          localStorage.removeItem('isAuthenticated');
        }
      };

      const handleNetworkChanged = (networkId: string) => {
        setNetworkId(parseInt(networkId));
      };

      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      (window as any).ethereum.on('networkChanged', handleNetworkChanged);

      return () => {
        (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
        (window as any).ethereum.removeListener('networkChanged', handleNetworkChanged);
      };
    }
  }, [web3, account]);
  */

  const refreshCredits = async () => {
    if (account) {
        try {
            const creditInfo = await getUserCredit();
            setCredits(creditInfo);
        } catch (error) {
            console.error('Error fetching credits:', error);
        }
    }
};

useEffect(() => {
    if (account && isAuthenticated) {
        refreshCredits();
    }
}, [account, isAuthenticated]);

  return (
    <Web3Context.Provider value={{ web3, account, networkId, isAuthenticated, credits, connectWallet, disconnectWallet, setIsAuthenticated, refreshCredits }}>
      {children}
    </Web3Context.Provider>
  );
};

import React, { createContext, useContext, useState } from 'react';
import Web3 from 'web3';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

type BlockchainType = 'evm' | 'solana';

interface BlockchainContextType {
  blockchainType: BlockchainType;
  setBlockchainType: (type: BlockchainType) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  web3: Web3 | null;
  evmAddress: string | null;
  solanaConnection: Connection | null;
  solanaPublicKey: PublicKey | null;
}

const BlockchainContext = createContext<BlockchainContextType | null>(null);

export const useBlockchain = () => {
  const context = useContext(BlockchainContext);
  if (!context) {
    throw new Error('useBlockchain must be used within a BlockchainProvider');
  }
  return context;
};

export const BlockchainProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [blockchainType, setBlockchainType] = useState<BlockchainType>('evm');
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [solanaConnection, setSolanaConnection] = useState<Connection | null>(null);
  const [solanaPublicKey, setSolanaPublicKey] = useState<PublicKey | null>(null);

  const connect = async () => {
    if (blockchainType === 'evm') {
      // EVM 连接逻辑
      if (window.ethereum) {
        const web3Instance = new Web3(window.ethereum);
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        const accounts = await web3Instance.eth.getAccounts();
        setWeb3(web3Instance);
        setEvmAddress(accounts[0]);
      }
    } else {
      // Solana 连接逻辑
      // 注意: 这里的 Solana 连接逻辑是一个简化的示例
      // 在实际应用中,你可能需要使用 @solana/wallet-adapter-react 或其他 Solana 钱包适配器
      const connection = new Connection(clusterApiUrl('devnet'));
      setSolanaConnection(connection);
      // 这里应该有一个钱包连接的逻辑,比如:
      // const wallet = await connectSolanaWallet();
      // setSolanaPublicKey(wallet.publicKey);
    }
  };

  const disconnect = async () => {
    if (blockchainType === 'evm') {
      setWeb3(null);
      setEvmAddress(null);
    } else {
      setSolanaConnection(null);
      setSolanaPublicKey(null);
    }
  };

  return (
    <BlockchainContext.Provider 
      value={{
        blockchainType,
        setBlockchainType,
        connect,
        disconnect,
        web3,
        evmAddress,
        solanaConnection,
        solanaPublicKey,
      }}
    >
      {children}
    </BlockchainContext.Provider>
  );
};

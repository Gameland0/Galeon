import React, { createContext, useContext, useState, useEffect } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { useWallet, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

interface SolanaContextType {
  connection: Connection | null;
  publicKey: PublicKey | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setNetwork: (network: 'mainnet-beta' | 'devnet') => void;
}

const SolanaContext = createContext<SolanaContextType | undefined>(undefined);

export const SolanaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [network, setNetwork] = useState<WalletAdapterNetwork>(WalletAdapterNetwork.Devnet);
  const [connection, setConnection] = useState<Connection | null>(null);

  const wallet = useWallet();

  useEffect(() => {
    const newConnection = new Connection(
      network === WalletAdapterNetwork.Mainnet
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com'
    );
    setConnection(newConnection);
  }, [network]);

  const connect = async () => {
    if (!wallet.connected) {
      await wallet.connect();
    }
  };

  const disconnect = async () => {
    if (wallet.connected) {
      await wallet.disconnect();
    }
  };

  const contextValue: SolanaContextType = {
    connection,
    publicKey: wallet.publicKey,
    connect,
    disconnect,
    setNetwork: (newNetwork: 'mainnet-beta' | 'devnet') => 
      setNetwork(newNetwork === 'mainnet-beta' ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet)
  };

  return (
    <SolanaContext.Provider value={contextValue}>
      {children}
    </SolanaContext.Provider>
  );
};

export const useSolana = () => {
  const context = useContext(SolanaContext);
  if (context === undefined) {
    throw new Error('useSolana must be used within a SolanaProvider');
  }
  return context;
};

export const SolanaWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const wallets = [new PhantomWalletAdapter()];

  return (
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <SolanaProvider>{children}</SolanaProvider>
      </WalletModalProvider>
    </WalletProvider>
  );
};

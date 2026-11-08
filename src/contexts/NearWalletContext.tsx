import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import '@near-wallet-selector/modal-ui/styles.css';
import { NEAR_NETWORK_ID, NEAR_NODE_URL, AGENT_KEY_CONFIG, AGENT_SERVICE_URL } from '../config/near';

// Types
interface NearWalletContextType {
  // Connection state
  accountId: string | null;
  isConnected: boolean;
  isConnecting: boolean;

  // Agent state
  agentAuthorized: boolean;
  agentKeyPublic: string | null;

  // Methods — Step 1: Connect
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;

  // Methods — Step 3: Agent authorization
  authorizeAgent: (hlAddress?: string, strategy?: string) => Promise<{ publicKey: string }>;
  revokeAgent: () => Promise<void>;

  // Wallet selector instance (for signing transactions)
  selector: any | null;
}

const NearWalletContext = createContext<NearWalletContextType>({
  accountId: null,
  isConnected: false,
  isConnecting: false,
  agentAuthorized: false,
  agentKeyPublic: null,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  authorizeAgent: async (_hlAddress?: string, _strategy?: string) => ({ publicKey: '' }),
  revokeAgent: async () => {},
  selector: null,
});

export const useNearWallet = () => useContext(NearWalletContext);

export const NearWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [agentAuthorized, setAgentAuthorized] = useState(false);
  const [agentKeyPublic, setAgentKeyPublic] = useState<string | null>(null);
  const [selector, setSelector] = useState<any>(null);

  // Initialize wallet selector
  useEffect(() => {
    const init = async () => {
      try {
        const { setupWalletSelector } = await import('@near-wallet-selector/core');
        const { setupMeteorWallet } = await import('@near-wallet-selector/meteor-wallet');
        const { setupHereWallet } = await import('@near-wallet-selector/here-wallet');

        const walletSelector = await setupWalletSelector({
          network: NEAR_NETWORK_ID as 'mainnet' | 'testnet',
          modules: [
            setupMeteorWallet(),
            setupHereWallet(),
          ],
        });

        setSelector(walletSelector);

        // Check if already signed in
        const state = walletSelector.store.getState();
        if (state.accounts.length > 0) {
          const account = state.accounts[0];
          setAccountId(account.accountId);
          setIsConnected(true);
          // Check if agent key exists
          checkAgentKey(account.accountId);
        }

        // Subscribe to state changes
        walletSelector.store.observable.subscribe((state: any) => {
          if (state.accounts.length > 0) {
            setAccountId(state.accounts[0].accountId);
            setIsConnected(true);
          } else {
            setAccountId(null);
            setIsConnected(false);
            setAgentAuthorized(false);
            setAgentKeyPublic(null);
          }
        });
      } catch (err) {
        console.error('[NearWallet] Failed to initialize wallet selector:', err);
      }
    };

    init();
  }, []);

  // Check if agent Function-Call Key exists on this account
  const checkAgentKey = useCallback(async (acctId: string) => {
    try {
      const nearApi = await import('near-api-js');
      const near = await nearApi.connect({
        networkId: NEAR_NETWORK_ID,
        keyStore: new nearApi.keyStores.InMemoryKeyStore(),
        nodeUrl: NEAR_NODE_URL,
      });
      const account = await near.account(acctId);
      const keys = await account.getAccessKeys();

      // Find a function-call key for intents.near
      const agentKey = keys.find((k: any) => {
        if (k.access_key.permission === 'FullAccess') return false;
        const perm = k.access_key.permission.FunctionCall;
        return perm.receiver_id === AGENT_KEY_CONFIG.contractId;
      });

      if (agentKey) {
        setAgentAuthorized(true);
        setAgentKeyPublic(agentKey.public_key);
      } else {
        setAgentAuthorized(false);
        setAgentKeyPublic(null);
      }
    } catch (err) {
      console.error('[NearWallet] Failed to check agent key:', err);
    }
  }, []);

  // Step 1: Connect wallet
  const connectWallet = useCallback(async () => {
    if (!selector) {
      console.error('[NearWallet] Wallet selector not initialized');
      return;
    }
    setIsConnecting(true);
    try {
      const { setupModal } = await import('@near-wallet-selector/modal-ui');
      const modal = setupModal(selector, { contractId: AGENT_KEY_CONFIG.contractId });
      modal.show();
    } catch (err) {
      console.error('[NearWallet] Connect failed:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [selector]);

  // Disconnect
  const disconnectWallet = useCallback(() => {
    if (!selector) return;
    const wallet = selector.wallet;
    if (wallet) {
      selector.wallet().then((w: any) => w.signOut());
    }
    setAccountId(null);
    setIsConnected(false);
    setAgentAuthorized(false);
    setAgentKeyPublic(null);
  }, [selector]);

  // Step 3: Authorize agent — generate KeyPair, addKey transaction
  const authorizeAgent = useCallback(async (hlAddress?: string, strategy?: string): Promise<{ publicKey: string }> => {
    if (!selector || !accountId) {
      throw new Error('Wallet not connected');
    }

    // Generate a new Ed25519 key pair for the agent
    const { KeyPairEd25519, PublicKey } = await import('@near-js/crypto');
    const { actionCreators } = await import('@near-js/transactions');
    const keyPair = KeyPairEd25519.fromRandom();
    const publicKey = keyPair.getPublicKey().toString();
    const secretKey = keyPair.toString();

    // Build NAJ-format AddKey action
    const addKeyAction = actionCreators.addKey(
      PublicKey.fromString(publicKey),
      actionCreators.functionCallAccessKey(
        AGENT_KEY_CONFIG.contractId,
        AGENT_KEY_CONFIG.methodNames,
        BigInt(AGENT_KEY_CONFIG.allowance),
      ),
    );

    const wallet = await selector.wallet();
    await wallet.signAndSendTransaction({
      receiverId: accountId,
      actions: [addKeyAction],
    });

    // Send the secret key to agent service
    await fetch(`${AGENT_SERVICE_URL}/api/agent/register-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId,
        publicKey,
        secretKey,
        hlAddress: hlAddress || '',
        strategy: strategy || 'stable',
      }),
    });

    setAgentAuthorized(true);
    setAgentKeyPublic(publicKey);

    return { publicKey };
  }, [selector, accountId]);

  // Step 6: Revoke agent — deleteKey transaction
  const revokeAgent = useCallback(async () => {
    if (!selector || !accountId || !agentKeyPublic) {
      throw new Error('No agent key to revoke');
    }

    const { actionCreators } = await import('@near-js/transactions');
    const { PublicKey } = await import('@near-js/crypto');
    const deleteKeyAction = actionCreators.deleteKey(PublicKey.fromString(agentKeyPublic));

    const wallet = await selector.wallet();
    await wallet.signAndSendTransaction({
      receiverId: accountId,
      actions: [deleteKeyAction],
    });

    // Notify agent service
    await fetch(`${AGENT_SERVICE_URL}/api/agent/revoke-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, publicKey: agentKeyPublic }),
    });

    setAgentAuthorized(false);
    setAgentKeyPublic(null);
  }, [selector, accountId, agentKeyPublic]);

  return (
    <NearWalletContext.Provider
      value={{
        accountId,
        isConnected,
        isConnecting,
        agentAuthorized,
        agentKeyPublic,
        connectWallet,
        disconnectWallet,
        authorizeAgent,
        revokeAgent,
        selector,
      }}
    >
      {children}
    </NearWalletContext.Provider>
  );
};

export default NearWalletContext;

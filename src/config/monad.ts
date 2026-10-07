/**
 * Monad Chain Configuration
 * Used by Brain Link components and Smart Account integration
 */

export const MONAD_CHAIN_ID = parseInt(process.env.REACT_APP_MONAD_CHAIN_ID || '10143');
export const MONAD_CHAIN_ID_HEX = '0x' + MONAD_CHAIN_ID.toString(16);

export const MONAD_CHAIN_CONFIG = {
  chainId: MONAD_CHAIN_ID_HEX,
  chainName: 'Monad',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: [process.env.REACT_APP_MONAD_RPC_URL || 'https://rpc.monad.xyz'],
  blockExplorerUrls: [process.env.REACT_APP_MONAD_EXPLORER_URL || 'https://monadscan.com'],
};

export const MONAD_CONTRACTS = {
  GaleonBrain: process.env.REACT_APP_MONAD_GALEON_BRAIN_ADDRESS || '',
  GaleonRouter: process.env.REACT_APP_MONAD_GALEON_ROUTER_ADDRESS || '',
};

/**
 * Switch MetaMask to Monad network
 */
export async function switchToMonad(): Promise<boolean> {
  if (!window.ethereum) return false;

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_CHAIN_ID_HEX }],
    });
    return true;
  } catch (switchError: any) {
    // Chain not added yet, add it
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [MONAD_CHAIN_CONFIG],
        });
        return true;
      } catch (addError) {
        console.error('Failed to add Monad network:', addError);
        return false;
      }
    }
    console.error('Failed to switch to Monad:', switchError);
    return false;
  }
}

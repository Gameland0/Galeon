/**
 * Monad Wallet Service
 * Basic MetaMask connection + chain switching for Monad
 * Agent Wallet trading is handled by MetaMask Agent Wallet Plugin + Backend
 */

import { MONAD_CHAIN_ID, switchToMonad } from '../config/monad';

/**
 * Connect MetaMask and switch to Monad
 */
export async function connectMetaMaskToMonad(): Promise<string | null> {
  if (!(window as any).ethereum) return null;
  try {
    const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
    await switchToMonad();
    return accounts[0];
  } catch (e) {
    console.error('Connect failed:', e);
    return null;
  }
}

/**
 * Get current connected address
 */
export async function getConnectedAddress(): Promise<string | null> {
  if (!(window as any).ethereum) return null;
  try {
    const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
    return accounts[0] || null;
  } catch (e) {
    return null;
  }
}

// Generated IDL exports for Solana contracts

import SolanaAgentRegistryIDL from './solana_agent_registry.json';
import SolanaTeamRegistryIDL from './solana_team_registry.json';
import SolanaTeamSlotPurchaseIDL from './solana_team_slot_purchase.json';

// Contract addresses (deployed on Devnet)
export const CONTRACT_ADDRESSES = {
  AGENT_REGISTRY: '8gxrSHzLVK5xL79KjhkFXnRPXfsmbrUJtDgV3rrNMBTS',
  TEAM_REGISTRY: 'AgZZ8oQ37eimRFusxJGJuSTpQwkBKRfDa8scVWBxfviH', 
  SLOT_PURCHASE: 'H7HaNptFbTxm4E2s7vdpaPFQFwdLT49YK7Z6BffxiuWm'
} as const;

// Treasury configuration
export const TREASURY_CONFIG = {
  SOL_TREASURY: '8TcQfQY12sMweH9EkvrrXbcgSeB5KGLTUPA4Jmixpm74',
  USDC_TREASURY: '8TcQfQY12sMweH9EkvrrXbcgSeB5KGLTUPA4Jmixpm74',
  DEVNET_USDC_MINT: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'
} as const;

// Export IDL JSON objects
export { 
  SolanaAgentRegistryIDL,
  SolanaTeamRegistryIDL,
  SolanaTeamSlotPurchaseIDL 
};

// TypeScript type definitions
export type SolanaAgentRegistryIDLType = typeof SolanaAgentRegistryIDL;
export type SolanaTeamRegistryIDLType = typeof SolanaTeamRegistryIDL;
export type SolanaTeamSlotPurchaseIDLType = typeof SolanaTeamSlotPurchaseIDL;
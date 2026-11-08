/**
 * NEAR Chain Configuration
 * Used by NEAR Agent components and Intents integration
 */

// Network
export const NEAR_NETWORK_ID = process.env.REACT_APP_NEAR_NETWORK_ID || 'mainnet';
export const NEAR_NODE_URL = process.env.REACT_APP_NEAR_NODE_URL || 'https://free.rpc.fastnear.com';
export const NEAR_WALLET_URL = process.env.REACT_APP_NEAR_WALLET_URL || 'https://wallet.mainnet.near.org';
export const NEAR_HELPER_URL = process.env.REACT_APP_NEAR_HELPER_URL || 'https://helper.mainnet.near.org';

// Intents
export const INTENTS_CONTRACT_ID = 'intents.near';
export const INTENTS_API_BASE = 'https://1click.chaindefuser.com';
export const INTENTS_API_KEY = process.env.REACT_APP_INTENTS_API_KEY || '';

// Agent service
export const AGENT_SERVICE_URL = process.env.REACT_APP_AGENT_SERVICE_URL || 'http://localhost:3001';

// Hyperliquid via Intents
export const HL_USDC_ASSET_ID = '1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054';
export const HL_USDC_DECIMALS = 8;

// Common USDC asset IDs on different chains
export const USDC_ASSETS: Record<string, { assetId: string; decimals: number; label: string }> = {
  ethereum: {
    assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
    decimals: 6,
    label: 'USDC (Ethereum)',
  },
  base: {
    assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
    decimals: 6,
    label: 'USDC (Base)',
  },
  arbitrum: {
    assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
    decimals: 6,
    label: 'USDC (Arbitrum)',
  },
  solana: {
    assetId: 'nep141:sol-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.omft.near',
    decimals: 6,
    label: 'USDC (Solana)',
  },
  bsc: {
    assetId: 'nep141:bsc-0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d.omft.near',
    decimals: 18,
    label: 'USDC (BSC)',
  },
  hyperliquid: {
    assetId: HL_USDC_ASSET_ID,
    decimals: HL_USDC_DECIMALS,
    label: 'USDC (Hyperliquid Perp)',
  },
};

// Function-Call Key config for Agent authorization
export const AGENT_KEY_CONFIG = {
  contractId: INTENTS_CONTRACT_ID,
  methodNames: ['ft_transfer_call'],
  allowance: '500000000000000000000000', // 0.5 NEAR in yoctoNEAR
};

// Wallet Selector config
export const WALLET_SELECTOR_CONFIG = {
  network: NEAR_NETWORK_ID as 'mainnet' | 'testnet',
  modules: [] as any[], // populated at runtime
};

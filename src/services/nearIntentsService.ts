/**
 * NEAR Intents 1Click API Service
 * Frontend directly calls Intents REST API for quotes, status, tokens
 * Agent service handles actual execution (signing with Function-Call Key)
 */

import { INTENTS_API_BASE, INTENTS_API_KEY } from '../config/near';

// Types
export interface IntentsToken {
  assetId: string;
  symbol: string;
  decimals: number;
  blockchain: string;
  contractAddress?: string;
}

export interface IntentsQuote {
  correlationId: string;
  quote: {
    depositAddress: string;
    depositMemo: string | null;
    amountIn: string;
    amountInFormatted: string;
    amountInUsd: string;
    amountOut: string;
    amountOutFormatted: string;
    amountOutUsd: string;
    minAmountOut?: string;
    deadline: string;
    timeEstimate: number;
  };
}

export interface IntentsStatus {
  status: 'PENDING_DEPOSIT' | 'KNOWN_DEPOSIT_TX' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'INCOMPLETE_DEPOSIT';
  swapDetails?: {
    amountOut: string;
    destinationChainTxHashes?: Array<{ hash: string; explorerUrl: string }>;
  };
}

const TERMINAL_STATES = ['SUCCESS', 'FAILED', 'REFUNDED', 'INCOMPLETE_DEPOSIT'];

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (INTENTS_API_KEY) {
    headers['Authorization'] = `Bearer ${INTENTS_API_KEY}`;
  }
  return headers;
}

/**
 * Fetch all supported tokens
 */
export async function fetchTokens(): Promise<IntentsToken[]> {
  const res = await fetch(`${INTENTS_API_BASE}/v0/tokens`);
  if (!res.ok) throw new Error('Failed to fetch tokens');
  return res.json();
}

/**
 * Get a swap quote (dry=true for preview, dry=false for deposit address)
 */
export async function getQuote(params: {
  dry: boolean;
  swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'FLEX_INPUT';
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
  slippageTolerance?: number;
  depositType?: 'ORIGIN_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
  recipientType?: 'DESTINATION_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
  refundType?: 'ORIGIN_CHAIN' | 'INTENTS';
}): Promise<IntentsQuote> {
  const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min from now
  const res = await fetch(`${INTENTS_API_BASE}/v0/quote`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      slippageTolerance: 100, // 1% default
      deadline,
      ...params,
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Quote failed: ${error}`);
  }
  return res.json();
}

/**
 * Submit deposit transaction hash to speed up processing
 */
export async function submitDeposit(txHash: string, depositAddress: string): Promise<void> {
  await fetch(`${INTENTS_API_BASE}/v0/deposit/submit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ txHash, depositAddress }),
  });
}

/**
 * Poll swap status until terminal state
 */
export async function pollStatus(
  depositAddress: string,
  onStatusUpdate?: (status: IntentsStatus) => void,
  maxAttempts = 180,
  intervalMs = 2000,
): Promise<IntentsStatus> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${INTENTS_API_BASE}/v0/status?depositAddress=${depositAddress}`,
      { headers: INTENTS_API_KEY ? { Authorization: `Bearer ${INTENTS_API_KEY}` } : {} },
    );
    const status: IntentsStatus = await res.json();
    onStatusUpdate?.(status);

    if (TERMINAL_STATES.includes(status.status)) {
      return status;
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  throw new Error('Timeout waiting for swap completion');
}

/**
 * Get status once (no polling)
 */
export async function getStatus(depositAddress: string): Promise<IntentsStatus> {
  const res = await fetch(
    `${INTENTS_API_BASE}/v0/status?depositAddress=${depositAddress}`,
    { headers: INTENTS_API_KEY ? { Authorization: `Bearer ${INTENTS_API_KEY}` } : {} },
  );
  return res.json();
}

/**
 * Query intents.near internal balance (USDC deposited into Defuse protocol)
 */
export async function getIntentsBalance(accountId: string, tokenId: string): Promise<string> {
  const { connect, keyStores } = await import('near-api-js');
  const near = await connect({
    networkId: 'mainnet',
    keyStore: new keyStores.InMemoryKeyStore(),
    nodeUrl: 'https://free.rpc.fastnear.com',
  });
  const account = await near.account(accountId);
  const balance = await account.viewFunction({
    contractId: 'intents.near',
    methodName: 'mt_balance_of',
    args: { account_id: accountId, token_id: tokenId },
  });
  return balance || '0';
}

/**
 * Query native NEAR balance for an account (in NEAR, not yoctoNEAR)
 */
export async function getNearBalance(accountId: string): Promise<{ total: string; available: string }> {
  const { connect, keyStores } = await import('near-api-js');
  const near = await connect({
    networkId: 'mainnet',
    keyStore: new keyStores.InMemoryKeyStore(),
    nodeUrl: 'https://free.rpc.fastnear.com',
  });
  const account = await near.account(accountId);
  const bal = await account.getAccountBalance();
  // Convert yoctoNEAR to NEAR (24 decimals)
  const toNear = (yocto: string) => (Number(BigInt(yocto)) / 1e24).toFixed(4);
  return {
    total: toNear(bal.total),
    available: toNear(bal.available),
  };
}

/**
 * Preview: deposit from chain to Intents Balance
 */
export async function previewDepositToIntents(params: {
  originAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
}): Promise<IntentsQuote> {
  return getQuote({
    dry: true,
    swapType: 'EXACT_INPUT',
    originAsset: params.originAsset,
    destinationAsset: params.originAsset, // same asset
    depositType: 'ORIGIN_CHAIN',
    recipientType: 'INTENTS',
    ...params,
  });
}

/**
 * Commit: deposit from chain to Intents Balance (get deposit address)
 */
export async function commitDepositToIntents(params: {
  originAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
}): Promise<IntentsQuote> {
  return getQuote({
    dry: false,
    swapType: 'EXACT_INPUT',
    originAsset: params.originAsset,
    destinationAsset: params.originAsset,
    depositType: 'ORIGIN_CHAIN',
    recipientType: 'INTENTS',
    ...params,
  });
}

/**
 * Preview: swap within Intents Balance (e.g. USDC → HL USDC)
 */
export async function previewIntentsSwap(params: {
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
}): Promise<IntentsQuote> {
  return getQuote({
    dry: true,
    swapType: 'EXACT_INPUT',
    originAsset: params.originAsset,
    destinationAsset: params.destinationAsset,
    depositType: 'INTENTS',
    recipientType: 'INTENTS',
    recipient: params.recipient,
    refundTo: params.recipient,
    refundType: 'INTENTS',
  });
}

/**
 * Preview: withdraw from Intents Balance to chain
 */
export async function previewWithdrawFromIntents(params: {
  originAsset: string;
  amount: string;
  recipient: string; // chain address to receive
  refundTo: string; // NEAR account for refunds
}): Promise<IntentsQuote> {
  return getQuote({
    dry: true,
    swapType: 'EXACT_INPUT',
    originAsset: params.originAsset,
    destinationAsset: params.originAsset,
    depositType: 'INTENTS',
    recipientType: 'DESTINATION_CHAIN',
    recipient: params.recipient,
    refundTo: params.refundTo,
    refundType: 'INTENTS',
  });
}

/**
 * Commit: withdraw from Intents Balance to chain (get deposit address to trigger the swap)
 */
export async function commitWithdrawFromIntents(params: {
  originAsset: string;
  amount: string;
  recipient: string; // chain address to receive
  refundTo: string; // NEAR account for refunds
}): Promise<IntentsQuote> {
  return getQuote({
    dry: false,
    swapType: 'EXACT_INPUT',
    originAsset: params.originAsset,
    destinationAsset: params.originAsset,
    depositType: 'INTENTS',
    recipientType: 'DESTINATION_CHAIN',
    recipient: params.recipient,
    refundTo: params.refundTo,
    refundType: 'INTENTS',
  });
}

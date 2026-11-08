/**
 * NEAR Trust Chain Service
 *
 * Syncs Agent Trust Scores to NEAR on-chain contract.
 * Called when an agent's trust state changes (e.g. PROBATION → VALIDATED, or SUSPENDED).
 *
 * Uses a Function-Call Key stored on the agent service for signing.
 */

import { connect, keyStores, KeyPair, Contract } from 'near-api-js';

// ─── Config ──────────────────────────────────────────────────────────────────

// Trust chain uses its own network config (contract may be on testnet while app is on mainnet)
const NEAR_NETWORK = process.env.TRUST_CHAIN_NETWORK || 'testnet';
const NEAR_NODE_URL = process.env.TRUST_CHAIN_NODE_URL || (NEAR_NETWORK === 'mainnet'
  ? 'https://free.rpc.fastnear.com'
  : 'https://rpc.testnet.near.org');

// Contract deployed to this account
const TRUST_CONTRACT_ID = process.env.TRUST_CONTRACT_ID || 'galeon-trust.testnet';

// Signer account (the owner of the contract)
const SIGNER_ACCOUNT_ID = process.env.NEAR_SIGNER_ACCOUNT_ID || '';
const SIGNER_PRIVATE_KEY = process.env.NEAR_SIGNER_PRIVATE_KEY || '';

// ─── State ───────────────────────────────────────────────────────────────────

let initialized = false;
let contract: any = null;
let signerAccount: any = null;

// ─── Init ────────────────────────────────────────────────────────────────────

async function ensureInit(): Promise<boolean> {
  if (initialized) return !!contract;
  initialized = true;

  if (!SIGNER_ACCOUNT_ID || !SIGNER_PRIVATE_KEY) {
    console.log('[NearTrustChain] No signer credentials — on-chain sync disabled');
    return false;
  }

  try {
    const keyStore = new keyStores.InMemoryKeyStore();
    const keyPair = KeyPair.fromString(SIGNER_PRIVATE_KEY);
    await keyStore.setKey(NEAR_NETWORK, SIGNER_ACCOUNT_ID, keyPair);

    const near = await connect({
      networkId: NEAR_NETWORK,
      keyStore,
      nodeUrl: NEAR_NODE_URL,
    });

    signerAccount = await near.account(SIGNER_ACCOUNT_ID);

    contract = new Contract(signerAccount, TRUST_CONTRACT_ID, {
      viewMethods: ['get_agent', 'get_all_agents', 'get_registry_stats', 'get_trusted_agents'],
      changeMethods: ['register_agent', 'update_trust_score', 'remove_agent'],
    });

    console.log(`[NearTrustChain] Initialized — contract=${TRUST_CONTRACT_ID}, signer=${SIGNER_ACCOUNT_ID}`);
    return true;
  } catch (err: any) {
    console.error(`[NearTrustChain] Init failed: ${err.message}`);
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if on-chain sync is configured and available
 */
export async function isChainSyncEnabled(): Promise<boolean> {
  return ensureInit();
}

/**
 * Register a new agent on-chain (called when agent is first created)
 */
export async function registerAgentOnChain(agentId: string, name: string): Promise<boolean> {
  if (!(await ensureInit())) return false;
  try {
    await (contract as any).register_agent({
      args: { agent_id: agentId, name },
      gas: '30000000000000', // 30 TGas
    });
    console.log(`[NearTrustChain] Registered on-chain: ${agentId}`);
    return true;
  } catch (err: any) {
    // Ignore "already registered" errors
    if (err.message?.includes('already registered')) {
      console.log(`[NearTrustChain] Agent ${agentId} already on-chain, skipping`);
      return true;
    }
    console.error(`[NearTrustChain] Register failed for ${agentId}: ${err.message}`);
    return false;
  }
}

/**
 * Sync trust score to chain (called on state changes)
 */
export async function syncTrustScoreToChain(params: {
  agentId: string;
  state: string;
  signalCount: number;
  evaluatedCount: number;
  correctCount: number;
  anomalyScore: number;
  suspensionReason?: string;
}): Promise<boolean> {
  if (!(await ensureInit())) return false;
  try {
    await (contract as any).update_trust_score({
      args: {
        agent_id: params.agentId,
        state: params.state,
        signal_count: params.signalCount,
        evaluated_count: params.evaluatedCount,
        correct_count: params.correctCount,
        anomaly_score: params.anomalyScore,
        suspension_reason: params.suspensionReason || '',
      },
      gas: '30000000000000', // 30 TGas
    });
    console.log(`[NearTrustChain] Synced ${params.agentId} → ${params.state} (signals=${params.signalCount})`);
    return true;
  } catch (err: any) {
    console.error(`[NearTrustChain] Sync failed for ${params.agentId}: ${err.message}`);
    return false;
  }
}

/**
 * Read agent trust record from chain (view function, no gas needed)
 */
export async function getAgentFromChain(agentId: string): Promise<any | null> {
  if (!(await ensureInit())) return null;
  try {
    return await signerAccount.viewFunction({
      contractId: TRUST_CONTRACT_ID,
      methodName: 'get_agent',
      args: { agent_id: agentId },
    });
  } catch {
    return null;
  }
}

/**
 * Read all agents from chain
 */
export async function getAllAgentsFromChain(): Promise<any[]> {
  if (!(await ensureInit())) return [];
  try {
    return await signerAccount.viewFunction({
      contractId: TRUST_CONTRACT_ID,
      methodName: 'get_all_agents',
      args: {},
    });
  } catch {
    return [];
  }
}

/**
 * Read registry stats from chain
 */
export async function getRegistryStatsFromChain(): Promise<any | null> {
  if (!(await ensureInit())) return null;
  try {
    return await signerAccount.viewFunction({
      contractId: TRUST_CONTRACT_ID,
      methodName: 'get_registry_stats',
      args: {},
    });
  } catch {
    return null;
  }
}

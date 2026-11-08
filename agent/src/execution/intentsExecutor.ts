/**
 * Intents Executor — Executes swaps via NEAR Intents 1Click API
 * Uses Function-Call Key to sign ft_transfer_call on intents.near
 */

import axios from 'axios';
import { NearKeyManager } from '../keys/nearKeyManager';
import { ExecutionLog } from '../store/executionLog';

const INTENTS_API_BASE = process.env.INTENTS_API_BASE || 'https://1click.chaindefuser.com';
const INTENTS_API_KEY = process.env.INTENTS_API_KEY || '';

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (INTENTS_API_KEY) h['Authorization'] = `Bearer ${INTENTS_API_KEY}`;
  return h;
}

export interface SwapParams {
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
  depositType?: string;
  recipientType?: string;
  refundType?: string;
}

export interface SwapResult {
  status: string;
  amountOut?: string;
  txHash?: string;
}

export class IntentsExecutor {
  constructor(
    private keyManager: NearKeyManager,
    private executionLog: ExecutionLog,
  ) {}

  /**
   * Execute a swap: quote → deposit (via Function-Call Key) → poll
   */
  async executeSwap(accountId: string, params: SwapParams): Promise<SwapResult> {
    // 1. Get quote with deposit address
    const quoteRes = await axios.post(`${INTENTS_API_BASE}/v0/quote`, {
      dry: false,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      ...params,
    }, { headers: getHeaders() });

    const quote = quoteRes.data;
    const { depositAddress, amountIn, deadline } = quote.quote;

    console.log(`[IntentsExecutor] Quote: deposit ${amountIn} to ${depositAddress}, deadline ${deadline}`);

    // 2. Execute deposit via Function-Call Key
    // For Intents Balance mode (INTENTS → INTENTS or INTENTS → DESTINATION_CHAIN),
    // we call ft_transfer_call on intents.near using the Function-Call Key
    if (params.depositType === 'INTENTS') {
      const account = await this.keyManager.getSigningAccount(accountId);
      const txResult = await account.functionCall({
        contractId: 'intents.near',
        methodName: 'ft_transfer_call',
        args: {
          receiver_id: depositAddress,
          amount: amountIn,
          msg: JSON.stringify({ correlation_id: quote.correlationId }),
        },
        gas: BigInt('100000000000000'), // 100 TGas
        attachedDeposit: BigInt('1'), // 1 yoctoNEAR for ft_transfer_call
      });

      console.log(`[IntentsExecutor] ft_transfer_call sent, tx: ${(txResult as any)?.transaction?.hash}`);

      // Notify API
      try {
        await axios.post(`${INTENTS_API_BASE}/v0/deposit/submit`, {
          txHash: (txResult as any)?.transaction?.hash,
          depositAddress,
        }, { headers: getHeaders() });
      } catch {
        // non-critical
      }
    }

    // 3. Poll status
    const result = await this.pollStatus(depositAddress);
    return result;
  }

  /**
   * Swap within Intents Balance (no chain deposit needed)
   * Used for: USDC → HL USDC or HL USDC → USDC
   */
  async intentsToIntentsSwap(accountId: string, originAsset: string, destinationAsset: string, amount: string): Promise<SwapResult> {
    return this.executeSwap(accountId, {
      originAsset,
      destinationAsset,
      amount,
      recipient: accountId,
      refundTo: accountId,
      depositType: 'INTENTS',
      recipientType: 'INTENTS',
      refundType: 'INTENTS',
    });
  }

  /**
   * Deposit from Intents Balance to a destination chain
   */
  async intentsToChain(accountId: string, asset: string, amount: string, chainRecipient: string): Promise<SwapResult> {
    return this.executeSwap(accountId, {
      originAsset: asset,
      destinationAsset: asset,
      amount,
      recipient: chainRecipient,
      refundTo: accountId,
      depositType: 'INTENTS',
      recipientType: 'DESTINATION_CHAIN',
      refundType: 'INTENTS',
    });
  }

  /**
   * Send USDC from Intents Balance to Hyperliquid perp balance
   */
  async depositToHL(accountId: string, usdcAsset: string, amount: string, hlAddress: string): Promise<SwapResult> {
    const HL_USDC = '1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054';
    return this.executeSwap(accountId, {
      originAsset: usdcAsset,
      destinationAsset: HL_USDC,
      amount,
      recipient: hlAddress,
      refundTo: accountId,
      depositType: 'INTENTS',
      recipientType: 'DESTINATION_CHAIN',
      refundType: 'INTENTS',
    });
  }

  /**
   * Withdraw USDC from Hyperliquid back to Intents Balance
   */
  async withdrawFromHL(accountId: string, hlUsdcAmount: string): Promise<SwapResult> {
    const HL_USDC = '1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054';
    const BASE_USDC = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
    return this.executeSwap(accountId, {
      originAsset: HL_USDC,
      destinationAsset: BASE_USDC,
      amount: hlUsdcAmount,
      recipient: accountId,
      refundTo: accountId,
      depositType: 'ORIGIN_CHAIN',
      recipientType: 'INTENTS',
    });
  }

  private async pollStatus(depositAddress: string): Promise<SwapResult> {
    const maxAttempts = 180;
    const intervalMs = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      const res = await axios.get(`${INTENTS_API_BASE}/v0/status`, {
        params: { depositAddress },
        headers: INTENTS_API_KEY ? { Authorization: `Bearer ${INTENTS_API_KEY}` } : {},
      });

      const { status, swapDetails } = res.data;

      if (['SUCCESS', 'FAILED', 'REFUNDED', 'INCOMPLETE_DEPOSIT'].includes(status)) {
        return {
          status,
          amountOut: swapDetails?.amountOut,
          txHash: swapDetails?.destinationChainTxHashes?.[0]?.hash,
        };
      }

      await new Promise(r => setTimeout(r, intervalMs));
    }

    return { status: 'TIMEOUT' };
  }
}

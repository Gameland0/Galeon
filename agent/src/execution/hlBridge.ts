/**
 * HL Bridge — Bridges funds between Intents Balance and Hyperliquid
 * Then executes perp trades on HL using existing agent wallet mechanism
 *
 * Flow from document:
 * 1. AI signal: "Long ETH on HL perp"
 * 2. Check HL balance → insufficient → Intents deposit to HL
 * 3. HL agent wallet opens position (approveAgent already done)
 * 4. On close: HL profits → Intents withdraw back
 */

import { IntentsExecutor } from './intentsExecutor';
import { HLTrader, getHLTrader } from './hlTrader';
import { Signal } from '../signals/signalPoller';
import { hlAddressStore } from '../store/hlAddressStore';

const HL_AGENT_KEY = process.env.HL_AGENT_PRIVATE_KEY || '';
const BASE_USDC_ASSET = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
const HL_API_URL = 'https://api.hyperliquid.xyz';

export class HLBridge {
  constructor(private intentsExecutor: IntentsExecutor) {}

  /**
   * Execute a signal on Hyperliquid via Intents bridge
   */
  async executeSignal(accountId: string, signal: Signal): Promise<void> {
    // Step 5-③a: Check HL perp balance
    const hlBalance = await this.getHLBalance(accountId);
    const requiredAmount = 100; // Fixed trade amount for hackathon

    console.log(`[HLBridge] HL balance: ${hlBalance} USDC, need: ${requiredAmount}`);

    // If HL balance insufficient, deposit from Intents
    if (hlBalance < requiredAmount) {
      const deficit = requiredAmount - hlBalance + 1; // +1 for fees
      const deficitRaw = (BigInt(Math.ceil(deficit * 1e6))).toString(); // 6 decimals for USDC

      console.log(`[HLBridge] Depositing ${deficit} USDC to HL via Intents`);

      // Get user's HL address (same as their EVM address linked to NEAR)
      const hlAddress = await this.getHLAddress(accountId);

      let depositResult;
      try {
        depositResult = await this.intentsExecutor.depositToHL(
          accountId,
          BASE_USDC_ASSET,
          deficitRaw,
          hlAddress,
        );
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 400 || status === 422) {
          throw new Error('Insufficient Intents Balance — deposit USDC to fund your account');
        }
        throw new Error(`Intents deposit error: ${err.message}`);
      }

      if (depositResult.status !== 'SUCCESS') {
        if (depositResult.status === 'INCOMPLETE_DEPOSIT') {
          throw new Error('Insufficient Intents Balance — deposit USDC to fund your account');
        }
        throw new Error(`HL deposit failed: ${depositResult.status}`);
      }

      console.log(`[HLBridge] HL deposit complete, amount out: ${depositResult.amountOut}`);
    }

    // Step 5-③a: Execute trade on HL
    await this.executeHLTrade(accountId, signal);
  }

  /**
   * Get Hyperliquid perp USDC balance for an account
   */
  private async getHLBalance(accountId: string): Promise<number> {
    try {
      const hlAddress = await this.getHLAddress(accountId);
      const res = await fetch(HL_API_URL + '/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: hlAddress,
        }),
      });
      const data = await res.json();
      return parseFloat(data?.marginSummary?.accountValue || '0');
    } catch {
      return 0;
    }
  }

  /**
   * Execute a perp trade on Hyperliquid using agent wallet (EIP-712 signing)
   */
  private async executeHLTrade(accountId: string, signal: Signal): Promise<void> {
    if (!HL_AGENT_KEY) {
      console.log(`[HLBridge] HL_AGENT_PRIVATE_KEY not set, skipping HL trade execution`);
      console.log(`[HLBridge] Would execute: ${signal.symbol} ${signal.direction} @ ${signal.entryPrice}`);
      return;
    }

    const hlTrader = getHLTrader();
    const hlAddress = await this.getHLAddress(accountId);
    const tradeAmount = 100; // USDC per trade

    // Open position
    const result = await hlTrader.executeOrder(
      hlAddress,
      signal.symbol,
      signal.direction,
      tradeAmount,
      signal.leverage,
    );

    console.log(`[HLBridge] Order filled: ${result.symbol} ${result.side} @ ${result.entryPrice}, size=${result.size}`);

    // Set stop loss
    if (signal.stopLoss) {
      await hlTrader.setStopLoss(hlAddress, signal.symbol, signal.direction, result.size, signal.stopLoss);
      console.log(`[HLBridge] SL set @ ${signal.stopLoss}`);
    }

    // Set take profit
    if (signal.takeProfit1) {
      await hlTrader.setTakeProfit(hlAddress, signal.symbol, signal.direction, result.size, signal.takeProfit1);
      console.log(`[HLBridge] TP set @ ${signal.takeProfit1}`);
    }
  }

  /**
   * Close a position on HL and withdraw profits to Intents Balance
   */
  async closeAndWithdraw(accountId: string, symbol: string, side: 'LONG' | 'SHORT', size: number): Promise<void> {
    if (!HL_AGENT_KEY) {
      console.log(`[HLBridge] HL_AGENT_PRIVATE_KEY not set, skipping close`);
      return;
    }

    const hlTrader = getHLTrader();
    const hlAddress = await this.getHLAddress(accountId);

    // Close position on HL
    await hlTrader.closePosition(hlAddress, symbol, side, size);
    console.log(`[HLBridge] Closed ${symbol} ${side} size=${size}`);

    // Withdraw profits back to Intents Balance
    const balance = await hlTrader.getBalance(hlAddress);
    if (balance > 1) { // Keep min 1 USDC on HL
      const withdrawAmount = Math.floor((balance - 1) * 1e8).toString(); // 8 decimals for HL USDC
      await this.intentsExecutor.withdrawFromHL(accountId, withdrawAmount);
      console.log(`[HLBridge] Withdrew ${balance - 1} USDC from HL to Intents Balance`);
    }
  }

  /**
   * Get the HL (EVM) address associated with a NEAR account
   */
  private async getHLAddress(accountId: string): Promise<string> {
    const addr = hlAddressStore.getHLAddress(accountId);
    if (!addr) {
      throw new Error(`No HL address registered for ${accountId}. Please set up HL address in dashboard.`);
    }
    return addr;
  }
}

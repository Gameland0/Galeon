/**
 * Signal Poller — Polls all registered sources via FusionEngine
 * Uses weighted-vote fusion, regime guard, and symbol guard before executing
 */

import { RiskCheck } from '../risk/riskCheck';
import { IntentsExecutor } from '../execution/intentsExecutor';
import { HLBridge } from '../execution/hlBridge';
import { ExecutionLog } from '../store/executionLog';
import { hlAddressStore } from '../store/hlAddressStore';
import { FusionEngine } from '../fusion/fusionEngine';

const POLL_INTERVAL_MS = 15_000; // 15 seconds

export interface Signal {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  confidence: number;
  leverage: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  timestamp: string;
  entryReason?: string;
}

export class SignalPoller {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private knownSignalIds = new Set<string>();

  constructor(
    private riskCheck: RiskCheck,
    private intentsExecutor: IntentsExecutor,
    private hlBridge: HLBridge,
    private executionLog: ExecutionLog,
    private fusionEngine: FusionEngine,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  start(accountId: string): void {
    if (this.running) return;
    this.running = true;
    const strategy = hlAddressStore.getStrategy(accountId) || process.env.AI_SERVER_STRATEGY || 'stable';
    console.log(`[SignalPoller] Started for ${accountId}, strategy=${strategy}`);

    this.timer = setInterval(() => this.poll(accountId), POLL_INTERVAL_MS);
    this.poll(accountId);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[SignalPoller] Stopped');
  }

  private async poll(accountId: string): Promise<void> {
    try {
      const strategy = hlAddressStore.getStrategy(accountId) || process.env.AI_SERVER_STRATEGY || 'stable';

      const decisions = await this.fusionEngine.evaluateMarket(strategy);

      for (const decision of decisions) {
        // Only execute LONG/SHORT — WAIT/REDUCE/CLOSE are logged only
        if (decision.action === 'WAIT' || decision.action === 'REDUCE' || decision.action === 'CLOSE') {
          const lastReason = decision.reasoning[decision.reasoning.length - 1];
          console.log(`[SignalPoller] ${decision.symbol} ${decision.action} (${decision.label}) score=${decision.score}: ${lastReason?.detail || ''}`);
          continue;
        }

        // Build signal for execution
        const signalId = `brain-${decision.symbol}-${decision.action}-${Date.now()}`;
        if (this.knownSignalIds.has(signalId)) continue;
        this.knownSignalIds.add(signalId);

        const contributors = decision.externalContributors.length > 0
          ? ` intel=[${decision.externalContributors.join(',')}]`
          : '';
        console.log(`[SignalPoller] ${decision.label}: ${decision.symbol} ${decision.action} score=${decision.score} brain=${decision.brainContributed}${contributors}`);

        const signal: Signal = {
          id: signalId,
          symbol: decision.symbol,
          direction: decision.action as 'LONG' | 'SHORT',
          entryPrice: decision.entryPrice || 0,
          confidence: decision.score,
          leverage: decision.leverage || 3,
          stopLoss: decision.stopLoss || 0,
          takeProfit1: decision.takeProfit1 || 0,
          takeProfit2: decision.takeProfit2,
          timestamp: decision.timestamp,
          entryReason: decision.reasoning.map(r => `${r.step}:${r.impact >= 0 ? '+' : ''}${r.impact}`).join(' '),
        };

        await this.processSignal(accountId, signal);
      }
    } catch (err: any) {
      if (err.code !== 'ECONNREFUSED') {
        console.error('[SignalPoller] Poll error:', err.message);
      }
    }
  }

  private async processSignal(accountId: string, signal: Signal): Promise<void> {
    const riskResult = this.riskCheck.check(accountId, signal, this.executionLog);
    if (!riskResult.allowed) {
      console.log(`[SignalPoller] Risk check rejected: ${riskResult.reason}`);
      this.executionLog.add({
        accountId,
        type: 'OPEN',
        symbol: signal.symbol,
        direction: signal.direction,
        amount: '0',
        status: 'FAILED',
        error: `Risk check: ${riskResult.reason}`,
      });
      return;
    }

    try {
      console.log(`[SignalPoller] Executing via HL: ${signal.symbol} ${signal.direction}`);
      await this.hlBridge.executeSignal(accountId, signal);

      this.executionLog.add({
        accountId,
        type: 'OPEN',
        symbol: signal.symbol,
        direction: signal.direction,
        amount: `${riskResult.tradeAmount} USDC`,
        status: 'SUCCESS',
      });
    } catch (err: any) {
      console.error(`[SignalPoller] Execution failed for ${signal.symbol}:`, err.message);
      this.executionLog.add({
        accountId,
        type: 'OPEN',
        symbol: signal.symbol,
        direction: signal.direction,
        amount: '0',
        status: 'FAILED',
        error: err.message,
      });
    }
  }
}

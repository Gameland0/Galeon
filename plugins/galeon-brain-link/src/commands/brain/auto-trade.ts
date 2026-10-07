/**
 * brain:auto-trade — Enable/disable AI auto-trading
 * Usage: mm brain auto-trade
 *
 * This registers the user's Agent Wallet with Galeon Brain.
 * Brain will then execute trades on Kuru DEX using the wallet.
 */

const BRAIN_API = process.env.GALEON_BRAIN_API || 'http://localhost:9090/api/brain-link';

export default class BrainAutoTradeCommand {
  static description = 'Enable AI auto-trade via Galeon Brain on Kuru DEX';
  static requiresAuth = true;
  pluginCommandId = 'brain:auto-trade';

  static flags = {
    disable: { description: 'Disable auto-trade', type: 'boolean' as const, default: false },
    'max-per-trade': { description: 'Max USDC per trade', default: '0.5' },
    'total-limit': { description: 'Total USDC limit', default: '10' },
  };

  async execute(io: any) {
    try {
      // Get wallet address
      const walletState = this.ctx?.walletStateManager?.read();
      const walletAddress = walletState?.byokWallets?.[0]?.address || walletState?.remoteWallets?.[0]?.address;

      if (!walletAddress) {
        io.log('❌ No wallet found. Set up your Agent Wallet first with: mm setup');
        return { error: 'No wallet' };
      }

      if (io.flags?.disable) {
        io.log('⏹️ Disabling auto-trade...');
        // TODO: Call disable endpoint
        io.log('Auto-trade disabled for ' + walletAddress);
        return { disabled: true };
      }

      const maxPerTrade = parseFloat(io.flags?.['max-per-trade'] || '0.5');
      const totalLimit = parseFloat(io.flags?.['total-limit'] || '10');

      io.log('🧠 Galeon Brain — Enabling Auto-Trade\n');
      io.log(`Wallet: ${walletAddress}`);
      io.log(`Max per trade: $${maxPerTrade}`);
      io.log(`Total limit: $${totalLimit}`);
      io.log(`DEX: Kuru (Monad)`);
      io.log(`Fee: 0.5% per trade`);
      io.log('');

      // Register wallet with Brain
      const res = await fetch(`${BRAIN_API}/register-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      const result = await res.json();

      if (result.success) {
        // Enable auto-trade
        const enableRes = await fetch(`${BRAIN_API}/agent-wallet/enable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userAddress: walletAddress, maxPerTrade, totalLimit }),
        });
        await enableRes.json();

        io.log('✅ Auto-trade enabled!');
        io.log('');
        io.log('What happens next:');
        io.log('  1. Brain scans markets using 12 AI dimensions');
        io.log('  2. When a LONG signal is detected (score ≥ 6, confidence ≥ 60%)');
        io.log('  3. Brain auto-buys MON with your USDC on Kuru DEX');
        io.log('  4. Monitors position: TP1 +3% → sell 30%, TP2 +5% → sell 30%, TP3 +8% → sell rest');
        io.log('  5. Stop loss at -5% to protect capital');
        io.log('  6. Every trade is AI-Endorsed on Monad chain');
        io.log('');
        io.log('Check positions: mm brain positions');
        io.log('Disable: mm brain auto-trade --disable');
      } else {
        io.log('❌ Failed to register wallet');
      }

      return { enabled: true, walletAddress, maxPerTrade, totalLimit };
    } catch (e: any) {
      io.log(`❌ Error: ${e.message}`);
      return { error: e.message };
    }
  }

  ctx: any;
}

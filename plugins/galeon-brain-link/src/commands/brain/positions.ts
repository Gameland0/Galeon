/**
 * brain:positions — View active AI-managed positions
 * Usage: mm brain positions
 */

const BRAIN_API = process.env.GALEON_BRAIN_API || 'http://localhost:9090/api/brain-link';

export default class BrainPositionsCommand {
  static description = 'View active AI-managed positions and PnL';
  static requiresAuth = true;
  pluginCommandId = 'brain:positions';

  async execute(io: any) {
    io.log('🧠 Galeon Brain — Positions\n');

    try {
      const res = await fetch(`${BRAIN_API}/monad/positions`);
      const data = await res.json();

      const active = data.active || [];
      const closed = data.closed || [];

      if (active.length === 0 && closed.length === 0) {
        io.log('No positions. Brain is scanning for signals...');
        io.log('Enable auto-trade with: mm brain auto-trade');
        return { active: [], closed: [] };
      }

      // Active positions
      if (active.length > 0) {
        io.log(`Active Positions (${active.length}):`);
        for (const p of active) {
          const pnl = p.pnlPercent || 0;
          const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}%` : `${pnl.toFixed(2)}%`;
          io.log(`  ${p.asset} ${p.direction} | ${p.monAmount?.toFixed(2)} MON @ $${p.entryPrice?.toFixed(6)} | PnL: ${pnlStr}`);
          io.log(`    TP1: $${p.tp1Price?.toFixed(6)} | SL: $${p.slPrice?.toFixed(6)}`);
          if (p.decisionId) io.log(`    Decision #${p.decisionId} | Trade #${p.tradeId || '—'}`);
        }
      }

      // Closed positions
      if (closed.length > 0) {
        io.log(`\nClosed Positions (${closed.length}):`);
        for (const p of closed) {
          const pnl = (p.totalPnlBps || 0) / 100;
          io.log(`  ${p.asset} ${p.direction} | PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% | ${p.closedReason || 'closed'}`);
        }
      }

      // Balances
      if (data.balances) {
        io.log(`\nBalances: $${data.balances.usdc?.toFixed(2)} USDC | ${data.balances.mon?.toFixed(4)} MON`);
      }
      if (data.currentPrice) {
        io.log(`MON Price: $${data.currentPrice.toFixed(6)}`);
      }

      return data;
    } catch (e: any) {
      io.log(`❌ Error: ${e.message}`);
      return { error: e.message };
    }
  }
}

/**
 * brain:status — Service status and recent activity
 * Usage: mm brain status
 */

const BRAIN_API = process.env.GALEON_BRAIN_API || 'http://localhost:9090/api/brain-link';

export default class BrainStatusCommand {
  static description = 'Check Galeon Brain Link service status';
  static requiresAuth = false;
  pluginCommandId = 'brain:status';

  async execute(io: any) {
    io.log('🧠 Galeon Brain Link — Status\n');

    try {
      // Get decisions
      const decRes = await fetch(`${BRAIN_API}/decisions`);
      const decData = await decRes.json();
      const decisions = decData.decisions || [];

      io.log(`Active Decisions: ${decisions.length}`);
      for (const d of decisions) {
        const dir = d.direction || 'WAIT';
        io.log(`  ${d.asset}: ${dir} ${d.confidence}% ${d.passed ? '✅' : '—'}`);
      }

      // Get activity
      const actRes = await fetch(`${BRAIN_API}/activity?limit=5`);
      const actData = await actRes.json();
      const activities = actData.activities || [];

      if (activities.length > 0) {
        io.log('\nRecent Activity:');
        for (const a of activities) {
          const ago = Math.floor((Date.now() - a.timestamp) / 60000);
          const timeStr = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`;
          io.log(`  [${timeStr}] ${a.asset || ''} — ${a.message}`);
        }
      }

      // Contracts
      io.log('\nContracts (Monad Mainnet):');
      io.log('  GaleonBrain:  0xE1E61ecdc2C98f22A83E22a9207b43Bf64e63f98');
      io.log('  GaleonRouter: 0x1cA4DD0ad2CA0fA171277737925B7e0005DC1622');
      io.log('  Fee Receiver: 0xeD4c2576A79D1BB10f9076A69b7Def188A97909A');
      io.log('  Kuru DEX:     0xb3e6778480b2E488385E8205eA05E20060B813cb');

      io.log('\nAPI: ' + BRAIN_API);
      io.log('Version: 0.1.0');

      return { decisions: decisions.length, activities: activities.length };
    } catch (e: any) {
      io.log(`❌ Brain Link API not reachable: ${e.message}`);
      io.log('Make sure the Brain Link service is running.');
      return { error: e.message };
    }
  }
}

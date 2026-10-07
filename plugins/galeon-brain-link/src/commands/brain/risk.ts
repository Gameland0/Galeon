/**
 * brain:risk — Risk assessment for a proposed trade
 * Usage: mm brain risk MON 1000
 */

const BRAIN_API = process.env.GALEON_BRAIN_API || 'http://localhost:9090/api/brain-link';

export default class BrainRiskCommand {
  static description = 'Assess risk for a proposed trade using Galeon Brain AI';
  static requiresAuth = true;
  pluginCommandId = 'brain:risk';

  static args = {
    token: { description: 'Token symbol', required: true },
    amount: { description: 'Trade amount in USD', required: true },
  };

  async execute(io: any) {
    const token = io.args?.token || 'MON';
    const amount = parseFloat(io.args?.amount || '100');

    io.log(`🧠 Galeon Brain — Risk Assessment for ${token} $${amount}\n`);

    try {
      // Get wallet address for portfolio risk
      let walletAddress = '';
      try {
        const walletState = this.ctx?.walletStateManager?.read();
        walletAddress = walletState?.byokWallets?.[0]?.address || walletState?.remoteWallets?.[0]?.address || '';
      } catch (e) {}

      const res = await fetch(`${BRAIN_API}/assess-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, asset: token, amount, direction: 'LONG' }),
      });
      const risk = await res.json();

      const actionEmoji = risk.action === 'PASS' ? '✅' : risk.action === 'ADJUST' ? '⚠️' : '🛑';

      io.log(`${actionEmoji} ${risk.action}`);
      io.log(`   Risk Score: ${risk.riskScore}/100`);
      io.log(`   Suggested Amount: $${risk.suggestedAmount}`);
      io.log(`   Reason: ${risk.reason}`);

      return risk;
    } catch (e: any) {
      io.log(`❌ Error: ${e.message}`);
      return { error: e.message };
    }
  }

  ctx: any;
}

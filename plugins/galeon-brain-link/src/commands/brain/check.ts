/**
 * brain:check — AI pre-trade check
 * Usage: mm brain check MON
 * Returns: direction, confidence, risk, historical evidence, suggested size
 */

const BRAIN_API = process.env.GALEON_BRAIN_API || 'http://localhost:9090/api/brain-link';

export default class BrainCheckCommand {
  static description = 'Check a token with Galeon Brain AI before trading';
  static requiresAuth = true;
  pluginCommandId = 'brain:check';

  static args = {
    token: { description: 'Token symbol (e.g. MON, WETH)', required: true },
  };

  static flags = {
    amount: { description: 'Trade amount in USD', default: '100' },
  };

  async execute(io: any) {
    const token = io.args?.token || 'MON';
    const amount = parseFloat(io.flags?.amount || '100');

    io.log(`🧠 Galeon Brain checking ${token}...\n`);

    try {
      // Get decision
      const decisionRes = await fetch(`${BRAIN_API}/decision/${token}`);
      const decision = await decisionRes.json();

      if (decision.error) {
        io.log(`No Brain data available for ${token}`);
        return { error: 'No data' };
      }

      // Get risk assessment
      const riskRes = await fetch(`${BRAIN_API}/assess-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: token, amount }),
      });
      const risk = await riskRes.json();

      // Format output
      const dir = decision.direction || 'WAIT';
      const dirEmoji = dir === 'LONG' ? '📈' : dir === 'SHORT' ? '📉' : '⏳';

      io.log(`${dirEmoji} ${dir} ${token}`);
      io.log(`   Confidence: ${decision.confidence}%`);
      io.log(`   Risk Level: ${decision.riskLevel}`);
      io.log(`   Win Rate:   ${decision.winRate}% (${decision.similarSetups} similar setups)`);
      io.log('');
      io.log(`   Why: ${decision.reasoning}`);
      io.log('');
      io.log(`   Entry Zone: $${decision.entryZone?.min?.toFixed(6) || '—'} — $${decision.entryZone?.max?.toFixed(6) || '—'}`);
      io.log(`   Stop Loss:  $${decision.stopLoss?.toFixed(6) || '—'}`);
      io.log(`   Take Profit: $${decision.takeProfit1?.toFixed(6) || '—'}`);
      io.log('');

      if (risk.action === 'ADJUST') {
        io.log(`   ⚠️ Risk: ${risk.reason}`);
        io.log(`   Suggested: $${risk.suggestedAmount} (instead of $${amount})`);
      } else if (risk.action === 'REJECT') {
        io.log(`   🛑 REJECT: ${risk.reason}`);
      } else {
        io.log(`   ✅ Trade looks reasonable for $${amount}`);
      }

      if (decision.decisionId) {
        io.log(`\n   🔗 On-chain Decision ID: #${decision.decisionId}`);
      }

      return {
        token,
        direction: dir,
        confidence: decision.confidence,
        riskLevel: decision.riskLevel,
        winRate: decision.winRate,
        similarSetups: decision.similarSetups,
        reasoning: decision.reasoning,
        riskAction: risk.action,
        suggestedAmount: risk.suggestedAmount,
        decisionId: decision.decisionId,
      };
    } catch (e: any) {
      io.log(`❌ Error: ${e.message}`);
      return { error: e.message };
    }
  }
}

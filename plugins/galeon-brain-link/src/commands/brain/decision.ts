/**
 * brain:decision — Full voting breakdown
 * Usage: mm brain decision MON
 */

const BRAIN_API = process.env.GALEON_BRAIN_API || 'http://localhost:9090/api/brain-link';

export default class BrainDecisionCommand {
  static description = 'Get full AI voting breakdown for a token';
  static requiresAuth = false;
  pluginCommandId = 'brain:decision';

  static args = {
    token: { description: 'Token symbol', required: true },
  };

  async execute(io: any) {
    const token = io.args?.token || 'MON';
    io.log(`🧠 Galeon Brain — ${token} Full Analysis\n`);

    try {
      const res = await fetch(`${BRAIN_API}/decision-detail/${token}`);
      const detail = await res.json();

      if (detail.error) {
        io.log('No data available');
        return { error: 'No data' };
      }

      const dir = detail.direction || 'WAIT';
      io.log(`Direction: ${dir} | Score: ${detail.score > 0 ? '+' : ''}${detail.score} | Threshold: 6 | ${detail.passed ? 'PASSED ✅' : 'BLOCKED ❌'}`);
      io.log(`Bullish: ${detail.bullVotes} | Bearish: ${detail.bearVotes} | Confidence: ${detail.confidence}%\n`);

      // Voting breakdown
      io.log('Voting Breakdown:');
      if (detail.votes) {
        const sorted = [...detail.votes].sort((a: any, b: any) => b.score - a.score);
        for (const v of sorted) {
          const icon = v.score > 0 ? '✅' : v.score < 0 ? '⚠️' : '──';
          const sign = v.score > 0 ? '+' : '';
          io.log(`  ${icon} ${v.dimension.padEnd(12)} ${sign}${v.score}  ${v.reason}`);
        }
      }

      // Market data
      if (detail.marketData) {
        const md = detail.marketData;
        io.log('\nMarket Data:');
        if (md.fr !== undefined) io.log(`  FR: ${md.fr}`);
        if (md.rsi !== undefined) io.log(`  RSI: ${md.rsi}`);
        if (md.takerRatio !== undefined) io.log(`  Taker: ${md.takerRatio}`);
        if (md.smHolders !== undefined) io.log(`  SM Holders: ${md.smHolders}`);
      }

      io.log(`\nSL: $${detail.sl?.toFixed(6) || '—'} | TP1: $${detail.tp1?.toFixed(6) || '—'} | Leverage: ${detail.leverage || '—'}x`);

      return detail;
    } catch (e: any) {
      io.log(`❌ Error: ${e.message}`);
      return { error: e.message };
    }
  }
}

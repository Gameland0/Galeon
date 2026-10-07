# Galeon Brain Link — MetaMask Agent Wallet Plugin

**AI trading intelligence for every trade on Monad.**

This plugin gives MetaMask Agent Wallet the power of Galeon Brain — a 12-dimension AI trading analysis engine trained on 2,900+ real trades.

## What It Does

Before every trade, ask Galeon Brain:

```
mm brain check MON
→ LONG 76% confidence | 184 similar setups | 63% win rate
→ Risk: MEDIUM | Suggested: $420 (not $1000)
→ Reason: Kline breakout + Smart Money accumulating + BTC Trend Up

mm brain auto-trade
→ Enables AI auto-trading on Kuru DEX via your Agent Wallet
→ Brain monitors 24/7, enters on signal, exits on TP/SL
→ 0.5% fee per trade, all AI-Endorsed on Monad chain
```

## Commands

| Command | Description |
|---------|-------------|
| `mm brain check <token>` | AI pre-trade check with direction, confidence, risk |
| `mm brain decision <token>` | Get full voting breakdown (12 dimensions) |
| `mm brain risk <token> <amount>` | Assess risk for a specific trade |
| `mm brain auto-trade` | Enable/disable AI auto-trading |
| `mm brain positions` | View active AI-managed positions |
| `mm brain status` | Service status and recent activity |

## How It Works

1. Galeon Brain analyzes markets using 12 AI dimensions (K-line, RSI, Smart Money, Funding Rate, etc.)
2. Each decision is backed by historical data (184 similar setups, 63% win rate)
3. Trades execute on Kuru DEX (Monad's primary DEX)
4. Every trade is AI-Endorsed on-chain — direction, confidence, and win rate recorded forever
5. Other Monad protocols can read your AI-endorsed trading history

## Install

```bash
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install /path/to/galeon-brain-link
```

## Built for Monad Metropolis Hackathon

- Track: Onchain Finance & Trading
- Bounty: Best Agent Wallet Plugin (MetaMask, $2,500)

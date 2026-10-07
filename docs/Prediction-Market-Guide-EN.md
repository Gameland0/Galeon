# Trade Prediction Market — Product Guide

## Overview

Trade Prediction Market is an on-chain prediction platform where users predict the final profit/loss outcome (PnL%) of live positions opened by the Galeon Brain AI trading system. Predict correctly and share the prize pool.

**How it works:** AI opens position → Users predict final PnL% → AI closes position → Auto settlement → Winners share the pool proportionally

---

## Rules

### Basic Rules

| Item | Description |
|------|-------------|
| Prediction Target | Live contract positions by Galeon Brain AI |
| What to Predict | The final profit/loss percentage (PnL%) of the trade |
| Win Condition | Prediction within ±2% of the actual PnL% |
| Prize Distribution | All winners share 98% of the pool proportional to their bet amount |
| Platform Fee | 2% (deducted at bet time) |
| Betting Currency | USDC (Base chain) |
| Bet Range | $1 ~ $500 |
| Prediction Range | -20% ~ +200% |

### Winning Logic

**Example:** Actual PnL = +5.0%

- Predicted +4.0% (error 1.0%) → ✅ Win
- Predicted +6.5% (error 1.5%) → ✅ Win
- Predicted +8.0% (error 3.0%) → ❌ Lose
- Predicted -2.0% (error 7.0%) → ❌ Lose

### Prize Calculation

```
Your Prize = Total Pool × 98% × (Your Bet / Total Bets of All Winners)
```

Example: Pool is $1,000 with 3 winners who bet $100, $50, and $50
- Winner A ($100 bet): $1,000 × 98% × 100/200 = **$490**
- Winner B ($50 bet): $1,000 × 98% × 50/200 = **$245**
- Winner C ($50 bet): $1,000 × 98% × 50/200 = **$245**

### Special Cases

| Scenario | Handling |
|----------|----------|
| No winners (all predictions off by > 2%) | Pool goes to reserve fund for future trading incentives and platform rewards |
| Everyone wins (all participants qualify) | Full refund of bet amount (fee not refunded) |
| Too many winners causing negative returns | Auto refund of bet amount (fee not refunded) |
| Fewer than 2 participants | Auto cancelled, bets refunded |
| Position already closed | Betting locked, no new bets accepted |

### Fees

| Item | Cost | Note |
|------|------|------|
| Platform Fee | 2% of bet amount | Deducted at bet time, non-refundable |
| Gas Fee | ~$0.01 – $0.05 | Base chain, paid by user |
| Settlement Gas | Free | Covered by the platform |

### Reserve Fund

When no one correctly predicts the outcome (all predictions exceed the ±2% margin), the entire pool is transferred to the reserve fund. Reserve funds will be used for:

- Trading incentive programs (e.g., rewards for top predictors)
- Platform operational rewards
- Community givebacks and promotions

---

## How to Participate

### Step 1: Connect Your Wallet

1. Visit [https://galeon.world/#/prediction](https://galeon.world/#/prediction)
2. Click **Connect Wallet** in the top right corner
3. Select MetaMask or any supported wallet
4. Make sure your wallet is on the **Base** network
5. You'll need **USDC** (on Base) and a small amount of **ETH** for gas fees

### Step 2: Browse Live Prediction Events

1. Open the **Live** tab to see active positions
2. Each card displays:
   - **Token** (e.g., ETHUSDT)
   - **Direction** (LONG / SHORT)
   - **Leverage** (e.g., 10x)
   - **Entry Price** and **Current Price**
   - **Live PnL%**
   - **Players** and **Pool** amount
   - **Win Zone ±2%**

### Step 3: Place Your Prediction

1. Click the **Predict Now** button
2. Fill in two fields:
   - **Final PnL% Prediction**: Enter your predicted final PnL%
     - Positive = profit (e.g., +5.0 means you predict a 5% gain)
     - Negative = loss (e.g., -3.0 means you predict a 3% loss)
   - **Bet Amount (USDC)**: Enter your bet ($1 ~ $500)
3. Click **Confirm Bet**

### Step 4: On-Chain Confirmation

Your bet requires 3 on-chain steps (MetaMask will prompt for each):

1. **Connect** — Auto-connect to Base network
2. **Approve** — Authorize the contract to use your USDC (first time only)
3. **Submit** — Submit your bet on-chain

Once confirmed, you'll see **Bet placed successfully**

### Step 5: Wait for Settlement

- The system settles automatically after the AI closes the position — no action needed
- View results in the **Settled** tab after settlement
- If you win, prizes are automatically sent to your wallet (usually within 1–2 minutes after position closes)

---

## Page Features

### Live
Shows all active prediction events with open positions. Place your bets here.

### Settled
Shows historical settled events. Click to expand and view:
- Actual PnL result
- Winner list with individual payouts
- All participants' predictions and distances

### My Bets
Your personal betting history:
- Bet records (token, prediction, actual result, net P&L, time)
- Summary stats (total bets, win rate, net P&L, best win streak)

### Leaderboard
Platform-wide player rankings sorted by net P&L:
- Top 3 featured with podium display
- Shows address, total bets, wins, win rate, net P&L

---

## FAQ

**Q: Can other people see my prediction?**
A: Yes. In the current version, predictions are stored publicly on-chain.

**Q: Can I bet multiple times on the same event?**
A: No. Each wallet address can only place one bet per event.

**Q: Can I cancel my bet after placing it?**
A: No. Once submitted on-chain, bets are irreversible.

**Q: Why does it say "This prediction event is not yet on-chain"?**
A: The event is still being created on-chain. Please wait a few seconds and try again.

**Q: Why does it say "Please switch to Base network"?**
A: Your wallet is not on the Base network. Please switch to Base in MetaMask.

**Q: When will I receive my winnings?**
A: Winnings are automatically sent to your wallet after settlement, usually within 1–2 minutes of the position closing.

**Q: What happens if no one wins?**
A: The entire pool goes to the reserve fund, which will be used for future trading incentives and platform rewards.

**Q: Can I get the fee refunded?**
A: No. The 2% platform fee is deducted at bet time and is non-refundable, even if the event is cancelled.

**Q: Does betting more give me a better chance of winning?**
A: No. Winning depends solely on how accurate your prediction is. However, if you do win, a larger bet means a larger share of the prize pool.

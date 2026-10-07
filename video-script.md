# Galeon Demo Video Script

## Video Info
- **Duration**: 3-4 minutes
- **Format**: Split screen — Left: Frontend UI / Right: Terminal agent logs
- **Tool**: OBS (recommended for split screen) or Loom
- **Audio**: English voiceover

---

## SCENE 1: Opening (15s)

**Left Screen**: Galeon landing page / AutoTrade dashboard
**Right Screen**: Terminal — server starting up, agents initializing

```
[Galeon]           🚀 Server starting on port 5000...
[Strategy Agent]   ✅ Initialized — loading user strategies
[Signal Agent]     ✅ Initialized — connecting to data sources
[Risk Agent]       ✅ Initialized — circuit breaker: NORMAL
[Execution Agent]  ✅ Initialized — Jupiter router ready
[Portfolio Agent]  ✅ Initialized — monitoring 0 positions
```

**Voiceover**:
> "Galeon is a multi-agent autonomous trading protocol on Solana. Five specialized agents run on the backend, coordinating in real-time to detect signals, assess risk, and execute trades — all without human intervention."

---

## SCENE 2: Strategy Creation (40s)

**Left Screen**: AutoTrade Tab → Trading Settings
- Select strategy type: show all 7 options (TOP_SIGNALS, TWITTER_KOL, TELEGRAM, MEME, RANGE, FUSION, WHITELIST)
- Configure TOP_SIGNALS strategy:
  - Trade amount: 50 USDT
  - Max slippage: 1%
  - Stop-loss: 10%, Take-profit: 50%
  - Enable partial TP: 50% → sell 30%, 100% → sell 30%, 200% → sell 40%
  - Dynamic stop-loss: Trailing mode
- Click Save

**Right Screen**: Terminal logs

```
[Strategy Agent]   📝 New strategy received from user 0x3f...a2
[Strategy Agent]   📋 Type: TOP_SIGNALS | Amount: 50 USDT
[Strategy Agent]   📋 Stop-loss: 10% | Take-profit: 50% (staged)
[Strategy Agent]   📋 Trailing stop: ON | Activation: 20%
[Strategy Agent]   ✅ Strategy deployed — ID: strat_0847
[Signal Agent]     👂 Now listening for TOP_SIGNALS on Solana DEXs
```

**Voiceover**:
> "The Strategy Agent handles user configurations. Here we create a TOP_SIGNALS strategy — the agent will follow high-confidence alpha signals. We set 50 USDT per trade, 10% stop-loss, and staged take-profit at three levels.
>
> On the right you can see the Strategy Agent parsing our config and the Signal Agent starting to listen for matching signals."

---

## SCENE 3: Signal Detection (40s)

### 3a: Twitter KOL (20s)

**Left Screen**: Twitter KOL Config → add KOL handles → KOL Signal History showing detected signals
**Right Screen**:

```
[Signal Agent]     🐦 Twitter monitor active — tracking 3 KOLs
[Signal Agent]     🔍 @CryptoKOL posted: "SOL looking strong, $WIF next leg up"
[Signal Agent]     📊 Token extracted: WIF/SOL | Confidence: 0.82
[Signal Agent]     📡 Signal emitted → forwarding to Risk Agent
```

**Voiceover**:
> "The Signal Agent monitors Twitter KOLs in real-time. It parses their posts, extracts token mentions, and generates signals with confidence scores. Here it detected a WIF call from a tracked KOL."

### 3b: Telegram Group (20s)

**Left Screen**: Telegram Config → authorized groups → Signal History
**Right Screen**:

```
[Signal Agent]     💬 Telegram monitor active — 2 groups connected
[Signal Agent]     🔍 Alpha group message: "BONK entry zone 0.000025"
[Signal Agent]     📊 Token extracted: BONK/USDC | Confidence: 0.78
[Signal Agent]     📡 Signal emitted → forwarding to Risk Agent
```

**Voiceover**:
> "Same for Telegram — the agent parses alpha group messages, identifies token calls, and converts them into trading signals. Multiple signal sources feed into the same execution pipeline."

---

## SCENE 4: Risk Check + Auto Execution (50s)

**Left Screen**: Signal notification appears on UI → Position opens in PositionManager
**Right Screen**: Full agent coordination flow

```
[Signal Agent]     🎯 HIGH CONFIDENCE signal: WIF/SOL | Score: 0.85
[Risk Agent]       🔍 Running pre-trade checks...
[Risk Agent]       ✅ Balance check: 500 USDT available
[Risk Agent]       ✅ Circuit breaker: NORMAL (daily loss: -2.1%)
[Risk Agent]       ✅ Position limit: 2/5 slots available
[Risk Agent]       ✅ Liquidity check: WIF pool TVL $12.4M — sufficient
[Risk Agent]       ✅ Token not blacklisted
[Risk Agent]       🟢 ALL CHECKS PASSED — approved for execution
[Execution Agent]  🔄 Routing 50 USDT → WIF via Jupiter...
[Execution Agent]  📊 Best route: USDT → SOL → WIF (Raydium)
[Execution Agent]  📊 Expected: 1,847 WIF | Slippage: 0.24%
[Execution Agent]  ⛓️  Submitting transaction to Solana...
[Execution Agent]  ✅ TX confirmed: 4xK9...mP2z | Block: 245891032
[Execution Agent]  💰 Bought 1,842 WIF @ $0.02708
[Portfolio Agent]  📂 Position opened: WIF | Entry: $0.02708
[Portfolio Agent]  🎯 Stop-loss set: $0.02437 (-10%)
[Portfolio Agent]  🎯 Take-profit L1: $0.04062 (+50%) → sell 30%
[Portfolio Agent]  👁️  Monitoring started — checking every 15s
```

**Voiceover**:
> "Now watch all five agents coordinate. A high-confidence WIF signal comes in. The Risk Agent runs six checks in sequence — balance, circuit breaker, position limits, liquidity, and blacklist. All green.
>
> The Execution Agent takes over — routes through Jupiter, finds the best path through Raydium, and submits the transaction. Confirmed on Solana in seconds.
>
> The Portfolio Agent immediately opens the position, sets stop-loss and take-profit levels, and begins monitoring every 15 seconds."

**Left Screen**: Open Solscan in new tab → show the actual transaction

**Voiceover**:
> "Every trade is verifiable on-chain. Here's the transaction on Solscan — fully transparent."

---

## SCENE 5: Position Monitoring + Staged Exit (40s)

**Left Screen**: PositionManager → show position with live P&L updating
**Right Screen**:

```
[Portfolio Agent]  📊 WIF position update: +12.3% ($0.03041)
[Portfolio Agent]  📊 WIF position update: +31.7% ($0.03567)
[Portfolio Agent]  📊 WIF position update: +48.9% ($0.04033)
[Portfolio Agent]  🎯 WIF approaching TP Level 1 (+50%)...
[Portfolio Agent]  🎯 WIF HIT TP Level 1: +51.2% ($0.04095)
[Execution Agent]  🔄 Partial exit: selling 30% (553 WIF) via Jupiter...
[Execution Agent]  ✅ TX confirmed: 7bR2...kL4x | Sold 553 WIF @ $0.04095
[Portfolio Agent]  💰 Partial profit taken: +$8.32 USDT
[Portfolio Agent]  📂 Remaining: 1,289 WIF | Trailing stop activated
[Portfolio Agent]  📊 WIF position update: +98.4% ($0.05374)
[Portfolio Agent]  🎯 WIF HIT TP Level 2: +102% ($0.05476)
[Execution Agent]  🔄 Partial exit: selling 30% (387 WIF) via Jupiter...
[Execution Agent]  ✅ TX confirmed: 2mN5...wQ8r | Sold 387 WIF @ $0.05476
[Portfolio Agent]  💰 Partial profit taken: +$11.21 USDT
[Portfolio Agent]  📂 Remaining: 902 WIF | Trailing stop: $0.04928
```

**Voiceover**:
> "The Portfolio Agent tracks P&L in real-time. When WIF hits 50% profit, the Execution Agent automatically sells 30%. At 100% profit, another 30%. Meanwhile, the trailing stop keeps moving up to protect gains.
>
> This staged exit strategy locks in profits while keeping upside exposure — all executed autonomously."

---

## SCENE 6: Risk Protection Demo (20s)

**Left Screen**: Show circuit breaker panel
**Right Screen**:

```
[Risk Agent]       ⚠️  Daily loss approaching limit: -8.7% / -10%
[Risk Agent]       🚨 CIRCUIT BREAKER TRIGGERED — daily loss: -10.2%
[Risk Agent]       🛑 ALL TRADING PAUSED — manual unpause required
[Signal Agent]     📡 New signal received: JUP/SOL | Score: 0.91
[Risk Agent]       ❌ REJECTED — circuit breaker active
[Portfolio Agent]  🔒 Existing positions: stop-loss still active
```

**Voiceover**:
> "When losses hit the daily limit, the Risk Agent triggers the circuit breaker. All new trades are blocked — even high-confidence signals get rejected. But existing stop-losses remain active to protect open positions."

---

## SCENE 7: Closing (15s)

**Left Screen**: Full AutoTrade dashboard — positions, history, stats
**Right Screen**: Agent summary log

```
[Galeon]           📊 Session Summary:
[Strategy Agent]   7 strategy types available
[Signal Agent]     3 signal sources active (Alpha, KOL, Telegram)
[Risk Agent]       24/7 circuit breaker protection
[Execution Agent]  Jupiter-powered optimal routing
[Portfolio Agent]  Real-time P&L + staged take-profit
[Galeon]           🤖 Built for agents, by agents.
```

**Voiceover**:
> "Galeon — five autonomous agents, seven trading strategies, real-time risk management, all running on Solana. No manual trading. No missed signals.
>
> github.com/Gameland0/Galeon"

---

## RECORDING CHECKLIST

### Before Recording
- [ ] Server running with formatted agent logs
- [ ] Frontend loaded with test data (positions, signals, history)
- [ ] OBS configured: left = browser, right = terminal
- [ ] Solscan tab ready to show real transaction
- [ ] Microphone tested for voiceover

### Screen Layout
```
┌─────────────────────┬─────────────────────┐
│                     │                     │
│   Frontend UI       │   Terminal Logs     │
│   (Browser)         │   (Agent Output)    │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

### Agent Log Color Coding (Terminal)
- Strategy Agent → Blue
- Signal Agent → Yellow
- Risk Agent → Red/Green
- Execution Agent → Cyan
- Portfolio Agent → Magenta

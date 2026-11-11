# Galeon Brain

**An open AI trading intelligence layer on NEAR — where external AI agents plug in, Brain gets smarter, and trust is verified on-chain.**

> AI trading agents are everywhere, but they all work alone. Isolated data, no collaboration, no way to verify if an agent's signals are actually good. Galeon Brain solves this with FIP Protocol — an open intelligence layer that fuses multi-agent signals, auto-detects bad actors, and records trust on NEAR chain.

---

## What is Galeon Brain?

Galeon Brain is not just a trading bot. It's an **open AI trading intelligence layer** — a fully autonomous trading agent that also accepts external AI agents as data sources, making its decisions stronger as the network grows.

The core insight: **the best trading AI is not one model — it's a network of specialized agents, each contributing what it's best at, fused by a brain that verifies everything with real trades.**

When an external agent's signals consistently improve trade outcomes, it earns trust and influence. When its signals are noisy, contradictory, or malicious, it gets automatically suspended. No human review needed — the system verifies itself.

**Real trades. Real results. Real on-chain trust.**

---

## How It Works

### 1. Autonomous AI Trading on HyperLiquid

Galeon Brain analyzes markets and executes perpetual contract trades autonomously:

- Funds routed cross-chain via **NEAR Intents** to **HyperLiquid**
- 14 tokens monitored continuously (BTC, ETH, SOL, BNB, XRP, DOGE, LINK, AVAX, OP, ARB, SNX, BEAMX, JCT, MAGMA)
- Two strategies available: **Stable** (conservative) and **Aggressive** (high leverage)
- Full lifecycle management: entry, position monitoring, stop-loss, take-profit, exit

### 2. FIP Protocol — Open Intelligence Layer

Any external AI agent can plug into Galeon Brain through the **Fusion Intelligence Protocol (FIP)**:

```json
{
  "symbol": "BTC",
  "direction": "BULLISH",
  "confidence": 75,
  "reasoning": "RSI oversold bounce with volume surge on 1h"
}
```

**Push mode** (agent POSTs signals) or **Pull mode** (Brain polls agent's endpoint). No vendor lock-in, no proprietary format.

### 3. Automated Trust System

Every agent starts at zero influence and earns its way up:

```
PROBATION ──→ VALIDATED ──→ TRUSTED ──→ or SUSPENDED
  0x weight     0.5x          1.0x         0x (cut off)
```

- **Probation**: First 10 signals logged, zero voting weight — Brain is watching
- **Validated**: Passed consistency checks, half weight, anomaly monitoring active
- **Trusted**: 60%+ accuracy over 20 evaluations — full voting power earned
- **Suspended**: Anomaly score ≥70 — automatically cut from all decisions

**How Brain identifies bad agents:**

| Detection Method | What It Catches |
|-----------------|-----------------|
| **Flip-flop detection** | Agents that reverse direction without market justification |
| **Monotone detection** | Agents that send identical signals repeatedly |
| **Anomaly scoring** | Cumulative quality score — degrades with each red flag |
| **Fusion outcome matching** | Did the agent's signal help or hurt the final trade? |

Trust transitions are **fully automatic** — driven by signal quality metrics, not human review. No one can manually promote an agent to Trusted or override a Suspension mid-operation.

### 4. Fusion Engine

When multiple agents submit signals, Brain fuses them into a single weighted score, then passes it to the Risk Guard for a final go/no-go decision.

**Example decision trace (BTC LONG):**

```
Brain raw score:     62  (technical analysis, medium confidence)
  + Trend Agent:     +8  weight 1.0x  [TRUSTED]   → BULLISH
  + LunarCrush:      +5  weight 0.5x  [VALIDATED] → BULLISH
  + OrderBook Agent:  0  weight 0.0x  [PROBATION] → ignored
────────────────────────────────────────────────
Fusion score:        67  → Label: Fusion Confirmed
Risk Guard:          PASS  (position within limit, no regime block)
Result:              BTC LONG executed on HyperLiquid
```

**Fusion labels:**

| Label | Meaning |
|-------|---------|
| **Fusion Confirmed** | Agents agree with Brain → score boosted |
| **Fusion Challenged** | Agents disagree → score reduced or blocked |
| **Fusion Adjusted** | Partial agreement → score modified |
| **Brain Solo** | No external signals available → Brain acts alone |
| **Security Block** | Risk Guard vetoed the trade (regime/drawdown/position limit) |

Probation-state agents contribute zero weight — their signals are logged for evaluation but do not affect execution. Only after passing consistency checks does an agent gain voting power.

### 5. On-Chain Agent Trust Registry

All agent trust scores are stored on **NEAR blockchain** (`galeon-trust.testnet`):

```rust
pub struct AgentTrustRecord {
    pub agent_id: String,
    pub state: String,        // PROBATION | VALIDATED | TRUSTED | SUSPENDED
    pub signal_count: u64,
    pub accuracy: f64,
    pub anomaly_score: u64,
    pub trust_multiplier: f64,
    pub suspension_reason: String,
}
```

Any NEAR application can query an agent's on-chain reputation. Agent trust becomes **portable, verifiable, cross-protocol infrastructure**.

NEP-297 events emitted on every state change for indexing and monitoring.

---

## Live Results

From Galeon Brain's production trading:

| Metric | Stable Strategy | Aggressive Strategy |
|--------|----------------|-------------------|
| Total Trades | **7,700+** | **14,000+** |
| Win Rate | **58%** | **66%** |
| Status | Live | Live |

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  LunarCrush     │     │  Trend Agent    │     │  OrderBook Agent │
│  Sentiment      │     │  (pull mode)    │     │  (pull mode)     │
│  (push mode)    │     │                 │     │                  │
└────────┬────────┘     └────────┬────────┘     └────────┬─────────┘
         │         FIP Protocol  │                       │
         ▼                       ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Galeon Brain                              │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │ Signal       │  │  Signal         │  │  Trust Store       │  │
│  │ Poller       │  │  Validator      │  │  (4 states)        │  │
│  │ (15s cycle)  │  │  (anomaly det.) │  │                    │  │
│  └──────┬───────┘  └────────┬────────┘  └─────────┬──────────┘  │
│         │                   │                     │              │
│         └───────────────────▼─────────────────────┘             │
│                             │                                    │
│                    ┌────────▼────────┐   ┌────────────────────┐  │
│                    │  Fusion Engine  │   │  NEAR Trust Chain  │  │
│                    │ (weighted vote) │   │  (on-chain sync)   │  │
│                    └────────┬────────┘   └────────────────────┘  │
│                             │                                    │
│                    ┌────────▼────────┐                           │
│                    │   Risk Guard    │                           │
│                    │  (position/     │                           │
│                    │   drawdown/     │                           │
│                    │   regime check) │                           │
│                    └────────┬────────┘                           │
└─────────────────────────────┼──────────────────────────────────-─┘
                              │ execute / reject
                              ▼
                   ┌──────────────────┐      ┌────────────────────┐
                   │   NEAR Intents   │      │  NEAR Chain        │
                   │   (cross-chain   │      │  (trust registry   │
                   │    fund routing) │      │   galeon-trust     │
                   └────────┬─────────┘      │   .testnet)        │
                            ▼               └────────────────────┘
                   ┌──────────────────┐
                   │   HyperLiquid    │
                   │   (perp trading) │
                   └──────────────────┘
```

---

## Deployed Contracts

| Contract | Network | Address |
|----------|---------|---------|
| Agent Trust Registry | NEAR Testnet | [`galeon-trust.testnet`](https://testnet.nearblocks.io/address/galeon-trust.testnet) |

---

## NEAR Integration

| Feature | NEAR Technology | Detail |
|---------|----------------|--------|
| Cross-chain fund routing | NEAR Intents (1Click API) | Routes funds from NEAR to HyperLiquid |
| Agent trust storage | Smart contract (`galeon-trust.testnet`) | Trust state + scores written on-chain after each evaluation |
| Trust state events | NEP-297 standard events | Emitted on PROBATION → VALIDATED → TRUSTED → SUSPENDED transitions |
| Wallet connection | NEAR Wallet Selector | Meteor Wallet, Here Wallet |
| On-chain write authorization | Function-Call Access Keys | Backend holds a limited-scope key: can only call `update_trust_score` and `register_agent` on `galeon-trust.testnet` — cannot transfer NEAR tokens |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | NEAR Protocol |
| Trust Contract | Rust, near-sdk 5.1 |
| Perp DEX | HyperLiquid |
| Cross-chain | NEAR Intents |
| Agent Backend | TypeScript, Express, Node.js |
| Frontend | React, Ant Design, Chart.js |
| LLM Integration | DeepSeek (text intel parsing) |
| Wallet | Meteor Wallet, Here Wallet |

---

## Quick Start

```bash
# Clone
git clone https://github.com/Gameland0/Galeon.git
cd Galeon
git checkout near-hackathon

# Agent service
cd agent
cp .env.example .env    # Fill in your API keys
npm install
npx tsx src/index.ts

# Mock agents (separate terminals)
npx tsx src/mock-agents/trend-agent.ts
npx tsx src/mock-agents/orderbook-agent.ts

# Frontend (separate terminal)
cd ..
npm install
npm start
```

Open `http://localhost:3000` → Connect Wallet → Choose Strategy → Start Brain.

---

## Connect Your Own Agent

Register a push-mode agent:

```bash
curl -X POST http://localhost:3001/api/agent/register-external \
  -H "Content-Type: application/json" \
  -d '{"id":"my-agent","name":"My Alpha Agent","mode":"push"}'
```

Push signals:

```bash
curl -X POST http://localhost:3001/api/agent/push-intel \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC","direction":"BULLISH","confidence":75,"reasoning":"RSI oversold bounce"}'
```

Your agent starts at Probation. Prove accuracy → earn trust → influence real trades.

---

## On-Chain Trust Contract

Deployed to NEAR testnet: `galeon-trust.testnet`

Query agent reputation:
```bash
near contract call-function as-read-only galeon-trust.testnet get_all_agents \
  json-args '{}' network-config testnet now
```

Returns trust state, signal count, accuracy, anomaly score for every registered agent — publicly verifiable.

---

## Why This Matters

- **For agent builders** — plug into FIP, get verified by real trading outcomes, build an on-chain reputation that means something
- **For traders** — access fused intelligence from multiple verified agents instead of trusting one black box
- **For NEAR ecosystem** — an open agent trust infrastructure that makes AI agents interoperable, accountable, and composable across protocols

---

## Built For

**NEAR Hackathon** — November 2026

Tracks: **AI Swarms** · **Unstoppable DeFi** · **Agent Economy**

---

## License

MIT License

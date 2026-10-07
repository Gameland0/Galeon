# Galeon Brain

## Overview

Galeon Brain is a **DeFi Cognition Engine** — it understands crypto market dynamics and outputs structured market intelligence for any trading agent, DApp, or wallet to consume.

Brain answers one question: **What stage is this token in, where is it going, and why?**

It is not a trading bot. It does not execute trades. It **thinks**.

---

## How It Works

Brain combines two layers:

- **Rules Engine** — Code handles all repeatable analysis: statistics, pattern detection, stage classification, confidence scoring. Instant, deterministic, always available.

- **Thinking Engine (LLM)** — Handles what code cannot: reasoning about *why* patterns exist, diagnosing problems, discovering non-linear signal combinations, judging whether a trading decision makes sense.

Code does the work. LLM does the thinking.

---

## Token Lifecycle

Brain classifies tokens into seven lifecycle stages:

```
Discovery → Early Breakout → Acceleration → Exhaustion → Distribution → Decline → Rug Danger
```

For each token, Brain predicts:
- Which stage it is in now
- Which stage comes next (with probability)
- Price direction across three timeframes (1h / 4h / 24h)
- Risk signals and confidence level

---

## Learning System

Brain learns from real trading data — not from assumptions or historical backtests.

**DataMiner** continuously analyzes hundreds of real trades to:
- Discover where win rates change (breakpoints)
- Find multi-factor combinations that outperform or underperform
- Automatically generate trading rules from data
- Detect systematic problem patterns

Example discovery: DataMiner found that funding rate 0.03-0.05% with LONG direction has 80% win rate, while above 0.05% it drops to 35%. This breakpoint was discovered from data, not hardcoded.

Rules are updated automatically as new trades come in. Brain today is different from Brain yesterday.

**Thinker (LLM)** receives DataMiner's statistical findings and reasons about them:
- Why does this pattern exist?
- Under what conditions would it fail?
- What cross-dimensional relationships might statistics miss?

---

## Cognition Output

Brain produces a unified market cognition for any token:

```json
{
  "token": "SKYAIUSDT",
  "cognition": {
    "token_stage": "early_breakout",
    "market_state": "consolidation",
    "confidence": 0.68
  },
  "predictions": {
    "1h": { "direction": "up", "change_pct": 1.2 },
    "4h": { "direction": "up", "change_pct": 3.0 },
    "24h": { "direction": "sideways", "change_pct": 0.5 }
  },
  "scenarios": [
    { "path": "acceleration", "prob": 0.55 },
    { "path": "exhaustion", "prob": 0.30 },
    { "path": "distribution", "prob": 0.15 }
  ],
  "risk_signals": ["funding_rising_watch"],
  "context": {
    "regime": "bull",
    "sector_momentum": "positive"
  }
}
```

---

## Design Principles

**Data Over Assumptions** — Rules come from real trade outcomes, not intuition. Every threshold is discovered, not hardcoded.

**Self-Improving** — Every trade outcome feeds back: DataMiner re-analyzes, rules update, parameters auto-adjust. Continuously, measurably getting better.

**Fail-Safe** — LLM unavailable? Rules engine handles everything. Data feed interrupted? Historical patterns provide guidance. The system degrades gracefully, never stops.

**Separation of Concerns** — Repeatable computation is code. Reasoning and judgment is LLM. Neither does the other's job.

---

## Use Cases

| Consumer | How They Use Brain |
|----------|-------------------|
| **Trading Agents** | Get structured cognition to decide entries, exits, position sizing |
| **DApps / Wallets** | Display token stage, risk level, and market outlook to users |
| **AI Agent Platforms** | Use Brain as the market understanding layer for autonomous agents |
| **Individual Traders** | Query "is this token safe?" via API or interface |

---

## Current Status

Brain has been running in production analyzing DeFi markets:

- 60,000+ cognition cycles completed
- 650+ real trades analyzed by DataMiner
- 66 auto-generated rules currently active
- 27 statistical breakpoints discovered
- 1,800+ verified experiences in memory
- Multi-timeframe predictions (1h / 4h / 24h)
- Market regime detection (bull / bear / transition)

---

## Roadmap

**Current** — Self-learning cognition engine with data-driven rules, multi-timeframe predictions, and LLM reasoning.

**Next** — DeFi Cognition API for external integrations. Real-time trade judgment for agent supervision. Cross-token sector intelligence. Domain-specific fine-tuned model from accumulated experience.

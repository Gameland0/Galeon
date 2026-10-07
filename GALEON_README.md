# Galeon

**A self-evolving AI trading agent that learns from every trade it makes.**

Galeon is not another signal bot or rule-based trading tool. It is an autonomous trading cognition system that perceives multi-dimensional market data, makes decisions, executes trades, and — most importantly — **automatically learns from outcomes to continuously improve its own strategy.**

Over **2,000+ live trades** executed, achieving **58% win rate** and **250%+ cumulative profit**, with performance still improving as the system evolves.

---

## Core Innovation

Most trading bots follow a fixed playbook: when rules work, they profit; when the market shifts, they bleed — until a human manually re-tunes them. **Galeon closes this loop autonomously.**

### The Self-Evolution Cycle

```
  Perceive ──► Cognize ──► Decide ──► Execute
     ▲                                    │
     │                                    ▼
  Evolve ◄── Backtest ◄── Analyze ◄── Review
```

Every trade Galeon completes feeds back into the system:

1. **Perceive** — Ingest real-time multi-dimensional market data
2. **Cognize** — Identify token lifecycle stage, market regime, and signal alignment
3. **Decide** — Multi-dimensional voting produces direction and confidence score
4. **Execute** — Enter positions with dynamic sizing and risk controls
5. **Review** — On exit, auto-verify what went right and wrong
6. **Analyze** — Attribute outcomes to specific dimensions and rules
7. **Backtest** — Validate proposed parameter changes against historical data
8. **Evolve** — Apply validated adjustments, with overfitting protection

**The rules that govern Galeon today were not written by humans — they were discovered by the system itself from 2,000+ trades.**

---

## Multi-Dimensional Perception

Galeon's edge comes from synthesizing signals that no single-dimension bot can capture:

| Layer | Dimensions | Purpose |
|-------|-----------|---------|
| **On-Chain** | Smart Money flow, Buy/Sell Ratio, holder distribution | Detect "smart money" intent before price moves |
| **Derivatives** | Funding rate, Open Interest stages, Taker ratio, Top Trader positions | Read contract market microstructure |
| **Technical** | Multi-timeframe momentum, EMA channels, K-line patterns, RSI | Identify trend and entry timing |
| **Macro** | BTC/ETH correlation, market regime (bull/bear/transition), sentiment cycles | Context-aware strategy weighting |
| **LLM Cognition** | ChatGPT-powered reasoning for complex multi-signal scenarios | Handle ambiguity that rules can't |

On-chain data is sourced via **Bitget Agent Skill**, providing real-time multi-dimensional chain analytics.

---

## Intelligent Risk Control

Risk management is not a single stop-loss — it's a **multi-layer defense system** that also learns:

- **Red Line Layer** — Price anomaly detection (crash > 50% auto-blocked), honeypot/rug scoring, extreme BTC drawdown halt
- **Self-Learned Blocking** — System automatically identifies and blocks stage + direction combinations with historically low win rates. These rules emerge from data, not human intuition
- **Time-Decay Stop Loss** — The longer a position is held at a loss, the tighter the stop becomes. Prevents "hold and hope" behavior
- **Loss Cooldown** — After a losing exit, cooldown period scales with loss severity. Prevents revenge trading on the same token

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Frontend (React + TypeScript)                │
│  Dashboard · Trade Monitor · Learning Reports · P&L Analytics│
└──────────────────────────┬───────────────────────────────────┘
                           │ REST API + WebSocket
┌──────────────────────────┴───────────────────────────────────┐
│                    Galeon Brain Engine                        │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Perception  │  │  Cognition   │  │    Control System    │ │
│  │             │  │              │  │                      │ │
│  │ • On-Chain  │─►│ • Stage ID   │─►│ • Confidence Gate    │ │
│  │ • Derivs    │  │ • Rules Eng  │  │ • Red Line Checks    │ │
│  │ • Technical │  │ • LLM Reason │  │ • Position Sizing    │ │
│  │ • Macro     │  │ • Voting     │  │ • Dynamic Params     │ │
│  └─────────────┘  └──────────────┘  └──────────┬──────────┘ │
│                                                 │            │
│  ┌──────────────────────────────────────────────┴──────────┐ │
│  │                  Execution Layer                         │ │
│  │  Entry · Partial Exit · Staged TP · Time-Decay SL       │ │
│  └──────────────────────────┬──────────────────────────────┘ │
│                             │                                │
│  ┌──────────────────────────┴──────────────────────────────┐ │
│  │                  Evolution Layer                         │ │
│  │  Auto-Verify · Attribution · RuleEvolver · Backtest     │ │
│  │  Learning Reports · Overfitting Protection              │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │     Data Sources        │
              │  • Bitget Agent Skill   │
              │  • Derivatives API      │
              │  • WebSocket Streams    │
              │  • LLM (ChatGPT)       │
              └─────────────────────────┘
```

---

## Key Results

| Metric | Value |
|--------|-------|
| Total Trades | 2,000+ |
| Win Rate | 58% |
| Cumulative Profit | 250%+ |
| Self-Learned Rules | Auto-generated from trade data |
| Auto Parameter Adjustments | 500+ (with overfitting protection) |
| Uptime | Continuous 24/7 operation |

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js, Express |
| Frontend | React, TypeScript, Ant Design |
| Database | MySQL |
| LLM | ChatGPT (complex scenario reasoning) |
| On-Chain Data | Bitget Agent Skill |
| Real-time | WebSocket price streams |
| Evolution | Custom RuleEvolver with bounded optimization |

---

## Quick Start

### Prerequisites

- Node.js >= 16.0.0
- MySQL 5.7+

### Setup

```bash
git clone https://github.com/Gameland0/Galeon.git
cd Galeon

# Backend
cd server && npm install
cp .env.example .env  # Configure your API keys
npm start

# Frontend
cd ../dapp && npm install
npm start
```

---

## Roadmap

- [x] Multi-dimensional perception (on-chain + derivatives + technical + macro)
- [x] Rules Engine + LLM dual-track cognition
- [x] Self-evolution loop (verify → attribute → adjust → backtest)
- [x] Multi-layer risk control with self-learned blocking rules
- [ ] Cross-token correlation analysis for sector rotation prediction
- [ ] Regime-adaptive strategy switching (auto-select optimal params per market condition)
- [ ] Multi-strategy parallel execution with automatic best-strategy selection

---

## License

MIT License - see [LICENSE](LICENSE) file for details

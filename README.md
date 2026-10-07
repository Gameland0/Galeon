# Galeon — AI Trading Agent + Prediction Market

**A self-evolving AI trading agent backed by persistent memory, with a community prediction market on Base chain.**

Over **6,084 live trades** executed · **60.3% win rate** · **3,669W / 2,415L**

---

## What is Galeon?

Galeon combines two things:

### 1. Self-Evolving AI Trading Agent

Galeon perceives multi-dimensional market data, makes trading decisions, and — most importantly — **learns from every trade outcome to continuously improve its own strategy.**

The self-evolution cycle:

```
Perceive → Cognize → Decide → Execute → Review → Analyze → Evolve
    ▲                                                           │
    └───────────────────────────────────────────────────────────┘
```

Signal dimensions: on-chain smart money, derivatives (OI/FR/Taker), technical analysis, macro regime, and LLM-powered reasoning for complex scenarios.

Learned weights and trade lessons are stored in **Sibyl persistent memory** — so the agent remembers everything across restarts. No retraining required.

### 2. Community Prediction Market on Base

When Galeon opens a trade, a prediction event is created on **Base chain** where community members bet USDC on the outcome.

- Winners split the pool proportionally (5% platform fee)
- Settlement outcomes are written back to **Sibyl Memory**
- At the next trade decision, Galeon recalls Base chain prediction history for that token — community accuracy directly influences the trade score

```
Trade opens → Community bets on Base → Trade closes
     → Settlement on-chain → Outcome stored in Sibyl
          → Recalled at next trade decision → Community vote (+1 / -1)
```

**Contract (Base Mainnet):** `0x7127ea3c571D4e446d29E26953a3D6DdD9fF558f`

---

## Key Results

| Metric | Value |
|--------|-------|
| Total Trades | 6,084 |
| Win Rate | 60.3% (3,669W / 2,415L) |
| Cumulative Profit | 250%+ |
| Learned Dimensions | 19 auto-adjusted from trade data |
| Memory Backend | Sibyl (cross-session persistent) |
| Prediction Market | Live on Base Mainnet |

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js, Express |
| Frontend | React, TypeScript |
| Database | MySQL |
| Persistent Memory | Sibyl |
| Prediction Market | Base chain (Solidity, USDC) |
| ML Win-Rate Model | Python, LightGBM |
| LLM Reasoning | Claude / GPT |

---

## Quick Start

```bash
git clone https://github.com/Gameland0/Galeon.git
cd Galeon

# Backend
cd server && npm install
cp .env.example .env
npm start

# Frontend
cd ../dapp && npm install
npm start
```

Key env variables:
```
LEARNING_STORAGE=sibyl         # Enable Sibyl persistent memory
PAPER_TRADE_ENV=testnet        # testnet | mainnet
PREDICTION_CONTRACT_ADDRESS=0x...
```

---

## Roadmap

- [x] Multi-dimensional AI trading agent
- [x] Self-evolution loop (learn from every trade)
- [x] Sibyl persistent memory (cross-session learning)
- [x] Base chain prediction market
- [x] Community prediction → trade decision integration
- [ ] Cross-token correlation analysis
- [ ] Regime-adaptive strategy auto-selection

---

## License

MIT License

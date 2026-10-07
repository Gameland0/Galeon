# Galeon - BNB Hackathon Project Description

---

## Project Name

**Galeon - Multi-Agent Autonomous Trading Protocol on BNB Chain**

---

## Short Description (100 words)

Galeon is a multi-agent autonomous trading protocol built on BNB Chain. Five specialized AI agents collaborate in real-time: Strategy Agent parses trading rules across 7 strategy types, Signal Agent monitors Twitter KOLs, Telegram alpha groups, and Binance Alpha listings, Risk Agent enforces circuit breakers and position limits, Execution Agent routes trades through PancakeSwap V2/V3 for optimal pricing, and Portfolio Agent manages staged take-profit and dynamic stop-loss. Includes native Four.meme integration for BSC meme token trading with bonding curve detection. All agents coordinate via AgentBus message passing. Non-custodial, fully autonomous, built for BNB Chain DeFi.

---

## Full Description (500 words)

### The Problem

DeFi trading on BNB Chain requires constant monitoring — tracking KOL calls on Twitter, parsing Telegram alpha groups, catching Binance Alpha token listings, and timing entries on PancakeSwap. Humans can't monitor all these sources 24/7, react in milliseconds, and consistently follow risk rules without emotion.

### The Solution

Galeon decomposes autonomous trading into **5 specialized AI agents**, each responsible for a distinct function. Agents collaborate via an event-driven **AgentBus** — no central controller, fully decoupled, and composable.

**Strategy Agent** — Users define trading rules from 7 strategy types: Twitter KOL copy-trading, Telegram group signals, Binance Alpha tracking, meme coin hunting (Four.meme), range trading, multi-source fusion, or whitelist-only mode. The agent parses configurations and routes them to the signal pipeline.

**Signal Agent** — Monitors multiple data sources simultaneously:
- **Twitter KOLs**: Scans tracked influencer posts, uses LLM to extract token mentions and sentiment, generates confidence-scored signals
- **Telegram Groups**: Parses alpha group messages, identifies token calls with entry zones
- **Binance Alpha**: Detects newly listed tokens on Binance Alpha for early entry
- Generates unified signals with confidence scores (0-1.0) regardless of source

**Risk Agent** — The gatekeeper. Every trade passes through 6 pre-trade checks: balance verification, circuit breaker status (auto-halts trading when daily loss limit hit), position limits, liquidity verification via PancakeSwap pool depth, token blacklist, and slippage tolerance. If any check fails, the trade is rejected — no exceptions.

**Execution Agent** — Routes orders through **PancakeSwap V2 and V3** with smart routing:
- Automatically selects optimal pool (V2 direct pair, V3 concentrated liquidity, or multi-hop)
- For Four.meme tokens in bonding curve phase, executes via Four.meme's native contract
- Batch execution with slippage protection and gas optimization
- Every trade verifiable on BscScan

**Portfolio Agent** — Monitors all positions every 15 seconds:
- **Staged Take-Profit**: Configurable — e.g., sell 30% at +50%, 30% at +100%, 40% at +200%
- **Dynamic Stop-Loss**: Three modes — Fixed, ATR-based, or Trailing
- **Real-time P&L**: Position-level and portfolio-level tracking
- Automatic exit on stop-loss, take-profit, or signal expiration

### BNB Chain Native Features

- **PancakeSwap V2/V3 Smart Routing**: Automatically finds best execution path across V2 pools and V3 concentrated liquidity positions
- **Four.meme Integration**: Detects bonding curve vs. graduated tokens, executes buys via native contracts for BSC meme tokens
- **Binance Alpha Signal Source**: Tracks newly listed tokens on Binance Alpha for early-mover advantage
- **BEP-20 Token Management**: Full approval flow, balance tracking, gas estimation in BNB
- **BscScan Verification**: Every trade produces a verifiable on-chain transaction

### Technical Architecture

Agents coordinate via **AgentBus** — an event-driven message bus enabling decoupled communication. Each agent subscribes to relevant events and emits results. This architecture is horizontally scalable: add new agents (e.g., Sentiment Agent, MEV Protection Agent) by simply subscribing to the bus.

Built with Node.js, ethers.js, PancakeSwap SDK, and LLM-powered signal analysis (DeepSeek).

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (React + TS)                       │
├─────────────────────────────────────────────────────────────────┤
│  • AutoTradePage          - Main trading dashboard               │
│  • WalletManager          - BNB/BEP-20 balance & deposit        │
│  • PositionManager        - Live positions with real-time P&L    │
│  • TwitterKOLConfig       - KOL signal source management         │
│  • TelegramGroupConfig    - Telegram group monitoring setup      │
│  • RangeMonitor           - Range trading visualization          │
│  • TradeLogs             - Trade history & win rate analytics    │
└─────────────────────────────────────────────────────────────────┘
                                ↕ REST API
┌─────────────────────────────────────────────────────────────────┐
│                  Agent Layer (Node.js + Express)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────┐   AgentBus    ┌────────────────┐             │
│  │ STRATEGY      │◄────────────►│ SIGNAL          │             │
│  │ AGENT         │               │ AGENT           │             │
│  │               │               │                 │             │
│  │ • 7 strategy  │               │ • Twitter KOL   │             │
│  │   types       │               │ • Telegram      │             │
│  │ • Config      │               │ • Binance Alpha │             │
│  │   parser      │               │ • LLM extractor │             │
│  └───────┬───────┘               └────────┬────────┘             │
│          │            AgentBus             │                     │
│          ▼                                 ▼                     │
│  ┌───────────────┐               ┌────────────────┐             │
│  │ RISK          │◄────────────►│ EXECUTION       │             │
│  │ AGENT         │               │ AGENT           │             │
│  │               │               │                 │             │
│  │ • Balance     │               │ • PancakeSwap   │             │
│  │ • Circuit     │               │   V2/V3 routing │             │
│  │   breaker     │               │ • Four.meme     │             │
│  │ • Liquidity   │               │   bonding curve │             │
│  │ • Blacklist   │               │ • Batch execute  │             │
│  └───────┬───────┘               └────────┬────────┘             │
│          │            AgentBus             │                     │
│          └──────────┬──────────────────────┘                     │
│                     ▼                                            │
│            ┌────────────────┐                                    │
│            │ PORTFOLIO      │                                    │
│            │ AGENT          │                                    │
│            │                │                                    │
│            │ • 15s monitor  │                                    │
│            │ • Staged TP    │                                    │
│            │ • Dynamic SL   │                                    │
│            │ • P&L tracking │                                    │
│            └────────────────┘                                    │
│                                                                  │
│  Core Infrastructure:                                            │
│  ├── AutoTradeService.js    - Strategy routing & signal dispatch  │
│  ├── RiskController.js      - 6-check pre-trade validation       │
│  ├── BatchExecutor.js       - PancakeSwap V2/V3 batch execution  │
│  ├── ExitMonitor.js         - Position monitoring & auto-exit    │
│  ├── DynamicStopLoss.js     - ATR / trailing stop calculation    │
│  ├── DEXAggregatorService   - PancakeSwap smart routing          │
│  ├── FourMemeService.js     - Four.meme bonding curve trading    │
│  ├── LiquidityMonitor.js    - Pool TVL & depth verification     │
│  ├── core/AgentBus.js       - Event-driven agent messaging       │
│  ├── core/BaseAgent.js      - Agent base class                   │
│  └── core/LLMSignalAnalyzer - AI-powered token extraction        │
└─────────────────────────────────────────────────────────────────┘
                                ↕
┌─────────────────────────────────────────────────────────────────┐
│                     BNB Chain Infrastructure                     │
├─────────────────────────────────────────────────────────────────┤
│  • PancakeSwap V2          - Standard AMM pools                  │
│  • PancakeSwap V3          - Concentrated liquidity pools        │
│  • Four.meme               - BSC meme launchpad (bonding curve)  │
│  • BEP-20 Tokens           - Token approvals & transfers         │
│  • BscScan                 - On-chain transaction verification   │
│  • Chainlink Oracles       - Price feeds for risk calculation    │
└─────────────────────────────────────────────────────────────────┘
                                ↕
┌─────────────────────────────────────────────────────────────────┐
│                      Signal Data Sources                         │
├─────────────────────────────────────────────────────────────────┤
│  • Twitter API             - KOL post monitoring & LLM parsing   │
│  • Telegram API            - Alpha group message extraction      │
│  • Binance Alpha API       - New token listing detection         │
│  • Binance API             - CEX market data & price feeds       │
│  • DexScreener             - DEX pool analytics                  │
│  • GeckoTerminal           - Token price & liquidity data        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Flow Diagram

```
USER defines strategy (1 of 7 types)
    │
    ▼
┌──────────────────┐
│  STRATEGY AGENT  │ Parses config → deploys rules
└────────┬─────────┘
         │ AgentBus: strategy.deployed
         ▼
┌──────────────────┐
│  SIGNAL AGENT    │ Monitors Twitter / Telegram / Binance Alpha
│                  │ LLM extracts tokens → confidence score
└────────┬─────────┘
         │ AgentBus: signal.detected (token, confidence, source)
         ▼
┌──────────────────┐
│  RISK AGENT      │ 6 pre-trade checks:
│                  │ ✅ Balance  ✅ Circuit breaker  ✅ Position limit
│                  │ ✅ Liquidity  ✅ Blacklist  ✅ Slippage
└────────┬─────────┘
         │ AgentBus: risk.approved / risk.rejected
         ▼
┌──────────────────┐
│  EXECUTION AGENT │ PancakeSwap V2/V3 smart routing
│                  │ Four.meme bonding curve execution
│                  │ TX confirmed on BscScan
└────────┬─────────┘
         │ AgentBus: trade.executed (tx_hash, entry_price)
         ▼
┌──────────────────┐
│  PORTFOLIO AGENT │ Monitor every 15s:
│                  │ → Staged TP: 30% at +50%, 30% at +100%, 40% at +200%
│                  │ → Dynamic SL: Fixed / ATR / Trailing
│                  │ → Auto-exit on TP/SL/expiration
└──────────────────┘
```

---

## Key Differentiators for BNB Chain

| Feature | Traditional Bots | Galeon |
|---------|-----------------|--------|
| Architecture | Monolithic | Multi-agent (5 agents) |
| Signal Sources | Single source | Twitter + Telegram + Binance Alpha |
| DEX Routing | V2 only | PancakeSwap V2 + V3 smart routing |
| Meme Trading | Not supported | Four.meme bonding curve native |
| Risk Management | Basic stop-loss | Circuit breaker + staged TP + dynamic SL |
| Agent Communication | N/A | AgentBus event-driven messaging |
| Execution | Sequential | Batch execution with gas optimization |
| Monitoring | Manual | 15s automated position monitoring |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Ant Design |
| Backend | Node.js + Express |
| Agent Bus | Custom event-driven messaging |
| AI/LLM | DeepSeek for signal analysis |
| DEX | PancakeSwap V2/V3 SDK |
| Meme | Four.meme contract integration |
| Blockchain | ethers.js + BNB Chain RPC |
| Data | Binance API + DexScreener + GeckoTerminal |
| Signal | Twitter API + Telegram API + Binance Alpha |
| Database | MySQL |

---

## Demo Video

https://youtu.be/CQCMurkDfNM

---

## GitHub

https://github.com/Gameland0/Galeon

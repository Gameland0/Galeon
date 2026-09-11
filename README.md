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

### 3. Tamper-Proof Signal Anchoring on Creditcoin (Attestcoin)

**BUIDL CTC 2026 Fall Hackathon — AI Track**

Every AI trading signal is committed on **Ethereum Sepolia before execution**, then bridged to **Creditcoin CC3** via Attestcoin cryptographic proofs — no centralized oracle, no cherry-picking, no post-hoc editing.

```
AI Brain ──→ Sepolia Commit ──→ Attestcoin Proof (~7min) ──→ CC3 Record
                 │                       │                        │
            Signal hash             Merkle proof            Verified &
            locked BEFORE           generated               recorded on
            trade executes                                  Creditcoin
```

**Each signal = 4 on-chain transactions** (2 Sepolia + 2 CC3). ~20 signals/day = ~80 Creditcoin transactions/day.

#### USC Integration

Galeon uses Creditcoin's **Universal Smart Contracts (USC)** in two ways:

1. **GaleonASC.sol** — Deployed on CC3 via USC. Stores all AI positions (entry, exit, P&L) on-chain. Supports CTC prediction betting.

2. **Block Prover Precompile** (`0x0000000000000000000000000000000000000FD2`) — A USC-exclusive protocol-level precompile. The contract calls `VERIFIER.verifyAndEmit()` to trustlessly verify that Sepolia events actually occurred — no oracle, no middleware.

```solidity
// GaleonASC.sol
INativeQueryVerifier constant VERIFIER =
    INativeQueryVerifier(0x0000000000000000000000000000000000000FD2);

bool verified = VERIFIER.verifyAndEmit(
    sourceChainKey, blockHeight, txBytes, merkleProof, continuityProof
);
require(verified, "proof verification failed");
```

#### Attestcoin Contracts

| Contract | Chain | Address |
|----------|-------|---------|
| `GaleonTradeRecorder.sol` | Sepolia | [`0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39`](https://sepolia.etherscan.io/address/0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39) |
| `GaleonASC.sol` | CC3 Testnet | [`0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39`](https://creditcoin-testnet.blockscout.com/address/0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39) |

#### Attestcoin Backend Services

| Module | File | Purpose |
|--------|------|---------|
| `AttestcoinBridge` | `server/src/services/attestcoin/AttestcoinBridge.js` | Main orchestrator, hooks into PaperTradeService |
| `SepoliaRelayer` | `server/src/services/attestcoin/SepoliaRelayer.js` | Calls Sepolia: `commitSignal()`, `recordExit()` |
| `ProofWatcher` | `server/src/services/attestcoin/ProofWatcher.js` | Polls `@gluwa/usc-sdk` for Attestcoin proofs |
| `CC3Recorder` | `server/src/services/attestcoin/CC3Recorder.js` | Submits proofs to CC3 GaleonASC |
| `attestcoinRoutes` | `server/src/routes/attestcoinRoutes.js` | REST API: positions, stats, price, bridge status |

#### Attestcoin Environment Variables

```bash
SEPOLIA_WALLET_PRIVATE_KEY=<key>
GALEON_RECORDER_ADDRESS=0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39
CC3_WALLET_PRIVATE_KEY=<key>
GALEON_ASC_ADDRESS=0x666AecD5f08406D8d0D3cF511399FdC7cCbc6d39
ATTESTCOIN_ENABLED=true
```

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
| Attestcoin Bridge | Live on CC3 Testnet (Sepolia → CC3) |

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
| Cross-Chain Proofs | Attestcoin / @gluwa/usc-sdk |
| Creditcoin | CC3 Testnet (USC + Block Prover Precompile) |

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
- [x] Attestcoin tamper-proof signal anchoring (Sepolia → CC3)
- [x] Block Prover Precompile integration (USC)
- [ ] Cross-token correlation analysis
- [ ] Regime-adaptive strategy auto-selection

---

## License

MIT License

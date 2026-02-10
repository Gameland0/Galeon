# Galeon

Galeon redefines how Web3 operates through an autonomous multi-agent system that gives AI the ability to perceive, reason, and execute — enabling true end-to-end automation from market insight to on-chain action, and fundamentally elevating the intelligence and efficiency of Web3.

Within this architecture, the Auto Agent Mesh serves as a dynamic, self-organizing network of agents capable of forming specialized teams to handle complex tasks. The Galeon Agent Layer provides a modular, composable framework where capabilities can be assembled like Lego blocks, allowing users and developers to build agent workflows for trading, risk management, automation, and more. At the core, the Auto Agent Eco-Link functions as the cognitive backbone that connects, aligns, and optimizes all sub-agents, enabling coordinated decision-making and system-wide orchestration with shared context and memory.


### 🎯 Core Innovation

Traditional auto-trading tools are monolithic and rigid. Galeon takes a fundamentally different approach with a **multi-agent architecture** where five specialized agents collaborate in real-time:

1. **Strategy Agent** — Parses user-defined trading rules and deploys them as executable strategies. Supports 7 strategy types from KOL copy-trading to range-based execution.
2. **Signal Agent** — Monitors multiple data sources (Twitter KOLs, Telegram alpha groups, on-chain data) and generates confidence-scored trading signals using LLM-powered analysis.
3. **Risk Agent** — Enforces pre-trade risk checks including balance verification, liquidity assessment, circuit breaker logic, position limits, and token blacklists. Autonomously halts trading when thresholds are breached.
4. **Execution Agent** — Routes orders through Jupiter aggregator for optimal pricing across all Solana DEXs. Handles batch execution with slippage protection.
5. **Portfolio Agent** — Monitors positions every 15 seconds, executes staged take-profit (selling portions at different profit levels), manages dynamic stop-loss (ATR / trailing), and tracks full P&L history.

Agents communicate via an internal **AgentBus** message-passing system, enabling real-time coordination without tight coupling.

---

## ✨ Key Features

### 🤖 Multi-Agent Auto Trading

- **5 Specialized Agents**: Strategy, Signal, Risk, Execution, Portfolio — each with a clear role
- **AgentBus Architecture**: Decoupled agent communication via event-driven message passing
- **LLM Signal Analysis**: AI-powered extraction of trading signals from unstructured text (tweets, chat messages)

### 📡 7 Signal Strategy Types

- **TOP_SIGNALS**: Follow high-confidence alpha signals
- **TWITTER_KOL**: Copy-trade from tracked Twitter KOLs with weight-based scoring
- **TELEGRAM**: Monitor alpha Telegram groups, parse messages into actionable signals
- **MEME**: Meme coin hunting with enhanced risk filters
- **RANGE**: Automated range trading — buy at support, sell at resistance
- **FUSION**: Multi-source signal aggregation with cross-validation
- **WHITELIST**: Trade only pre-approved tokens

### 🛡️ Advanced Risk Management

- **Circuit Breaker**: Auto-pause all trading when daily loss limit is hit
- **Dynamic Stop-Loss**: Fixed, ATR-based, or trailing stop modes
- **Staged Take-Profit**: Sell 30% at +50%, 30% at +100%, 40% at +200% (configurable)
- **Liquidity Checks**: Verify pool TVL and depth before execution
- **Position Limits**: Max positions, single-token exposure caps, token blacklists

### ⚡ Solana-Native Execution

- **Jupiter Aggregation**: Optimal routing across all Solana DEXs (Raydium, Orca, Meteora)
- **Sub-second Execution**: Leverage Solana's speed for real-time trading
- **On-chain Verification**: Every trade verifiable on Solscan
- **Privy Session Signing**: Non-custodial — users authorize agents via session keys

### 📊 Real-time Monitoring

- **Live P&L Tracking**: Position-level and portfolio-level profit/loss in real-time
- **Trade History**: Full execution log with entry/exit prices, fees, and outcomes
- **KOL Performance Ranking**: Track which signal sources generate the best returns
- **Signal History**: Complete record of all detected and acted-upon signals

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + TS)                     │
├─────────────────────────────────────────────────────────────┤
│  • AutoTradePage.tsx        - Main trading dashboard         │
│  • WalletManager.tsx        - Wallet & balance management    │
│  • PositionManager.tsx      - Live positions & P&L           │
│  • TwitterKOLConfig.tsx     - KOL signal source config       │
│  • TelegramGroupConfig.tsx  - Telegram source config         │
│  • RangeMonitor.tsx         - Range trading monitor          │
│  • TradeLogs.tsx            - Trade history & analytics      │
└─────────────────────────────────────────────────────────────┘
                              ↓ ↑
                         REST API (JSON)
                              ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│              Agent Layer (Node.js + Express)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  AgentBus  ┌──────────────┐               │
│  │ Strategy    │◄──────────►│ Signal       │               │
│  │ Agent       │            │ Agent        │               │
│  └──────┬──────┘            └──────┬───────┘               │
│         │          AgentBus        │                        │
│         ▼                          ▼                        │
│  ┌─────────────┐            ┌──────────────┐               │
│  │ Risk        │◄──────────►│ Execution    │               │
│  │ Agent       │            │ Agent        │               │
│  └──────┬──────┘            └──────┬───────┘               │
│         │          AgentBus        │                        │
│         └──────────┬───────────────┘                        │
│                    ▼                                        │
│            ┌──────────────┐                                 │
│            │ Portfolio    │                                 │
│            │ Agent        │                                 │
│            └──────────────┘                                 │
│                                                             │
│  Core Services:                                             │
│  • AutoTradeService.js     - Strategy parsing & routing     │
│  • RiskController.js       - Pre-trade risk checks          │
│  • BatchExecutor.js        - Batch execution engine         │
│  • ExitMonitor.js          - Position monitoring & exits    │
│  • DynamicStopLoss.js      - ATR / trailing stop logic      │
│  • core/AgentBus.js        - Agent message passing          │
│  • core/BaseAgent.js       - Agent base class               │
│  • core/LLMSignalAnalyzer  - AI signal extraction           │
└─────────────────────────────────────────────────────────────┘
                              ↓ ↑
                     Solana Blockchain
                              ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                   Solana Infrastructure                      │
├─────────────────────────────────────────────────────────────┤
│  • Jupiter Aggregator      - DEX routing (Raydium/Orca/...) │
│  • Pyth Network            - Real-time price oracle          │
│  • SPL Token Program       - Token transfers & vaults        │
│  • Privy                   - Session signing & auth          │
│  • Solscan                 - On-chain transaction verify     │
└─────────────────────────────────────────────────────────────┘
                              ↓ ↑
                      Signal Data Sources
                              ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│  • Twitter API             - KOL post monitoring             │
│  • Telegram API            - Alpha group message parsing     │
│  • Binance API             - CEX market data                 │
│  • DexScreener             - DEX pool & price data           │
│  • GeckoTerminal           - Token analytics                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16.0.0
- MySQL 5.7+
- Solana RPC endpoint (Helius recommended)

### 1. Clone the Repository

```bash
git clone https://github.com/Gameland0/Galeon.git
cd Galeon
```

### 2. Backend Setup

```bash
cd server
npm install

# Create .env file
cat > .env << EOF
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=multiagent_platforms

# AI Services
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Solana
SOLANA_RPC_URL=your_solana_rpc_url
JUPITER_API_URL=https://quote-api.jup.ag/v6

# Privy (Session Signing)
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_secret

# Binance API (optional, for live data)
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret
EOF

# Start server
npm start
```

### 3. Frontend Setup

```bash
cd dapp
npm install

# Create .env file
cat > .env << EOF
REACT_APP_API_URL=http://localhost:5000
EOF

# Start development server
npm start
```

### 4. Database Setup

```sql
-- Create database
CREATE DATABASE multiagent_platforms CHARACTER SET utf8mb4;

-- Create alpha_signals table
CREATE TABLE alpha_signals (
  signal_id VARCHAR(50) PRIMARY KEY,
  token_symbol VARCHAR(20) NOT NULL,
  signal_type ENUM('LONG', 'SHORT', 'BUY', 'SELL', 'NEUTRAL'),
  confidence DECIMAL(5,2),
  original_confidence DECIMAL(5,2),
  confidence_adjustment INT,
  -- ... other fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🛠️ Technology Stack

### Frontend
- **React** 18.2.0 + **TypeScript** 4.9.4
- **Ant Design** 5.x for UI components
- **@solana/web3.js** for wallet integration

### Backend
- **Node.js** + **Express** 4.17.1
- **MySQL** 5.7+ (via mysql2)
- **AgentBus** event-driven agent coordination

### Solana Stack
- **Jupiter SDK** — DEX aggregation & routing
- **Pyth SDK** — On-chain price feeds
- **@solana/web3.js** — Transaction building & signing
- **Privy** — Session-based wallet authorization

### AI Services
- **DeepSeek AI** — LLM-powered signal analysis
- **LLMSignalAnalyzer** — Token extraction from unstructured text

### Data Sources
- **Binance API** — CEX market data
- **DexScreener / GeckoTerminal** — DEX pool data
- **Twitter API** — KOL post monitoring
- **Telegram API** — Alpha group signals

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- **Solana** — High-performance blockchain infrastructure
- **Jupiter** — DEX aggregation powering optimal trade execution
- **Pyth Network** — Real-time on-chain price oracle
- **Privy** — Seamless wallet authentication
- **DeepSeek** — AI-powered natural language analysis

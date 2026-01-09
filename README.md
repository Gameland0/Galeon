# Galeon

Galeon redefines how Web3 operates through an autonomous multi-agent system that gives AI the ability to perceive, reason, and execute — enabling true end-to-end automation from market insight to on-chain action, and fundamentally elevating the intelligence and efficiency of Web3.

Within this architecture, the Auto Agent Mesh serves as a dynamic, self-organizing network of agents capable of forming specialized teams to handle complex tasks. The Galeon Agent Layer provides a modular, composable framework where capabilities can be assembled like Lego blocks, allowing users and developers to build agent workflows for trading, risk management, automation, and more. At the core, the Auto Agent Eco-Link functions as the cognitive backbone that connects, aligns, and optimizes all sub-agents, enabling coordinated decision-making and system-wide orchestration with shared context and memory.


### 🎯 Core Innovation

Traditional trading signals rely solely on current market conditions. Our system:

1. **Queries Historical Data** - Retrieves similar trading scenarios from FLock's decentralized knowledge base
2. **AI Analysis** - Uses DeepSeek AI to analyze historical patterns and outcomes
3. **Dynamic Confidence Adjustment** - Adjusts signal confidence based on historical success rates
4. **Transparent Insights** - Shows users the reasoning behind each confidence adjustment

---

## ✨ Key Features

### 🧠 FLock RAG Integration

- **Historical Case Retrieval**: Automatically queries FLock RAG for similar trading scenarios
- **Confidence Score Adjustment**: Dynamically adjusts signal confidence (+/- adjustment) based on historical data
- **AI-Generated Insights**: DeepSeek AI provides natural language explanations for each signal
- **Similar Cases Count**: Displays number of historical cases used for analysis
- **Dual Token Support**: Works with both CEX (Centralized Exchange) and DEX (Decentralized Exchange) tokens

### 📊 Trading Signal Analysis

- **Multi-Signal Types**: LONG, SHORT, BUY, SELL signals
- **Risk Level Assessment**: LOW, MEDIUM, HIGH risk classification
- **Real-time Market Data**: Integration with Binance and DEX price feeds
- **Entry/Exit Zones**: Precise entry points, take-profit, and stop-loss levels
- **Signal Status Tracking**: ACTIVE, HIT_TP, HIT_SL, EXPIRED states

### 🎨 User Interface

- **FLock Insight Panel**: Dedicated UI component showing historical analysis
- **Confidence Visualization**: Visual display of original → adjusted confidence scores
- **FLock Badge**: Signals enhanced by FLock show a distinctive badge
- **Interactive Cards**: Responsive signal cards with hover effects

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + TS)                    │
├─────────────────────────────────────────────────────────────┤
│  • FlockInsightPanel.tsx    - Historical analysis display   │
│  • AlphaSignalCard.tsx      - Signal list with FLock badge  │
│  • SignalDetailPage.tsx     - Detailed signal view          │
│  • alphaAgentService.ts     - API service with interfaces   │
└─────────────────────────────────────────────────────────────┘
                              ↓ ↑
                         REST API (JSON)
                              ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Node.js + Express)               │
├─────────────────────────────────────────────────────────────┤
│  • AlphaMarketAnalyzer.js   - Signal generation engine      │
│  • alphaAgentController.js  - API endpoints                 │
│  • FLockChatProvider.js     - FLock RAG integration         │
└─────────────────────────────────────────────────────────────┘
                              ↓ ↑
                      External Services
                              ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│  • FLock RAG API            - Historical knowledge base     │
│  • DeepSeek AI API          - Natural language analysis     │
│  • Binance API              - CEX market data               │
│  • DEX APIs                 - Decentralized exchange data   │
└─────────────────────────────────────────────────────────────┘
```

---



---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16.0.0
- MySQL 5.7+
- FLock API Key (for RAG access)
- DeepSeek API Key (for AI analysis)

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

# FLock RAG
KNOWLEDGE_PROVIDER=FLOCK_CHAT
FLOCK_API_KEY=your_flock_api_key
FLOCK_API_BASE=https://api.flock.io

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
  flock_similar_cases INT,
  flock_source VARCHAR(50),
  flock_insight TEXT,
  -- ... other fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 💡 FLock Integration Details

### How It Works

1. **Signal Generation**
   - System analyzes market conditions for a token (e.g., KOGE, TAU)
   - Generates base signal type (LONG/SHORT) and initial confidence score

2. **FLock Query**
   ```javascript
   const knowledgeResult = await flockProvider.queryHistoricalCases(
     tokenSymbol,      // e.g., "BTCUSDT"
     signalType,       // e.g., "LONG"
     marketCondition   // Current market metrics
   );
   ```

3. **Confidence Adjustment**
   - FLock returns similar historical cases and AI analysis
   - System adjusts confidence: `finalConfidence = baseConfidence + adjustment`
   - Adjustment range: typically -10 to +10 points

4. **Frontend Display**
   - Original confidence, adjustment value, and final confidence shown
   - AI-generated insight explains the reasoning
   - Number of similar cases used in analysis



## 🛠️ Technology Stack

### Frontend
- **React** 18.2.0 + **TypeScript** 4.9.4
- **Axios** for API calls
- Inline styled-components (CSS-in-JS)

### Backend
- **Node.js** + **Express** 4.17.1
- **MySQL** 5.7+ (via mysql2)
- **Axios** for FLock/DeepSeek API calls

### AI Services
- **FLock RAG** - Historical knowledge retrieval
- **DeepSeek AI** - Natural language analysis
- **Binance API** - Market data (CEX)
- **DexScreener/GeckoTerminal** - DEX data

---


---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- **FLock.io** - For providing the RAG infrastructure and API
- **DeepSeek** - For AI-powered natural language analysis
- **Binance** - For reliable crypto market data APIs

---

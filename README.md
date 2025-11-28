# 🧠 FLock RAG Trading Signals

> AI-Powered Crypto Trading Signals Enhanced by FLock's Retrieval Augmented Generation

## 🏆 Hackathon Project Overview

This project demonstrates the integration of **FLock RAG (Retrieval Augmented Generation)** into a crypto trading signals platform. By leveraging historical trading data and AI analysis, the system provides enhanced trading signals with dynamic confidence adjustments based on similar past market scenarios.

### 🎯 Core Innovation

Traditional trading signals rely solely on current market conditions. Our FLock-enhanced system:

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

## 📁 Project Structure

```
Galeon/
├── dapp/                          # Frontend React Application
│   └── src/
│       ├── components/
│       │   ├── FlockInsightPanel.tsx      # FLock historical analysis UI
│       │   ├── AlphaSignalCard.tsx        # Signal card with FLock badge
│       │   └── SignalDetailPage.tsx       # Detailed signal view
│       └── services/
│           └── alphaAgentService.ts       # API service & TypeScript interfaces
│
├── server/                        # Backend Node.js Application
│   └── src/
│       ├── services/
│       │   ├── AlphaMarketAnalyzer.js     # Core signal generation with FLock
│       │   └── FLockChatProvider.js       # FLock RAG integration service
│       └── controllers/
│           └── alphaAgentController.js    # API endpoints
│
└── AgentContract/                 # Smart Contracts (if applicable)
```

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

### Example Signal Flow

```
Initial Signal: KOGE LONG @ 75% confidence
         ↓
FLock Query: Found 8 similar cases
         ↓
AI Analysis: "Historical data shows 62.5% success rate for
              similar LONG signals on low-cap DEX tokens"
         ↓
Adjustment: -5 points (due to lower historical success)
         ↓
Final Signal: KOGE LONG @ 70% confidence ✅
```

---

## 🎨 UI Components

### FlockInsightPanel

Displays FLock historical analysis:
- **Confidence Flow**: Original → Adjustment → Final
- **Historical Stats**: Similar cases count, data source
- **AI Insight**: Natural language explanation
- **Visual Design**: Gradient purple theme with brain emoji 🧠

### AlphaSignalCard

Signal list card featuring:
- **FLock Badge**: "FLock Enhanced" or "FLock Analyzed"
- **Signal Type**: LONG/SHORT with color coding
- **Confidence Score**: Final confidence percentage
- **Token Info**: Symbol, price, market cap

---

## 🔧 API Endpoints

### Get Signal List
```http
GET /api/alpha-agent/signals
Response: {
  signals: [{
    signalId: "SIG-20251128-KOGE-X2A",
    tokenSymbol: "KOGE",
    signalType: "LONG",
    confidence: 82,
    originalConfidence: 77,
    confidenceAdjustment: +5,
    flockInsight: {
      source: "FLock RAG",
      similarCasesCount: 12,
      analysis: "...",
      adjustmentReason: "HISTORICAL_SUCCESS"
    }
  }]
}
```

### Get Signal Detail
```http
GET /api/alpha-agent/signals/:signalId
Response: {
  // All preview fields plus:
  entryZone: { min: 0.00045, max: 0.00048 },
  takeProfitLevels: [0.00052, 0.00055],
  stopLoss: 0.00042
}
```

---

## 🧪 Testing

### Test FLock Integration

```bash
# Backend test
cd server
node test-flock-integration.js

# Expected output:
# ✅ FLock Query successful
# 📊 Similar cases: 8
# 🎯 Confidence adjustment: +3
```

### Test Signal Generation

```bash
# Query test signal
curl http://localhost:5000/api/alpha-agent/signals/SIG-20251128-KOGE-X2A

# Check for FLock fields:
# - originalConfidence
# - confidenceAdjustment
# - flockInsight object
```

---

## 📊 Database Schema

### Key FLock Fields in `alpha_signals`

```sql
original_confidence      DECIMAL(5,2)  -- Base AI confidence
confidence_adjustment    INT           -- FLock adjustment (-10 to +10)
confidence              DECIMAL(5,2)   -- Final = original + adjustment
flock_similar_cases     INT            -- Number of historical cases
flock_source           VARCHAR(50)    -- "FLock RAG" or "Local DB"
flock_insight          TEXT           -- AI analysis text
```

---

## 🏅 Hackathon Highlights

### What Makes This Special

1. **Real FLock Integration**: Not a mock - actual FLock RAG API calls
2. **Production-Ready UI**: Polished, responsive React components
3. **Dual-Path Support**: Both CEX and DEX tokens covered
4. **Transparent AI**: Shows users exactly how FLock influenced each signal
5. **Full-Stack Demo**: Complete frontend + backend implementation

### Technical Achievements

- ✅ FLock RAG query integration in signal generation pipeline
- ✅ Dynamic confidence adjustment based on historical data
- ✅ TypeScript interfaces for type-safe FLock data
- ✅ Dedicated UI component (FlockInsightPanel) for insights
- ✅ Database persistence of FLock metadata
- ✅ RESTful API with FLock-enhanced responses

---

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

## 📝 Environment Variables

### Backend (.env)

```bash
# FLock Configuration
KNOWLEDGE_PROVIDER=FLOCK_CHAT
FLOCK_API_KEY=sk-flock-xxxxx
FLOCK_API_BASE=https://api.flock.io/v1

# DeepSeek Configuration
DEEPSEEK_API_KEY=sk-xxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=multiagent_platforms

# Server
PORT=5000
NODE_ENV=production
```

---

## 🚢 Deployment

### Backend Deployment

```bash
cd server
npm install --production
pm2 start server.js --name "alpha-signals-server"
pm2 save
```

### Frontend Deployment

```bash
cd dapp
npm run build
# Deploy build/ directory to your hosting (Vercel, Netlify, etc.)
```

---

## 🤝 Contributing

We welcome contributions! To add features:

1. Fork the repository
2. Create feature branch: `git checkout -b feature/NewFeature`
3. Commit changes: `git commit -m 'Add NewFeature'`
4. Push to branch: `git push origin feature/NewFeature`
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- **FLock.io** - For providing the RAG infrastructure and API
- **DeepSeek** - For AI-powered natural language analysis
- **Binance** - For reliable crypto market data APIs

---

## 📬 Contact

Project Link: [https://github.com/Gameland0/Galeon](https://github.com/Gameland0/Galeon)

---

<div align="center">

**🧠 Powered by FLock RAG + DeepSeek AI**

*Making Crypto Trading Smarter with Historical Intelligence*

🚀 Built for FLock Hackathon

</div>

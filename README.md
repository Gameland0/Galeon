# AI-DApp Multi-Agent Platform

A comprehensive multi-agent platform that integrates blockchain technology with artificial intelligence, supporting intelligent agent management, team collaboration, game generation, and blockchain integration.

## 🚀 Project Overview

AI-DApp is an innovative multi-agent platform that combines blockchain technology with artificial intelligence to provide users with intelligent agent creation, management, trading, and game generation capabilities. The platform supports multiple blockchain networks (Ethereum, Solana) and integrates various AI services.

## ✨ Key Features

### 🤖 Intelligent Agent System
- **Agent Creation & Management**: Create, configure, and train personalized AI agents
- **Agent Marketplace**: Browse, purchase, and sell intelligent agents
- **Agent Teams**: Form multi-agent collaborative teams for complex task decomposition
- **Agent Training**: Support continuous learning and capability enhancement

### 🎮 Game Generation System
- **AI Game Generation**: Automatically generate HTML5 games based on natural language descriptions
- **Game Type Support**: Puzzle, Shooter, Platform, Racing, Card, Strategy, Arcade, and more
- **Game Marketplace**: Publish, share, and trade generated games
- **Blockchain Integration**: Game score recording and reward mechanisms

### 💰 Blockchain Integration
- **Multi-Chain Support**: Ethereum and Solana blockchains
- **Smart Contracts**: Agent registration, team management, credit payment contracts
- **Wallet Integration**: Support for multiple wallet connections
- **NFT Features**: Agent and game NFTization

### 💬 Chat System
- **Multi-Agent Conversations**: Real-time conversations with multiple AI agents
- **Context Management**: Intelligent conversation history and context preservation
- **Message Processing**: Support for Markdown, code highlighting, and rich text formats

## 🛠 Technology Stack

### Frontend (React + TypeScript)
- **Framework**: React 18.2.0 + TypeScript 4.9.4
- **UI Components**: Ant Design 5.21.4
- **Routing**: React Router DOM 6.6.2
- **Blockchain**: Web3.js 4.6.0, Ethers.js 6.13.4
- **Solana**: @solana/web3.js 1.95.4, @project-serum/anchor 0.26.0
- **3D Rendering**: Three.js 0.169.0
- **Code Highlighting**: React Syntax Highlighter 15.5.0

### Backend (Node.js + Express)
- **Runtime**: Node.js + Express 4.17.1
- **Database**: MySQL 2.3.0
- **AI Services**: OpenAI 4.56.0, Anthropic Claude 0.32.1, Google Gemini 0.21.0
- **Blockchain**: Web3.js 1.5.2, Solana Web3.js 1.95.4
- **Smart Contracts**: Solidity 0.8.28, Anchor Framework
- **File Processing**: Multer 1.4.5, IPFS Integration

### Smart Contracts
- **AgentRegistry.sol**: Intelligent agent registration and management
- **TeamRegistry.sol**: Team registration and management
- **CreditsPayment.sol**: Credit purchase and management
- **USDTContract.sol**: USDT token contract

## 📦 Project Structure

```
ai-dapp/
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── contexts/          # React contexts
│   ├── contracts/         # Smart contract interfaces
│   ├── services/          # API services
│   ├── styles/            # CSS styles
│   └── utils/             # Utility functions
├── public/                # Static assets
└── package.json           # Frontend dependencies

ai-server/
├── src/                   # Backend source code
│   ├── controllers/       # Controllers
│   ├── services/          # Business logic
│   ├── routes/            # Route definitions
│   ├── middleware/        # Middleware
│   └── config/            # Configuration files
├── contracts/             # Smart contracts
└── package.json           # Backend dependencies
```

## 🚀 Quick Start

### Prerequisites
- Node.js >= 16.0.0
- MySQL >= 8.0
- Git

### 1. Clone the Repository
```bash
git clone <repository-url>
cd ai-dapp
```

### 2. Install Dependencies

#### Frontend Dependencies
```bash
npm install
```

#### Backend Dependencies
```bash
cd ai-server
npm install
```

### 3. Environment Configuration

#### Frontend Environment Variables
Create `.env` file:
```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_NETWORK=development
```

#### Backend Environment Variables
Create `.env` file in `ai-server` directory:
```env
# Database Configuration
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=ai_dapp

# AI Service Configuration
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key

# Blockchain Configuration
ETHEREUM_RPC_URL=your_ethereum_rpc
SOLANA_RPC_URL=your_solana_rpc

# JWT Secret
JWT_SECRET=your_jwt_secret
```

### 4. Database Setup
```sql
-- Create database
CREATE DATABASE ai_dapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Run SQL scripts (in ai-server/sql/ directory)
```

### 5. Start Services

#### Start Backend Service
```bash
cd ai-server
npm start
```

#### Start Frontend Service
```bash
# In a new terminal window
npm start
```

Visit http://localhost:3000 to start using the application

## 📖 User Guide

### Intelligent Agent Management

1. **Create Agents**
   - Login and navigate to the agent marketplace
   - Click "Create Agent"
   - Configure agent name, description, type, and capabilities
   - Upload training data (optional)

2. **Agent Training**
   - Select the agent to train
   - Provide training instructions and data
   - Monitor training progress
   - Test agent capabilities

3. **Team Collaboration**
   - Create agent teams
   - Assign roles and tasks
   - Set collaboration rules
   - Monitor team performance

### Game Generation

1. **Describe Game Requirements**
   - Use natural language to describe game type and gameplay
   - Specify game style and difficulty
   - Add special requirements

2. **AI Game Generation**
   - System automatically analyzes requirements
   - Generates HTML5 game code
   - Provides preview and testing

3. **Publish and Share**
   - Test game functionality
   - Set pricing and permissions
   - Publish to game marketplace

### Blockchain Features

1. **Wallet Connection**
   - Support for MetaMask, Phantom, and other wallets
   - Multi-chain network switching
   - Account management

2. **Smart Contract Interaction**
   - Agent registration on blockchain
   - Credit purchase and management
   - NFT minting and trading

## 🔧 Development Guide

### Adding New AI Services
1. Create new service file in `ai-server/src/services/`
2. Implement standard interface methods
3. Register service in `aiService.js`
4. Update API routes

### Extending Game Types
1. Add game type definitions in `minGameService.js`
2. Update game generation templates
3. Add corresponding UI components
4. Test game functionality

### Smart Contract Development
1. Write Solidity contracts in `contracts/` directory
2. Use Hardhat for testing and deployment
3. Update frontend contract interfaces
4. Integrate with platform features

## 🧪 Testing

### Frontend Testing
```bash
npm test
```

### Backend Testing
```bash
cd ai-server
npm test
```

### Smart Contract Testing
```bash
cd ai-server/contracts
npx hardhat test
```

## 📦 Deployment

### Production Deployment

#### Frontend Deployment
```bash
npm run build
# Deploy build directory to web server
```

#### Backend Deployment
```bash
cd ai-server
npm install --production
# Deploy using PM2 or Docker
```

#### Smart Contract Deployment
```bash
cd ai-server/contracts
npx hardhat run deploy.js --network mainnet
```

## 🤝 Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## 🆘 Support

- 📧 Email: support@ai-dapp.com
- 💬 Community: [Discord](https://discord.gg/ai-dapp)
- 📖 Documentation: [Wiki](https://github.com/ai-dapp/wiki)

## 🙏 Acknowledgments

Thanks to all developers and users who have contributed to this project!

---

**AI-DApp** - Making AI and Blockchain Integration Simpler 🚀 
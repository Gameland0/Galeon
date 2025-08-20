
## 🚀 Project Overview

Galeon: A fully automated multi-agent Web3 operating system.

## ✨ Key Features

### 🤖 Intelligent Agent System
- **Agent Creation & Management**: Create, configure, and train personalized AI agents
- **Agent Marketplace**: Browse, purchase, and sell intelligent agents
- **Agent Teams**: Form multi-agent collaborative teams for complex task decomposition
- **Agent Training**: Support continuous learning and capability enhancement

### 🎮 Game Generation System
- **AI Game Generation**: Automatically generate HTML5 games based on natural language descriptions
- **Game Marketplace**: Publish, share, and trade generated games
- **Blockchain Integration**: Game score recording and reward mechanisms

### 💰 Blockchain Integration
- **Multi-Chain Support**: EVM and Sei
- **Wallet Integration**: Support for multiple wallet connections
- **NFT Features**: Agent and game NFTization

### 💬 Chat System
- **Multi-Agent Conversations**: Real-time conversations with multiple AI agents

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
- **Blockchain**: Web3.js 1.5.2, Solana Web3.js 1.95.4
- **Smart Contracts**: Solidity 0.8.28, Anchor Framework
- **File Processing**: Multer 1.4.5, IPFS Integration




## 🚀 Quick Start

### Prerequisites
- Node.js >= 16.0.0
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


## 🔧 Development Guide

### Adding New AI Services
1. Create new service file in `ai-server/src/services/`
2. Implement standard interface methods
3. Register service in `aiService.js`
4. Update API routes


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


## 🤝 Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details



## 🙏 Acknowledgments

Thanks to all developers and users who have contributed to this project!

---

**AI-DApp** - Making AI and Blockchain Integration Simpler 🚀

# Galeon Brain Link — 开发指南

基于完整代码分析，逐模块列出要改什么、新建什么、怎么接入。

---

## 模块 1: Monad 链配置

### 后端改动

**文件: `ai-server/src/config/chains.js`**
- 现有: BSC + Base 两个链配置
- 新增 Monad 配置:
```javascript
Monad: {
  chainId: 10143,  // 前端 ContractDeployment.tsx 已有此 chainId
  name: 'Monad',
  rpcUrl: 'https://rpc.monad.xyz',  // TODO: 确认主网 RPC
  rpcUrls: ['https://rpc.monad.xyz'],
  explorerUrl: 'https://explorer.monad.xyz',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  gasType: 'eip1559',
  blockTime: 800,
  confirmations: 1,
}
```

**文件: `ai-server/src/config/contracts.js`**
- 现有: BSC (USDT/BUSD/PancakeRouter/WBNB) + Base (USDC/AerodromeRouter/WETH)
- 新增:
```javascript
Monad: {
  USDC: '',              // TODO: Circle native USDC on Monad
  WMON: '',              // TODO: Wrapped MON
  WETH: '',              // TODO: Bridged WETH
  GaleonBrain: '',       // 部署后填入
  GaleonRouter: '',      // 部署后填入
  KuruRouter: '',        // TODO: Kuru DEX Router
}
```

**文件: `ai-server/src/utils/rpcProvider.js`**
- 已有多 RPC 轮询和故障切换机制
- 只需确保 chains.js 的 Monad 配置能被自动读取，不需要改代码

**文件: `ai-server/src/services/autoTrade/RiskController.js`**
- 第 39-46 行定义了 `usdtContracts` (BSC + Base)
- 新增 Monad 的 USDC 地址:
```javascript
this.usdtContracts.Monad = ['0x...'];  // Monad USDC
```

### 前端改动

**文件: `ai-dapp/src/components/ContractDeployment.tsx`**
- **已有 Monad Testnet 支持** (chainId 10143):
```typescript
'10143': {
  chainId: '0x2767',
  chainName: 'Monad Testnet',
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com']
}
```
- 需要更新为主网配置

**文件: `ai-dapp/src/contexts/PrivyWalletContext.tsx`**
- 第 92-166 行定义了 BSC/Base/Solana 的链配置
- 新增 Monad chain 定义 (用于 Privy 嵌入式钱包，如果需要)
- 或者 Brain Link 使用 MetaMask 直接连接 Monad (不经过 Privy)

**文件: `ai-dapp/.env.development` + `.env.production`**
- 新增:
```
REACT_APP_MONAD_CHAIN_ID=10143
REACT_APP_MONAD_BRAIN_CONTRACT=0x...
REACT_APP_MONAD_ROUTER_CONTRACT=0x...
REACT_APP_MONAD_RPC_URL=https://rpc.monad.xyz
```

### 数据库
- **不需要 schema 改动** — `auto_trade_executions.chain` 字段是 VARCHAR(20)，直接存 'Monad'
- `auto_trade_config.supported_chains` 是 JSON 字段，直接加入 'Monad'

**工作量: 1 天**

---

## 模块 2: GaleonBrain 合约

### 新建文件

**文件: `ai-dapp/contracts/monad/GaleonBrain.sol`**

合约定义见 `GALEON_BRAIN_LINK_DEV.md` 模块 2。

核心 struct 和函数:
- `TradeDecision` — 方向/置信度/风险/入场价/止损/止盈/理由/历史胜率
- `AIEndorsedTrade` — trader/token/amount/AI背书数据/PnL
- `MicroPosition` — 微操仓位跟踪 (DCA步骤/已实现PnL/步数)
- `publishDecision()` — Oracle 推送
- `recordEndorsedTrade()` — 记录 AI 背书交易
- `settleTrade()` — 平仓回填 PnL
- `getTraderStats()` — 查询交易者历史 (其他协议可调用)

### 部署

**文件: `ai-dapp/contracts/hardhat.config.js`**
- 现有支持: Ethereum, BSC, BSC Testnet, Base Testnet, Base Mainnet
- Solidity 0.8.20 with optimizer
- 新增 Monad 网络配置:
```javascript
monad: {
  url: 'https://rpc.monad.xyz',
  accounts: [process.env.DEPLOYER_PRIVATE_KEY],
  chainId: 10143,
}
```

### 前端合约接口

**新建: `ai-dapp/src/contracts/GaleonBrain.ts`**
- 参考现有 `CreditsPayment.ts`、`AgentRegistry.ts` 的写法
- 导出合约 ABI + 地址
- 提供 TypeScript 接口: `getTradeDecision()`, `getTraderStats()` 等

**工作量: 3-4 天**

---

## 模块 3: GaleonRouter 合约 + Micro-Execution

### 新建文件

**文件: `ai-dapp/contracts/monad/GaleonRouter.sol`**

合约定义见 `GALEON_BRAIN_LINK_DEV.md` 模块 3。

核心函数:
- `openMicroPosition()` — DCA Step 1
- `addToPosition()` — DCA Step 2-N
- `partialExit()` — 部分止盈
- `emergencyExit()` — 风险退出
- `closePosition()` — 正常平仓
- 每个函数都: 扣 0.5% → 调 Kuru → 记录 AI endorsement

### 前端合约接口

**新建: `ai-dapp/src/contracts/GaleonRouter.ts`**
- 导出 ABI + 地址
- 提供接口: `executeSwap()`, `openMicroPosition()`, `partialExit()` 等

**工作量: 3-4 天**

---

## 模块 4: Brain Oracle 服务

### 新建文件

**文件: `ai-server/src/services/autoTrade/BrainOracleService.js`**

### 集成点 — 在哪里触发推送

**文件: `ai-server/src/services/autoTrade/GainerScanner.js`**
- 现有流程: `scan()` → 遍历 token → `votingSystem.scoreSymbol()` → 如果 passed → 创建 `alpha_signals`
- 新增: scoreSymbol 后调用 `brainOracle.publishDecision()`
- 具体位置: 在创建 alpha_signals INSERT 语句之前/同时
- 代码:
```javascript
// 现有: 投票通过后
const votingResult = await this.votingSystem.scoreSymbol(symbol, marketData, btcContext);

// 新增: 推送到 Monad
if (votingResult.passed || votingResult.absScore >= 4) {
  const evidence = await this.learningEngine.getTokenHistoryVotes(symbol, votingResult.direction, {});
  await this.brainOracle.publishDecision(symbol, votingResult, evidence);
}
```

### Micro-Execution Loop

**文件: `ai-server/src/services/autoTrade/BrainOracleService.js`**

新增 `microExecutionLoop()` — 复用现有组件:

| 需要的功能 | 现有文件 | 复用方式 |
|-----------|---------|---------|
| 止盈止损检查 | `ExitMonitor.js` (Line 86-150) | 复用 `checkExitConditions()` 逻辑 |
| 动态止损 | `DynamicStopLoss.js` | 直接调用 `calculateDynamicSL()` |
| 实时评分 | `VotingSystem.js` (Line 24) | 调 `scoreSymbol()` 快速模式 |
| 价格获取 | `MarketDataCache.js` | 已有 WebSocket 实时价格 |
| K线分析 | `LearningEngine.js` (Line 150) | 调 `analyzeKlineDynamics()` |
| Combo 检查 | `GainerScanner.js` (Line 35) | 调 `_checkComboRules()` |

Loop 频率: 每 0.8 秒 (每个 Monad 区块) 检查所有活跃 MicroPosition

### 集成 — DCA 建仓逻辑

**现有参考: `BatchExecutor.js`**
- 现有: 用户批量执行, 一次买完
- 新增: Monad 上分 2-4 步 DCA
- 不改 BatchExecutor, 新建 DCA 逻辑在 BrainOracleService 中:
```javascript
// Step 1: 30% — 立即执行
await galeonRouter.openMicroPosition(token, amount * 0.3, decisionId);

// Step 2: 30% — 价格确认 (+0.3-0.5%) 后执行
// 在 microExecutionLoop 中检查价格确认条件
// 如果确认 → galeonRouter.addToPosition(positionId, amount * 0.3)

// Step 3: 40% — 动能持续后执行
// 同上
```

**工作量: 4-5 天**

---

## 模块 5: Kuru DEX 集成

### 改动文件

**文件: `ai-server/src/services/autoTrade/DEXAggregatorService.js`**
- 第 61 行 `buildSwapTx()` 方法是路由入口
- 第 79 行: Solana 分支
- 第 136 行之后: BSC/Base 分支
- 新增 Monad 分支:

```javascript
// Line ~78, 在 Solana 判断之后, BSC 判断之前
if (chain === 'Monad' || chain === 'MONAD') {
  this.log(`   🟣 [Monad] 构建 Monad 交易`);
  return await this._buildMonadSwapTx(params);
}
```

**新增方法 `_buildMonadSwapTx()`**:
- 不直接调 Kuru Router, 而是调 GaleonRouter (包含 0.5% 手续费 + AI endorsement)
- GaleonRouter 内部调 Kuru
- 交易数据结构参考现有 PancakeSwap V3 的 `exactInputSingle` 模式 (第 34-37 行)

### 需要调研

- Kuru DEX Router 合约地址 — 查 https://docs.kuru.io/
- Kuru swap ABI — 是标准 Uniswap V3 兼容还是自定义
- 备选: 0x Swap API (已聚合 Kuru + 其他 Monad DEX), 用 HTTP API 而非直接调合约

**工作量: 2-3 天**

---

## 模块 6: Smart Account + Session Key

### 新建文件

**文件: `ai-dapp/src/services/monadSmartAccount.ts`**

### 与现有钱包的关系

| 现有 | 用途 | Monad Brain Link |
|------|------|-----------------|
| `MultiWalletContext.tsx` | MetaMask + Phantom 连接 | **复用 MetaMask 连接 Monad** |
| `PrivyWalletContext.tsx` | Privy 嵌入式钱包 (BSC/Base/Solana) | **不用**, Monad 用 Smart Account |
| `BlockchainContext.tsx` | EVM/Solana 上下文 | 可能需要扩展支持 Monad |

### 实现方式

- 用 **Biconomy SDK** 在 Monad 上创建 ERC-4337 Smart Account
- Monad 已部署 Biconomy 合约 (根据之前调研)
- Session Key 授权范围:
  - 目标合约: GaleonRouter 地址 (只能调这个)
  - 允许的函数: `openMicroPosition`, `addToPosition`, `partialExit`, `emergencyExit`, `closePosition`
  - 单笔上限 + 有效期

### 后端配合

**文件: `ai-server/src/services/autoTrade/AutoTradeService.js`**
- 用户 Monad Smart Account 地址存入 `auto_trade_config` 表
- 新增字段或复用 `wallet_address` (chain='Monad' 时存 Smart Account 地址)
- Agent Wallet 私钥: 环境变量 `MONAD_AGENT_WALLET_KEY`

**工作量: 3 天**

---

## 模块 7: Brain Link 前端页面

### 新建文件清单

```
src/pages/
├── BrainLinkHome.tsx          # /brain
├── BrainLinkAssetPage.tsx     # /brain/:asset
├── BrainLinkTradePage.tsx     # /brain/trade
├── BrainLinkHistoryPage.tsx   # /brain/history
├── BrainLinkEmbedDemo.tsx     # /brain/embed-demo

src/components/brainLink/
├── BrainLinkWidget.tsx        # 核心 widget
├── BrainDecisionHero.tsx      # 决策英雄区
├── BrainReasoningCard.tsx     # Why 卡片
├── BrainEvidenceCard.tsx      # 历史依据
├── BrainRiskCard.tsx          # 风控评估
├── BrainMicroPlan.tsx         # Micro-Execution Plan
├── BrainVotingRadar.tsx       # 雷达图
├── BrainVotingBars.tsx        # 投票条形图
├── BrainTimeline.tsx          # 决策时间线
├── BrainChartAnnotated.tsx    # K线 + Brain 标注
├── MicroStepProgress.tsx      # Micro-step 进度条
├── MicroStepLog.tsx           # Micro-step 记录
├── BrainActivityFeed.tsx      # 实时活动流
├── BrainLearningEvolution.tsx # 学习进化
├── BrainExecuteButton.tsx     # Execute/Override
├── BrainTradeRecord.tsx       # 交易记录
├── BrainPopup.tsx             # 嵌入弹窗

src/services/
├── brainLinkService.ts        # API 调用

src/hooks/
├── useBrainLink.ts            # 决策数据
├── useBrainActivity.ts        # 活动流
├── useMicroExecution.ts       # Micro-step 状态
```

### 路由改动

**文件: `ai-dapp/src/App.tsx`**
- 第 61-95 行是 MainLayout 路由
- 在现有路由后新增:
```tsx
import BrainLinkHome from './pages/BrainLinkHome';
import BrainLinkAssetPage from './pages/BrainLinkAssetPage';
import BrainLinkTradePage from './pages/BrainLinkTradePage';
import BrainLinkHistoryPage from './pages/BrainLinkHistoryPage';
import BrainLinkEmbedDemo from './pages/BrainLinkEmbedDemo';

// 在 MainLayout Route 内, 约第 93 行 (/docs 之后):
<Route path="/brain" element={<BrainLinkHome />} />
<Route path="/brain/asset/:asset" element={<BrainLinkAssetPage />} />
<Route path="/brain/trade" element={<ProtectedRoute><BrainLinkTradePage /></ProtectedRoute>} />
<Route path="/brain/history" element={<ProtectedRoute><BrainLinkHistoryPage /></ProtectedRoute>} />
<Route path="/brain/embed-demo" element={<BrainLinkEmbedDemo />} />
```

### 导航改动

**文件: `ai-dapp/src/components/MainLayout.tsx`**
- 顶部导航条新增 "Brain Link" 入口
- 或者做成独立导航 (Brain Link 自己的 5 个 tab)

### 数据来源

| 页面内容 | 数据来源 | API |
|---------|---------|-----|
| 决策 (方向/置信度) | 后端 Brain 实时计算 | `GET /api/brain-link/decision/:asset` |
| 投票明细 | VotingSystem votes[] | `GET /api/brain-link/decision-detail/:id` |
| 历史依据 | LearningEngine 数据库查询 | 包含在 decision 响应中 |
| 风控评估 | RiskController 实时计算 | `POST /api/brain-link/assess-risk` |
| K线数据 | Binance K线 API (现有 MarketDataCache) | `GET /api/brain-link/chart/:asset` |
| Brain Activity | GainerScanner 扫描事件 | WebSocket 或 `GET /api/brain-link/activity` |
| Micro-step 状态 | GaleonRouter 合约 + 后端 | `GET /api/brain-link/micro/:positionId` |
| 学习进化 | LearningEngine 权重变化 | `GET /api/brain-link/learning/evolution` |
| 交易者历史 | auto_trade_executions 表 | `GET /api/brain-link/trader/:address/trades` |

### 图表库

- K线图: 现有 `chart.js@4.5.0` + `react-chartjs-2@5.3.0`
- 雷达图: chart.js 原生支持 radar chart
- 或者用 SVG 手绘 (mockup 中已用 SVG)

**工作量: 6-7 天**

---

## 模块 8: Brain Link API

### 新建文件

**文件: `ai-server/src/routes/brainLinkRoutes.js`**
- 参考现有 `autoTradeRoutes.js` (60+ 端点) 的结构

**文件: `ai-server/src/controllers/brainLinkController.js`**
- 参考现有 `autoTradeController.js` 的写法

### API 端点

```
# 决策查询
GET  /api/brain-link/decisions              → 所有活跃决策
GET  /api/brain-link/decision/:asset        → 单 token 决策
GET  /api/brain-link/decision-detail/:id    → 投票明细
GET  /api/brain-link/decision-timeline/:asset → 决策变化历史

# 风控
POST /api/brain-link/assess-risk            → 评估一笔交易

# Micro-Execution
GET  /api/brain-link/micro/:positionId      → 微操仓位状态
GET  /api/brain-link/micro-plan/:asset      → 微操计划预览

# 图表
GET  /api/brain-link/chart/:asset           → K线 + Brain 标注

# 交易者
GET  /api/brain-link/trader/:address/stats  → 汇总统计
GET  /api/brain-link/trader/:address/trades → 交易列表 (含 micro-steps)

# 学习
GET  /api/brain-link/learning/evolution     → Brain 学习进化

# 活动流
GET  /api/brain-link/activity               → 实时活动 (或 WebSocket)
```

### 数据来源 — 每个 API 怎么取数据

| API | 数据来源 |
|-----|---------|
| `/decisions` | 内存缓存: GainerScanner 最近一轮扫描的 votingResult |
| `/decision/:asset` | VotingSystem.scoreSymbol() 实时调用 + LearningEngine 查历史 |
| `/decision-detail/:id` | 缓存的 votes[] 数组 (VotingSystem 输出) |
| `/decision-timeline/:asset` | 新建表 `brain_decision_history` 记录每次决策变化 |
| `/assess-risk` | RiskController.checkTradeRisk() 复用 |
| `/micro/:positionId` | Monad 链上 GaleonRouter.microPositions() 读取 |
| `/chart/:asset` | Binance K线 API (MarketDataCache 已有) + 标注数据 |
| `/trader/:address/stats` | Monad 链上 GaleonBrain.getTraderStats() |
| `/trader/:address/trades` | auto_trade_executions WHERE chain='Monad' |
| `/learning/evolution` | LearningEngine.loadWeights() 历史变化 |
| `/activity` | AgentBus 事件流 (现有事件系统) |

### 路由注册

**文件: `ai-server/server.js`**
- 第 478-514 行注册路由
- 新增:
```javascript
const brainLinkRoutes = require('./src/routes/brainLinkRoutes');
app.use('/api/brain-link', brainLinkRoutes);
```

### 新增数据库表

```sql
CREATE TABLE brain_decision_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  asset VARCHAR(20) NOT NULL,
  direction VARCHAR(10),
  score INT,
  confidence DECIMAL(5,2),
  risk_level VARCHAR(10),
  reasoning TEXT,
  similar_setups INT,
  win_rate DECIMAL(5,2),
  votes_json TEXT,
  decision_id VARCHAR(50),          -- 链上 ID
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_asset_time (asset, created_at)
);

CREATE TABLE micro_execution_steps (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  position_id VARCHAR(50) NOT NULL,
  step_number INT NOT NULL,
  step_type ENUM('DCA_IN','PARTIAL_TP','SL_ADJUST','FULL_EXIT','RISK_EXIT'),
  amount DECIMAL(20,8),
  price DECIMAL(20,8),
  tx_hash VARCHAR(100),
  onchain_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_position (position_id)
);
```

**工作量: 2-3 天**

---

## 开发顺序与排期

| 优先级 | 时间 | 模块 | 依赖 |
|--------|------|------|------|
| 1 | 9/19-9/20 | 模块1: 链配置 | 无 |
| 2 | 9/20-9/23 | 模块2: GaleonBrain 合约 | 模块1 |
| 3 | 9/23-9/26 | 模块3: GaleonRouter 合约 | 模块2 |
| 4 | 9/24-9/26 | 模块5: Kuru DEX 调研+集成 | 模块1 (可与模块3并行) |
| 5 | 9/26-9/30 | 模块4: Brain Oracle + Micro Loop | 模块2+3 |
| 6 | 9/30-10/2 | 模块6: Smart Account | 模块3 |
| 7 | 10/2-10/4 | 模块8: Brain Link API | 模块4 |
| 8 | 10/4-10/10 | 模块7: 前端页面 | 模块8 |
| 9 | 10/10-10/13 | 集成测试 + Demo 视频 + 提交 | 全部 |

---

## 风险项

| 风险 | 影响 | 应对 |
|------|------|------|
| Kuru DEX 接口不兼容标准 Uniswap | 模块5延期 | 备选 0x Swap API |
| Biconomy 不支持 Monad | 模块6延期 | 用简单 approve+限额合约替代 |
| Monad 主网 gas 比预期高 | Micro-Execution 不经济 | 减少 micro-step 数量 |
| 前端页面 7 天不够 | 页面不完整 | 优先做 Asset 分析页 + Embed Demo (Demo 核心) |
| 没有真实交易数据 | Demo 不真实 | 用 Paper Trade 模式生成模拟数据 |

# Galeon Brain Link — 开发文档

## 产品定义

**Galeon Brain Link** — 可嵌入的 AI 交易智能模块 + 链上 AI-Endorsed Trade 原语

**一句话**: An AI/ML pre-trade intelligence layer that checks direction, risk, and historical edge before every trade on Monad — creating AI-Endorsed Trades as a new onchain primitive, with AI Micro-Execution that splits every trade into block-by-block micro-steps.

**核心行为**: Before every trade, ask Galeon.

**Why Monad**: AI Micro-Execution — Brain 不是一次买入一次卖出, 而是逐区块微操: DCA 分批建仓、动态止损调整、分批止盈、风险触发即时退出。0.8s 出块 + 近零 gas 让这在经济上才可行。在 ETH 上同样操作 gas 成本 $30+, 在 Monad 上几乎免费。

---

## 目标赛事

- **比赛**: Monad Metropolis Hackathon
- **赛道**: Track 1 — Onchain Finance & Trading ($30K)
- **提交截止**: 2026年10月13日
- **官网**: https://hackathon.monad.xyz/

---

## 产品架构

```
┌──────────────────────────────────────────────────────────────┐
│                    任何 Monad 应用                            │
│         (DEX / Wallet / AI Agent / Trading Bot)              │
│                                                              │
│    嵌入方式:                                                  │
│    1. <GaleonBrainWidget asset="MON" />                      │
│    2. galeon.world/brain/mon                                  │
│    3. 合约直接调用 GaleonBrain.getTradeDecision("MON")        │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│                 Monad Chain                                   │
│                                                              │
│  ┌─────────────────┐  ┌──────────────────┐                   │
│  │ GaleonBrain     │  │ GaleonRouter     │                   │
│  │ 合约            │  │ 合约             │                   │
│  │                 │  │                  │                   │
│  │ • 决策查询      │  │ • Kuru DEX 执行  │                   │
│  │ • 风控评估      │  │ • 0.5% 手续费    │                   │
│  │ • AI Endorsement│  │ • Smart Account  │                   │
│  │   记录          │  │   Session Key    │                   │
│  └────────┬────────┘  └────────┬─────────┘                   │
│           │                    │                              │
│  ┌────────▼────────────────────▼─────────┐                   │
│  │        AIEndorsedTrade Records        │                   │
│  │  (链上永久记录, 其他协议可读取)         │                   │
│  └───────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────┘
                         ▲
                         │ 推送决策
┌────────────────────────┴─────────────────────────────────────┐
│                 Galeon Backend (链下)                         │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐     │
│  │ Market     │  │ Galeon     │  │ Brain Oracle        │     │
│  │ Data       │→ │ Brain      │→ │ Service             │     │
│  │ (CEX全量)  │  │ (决策引擎) │  │ (签名→推送到Monad)  │     │
│  └────────────┘  └────────────┘  └─────────────────────┘     │
│                                                              │
│  现有复用:                                                    │
│  VotingSystem (12+维度) + RiskController + LearningEngine     │
│  GainerScanner + MarketDataCache + ShadowFilterService        │
└──────────────────────────────────────────────────────────────┘
```

---

## 模块清单

### 模块 1: Monad Chain Config (后端 + 前端)

**改造现有文件, 不新建**

#### 后端: `ai-server/src/config/chains.js`
新增 Monad 链配置:
```javascript
Monad: {
  chainId: 10143,  // TODO: 确认 Monad mainnet chainId
  name: 'Monad',
  rpcUrl: 'https://rpc.monad.xyz',
  rpcUrls: [
    'https://rpc.monad.xyz',
    // 备选 RPC
  ],
  explorerUrl: 'https://explorer.monad.xyz',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18
  },
  gasType: 'eip1559',
  blockTime: 800,       // 0.8秒出块
  confirmations: 1,
}
```

#### 后端: `ai-server/src/config/contracts.js`
新增 Monad 合约地址:
```javascript
Monad: {
  USDC: '',           // TODO: Monad 上的 USDC 地址
  WMON: '',           // TODO: Wrapped MON
  WETH: '',           // TODO: 桥接 WETH
  GaleonBrain: '',    // 部署后填入
  GaleonRouter: '',   // 部署后填入
  KuruRouter: '',     // TODO: Kuru DEX Router 地址
}
```

#### 前端: `ai-dapp/src/contexts/PrivyWalletContext.tsx`
在已有的 BSC/Base 链定义旁, 新增 Monad chain 定义

#### 前端: `ai-dapp/.env.development` / `.env.production`
新增:
```
REACT_APP_MONAD_BRAIN_CONTRACT=0x...
REACT_APP_MONAD_ROUTER_CONTRACT=0x...
REACT_APP_MONAD_CHAIN_ID=10143
```

**工作量: 1 天**

---

### 模块 2: GaleonBrain 合约 (Solidity)

**新建: `ai-dapp/contracts/monad/GaleonBrain.sol`**

核心功能:
1. 存储 Brain 推送的交易决策
2. 提供查询接口 (任何 App 可调用)
3. 风控评估入口
4. 记录 AI-Endorsed Trade

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract GaleonBrain {
    address public oracle;        // Brain Oracle 服务地址, 唯一可推送决策的地址
    address public owner;

    // ========== 交易决策 ==========
    struct TradeDecision {
        string asset;             // "MON", "WETH"
        uint8 direction;          // 0=WAIT, 1=LONG, 2=SHORT
        uint8 confidence;         // 0-100
        uint8 riskLevel;          // 0=LOW, 1=MEDIUM, 2=HIGH
        int256 entryPrice;        // 建议入场价 (18 decimals)
        int256 stopLoss;
        int256 takeProfit;
        string reasoning;         // 一句话理由
        uint16 similarSetups;     // 历史类似形态次数
        uint8 historicalWinRate;  // 历史胜率 0-100
        uint256 timestamp;
    }

    // asset => 最新决策
    mapping(string => TradeDecision) public latestDecisions;
    // 决策历史 (用于验证)
    mapping(uint256 => TradeDecision) public decisionHistory;
    uint256 public decisionCount;

    // ========== AI-Endorsed Trade (新金融原语) ==========
    struct AIEndorsedTrade {
        address trader;
        address token;
        uint256 amount;
        uint8 direction;
        uint8 confidence;
        uint8 riskLevel;
        uint16 similarSetups;
        uint8 historicalWinRate;
        uint256 decisionId;       // 关联的 Brain 决策
        uint256 timestamp;
        // 交易结果 (平仓后填入)
        bool settled;
        int256 pnlBps;            // 盈亏 basis points
    }

    mapping(uint256 => AIEndorsedTrade) public endorsedTrades;
    uint256 public endorsedTradeCount;

    // trader => tradeId[]
    mapping(address => uint256[]) public traderHistory;

    // ========== 风控评估 ==========
    struct RiskAssessment {
        uint8 riskScore;          // 0-100
        uint8 action;             // 0=PASS, 1=ADJUST, 2=REJECT
        uint256 suggestedAmount;  // 建议金额
        string reason;
    }

    // ========== Events ==========
    event DecisionPublished(string asset, uint8 direction, uint8 confidence, uint256 decisionId);
    event TradeEndorsed(address indexed trader, address token, uint256 amount, uint8 confidence, uint256 tradeId);
    event TradeSettled(uint256 indexed tradeId, int256 pnlBps);

    // ========== 核心函数 ==========

    // Oracle 推送决策
    function publishDecision(TradeDecision calldata decision) external onlyOracle { }

    // 任何人查询最新决策
    function getTradeDecision(string calldata asset) external view returns (TradeDecision memory) { }

    // 记录 AI-Endorsed Trade (通过 GaleonRouter 调用)
    function recordEndorsedTrade(
        address trader,
        address token,
        uint256 amount,
        uint256 decisionId
    ) external returns (uint256 tradeId) { }

    // 平仓后记录结果
    function settleTrade(uint256 tradeId, int256 pnlBps) external { }

    // 查询交易者历史表现
    function getTraderStats(address trader) external view returns (
        uint256 totalTrades,
        uint256 winCount,
        int256 totalPnlBps
    ) { }

    // 查询策略历史表现
    function getStrategyPerformance(string calldata strategy) external view returns (
        uint256 totalSignals,
        uint8 winRate,
        int256 avgPnlBps
    ) { }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle");
        _;
    }
}
```

**说明**:
- `publishDecision`: Brain Oracle 定时推送, 每次分析完一个 token 就推一次
- `recordEndorsedTrade`: 用户通过 GaleonRouter 交易时自动调用, 记录 AI 背书
- `settleTrade`: 平仓时回填 PnL, 用于计算历史胜率
- `getTraderStats`: 其他协议可调用, 读取用户 AI-endorsed 交易历史

**工作量: 3-4 天**

---

### 模块 3: GaleonRouter 合约 (Solidity)

**新建: `ai-dapp/contracts/monad/GaleonRouter.sol`**

核心功能:
1. 对接 Kuru DEX 执行 swap
2. 每笔交易扣 0.5% 手续费
3. 交易时自动调用 GaleonBrain.recordEndorsedTrade()
4. **AI Micro-Execution**: 支持分步建仓/平仓, 每步都是独立的链上操作

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract GaleonRouter {
    address public galeonBrain;   // GaleonBrain 合约地址
    address public kuruRouter;    // Kuru DEX Router 地址
    address public feeReceiver;   // 手续费接收地址
    uint256 public feeRate = 50;  // 0.5% = 50 / 10000

    // ========== Micro-Execution Position Tracking ==========
    struct MicroPosition {
        address trader;
        address token;
        uint256 totalAmountIn;     // 累计投入
        uint256 totalTokenAmount;  // 累计持有 token 数量
        uint256 realizedPnl;       // 已实现 PnL (部分平仓)
        uint8 stepCount;           // 已执行步数 (DCA steps + partial exits)
        uint256 decisionId;        // 关联 Brain 决策
        bool isOpen;
    }

    mapping(uint256 => MicroPosition) public microPositions;
    uint256 public positionCount;

    // ========== Events ==========
    event MicroStep(uint256 indexed positionId, string stepType, uint256 amount, uint8 stepNumber);
    // stepType: "DCA_IN", "PARTIAL_TP", "SL_ADJUST", "FULL_EXIT", "RISK_EXIT"

    // ========== Micro-Execution Functions ==========

    // Step 1: 初始建仓 (e.g. 先买 30%)
    function openMicroPosition(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,          // 第一步的金额 (不是全部)
        uint256 amountOutMin,
        uint256 decisionId
    ) external returns (uint256 positionId) {
        // 1. 扣 0.5% 手续费
        // 2. 调 Kuru swap
        // 3. 创建 MicroPosition
        // 4. recordEndorsedTrade
        // 5. emit MicroStep("DCA_IN", amount, 1)
    }

    // Step 2-N: DCA 加仓
    function addToPosition(
        uint256 positionId,
        uint256 amountIn,
        uint256 amountOutMin
    ) external {
        // 1. 验证 position 还在
        // 2. 扣 0.5%
        // 3. swap
        // 4. 更新 totalAmountIn + totalTokenAmount
        // 5. emit MicroStep("DCA_IN", amount, stepCount)
    }

    // 部分止盈
    function partialExit(
        uint256 positionId,
        uint256 tokenAmount,       // 卖出多少 token
        uint256 amountOutMin
    ) external {
        // 1. 扣 0.5%
        // 2. swap token → USDC
        // 3. 计算这部分的 PnL
        // 4. 更新 realizedPnl
        // 5. emit MicroStep("PARTIAL_TP", amount, stepCount)
    }

    // 风险触发即时退出 (全部)
    function emergencyExit(
        uint256 positionId,
        uint256 amountOutMin
    ) external {
        // 1. 卖出全部 token
        // 2. 扣 0.5%
        // 3. 计算总 PnL
        // 4. 调 GaleonBrain.settleTrade()
        // 5. emit MicroStep("RISK_EXIT", amount, stepCount)
    }

    // 正常全部平仓
    function closePosition(
        uint256 positionId,
        uint256 amountOutMin
    ) external returns (int256 totalPnl) {
        // 1. 卖出剩余 token
        // 2. 扣 0.5%
        // 3. 计算 totalPnl = realizedPnl + 这次的 PnL
        // 4. 调 GaleonBrain.settleTrade()
        // 5. emit MicroStep("FULL_EXIT", amount, stepCount)
    }
}
```

**AI Micro-Execution 示例流程**:
```
一笔 LONG MON $420 的完整微操过程:

14:03:00.0  Brain LONG 76% → openMicroPosition($126, 30%)    Step 1: DCA_IN
14:03:00.8  确认成交 ✓
14:03:04.0  价格涨 0.5% → addToPosition($126, 30%)           Step 2: DCA_IN
14:03:08.0  继续涨 → addToPosition($168, 40%)                Step 3: DCA_IN
14:05:00.0  动能减弱 → partialExit(30%)                       Step 4: PARTIAL_TP
14:08:00.0  RSI 过热 → partialExit(30%)                       Step 5: PARTIAL_TP
14:12:00.0  反转信号 → closePosition(剩余 40%)                Step 6: FULL_EXIT

一笔交易 = 6 笔链上操作, 每笔都有 AI endorsement
在 ETH 上 gas ≈ $30+, 在 Monad 上 ≈ $0.01
```

**与现有 DEXAggregatorService 的关系**:
- DEXAggregatorService (`ai-server/src/services/autoTrade/DEXAggregatorService.js`) 现有 `buildSwapTx()` 方法按 chain 路由
- 新增 Monad 分支: `if (chain === 'Monad')` → 构建调用 GaleonRouter 的交易
- 不改现有 BSC/Base/Solana 逻辑

**工作量: 2-3 天**

---

### 模块 4: Brain Oracle 服务 (后端)

**新建: `ai-server/src/services/autoTrade/BrainOracleService.js`**

功能: Brain 分析完 token 后, 将决策推送到 Monad 链上的 GaleonBrain 合约

```javascript
/**
 * BrainOracleService
 *
 * 监听 Brain 决策 → 签名 → 推送到 Monad GaleonBrain 合约
 *
 * 触发时机:
 *   VotingSystem.scoreSymbol() 完成后
 *   → 调用 BrainOracleService.publishDecision()
 *
 * 依赖:
 *   - ethers.js (Monad RPC)
 *   - Oracle 私钥 (环境变量 MONAD_ORACLE_PRIVATE_KEY)
 *   - GaleonBrain 合约 ABI
 */

class BrainOracleService {
    constructor() {
        // Monad RPC provider
        // Oracle wallet (用于签名推送交易)
        // GaleonBrain 合约实例
    }

    /**
     * 将 VotingSystem 的评分结果推送到链上
     *
     * @param {string} asset - token symbol
     * @param {object} votingResult - VotingSystem.scoreSymbol() 的输出
     *   { direction, score, confidence, passed, votes[], leverage }
     * @param {object} evidence - 从数据库查询的历史依据
     *   { similarSetups, winRate, avgPnl }
     * @param {object} riskData - RiskController 的风控数据
     *   { riskLevel, reasoning }
     */
    async publishDecision(asset, votingResult, evidence, riskData) {
        // 1. 构建 TradeDecision struct
        // 2. 调用 GaleonBrain.publishDecision()
        // 3. 记录 decisionId
    }

    /**
     * 风控评估 (链下计算, 可选推送链上)
     *
     * @param {string} walletAddress - 用户钱包
     * @param {object} proposedTrade - 用户想执行的交易
     * @returns {object} { riskScore, action: PASS/ADJUST/REJECT, suggestedAmount, reason }
     */
    async assessRisk(walletAddress, proposedTrade) {
        // 1. 读取用户链上持仓 (通过 Monad RPC)
        // 2. 调用 RiskController 的风控逻辑
        // 3. 考虑: 持仓集中度, 方向暴露, 关联性
        // 4. 返回评估结果
    }

    // ========== AI Micro-Execution Controller ==========

    /**
     * Micro-Execution 控制循环
     * 每个 Monad 区块 (0.8s) 检查所有活跃仓位
     *
     * 复用现有:
     *   - ExitMonitor 的止盈止损逻辑
     *   - DynamicStopLoss 的动态止损
     *   - VotingSystem 的实时评分
     *
     * 新增微操决策:
     *   - DCA 加仓: 价格确认方向 + 动能持续 → 追加仓位
     *   - 部分止盈: 达到 TP1 → 卖 30%, TP2 → 再卖 30%
     *   - 动态止损: 每个区块根据波动率调整 SL 位
     *   - 风险退出: Fatal Combo 触发 / BTC 突变 → 立即全部清仓
     */
    async microExecutionLoop() {
        // 每 0.8s (每个区块) 执行:
        // 1. 获取所有活跃 MicroPosition
        // 2. 对每个仓位:
        //    a. 读取最新价格
        //    b. 重新跑 VotingSystem 快速评分 (只跑关键维度)
        //    c. 检查 DCA 条件 → addToPosition()
        //    d. 检查止盈条件 → partialExit()
        //    e. 检查止损条件 → emergencyExit() 或调整 SL
        //    f. 检查 Fatal Combo → emergencyExit()
        // 3. 所有操作都走 GaleonRouter 合约 (每笔扣 0.5%)
    }

    /**
     * DCA 建仓策略
     * 不是一次买满, 而是分 2-4 步建仓
     *
     * @param {object} position - 当前仓位
     * @param {object} marketData - 实时市场数据
     * @returns {object|null} { action: 'ADD', amount } 或 null
     */
    async checkDCAEntry(position, marketData) {
        // Step 1 (30%): 初始信号触发时
        // Step 2 (30%): 价格确认方向 (涨了 0.3-0.5%)
        // Step 3 (40%): 动能持续 + 量确认
        // 如果价格反向 → 不追加, 止损处理
    }

    /**
     * 逐步止盈策略
     * 复用现有 partialTp 逻辑, 但每步都是链上操作
     */
    async checkPartialTP(position, currentPrice) {
        // TP1 (+5%) → 卖 30%, 同时上移 SL 到入场价 (保本)
        // TP2 (+10%) → 再卖 30%, SL 上移到 TP1
        // TP3 (+15%) → 清仓剩余
    }
}
```

**集成点 — 在哪里触发推送**:

文件: `ai-server/src/services/autoTrade/GainerScanner.js`
位置: `scoreSymbol()` 调用后, 得到投票结果时

```javascript
// 现有代码:
const votingResult = await this.votingSystem.scoreSymbol(symbol, marketData, btcContext);

// 新增: 推送到 Monad
if (votingResult.passed) {
    const evidence = await this.learningEngine.getSimilarSetups(symbol, votingResult);
    await this.brainOracle.publishDecision(symbol, votingResult, evidence, riskData);
}
```

**工作量: 3-4 天**

---

### 模块 5: Kuru DEX 集成 (后端)

**改造现有: `ai-server/src/services/autoTrade/DEXAggregatorService.js`**

在 `buildSwapTx()` 方法中新增 Monad 分支:

```javascript
// 现有分支:
// if (chain === 'SOLANA') → Jupiter
// if (chain === 'BSC') → PancakeSwap
// if (chain === 'Base') → Aerodrome

// 新增:
if (chain === 'Monad') {
    return await this._buildMonadSwapTx(params);
}

async _buildMonadSwapTx({ tokenIn, tokenOut, amountIn, slippage, userAddress, decisionId }) {
    // 1. 查询 Kuru 最优路由 (或 0x Swap API for Monad)
    // 2. 构建调用 GaleonRouter.executeSwap() 的交易
    // 3. 返回 tx data
}
```

**需要调研**:
- Kuru DEX Router 合约地址和 ABI
- Kuru 的 swap 接口格式
- 或者用 0x Swap API (已聚合 Kuru + 其他 Monad DEX)

**工作量: 2 天**

---

### 模块 6: Smart Account + Session Key (前端 + 后端)

**新建: `ai-dapp/src/services/monadSmartAccount.ts`**

用 Biconomy SDK 在 Monad 上创建 ERC-4337 Smart Account:

```typescript
/**
 * Monad Smart Account 管理
 *
 * 功能:
 * 1. 创建 Smart Account (ERC-4337)
 * 2. 设置 Session Key (限额, 限时, 只能调 GaleonRouter)
 * 3. Agent Wallet 签名执行交易
 */

// 用户首次使用:
// 连接 MetaMask → 创建 Smart Account → 存入资金 → 设置 Session Key

// Session Key 授权范围:
// - 目标合约: GaleonRouter 地址 (只能调这个)
// - 单笔上限: 用户设置 (如 $50)
// - 有效期: 用户设置 (如 30 天)
// - 操作: executeSwap, executeExit

// Brain 自动交易时:
// Agent Wallet (后端持有) 用 Session Key 签名 → 调 GaleonRouter → 无需用户在线
```

**与现有钱包的关系**:
- 现有 Privy 嵌入式钱包用于 BSC/Base/Solana 自动交易
- Monad 上用 Biconomy Smart Account (ERC-4337)
- 两套并行, 不冲突
- 前端在 AutoTrade 页面的 chain 选择器中新增 "Monad" 选项

**工作量: 3 天**

---

### 模块 7: Brain Link Widget (前端)

**新建: `ai-dapp/src/components/brainLink/`**

```
brainLink/
├── BrainLinkWidget.tsx        # 核心 widget 组件
├── BrainLinkPage.tsx          # 独立页面 (galeon.world/brain/:asset)
├── BrainDecisionCard.tsx      # 决策展示卡片
├── RiskAssessmentCard.tsx     # 风控评估卡片
├── HistoricalEvidenceCard.tsx # 历史依据卡片
├── ExecuteButton.tsx          # 执行按钮 (调 GaleonRouter)
└── BrainLinkEmbed.tsx         # 可嵌入的 iframe/SDK 版本
```

#### BrainLinkWidget 核心 UI:

```
┌────────────────────────────────────┐
│  Galeon Brain — MON                │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  LONG  ·  Confidence 76%    │  │
│  │  ADJUST — $420 recommended  │  │
│  └──────────────────────────────┘  │
│                                    │
│  Why                               │
│  BTC Trend Up + K线突破前高 +      │
│  SM 增持, 但散户追涨控制仓位       │
│                                    │
│  Historical Evidence               │
│  184 similar setups · 63% win rate │
│  Avg PnL: +4.2%                    │
│                                    │
│  Risk Assessment                   │
│  Portfolio exposure: HIGH          │
│  Suggested: $420 (not $1,000)      │
│                                    │
│  ┌────────────┐ ┌───────────────┐  │
│  │ Execute    │ │ Override      │  │
│  │ $420 ✅    │ │ $1,000 ⚠️     │  │
│  └────────────┘ └───────────────┘  │
│                                    │
│  Powered by Galeon Brain Link      │
└────────────────────────────────────┘
```

#### 数据来源:

```typescript
// 读取链上 GaleonBrain 合约
const decision = await galeonBrain.getTradeDecision("MON");

// 或者直接调后端 API (更快, 链上做验证)
const response = await fetch('/api/brain-link/decision/MON');
// {
//   direction: "LONG",
//   confidence: 76,
//   riskLevel: "MEDIUM",
//   reasoning: "BTC Trend Up + K线突破前高...",
//   similarSetups: 184,
//   winRate: 63,
//   suggestedSize: 420,
//   decisionId: 1234   // 链上可查的决策ID
// }
```

#### 路由 — 在 `ai-dapp/src/App.tsx` 新增:

```typescript
// Brain Link 独立页面
<Route path="/brain/:asset" element={<BrainLinkPage />} />
// Brain Link Demo (模拟外部 DEX 嵌入)
<Route path="/brain-link-demo" element={<BrainLinkDemoPage />} />
```

**工作量: 5-6 天**

---

### 模块 8: Brain Link API (后端)

**新建: `ai-server/src/routes/brainLinkRoutes.js`**
**新建: `ai-server/src/controllers/brainLinkController.js`**

```javascript
// 外部应用调用的 API

// 获取某个 token 的 AI 决策
GET /api/brain-link/decision/:asset
→ { direction, confidence, riskLevel, reasoning, similarSetups, winRate, decisionId }

// 风控评估 (提交一笔准备执行的交易)
POST /api/brain-link/assess-risk
Body: { walletAddress, token, amount, direction }
→ { riskScore, action: "PASS"|"ADJUST"|"REJECT", suggestedAmount, reason }

// 查询交易者 AI-endorsed 历史
GET /api/brain-link/trader/:address/stats
→ { totalTrades, winCount, winRate, totalPnlBps }

// 查询策略表现
GET /api/brain-link/strategy/:name/performance
→ { totalSignals, winRate, avgPnl, bestRegime, worstRegime }

// 查询某个决策的详情
GET /api/brain-link/decision-detail/:decisionId
→ { votes[], dimensions[], comboRules[], evidence }
```

**数据来源**: 全部从现有数据库和 Brain 实时计算, 不需要新数据

**工作量: 2 天**

---

## 开发排期

| 阶段 | 时间 | 模块 | 产出 |
|------|------|------|------|
| Week 1 | 9/18-9/22 | 模块1 (Chain Config) + 模块2 (GaleonBrain合约) | Monad 链配置完成, Brain 合约部署到 testnet |
| Week 2 | 9/23-9/28 | 模块3 (GaleonRouter) + 模块4 (Oracle Service) + 模块5 (Kuru) | 端到端: Brain决策→链上→Kuru swap |
| Week 3 | 9/29-10/5 | 模块6 (Smart Account) + 模块7 (Widget前端) | 用户能操作的完整 DApp |
| Week 4 | 10/6-10/10 | 模块8 (API) + Brain Link Demo 页面 + 集成测试 | 两个 Demo 场景跑通 |
| 提交 | 10/11-10/13 | Demo 视频录制 + 项目文档 + 提交 | 最终交付 |

---

## Demo 脚本 (3 分钟)

### 场景 1: AI Decision (45秒)
1. 打开 Galeon Brain Link → 首页展示 4 个 token 的实时决策 + Brain Activity 实时流
2. 点击 MON → 进入分析页
3. 展示: 决策 (LONG 76%) + 理由 + K线标注图 + 雷达图 + 投票条形图
4. 展示: Brain Decision Timeline — 过去 24h Brain 对 MON 从 SHORT → WAIT → LONG 的思考过程
5. 展示: Micro-Execution Plan — Brain 会分 6 步执行, DCA 建仓 + 分批止盈

### 场景 2: AI Micro-Execution (60秒) ← 核心卖点
1. 点 Execute $420 → Brain 开始 Micro-Execution
2. 切换到 Auto Trade 页 → 看到实时:
   - DCA Step 1: $126 (30%) 买入 → 链上确认
   - 0.8 秒后 DCA Step 2: $126 (30%) → 价格确认
   - 4 秒后 DCA Step 3: $168 (40%) → 动能持续
3. 3 步, 8 秒, 全部链上完成, gas $0.009
4. 展示 Brain Thinking Live: "TP1 at +5%, monitoring every block..."
5. (如果时间允许) 触发 TP1 → partialExit(30%) → SL 自动移到 breakeven
6. 强调: **"6 on-chain operations in under a minute. Gas cost: $0.02. Only possible on Monad."**

### 场景 3: Embed Demo (45秒)
1. 打开 Embed Demo → 模拟第三方 DEX
2. 点 Swap → Brain Link 弹窗从底部滑出
3. 展示: 同样的 AI 判断, 嵌入到任何 Monad 应用
4. 强调: "One widget. Any Monad app gets AI trading intelligence."

### 场景 4: On-chain + Learning (30秒)
1. 打开 History → 展示 micro-steps 在链上的完整记录 (6 步, 每步有 tx hash)
2. 展示 Brain Learning Evolution: Win Rate 55% → 67%, K线准确率 58% → 72%
3. 展示 What Other Protocols See: 借贷协议读取 → 授信额度 +20%
4. 结束语: **"Galeon Brain Link — AI intelligence and micro-execution for every trade on Monad. Before every trade, ask Galeon."**

---

## 不需要改动的现有模块

| 模块 | 文件 | 说明 |
|------|------|------|
| VotingSystem | `autoTrade/VotingSystem.js` | 12+维度投票, 直接复用 |
| GainerScanner | `autoTrade/GainerScanner.js` | 选币+分析, 新增推送调用 |
| LearningEngine | `autoTrade/LearningEngine.js` | 历史数据查询, 直接复用 |
| RiskController | `autoTrade/RiskController.js` | 风控逻辑, 直接复用 |
| ShadowFilterService | `autoTrade/ShadowFilterService.js` | 影子过滤, 直接复用 |
| MarketDataCache | `autoTrade/MarketDataCache.js` | 市场数据, 直接复用 |
| PaperTradeService | `autoTrade/PaperTradeService.js` | 模拟交易, 直接复用 |
| BatchExecutor | `autoTrade/BatchExecutor.js` | 批量执行, 新增 Monad 通道 |
| ExitMonitor | `autoTrade/ExitMonitor.js` | 止盈止损, 新增 Monad 支持 |

---

## 环境变量 (新增)

```bash
# Monad
MONAD_RPC_URL=https://rpc.monad.xyz
MONAD_CHAIN_ID=10143
MONAD_ORACLE_PRIVATE_KEY=         # Brain Oracle 签名私钥
MONAD_GALEON_BRAIN_ADDRESS=       # GaleonBrain 合约地址
MONAD_GALEON_ROUTER_ADDRESS=      # GaleonRouter 合约地址
MONAD_FEE_RECEIVER=               # 手续费接收地址
MONAD_KURU_ROUTER=                # Kuru DEX Router 地址
```

---

## 待确认事项 (开发前需调研)

| 项目 | 状态 | 说明 |
|------|------|------|
| Monad mainnet chainId | TODO | 确认正式 chainId |
| Monad USDC 合约地址 | TODO | Circle 原生 USDC on Monad |
| Kuru DEX Router ABI | TODO | 查 Kuru 文档获取 |
| Kuru swap 接口格式 | TODO | 或用 0x Swap API 替代 |
| Biconomy Monad 支持 | TODO | 确认 SDK 是否已支持 Monad |
| Monad gas 费用预估 | TODO | 确认推送决策的成本 |
| 黑客松注册 | TODO | 在 hackathon.monad.xyz 报名 |

---

## Pitch (最终版)

**English:**
Galeon Brain Link — plug AI trading intelligence into any Monad app. Every trade executed through Brain Link carries an AI endorsement on-chain: direction, confidence, risk, and historical win rate. This creates a new onchain primitive — AI-Endorsed Trades — that other protocols can read, trust, and build on.

**中文:**
Galeon Brain Link 把 AI 交易智能嵌入 Monad 任何应用。通过 Brain Link 执行的每笔交易都携带链上 AI 背书：方向、置信度、风险评级、历史胜率。这创造了一个新的链上原语 — AI-Endorsed Trade — 其他协议可以读取、信任和复用。

**一句记忆点:**
Before every trade, ask Galeon.

---

## UI 页面设计

**UI Mockup 文件**: `docs/brain-link-ui-mockup.html` (浏览器打开可交互预览)

### 页面结构总览

```
路由                              页面                    类型
/brain                           Brain Link 首页          Public
/brain/:asset                    单 Token 分析页          Public
/brain/trade                     AI 自动交易 (Monad)      Protected
/brain/history                   AI-Endorsed 交易历史     Protected
/brain/embed-demo                嵌入演示页 (hackathon)   Public
```

在 `App.tsx` 的 `MainLayout` 路由组内新增:
```tsx
<Route path="/brain" element={<BrainLinkHome />} />
<Route path="/brain/:asset" element={<BrainLinkAssetPage />} />
<Route path="/brain/trade" element={<ProtectedRoute><BrainLinkTradePage /></ProtectedRoute>} />
<Route path="/brain/history" element={<ProtectedRoute><BrainLinkHistoryPage /></ProtectedRoute>} />
<Route path="/brain/embed-demo" element={<BrainLinkEmbedDemo />} />
```

---

### 页面 1: Brain Link 首页 (`/brain`)

**文件**: `src/pages/BrainLinkHome.tsx`

**用途**: 展示 Galeon Brain 实时状态, 两栏布局

**左栏: Live Decisions**
- Token 卡片列表 (MON, WETH, WBTC, CHOG)
- 每张卡片: Token名 + 价格 + 迷你 K 线图 + Brain 入场标注 + 方向/置信度 badge + 历史依据
- 点击卡片 → 跳转 `/brain/:asset`

**右栏: Brain Activity + Stats**
- **Brain Activity 实时动态流** (每秒更新):
  - Micro-step 执行: "MON TP1 executed: sold 30% at $0.0229"
  - DCA 完成: "MON DCA complete: 3 steps, $420 in 8 seconds"
  - 决策变化: "MON WAIT → LONG 76%"
  - DCA 暂停: "WETH DCA paused: price dipped"
  - 风险告警: "CHOG SM 12→7, preparing SHORT"
  - Fatal Combo: "WETH FR+散户 → emergencyExit() ready"
  - 学习更新: "K线 weight 1.6→1.8x, Taker 反向指标 confirmed"
  - 每条带链上 micro-step 链接
- **Brain Performance 统计**: Total Decisions / Win Rate / Last Update / Dimensions Active / Learning Cycles
- **For Developers**: 嵌入代码 + Embed Demo 和 API Docs 链接

**数据来源**:
- `GET /api/brain-link/decisions` → 所有活跃决策列表
- `GET /api/brain-link/activity` → 实时活动流 (WebSocket 或轮询)
- 每 5 秒刷新

---

### 页面 2: 单 Token 分析页 (`/brain/:asset`)

**文件**: `src/pages/BrainLinkAssetPage.tsx`

**用途**: 核心页面。展示 Brain 完整分析 + Micro-Execution 计划 + 执行。两栏布局。

**顶部**: Token 名 + 价格 + 24h 涨跌

**Decision Hero 区域** (高亮卡片):
- 方向 (LONG/SHORT/WAIT) + ADJUST 建议
- 三个核心指标: Confidence 76% | Risk MED | Win Rate 63%

**左栏:**

1. **Price Chart — Brain Annotations**
   - K 线图 + Brain 标注: Entry Zone、SL 线、TP 线、SM 退出点、Volume spike
   - 24h 时间轴

2. **Why This Decision**
   - 一段话说明理由, 高亮正面 (绿) 和风险 (黄) 因素

3. **Historical Evidence**
   - 三个统计卡: Similar Setups (184) / Win Rate (63%) / Avg PnL (+4.2%)
   - Best Regime / Worst Regime / Current Regime / Avg Holding Time / Max Drawdown

4. **Risk Assessment**
   - Portfolio Risk / Reason / Your Input vs Suggested Size
   - Entry Zone / Stop Loss / Take Profit / Risk-Reward

5. **AI Micro-Execution Plan** (新增, 高亮卡片)
   - 可视化进度条: [DCA IN 3步] → [HOLD] → [TP 3步] → [SL]
   - 6 步详细计划:
     - Step 1: DCA 30% buy $126 at market
     - Step 2: If price confirms → DCA 30% ($126)
     - Step 3: If momentum holds → DCA 40% ($168)
     - TP1: +5% → sell 30%, move SL to breakeven
     - TP2: +10% → sell 30%, move SL to TP1
     - TP3: +15% → exit remaining 40%
     - Safety: 价格反向 → 只损失 Step 1
   - 底部: Est. 4-6 micro-steps · Gas ~$0.02 · Only possible on Monad

**右栏:**

6. **Dimension Radar** (雷达图)
   - 8 维度可视化: K线/BTC/动能/RSI/SM/EMA/Taker/FR
   - 绿色正面, 红色负面

7. **Voting Breakdown — Score +6**
   - 横向条形图, 每个维度一行:
     - 维度名 | 彩色进度条 + 理由文字 | 得分 (+2/-1 等)
   - 底部: Total Score / Threshold / PASSED

8. **Brain Decision Timeline**
   - 时间线展示 Brain 对这个 token 的决策变化历史:
     - Now: LONG 76% — K线突破+SM进入
     - 2h ago: WAIT 52% — 等待确认
     - 6h ago: WAIT 45% — BTC 横盘
     - 12h ago: SHORT 62% — 出货形态 → Result: +8.2% ✓
     - 1d ago: LONG 70% — 底部反弹 → Result: +5.1% ✓

**底部 Execute 区域:**
- [Execute $420 on Kuru ✅] [Override $1,000 ⚠]
- On-chain Decision ID + Monad Explorer 链接

**交互逻辑**:
1. 页面加载 → `GET /api/brain-link/decision/:asset`
2. 用户输入金额 → `POST /api/brain-link/assess-risk` → 动态更新 Micro-Execution Plan
3. Voting Breakdown 默认展开 (条形图比文字更直观)
4. 点 Execute → 连钱包 → GaleonRouter.openMicroPosition() → 开始 DCA 分步建仓
5. 点 Override → 确认框 → 全额一次买入 (跳过 DCA)

**数据来源**:
- `GET /api/brain-link/decision/:asset` → 决策 + 理由 + 投票明细 + 历史依据
- `POST /api/brain-link/assess-risk` → 风控评估
- `GET /api/brain-link/decision-timeline/:asset` → 决策变化历史
- `GET /api/brain-link/micro-plan/:asset` → Micro-Execution 计划

---

### 页面 3: AI 自动交易页 (`/brain/trade`)

**文件**: `src/pages/BrainLinkTradePage.tsx`

**用途**: 用户存入资金, Brain 全自动 Micro-Execution 交易。两栏布局。

**左栏:**

1. **Smart Account**
   - Status (Active/Inactive) + 地址 + 余额
   - [Deposit] [Withdraw] 按钮

2. **Settings**
   - Max per trade / Session Key 剩余天数 / Trading on Kuru / Fee 0.5%
   - AI Auto Trade 开关 (ON/OFF)

3. **Current Positions — AI Micro-Execution**
   - 每个持仓卡片包含:
     - Token + 方向 + PnL + micro-step 数量
     - **Micro-Execution 步骤条**: 可视化进度 (DCA→DCA→DCA→TP1→TP2→Exit)
       - 已完成步骤绿色, 当前高亮, 未来灰色
       - 每步标注时间戳
     - 汇总: Avg entry / Filled amount / 步骤耗时
     - Brain 状态: "Holding 70%. SL moved to breakeven." 或 "DCA paused — price dipped"

4. **Performance**
   - Today / 7 Days / Total Trades / Win Rate

**右栏:**

5. **Brain Micro-Execution — Live**
   - 按 Monad 区块展示 Brain 实时操作:
     - Block #: MON TP1 hit → partialExit(30%) executed
     - Block #: MON DCA Step 3 complete
     - Block #: WETH price -1.1%, DCA paused
     - Block #: WETH FR rising, if 0.001 → emergencyExit()
     - Block #: CHOG SHORT signal brewing, SM at 7
   - 标注 gas 成本 (~$0.003/step) 和扫描频率 (every 0.8s)

6. **Micro-Execution Log**
   - 今日所有链上操作记录:
     - 总操作数 + 总 gas 成本
     - DCA 建仓 (多步合并展示) + 各步链上链接
     - TP 执行 + SL 调整
     - BLOCKED 操作 (Brain 主动放弃的交易 + 原因)

**交互逻辑**:
1. 首次 → 创建 Smart Account + Session Key
2. Deposit → MetaMask → Smart Account
3. 开启 Auto Trade → Brain 开始 Micro-Execution Loop (每区块检查)
4. 每个 micro-step 独立链上 ID, 可追溯

**与现有 AutoTradePage 的关系**:
- 现有 `src/pages/AutoTradePage.tsx` 服务 BSC/Base/Solana
- 新页面专服务 Monad, 用 Smart Account + Micro-Execution
- 独立, 不冲突

---

### 页面 4: AI-Endorsed 交易历史 (`/brain/history`)

**文件**: `src/pages/BrainLinkHistoryPage.tsx`

**用途**: 展示完整交易历史 + Brain 学习进化 + 链上验证。两栏布局。

**左栏:**

1. **On-chain Verified Stats**
   - 四个统计卡: Trades / Win Rate / Total PnL / AI Trust Score
   - Monad Explorer 链接

2. **Trade Table**
   - 列: # / Token / Direction / Confidence / Result / PnL / On-chain
   - 可点击展开详情

**右栏:**

3. **Brain Learning Evolution** (核心差异化)
   - 展示 Brain 如何从每笔交易中学习进化:
     - Overall Win Rate: 55% → 67% ↑
     - K线 Accuracy: 58% → 72% ↑
     - Taker Accuracy: 52% → 41% ↓ (反向指标)
     - SM Weight: 1.0 → 1.8x ↑
     - Fatal Combo Rules: 7 active (2 learned from losses)
     - BTC Uptrend Strategy WR: 60% → 71% ↑
     - Sideways Strategy WR: 48% (Brain avoids)
   - Last learning cycle 时间 + 总周期数

4. **Trade Detail (展开)** — 含 Micro-Execution Steps
   - 基础信息: Token / Avg Entry / Final Exit / PnL / Confidence / Setups / Reason
   - **Micro-Execution 步骤记录**:
     - 步骤可视化进度条 (DCA→DCA→DCA→TP1→TP2→Exit)
     - 每步: 时间 | 类型 (DCA_IN/TP1/TP2/EXIT) | 金额和价格 | 理由 | 链上 ID
     - 汇总: N 笔链上操作 / 总 gas / 持仓时长 / 每步 AI-endorsed
   - AI Endorsement on-chain: Position ID / Micro-Steps 数 / Entry Tx / Exit Tx / Settled

5. **What Other Protocols See (On-chain)**
   - 展示其他协议能读到的链上数据:
     - Trader 地址 / Total Trades / Win Rate / AI Trust Score
   - 示例: 借贷协议读取 67% win rate + 72 trust → 授信额度 +20%

**数据来源**:
- `GET /api/brain-link/trader/:address/stats` → 汇总统计
- `GET /api/brain-link/trader/:address/trades` → 交易列表 (含 micro-steps)
- `GET /api/brain-link/learning/evolution` → Brain 学习进化数据
- 链上: GaleonBrain 合约 `endorsedTrades` + `microPositions`

---

### 页面 5: 嵌入演示页 (`/brain/embed-demo`)

**文件**: `src/pages/BrainLinkEmbedDemo.tsx`

**用途**: 黑客松 Demo 专用。模拟外部 DEX 嵌入 Brain Link 的效果。

**内容:**
- 模拟 DEX Swap 界面 (MonadSwap): From USDC → To MON, 金额输入
- 点 Swap → **Brain Link 弹窗从底部滑出**:
  - 决策: LONG MON / ADJUST $420
  - 三指标: Confidence 76% / Win Rate 63% / Setups 184
  - Why + Risk + Entry/SL/TP
  - 投票摘要: 9 bullish / 3 bearish / score +6
  - [Execute $420] [Override $1,000] [Cancel]
  - 底部: "This trade will be AI-Endorsed on Monad. Recorded on-chain forever."
- 页面底部展示嵌入代码: `<GaleonBrainWidget asset="MON" onSwap={handleSwap} />`

---

### 核心组件: Brain Link Widget

**文件**: `src/components/brainLink/BrainLinkWidget.tsx`

```tsx
interface BrainLinkWidgetProps {
  asset: string;              // "MON", "WETH"
  amount?: number;            // 触发风控评估
  mode?: 'full' | 'compact';  // full=完整面板, compact=卡片
  onExecute?: (trade) => void;
  showVoting?: boolean;
  showMicroPlan?: boolean;    // 展示 Micro-Execution Plan
}
```

- **compact**: 首页卡片 — Token + 方向 + 置信度 + 迷你K线 + 历史依据
- **full**: 分析页 — 完整决策 + 理由 + 历史 + 风控 + 投票 + Micro Plan + 执行

---

### 文件结构汇总

```
src/
├── pages/
│   ├── BrainLinkHome.tsx              # /brain 首页
│   ├── BrainLinkAssetPage.tsx         # /brain/:asset 分析页
│   ├── BrainLinkTradePage.tsx         # /brain/trade 自动交易
│   ├── BrainLinkHistoryPage.tsx       # /brain/history 交易历史
│   ├── BrainLinkEmbedDemo.tsx         # /brain/embed-demo 嵌入演示
│   └── (各页面对应 .css)
│
├── components/
│   └── brainLink/
│       ├── BrainLinkWidget.tsx        # 核心 Widget (compact + full)
│       ├── BrainDecisionHero.tsx      # 决策英雄区 (方向+置信度+风险+胜率)
│       ├── BrainReasoningCard.tsx     # Why 理由卡片
│       ├── BrainEvidenceCard.tsx      # 历史依据 (setups/WR/regime)
│       ├── BrainRiskCard.tsx          # 风控评估
│       ├── BrainMicroPlan.tsx         # Micro-Execution Plan 预览
│       ├── BrainVotingRadar.tsx       # 维度雷达图
│       ├── BrainVotingBars.tsx        # 投票条形图
│       ├── BrainTimeline.tsx          # 决策变化时间线
│       ├── BrainChartAnnotated.tsx    # K线图 + Brain 标注
│       ├── MicroStepProgress.tsx      # Micro-step 进度条
│       ├── MicroStepLog.tsx           # Micro-step 执行记录
│       ├── BrainActivityFeed.tsx      # 实时活动流
│       ├── BrainLearningEvolution.tsx # 学习进化展示
│       ├── BrainExecuteButton.tsx     # Execute/Override 按钮
│       ├── BrainTradeRecord.tsx       # 单条交易记录 (含 micro-steps)
│       └── BrainPopup.tsx             # 嵌入弹窗 (Embed Demo 用)
│
├── services/
│   ├── brainLinkService.ts            # Brain Link API 调用
│   └── monadSmartAccount.ts           # Smart Account 管理
│
└── hooks/
    ├── useBrainLink.ts                # 决策数据 hook
    ├── useBrainActivity.ts            # 实时活动流 hook
    └── useMicroExecution.ts           # Micro-step 状态 hook
```

---

### 页面间导航

```
/brain (首页)
  │
  ├── 点击 token 卡片 → /brain/:asset (分析页)
  │     ├── 查看完整分析 + Micro Plan
  │     ├── Execute → DCA 分步建仓 → 跳转 /brain/trade
  │     └── Override → 全额一次买入
  │
  ├── Nav "Auto Trade" → /brain/trade (自动交易)
  │     ├── Smart Account 管理
  │     ├── Micro-Execution 实时可视化
  │     └── Brain Thinking Live
  │
  ├── Nav "History" → /brain/history (交易历史)
  │     ├── 交易表 + 展开 micro-steps
  │     └── Brain Learning Evolution
  │
  └── Nav "Embed Demo" → /brain/embed-demo
        └── DEX mockup + Brain Link 弹窗
```

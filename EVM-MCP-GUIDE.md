# EVM MCP 完整开发指南

## 🎯 项目概述

EVM MCP (Multi-Chain Protocol) 是一个企业级的多链以太坊虚拟机集成解决方案，为AI DApp项目提供完整的EVM链交互能力。

### ✨ 核心特性

- **🔗 多链支持**: Ethereum, BSC, Polygon, Arbitrum
- **💰 智能代币管理**: 自动发现ERC20代币 + 实时价格 + USD价值
- **⛽ Gas智能优化**: 实时费用估算 + 多级重试策略
- **🚀 企业级性能**: 缓存机制 + API限流 + 批量优化
- **📊 投资组合分析**: 风险评估 + 多样化分析 + 收益统计
- **🛡️ 生产级稳定性**: 错误处理 + 自动降级 + 监控指标

## 📁 项目结构

```
src/services/
├── evmMCPAdapter.ts     # EVM链适配器 (核心)
├── mcpService.ts        # 统一路由服务 (已扩展)
├── cacheManager.ts      # 缓存管理器 (性能优化)
├── apiManager.ts        # API管理器 (限流+重试)
└── configManager.ts     # 配置管理器 (环境管理)

src/components/
└── MCPConfiguration.tsx # 前端配置界面 (已更新)

.env.local               # 环境配置文件
```

## 🚀 快速开始

### 1. 环境配置

在 `.env.local` 中配置API密钥：

```bash
# 必需配置
REACT_APP_ALCHEMY_API_KEY=your_alchemy_api_key_here

# 可选配置 (性能优化)
REACT_APP_COINGECKO_API_KEY=your_coingecko_pro_key
REACT_APP_CACHE_ENABLED=true
REACT_APP_CACHE_TTL=60000
REACT_APP_API_TIMEOUT=10000
REACT_APP_MAX_RETRIES=3

# 功能开关
REACT_APP_PORTFOLIO_ANALYSIS=true
REACT_APP_ADVANCED_METRICS=true
```

### 2. 获取Alchemy API Key

1. 访问 [Alchemy官网](https://www.alchemy.com/)
2. 创建免费账号
3. 创建新应用，选择网络：Ethereum, Polygon, Arbitrum
4. 复制API Key到 `.env.local`

### 3. 启动应用

```bash
npm install
npm start
```

## 🔧 API使用指南

### 基础查询操作

```typescript
import mcpService from './services/mcpService';

// 1. 查询ETH余额
const balanceResult = await mcpService.callReadOnlyTool(
  agentId, 
  'balance', 
  { address: '0x...' }, 
  1 // Ethereum chainId
);

// 2. 获取所有ERC20代币余额 + 价格
const tokensResult = await mcpService.callReadOnlyTool(
  agentId,
  'token_balances_with_prices',
  { address: '0x...' },
  1
);

// 3. 查询代币价格 (带图标)
const priceResult = await mcpService.callReadOnlyTool(
  agentId,
  'get_price',
  { tokenSymbol: 'eth' },
  1
);

// 4. ERC20合约信息
const assetResult = await mcpService.callReadOnlyTool(
  agentId,
  'get_asset',
  { contractAddress: '0xA0b86991c4a1F4dCA46EAA5d9c92A24cB3B7F8E46' },
  1
);
```

### Gas管理操作

```typescript
// 1. 获取当前Gas价格
const gasResult = await mcpService.callReadOnlyTool(
  agentId,
  'get_gas_price',
  {},
  1
);

// 2. 估算交易Gas费用
const estimateResult = await mcpService.callReadOnlyTool(
  agentId,
  'estimate_gas',
  { 
    transaction: {
      to: '0x...',
      value: '0.001'
    }
  },
  1
);
```

### 交易构建操作

```typescript
// 构建ETH转账交易
const transferResult = await mcpService.buildTransaction(
  agentId,
  'transfer',
  {
    from: '0x...',
    to: '0x...',
    amount: 0.1
  },
  1
);

// 返回未签名交易供前端签名
console.log(transferResult.transaction);
```

## 🌐 支持的网络

| 网络 | Chain ID | Alchemy支持 | 原生代币 | 状态 |
|------|----------|-------------|----------|------|
| Ethereum Mainnet | 1 | ✅ | ETH | 🟢 完全支持 |
| BSC Mainnet | 56 | ✅ | BNB | 🟢 完全支持 |
| Polygon Mainnet | 137 | ✅ | MATIC | 🟢 完全支持 |
| Arbitrum One | 42161 | ✅ | ETH | 🟢 完全支持 |
| Base Mainnet | 8453 | ✅ | ETH | 🟢 完全支持 |
| Linea Mainnet | 59144 | ✅ | ETH | 🟢 完全支持 |

## 📊 返回数据格式

### 代币余额查询 (token_balances_with_prices)

```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "chainId": 1,
    "chainName": "Ethereum Mainnet",
    "tokens": [
      {
        "contractAddress": "0x...",
        "name": "USD Coin",
        "symbol": "USDC",
        "decimals": 6,
        "balance": "1000.000000",
        "price": 1.001,
        "priceChange24h": 0.05,
        "totalValue": 1001.00,
        "logo": "https://..."
      }
    ],
    "totalTokens": 5,
    "totalValue": "15420.50",
    "currency": "USD",
    "analysis": {
      "topTokens": [...],
      "diversification": "Medium",
      "riskLevel": "Low",
      "priceMovement": {
        "gainers": 3,
        "losers": 1,
        "neutral": 1
      }
    }
  }
}
```

### 价格查询 (get_price)

```json
{
  "success": true,
  "data": {
    "price": "2450.75",
    "currency": "USD",
    "tokenSymbol": "eth",
    "name": "Ethereum",
    "symbol": "ETH",
    "image": {
      "thumb": "https://...",
      "small": "https://...",
      "large": "https://..."
    },
    "chainId": 1,
    "timestamp": "2024-01-01T00:00:00.000Z",
    "source": "CoinGecko"
  }
}
```

## ⚡ 性能特性

### 缓存策略

- **价格数据**: 1分钟缓存
- **代币元数据**: 1小时缓存  
- **Gas价格**: 30秒缓存
- **代币余额**: 2分钟缓存

### API限流保护

- **CoinGecko免费版**: 25 requests/minute
- **CoinGecko Pro版**: 500 requests/minute
- **Alchemy**: 100 requests/minute
- **公共RPC**: 50 requests/minute

### 性能优化

- ✅ 智能批量请求 (减少API调用)
- ✅ 并发控制 (避免过载)
- ✅ 自动重试 + 指数退避
- ✅ 请求超时保护
- ✅ 降级策略 (Alchemy -> 公共RPC)

## 🛠️ 配置选项

### 缓存配置

```typescript
// 自定义缓存设置
cacheManager.updateConfig('cache', {
  defaultTTL: 120000,  // 2分钟
  maxSize: 1000,       // 1000个条目
  cleanupInterval: 300000 // 5分钟清理
});
```

### API配置

```typescript
// 自定义API设置
apiManager.updateRetryConfig({
  maxRetries: 5,
  baseDelay: 2000,
  maxDelay: 30000
});
```

## 🔍 监控和调试

### 获取系统状态

```typescript
// 缓存状态
const cacheStats = cacheManager.getStats();
console.log('缓存命中率:', cacheStats.hitRate);

// API限流状态
const rateLimitStatus = apiManager.getRateLimitStatus();
console.log('API状态:', rateLimitStatus);

// 配置状态
const configStatus = configManager.getStatus();
console.log('配置状态:', configStatus);
```

### 日志监控

所有操作都有详细日志输出：

```
[EVM MCP] Getting token balances with prices for 0x... on chain 1
[Cache] Price cache hit for eth
[API] Rate limit reached for coingecko, waiting 2000ms
[Cache] Cleanup: removed 15 expired items
```

## 🚨 错误处理

### 常见错误和解决方案

| 错误类型 | 原因 | 解决方案 |
|---------|------|---------|
| `Alchemy API not supported` | API Key未配置 | 配置REACT_APP_ALCHEMY_API_KEY |
| `CoinGecko API error: 429` | 请求过频繁 | 等待或升级到Pro版 |
| `Failed to get balance` | 网络或地址错误 | 检查网络连接和地址格式 |
| `Request timeout` | 网络延迟 | 增加timeout配置 |

### 自动降级机制

```
Alchemy API 失败 → 公共RPC
CoinGecko Pro 失败 → CoinGecko 免费版
代币元数据 失败 → 合约直接查询
价格查询 失败 → 缓存数据
```

## 📈 生产部署建议

### 1. API Key 管理

```bash
# 生产环境
REACT_APP_ALCHEMY_API_KEY=prod_alchemy_key
REACT_APP_COINGECKO_API_KEY=prod_coingecko_key

# 开发环境  
REACT_APP_ALCHEMY_API_KEY=dev_alchemy_key
```

### 2. 性能优化

```bash
# 高性能配置
REACT_APP_CACHE_ENABLED=true
REACT_APP_CACHE_TTL=30000
REACT_APP_CONCURRENCY=10
REACT_APP_MAX_RETRIES=5
```

### 3. 监控配置

```bash
# 启用高级指标
REACT_APP_ADVANCED_METRICS=true
REACT_APP_PORTFOLIO_ANALYSIS=true
```

## 🎯 下一步扩展

### 计划中的功能

- [ ] **实时价格推送**: WebSocket价格更新
- [ ] **高级分析**: 收益率计算、风险指标
- [ ] **交易历史**: 链上交易记录查询
- [ ] **DeFi集成**: Uniswap, SushiSwap价格
- [ ] **NFT支持**: ERC721, ERC1155查询
- [ ] **跨链桥**: 资产跨链转移

### API扩展点

```typescript
// 未来扩展接口
interface FutureEVMAPI {
  getTransactionHistory(address: string): Promise<Transaction[]>;
  getDefiPositions(address: string): Promise<DefiPosition[]>;
  getNFTCollections(address: string): Promise<NFTCollection[]>;
  getYieldOpportunities(tokens: string[]): Promise<YieldPool[]>;
}
```

## 📞 技术支持

### 社区资源

- **GitHub Issues**: 报告Bug和功能请求
- **文档更新**: 贡献使用示例和最佳实践
- **API参考**: 详细的接口文档和示例

### 联系方式

如有技术问题或合作需求，请通过以下方式联系：

- 📧 技术支持：[支持邮箱]
- 💬 社区讨论：[Discord/Telegram]
- 📖 技术博客：[技术分享链接]

---

**EVM MCP** - 为AI Agent提供企业级多链EVM交互能力 🚀
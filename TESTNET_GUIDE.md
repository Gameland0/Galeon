# 🧪 LI.FI 多链集成测试指南

## 测试网环境配置

### MetaMask 网络配置

#### Sepolia Testnet
- **网络名称**: Sepolia Testnet
- **RPC URL**: https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161
- **Chain ID**: 11155111
- **货币符号**: ETH
- **区块浏览器**: https://sepolia.etherscan.io

#### Polygon Amoy Testnet  
- **网络名称**: Polygon Amoy Testnet
- **RPC URL**: https://rpc-amoy.polygon.technology
- **Chain ID**: 80002
- **货币符号**: MATIC
- **区块浏览器**: https://amoy.polygonscan.com

### 测试代币水龙头

#### Sepolia ETH
- https://sepoliafaucet.com/
- https://faucet.quicknode.com/ethereum/sepolia

#### Polygon Amoy MATIC
- https://faucet.polygon.technology/
- 选择 "Polygon Amoy" 网络

#### Solana Devnet SOL
```bash
solana airdrop 1 <your-address> --url devnet
```

## 测试场景

### 🔄 基础功能测试

#### 1. 连接测试
```
测试消息: "check balance"
预期: 显示当前测试网络余额
```

#### 2. 地址检测测试
```
测试消息: "查询地址的0xB5049c47ede1F3fF0575d396D57b4c6a1EcEF556余额"
预期: 自动识别为EVM地址，使用EVM适配器查询
```

### 💸 Transfer 功能测试

#### Sepolia 测试
```
前提: 连接 MetaMask 到 Sepolia 网络
测试消息: "transfer 0.01 ETH to 0xB5049c47ede1F3fF0575d396D57b4c6a1EcEF556"
预期: 
- 检测为 lifi_transfer 类型
- 显示交易预览
- MetaMask 弹出签名请求
- 交易成功后显示 Sepolia 浏览器链接
```

#### Polygon Amoy 测试
```
前提: 连接 MetaMask 到 Polygon Amoy 网络
测试消息: "transfer 1 MATIC to 0xB5049c47ede1F3fF0575d396D57b4c6a1EcEF556"
预期:
- 自动切换或提示切换到 Polygon Amoy
- 显示交易详情
- 成功后显示 Polygon Amoy 浏览器链接
```

### 🔄 Swap 功能测试

#### 同链交换
```
前提: Sepolia 网络，拥有测试 ETH
测试消息: "swap 0.01 ETH to USDC"
预期:
- 调用 LI.FI API 获取报价
- 显示预估输出和价格影响
- 显示交换路径信息
```

### 🌉 Bridge 功能测试

#### 跨链测试
```
前提: Sepolia 网络，拥有测试 ETH
测试消息: "swap ETH to MATIC on polygon"  
预期:
- 识别为跨链操作 (lifi_bridge)
- 显示桥接费用和预估时间
- 显示警告信息（如果是测试网）
```

### ❌ 错误处理测试

#### 无路由测试
```
测试消息: "swap ETH to UNKNOWNTOKEN"
预期: 
- 返回 "NO_ROUTE" 错误类型
- 显示用户友好错误消息
- 提供建议解决方案
```

#### 余额不足测试
```
测试消息: "transfer 1000 ETH to 0x123..."
预期:
- 检测到余额不足
- 显示 "INSUFFICIENT_FUNDS" 错误
- 建议检查余额包括gas费用
```

## 调试信息

### 控制台日志
打开浏览器开发工具，查看以下日志：

```
[LI.FI MCP] Processing message: "..."
[LI.FI MCP] Parsed intent: {...}
[LI.FI MCP] Getting quote with params: {...}
[MCP Frontend] Processing EVM/LI.FI transaction: {...}
```

### 网络状态检查
```javascript
// 在浏览器控制台运行
console.log('Current network:', await window.ethereum.request({method: 'eth_chainId'}));
console.log('Connected account:', await window.ethereum.request({method: 'eth_accounts'}));
```

## 常见问题解决

### 1. 网络切换失败
**问题**: "Network not added to MetaMask"
**解决**: 手动添加测试网络配置

### 2. LI.FI API 限制
**问题**: 测试网路由少
**解决**: 
- 使用主流测试代币 (ETH, MATIC, USDC)
- 尝试小额测试
- 检查测试网络流动性

### 3. Gas 费用不足
**问题**: Transaction failed due to insufficient gas
**解决**:
- 确保有足够测试币支付 gas
- 对于 Polygon，需要 MATIC 作为 gas

## 生产环境迁移

测试通过后，切换到主网：
1. 更换 MetaMask 网络到主网
2. 使用真实代币进行操作
3. 注意滑点和价格影响设置
4. 确认交易详情后再签名

## 支持的测试操作

✅ Balance查询 (所有测试网)
✅ Transfer (Sepolia, Polygon Amoy) 
✅ Swap (依赖 LI.FI 测试网支持)
✅ Bridge (跨链，有限支持)
✅ 错误处理验证
✅ 网络自动切换

⚠️ **注意**: 测试网的流动性和路由选项有限，某些操作可能不可用。
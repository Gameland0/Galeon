# GameLand AI DApp — 产品升级迭代路线图

> 版本：v1.0 | 日期：2026-03-09
> 定位：AI Trading Agent Platform（有AI大脑的交易Agent平台）

---

## 一、产品现状分析

### 1.1 现有模块全景

```
┌─────────────────────────────────────────────────┐
│              GameLand AI DApp 现有模块            │
├──────────────┬──────────────┬───────────────────┤
│  Agent 市场   │  游戏生成     │  Alpha 交易        │
│  • 创建/买卖  │  • AI生成游戏  │  • 信号生成(7维)   │
│  • 多Agent协作 │  • 排行榜     │  • Auto Trade     │
│  • MCP能力    │  • 创作者经济  │  • 风控/仓位管理   │
├──────────────┴──────────────┴───────────────────┤
│  基础设施                                        │
│  • Privy钱包 | 多链(BSC/Base/Solana/Polygon)      │
│  • Credit积分系统 | 创作者提现                     │
│  • Telegram信号监听 | Twitter KOL监听             │
└─────────────────────────────────────────────────┘
```

### 1.2 现有交易能力详解

#### Alpha Signal（信号生成引擎）

| 维度 | 当前能力 | 状态 |
|------|---------|------|
| 信号生成 | 7维加权评分（OI/资金费率30%、趋势25%、K线形态20%、成交量15%、关键价位10%、RSI 5%、MACD 3%） | ✅ 已完成 |
| 数据源 | Binance Futures/Spot/Alpha API + DexScreener + Smart Money链上追踪 | ✅ 已完成 |
| 自学习 | 梯度下降调整7维权重，学习率10%/轮，需50+审计信号 | ✅ 已完成（范围窄） |
| 版本管理 | v1.0→v1.1→v1.2...权重演化，支持回滚 | ✅ 已完成 |
| 信号输出 | 信号类型、置信度(≥70%)、入场区间、止盈止损位 | ✅ 已完成 |
| 监控频率 | 每小时自动扫描，20个Alpha Token | ✅ 已完成 |

#### Auto Trade Agent（半自动执行系统）

| 维度 | 当前能力 | 状态 |
|------|---------|------|
| 执行方式 | 收到信号→风控校验→DEX即时市价单 | ✅ 已完成 |
| 风控 | 最多3个并发仓位、每日亏损上限、代币白名单、余额校验 | ✅ 已完成 |
| 链支持 | BSC + Base（MEV保护RPC） | ✅ 已完成 |
| 退出监控 | 24/7监控止盈/止损触发自动平仓 | ✅ 已完成 |
| 信号源 | Twitter KOL + Telegram群 + Alpha信号 | ✅ 已完成 |
| 仓位管理 | 固定金额，无动态调仓 | ⚠️ 需升级 |

### 1.3 核心缺失能力

```
❌ 执行策略不会学习 —— 止盈/止损逻辑永远是预设值
❌ 风控阈值不自适应 —— 不会根据市场波动自动调整
❌ 仓位管理不智能 —— 不会根据胜率/回撤动态调整仓位大小
❌ 不会发现新策略 —— 只优化现有7维权重，不会创造新的分析维度
❌ 不会跨周期学习 —— 无法识别"牛市vs熊市"需要不同策略
❌ 没有反思机制 —— 亏损交易没有根因分析和策略修正闭环
❌ 没有Copy Trade —— 市场刚需功能缺失
❌ 没有Meme专项分析 —— DEX+Meme定位但无风险评估
❌ 没有Telegram Bot —— 缺少主流交易用户入口
```

---

## 二、竞品分析

### 2.1 Telegram交易Bot赛道（红海）

| 竞品 | 定位 | 规模 | 核心优势 |
|------|------|------|---------|
| TrojanBot | Telegram交易Bot | $24B+交易量, 200万用户 | 执行速度、用户基数 |
| BONKbot | Solana TG Bot | $13B+交易量 | BONK生态绑定 |
| BullX | 多链DEX+TG Bot | 6链支持 | 多链覆盖、MEV保护 |
| GMGN | Solana Copy Trading | 跟单+狙击 | Copy Trade体验 |
| Banana Gun | 快速狙击Bot | $3.3B交易量 | 极速Snipe |
| Shuriken | 多链TG Bot | Copy Trading | 跟单+多链 |

### 2.2 AI Agent交易赛道（蓝海）

| 竞品 | 定位 | 核心特点 |
|------|------|---------|
| Hey Anon | DeFi自然语言Agent | 自然语言执行DeFi操作 |
| Pippin | Solana AI Agent | 200+技能模块，社区驱动 |
| Zerebro | 自主AI Agent | 自然语言创建Agent |
| ChainGPT | 区块链AI工具 | 合约审计、NFT生成 |

### 2.3 竞争策略结论

**不做"又一个Telegram交易Bot"（红海无胜算），做"有AI大脑的交易Agent平台"（蓝海差异化）。**

我们的差异化优势：
1. AI Agent市场 + 交易的组合（竞品是纯Bot）
2. 7维信号生成 + 自学习权重（竞品是纯执行）
3. 多信号源融合（Twitter KOL + Telegram群 + 链上Alpha）
4. 游戏模块作为用户增长入口
5. 创作者经济（Agent/游戏可买卖，有商业闭环）

---

## 三、升级迭代路线图

### 总览

```
Phase 1（1-2个月）          Phase 2（1个月）          Phase 3（2-3个月）
深化交易智能               Telegram Bot集成         Agent生态智能化
┌──────────────┐     ┌──────────────┐      ┌──────────────┐
│ 交易复盘引擎   │     │ TG Bot MVP   │      │ 交易Agent市场 │
│ Meme风险评分   │     │ 信号推送      │      │ Multi-Agent  │
│ Copy Trade    │ ──→ │ 快速交易      │ ──→  │ 社区智能      │
│ 策略自适应     │     │ AI问答       │      │ 数据飞轮      │
│ 市场状态机     │     │ 跟单入口      │      │              │
└──────────────┘     └──────────────┘      └──────────────┘
```

---

### Phase 1：深化交易智能（1-2个月）

#### 1A. 交易复盘引擎（P0 - 最高优先级）

**目标：** 建立"交易→结果→分析→改进"的闭环学习机制

**架构设计：**
```
交易执行 → 结果记录(auto_trade_executions)
                ↓
        定时任务（每日凌晨）
                ↓
        Claude API 分析亏损交易
                ↓
        生成复盘报告 + 调整建议
                ↓
        [人工确认] → 写入 alpha_model_config
                ↓
        信号生成参数更新
```

**需要新增的数据库表：**

```sql
-- 交易复盘报告表
CREATE TABLE trade_review_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    review_date DATE NOT NULL,
    period_start DATETIME NOT NULL,          -- 分析区间开始
    period_end DATETIME NOT NULL,            -- 分析区间结束
    total_trades INT DEFAULT 0,              -- 总交易数
    win_trades INT DEFAULT 0,                -- 盈利交易数
    loss_trades INT DEFAULT 0,              -- 亏损交易数
    win_rate DECIMAL(5,2) DEFAULT 0,         -- 胜率
    total_pnl DECIMAL(15,2) DEFAULT 0,       -- 总盈亏
    avg_profit DECIMAL(15,2) DEFAULT 0,      -- 平均盈利
    avg_loss DECIMAL(15,2) DEFAULT 0,        -- 平均亏损
    profit_factor DECIMAL(8,4) DEFAULT 0,    -- 盈亏比
    max_drawdown DECIMAL(15,2) DEFAULT 0,    -- 最大回撤
    loss_patterns JSON,                      -- AI识别的亏损模式
    -- 例: ["追高入场", "逆势交易", "止损过窄", "持仓过久"]
    adjustment_suggestions JSON,             -- AI建议的参数调整
    -- 例: {"stop_loss_ratio": "扩大到3%", "hold_time": "缩短到4h"}
    ai_reasoning TEXT,                       -- Claude API完整分析内容
    applied TINYINT(1) DEFAULT 0,            -- 是否已应用建议
    applied_at DATETIME,
    applied_by VARCHAR(100),                 -- 审核人
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_review_date (review_date),
    INDEX idx_applied (applied)
);

-- 策略参数历史表（记录每次参数变更）
CREATE TABLE strategy_param_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    param_name VARCHAR(100) NOT NULL,        -- 参数名称
    old_value VARCHAR(255),                  -- 变更前值
    new_value VARCHAR(255),                  -- 变更后值
    change_reason TEXT,                      -- 变更原因
    source ENUM('manual', 'auto_review', 'market_state') DEFAULT 'manual',
    review_report_id INT,                    -- 关联的复盘报告ID
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_param (param_name),
    INDEX idx_source (source)
);
```

**后端服务：** `services/TradeReviewEngine.js`

```javascript
// 核心逻辑伪代码
class TradeReviewEngine {
    // 每日定时触发
    async runDailyReview() {
        // 1. 获取过去24h所有已关闭的交易
        const trades = await this.getClosedTrades(last24h);

        // 2. 计算统计指标
        const stats = this.calculateStats(trades);

        // 3. 识别亏损交易的共性特征
        const lossPatterns = this.analyzeLossPatterns(trades.filter(t => t.pnl < 0));

        // 4. 调用Claude API生成分析报告
        const analysis = await this.callClaudeForReview({
            trades,
            stats,
            lossPatterns,
            currentParams: await this.getCurrentParams(),
            marketContext: await this.getMarketContext()
        });

        // 5. 存储报告，等待人工确认后应用
        await this.saveReport(stats, analysis);
    }

    // Claude API Prompt 模板
    buildReviewPrompt(data) {
        return `你是一个专业的量化交易分析师。分析以下交易数据并给出改进建议：

## 交易统计
- 总交易: ${data.stats.total}, 胜率: ${data.stats.winRate}%
- 平均盈利: $${data.stats.avgProfit}, 平均亏损: $${data.stats.avgLoss}
- 盈亏比: ${data.stats.profitFactor}

## 亏损交易详情
${data.lossPatterns.map(t => `- ${t.token} | 入场价$${t.entry} | 出场价$${t.exit} | 亏损${t.pnlPct}% | 持仓${t.holdTime}h`).join('\n')}

## 当前策略参数
- 止损比例: ${data.currentParams.stopLoss}%
- 止盈比例: ${data.currentParams.takeProfit}%
- 最大持仓时间: ${data.currentParams.maxHoldTime}h

请分析：
1. 亏损交易的共性模式（追高/逆势/止损过窄/持仓过久等）
2. 具体的参数调整建议（给出精确数值）
3. 需要关注的市场状态变化

输出JSON格式：
{
  "loss_patterns": ["模式1", "模式2"],
  "adjustments": { "param_name": { "current": "x", "suggested": "y", "reason": "..." } },
  "market_observation": "...",
  "risk_warning": "..."
}`;
    }
}
```

**前端页面：** 在AutoTradePage中新增"复盘报告"Tab

- 展示每日复盘报告列表
- 查看AI分析详情
- 一键应用/拒绝建议参数调整
- 参数变更历史时间线

**定时任务：** `node-cron` 每日凌晨2:00执行

---

#### 1B. Meme Token 风险评分系统（P0）

**目标：** 为DEX上的Meme Token提供实时风险评估，防止用户买到Rug Pull

**评分维度（总分100分）：**

```
┌───────────────────────────────────────────────────┐
│  Meme Token Safety Score 评分体系                  │
├────────────────────┬───────────┬──────────────────┤
│ 维度               │ 权重      │ 检测内容          │
├────────────────────┼───────────┼──────────────────┤
│ 合约安全           │ 30%       │ 是否开源验证       │
│                    │           │ 是否有Mint权限     │
│                    │           │ 是否可暂停交易     │
│                    │           │ 是否有隐藏Owner    │
│                    │           │ 买卖税率是否合理    │
├────────────────────┼───────────┼──────────────────┤
│ 流动性安全         │ 25%       │ LP是否锁定/销毁    │
│                    │           │ LP金额是否充足     │
│                    │           │ LP占比是否健康     │
├────────────────────┼───────────┼──────────────────┤
│ 持仓分布           │ 20%       │ Top10持仓集中度    │
│                    │           │ 创建者持仓比例     │
│                    │           │ 持币地址数量       │
├────────────────────┼───────────┼──────────────────┤
│ 交易模式           │ 15%       │ 买卖比例是否平衡   │
│                    │           │ 是否有刷量嫌疑     │
│                    │           │ 大额卖单预警       │
├────────────────────┼───────────┼──────────────────┤
│ 社交热度           │ 10%       │ Twitter提及量      │
│                    │           │ Telegram群活跃度   │
│                    │           │ 是否有KOL喊单     │
└────────────────────┴───────────┴──────────────────┘

评分等级：
  90-100: 🟢 安全 (Safe)
  70-89:  🟡 注意 (Caution)
  40-69:  🟠 高风险 (High Risk)
  0-39:   🔴 危险 (Danger - 疑似Rug Pull)
```

**数据库表：**

```sql
CREATE TABLE meme_token_safety (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chain ENUM('bsc', 'base', 'solana') NOT NULL,
    token_address VARCHAR(100) NOT NULL,
    token_symbol VARCHAR(50),
    token_name VARCHAR(200),

    -- 评分
    safety_score INT DEFAULT 0,              -- 总分 0-100
    risk_level ENUM('SAFE', 'CAUTION', 'HIGH_RISK', 'DANGER') DEFAULT 'HIGH_RISK',

    -- 合约安全 (30%)
    contract_verified TINYINT(1) DEFAULT 0,
    has_mint_function TINYINT(1) DEFAULT 0,
    has_pause_function TINYINT(1) DEFAULT 0,
    has_hidden_owner TINYINT(1) DEFAULT 0,
    buy_tax DECIMAL(5,2) DEFAULT 0,
    sell_tax DECIMAL(5,2) DEFAULT 0,
    contract_score INT DEFAULT 0,

    -- 流动性安全 (25%)
    lp_locked TINYINT(1) DEFAULT 0,
    lp_burned TINYINT(1) DEFAULT 0,
    lp_amount_usd DECIMAL(15,2) DEFAULT 0,
    lp_ratio DECIMAL(5,2) DEFAULT 0,         -- LP占总供应比例
    liquidity_score INT DEFAULT 0,

    -- 持仓分布 (20%)
    top10_holding_pct DECIMAL(5,2) DEFAULT 0,
    creator_holding_pct DECIMAL(5,2) DEFAULT 0,
    holder_count INT DEFAULT 0,
    distribution_score INT DEFAULT 0,

    -- 交易模式 (15%)
    buy_sell_ratio DECIMAL(5,2) DEFAULT 0,
    wash_trading_detected TINYINT(1) DEFAULT 0,
    large_sell_warning TINYINT(1) DEFAULT 0,
    trading_score INT DEFAULT 0,

    -- 社交热度 (10%)
    twitter_mentions_24h INT DEFAULT 0,
    telegram_activity VARCHAR(20) DEFAULT 'low',
    kol_mentioned TINYINT(1) DEFAULT 0,
    social_score INT DEFAULT 0,

    -- 元数据
    scan_source VARCHAR(100),                -- 数据来源 API
    raw_data JSON,                           -- 原始检测数据
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX idx_chain_token (chain, token_address),
    INDEX idx_safety_score (safety_score),
    INDEX idx_risk_level (risk_level)
);
```

**数据源集成：**
- GoPlus Security API（合约安全检测）
- DexScreener API（流动性、交易量）
- Birdeye API / DEXTools API（持仓分布）
- Twitter API / Telegram监听（社交热度）

**后端服务：** `services/MemeTokenSafetyService.js`

**核心流程：**
1. 新Token上线检测（监听DEX Factory合约事件）
2. 自动触发全维度安全扫描
3. 生成Safety Score
4. 高分Token自动加入信号候选池
5. 低分Token自动加入黑名单

---

#### 1C. Copy Trade 跟单系统（P1）

**目标：** 用户可选择跟随Smart Money钱包自动交易

**架构设计：**

```
┌──────────────────────────────────────────────────┐
│                Copy Trade 系统架构                 │
│                                                    │
│  Smart Money 发现层                                │
│  ┌────────────────────────────────────────────┐   │
│  │ 链上监听 → 识别高胜率钱包 → 建立Trader档案   │   │
│  │ • 胜率 > 60%                               │   │
│  │ • 总交易数 > 50                             │   │
│  │ • 平均收益 > 5%                             │   │
│  │ • 活跃度（近7天有交易）                      │   │
│  └────────────────────────────────────────────┘   │
│                    ↓                               │
│  跟单配置层                                        │
│  ┌────────────────────────────────────────────┐   │
│  │ 用户选择Trader → 设置跟单参数                 │   │
│  │ • 跟单金额（固定/按比例）                     │   │
│  │ • 最大单笔金额                               │   │
│  │ • Token白名单/黑名单                         │   │
│  │ • 自动止损比例                               │   │
│  └────────────────────────────────────────────┘   │
│                    ↓                               │
│  执行层                                            │
│  ┌────────────────────────────────────────────┐   │
│  │ 监听Trader链上交易 → 风控校验 → 跟单执行      │   │
│  │ • 延迟 < 3秒（同Block或下一Block）            │   │
│  │ • 滑点保护                                   │   │
│  │ • MEV防护                                    │   │
│  └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**数据库表：**

```sql
-- Smart Money Trader 档案
CREATE TABLE smart_money_traders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chain ENUM('bsc', 'base', 'solana') NOT NULL,
    wallet_address VARCHAR(100) NOT NULL,
    nickname VARCHAR(100),                   -- 展示昵称
    trader_type ENUM('KOL', 'PROFESSIONAL', 'SMART_MONEY', 'WHALE') DEFAULT 'SMART_MONEY',
    total_trades INT DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0,
    avg_return DECIMAL(8,2) DEFAULT 0,       -- 平均收益率%
    total_pnl DECIMAL(15,2) DEFAULT 0,       -- 总盈亏USD
    max_drawdown DECIMAL(8,2) DEFAULT 0,     -- 最大回撤%
    sharpe_ratio DECIMAL(8,4) DEFAULT 0,
    active_since DATETIME,
    last_trade_at DATETIME,
    follower_count INT DEFAULT 0,            -- 跟单人数
    is_featured TINYINT(1) DEFAULT 0,        -- 是否推荐
    status ENUM('ACTIVE', 'INACTIVE', 'BLACKLISTED') DEFAULT 'ACTIVE',
    stats_updated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_chain_wallet (chain, wallet_address),
    INDEX idx_win_rate (win_rate DESC),
    INDEX idx_follower (follower_count DESC)
);

-- 用户跟单配置
CREATE TABLE copy_trade_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    trader_id INT NOT NULL,                  -- smart_money_traders.id
    chain ENUM('bsc', 'base', 'solana') NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    copy_mode ENUM('FIXED', 'PROPORTIONAL') DEFAULT 'FIXED',
    fixed_amount DECIMAL(15,2),              -- 固定跟单金额
    proportion_ratio DECIMAL(5,2),           -- 按比例跟单
    max_per_trade DECIMAL(15,2),             -- 单笔上限
    stop_loss_pct DECIMAL(5,2) DEFAULT 10,   -- 跟单止损%
    token_whitelist JSON,                    -- 只跟这些Token
    token_blacklist JSON,                    -- 排除这些Token
    max_daily_trades INT DEFAULT 10,         -- 每日最大跟单次数
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_trader (trader_id),
    FOREIGN KEY (trader_id) REFERENCES smart_money_traders(id)
);

-- 跟单交易记录
CREATE TABLE copy_trade_executions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    trader_id INT NOT NULL,
    config_id INT NOT NULL,
    chain ENUM('bsc', 'base', 'solana') NOT NULL,
    token_address VARCHAR(100) NOT NULL,
    token_symbol VARCHAR(50),
    -- 原始交易（Trader的）
    original_tx_hash VARCHAR(100),
    original_amount DECIMAL(20,8),
    original_price DECIMAL(20,8),
    -- 跟单交易（用户的）
    copy_tx_hash VARCHAR(100),
    copy_amount DECIMAL(20,8),
    copy_price DECIMAL(20,8),
    copy_delay_ms INT DEFAULT 0,             -- 跟单延迟毫秒
    -- 退出信息
    exit_tx_hash VARCHAR(100),
    exit_price DECIMAL(20,8),
    exit_amount DECIMAL(20,8),
    exit_type ENUM('TAKE_PROFIT', 'STOP_LOSS', 'MANUAL', 'TRADER_EXIT'),
    -- 盈亏
    profit_loss_usdt DECIMAL(15,2) DEFAULT 0,
    profit_loss_pct DECIMAL(8,2) DEFAULT 0,
    status ENUM('PENDING', 'COPIED', 'FAILED', 'EXITED') DEFAULT 'PENDING',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    exited_at DATETIME,
    INDEX idx_user (user_id),
    INDEX idx_trader (trader_id),
    INDEX idx_status (status)
);
```

**后端服务：**
- `services/SmartMoneyTracker.js` — 链上监听Smart Money交易
- `services/CopyTradeService.js` — 跟单逻辑+执行
- `services/TraderProfileService.js` — Trader档案更新

---

#### 1D. 策略参数自适应（P2）

**目标：** 止盈/止损/仓位大小根据历史表现自动调整

**实现方案：**

```javascript
// 自适应参数计算逻辑
class AdaptiveParamsEngine {

    // 1. 动态止损比例
    calculateAdaptiveStopLoss(recentTrades, marketVolatility) {
        // 基于ATR（平均真实波幅）的动态止损
        // 高波动市场 → 放宽止损
        // 低波动市场 → 收紧止损
        const atr = this.calculateATR(14); // 14周期ATR
        const baseStopLoss = 0.03; // 3%基础止损
        const adaptiveStopLoss = baseStopLoss * (atr / avgATR);
        return Math.max(0.02, Math.min(0.08, adaptiveStopLoss));
    }

    // 2. 动态仓位大小（简化Kelly公式）
    calculatePositionSize(winRate, avgWin, avgLoss, totalBalance) {
        // Kelly = W - (1-W)/R, 其中 R = avgWin/avgLoss
        const R = Math.abs(avgWin / avgLoss);
        const kelly = winRate - (1 - winRate) / R;
        // 使用半Kelly（更保守）
        const halfKelly = Math.max(0.01, Math.min(0.25, kelly / 2));
        return totalBalance * halfKelly;
    }

    // 3. 动态止盈比例
    calculateAdaptiveTakeProfit(recentTrades, trend) {
        // 趋势市场 → 放大止盈目标
        // 震荡市场 → 缩小止盈目标
        const avgWinPct = this.calculateAvgWinPercent(recentTrades);
        const trendMultiplier = trend === 'STRONG_UP' ? 1.5 : trend === 'RANGE' ? 0.7 : 1.0;
        return avgWinPct * trendMultiplier;
    }
}
```

**关键参数与调整规则：**

| 参数 | 调整依据 | 调整频率 | 约束范围 |
|------|---------|---------|---------|
| 止损比例 | ATR + 近期亏损分析 | 每日 | 2% - 8% |
| 止盈比例 | 趋势强度 + 历史盈利分布 | 每日 | 3% - 20% |
| 仓位大小 | Kelly公式(半Kelly) | 每周 | 总资金1%-25% |
| 最大持仓数 | 市场波动率 + 相关性 | 每周 | 1-5 |
| 最大持仓时间 | 历史最优持仓时长统计 | 每周 | 1h - 72h |

---

#### 1E. 市场状态机（P2）

**目标：** 自动识别市场状态，不同状态使用不同策略配置

```
┌─────────────────────────────────────────────────┐
│              市场状态机 (Market Regime)            │
│                                                   │
│  ┌──────────┐   波动率上升    ┌──────────────┐   │
│  │ 低波动    │ ──────────→   │ 正常波动      │   │
│  │ (观望)    │ ←──────────   │ (正常交易)    │   │
│  └──────────┘   波动率下降    └──────┬───────┘   │
│                                      │ 波动率     │
│                                      │ 持续上升   │
│                                      ↓            │
│  ┌──────────┐   极端事件     ┌──────────────┐   │
│  │ 极端波动  │ ←──────────   │ 高波动       │   │
│  │ (停止交易) │ ──────────→  │ (减仓+宽止损) │   │
│  └──────────┘   恢复正常     └──────────────┘   │
│                                                   │
│  状态判定依据：                                    │
│  • 低波动:   ATR < 历史25分位                      │
│  • 正常波动: ATR 在25-75分位之间                    │
│  • 高波动:   ATR > 历史75分位                      │
│  • 极端波动: ATR > 历史95分位 或 单日跌幅>15%       │
└─────────────────────────────────────────────────┘
```

**不同状态的策略配置：**

| 参数 | 低波动 | 正常 | 高波动 | 极端 |
|------|--------|------|--------|------|
| 交易频率 | 减少50% | 正常 | 减少30% | 暂停 |
| 仓位大小 | 50% | 100% | 60% | 0% |
| 止损幅度 | 2% | 3% | 5% | - |
| 止盈幅度 | 4% | 6% | 10% | - |
| 最大持仓数 | 1 | 3 | 2 | 0 |
| 信号置信度阈值 | 80% | 70% | 85% | - |

**数据库表：**

```sql
CREATE TABLE market_regime_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chain ENUM('bsc', 'base', 'solana') NOT NULL,
    regime ENUM('LOW_VOL', 'NORMAL', 'HIGH_VOL', 'EXTREME') NOT NULL,
    atr_14 DECIMAL(10,4),                    -- 14周期ATR
    atr_percentile DECIMAL(5,2),             -- ATR百分位
    btc_change_24h DECIMAL(8,2),             -- BTC 24h变化%
    fear_greed_index INT,                    -- 恐惧贪婪指数
    regime_params JSON,                      -- 该状态下的策略参数
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    duration_hours INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_chain_regime (chain, regime),
    INDEX idx_started (started_at)
);
```

---

### Phase 2：Telegram Bot 集成（1个月）

#### 2A. Bot 定位与差异化

**核心定位：** 不是纯交易Bot，而是 **AI Trading Advisor + 执行**

```
❌ 竞品（TrojanBot）: 用户说"买什么" → 直接执行
✅ 我们的Bot:         用户说"买什么" → AI分析 → 给建议 → 确认 → 执行
```

**与Web版的关系：**
- Web版 = 深度分析、配置管理、数据看板（桌面端体验）
- TG Bot = 快速决策、实时提醒、简单执行（移动端体验）
- 两端共享同一套后端服务和数据库

#### 2B. Bot 命令体系

```
┌──────────────────────────────────────────────────┐
│  Telegram Bot 命令体系                            │
├──────────────────────────────────────────────────┤
│                                                    │
│  📊 信号与分析                                     │
│  /signal              查看当前活跃的Alpha信号       │
│  /signal <token>      查看某Token最新信号详情       │
│  /market              当前市场状态概览              │
│  /hot                 热门Meme Token排行           │
│                                                    │
│  🔒 安全检测                                      │
│  /check <address>     Meme Token安全评分           │
│  /rug <address>       Rug Pull风险快速检测         │
│                                                    │
│  💰 交易执行                                      │
│  /buy <token> <amt>   买入Token                   │
│  /sell <token> <amt>  卖出Token                   │
│  /positions           查看当前持仓                 │
│  /pnl                 今日盈亏统计                 │
│  /close <position>    平仓                        │
│                                                    │
│  👥 跟单                                          │
│  /top traders         Top Trader排行榜             │
│  /copy <address>      跟单某Trader                │
│  /unfollow <address>  取消跟单                    │
│  /copies              查看跟单持仓                 │
│                                                    │
│  🤖 AI助手                                       │
│  /ask <问题>          AI回答任何交易问题            │
│  /review              AI复盘今日交易表现           │
│  /suggest             AI给出当前最佳交易建议        │
│                                                    │
│  ⚙️ 设置                                         │
│  /config              查看/修改交易配置             │
│  /alerts on/off       开启/关闭信号推送             │
│  /wallet              钱包余额和地址               │
│  /help                帮助信息                    │
│                                                    │
└──────────────────────────────────────────────────┘
```

#### 2C. 主动推送机制

```
自动推送场景（用户无需操作）：

1. 新Alpha信号推送（置信度≥80%时自动推送）
   📊 Alpha Signal Alert
   Token: $PEPE | Type: LONG | Confidence: 85%
   Entry: $0.00123 - $0.00125
   TP1: $0.00135 (+8.8%)
   SL: $0.00118 (-4.1%)
   [一键买入] [查看详情] [忽略]

2. 持仓预警推送
   ⚠️ Position Alert
   Your $SOL position is approaching Stop Loss
   Entry: $185.5 | Current: $178.2 (-3.9%)
   SL: $176.3 (-5.0%)
   [平仓] [调整止损] [持有]

3. 跟单交易通知
   👥 Copy Trade Executed
   Trader "WhaleAlpha" bought $ARB
   Your copy: $50 @ $1.23
   [查看详情]

4. Meme Token预警
   🔴 Rug Pull Warning
   Token $SCAM (0x123...abc)
   Safety Score: 15/100 - DANGER
   Reason: LP removed, creator dumping
   [查看详情]

5. 每日复盘摘要（每日20:00推送）
   📈 Daily Review
   Trades: 5 | Win: 3 | Loss: 2
   P&L: +$23.50 (+2.3%)
   Best: $PEPE +8.2% | Worst: $DOGE -3.1%
   AI Insight: "今日趋势交易表现好，震荡币种亏损..."
   [查看完整复盘]
```

#### 2D. 技术实现方案

**技术栈：**
- `node-telegram-bot-api` 或 `grammy`（推荐grammy，更现代）
- 复用现有后端服务（AutoTradeService, AlphaSignalService等）
- 新增 `services/TelegramBotService.js` 作为Bot入口

**架构：**
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Telegram API │ ←→  │ TG Bot       │ ──→ │ 现有后端服务  │
│ (Webhook)    │     │ Service      │     │ AutoTrade    │
│              │     │ • 命令路由    │     │ AlphaSignal  │
│              │     │ • 权限校验    │     │ RiskControl  │
│              │     │ • 消息格式化  │     │ DEXAggregator│
└──────────────┘     └──────────────┘     └──────────────┘
                           ↓
                     ┌──────────────┐
                     │ 用户认证      │
                     │ TG User ID   │
                     │ ↔ Wallet绑定 │
                     └──────────────┘
```

**数据库新增表：**

```sql
-- Telegram Bot用户绑定
CREATE TABLE telegram_bot_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    telegram_username VARCHAR(100),
    wallet_address VARCHAR(100),             -- 绑定的钱包地址
    user_id VARCHAR(100),                    -- 关联系统用户ID
    chain_preference ENUM('bsc', 'base', 'solana') DEFAULT 'bsc',
    alert_enabled TINYINT(1) DEFAULT 1,      -- 是否接收推送
    alert_min_confidence INT DEFAULT 80,     -- 最低推送置信度
    language ENUM('en', 'zh') DEFAULT 'en',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME,
    INDEX idx_wallet (wallet_address),
    INDEX idx_user_id (user_id)
);

-- Bot推送记录
CREATE TABLE telegram_bot_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    notification_type ENUM('SIGNAL', 'POSITION_ALERT', 'COPY_TRADE', 'RUG_WARNING', 'DAILY_REVIEW') NOT NULL,
    content TEXT,
    reference_id VARCHAR(100),               -- 关联的信号/仓位ID
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_action VARCHAR(50),                 -- 用户点击了什么按钮
    INDEX idx_user (telegram_user_id),
    INDEX idx_type (notification_type)
);
```

**现有基础设施复用：**
- 已有 `TelegramAuthService` → 改造为Bot认证
- 已有 `TelegramMonitorService` → 复用信号监听逻辑
- 已有 `TelegramGroupManager` → 群组管理基础

---

### Phase 3：Agent生态智能化（2-3个月）

#### 3A. 交易Agent市场

**目标：** 让用户创建、发布、买卖自己的交易策略Agent

```
┌──────────────────────────────────────────────────┐
│  交易Agent市场                                    │
│                                                    │
│  创作者（策略开发者）                               │
│  ┌────────────────────────────────────────────┐   │
│  │ 1. 定义策略参数（入场规则、退出规则、风控）    │   │
│  │ 2. 选择数据源（链上/KOL/技术指标）            │   │
│  │ 3. 回测验证 → 发布到市场                      │   │
│  │ 4. 赚取跟随者收益分成                         │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  使用者（交易用户）                                │
│  ┌────────────────────────────────────────────┐   │
│  │ 1. 浏览Agent市场（按胜率/收益率/跟随数排序）   │   │
│  │ 2. 查看Agent的公开业绩（链上可验证）           │   │
│  │ 3. 订阅Agent（付费/免费）                     │   │
│  │ 4. Agent自动为用户执行交易                     │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  展示信息：                                        │
│  ┌────────────────────────────────────────────┐   │
│  │ 🤖 MemeSniper Pro                          │   │
│  │ 创作者: 0x1234...  | 跟随者: 328            │   │
│  │ 策略: Meme新币狙击 + Smart Money跟踪         │   │
│  │ 30天收益: +45.2% | 胜率: 62%                │   │
│  │ 最大回撤: -12.3% | Sharpe: 1.8              │   │
│  │ 订阅费: 50 Credits/月 | 收益分成: 10%        │   │
│  │ [查看详情] [订阅] [回测数据]                   │   │
│  └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**与现有Agent市场的关系：**
- 现有Agent市场 → 通用AI Agent（对话、游戏、工具）
- 新增交易Agent分类 → 专门的交易策略Agent
- 复用现有的Agent CRUD、定价、评分、创作者经济体系

**数据库表：**

```sql
-- 交易策略Agent（扩展现有agents表）
CREATE TABLE trading_agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agent_id INT NOT NULL,                   -- 关联agents表
    creator_wallet VARCHAR(100) NOT NULL,

    -- 策略定义
    strategy_type ENUM('SIGNAL_FOLLOW', 'COPY_TRADE', 'MEME_SNIPER', 'TREND_FOLLOW', 'MEAN_REVERSION', 'CUSTOM') NOT NULL,
    strategy_config JSON,                    -- 策略参数配置
    supported_chains JSON,                   -- 支持的链
    supported_tokens JSON,                   -- 支持的Token列表
    data_sources JSON,                       -- 数据源配置

    -- 公开业绩（链上可验证）
    total_trades INT DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0,
    total_return DECIMAL(10,2) DEFAULT 0,    -- 总收益率%
    monthly_return DECIMAL(8,2) DEFAULT 0,   -- 月均收益率%
    max_drawdown DECIMAL(8,2) DEFAULT 0,     -- 最大回撤%
    sharpe_ratio DECIMAL(8,4) DEFAULT 0,
    profit_factor DECIMAL(8,4) DEFAULT 0,

    -- 订阅模式
    subscription_type ENUM('FREE', 'MONTHLY', 'REVENUE_SHARE') DEFAULT 'FREE',
    monthly_price INT DEFAULT 0,             -- Credits/月
    revenue_share_pct DECIMAL(5,2) DEFAULT 0, -- 收益分成比例

    -- 状态
    follower_count INT DEFAULT 0,
    status ENUM('DRAFT', 'BACKTESTING', 'LIVE', 'PAUSED', 'ARCHIVED') DEFAULT 'DRAFT',
    live_since DATETIME,
    last_trade_at DATETIME,
    performance_updated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_strategy_type (strategy_type),
    INDEX idx_win_rate (win_rate DESC),
    INDEX idx_follower (follower_count DESC),
    INDEX idx_status (status),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

#### 3B. Multi-Agent 协作交易

**目标：** 多个专业Agent协作完成交易决策

```
┌─────────────────────────────────────────────────┐
│  Multi-Agent 交易协作流程                         │
│                                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ 信号     │  │ 风控     │  │ 执行     │         │
│  │ Agent    │  │ Agent    │  │ Agent    │         │
│  │          │  │          │  │          │         │
│  │ • 市场   │  │ • 仓位   │  │ • DEX   │         │
│  │   分析   │→│   评估   │→│   路由   │         │
│  │ • 信号   │  │ • 风险   │  │ • 滑点   │         │
│  │   生成   │  │   评分   │  │   保护   │         │
│  │ • 入场   │  │ • 仓位   │  │ • MEV   │         │
│  │   时机   │  │   大小   │  │   防护   │         │
│  └─────────┘  └─────────┘  └─────────┘         │
│       ↑                          ↓               │
│  ┌─────────┐              ┌─────────┐           │
│  │ 复盘     │←────────────│ 监控     │           │
│  │ Agent    │              │ Agent    │           │
│  │          │              │          │           │
│  │ • 交易   │              │ • 持仓   │           │
│  │   分析   │              │   追踪   │           │
│  │ • 策略   │              │ • 止盈   │           │
│  │   优化   │              │   止损   │           │
│  │ • 参数   │              │ • 市场   │           │
│  │   调整   │              │   异常   │           │
│  └─────────┘              └─────────┘           │
│                                                   │
│  每个Agent可独立升级/替换/购买                      │
│  用户可自由组合Agent团队                           │
└─────────────────────────────────────────────────┘
```

#### 3C. 社区智能（数据飞轮）

**目标：** 聚合社区交易数据，形成集体智慧

```
社区数据飞轮：

  更多用户 → 更多交易数据 → 更好的AI模型
      ↑                         ↓
      └── 更高收益 ← 更好的信号 ←┘

具体功能：
1. 社区情绪指标
   - 聚合所有用户对某Token的看多/看空比例
   - 社区持仓集中度
   - 热门Token排行榜（按交易量/关注度）

2. 集体智慧信号
   - 当>60%的交易Agent同时看多某Token → 生成社区信号
   - 社区胜率 vs 个人胜率对比
   - 顶尖Trader的策略特征提取

3. 匿名数据贡献
   - 用户交易数据匿名聚合（仅统计特征，不暴露具体持仓）
   - 贡献数据的用户获得Credit奖励
   - 数据越多，AI模型越准，所有人受益
```

---

## 四、Telegram Bot vs Web 双端策略

### 4.1 定位分工

| 维度 | Web 版 | Telegram Bot |
|------|--------|-------------|
| 用户场景 | 深度分析、策略配置 | 快速决策、实时操作 |
| 使用频率 | 每天1-2次 | 全天随时 |
| 核心功能 | 完整看板、回测、Agent市场 | 信号推送、快速交易、AI问答 |
| 用户画像 | 策略型交易者 | 移动端快速交易者 |
| 获客渠道 | SEO、社区推广 | TG群传播、KOL推荐 |
| 付费转化 | 高（深度用户） | 中（薄利多销） |

### 4.2 功能矩阵

| 功能 | Web | TG Bot | 说明 |
|------|-----|--------|------|
| Alpha信号查看 | ✅ 完整图表 | ✅ 精简卡片 | 双端同步 |
| 自动交易配置 | ✅ 完整配置面板 | ⚠️ 基础配置 | 复杂配置走Web |
| 买卖执行 | ✅ | ✅ | 双端都可执行 |
| 持仓管理 | ✅ 完整看板 | ✅ 精简列表 | 双端同步 |
| Copy Trade | ✅ 完整Trader档案 | ✅ 快速跟单 | 选Trader走Web |
| Meme风险评分 | ✅ 完整报告 | ✅ 快速评分 | 双端都需要 |
| AI复盘 | ✅ 完整报告 | ✅ 摘要推送 | 详情走Web |
| Agent市场 | ✅ 浏览/购买 | ⚠️ 推荐/查看 | 购买走Web |
| 游戏模块 | ✅ | ❌ | 仅Web端 |
| 设置管理 | ✅ 完整 | ⚠️ 基础 | 高级设置走Web |

---

## 五、优先级排序与开发计划

### 5.1 总体优先级

| 优先级 | 任务 | 预估工期 | 价值评估 | 所属Phase |
|--------|------|---------|---------|-----------|
| **P0** | 交易复盘引擎（Claude API） | 1周 | 核心 — 立即提升信号质量 | Phase 1 |
| **P0** | Meme Token风险评分 | 1周 | 核心 — DEX+Meme定位差异化 | Phase 1 |
| **P1** | Telegram Bot MVP | 2周 | 高 — 用户增长渠道 | Phase 2 |
| **P1** | Copy Trade跟单 | 2周 | 高 — 市场刚需 | Phase 1 |
| **P2** | 策略参数自适应 | 1周 | 中 — 提升收益率 | Phase 1 |
| **P2** | 市场状态机 | 1周 | 中 — 减少震荡期亏损 | Phase 1 |
| **P2** | TG Bot信号推送 | 1周 | 中 — 用户留存 | Phase 2 |
| **P3** | 交易Agent市场 | 3周 | 高 — 长期护城河 | Phase 3 |
| **P3** | Multi-Agent协作 | 2周 | 中 — 差异化 | Phase 3 |
| **P3** | 社区智能数据飞轮 | 3周 | 高 — 网络效应 | Phase 3 |

### 5.2 开发顺序建议

```
第1-2周:  交易复盘引擎 + Meme Token风险评分（并行开发）
第3-4周:  Copy Trade跟单系统
第5-6周:  Telegram Bot MVP（命令体系 + 信号推送）
第7周:    策略参数自适应 + 市场状态机
第8周:    TG Bot完善（跟单入口、AI问答）
第9-11周: 交易Agent市场
第12-13周: Multi-Agent协作
第14-16周: 社区智能数据飞轮
```

---

## 六、技术架构升级要点

### 6.1 新增后端服务

```
services/
├── TradeReviewEngine.js          # 交易复盘引擎（Phase 1A）
├── MemeTokenSafetyService.js     # Meme风险评分（Phase 1B）
├── SmartMoneyTracker.js          # Smart Money追踪（Phase 1C）
├── CopyTradeService.js           # 跟单执行（Phase 1C）
├── TraderProfileService.js       # Trader档案管理（Phase 1C）
├── AdaptiveParamsEngine.js       # 参数自适应（Phase 1D）
├── MarketRegimeDetector.js       # 市场状态机（Phase 1E）
├── TelegramBotService.js         # TG Bot主服务（Phase 2）
├── TelegramNotificationService.js # TG推送服务（Phase 2）
├── TradingAgentMarketService.js  # 交易Agent市场（Phase 3A）
├── MultiAgentOrchestrator.js     # 多Agent协作（Phase 3B）
└── CommunityIntelligenceService.js # 社区智能（Phase 3C）
```

### 6.2 新增API路由

```
routes/
├── tradeReviewRoutes.js          # 复盘报告相关
├── memeSafetyRoutes.js           # Meme安全评分
├── copyTradeRoutes.js            # 跟单交易
├── telegramBotRoutes.js          # TG Bot Webhook
├── tradingAgentRoutes.js         # 交易Agent市场
└── communityRoutes.js            # 社区数据
```

### 6.3 新增数据库表汇总

| 表名 | 用途 | Phase |
|------|------|-------|
| trade_review_reports | 交易复盘报告 | 1A |
| strategy_param_history | 策略参数变更历史 | 1A |
| meme_token_safety | Meme Token安全评分 | 1B |
| smart_money_traders | Smart Money档案 | 1C |
| copy_trade_configs | 跟单配置 | 1C |
| copy_trade_executions | 跟单交易记录 | 1C |
| market_regime_history | 市场状态历史 | 1E |
| telegram_bot_users | TG Bot用户 | 2 |
| telegram_bot_notifications | TG推送记录 | 2 |
| trading_agents | 交易策略Agent | 3A |

### 6.4 外部API集成

| API | 用途 | Phase |
|-----|------|-------|
| Claude API | 交易复盘分析、AI问答 | 1A |
| GoPlus Security API | 合约安全检测 | 1B |
| DexScreener API | 流动性、交易量 | 1B |
| Birdeye API | 持仓分布（Solana） | 1B |
| Telegram Bot API | Bot交互 | 2 |
| grammy框架 | TG Bot开发 | 2 |

---

## 七、关于OpenClaw的结论

**不引入OpenClaw，理由：**

1. 512个安全漏洞（8个Critical），不适合金融场景
2. LLM幻觉风险 — 可能"自信地"做出错误交易决策
3. 自主写代码+自主执行 = 不可控风险
4. 与现有架构耦合成本高
5. 我们需要的是"可控的学习闭环"，不是"不可控的自主Agent"

**替代方案：** 直接调用Claude API实现可控的AI分析能力（交易复盘、策略建议），人工审核后才应用参数变更。

---

## 八、成功指标

| 阶段 | 核心指标 | 目标值 |
|------|---------|--------|
| Phase 1 完成 | 信号胜率提升 | >55%（当前约45-50%） |
| Phase 1 完成 | Meme Token Rug检出率 | >90% |
| Phase 2 完成 | TG Bot日活 | >500 |
| Phase 2 完成 | TG Bot→Web转化率 | >15% |
| Phase 3 完成 | 交易Agent上架数 | >50 |
| Phase 3 完成 | Agent市场月交易额 | >10,000 Credits |
| 总体 | 月活用户 | >5,000 |
| 总体 | 用户平均收益率 | >3%/月 |

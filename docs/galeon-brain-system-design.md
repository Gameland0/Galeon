# Galeon Brain — 系统框架设计

> Brain 是一个独立的 Web3 DeFi 市场认知系统。
> 这个文档不讲集成，只讲 Brain 本身：它是什么、会什么、怎么学、怎么变强。
>
> 2026-04-28 设计审查备注：当前文档中的 `DecisionEngine`/动作集合/记忆目录结构与其他 Brain 文档存在不一致。V1 实现前先按 `docs/galeon-brain-design-review.md` 收敛：补充 Market Context 层，覆盖宏观价格、社交/叙事热度、流动性环境；LLM 负责认知、推演与非执行性 action bias，Control System 负责最终 action 映射与风控覆盖。

---

## 一、Brain 是什么

Brain 是一个 **LLM 驱动的受控认知系统**，具备以下能力：

| 能力 | 说明 |
|------|------|
| 市场理解 | 看到数据后能理解"发生了什么"，而不只是看到数字 |
| 阶段判断 | 判断一个标的处于生命周期的哪个阶段 |
| 路径推演 | 推演接下来可能走哪条路，每条路的概率和触发条件 |
| 交易决策 | 综合判断该进/该等/该退 |
| 经验积累 | 从每次判断的对错中学习，持续变强 |
| 自我解释 | 能说清楚"我为什么做这个判断"（可追溯、可审计） |

**Brain = 认知能力 + 知识体系 + 经验记忆 + 结构控制**

---

## 二、Brain 的四个核心子系统

```
┌─────────────────────────────────────────────────────────┐
│                    Galeon Brain                          │
│                                                         │
│  ┌───────────────┐  ┌───────────────┐                   │
│  │ 1. 知识体系    │  │ 2. 经验记忆    │                   │
│  │  Knowledge     │  │  Memory       │                   │
│  │  Base          │  │  System       │                   │
│  └───────┬───────┘  └───────┬───────┘                   │
│          │                  │                            │
│          ▼                  ▼                            │
│  ┌──────────────────────────────────────┐               │
│  │ 3. 认知引擎 (Cognition Engine)       │               │
│  │                                      │               │
│  │    LLM + 知识 + 经验 → 理解/推演/决策 │               │
│  └──────────────────┬───────────────────┘               │
│                     │                                    │
│                     ▼                                    │
│  ┌──────────────────────────────────────┐               │
│  │ 4. 控制系统 (Control System)         │               │
│  │                                      │               │
│  │    结构约束 + 风控红线 + 输出管控      │               │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

---

## 三、子系统 1: 知识体系 (Knowledge Base)

Brain 必须"懂"Web3 DeFi 市场。这个知识不是实时数据，而是对市场运作规律的理解。

### 3.1 知识类别

```
┌─────────────────────────────────────────────────────────┐
│                   Knowledge Base                         │
│                                                         │
│  ┌─────────────────────────────┐                        │
│  │ 市场结构知识                  │                        │
│  │                              │                        │
│  │ • Wyckoff 市场周期理论        │                        │
│  │   accumulation → markup →    │                        │
│  │   distribution → markdown    │                        │
│  │                              │                        │
│  │ • 流动性理论                  │                        │
│  │   什么是健康流动性            │                        │
│  │   流动性枯竭的前兆            │                        │
│  │   做市商行为模式              │                        │
│  │                              │                        │
│  │ • 资金流动模型                │                        │
│  │   CEX ↔ 链上资金迁移          │                        │
│  │   smart money vs 散户行为差异 │                        │
│  │   funding rate 和仓位的关系   │                        │
│  └─────────────────────────────┘                        │
│                                                         │
│  ┌─────────────────────────────┐                        │
│  │ Token 生命周期知识            │                        │
│  │                              │                        │
│  │ • Alpha Token 生命周期        │                        │
│  │   discovery → breakout →     │                        │
│  │   acceleration → exhaustion  │                        │
│  │   每个阶段的典型特征          │                        │
│  │   阶段转换的信号              │                        │
│  │                              │                        │
│  │ • 主流资产周期                │                        │
│  │   BTC 减半周期               │                        │
│  │   ETH 生态周期               │                        │
│  │   宏观利率和加密市场关系      │                        │
│  │                              │                        │
│  │ • Rug / 骗局模式             │                        │
│  │   典型 rug 前兆              │                        │
│  │   honeypot 合约特征          │                        │
│  │   集中持仓出货模式            │                        │
│  └─────────────────────────────┘                        │
│                                                         │
│  ┌─────────────────────────────┐                        │
│  │ 链上行为知识                  │                        │
│  │                              │                        │
│  │ • Smart Money 行为模式        │                        │
│  │   smart money 怎么建仓       │                        │
│  │   smart money 怎么出货       │                        │
│  │   真 smart money vs 假信号   │                        │
│  │                              │                        │
│  │ • DEX 交易行为               │                        │
│  │   大单 vs 小单的含义          │                        │
│  │   买卖比例的解读              │                        │
│  │   滑点和流动性深度关系        │                        │
│  │                              │                        │
│  │ • 社交信号解读                │                        │
│  │   KOL 喊单的真实影响力        │                        │
│  │   社交热度 vs 链上行为背离    │                        │
│  │   narrative 生命周期          │                        │
│  └─────────────────────────────┘                        │
│                                                         │
│  ┌─────────────────────────────┐                        │
│  │ 交易策略知识                  │                        │
│  │                              │                        │
│  │ • 什么阶段适合进场            │                        │
│  │ • 什么信号组合可信度高        │                        │
│  │ • 什么情况必须回避            │                        │
│  │ • 趋势交易 vs 反转交易的判断  │                        │
│  │ • 止损的认知逻辑              │                        │
│  │   （不是固定百分比，          │                        │
│  │    而是"判断失效就走"）       │                        │
│  └─────────────────────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

### 3.2 知识如何注入 Brain

```
方式 1: System Prompt（基础知识层）
  → Brain 的 system prompt 中包含市场结构、周期理论、行为模式
  → 这是 Brain 的"教科书"，让它有基本认知框架
  → 定期更新，但变化慢

方式 2: Knowledge Documents（参考资料层）
  → 本地存储的结构化知识文档
  → 分析时通过 RAG 检索相关知识片段
  → 例如: 分析 Alpha Token 时，检索 "Alpha Token 生命周期" 文档
  → 可持续扩展，不受 prompt 长度限制

方式 3: Few-shot Samples（案例知识层）
  → 真实的历史判断案例
  → "上次遇到这种情况，正确判断是什么"
  → 从 Brain 自己的交易历史中积累
  → 这是 Brain 最宝贵的知识 — 自己的经验
```

### 3.3 本地知识库结构

```
brain/knowledge/
├── market-structure/
│   ├── wyckoff-cycle.md              # Wyckoff 理论和实战应用
│   ├── liquidity-theory.md           # 流动性理论
│   ├── funding-rate-patterns.md      # Funding rate 和仓位关系
│   └── capital-flow-models.md        # 资金流动模型
│
├── token-lifecycle/
│   ├── alpha-token-phases.md         # Alpha Token 6 阶段特征
│   ├── major-asset-cycles.md         # BTC/ETH 大周期特征
│   ├── rug-patterns.md               # Rug/骗局识别模式
│   └── narrative-lifecycle.md        # Narrative 热度周期
│
├── onchain-behavior/
│   ├── smart-money-patterns.md       # Smart Money 行为识别
│   ├── dex-trading-signals.md        # DEX 交易行为解读
│   └── social-signal-quality.md      # 社交信号真实度判断
│
├── trading-logic/
│   ├── entry-conditions.md           # 什么时候该进
│   ├── exit-logic.md                 # 什么时候该走
│   ├── risk-recognition.md           # 什么时候必须回避
│   └── signal-combination.md         # 多信号组合的可信度
│
└── index.json                        # 知识索引（RAG 检索用）
```

---

## 四、子系统 2: 经验记忆 (Memory System)

**Brain 必须有记忆，否则每次都是从零开始。**

### 4.1 记忆类型

```
┌─────────────────────────────────────────────────────────┐
│                   Memory System                          │
│                                                         │
│  ┌─────────────────────────────┐                        │
│  │ 短期记忆 (Working Memory)   │                        │
│  │                              │                        │
│  │ • 最近 N 次认知结果           │                        │
│  │ • 最近分析过的 token 状态     │                        │
│  │ • 当前市场环境快照            │                        │
│  │ • 最近的对/错判断             │                        │
│  │                              │                        │
│  │ 存储: Redis / 内存            │                        │
│  │ 生命周期: 小时~天级           │                        │
│  └─────────────────────────────┘                        │
│                                                         │
│  ┌─────────────────────────────┐                        │
│  │ 长期记忆 (Long-term Memory) │                        │
│  │                              │                        │
│  │ • 历史判断案例库              │                        │
│  │   "上次 token X 在 early_breakout                    │
│  │    + smart money 流入时，                             │
│  │    我判断 enter，结果盈利 23%"                        │
│  │                              │                        │
│  │ • 误判案例库                  │                        │
│  │   "上次 token Y 社交热度高    │                        │
│  │    但动量弱，我判断 enter，   │                        │
│  │    结果亏损 -15%，            │                        │
│  │    教训: hype/momentum 背离   │                        │
│  │    时应该 wait"              │                        │
│  │                              │                        │
│  │ • 市场模式库                  │                        │
│  │   "每次 BTC funding rate     │                        │
│  │    极端正值后 48h 内，        │                        │
│  │    Alpha token 普遍回调"     │                        │
│  │                              │                        │
│  │ • 因子有效性记录              │                        │
│  │   "smart_money_direction     │                        │
│  │    在 risk_on 环境下准确率    │                        │
│  │    78%, 在 risk_off 下只有   │                        │
│  │    45%"                      │                        │
│  │                              │                        │
│  │ 存储: 本地文件 + 数据库       │                        │
│  │ 生命周期: 永久（持续积累）    │                        │
│  └─────────────────────────────┘                        │
│                                                         │
│  ┌─────────────────────────────┐                        │
│  │ 情境记忆 (Context Memory)   │                        │
│  │                              │                        │
│  │ • "上一次分析这个 token 时    │                        │
│  │    我判断了什么"              │                        │
│  │ • "这个 token 最近 3 次       │                        │
│  │    认知变化轨迹"              │                        │
│  │ • "我对这个 token 的历史      │                        │
│  │    胜率是多少"                │                        │
│  │                              │                        │
│  │ 存储: 数据库                  │                        │
│  │ 用途: 让 Brain 有连续性       │                        │
│  │       不是每次都从零分析      │                        │
│  └─────────────────────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

### 4.2 记忆如何注入认知过程

```
Brain.think(token) 时:

1. 从情境记忆中拉取:
   "上次分析 LAB 是 2 小时前，当时判断 early_breakout，confidence 0.65"
   → 让 Brain 知道状态是否发生了变化

2. 从长期记忆中检索相似案例:
   "历史上类似情况（early_breakout + smart money + risk_on）的案例有 5 个"
   → 作为 few-shot 样本注入 prompt

3. 从长期记忆中检索误判案例:
   "但其中 2 个因为 hype/momentum 背离而误判"
   → 作为反面教材注入 prompt

4. 从短期记忆中获取上下文:
   "当前市场环境: 过去 4 小时整体偏 risk_on，BTC 在 markup 阶段"
   → 提供市场全局视角
```

### 4.3 本地记忆存储结构

```
brain/memory/
├── working/                          # 短期记忆
│   ├── recent_decisions.json         # 最近 50 次决策
│   ├── market_snapshot.json          # 当前市场环境快照
│   └── token_states.json            # 各 token 最新状态
│
├── long-term/                        # 长期记忆
│   ├── success_cases/                # 成功案例
│   │   ├── alpha_enter_success.jsonl # Alpha token 成功 enter 案例
│   │   └── major_timing_success.jsonl
│   ├── failure_cases/                # 失败案例
│   │   ├── false_breakout.jsonl      # 虚假突破误判
│   │   ├── rug_missed.jsonl          # 未识别的 rug
│   │   └── early_exit.jsonl          # 过早退出
│   ├── market_patterns/              # 市场模式
│   │   └── patterns.jsonl            # 发现的规律
│   └── factor_stats/                 # 因子有效性
│       └── factor_performance.json   # 各因子在不同环境下的准确率
│
└── context/                          # 情境记忆
    └── token_history/                # 每个 token 的分析历史
        ├── BTC.jsonl
        ├── ETH.jsonl
        └── {token}.jsonl
```

单条记忆格式（JSONL，一行一条）:

```json
{
  "id": "mem_20260423_001",
  "timestamp": 1745366400,
  "token": "LAB",
  "category": "alpha",
  "situation": {
    "market_context": "risk_on",
    "asset_phase": "early_breakout",
    "momentum_quality": 0.72,
    "liquidity_health": 0.58,
    "smart_money_direction": 0.65,
    "hype_quality": 0.80
  },
  "decision": {
    "action": "enter",
    "confidence": 0.68,
    "reasoning": "early_breakout confirmed with smart money support"
  },
  "outcome": {
    "result": "loss",
    "pnl_percent": -12.5,
    "actual_phase_next": "exhaustion",
    "duration_hours": 6
  },
  "lesson": "hype_quality 远高于 momentum_quality 时不应该 enter，这是虚假突破的典型信号"
}
```

---

## 五、子系统 3: 认知引擎 (Cognition Engine)

### 5.1 认知引擎的组成

```
┌─────────────────────────────────────────────────────────┐
│               Cognition Engine                           │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │ Prompt System（提示词系统）                  │         │
│  │                                             │         │
│  │ 每次认知由以下部分组成:                       │         │
│  │                                             │         │
│  │  1. System Prompt（身份 + 基础知识）          │         │
│  │     "你是 Galeon Brain，一个专业的            │         │
│  │      Web3 DeFi 市场认知系统..."              │         │
│  │                                             │         │
│  │  2. Knowledge Context（相关知识片段）         │         │
│  │     从 Knowledge Base RAG 检索               │         │
│  │     "Alpha Token 生命周期: ..."              │         │
│  │                                             │         │
│  │  3. Memory Context（经验和记忆）              │         │
│  │     从 Memory System 检索                    │         │
│  │     "历史相似案例: ..."                      │         │
│  │     "上次分析这个 token: ..."                │         │
│  │                                             │         │
│  │  4. Market Data（当前市场数据）               │         │
│  │     MarketObservation 结构化数据              │         │
│  │                                             │         │
│  │  5. Task Prompt（本次具体任务）               │         │
│  │     "认知/推演/决策" 的具体指令               │         │
│  │                                             │         │
│  │  6. Output Schema（输出格式约束）             │         │
│  │     JSON Schema 定义                         │         │
│  └────────────────────────────────────────────┘         │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │ LLM Core（LLM 调用核心）                    │         │
│  │                                             │         │
│  │ • 主模型: Claude / DeepSeek（推理能力强）     │         │
│  │ • 备用模型: GPT-4 / Gemini（降级）           │         │
│  │ • 调用策略:                                  │         │
│  │   - 认知层: 需要强理解力 → 用最强模型         │         │
│  │   - 推演层: 需要强推理力 → 用最强模型         │         │
│  │   - 决策层: 需要稳定性 → 可用稍弱但快的模型   │         │
│  │ • 重试策略:                                  │         │
│  │   - 输出格式不合法 → 重试（最多 2 次）        │         │
│  │   - 主模型超时/失败 → 降级到备用模型          │         │
│  └────────────────────────────────────────────┘         │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │ Output Parser（输出解析器）                  │         │
│  │                                             │         │
│  │ • 从 LLM 原始输出中提取 JSON                 │         │
│  │ • 校验 JSON 是否符合 Output Schema           │         │
│  │ • 数值范围检查（0-1? -1 to 1?）              │         │
│  │ • 枚举值合法性检查                           │         │
│  │ • 概率归一化检查                             │         │
│  │ • 如果不合法 → 带错误信息重新调用 LLM        │         │
│  └────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

### 5.2 一次完整的认知流程（Prompt 拼装）

```
Brain.think("LAB", "alpha") 时，认知层的 Prompt 实际上是:

═══════════════════════════════════════════════════════
[System Prompt]
你是 Galeon Brain，一个专业的 Web3 DeFi 市场认知系统。
你的任务是理解市场数据并判断当前状态。
你具备以下知识: Wyckoff 周期理论、流动性理论、smart money 行为分析...
你必须严格按照指定格式输出。

[Knowledge Context — 从知识库 RAG 检索]
## Alpha Token 生命周期
discovery: 低量、少人关注、smart money 开始布局...
early_breakout: volume 开始放大、社交开始传播...
acceleration: 大量买入、KOL 扩散...
...

## Smart Money 行为模式
smart money 建仓特征: 分散买入、低调、不追高...
smart money 出货特征: 大额转出、DEX 大卖单...

[Memory Context — 从记忆系统检索]
## 你上次分析 LAB 的结果
2 小时前你判断 LAB 处于 discovery 阶段，confidence 0.45，action: wait

## 历史相似案例（成功）
案例 1: TOKEN_A early_breakout + smart_money 0.7 + risk_on → enter → +23%
案例 2: TOKEN_B early_breakout + smart_money 0.6 + liquidity 0.7 → enter → +15%

## 历史相似案例（失败 — 注意避免）
案例 3: TOKEN_C early_breakout + hype 0.9 + momentum 0.3 → enter → -12%
  教训: hype 远高于 momentum 是虚假突破信号

[Market Data — 当前数据]
{
  "token": "LAB",
  "price": 0.0234,
  "price_change_24h": "+18.5%",
  "volume_24h": 2340000,
  "volume_change": "+340%",
  "liquidity": 180000,
  "buy_sell_ratio": 2.3,
  "holder_count": 1250,
  "top10_holder_pct": 0.45,
  "smart_money_score": 72,
  "smart_money_direction": "accumulating",
  "social_hype": 65,
  "social_sentiment": "positive",
  "risk_flags": ["top_holder_concentration_moderate"],
  "market_context": {
    "btc_trend": "up",
    "market_volume_trend": "expanding",
    "fear_greed": 68
  }
}

[Task Prompt]
基于以上数据和知识，请分析 LAB 当前的市场状态。

你需要:
1. 理解当前数据说明了什么（不是复述数据）
2. 判断 LAB 处于哪个阶段
3. 评估动量、流动性、社交信号、smart money 的质量
4. 给出你的认知置信度

[Output Schema]
请严格按以下 JSON 格式输出:
{
  "market_interpretation": "你对当前市场的理解（自然语言）",
  "market_context": "risk_on | risk_off | ...",
  "asset_phase": "discovery | early_breakout | ...",
  "trading_context": {
    "momentum_quality": 0-1,
    "liquidity_health": 0-1,
    "hype_quality": 0-1,
    "smart_money_direction": -1 to 1,
    "risk_level": 0-1
  },
  "confidence": 0-1
}
═══════════════════════════════════════════════════════
```

**推演层和决策层的 Prompt 结构类似，但 Task Prompt 不同，且输入包含前一层的输出。**

---

## 六、子系统 4: 控制系统 (Control System)

### 6.1 三道防线

```
┌─────────────────────────────────────────────────────────┐
│                  Control System                          │
│                                                         │
│  第一道: 输出格式控制                                     │
│  ─────────────────                                      │
│  • LLM 输出必须是合法 JSON                               │
│  • 枚举值必须在定义范围内                                 │
│  • 数值必须在合法区间                                     │
│  • 概率必须归一化                                        │
│  • 不合法 → 重试（最多 2 次）→ 仍不合法 → 输出 wait       │
│                                                         │
│  第二道: 逻辑一致性检查                                   │
│  ──────────────────                                     │
│  • risk_level = high 但 action = enter → 矛盾，降级为 wait│
│  • confidence < 0.5 但 action = enter → 不合理，降级为 wait│
│  • asset_phase = decline 但 action = enter → 矛盾，block │
│  • 推演 dominant_path = danger 但 action = enter → 矛盾   │
│                                                         │
│  第三道: 风控红线（不可覆盖）                              │
│  ─────────────────────                                  │
│  • honeypot 检测 = true → 强制 block                    │
│  • rug indicators 触发 → 强制 block                     │
│  • top holder 集中度 > 80% → 强制 block                 │
│  • 连续 N 次判断同方向（enter）→ 触发审查（防止 LLM 偏向）│
│  • 单位时间 enter 次数超限 → 冷却                        │
└─────────────────────────────────────────────────────────┘
```

### 6.2 稳定性机制

**解决"同样输入不同输出"的问题：**

```
1. Temperature 控制
   认知层: temperature = 0.3（需要理解，允许少量创造性）
   推演层: temperature = 0.2（需要推理，更确定性）
   决策层: temperature = 0.1（需要稳定，尽量确定性）

2. 输出校验 + 自动修正
   如果 LLM 输出不符合逻辑 → 不是直接用，而是带上"你的输出有矛盾"重新调用

3. 决策一致性缓冲
   如果上一次判断 wait，这一次数据变化不大，LLM 突然说 enter
   → 要求 LLM 解释"为什么改变了判断"
   → 如果解释不充分 → 维持 wait

4. 多次采样 + 投票（可选，V2）
   同一输入调用 3 次 LLM
   取多数结果
   如果 3 次都不一样 → 输出 wait（信号不清晰）
```

---

## 七、Brain 如何学习（本地学习系统）

**Brain 不需要重新训练 LLM。它的学习方式是：积累经验 → 优化 Prompt → 调整参数。**

### 7.1 学习的数据来源

```
每次交易完成后，产生一条完整的学习数据:

{
  // 输入 — 当时看到了什么
  "input": MarketObservation,

  // Brain 的判断 — 当时想了什么
  "cognition": CognitionOutput,
  "reasoning": ReasoningOutput,
  "decision": BrainDecision,

  // 结果 — 实际发生了什么
  "outcome": {
    "pnl_percent": -8.5,
    "actual_next_phase": "exhaustion",
    "hold_duration_hours": 6,
    "max_drawdown": -15.2,
    "max_profit": +3.1
  }
}
```

### 7.2 学习过程

```
┌─────────────────────────────────────────────────────────┐
│              Brain Learning Pipeline                     │
│                                                         │
│  Step 1: 收集                                           │
│  ─────────                                              │
│  每次交易结束 → 生成学习数据 → 存入 long-term memory     │
│                                                         │
│  Step 2: 分析（定时任务，每天/每周）                      │
│  ─────────                                              │
│  用 LLM 分析最近的判断记录:                               │
│                                                         │
│  "以下是你最近 50 次判断和结果。                          │
│   请分析:                                                │
│   1. 你在什么情况下判断最准？                             │
│   2. 你在什么情况下经常判断错？                           │
│   3. 有没有发现什么新的市场模式？                         │
│   4. 哪些因子最近变得不可靠了？                           │
│   5. 你建议怎么修改认知策略？"                           │
│                                                         │
│  → LLM 输出学习报告                                     │
│                                                         │
│  Step 3: 更新                                           │
│  ─────────                                              │
│  基于学习报告:                                           │
│                                                         │
│  a) 更新 Few-shot 样本                                  │
│     • 把准确的判断加入成功案例库                          │
│     • 把错误的判断加入失败案例库（含教训）                 │
│     • 淘汰过时的案例（市场变了）                          │
│                                                         │
│  b) 更新知识库                                           │
│     • 发现的新市场模式 → 写入 market_patterns/           │
│     • 因子有效性变化 → 更新 factor_performance.json      │
│                                                         │
│  c) 优化 Prompt                                         │
│     • 如果某类误判反复出现 → 在 prompt 中增加警告         │
│     • 如果某个知识点被验证有效 → 在 prompt 中强化         │
│     • 版本化管理，可回滚                                  │
│                                                         │
│  d) 调整控制参数                                         │
│     • 风控阈值（如果过多 false positive → 放宽）          │
│     • confidence 最低要求（如果低 confidence 也经常对 → 降低）│
│     • temperature 参数                                   │
│                                                         │
│  Step 4: 验证                                           │
│  ─────────                                              │
│  更新后的 Brain 先跑 shadow mode:                        │
│  • 只产生决策，不执行                                     │
│  • 和更新前的版本对比                                     │
│  • 确认更好后才切换到 active mode                         │
└─────────────────────────────────────────────────────────┘
```

### 7.3 学习的具体产出

```
学习前 Prompt（V1）:
  "分析 Alpha Token 当前状态..."

学习后 Prompt（V2 — 加入了从经验中学到的东西）:
  "分析 Alpha Token 当前状态...

  重要经验:
  - 当 hype_quality > 0.7 但 momentum_quality < 0.4 时，
    这通常是虚假突破。过去 12 次类似情况有 9 次进入 exhaustion。
    应判断为 wait 而非 enter。

  - 当 smart_money_direction > 0.6 且 liquidity_health > 0.5 时，
    early_breakout → acceleration 的概率较高（历史 72%）。
    可以考虑 enter。

  - 在 BTC markdown 阶段，Alpha token 的 enter 胜率整体下降 40%。
    应提高 confidence 阈值到 0.7。"
```

### 7.4 本地学习调度

```
实时:
  每次交易结束 → 生成学习数据 → 存入记忆

每天（凌晨 3:00）:
  回收过去 24h 的判断结果
  更新 few-shot 样本
  更新因子有效性统计

每周:
  LLM 分析过去一周的判断记录 → 生成学习报告
  基于学习报告优化 Prompt
  新版本进入 shadow mode 验证

每月:
  全面回顾 Prompt 版本表现
  清理过时的记忆和样本
  知识库更新
```

---

## 八、Brain 的能力成长路径

```
Level 0: 新手
  • 只有教科书知识（system prompt + knowledge base）
  • 没有经验记忆
  • 决策质量依赖 LLM 本身的推理能力
  • 类似: 一个读了很多书但没实战的交易新手

Level 1: 有经验
  • 积累了 100+ 判断案例
  • few-shot 样本开始发挥作用
  • 开始识别常见陷阱（虚假突破、hype 诱导）
  • 类似: 实盘半年的交易员

Level 2: 成熟
  • 积累了 1000+ 判断案例
  • 不同市场环境下的因子有效性统计清晰
  • Prompt 经过多轮优化
  • 能识别大部分已知模式
  • 类似: 实盘 2 年的稳定交易员

Level 3: 专家
  • 积累了 5000+ 判断案例
  • 能发现新的市场模式
  • 能在陌生情况下做出合理推理
  • 知识库持续丰富
  • 类似: 经验丰富的专业交易员

每一次判断 — 无论对错 — 都让 Brain 变强一点。
```

---

## 九、Brain 的本地文件结构（完整）

```
ai-server/src/brain/
│
├── GaleonBrain.js                    # Brain 主入口 — think()
├── RiskGuard.js                      # 控制系统 — 风控红线
├── OutputValidator.js                # 控制系统 — 输出校验
├── ConsistencyChecker.js             # 控制系统 — 逻辑一致性
│
├── engine/                           # 认知引擎
│   ├── CognitionEngine.js            # 认知层引擎
│   ├── ReasoningEngine.js            # 推演层引擎
│   ├── DecisionEngine.js             # 决策层引擎
│   ├── PromptBuilder.js              # Prompt 拼装器
│   └── OutputParser.js               # 输出解析器
│
├── prompts/                          # Prompt 模板
│   ├── system.js                     # System Prompt（身份+基础知识）
│   ├── cognition.js                  # 认知层 Task Prompt
│   ├── reasoning.js                  # 推演层 Task Prompt
│   ├── decision.js                   # 决策层 Task Prompt
│   └── schemas/                      # 输出 JSON Schema
│       ├── cognition-schema.json
│       ├── reasoning-schema.json
│       └── decision-schema.json
│
├── knowledge/                        # 知识体系
│   ├── market-structure/             # 市场结构知识
│   ├── token-lifecycle/              # Token 生命周期
│   ├── onchain-behavior/            # 链上行为
│   ├── trading-logic/               # 交易逻辑
│   ├── index.json                   # 知识索引
│   └── KnowledgeRetriever.js        # RAG 检索器
│
├── memory/                           # 经验记忆
│   ├── working/                      # 短期记忆
│   ├── long-term/                    # 长期记忆
│   │   ├── success_cases/
│   │   ├── failure_cases/
│   │   ├── market_patterns/
│   │   └── factor_stats/
│   ├── context/                      # 情境记忆
│   │   └── token_history/
│   ├── MemoryManager.js             # 记忆管理器
│   └── MemoryRetriever.js           # 记忆检索器
│
├── learning/                         # 学习系统
│   ├── LearningPipeline.js          # 学习流水线
│   ├── CaseCollector.js             # 案例收集器
│   ├── PerformanceAnalyzer.js       # 表现分析器
│   ├── PromptOptimizer.js           # Prompt 优化器
│   └── ShadowValidator.js           # Shadow mode 验证器
│
└── config/                           # Brain 配置
    ├── brain-config.js              # 核心配置（模型选择、temperature等）
    ├── risk-thresholds.js           # 风控阈值
    └── learning-schedule.js         # 学习调度配置
```

---

## 十、总结

**Galeon Brain 是一个完整的认知系统，由 4 个子系统组成：**

| 子系统 | 是什么 | 做什么 |
|--------|--------|--------|
| 知识体系 | Brain 的"教科书" | 提供市场结构、行为模式、交易逻辑的基础知识 |
| 经验记忆 | Brain 的"经历" | 记住每次判断的对错，积累成功/失败案例 |
| 认知引擎 | Brain 的"思考过程" | LLM + 知识 + 经验 → 理解/推演/决策 |
| 控制系统 | Brain 的"纪律" | 格式约束、逻辑检查、风控红线 |

**Brain 的学习方式：**
- 不重新训练 LLM
- 而是：积累案例 → 分析表现 → 优化 Prompt → 调整参数 → 验证 → 上线
- 每一次判断都让 Brain 变强

**一句话：Galeon Brain 是一个有知识、有记忆、会学习、受纪律约束的 Web3 DeFi 市场认知系统。**

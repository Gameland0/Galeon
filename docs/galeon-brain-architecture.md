# Galeon Brain Architecture v1.0

> Galeon Brain 是一个 LLM 驱动的受控认知大脑。
> LLM 提供认知能力，结构系统控制行为边界。
> 它会思考、有经验，但必须遵守风控纪律。
>
> 2026-04-28 设计审查备注：V1 实现口径见 `docs/galeon-brain-design-review.md`。Brain 需要先感知 Market Context（宏观价格 + 社交/叙事热度 + 流动性环境），再判断 token；LLM 可输出非执行性的 action bias，但最终 action 与 position size 由 Control System 决定。

---

## 一、Brain 的本质

### Brain = LLM（认知） + Structured System（控制）

**不是纯 LLM，不是纯规则引擎，是混合体。**

| | 纯规则引擎 | 纯 LLM | Galeon Brain（Hybrid） |
|--|----------|--------|----------------------|
| 理解能力 | 不会理解，只会匹配 | 真的能理解语境 | LLM 负责理解 |
| 新情况处理 | 遇到没见过的就失灵 | 能推理陌生场景 | LLM 负责推理 |
| 稳定性 | 每次结果一致 | 同样输入可能不同输出 | 结构系统约束输出 |
| 可控性 | 完全可控 | 可能忽略风险、改逻辑 | 结构系统强制边界 |
| 可回测 | 完全可回测 | 无法回测 | 结构化输出可回测 |
| 幻觉风险 | 无 | 会编不存在的逻辑 | 结构系统过滤幻觉 |

### 为什么不能纯 LLM

如果让 LLM 自由做决策，它会很聪明地帮你亏钱：

- **不稳定**：同样的市场数据，一次说 enter，一次说 wait — 资金直接炸
- **不可控**：LLM 会自己改逻辑、忽略风险、被 prompt 干扰
- **不可验证**：没法回测、没法调参、没法控制行为
- **幻觉风险**：会编不存在的逻辑、过度解释

### 为什么不能纯规则

- 不会理解"流动性上升到底是健康还是诱多"
- 遇到没见过的市场组合就失灵
- 无法处理因子之间的复杂矛盾
- 永远只能做到设计者想到的情况

### 正确类比

| 错误 | 正确 |
|------|------|
| 一个天才但不守纪律的交易员 | 一个会思考、有经验、但必须遵守风控系统的交易员 |

---

## 二、架构

```
Input Layer（输入层）
    ↓  结构化市场数据
Cognition Layer（认知层）      ← LLM 理解 + 结构化输出约束
    ↓  受控认知结果
Reasoning Layer（推演层）      ← LLM 推演 + 结构化输出约束
    ↓  受控推演结果
Decision Layer（决策层）       ← LLM 判断 + 结构化行为边界
    ↓
BrainDecision（最终输出）
```

**每一层的分工：**

| | LLM 负责 | 结构系统负责 |
|--|---------|------------|
| 认知层 | 理解市场语境、解释矛盾信息 | 约束输出格式、限定状态枚举 |
| 推演层 | 推理可能的变化路径 | 约束路径在合法状态集内、限制概率范围 |
| 决策层 | 综合判断该不该做 | 强制风控红线、限定动作集合、约束置信度阈值 |

**核心原则：LLM 在每一层都在"想"，但每一层的输出都被结构系统"管住"。**

---

## 三、覆盖范围

| 类别 | 标的 |
|------|------|
| 主流资产 | BTC, ETH, BNB, SOL |
| Binance Alpha Tokens | Binance 上线的 Alpha 标的 |
| DeFi 协议代币 | 有实际链上活动和流动性的 DeFi 项目 |

不同类别的标的，LLM 的认知 prompt 不同：
- 主流资产：偏宏观趋势、资金流向、链上活跃度
- Alpha Tokens：偏阶段判断、流动性健康度、smart money 行为
- DeFi 代币：偏协议数据、TVL 变化、生态扩展

---

## 四、逐层定义

### Layer 1: Input Layer（输入层）

Brain 的感官。采集和标准化市场原始信息。**这一层是纯结构化的，不涉及 LLM。**

**输入源：**

| 类别 | 数据项 |
|------|--------|
| 链上 | price, volume, liquidity, buy/sell ratio, holder distribution, smart money activity, wallet movement, pool changes |
| 宏观 | BTC 趋势, ETH 趋势, 总市场交易量, 资金流向（CEX ↔ 链上）, 恐惧贪婪指数 |
| DeFi | LP 状态, TVL 变化, swap 路径, lending/borrowing 利率变化 |
| 社交 | Twitter 提及, KOL 内容, narrative 热度, 社区扩散速度 |
| 风险 | honeypot, 权限风险, rug indicators, 集中持仓风险, 合约风险 |

**输出：标准化市场观察（MarketObservation）**

```typescript
interface MarketObservation {
  token: string
  chain: string
  category: 'major' | 'alpha' | 'defi'
  timestamp: number
  onchain: OnchainData
  macro: MacroData
  social: SocialData
  risk: RiskData
}
```

这一层输出事实，不输出判断。数据由 Data Skills 采集，Input 层做标准化。

---

### Layer 2: Cognition Layer（认知层）

**LLM 理解市场，结构系统约束输出。**

#### LLM 在这一层做什么

LLM 接收 MarketObservation，用真正的理解能力回答：

- 流动性上升是健康补充还是诱多？
- 买盘增强是真启动还是接盘？
- 社交热度是真传播还是刷屏？
- smart money 行为和散户行为之间是否存在背离？
- 当前多个信号之间是否存在矛盾？如何解释？

**这些问题规则引擎答不了，但 LLM 可以。**

#### 结构系统在这一层做什么

约束 LLM 的输出必须符合固定格式：

**市场环境必须是以下枚举之一：**

| 状态 | 含义 |
|------|------|
| risk_on | 资金积极，市场偏进攻 |
| risk_off | 资金防守，市场偏谨慎 |
| liquidity_expanding | 流动性在扩张 |
| liquidity_contracting | 流动性在收缩 |
| trend_up | 主流资产上升趋势 |
| trend_down | 主流资产下降趋势 |
| consolidation | 横盘整理 |

**标的阶段必须是以下枚举之一：**

主流资产：`accumulation | markup | distribution | markdown`

Alpha Token：`discovery | early_breakout | acceleration | exhaustion | distribution | decline | rug_danger`

**交易语境必须输出固定字段：**

```typescript
interface CognitionOutput {
  // LLM 的自然语言理解（用于追溯和解释）
  market_interpretation: string     // LLM 对当前市场的理解

  // 结构化输出（被约束的）
  market_context: MarketContextState   // 必须是枚举值
  asset_phase: AssetPhase              // 必须是枚举值
  trading_context: {
    momentum_quality: number           // 0-1
    liquidity_health: number           // 0-1
    hype_quality: number               // 0-1
    smart_money_direction: number      // -1 to 1
    risk_level: number                 // 0-1
  }
  confidence: number                   // 0-1
}
```

**LLM 可以自由地"想"，但输出必须填入这些框。** 想的过程记录在 `market_interpretation`，结论必须结构化。

---

### Layer 3: Reasoning Layer（推演层）

**LLM 推演变化，结构系统约束路径。**

#### LLM 在这一层做什么

基于 Cognition 层的输出，LLM 推演接下来可能发生什么：

- 如果当前是 early_breakout，接下来是 acceleration 还是 exhaustion？
- 当前的 smart money 行为暗示什么方向？
- 社交热度和链上数据之间的关系预示什么？
- 有没有之前没注意到的风险正在积累？

**LLM 擅长的是把多个维度的信息综合起来做推理，这是规则引擎做不到的。**

#### 结构系统在这一层做什么

约束 LLM 的推演输出：

1. **路径必须在合法状态集内** — 不能推演出不存在的阶段
2. **概率必须归一化** — 所有路径概率加起来 = 1
3. **必须给出触发和失效条件** — 不允许模糊推演
4. **路径数量限制** — 最多 3-4 条路径，不允许开放式发散

```typescript
interface ReasoningOutput {
  // LLM 的推演思路（用于追溯）
  reasoning_narrative: string

  // 结构化输出（被约束的）
  current_phase: AssetPhase
  paths: Array<{
    next_phase: AssetPhase              // 必须是合法状态
    probability: number                 // 所有 paths 概率之和 = 1
    trigger_conditions: string[]        // 必须明确
    invalidation_conditions: string[]   // 必须明确
  }>                                    // 最多 4 条
  dominant_path: AssetPhase
  risk_shift: number                    // -1 to 1
}
```

**LLM 的推理能力用来做高质量的路径判断，结构系统保证输出可控、可回测。**

---

### Layer 4: Decision Layer（决策层）

**LLM 做判断，结构系统管住边界。**

#### LLM 在这一层做什么

综合 Cognition + Reasoning，LLM 做最终的认知判断：
- 综合所有因素，该不该进？
- 有没有推演层可能遗漏的风险？
- 当前的 confidence 够不够支撑行动？

#### 结构系统在这一层做什么（关键）

**这一层的结构约束最强，因为这里直接关联资金。**

1. **动作集合固定** — 只能输出 5 种动作：

| 动作 | 含义 |
|------|------|
| enter | 应该进场 |
| wait | 观望，条件不充分 |
| reduce | 应该减仓 |
| exit | 应该离场 |
| block | 拉黑，不值得关注 |

2. **风控红线不可覆盖** — 无论 LLM 怎么判断，以下规则强制执行：

```
如果 risk 数据触发硬性红线（rug/honeypot/集中持仓异动）:
  → 强制 block，LLM 判断无效

如果 confidence < 最低阈值:
  → 强制 wait，不允许 enter

如果 risk_level == high:
  → 不允许 enter，只允许 wait / reduce / exit
```

3. **输出格式固定**：

```typescript
interface BrainDecision {
  token: string
  category: 'major' | 'alpha' | 'defi'
  timestamp: number

  // 认知层
  cognition: CognitionOutput

  // 推演层
  reasoning: ReasoningOutput

  // 决策（LLM 判断 + 结构约束后的最终结果）
  decision: {
    action: 'enter' | 'wait' | 'reduce' | 'exit' | 'block'
    confidence: number
    risk_level: 'low' | 'medium' | 'high'
    reasoning_summary: string       // LLM 的判断理由
    invalidation: string            // 什么条件下判断失效
    overridden: boolean             // 是否被风控系统覆盖
    override_reason?: string        // 如果被覆盖，原因是什么
  }
}
```

**`overridden` 字段很重要** — 当 LLM 说 enter 但风控系统强制 wait 时，记录下来。这既保证安全，又保留 LLM 判断供后续分析（也许 LLM 是对的，风控参数需要调）。

---

## 五、LLM 和结构系统的协作流程

完整的一次 Brain 运行：

```
1. Input 层（纯结构化）
   Data Skills 采集数据 → 标准化为 MarketObservation

2. Cognition 层
   LLM 接收 MarketObservation + 认知 Prompt
   LLM 输出自然语言理解 + 结构化认知结果
   结构系统校验：枚举值合法？数值在范围内？
   → CognitionOutput

3. Reasoning 层
   LLM 接收 CognitionOutput + 推演 Prompt
   LLM 输出推演思路 + 结构化路径
   结构系统校验：状态合法？概率归一？路径数量 ≤ 4？
   → ReasoningOutput

4. Decision 层
   LLM 接收 CognitionOutput + ReasoningOutput + 决策 Prompt
   LLM 输出判断理由 + 动作
   结构系统校验：动作合法？
   风控系统检查：是否触发红线？confidence 是否够？
   如果风控覆盖 → 标记 overridden = true，替换动作
   → BrainDecision（最终输出）
```

**每一步 LLM 都在想，但每一步结构系统都在管。**

---

## 六、Brain 和 Skill 的边界

```
┌───────────────────────────────────────────────────┐
│                 Galeon Brain                       │
│                                                   │
│  ┌─────────┐   ┌──────────┐   ┌──────────┐       │
│  │   LLM   │   │   LLM    │   │   LLM    │       │
│  │ 认知理解 │ → │ 路径推演  │ → │ 判断决策  │       │
│  └────┬────┘   └────┬─────┘   └────┬─────┘       │
│       │             │              │              │
│  ┌────▼────┐   ┌────▼─────┐   ┌────▼─────┐       │
│  │结构约束  │   │ 结构约束  │   │风控+约束  │       │
│  │枚举/格式 │   │概率/路径  │   │红线/动作  │       │
│  └────┬────┘   └────┬─────┘   └────┬─────┘       │
│       └─────────────┴──────────────┘              │
│                     ↓                             │
│              BrainDecision                        │
│  "该进，因为……" / "该等，因为……" / "该退，因为……"   │
└─────────────────────┬─────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────┐
│                   Skills                          │
│                                                   │
│  Data Skills:     采集数据 → 喂给 Brain Input     │
│  Position Skill:  根据 Brain 决策计算仓位大小      │
│  Portfolio Skill: 管理多仓位、控制总风险敞口        │
│  Execution Skill: 下单、止盈、止损、分批执行        │
│  Feedback Skill:  回收结果 → 回写修正 Brain        │
└───────────────────────────────────────────────────┘
```

**Brain 做判断，Skill 做操作。**

Brain 告诉系统：
> "BTC 该进。accumulation 阶段，smart money 持续流入，市场 risk_on，推演 55% 概率进入 markup。如果跌破支撑位则判断失效。"

Skill 负责：买多少、怎么买、止损放哪、和其他仓位怎么协调。

---

## 七、Feedback 如何让 Brain 持续变强

Feedback 是一个 Skill，但它的作用是让 Brain 持续进化。

**回写什么：**

| 回收项 | 修正目标 |
|--------|---------|
| LLM 认知判断是否正确 | 认知层 Prompt 优化、few-shot 样本更新 |
| LLM 推演路径是否命中 | 推演层 Prompt 优化、历史案例补充 |
| 风控覆盖是否正确 | 调整风控阈值（也许 LLM 被错误覆盖了） |
| 哪些数据源本轮噪音大 | Input 层数据权重调整 |

**Brain 进化的方式不是重新训练 LLM，而是：**
1. 优化每一层的 Prompt（更精准的认知指令）
2. 积累 few-shot 样本（成功案例和失败案例）
3. 调整结构系统的参数（风控阈值、confidence 最低要求）
4. 更新历史经验上下文（让 LLM 有"记忆"）

---

## 八、MVP 计划 — V1 专注交易

### 核心目标

**替代 AlphaMarketAnalyzer 的规则打分，用 LLM 认知做更准的交易决策。**

当前信号流：
```
AlphaMarketAnalyzer（7维规则打分 → conf=61.8）→ alpha_signals → paper-trader 执行
```

Brain V1 目标：
```
Brain.think(token)（LLM认知 + 结构控制）→ brain_decisions → 同样的执行链路
```

**V1 不做其他事。** 不做研究 copilot、不做链上分析工具、不做通用 Web3 大脑。先把交易决策这一件事做到比 AlphaMarketAnalyzer 好。

---

### v0.1：最小交易认知闭环

**目标：Brain 能对 Binance Alpha Token 输出 BrainDecision，并通过 paper trading 验证。**

**Input — 复用 AlphaMarketAnalyzer 已有的数据源：**
- BinanceAlphaService → price, OI, funding rate, klines
- DexScreenerService → DEX price, volume, liquidity, buy/sell ratio
- SintralDataService → smart money score, holder distribution
- BinanceMarketRankService → 社交热度
- SecurityMonitorService → 基础风险检测

**Cognition（LLM + 约束）：**
- LLM 接收 AlphaMarketAnalyzer 相同的数据，但用认知理解替代规则打分
- 输出：market_context（枚举）、asset_phase（枚举）、trading_context（数值）
- 初版认知 Prompt，含 3-5 个 few-shot 样本（从历史 alpha_signals 成功/失败案例中提取）

**Reasoning（LLM + 约束）：**
- LLM 推演 3 条路径（strengthen / weaken / danger）
- 结构约束：概率归一、合法状态、必须有条件
- 初版推演 Prompt

**Decision（LLM + 风控）：**
- LLM 输出 enter / wait / reduce / exit / block
- 风控红线：
  - risk_level == high → 禁止 enter
  - confidence < 0.5 → 强制 wait
  - 集中持仓 > 阈值 → 强制 block
- 输出 BrainDecision 写入 brain_decisions 表

**验证方式：**
- Brain 和 AlphaMarketAnalyzer 并行运行
- Brain 输出 brain_decisions，paper-trader 同时消费 alpha_signals 和 brain_decisions
- 对比两者的：
  - 信号准确率（enter 后是否盈利）
  - 风险规避率（block 的是否真的 rug）
  - wait 的质量（wait 的是否真的不该进）
- 跑 2-4 周 paper trading 数据

---

### v0.2：Feedback 闭环 + Prompt 进化

**目标：Brain 能从自己的交易结果中学习，持续变强。**

- FeedbackSkill 每天回收 brain_decisions vs trade_result
- 自动分析：阶段判断对不对、推演路径中不中、什么信号被误读
- 更新认知/推演/决策 Prompt（加入新的 few-shot 样本）
- 调整风控阈值（如果 LLM 被过多覆盖且覆盖是错的）
- Prompt 版本管理（brain_prompts 表，可回滚）

---

### v0.3：扩展到主流资产 + 社交信号

**目标：Brain 覆盖 BTC/ETH/BNB/SOL 主流资产，加入社交信号。**

- 主流资产用不同的认知 Prompt（Wyckoff 4 阶段）
- 加入 Hyperliquid 数据（smart money 仓位、top traders）
- 加入 Twitter/Telegram 信号作为认知输入
- 不同 category 的 few-shot 样本库独立管理

---

### v0.4：多链 + 完整 Portfolio 意识

**Brain 扩展到通用 Web3 DeFi 认知能力的起点。**

---

### V1 不做的事（后续版本）

| 不做 | 原因 |
|------|------|
| 研究 copilot / 报告生成 | V1 只做交易决策 |
| 通用链上分析 | V1 只分析交易标的 |
| 用户对话交互 | V1 是自动化系统，不是聊天 |
| 多策略管理 | V1 单一策略：信号 → 决策 → 执行 |
| DeFi 协议深度分析 | V1 先做 token 交易 |

---

## 九、总结

**Galeon Brain = LLM 驱动的受控认知大脑**

- LLM 提供认知能力 — 理解、推演、判断
- 结构系统控制行为边界 — 格式、枚举、阈值、风控红线
- 每一层 LLM 都在"想"，但每一层输出都被"管住"
- Brain 做判断，Skill 做操作
- **它是一个会思考、有经验、但必须遵守风控纪律的交易员**

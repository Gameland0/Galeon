# Galeon 系统架构（v1）

> 基于 galeon-brain-spec-v1.md 的正式架构。
> 核心原则：LLM 只做认知，决策由 Control System 确定性规则映射。

---

## 一、系统全局

```
┌──────────────────────────────────────────────────────────┐
│                   Application Layer                       │
│              API / Cron / WebSocket / UI                  │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│                   Orchestrator                            │
│          扫描标的 → 调度 Brain → 路由执行 → 反馈闭环       │
└──────┬─────────────────────────────────────┬─────────────┘
       │                                     │
┌──────▼──────────────────────┐    ┌─────────▼────────────┐
│        Galeon Brain          │    │    Execution Layer    │
│                              │    │                      │
│  Input Pipeline              │    │  swap / 分批建仓     │
│       ↓                      │    │  止盈止损 / 路由执行  │
│  Knowledge + Memory          │    │                      │
│       ↓                      │    │  （复用现有 Services）│
│  Cognition Engine (LLM)      │    └──────────────────────┘
│       ↓                      │
│  Control System (规则)       │
│       ↓                      │
│  Decision Output             │
└──────────────────────────────┘
       │
┌──────▼──────────────────────┐
│     Data Pipeline            │
│  （复用现有 Services）        │
└──────────────────────────────┘
```

---

## 二、数据流（一次完整的交易判断）

```
1. Orchestrator 选定 token
       │
       ▼
2. Data Pipeline 采集数据 → 标准化为 Input
       │
       ▼
3. Brain 接收 Input
       │
       ├─ 3a. Knowledge System 注入相关知识
       ├─ 3b. Memory System 注入历史经验
       │
       ▼
4. Cognition Engine (LLM) 输出认知结果
       │
       │  {
       │    "market_state": "risk_on",
       │    "token_stage": "early_breakout",
       │    "confidence": 0.71,
       │    "scenarios": [...]
       │  }
       │
       │  ⚠ LLM 禁止输出 buy/sell/仓位/策略
       │
       ▼
5. Control System 接收认知结果
       │
       ├─ 5a. 格式校验（JSON schema）
       ├─ 5b. 逻辑一致性（概率归一等）
       ├─ 5c. 风控红线（honeypot/rug → block/exit）
       ├─ 5d. 决策映射（确定性规则 → action）
       │
       ▼
6. Decision Output
       │
       │  {
       │    "action": "enter_small",
       │    "confidence": 0.68,
       │    "risk_level": "medium",
       │    "position_size": 0.1,
       │    "guard": { "stop_loss": -0.15, ... }
       │  }
       │
       ▼
7. Orchestrator 路由到 Execution Layer
       │
       ▼
8. Execution Layer 执行交易
       │
       ▼
9. Feedback Loop 回收结果 → 更新 Memory + 风控阈值
```

**关键分离点在第 4 步和第 5 步之间：LLM 输出认知，Control System 输出动作。两者完全分离。**

---

## 三、各模块详细设计

### 3.1 Data Pipeline（数据管线）

**职责：** 采集原始数据，标准化为 Brain Input 格式。

**不是新系统，是对现有 Services 的标准化封装。**

```
DataPipeline.collect(token, chain)

内部调用:
  ├─ DexScreenerService     → price, volume, liquidity, buy_sell_ratio
  ├─ SintralDataService     → smart_money_inflow, holder_concentration
  ├─ BinanceAlphaService    → market_cap, volume_5m, volume_1h
  ├─ SecurityMonitorService → honeypot_flag, contract_risk_score, rug_score
  ├─ BinanceMarketRankService → sentiment_score, hype_velocity
  └─ （可选）TwitterSignal  → mention_count, KOL_score

输出:
  标准化 Input JSON（见 spec 2.2）
```

```javascript
// DataPipeline.js
class DataPipeline {
  async collect(token, chain) {
    const [market, onchain, risk, social] = await Promise.all([
      this.collectMarket(token, chain),
      this.collectOnchain(token, chain),
      this.collectRisk(token, chain),
      this.collectSocial(token, chain)
    ]);

    return { token, chain, market, onchain, risk, social };
  }
}
```

### 3.2 Knowledge System（知识体系）

**职责：** 为 LLM 提供结构化的市场知识。

```
brain/knowledge/
├── patterns/                      # 市场模式定义
│   ├── early_breakout.json
│   ├── acceleration.json
│   ├── distribution.json
│   ├── rug_pattern.json
│   └── ...
│
├── rules/                         # 认知规则
│   ├── smart_money_signals.json   # smart money 行为含义
│   ├── liquidity_interpretation.json
│   └── social_signal_quality.json
│
└── KnowledgeRetriever.js          # 根据 token 状态检索相关知识
```

单个模式文件格式:

```json
{
  "pattern": "early_breakout",
  "conditions": [
    "volume_increase > 200%",
    "liquidity_growth > 20%",
    "smart_money_inflow > 0.5"
  ],
  "risk_level": "medium",
  "next_states": ["acceleration", "fake_breakout", "distribution"],
  "warning_signs": [
    "hype_velocity high but volume flat → likely fake",
    "holder_concentration > 0.7 → rug risk"
  ]
}
```

**注入方式:**
- System Prompt: 通用原则（风险优先、不预测价格）
- RAG: 根据当前数据特征检索相关 pattern
- Few-shot: 从 Memory 中检索历史相似案例

### 3.3 Memory System（经验记忆）

**职责：** 存储 Brain 的经验，让认知有连续性。

```
brain/memory/
├── working.json                   # 短期记忆（最近决策 + 市场快照）
├── long_term/
│   ├── pattern_stats.json         # 各 pattern 的胜率/回报统计
│   ├── success_cases.jsonl        # 成功案例
│   ├── failure_cases.jsonl        # 失败案例（含教训）
│   └── factor_performance.json    # 各因子在不同环境下的有效性
├── context/
│   └── {token}.jsonl              # 每个 token 的分析历史
└── MemoryManager.js               # 读写管理
```

**短期记忆（working.json）:**

```json
{
  "recent_decisions": [
    {
      "token": "LAB", "timestamp": 1745366400,
      "token_stage": "early_breakout", "action": "enter_small"
    }
  ],
  "current_market_state": "risk_on",
  "active_positions": ["LAB", "FOLKS"]
}
```

**长期记忆（pattern_stats.json）— 必须量化：**

```json
{
  "early_breakout": {
    "total_count": 156,
    "win_rate": 0.58,
    "avg_return": 0.12,
    "rug_rate": 0.05,
    "best_conditions": "smart_money > 0.6 AND liquidity > 30000",
    "worst_conditions": "hype_velocity > 0.8 AND volume flat"
  },
  "distribution": {
    "total_count": 89,
    "win_rate": 0.23,
    "avg_return": -0.34,
    "rug_rate": 0.41
  }
}
```

**情境记忆（{token}.jsonl）:**

```json
{"timestamp": 1745360000, "stage": "discovery", "action": "wait"}
{"timestamp": 1745363600, "stage": "early_breakout", "action": "enter_small"}
{"timestamp": 1745370800, "stage": "acceleration", "action": "wait", "note": "already in position"}
```

### 3.4 Cognition Engine（认知引擎）

**职责：** 调用 LLM，输出市场认知结果。禁止输出动作。

```
brain/engine/
├── CognitionEngine.js        # 核心引擎
├── PromptBuilder.js           # 拼装完整 Prompt
└── OutputParser.js            # 解析 + 校验 LLM 输出
```

**CognitionEngine 的完整流程：**

```javascript
class CognitionEngine {
  async analyze(input) {
    // 1. 检索相关知识
    const knowledge = this.knowledgeRetriever.retrieve(input);

    // 2. 检索相关记忆
    const memory = this.memoryManager.retrieve(input.token);

    // 3. 拼装 Prompt
    const prompt = this.promptBuilder.build({
      system: SYSTEM_PROMPT,
      knowledge,
      memory,
      inputData: input,
      outputSchema: COGNITION_SCHEMA
    });

    // 4. 调用 LLM
    const raw = await this.llm.call(prompt, { temperature: 0.3 });

    // 5. 解析 + 校验
    const result = this.outputParser.parse(raw, COGNITION_SCHEMA);

    // 6. 校验失败 → 重试（最多 2 次）
    if (!result.valid) {
      const retry = await this.llm.call(
        this.promptBuilder.buildRetry(prompt, result.errors),
        { temperature: 0.2 }
      );
      return this.outputParser.parse(retry, COGNITION_SCHEMA);
    }

    return result;
  }
}
```

**LLM 输出格式（固定，不可扩展）：**

```json
{
  "market_state": "risk_on",
  "token_stage": "early_breakout",
  "interpretation": "volume 大幅上升且 smart money 持续流入，但 holder 集中度偏高需要注意...",
  "risk_signals": ["holder_concentration"],
  "confidence": 0.71,
  "scenarios": [
    {"path": "acceleration", "prob": 0.6},
    {"path": "distribution", "prob": 0.3},
    {"path": "rug", "prob": 0.1}
  ]
}
```

**LLM 选择策略：**

| 场景 | 模型 | 原因 |
|------|------|------|
| 主力 | Claude / DeepSeek | 推理能力强 |
| 降级 | GPT-4 | 主力超时/失败时 |
| 稳定性 | temperature ≤ 0.3 | 减少随机性 |
| 多次采样 | n=3, majority voting | 提高稳定性 |

### 3.5 Control System（控制系统）

**职责：** 接收 LLM 认知输出，通过确定性规则映射成交易动作。

**这是整个系统最关键的模块。** 决策的正确性、稳定性、可回测性全靠它。

```
brain/control/
├── ControlSystem.js           # 控制系统主入口
├── SchemaValidator.js         # 格式校验
├── ConsistencyChecker.js      # 逻辑一致性
├── RiskGuard.js               # 风控红线
├── DecisionMapper.js          # 决策映射规则
└── StabilityController.js     # 稳定性控制
```

**Control System 完整流程：**

```javascript
class ControlSystem {
  process(cognitionOutput, riskData) {

    // Step 1: 格式校验
    if (!this.schemaValidator.validate(cognitionOutput)) {
      return { action: "wait", reason: "invalid_cognition_output" };
    }

    // Step 2: 逻辑一致性
    if (!this.consistencyChecker.check(cognitionOutput)) {
      return { action: "wait", reason: "inconsistent_cognition" };
    }

    // Step 3: 风控红线（最高优先级，不可覆盖）
    const riskResult = this.riskGuard.check(riskData);
    if (riskResult.blocked) {
      return {
        action: riskResult.action,  // block 或 exit
        reason: riskResult.reason,
        risk_level: "critical"
      };
    }

    // Step 4: 决策映射（确定性规则）
    const decision = this.decisionMapper.map(cognitionOutput, riskData);

    // Step 5: 稳定性检查
    const stable = this.stabilityController.check(decision);

    return stable;
  }
}
```

**风控红线（RiskGuard）— 最高优先级：**

```javascript
class RiskGuard {
  check(riskData) {
    // 硬性红线 — 不可覆盖，不可协商
    if (riskData.honeypot === true)
      return { blocked: true, action: "block", reason: "honeypot_detected" };

    if (riskData.rug_score > 0.7)
      return { blocked: true, action: "exit", reason: "high_rug_score" };

    if (riskData.liquidity < this.thresholds.min_liquidity)
      return { blocked: true, action: "block", reason: "insufficient_liquidity" };

    if (riskData.contract_risk_score > 0.8)
      return { blocked: true, action: "block", reason: "contract_risk" };

    return { blocked: false };
  }
}
```

**决策映射规则（DecisionMapper）— 核心逻辑：**

```javascript
class DecisionMapper {
  map(cognition, risk) {
    const { token_stage, confidence, scenarios } = cognition;
    const dominantPath = scenarios[0]; // 概率最高的路径

    // ═══ Enter 条件 ═══
    if (token_stage === "early_breakout"
        && confidence > 0.65
        && risk.rug_score < 0.3
        && dominantPath.path === "acceleration"
        && dominantPath.prob > 0.5) {
      return this.buildDecision("enter_small", cognition, risk);
    }

    if (token_stage === "early_breakout"
        && confidence > 0.80
        && risk.rug_score < 0.2
        && dominantPath.prob > 0.7) {
      return this.buildDecision("enter_full", cognition, risk);
    }

    // ═══ Reduce 条件 ═══
    if (token_stage === "distribution") {
      return this.buildDecision("reduce", cognition, risk);
    }

    if (token_stage === "exhaustion" && confidence > 0.6) {
      return this.buildDecision("reduce", cognition, risk);
    }

    // ═══ Exit 条件 ═══
    if (token_stage === "rug") {
      return this.buildDecision("exit", cognition, risk);
    }

    if (dominantPath.path === "rug" && dominantPath.prob > 0.4) {
      return this.buildDecision("exit", cognition, risk);
    }

    // ═══ Block 条件 ═══
    if (risk.rug_score > 0.5) {
      return this.buildDecision("block", cognition, risk);
    }

    // ═══ 默认 ═══
    return this.buildDecision("wait", cognition, risk);
  }

  buildDecision(action, cognition, risk) {
    return {
      action,
      confidence: cognition.confidence,
      risk_level: this.calcRiskLevel(risk),
      position_size: this.calcPositionSize(action, cognition.confidence),
      reason: cognition.interpretation,
      guard: {
        stop_loss: this.calcStopLoss(action, risk),
        kill_condition: this.calcKillCondition(risk)
      }
    };
  }
}
```

**稳定性控制（StabilityController）：**

```javascript
class StabilityController {
  check(decision) {
    // 决策冷却: 同一 token 短时间内不重复 enter
    if (decision.action.startsWith("enter") && this.inCooldown(decision.token)) {
      return { ...decision, action: "wait", reason: "cooldown_active" };
    }

    // 方向突变检查: 上次 wait 这次突然 enter，数据变化不大 → 维持 wait
    if (this.isDirectionFlip(decision) && !this.isDataSignificantlyChanged(decision)) {
      return { ...decision, action: "wait", reason: "direction_flip_without_data_change" };
    }

    return decision;
  }
}
```

### 3.6 Orchestrator（编排器）

**职责：** 调度整个流程。决定分析什么、什么时候分析、结果怎么处理。

```
orchestrator/
├── Orchestrator.js            # 主编排器
├── TokenScanner.js            # 标的扫描
└── FeedbackCollector.js       # 反馈收集
```

```javascript
class Orchestrator {

  // 主循环（定时任务触发）
  async run() {
    // 1. 扫描需要分析的 token
    const tokens = await this.tokenScanner.scan();

    for (const { token, chain } of tokens) {

      // 2. Data Pipeline 采集数据
      const input = await this.dataPipeline.collect(token, chain);

      // 3. Brain 认知
      const cognition = await this.brain.cognize(input);

      // 4. Control System 决策
      const decision = await this.brain.decide(cognition, input.risk);

      // 5. 存储决策
      await this.store(token, input, cognition, decision);

      // 6. 路由执行
      if (decision.action === "enter_small" || decision.action === "enter_full") {
        await this.executionLayer.execute(decision);
      }
      if (decision.action === "reduce" || decision.action === "exit") {
        await this.executionLayer.execute(decision);
      }

      // 7. 更新短期记忆
      this.brain.memory.updateWorking(token, cognition, decision);
    }
  }

  // 反馈闭环（交易完成后）
  async onTradeComplete(token, tradeResult) {
    const decision = await this.getDecision(token);
    await this.feedbackCollector.collect(decision, tradeResult);
    await this.brain.memory.updateLongTerm(decision, tradeResult);
  }
}
```

**TokenScanner — 决定分析什么：**

```javascript
class TokenScanner {
  async scan() {
    const tokens = [];

    // 1. 从 BinanceAlphaService 获取活跃 Alpha tokens
    const alphaTokens = await BinanceAlphaService.getActiveTokens();
    tokens.push(...alphaTokens.map(t => ({
      token: t.address, chain: t.chain, source: "alpha_list"
    })));

    // 2. 从信号源获取新提及的 token
    const signalTokens = await this.getSignalTriggeredTokens();
    tokens.push(...signalTokens);

    // 3. 去重 + 过滤黑名单
    return this.dedupAndFilter(tokens);
  }
}
```

### 3.7 Execution Layer（执行层）

**复用现有系统，不重建。** Brain 只需要一个标准化接口。

```javascript
class ExecutionLayer {
  async execute(decision) {
    switch (decision.action) {
      case "enter_small":
      case "enter_full":
        // 复用 AutoTradeService → BatchExecutor → DEXAggregator
        await this.autoTradeService.openPosition({
          token: decision.token,
          size: decision.position_size,
          stopLoss: decision.guard.stop_loss
        });
        break;

      case "reduce":
        await this.autoTradeService.reducePosition(decision.token, 0.5);
        break;

      case "exit":
        await this.autoTradeService.closePosition(decision.token);
        break;
    }
  }
}
```

### 3.8 Feedback Loop（反馈闭环）

**职责：** 回收交易结果，更新 Memory 和风控参数。

```javascript
class FeedbackCollector {
  async collect(decision, tradeResult) {
    // 1. 记录
    const record = {
      token: decision.token,
      cognition_stage: decision.cognition.token_stage,
      action: decision.action,
      confidence: decision.confidence,
      pnl: tradeResult.pnl_percent,
      actual_outcome: tradeResult.outcome,  // "win" / "loss" / "rug"
      duration_hours: tradeResult.hold_hours
    };

    // 2. 写入记忆
    if (tradeResult.pnl_percent > 0) {
      this.memory.appendSuccess(record);
    } else {
      this.memory.appendFailure({
        ...record,
        lesson: await this.analyzeLessonLLM(decision, tradeResult)
      });
    }

    // 3. 更新 pattern 统计
    this.memory.updatePatternStats(
      decision.cognition.token_stage,
      tradeResult.pnl_percent,
      tradeResult.outcome
    );

    // 4. 定期更新风控阈值（每周）
    // 如果某个 pattern 的 win_rate 持续下降 → 提高进入门槛
  }
}
```

---

## 四、Brain 主入口

```javascript
// brain/GaleonBrain.js

class GaleonBrain {
  constructor() {
    this.knowledge = new KnowledgeRetriever();
    this.memory = new MemoryManager();
    this.engine = new CognitionEngine();
    this.control = new ControlSystem();
  }

  /**
   * 认知：LLM 分析市场状态
   * 输入: 标准化 Input
   * 输出: CognitionOutput (market_state, token_stage, scenarios...)
   */
  async cognize(input) {
    return await this.engine.analyze(input);
  }

  /**
   * 决策：Control System 规则映射
   * 输入: CognitionOutput + RiskData
   * 输出: Decision (action, confidence, guard...)
   */
  decide(cognitionOutput, riskData) {
    return this.control.process(cognitionOutput, riskData);
  }

  /**
   * 完整流程：认知 + 决策
   */
  async think(input) {
    const cognition = await this.cognize(input);
    const decision = this.decide(cognition, input.risk);
    return { cognition, decision };
  }
}
```

**注意 `cognize` 是 async（调用 LLM），`decide` 是同步的（纯规则映射）。**

---

## 五、文件结构

```
ai-server/src/
├── brain/
│   ├── GaleonBrain.js                 # 主入口
│   │
│   ├── engine/                        # 认知引擎
│   │   ├── CognitionEngine.js         # LLM 认知
│   │   ├── PromptBuilder.js           # Prompt 拼装
│   │   └── OutputParser.js            # 输出解析
│   │
│   ├── control/                       # 控制系统
│   │   ├── ControlSystem.js           # 控制主入口
│   │   ├── SchemaValidator.js         # 格式校验
│   │   ├── ConsistencyChecker.js      # 逻辑一致性
│   │   ├── RiskGuard.js               # 风控红线
│   │   ├── DecisionMapper.js          # 决策映射规则
│   │   └── StabilityController.js     # 稳定性控制
│   │
│   ├── knowledge/                     # 知识体系
│   │   ├── patterns/                  # 模式定义 JSON
│   │   ├── rules/                     # 认知规则 JSON
│   │   └── KnowledgeRetriever.js      # RAG 检索
│   │
│   ├── memory/                        # 经验记忆
│   │   ├── working.json               # 短期记忆
│   │   ├── long_term/                 # 长期记忆
│   │   │   ├── pattern_stats.json
│   │   │   ├── success_cases.jsonl
│   │   │   └── failure_cases.jsonl
│   │   ├── context/                   # 情境记忆
│   │   └── MemoryManager.js           # 读写管理
│   │
│   ├── prompts/                       # Prompt 模板
│   │   ├── system.js
│   │   ├── cognition.js
│   │   └── schemas/
│   │       └── cognition-schema.json
│   │
│   └── config/
│       ├── brain-config.js            # 模型选择/temperature
│       └── risk-thresholds.js         # 风控阈值
│
├── pipeline/
│   └── DataPipeline.js                # 数据采集标准化
│
├── orchestrator/
│   ├── Orchestrator.js                # 主编排
│   ├── TokenScanner.js                # 标的扫描
│   └── FeedbackCollector.js           # 反馈收集
│
├── execution/
│   └── ExecutionLayer.js              # 执行层封装
│
└── tasks/
    └── brainTask.js                   # 定时任务入口
```

---

## 六、和现有系统的关系

```
新增模块                    复用现有 Service
─────────                  ──────────────
DataPipeline.collect()  →  DexScreenerService
                           SintralDataService
                           BinanceAlphaService
                           BinanceMarketRankService
                           SecurityMonitorService
                           TwitterSignal/*

ExecutionLayer.execute() →  AutoTradeService
                           BatchExecutor
                           DEXAggregatorService
                           ExitMonitor
                           PriceWatcher

CognitionEngine.analyze() → ClaudeService
                            deepseekService
                            (备用) openaiService
```

**不改任何现有 Service。新增模块封装它们。**

---

## 七、和 AlphaMarketAnalyzer 的过渡

```
Phase 1: 并行运行
  ┌─ AlphaMarketAnalyzer（每小时）→ alpha_signals → paper-trader A
  └─ Brain（每小时）             → brain_decisions → paper-trader B
  对比 A 和 B 的表现

Phase 2: 切换
  Brain 表现 > AlphaMarketAnalyzer → 切换到 Brain
  AlphaMarketAnalyzer 降级为 DataPipeline 的数据源之一

Phase 3: 退役
  Brain 完全接管
```

---

## 八、调度频率

| 任务 | 频率 | 说明 |
|------|------|------|
| Brain 分析 Alpha tokens | 每小时 | 和 alphaMonitorTask 同步 |
| 短期记忆更新 | 每次决策后 | 实时 |
| 反馈回收 | 交易完成后 | 事件驱动 |
| 长期记忆更新 | 每天凌晨 | 汇总昨天的判断结果 |
| 风控阈值调整 | 每周 | 基于 pattern_stats |
| Prompt 优化 | 每周 | 基于学习报告 |

---

## 九、API 服务化设计

Brain 的 Input/Output 已经是标准化 JSON，天然具备做 API 服务的条件。

### 9.1 两种服务模式

```
模式 A: Cognition API（认知即服务）
  客户传入数据 → Brain 返回认知结果（state + scenarios）
  客户自己做决策
  Brain 只卖"看懂市场"的能力

模式 B: Decision API（决策即服务）
  客户传入数据 → Brain 返回完整决策（action + guard）
  客户直接拿去执行
  Brain 卖"该不该做"的判断
```

**模式 A 价值更大、风险更低。** 因为：
- 认知是 Brain 的核心竞争力（LLM + 知识 + 经验）
- 决策规则每个客户可能不同（风险偏好不同）
- 不为客户的执行结果负责

模式 B 是增值服务，可以在模式 A 之上叠加。

### 9.2 API 接口设计

```
POST /api/v1/brain/cognize
  输入: 标准化 Input JSON
  输出: CognitionOutput (market_state, token_stage, scenarios)
  用途: 客户只需要市场认知

POST /api/v1/brain/decide
  输入: 标准化 Input JSON + 可选的自定义风控参数
  输出: Decision (action, confidence, guard)
  用途: 客户需要完整决策

POST /api/v1/brain/feedback
  输入: decision_id + trade_result
  输出: feedback_report
  用途: 客户回传交易结果，提升自己的 Brain 实例准确率

GET /api/v1/brain/status
  输出: Brain 运行状态、版本、性能指标
```

### 9.3 多租户架构

```
内部使用（现在）:
  ┌──────────────────┐
  │  Galeon Brain     │  单实例
  │  知识: 共享       │
  │  记忆: 单一       │
  │  风控: 统一       │
  └──────────────────┘

API 服务（未来）:
  ┌──────────────────────────────────────────┐
  │              Brain Service                │
  │                                          │
  │  ┌────────────┐  共享层（所有租户共用）    │
  │  │ Knowledge   │  市场知识、模式定义       │
  │  │ Base        │  LLM 调用               │
  │  └────────────┘                          │
  │                                          │
  │  ┌────────────┐  租户 A                   │
  │  │ Memory A    │  自己的经验记忆           │
  │  │ Config A    │  自己的风控参数           │
  │  │ Stats A     │  自己的表现统计           │
  │  └────────────┘                          │
  │                                          │
  │  ┌────────────┐  租户 B                   │
  │  │ Memory B    │  自己的经验记忆           │
  │  │ Config B    │  自己的风控参数           │
  │  │ Stats B     │  自己的表现统计           │
  │  └────────────┘                          │
  └──────────────────────────────────────────┘
```

**共享什么，隔离什么：**

| 层 | 共享/隔离 | 原因 |
|----|---------|------|
| Knowledge Base | 共享 | 市场知识是通用的 |
| LLM 调用 | 共享 | 认知引擎是通用的 |
| Prompt 模板 | 共享（基础版）+ 隔离（自定义） | 基础认知能力共享，高级客户可以定制 |
| 经验记忆 | 隔离 | 我的经验不是你的经验 |
| 风控参数 | 隔离 | 每个客户风险偏好不同 |
| 决策映射规则 | 隔离（可选） | 高级客户可以自定义规则 |
| 表现统计 | 隔离 | 各自的胜率各自算 |

### 9.4 从内部到 API 的最小改动

当前代码已经具备的：
- `brain.think(input)` — 标准化输入输出 ✓
- `cognize()` 和 `decide()` 分离 ✓
- Input/Output 都是 JSON ✓

做 API 只需要加：

```
1. 路由层
   routes/brainApiRoutes.js
   → POST /cognize, POST /decide, POST /feedback

2. 认证层
   middleware/brainApiAuth.js
   → API Key 验证, 租户识别

3. 租户上下文
   GaleonBrain 构造函数加 tenantId 参数
   Memory/Config 按 tenantId 隔离

4. 计费
   按调用次数计费（cognize 一次 = N credits）
   按决策次数计费（decide 一次 = M credits）
```

### 9.5 定价逻辑

```
免费层:
  • 100 次/天 cognize 调用
  • 只返回 market_state + token_stage
  • 不包含 scenarios 和 interpretation
  • 无记忆积累

基础版:
  • 1000 次/天
  • 完整 cognition output
  • 基础记忆（pattern_stats）
  • 默认风控参数

专业版:
  • 无限调用
  • 完整 cognition + decision
  • 完整记忆系统（经验积累）
  • 自定义风控参数
  • 自定义决策映射规则
  • 反馈闭环（Brain 为你持续学习）

企业版:
  • 独立 Brain 实例
  • 自定义知识库
  • 自定义 Prompt
  • 私有部署选项
```

### 9.6 竞争壁垒

Brain 作为 API 服务的护城河不是 LLM（谁都能调 Claude），而是：

```
1. 知识体系 — 结构化的 Web3 市场知识，持续积累
2. 经验记忆 — 越用越准，每次判断都在学习
3. 控制系统 — 经过实战验证的风控规则和决策映射
4. 反馈闭环 — Brain 能从用户的交易结果中学习

用得越久，Brain 越懂这个市场。
别人的 LLM 调用只是"猜"，Brain 是在"判断"。
```

---

## 十、一句话

**LLM 输出 state + scenarios，Control System 把 state 映射成 action，Orchestrator 把 action 路由到 Execution。** 每一步都确定、可控、可回放。

**未来作为 API 服务：卖认知能力（Cognition API），不卖 LLM 调用。Knowledge + Memory + Control = 护城河。**

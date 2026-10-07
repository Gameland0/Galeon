# Galeon Brain 规格说明（v1）

> 2026-04-28 设计审查备注：当前文档与 architecture/system-design 中存在动作集合、Decision Layer 职责、rug 风控动作等口径不一致。V1 实现时以 `docs/galeon-brain-design-review.md` 的收敛方案为准：新增 Market Context 感知层，覆盖宏观价格、社交/叙事热度、流动性环境；LLM 可输出非执行性的 `action_bias/trade_intent`，最终可执行 action 与仓位相关控制由 Control System 确定性映射。

## 0. 定义

Galeon Brain 是一个 LLM 驱动的市场认知系统 + 结构化决策控制系统。

**职责：**
- 理解市场（state）
- 推演路径（scenario）
- 输出受控决策（action）

**不负责：**
- 原始数据采集（由 data pipeline 完成）
- 直接执行交易（由 execution 层完成）

**核心设计原则：**
- LLM 只负责认知，禁止输出 buy/sell/仓位/策略
- 决策由 Control System 通过确定性规则映射完成
- 风控优先级最高，不可覆盖
- 所有行为可回放、可审计

---

## 1. 总体架构

```
[Input Pipeline]
→ [Knowledge System]
→ [Memory System]
→ [Cognition Engine (LLM)]
→ [Control System]
→ [Decision Output]
→ [Execution Layer]
→ [Feedback Loop]
```

---

## 2. Input Pipeline（输入层）

### 2.1 输入类型

**链上数据（必选）**
- price
- market_cap
- liquidity
- volume_5m / 1h
- buy_sell_ratio
- holder_count
- top_holder_ratio
- smart_money_inflow
- wallet_activity_score

**风险数据（必选）**
- honeypot_flag
- contract_risk_score
- liquidity_lock_ratio
- rug_score

**社交数据（可选但建议）**
- mention_count
- sentiment_score
- KOL_score
- hype_velocity

**历史特征（内部）**
- factor_scores
- historical_pattern_id
- past_performance

### 2.2 输入标准格式

```json
{
  "token": "address",
  "chain": "BSC",
  "market": {
    "price": 0.00012,
    "liquidity": 54000,
    "volume_5m": 12000
  },
  "onchain": {
    "smart_money_inflow": 0.72,
    "holder_concentration": 0.65
  },
  "risk": {
    "rug_score": 0.18,
    "honeypot": false
  },
  "social": {
    "sentiment": 0.74,
    "hype_velocity": 0.62
  }
}
```

---

## 3. Knowledge System（知识体系）

### 3.1 要求

必须结构化，不能仅文本。

### 3.2 知识结构

```json
{
  "pattern": "early_breakout",
  "conditions": [
    "volume_increase",
    "liquidity_growth",
    "smart_money_inflow"
  ],
  "risk_level": "medium",
  "next_states": ["acceleration", "fake_breakout"]
}
```

### 3.3 注入方式

- system prompt（原则与规则）
- RAG（结构化知识检索）
- few-shot（典型案例）

---

## 4. Memory System（经验记忆）

### 4.1 短期记忆

```json
{
  "recent_decisions": [],
  "current_market_state": "risk_on"
}
```

### 4.2 长期记忆（必须量化）

```json
{
  "pattern": "distribution",
  "win_rate": 0.23,
  "avg_return": -0.34,
  "rug_rate": 0.41
}
```

### 4.3 情境记忆

```json
{
  "token": "XXX",
  "history": [
    "early_breakout",
    "entered_small",
    "liquidity_drop",
    "reduced"
  ]
}
```

---

## 5. Cognition Engine（认知引擎）

### 5.1 Prompt 结构

```
SYSTEM:
  - 市场认知规则
  - 风险优先原则

KNOWLEDGE:
  - pattern definitions

MEMORY:
  - 历史经验

INPUT DATA:
  - 当前市场数据

TASK:
  - 分析市场状态与路径

OUTPUT SCHEMA:
  - 固定 JSON
```

### 5.2 LLM 输出规范（禁止输出动作）

```json
{
  "market_state": "risk_on",
  "token_stage": "early_breakout",
  "interpretation": "...",
  "risk_signals": ["holder_concentration"],
  "confidence": 0.71,
  "scenarios": [
    {"path": "acceleration", "prob": 0.6},
    {"path": "distribution", "prob": 0.3},
    {"path": "rug", "prob": 0.1}
  ]
}
```

### 5.3 约束

LLM 不允许：
- 输出 buy/sell
- 输出仓位
- 输出策略

---

## 6. Control System（控制系统）

核心模块，决定系统是否可用。

### 6.1 格式校验

- JSON schema 验证
- 缺字段直接丢弃

### 6.2 逻辑一致性

- scenario 概率总和 = 1
- risk 与 action 不冲突

### 6.3 行为边界

允许动作：
```
enter_small
enter_full
wait
reduce
exit
block
```

### 6.4 风控红线（最高优先级）

```
if honeypot == true → block
if rug_score > 0.7 → exit
if liquidity < threshold → block
```

### 6.5 决策映射规则

```
if token_stage == "early_breakout"
and confidence > 0.65
and rug_score < 0.3
→ enter_small

if token_stage == "distribution"
→ reduce

if token_stage == "rug"
→ exit
```

### 6.6 稳定性控制

- temperature ≤ 0.3
- 多次采样（n=3）
- majority voting
- 决策冷却时间（cooldown）

---

## 7. Decision Output（最终输出）

```json
{
  "action": "enter_small",
  "confidence": 0.68,
  "risk_level": "medium",
  "position_size": 0.1,
  "reason": "...",
  "guard": {
    "stop_loss": -0.15,
    "kill_condition": "liquidity_drop_20%"
  }
}
```

---

## 8. Execution Layer（执行层）

由 Galeon 系统完成：
- swap
- 分批建仓
- 止盈止损
- 路由执行

---

## 9. Feedback System（反馈系统）

### 9.1 记录

- decision
- actual outcome
- pnl
- error type

### 9.2 更新

- pattern win_rate
- factor 权重
- risk threshold

---

## 10. 核心设计原则

1. LLM 只负责认知
2. 决策必须结构化
3. 风控优先级最高
4. 所有行为可回放
5. 系统必须稳定可控

---

## 11. MVP 范围（第一版）

**必须实现：**
- 输入标准化
- LLM 认知输出
- 基础决策映射
- 风控红线
- 简单执行接口

**可以后做：**
- 多模型融合
- 高级记忆系统
- 自适应权重

---

## 12. 最终定义

Galeon Brain 是一个"LLM 驱动的市场认知系统"，在严格风控与结构化决策约束下，将链上数据转化为可执行交易行为。

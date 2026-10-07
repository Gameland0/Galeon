# Galeon Brain Knowledge Base v1.0

> 从 283 万条 Alpha Token 信号 + 大盘数据中提取的市场规律。
> 数据范围：2025-10-23 至 2026-04-23，803 个 token。
> 所有胜率计算：HIT_TP / (HIT_TP + HIT_SL)，不含 EXPIRED。

---

## 1. 基线数据

| 信号类型 | 数量 | 胜率 | 说明 |
|---------|------|------|------|
| SHORT | 81,465 | **44.38%** | 最优 |
| LONG | 111,012 | 39.11% | 中等 |
| BUY | 139,250 | 38.24% | 中等 |
| NEUTRAL | 2,392,097 | 19.49% | 垃圾信号，不可用 |
| SELL | 106,637 | 5.57% | 极差，不可用 |

**结论：Brain 只关注 LONG / SHORT / BUY 信号。NEUTRAL 和 SELL 直接过滤。**

---

## 2. Confidence 评分（重大发现：评分逻辑是反的）

### LONG 信号

| Confidence | 胜率 | 判断 |
|-----------|------|------|
| below_50 | **44.24%** | 最高 |
| 50-60 | 39.42% | |
| 60-70 | 38.83% | |
| 70-80 | 33.40% | |
| 80-100 | **16.48%** | 最低 |

### SHORT 信号

| Confidence | 胜率 |
|-----------|------|
| below_50 | **48.28%** |
| 60-70 | 46.00% |
| 50-60 | 42.70% |
| 70-80 | 36.27% |
| 80-100 | **29.42%** |

### BUY 信号

| Confidence | 胜率 |
|-----------|------|
| below_50 | **86.97%** |
| 50-60 | 46.75% |
| 60-70 | 32.58% |
| 80-100 | 27.89% |
| 70-80 | **13.46%** |

**结论：AlphaMarketAnalyzer 的 Confidence 评分与实际胜率负相关。Confidence 越高越亏。Brain 不能依赖此评分，必须自己判断。这是 Brain 需要纠正现有规则引擎的第一个问题。**

---

## 3. 大盘环境（BTC 24h 变化 vs 胜率）

### LONG 信号

| BTC 环境 | 胜率 | 数据量 |
|---------|------|-------|
| BTC 温和上涨 (0~3%) | **39.72%** | 36,068 |
| BTC 温和下跌 (0~-3%) | 39.35% | 35,639 |
| BTC 强涨 (>3%) | 37.52% | 11,268 |
| BTC 强跌 (<-3%) | **35.99%** | 4,623 |

### SHORT 信号

| BTC 环境 | 胜率 | 数据量 |
|---------|------|-------|
| BTC 温和下跌 | **46.14%** | 26,092 |
| BTC 强跌 | 45.20% | 8,327 |
| BTC 温和上涨 | 42.08% | 20,605 |
| BTC 强涨 | **41.57%** | 4,876 |

### BUY 信号

| BTC 环境 | 胜率 | 数据量 |
|---------|------|-------|
| BTC 强涨 | **49.98%** | 9,521 |
| BTC 强跌 | 37.93% | 5,204 |
| BTC 温和上涨 | 37.49% | 38,549 |
| BTC 温和下跌 | **35.68%** | 31,688 |

**结论：**
- **LONG 对 BTC 环境不太敏感**（35-40% 波动范围小）
- **SHORT 在 BTC 下跌时显著更强**（46% vs 42%）
- **BUY 在 BTC 强涨时最好**（50%），但在温和跌时最差（36%）

---

## 4. BTC-ETH 联动（预判能力核心）

### LONG 信号

| BTC-ETH 关系 | 胜率 | 说明 |
|-------------|------|------|
| BTC+ETH 同步 (aligned) | **41.5%** | 最安全 |
| ETH 领涨 (eth_leading) | 36-39% | 中等 |
| ETH 落后 (eth_lagging) | **28-35%** | 危险！ |

### SHORT 信号

| BTC-ETH 关系 | 胜率 |
|-------------|------|
| ETH 落后 (eth_lagging) | **52-54%** | 最强 |
| ETH 领涨 (eth_leading) | 44-49% |
| BTC+ETH 同步 (aligned) | 39-47% |

**结论：ETH 落后于 BTC 是关键预警信号。**
- ETH lagging 时做多危险（LONG 仅 28-35%）
- ETH lagging 时做空最优（SHORT 52-54%）
- **Brain 预判规则：当 ETH 变化率 < BTC 变化率 - 2% 时，降低 LONG 信心，提升 SHORT 信心**

---

## 5. BTC 波动强度

### LONG 信号

| BTC 状态 | 胜率 |
|---------|------|
| 平稳 (0-1%) | 40-41% |
| 正常 (1-3%) | 38-39% |
| 强烈 (3-5%) | 37-39% |
| 极端下跌 (>5%) | **25.65%** ← 极差 |

### SHORT 信号

| BTC 状态 | 胜率 |
|---------|------|
| 强烈下跌 | **48.71%** |
| 正常下跌 | 46.48% |
| 平稳 | 44-46% |
| 极端下跌 | 39.70% |

### BUY 信号

| BTC 状态 | 胜率 |
|---------|------|
| 极端上涨 (>5%) | **54.25%** ← 最优 |
| 强烈上涨 | 47.58% |
| 极端下跌 | 45.30% |
| 平稳 | 34-35% |

**结论：**
- **BTC 极端下跌时禁止 LONG**（胜率仅 26%）
- **BTC 极端上涨时 BUY 最优**（胜率 54%）
- **BTC 强烈下跌时 SHORT 最优**（胜率 49%）

---

## 6. 星期效应

### LONG 信号

| 星期 | 胜率 |
|------|------|
| 周一 | **43.90%** |
| 周二 | 42.07% |
| 周四 | 40.01% |
| 周三 | 39.88% |
| 周五 | 39.64% |
| 周日 | 35.69% |
| 周六 | **31.73%** |

### SHORT 信号

| 星期 | 胜率 |
|------|------|
| 周日 | **49.84%** |
| 周六 | 49.52% |
| 周四 | 45.60% |
| 周三 | 45.08% |
| 周一 | 43.48% |
| 周二 | 40.67% |
| 周五 | **37.69%** |

**结论：**
- **周末 LONG 最差（32-36%），SHORT 最好（50%）** — 周末市场偏空
- **周一 LONG 最好（44%）** — 周一开盘效应
- **Brain 预判规则：周末降低 LONG 信心，提升 SHORT 信心**

---

## 7. 月度市场周期

| 月份 | LONG 胜率 | SHORT 胜率 | BTC 平均变化 | 市场状态 |
|------|----------|-----------|------------|---------|
| 2025-10 | 34.71% | **51.78%** | -0.57% | 偏空 |
| 2025-11 | 27.15% | **49.12%** | -1.38% | 强空 |
| 2025-12 | 20.72% | 41.24% | -0.12% | 混乱 |
| 2026-01 | 34.75% | **51.34%** | -0.50% | 偏空 |
| 2026-02 | 37.02% | 46.41% | -1.08% | 偏空 |
| 2026-03 | **45.02%** | 45.04% | 0.29% | 均衡 |
| 2026-04 | **47.21%** | 35.19% | 0.65% | 偏多 |

**结论：**
- **LONG 胜率从 11 月 27% 逐步恢复到 4 月 47%** — 市场在转暖
- **SHORT 胜率从 10 月 52% 下降到 4 月 35%** — 做空机会在减少
- **Brain 需要识别市场周期，动态调整 LONG/SHORT 偏好**

---

## 8. Token 两极分化

### 100% 胜率 Token（持续趋势型）

ALON（528 次，174 天活跃）、APX（322 次，171 天）、BTGUSDT（2542 次，163 天）等

### 0% 胜率 Token（纯陷阱型）

FLUID（627 次，0 天活跃）、ALCH（282 次，1 天）、BANK（144 次，1 天）等

**结论：**
- **活跃天数极短（0-1天）的 token 大概率是陷阱**
- **持续活跃（>100天）且胜率高的 token 有持续趋势**
- **Brain 应该跟踪 token 的历史胜率，对新 token 或短命 token 提高风险权重**

---

## 9. 数据质量问题

以下字段在 283 万条数据中基本为空，不可用：

| 字段 | 覆盖率 | 说明 |
|------|--------|------|
| smart_money_direction | 0.01% | 几乎全部 unknown |
| social_hype_score | 0% | 全部 no_data |
| liquidity_usd | 0% | 全部 no_data |

**Brain V1 不能依赖这三个字段。需要从其他数据源补充。**

> 2026-04-28 补充：`social_hype_score` 在历史训练库中覆盖率为 0%，不代表社交/叙事环境不重要，而是说明当前数据管线缺失这类信号。V1 设计应新增 Market Context 层，将社交媒体热度、叙事扩散、KOL 质量、bot/promo 风险、社交与链上行为是否一致作为独立输入，并记录数据覆盖率与可信度。缺数据时必须输出 `data_available=false`，不能让 LLM 猜测。

---

## 10. Brain Control System 初版规则（数据驱动）

基于以上统计，Control System 的决策映射规则：

### 风控红线（最高优先级）

```
if honeypot == true → block
if rug_score > 0.7 → block
if signal_type IN ('NEUTRAL', 'SELL') → block
if btc_change_24h < -5% AND signal_type == 'LONG' → block (胜率仅 26%)
```

### 信号增强条件

```
if signal_type == 'SHORT' AND eth_lagging → confidence += 0.1 (胜率 52-54%)
if signal_type == 'BUY' AND btc_change_24h > 5% → confidence += 0.1 (胜率 54%)
if signal_type == 'LONG' AND weekday IN (Mon, Tue) → confidence += 0.05
if signal_type == 'SHORT' AND weekday IN (Sat, Sun) → confidence += 0.05
if btc_eth_aligned → confidence += 0.05 (LONG 41%)
```

### 信号降权条件

```
if signal_type == 'LONG' AND eth_lagging → confidence -= 0.15 (胜率 28-35%)
if signal_type == 'LONG' AND weekday IN (Sat, Sun) → confidence -= 0.1 (胜率 32%)
if signal_type == 'SHORT' AND btc_change_24h > 3% → confidence -= 0.05
if token_active_days < 2 → confidence -= 0.2 (高概率陷阱)
```

### 决策映射

```
if confidence >= 0.6 AND risk_level != 'high' → enter_small
if confidence >= 0.75 AND risk_level == 'low' → enter_full
if confidence < 0.4 → wait
if token_stage == 'distribution' → reduce
if token_stage == 'rug_danger' → exit
```

---

## 11. 对 AlphaMarketAnalyzer 的改进建议（Brain 反向指导）

Brain 从数据中发现的 AlphaMarketAnalyzer 问题：

| 问题 | 数据证据 | 改进建议 |
|------|---------|---------|
| Confidence 评分与胜率负相关 | high_conf 胜率 16-29%，low_conf 胜率 44-87% | 重新设计评分维度权重 |
| NEUTRAL 信号占 84% 但胜率仅 19% | 239 万条 NEUTRAL，大量噪音 | 提高 NEUTRAL 过滤阈值 |
| SELL 信号胜率仅 5.57% | 10.6 万条几乎全错 | 暂停 SELL 信号生成或重新设计逻辑 |
| 缺少大盘环境因子 | BTC 环境对胜率影响 5-15% | 加入 BTC/ETH 趋势作为打分因子 |
| 缺少星期效应因子 | 周末 LONG 差 12%，SHORT 好 12% | 加入星期权重 |
| 缺少 ETH-BTC 联动因子 | ETH lagging 时 LONG 胜率降 10%+ | 加入 ETH-BTC 联动判断 |

---

## 12. 数据来源

- **训练库**：`brain_training.signals`（283 万条，42 个字段）
- **大盘数据**：`brain_training.macro_klines`（BTC/ETH/BNB 小时 K 线，2025-10 至 2026-04）
- **统计表**：`brain_training.kb_*`（11 个维度的统计结果）
- **服务器**：184.168.123.133，MySQL brain_training 库

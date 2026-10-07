# Galeon Brain Design Review

Date: 2026-04-28

## Current State

The current workspace does not contain an implemented `brain/` or `ai-server/src/brain/` module. Galeon Brain exists as design documents only:

- `docs/galeon-brain-spec-v1.md`
- `docs/galeon-brain-architecture.md`
- `docs/galeon-brain-system-design.md`
- `docs/galeon-brain-knowledge-base.md`
- `docs/galeon-system-architecture.md`

No local Brain memory files were found. The documented memory system is still a target design, not runtime state.

## Main Logic Issues

### 1. LLM responsibility is inconsistent

`galeon-brain-spec-v1.md` says the LLM only handles cognition and must not output buy/sell, position, or strategy. It also says decisions are mapped by the deterministic Control System.

Other docs describe a `DecisionEngine` where the LLM participates in the final action decision. That creates an unsafe design ambiguity:

- If LLM can choose actions, the system becomes harder to backtest and constrain.
- If Control System chooses actions, the LLM should only output cognition, scenarios, evidence, and invalidation conditions.

**Revised V1 decision:** LLM may output a non-executable `action_bias` or `trade_intent` as part of its reasoning, but the executable `decision.action` and any position sizing must still be finalized by Control System.

This preserves the useful part of LLM judgment without letting the LLM directly control funds:

```json
{
  "cognition": {
    "market_state": "risk_on",
    "token_stage": "early_breakout",
    "action_bias": "constructive_wait",
    "trade_intent": "watch_for_entry",
    "confidence": 0.64
  },
  "decision": {
    "action": "wait",
    "finalized_by": "control_system"
  }
}
```

`action_bias` is allowed to express market judgment. `decision.action` is the only executable field.

### 1.1 Missing market context sensing

The original V1 flow is too token-centric. It reads token-level onchain, risk, and social data, but it lacks a first-class context layer.

Market context is not only BTC/ETH direction. It has at least three parts:

- Macro/price context: BTC, ETH, volatility, market-wide risk appetite.
- Social/narrative context: Twitter/X, Telegram, Discord, KOL propagation, narrative velocity, attention quality.
- Liquidity/flow context: CEX/DEX flow, sector rotation, stablecoin/liquidity expansion, broad alpha-token participation.

The knowledge-base analysis shows that performance changes heavily by macro regime:

- `BUY` performs much better during strong BTC up moves.
- `SHORT` performs better when BTC is weak or ETH lags BTC.
- `LONG` is poor during extreme BTC drops and weak on weekends.
- Monthly regime shifted from short-favorable in late 2025 to more long-favorable by April 2026.

The system-design docs also already describe social signal quality as important: real KOL reach, social heat versus onchain behavior, and narrative lifecycle. That should not be buried inside token cognition. It should be sensed before token-level judgment, because a token signal means different things when the whole market narrative is heating up versus when isolated spam is pumping one symbol.

So Brain needs a first-class `MarketContext` layer before token cognition. Without it, the Control System maps token signals in a vacuum.

**V1 decision:** add a Market Context layer:

```text
MarketContextEngine
  -> MacroContextAnalyzer
  -> SocialContextAnalyzer
  -> LiquidityContextAnalyzer
  -> TokenCognitionEngine
  -> ScenarioReasoning
  -> ControlSystem
```

The context layer answers:

- Is the market in risk-on, risk-off, chop, panic, or euphoria?
- Are BTC and ETH aligned, or is ETH lagging?
- Is current volatility favorable for LONG, SHORT, BUY, or no-trade?
- Is this a weekday/weekend regime with different expected behavior?
- Is social attention expanding across the sector, or isolated to one token?
- Is social heat organic, KOL-driven, bot-like, or paid-promo-like?
- Is narrative velocity rising faster than liquidity and volume can support?
- Is there a social/onchain divergence that suggests fake hype?
- Should Brain lower its activity because the baseline edge is poor?

Example output:

```json
{
  "macro": {
    "regime": "risk_on",
    "btc_trend_24h": "strong_up",
    "eth_btc_relation": "aligned",
    "volatility_state": "expanding"
  },
  "social": {
    "narrative_heat": 0.74,
    "attention_velocity": 0.68,
    "kol_quality": 0.52,
    "organic_score": 0.61,
    "bot_risk": 0.18,
    "social_onchain_alignment": "aligned"
  },
  "liquidity": {
    "market_liquidity_state": "expanding",
    "alpha_participation": 0.57
  },
  "tradeability": 0.72,
  "preferred_signal_types": ["BUY", "LONG"],
  "blocked_signal_types": ["SELL", "NEUTRAL"],
  "notes": [
    "BUY historically improves in strong BTC up regimes",
    "social attention is broad and aligned with onchain activity"
  ]
}
```

Social context requires its own data-quality fields. If social data is missing or low confidence, the Brain must not hallucinate it:

```json
{
  "social": {
    "data_available": false,
    "coverage": 0,
    "confidence": 0,
    "missing_sources": ["twitter", "telegram", "discord"]
  }
}
```

### 2. Action vocabulary is split

The docs use two action sets:

- `enter_small | enter_full | wait | reduce | exit | block`
- `enter | wait | reduce | exit | block`

This will break downstream execution, paper trading, metrics, and feedback attribution.

**V1 decision:** use one action set:

```text
enter_small | enter_full | wait | reduce | exit | block
```

`enter` is too vague for a control system because size must be controlled before execution. `position_size` should not be invented by LLM; it should be derived by a deterministic sizing module from `enter_small` or `enter_full`.

### 3. Stage vocabulary is inconsistent

The docs use both `rug` and `rug_danger`, and also mix `token_stage`, `asset_phase`, `market_state`, and `market_context`.

**V1 decision:**

- Use `token_stage` for token lifecycle.
- Use `market_state` for broad market context.
- Use `rug_danger`, not `rug`, as the stage name. `rug` is an event/outcome, while `rug_danger` is a pre-trade state.

### 4. Risk redlines conflict

One doc says:

```text
if rug_score > 0.7 -> exit
```

The knowledge-base rules say:

```text
if rug_score > 0.7 -> block
```

Both can be correct only if the system knows whether there is an active position. Current decision mapping does not include position state, so `exit` may be emitted for a token that is not held.

**V1 decision:**

```text
if honeypot == true -> block
if rug_score > 0.7 and has_position == true -> exit
if rug_score > 0.7 and has_position == false -> block
if liquidity < threshold and has_position == true -> exit
if liquidity < threshold and has_position == false -> block
```

Control System must receive `portfolio.has_position` or equivalent context.

### 5. Input schema is missing features used by rules

The knowledge-base rules reference fields that are not in the standard input schema:

- `signal_type`
- `btc_change_24h`
- `eth_change_24h`
- `weekday`
- `token_active_days`
- `btc_eth_aligned`
- `eth_lagging`

**V1 decision:** either add these to the normalized input or remove them from Control System rules. For Brain V1, add them under explicit namespaces:

```json
{
  "source_signal": {
    "type": "LONG",
    "confidence": 0.52
  },
  "macro": {
    "btc_change_24h": 0.031,
    "eth_change_24h": 0.018,
    "btc_eth_aligned": true,
    "eth_lagging": false
  },
  "token_meta": {
    "active_days": 12
  },
  "time": {
    "weekday": "Tue"
  },
  "portfolio": {
    "has_position": false
  }
}
```

The normalized input should now distinguish context from token data:

```json
{
  "context": {
    "macro": {
      "btc_change_24h": 0.031,
      "eth_change_24h": 0.018,
      "eth_btc_spread_24h": -0.013,
      "market_regime": "risk_on",
      "volatility_state": "normal",
      "weekday": "Tue"
    },
    "social": {
      "narrative_heat": 0.74,
      "attention_velocity": 0.68,
      "kol_quality": 0.52,
      "organic_score": 0.61,
      "bot_risk": 0.18,
      "source_coverage": {
        "twitter": 0.7,
        "telegram": 0.4,
        "discord": 0.2
      }
    },
    "liquidity": {
      "market_liquidity_state": "expanding",
      "alpha_participation": 0.57
    }
  },
  "token": {},
  "risk": {},
  "portfolio": {}
}
```

### 6. Memory design is underspecified for feedback

The docs define working, long-term, and token context memory, but not the write contract after each Brain run.

**V1 decision:** every `think()` call writes a lightweight immutable case record:

```json
{
  "case_id": "uuid",
  "timestamp": 1777382400,
  "token": "LAB",
  "input_hash": "sha256",
  "cognition": {},
  "decision": {},
  "control_overrides": [],
  "prompt_version": "brain-v1",
  "model": "provider/model",
  "outcome": null
}
```

Feedback later updates `outcome` or writes a linked outcome record. This avoids mutating the original decision record and keeps auditability.

### 7. Stability control is unclear

The docs mention `n=3` and majority voting. That only makes sense for LLM cognition fields, not final actions if actions are deterministic.

**V1 decision:**

- Run one LLM call by default.
- Retry only on schema failure.
- Optional `n=3` consensus can be added later for high-value decisions.
- Majority voting should compare `token_stage`, `market_state`, and dominant scenario, not final action.

### 8. Low win rate means no-trade must be a core capability

The knowledge base does not show a strong universal edge. Many raw signal groups are below 50% win rate, and `NEUTRAL`/`SELL` are structurally poor in the current dataset.

This means Brain should not be designed as a machine that always converts signals into trades. Its first job is to filter bad environments and bad signal classes.

**V1 decision:** add an explicit `no_trade` policy before entry mapping:

```text
if context.tradeability < 0.45 -> wait
if source_signal.type in ["NEUTRAL", "SELL"] -> block
if signal edge is not above baseline after environment adjustment -> wait
if confidence is high only because AlphaMarketAnalyzer says high -> do not boost
```

Winning may come more from avoiding low-quality trades than from finding a single magic pattern.

## Recommended V1 Flow

```text
InputNormalizer
  -> MarketContextEngine
  -> KnowledgeRetriever
  -> MemoryRetriever
  -> CognitionEngine (LLM JSON only)
  -> OutputParser + SchemaValidator
  -> ConsistencyChecker
  -> ControlSystem
     -> RiskGuard
     -> ConfidenceAdjuster
     -> DecisionMapper
     -> CooldownGuard
  -> BrainDecision
  -> MemoryManager.appendCase()
```

## V1 Output Contract

```json
{
  "token": "LAB",
  "timestamp": 1777382400,
  "context": {
    "macro_regime": "risk_on",
    "social_regime": "organic_attention_expanding",
    "social_onchain_alignment": "aligned",
    "tradeability": 0.72,
    "preferred_signal_types": ["BUY", "LONG"],
    "blocked_signal_types": ["SELL", "NEUTRAL"]
  },
  "cognition": {
    "market_state": "risk_on",
    "token_stage": "early_breakout",
    "action_bias": "constructive_wait",
    "interpretation": "...",
    "risk_signals": ["holder_concentration"],
    "confidence": 0.71,
    "scenarios": [
      {"path": "acceleration", "prob": 0.6},
      {"path": "distribution", "prob": 0.3},
      {"path": "rug_danger", "prob": 0.1}
    ]
  },
  "decision": {
    "action": "enter_small",
    "confidence": 0.66,
    "risk_level": "medium",
    "reason": "...",
    "guard": {
      "kill_condition": "liquidity_drop_20_percent"
    },
    "overridden": false,
    "override_reason": null
  }
}
```

## Implementation Order

1. Create `ai-server/src/brain` or decide the real backend repository location.
2. Implement schemas first: input, cognition output, final decision.
3. Implement `RiskGuard` and `DecisionMapper` before LLM integration.
4. Implement `CognitionEngine` with a mock LLM fixture so Control System can be tested.
5. Add memory append-only case logging.
6. Add feedback ingestion and outcome linking.

## Bottom Line

The core Brain concept is sound: LLM cognition plus deterministic control is the right architecture for a trading-related system.

The current design needs two corrections before coding:

1. Add first-class market context sensing, including macro, social/narrative, and liquidity context. Token signals cannot be judged without regime context.
2. Treat low baseline win rate as a product constraint. Brain should abstain often and only act when environment-adjusted edge is strong enough.

LLM can provide action bias and judgment, but executable action and position size must remain controlled, auditable, and overrideable.

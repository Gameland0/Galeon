# Galeon Brain — Module Architecture

> **Note:** This is the open-source showcase version. Core trading logic (thresholds, weights, rules) 
> has been redacted to protect proprietary strategy IP. The full system runs in production with 2,900+ 
> live trades executed.

## Module Overview

```
brain-runner.js          Entry point — signal ingestion, WebSocket streams, scan loop
GaleonBrain.js           Core orchestrator — think(), monitor(), verify(), evolve()
DataDrivenCognition.js   Rules engine — multi-dimensional analysis, stage detection, prediction
ControlSystem.js         Decision gate — red-line checks, confidence adjustment, action mapping
RuleEvolver.js           Self-evolution — auto-tune parameters from trade outcomes
BrainLearning.js         Learning loop — attribution, calibration, report generation
PaperTraderBridge.js     PT integration — read positions, trades, patterns from Paper Trader
ExperienceStore.js       Memory — store and retrieve per-token trading experiences
MarketContext.js         Macro context — BTC regime, market state classification
OIAnalyzer.js            Open Interest analysis — stage detection, trend classification
Thinker.js               LLM interface — prompt construction, response parsing
BrainLLMService.js       LLM API client — ChatGPT proxy with retry and fallback
```

## How to Run

The full system requires proprietary rule configurations not included in this repository.  
The backtest report (`backtest_report.html`) demonstrates verified results from live execution.

```bash
# Generate backtest report from trade data
node generate_backtest_html.js
```

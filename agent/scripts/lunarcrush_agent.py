#!/usr/bin/env python3
"""
LunarCrush Social Sentiment Agent for Galeon Brain
====================================================
Fetches BTC/ETH/SOL galaxy_score from LunarCrush API (free tier)
and pushes directional signals to the Galeon Brain fusion engine.

Setup:
  pip install requests

Run:
  python lunarcrush_agent.py

Required env vars (or edit the CONFIG below):
  LUNARCRUSH_API_KEY   — from lunarcrush.com (free account)
  GALEON_API_KEY       — from Galeon Brain "New Agent" modal
  GALEON_ENDPOINT      — e.g. http://localhost:3001/api/agents/push-intel
"""

import os
import time
import requests

# ─── CONFIG ────────────────────────────────────────────────────────────────────
LUNARCRUSH_API_KEY = os.environ.get("LUNARCRUSH_API_KEY", "YOUR_LUNARCRUSH_KEY")
GALEON_API_KEY     = os.environ.get("GALEON_API_KEY",     "YOUR_GALEON_API_KEY")
GALEON_ENDPOINT    = os.environ.get("GALEON_ENDPOINT",    "http://localhost:3001/api/agent/push-intel")

SYMBOLS = ["BTC", "ETH", "SOL"]   # coins to track
INTERVAL = 300                      # seconds between polls (LunarCrush free: 100 req/day)
# ───────────────────────────────────────────────────────────────────────────────

LUNARCRUSH_URL = "https://lunarcrush.com/api4/public/coins/list/v1"

# Map LunarCrush coin slugs → our symbols
def fetch_lunarcrush() -> dict:
    """Returns {symbol: {galaxy_score, alt_rank, sentiment, price_change_24h}}"""
    headers = {"Authorization": f"Bearer {LUNARCRUSH_API_KEY}"}
    resp = requests.get(LUNARCRUSH_URL, headers=headers, timeout=15)
    resp.raise_for_status()
    data = resp.json().get("data", [])

    result = {}
    for coin in data:
        sym = (coin.get("symbol") or "").upper()
        if sym in SYMBOLS:
            result[sym] = {
                "galaxy_score":     coin.get("galaxy_score") or 50,
                "alt_rank":         coin.get("alt_rank") or 500,
                "sentiment":        coin.get("sentiment") or 50,
                "price_change_24h": coin.get("percent_change_24h") or 0,
                "social_volume":    coin.get("social_volume_24h") or 0,
            }
    return result


def galaxy_to_signal(sym: str, metrics: dict) -> dict:
    """
    Convert LunarCrush metrics to a Galeon Brain signal.

    galaxy_score: 0-100
      >= 65  → BULLISH  (strong social momentum)
      35-64  → NEUTRAL
      <= 34  → BEARISH  (weak / declining sentiment)

    confidence: scaled from galaxy_score distance from neutral (50)
    """
    gs   = metrics["galaxy_score"]
    sent = metrics.get("sentiment") or 50   # fallback if not on free tier
    pc   = metrics.get("price_change_24h", 0)

    if gs >= 65:
        direction  = "BULLISH"
        confidence = min(90, 50 + int((gs - 65) * 2))
    elif gs <= 34:
        direction  = "BEARISH"
        confidence = min(90, 50 + int((34 - gs) * 2))
    else:
        direction  = "NEUTRAL"
        confidence = 40

    # Sentiment nudge: if sentiment score available, add ±5
    if sent > 60 and direction == "BULLISH":
        confidence = min(90, confidence + 5)
    elif sent < 40 and direction == "BEARISH":
        confidence = min(90, confidence + 5)

    reasoning = (
        f"LunarCrush galaxy_score={gs}/100, "
        f"sentiment={sent}% positive, "
        f"24h price change={pc:+.1f}%"
    )

    return {
        "symbol":     sym,
        "direction":  direction,
        "confidence": confidence,
        "reasoning":  reasoning,
    }


def push_to_galeon(signal: dict) -> dict:
    headers = {
        "Authorization": f"Bearer {GALEON_API_KEY}",
        "Content-Type":  "application/json",
    }
    resp = requests.post(GALEON_ENDPOINT, headers=headers, json=signal, timeout=10)
    resp.raise_for_status()
    return resp.json()


def run():
    print(f"[LunarCrush Agent] Starting — polling every {INTERVAL}s")
    print(f"  Endpoint : {GALEON_ENDPOINT}")
    print(f"  Symbols  : {SYMBOLS}\n")

    cycle = 0
    while True:
        cycle += 1
        print(f"─── Cycle {cycle} ({time.strftime('%H:%M:%S')}) ───")
        try:
            metrics_map = fetch_lunarcrush()

            for sym in SYMBOLS:
                if sym not in metrics_map:
                    print(f"  [{sym}] not found in LunarCrush response, skipping")
                    continue

                signal = galaxy_to_signal(sym, metrics_map[sym])
                result = push_to_galeon(signal)

                gs = metrics_map[sym]["galaxy_score"]
                print(
                    f"  [{sym}] galaxy={gs:5.1f} → "
                    f"{signal['direction']:8s} conf={signal['confidence']}% "
                    f"→ accepted={result.get('accepted', '?')}"
                )

        except requests.exceptions.HTTPError as e:
            print(f"  HTTP error: {e.response.status_code} {e.response.text[:200]}")
        except Exception as e:
            print(f"  Error: {e}")

        print(f"  Sleeping {INTERVAL}s...\n")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    run()

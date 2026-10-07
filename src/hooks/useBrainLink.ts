/**
 * Brain Link React Hooks
 * Provides decision data, activity feed, and micro-execution state
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as brainLinkService from '../services/brainLinkService';
import type {
  BrainDecision,
  DecisionSummary,
  DecisionDetail,
  RiskAssessment,
  MicroPlan,
  TraderStats,
  BrainActivity,
  TimelineEntry,
  ChartCandle,
  ChartAnnotation,
} from '../services/brainLinkService';

/** Fetch all active decisions, auto-refresh */
export function useDecisions(refreshInterval = 15000) {
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const data = await brainLinkService.getAllDecisions();
      setDecisions(data);
    } catch (e) { console.error('Failed to fetch decisions:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const timer = setInterval(fetch, refreshInterval);
    return () => clearInterval(timer);
  }, [fetch, refreshInterval]);

  return { decisions, loading, refresh: fetch };
}

/** Fetch decision for a single asset */
export function useDecision(asset: string) {
  const [decision, setDecision] = useState<BrainDecision | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!asset) return;
    setLoading(true);
    brainLinkService.getDecision(asset)
      .then(setDecision)
      .catch(e => console.error(`Decision fetch failed for ${asset}:`, e))
      .finally(() => setLoading(false));
  }, [asset]);

  return { decision, loading };
}

/** Fetch detailed decision with voting breakdown */
export function useDecisionDetail(asset: string) {
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!asset) return;
    setLoading(true);
    brainLinkService.getDecisionDetail(asset)
      .then(setDetail)
      .catch(e => console.error(`Detail fetch failed for ${asset}:`, e))
      .finally(() => setLoading(false));
  }, [asset]);

  return { detail, loading };
}

/** Fetch decision timeline */
export function useDecisionTimeline(asset: string, limit = 10) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!asset) return;
    brainLinkService.getDecisionTimeline(asset, limit)
      .then(setTimeline)
      .catch(e => console.error(`Timeline fetch failed:`, e))
      .finally(() => setLoading(false));
  }, [asset, limit]);

  return { timeline, loading };
}

/** Risk assessment for a proposed trade */
export function useRiskAssessment() {
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [loading, setLoading] = useState(false);

  const assess = useCallback(async (walletAddress: string, asset: string, amount: number, direction?: string) => {
    setLoading(true);
    try {
      const result = await brainLinkService.assessRisk(walletAddress, asset, amount, direction);
      setAssessment(result);
      return result;
    } catch (e) {
      console.error('Risk assessment failed:', e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { assessment, loading, assess };
}

/** Micro-execution plan preview */
export function useMicroPlan(asset: string, amount: number, direction: string = 'LONG') {
  const [plan, setPlan] = useState<MicroPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!asset || !amount) return;
    brainLinkService.getMicroPlan(asset, amount, direction)
      .then(setPlan)
      .catch(e => console.error('Micro plan fetch failed:', e))
      .finally(() => setLoading(false));
  }, [asset, amount, direction]);

  return { plan, loading };
}

/** Chart data with Brain annotations */
export function useChartData(asset: string, interval = '1h') {
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!asset) return;
    brainLinkService.getChartData(asset, interval)
      .then(data => {
        setCandles(data.candles || []);
        setAnnotations(data.annotations || []);
      })
      .catch(e => console.error('Chart fetch failed:', e))
      .finally(() => setLoading(false));
  }, [asset, interval]);

  return { candles, annotations, loading };
}

/** Trader stats */
export function useTraderStats(address: string) {
  const [stats, setStats] = useState<TraderStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    brainLinkService.getTraderStats(address)
      .then(setStats)
      .catch(e => console.error('Trader stats failed:', e))
      .finally(() => setLoading(false));
  }, [address]);

  return { stats, loading };
}

/** Brain activity feed, auto-refresh */
export function useBrainActivity(refreshInterval = 5000) {
  const [activities, setActivities] = useState<BrainActivity[]>([]);
  const lastTimestamp = useRef(0);

  const fetch = useCallback(async () => {
    try {
      const data = await brainLinkService.getActivity(30, lastTimestamp.current);
      if (data.length > 0) {
        lastTimestamp.current = data[0].timestamp;
        setActivities(prev => {
          const merged = [...data, ...prev].slice(0, 50);
          return merged;
        });
      }
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    fetch();
    const timer = setInterval(fetch, refreshInterval);
    return () => clearInterval(timer);
  }, [fetch, refreshInterval]);

  return { activities };
}

/** Learning evolution data */
export function useLearningEvolution() {
  const [evolution, setEvolution] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    brainLinkService.getLearningEvolution()
      .then(setEvolution)
      .catch(e => console.error('Learning evolution failed:', e))
      .finally(() => setLoading(false));
  }, []);

  return { evolution, loading };
}

/**
 * Intelligence Buffer — In-memory store for agent intelligence events
 *
 * Stores FIP intelligence keyed by symbol. Auto-expires stale entries.
 * Each agent can have at most one active intel per symbol (latest wins).
 */

import { AgentIntelligence } from './fip-types';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class IntelBuffer {
  /** symbol → agentId → latest intelligence */
  private buffer = new Map<string, Map<string, AgentIntelligence>>();

  /**
   * Submit intelligence from an agent. Replaces any prior intel
   * from the same agent for the same symbol.
   */
  submit(intel: AgentIntelligence): void {
    const sym = intel.symbol.toUpperCase();
    if (!this.buffer.has(sym)) this.buffer.set(sym, new Map());
    this.buffer.get(sym)!.set(intel.agentId, intel);
  }

  /**
   * Get all non-expired intelligence for a symbol.
   */
  getForSymbol(symbol: string): AgentIntelligence[] {
    const sym = symbol.toUpperCase();
    const map = this.buffer.get(sym);
    if (!map) return [];

    const now = Date.now();
    const results: AgentIntelligence[] = [];
    for (const [agentId, intel] of map) {
      const expiry = new Date(intel.expiresAt).getTime();
      if (expiry > now) {
        results.push(intel);
      } else {
        map.delete(agentId); // auto-clean expired
      }
    }
    return results;
  }

  /**
   * Get all symbols that have at least one non-expired intel entry.
   */
  getActiveSymbols(): string[] {
    const symbols: string[] = [];
    for (const [sym] of this.buffer) {
      if (this.getForSymbol(sym).length > 0) {
        symbols.push(sym);
      }
    }
    return symbols;
  }

  /**
   * Prune all expired entries across all symbols.
   */
  prune(): number {
    let pruned = 0;
    const now = Date.now();
    for (const [sym, map] of this.buffer) {
      for (const [agentId, intel] of map) {
        if (new Date(intel.expiresAt).getTime() <= now) {
          map.delete(agentId);
          pruned++;
        }
      }
      if (map.size === 0) this.buffer.delete(sym);
    }
    return pruned;
  }

  /**
   * Get all non-expired intel across all symbols (for dashboard display).
   */
  getAll(): AgentIntelligence[] {
    const all: AgentIntelligence[] = [];
    for (const sym of this.buffer.keys()) {
      all.push(...this.getForSymbol(sym));
    }
    return all;
  }

  /** Total non-expired entries */
  get size(): number {
    return this.getAll().length;
  }

  /**
   * Create default expiry timestamp from now.
   */
  static defaultExpiry(fromISO?: string): string {
    const base = fromISO ? new Date(fromISO).getTime() : Date.now();
    return new Date(base + DEFAULT_TTL_MS).toISOString();
  }
}

/**
 * Galeon Agent Trust Registry — NEAR Smart Contract
 *
 * Stores on-chain trust scores for external AI trading agents.
 * Any protocol on NEAR can query these scores to decide whether to adopt an agent.
 *
 * Trust lifecycle: PROBATION → VALIDATED → TRUSTED → SUSPENDED
 *
 * Only the registry owner (Galeon Brain operator) can update scores.
 * Anyone can read scores (view functions).
 */

import {
  NearBindgen,
  near,
  call,
  view,
  initialize,
  UnorderedMap,
  LookupMap,
  assert,
} from 'near-sdk-js';

// ─── Types ───────────────────────────────────────────────────────────────────

class AgentTrustRecord {
  agent_id: string;
  name: string;
  state: string;           // PROBATION | VALIDATED | TRUSTED | SUSPENDED
  signal_count: number;
  evaluated_count: number;
  correct_count: number;
  accuracy: number;         // 0.0 - 1.0, -1 if not enough data
  anomaly_score: number;
  trust_multiplier: number; // 0.0 | 0.5 | 1.0
  registered_by: string;    // NEAR account that registered this agent
  registered_at: number;    // block timestamp (nanoseconds)
  updated_at: number;
  suspension_reason: string;

  constructor(init: Partial<AgentTrustRecord> = {}) {
    this.agent_id = init.agent_id || '';
    this.name = init.name || '';
    this.state = init.state || 'PROBATION';
    this.signal_count = init.signal_count || 0;
    this.evaluated_count = init.evaluated_count || 0;
    this.correct_count = init.correct_count || 0;
    this.accuracy = init.accuracy ?? -1;
    this.anomaly_score = init.anomaly_score || 0;
    this.trust_multiplier = init.trust_multiplier || 0;
    this.registered_by = init.registered_by || '';
    this.registered_at = init.registered_at || 0;
    this.updated_at = init.updated_at || 0;
    this.suspension_reason = init.suspension_reason || '';
  }
}

class StateChangeEvent {
  agent_id: string;
  from_state: string;
  to_state: string;
  reason: string;
  timestamp: number;

  constructor(init: Partial<StateChangeEvent> = {}) {
    this.agent_id = init.agent_id || '';
    this.from_state = init.from_state || '';
    this.to_state = init.to_state || '';
    this.reason = init.reason || '';
    this.timestamp = init.timestamp || 0;
  }
}

// ─── Contract ────────────────────────────────────────────────────────────────

@NearBindgen({})
class AgentTrustRegistry {
  owner: string = '';
  agents: UnorderedMap<string> = new UnorderedMap<string>('a');
  agent_ids: string[] = [];
  total_updates: number = 0;
  total_suspensions: number = 0;

  @initialize({})
  init({ owner }: { owner: string }): void {
    this.owner = owner;
  }

  // ── Write Functions (owner only) ──────────────────────────────────────────

  @call({})
  register_agent({
    agent_id,
    name,
  }: {
    agent_id: string;
    name: string;
  }): AgentTrustRecord {
    this.assert_owner();
    assert(!this.agents.get(agent_id), `Agent ${agent_id} already registered`);

    const record = new AgentTrustRecord({
      agent_id,
      name,
      state: 'PROBATION',
      signal_count: 0,
      accuracy: -1,
      anomaly_score: 0,
      trust_multiplier: 0,
      registered_by: near.predecessorAccountId(),
      registered_at: Number(near.blockTimestamp()),
      updated_at: Number(near.blockTimestamp()),
    });

    this.agents.set(agent_id, JSON.stringify(record));
    this.agent_ids.push(agent_id);

    near.log(`[REGISTER] Agent ${agent_id} (${name}) registered in PROBATION`);
    return record;
  }

  @call({})
  update_trust_score({
    agent_id,
    state,
    signal_count,
    evaluated_count,
    correct_count,
    anomaly_score,
    suspension_reason,
  }: {
    agent_id: string;
    state: string;
    signal_count: number;
    evaluated_count: number;
    correct_count: number;
    anomaly_score: number;
    suspension_reason?: string;
  }): AgentTrustRecord {
    this.assert_owner();

    const raw = this.agents.get(agent_id);
    assert(raw, `Agent ${agent_id} not found`);

    const record: AgentTrustRecord = JSON.parse(raw!);
    const old_state = record.state;

    // Update fields
    record.state = state;
    record.signal_count = signal_count;
    record.evaluated_count = evaluated_count;
    record.correct_count = correct_count;
    record.accuracy = evaluated_count > 0 ? correct_count / evaluated_count : -1;
    record.anomaly_score = anomaly_score;
    record.updated_at = Number(near.blockTimestamp());

    // Trust multiplier by state
    const multipliers: Record<string, number> = {
      PROBATION: 0,
      VALIDATED: 0.5,
      TRUSTED: 1.0,
      SUSPENDED: 0,
    };
    record.trust_multiplier = multipliers[state] ?? 0;

    if (suspension_reason) {
      record.suspension_reason = suspension_reason;
    }

    if (state === 'SUSPENDED' && old_state !== 'SUSPENDED') {
      this.total_suspensions += 1;
    }

    this.agents.set(agent_id, JSON.stringify(record));
    this.total_updates += 1;

    // Emit event log (NEP-297 standard)
    if (old_state !== state) {
      const event = {
        standard: 'galeon-trust',
        version: '1.0.0',
        event: 'state_change',
        data: [{
          agent_id,
          from_state: old_state,
          to_state: state,
          reason: suspension_reason || `Transition ${old_state} → ${state}`,
          signal_count,
          accuracy: record.accuracy,
          timestamp: Number(near.blockTimestamp()).toString(),
        }],
      };
      near.log(`EVENT_JSON:${JSON.stringify(event)}`);
    }

    near.log(`[UPDATE] Agent ${agent_id}: ${old_state} → ${state}, signals=${signal_count}, accuracy=${record.accuracy.toFixed(3)}`);
    return record;
  }

  @call({})
  remove_agent({ agent_id }: { agent_id: string }): void {
    this.assert_owner();
    assert(this.agents.get(agent_id), `Agent ${agent_id} not found`);
    this.agents.remove(agent_id);
    this.agent_ids = this.agent_ids.filter(id => id !== agent_id);
    near.log(`[REMOVE] Agent ${agent_id} removed from registry`);
  }

  @call({})
  transfer_ownership({ new_owner }: { new_owner: string }): void {
    this.assert_owner();
    near.log(`[OWNERSHIP] Transferred from ${this.owner} to ${new_owner}`);
    this.owner = new_owner;
  }

  // ── View Functions (public) ───────────────────────────────────────────────

  @view({})
  get_agent({ agent_id }: { agent_id: string }): AgentTrustRecord | null {
    const raw = this.agents.get(agent_id);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  @view({})
  get_all_agents(): AgentTrustRecord[] {
    return this.agent_ids
      .map(id => {
        const raw = this.agents.get(id);
        return raw ? JSON.parse(raw) as AgentTrustRecord : null;
      })
      .filter((r): r is AgentTrustRecord => r !== null);
  }

  @view({})
  get_agents_by_state({ state }: { state: string }): AgentTrustRecord[] {
    return this.get_all_agents().filter(a => a.state === state);
  }

  @view({})
  get_trusted_agents(): AgentTrustRecord[] {
    return this.get_all_agents().filter(a =>
      a.state === 'TRUSTED' || a.state === 'VALIDATED'
    );
  }

  @view({})
  get_registry_stats(): {
    total_agents: number;
    probation: number;
    validated: number;
    trusted: number;
    suspended: number;
    total_updates: number;
    total_suspensions: number;
    owner: string;
  } {
    const all = this.get_all_agents();
    return {
      total_agents: all.length,
      probation: all.filter(a => a.state === 'PROBATION').length,
      validated: all.filter(a => a.state === 'VALIDATED').length,
      trusted: all.filter(a => a.state === 'TRUSTED').length,
      suspended: all.filter(a => a.state === 'SUSPENDED').length,
      total_updates: this.total_updates,
      total_suspensions: this.total_suspensions,
      owner: this.owner,
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private assert_owner(): void {
    assert(
      near.predecessorAccountId() === this.owner,
      `Only owner (${this.owner}) can call this method`
    );
  }
}

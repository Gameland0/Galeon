///
/// Galeon Agent Trust Registry — NEAR Smart Contract
///
/// Stores on-chain trust scores for external AI trading agents.
/// Any protocol on NEAR can query these scores to decide whether to adopt an agent.
///
/// Trust lifecycle: PROBATION → VALIDATED → TRUSTED → SUSPENDED
///

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::store::UnorderedMap;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, log, near_bindgen, require, AccountId, PanicOnDefault};

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct AgentTrustRecord {
    pub agent_id: String,
    pub name: String,
    pub state: String,
    pub signal_count: u64,
    pub evaluated_count: u64,
    pub correct_count: u64,
    pub accuracy: f64,
    pub anomaly_score: u64,
    pub trust_multiplier: f64,
    pub registered_by: AccountId,
    pub registered_at: u64,
    pub updated_at: u64,
    pub suspension_reason: String,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RegistryStats {
    pub total_agents: u64,
    pub probation: u64,
    pub validated: u64,
    pub trusted: u64,
    pub suspended: u64,
    pub total_updates: u64,
    pub total_suspensions: u64,
    pub owner: AccountId,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct AgentTrustRegistry {
    owner: AccountId,
    agents: UnorderedMap<String, AgentTrustRecord>,
    total_updates: u64,
    total_suspensions: u64,
}

#[near_bindgen]
impl AgentTrustRegistry {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            agents: UnorderedMap::new(b"a"),
            total_updates: 0,
            total_suspensions: 0,
        }
    }

    // ── Write Functions (owner only) ────────────────────────────────────────

    pub fn register_agent(&mut self, agent_id: String, name: String) -> AgentTrustRecord {
        self.assert_owner();
        require!(
            self.agents.get(&agent_id).cloned().is_none(),
            format!("Agent {} already registered", agent_id)
        );

        let record = AgentTrustRecord {
            agent_id: agent_id.clone(),
            name: name.clone(),
            state: "PROBATION".to_string(),
            signal_count: 0,
            evaluated_count: 0,
            correct_count: 0,
            accuracy: -1.0,
            anomaly_score: 0,
            trust_multiplier: 0.0,
            registered_by: env::predecessor_account_id(),
            registered_at: env::block_timestamp(),
            updated_at: env::block_timestamp(),
            suspension_reason: String::new(),
        };

        self.agents.insert(agent_id.clone(), record.clone());
        log!("[REGISTER] Agent {} ({}) → PROBATION", agent_id, name);
        record
    }

    pub fn update_trust_score(
        &mut self,
        agent_id: String,
        state: String,
        signal_count: u64,
        evaluated_count: u64,
        correct_count: u64,
        anomaly_score: u64,
        suspension_reason: Option<String>,
    ) -> AgentTrustRecord {
        self.assert_owner();

        let mut record = self
            .agents
            .get(&agent_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str(&format!("Agent {} not found", agent_id)));

        let old_state = record.state.clone();

        record.state = state.clone();
        record.signal_count = signal_count;
        record.evaluated_count = evaluated_count;
        record.correct_count = correct_count;
        record.accuracy = if evaluated_count > 0 {
            correct_count as f64 / evaluated_count as f64
        } else {
            -1.0
        };
        record.anomaly_score = anomaly_score;
        record.updated_at = env::block_timestamp();

        record.trust_multiplier = match state.as_str() {
            "PROBATION" => 0.0,
            "VALIDATED" => 0.5,
            "TRUSTED" => 1.0,
            _ => 0.0,
        };

        if let Some(reason) = suspension_reason {
            record.suspension_reason = reason;
        }

        if state == "SUSPENDED" && old_state != "SUSPENDED" {
            self.total_suspensions += 1;
        }

        self.agents.insert(agent_id.clone(), record.clone());
        self.total_updates += 1;

        // NEP-297 event on state change
        if old_state != state {
            log!(
                "EVENT_JSON:{{\"standard\":\"galeon-trust\",\"version\":\"1.0.0\",\"event\":\"state_change\",\"data\":[{{\"agent_id\":\"{}\",\"from_state\":\"{}\",\"to_state\":\"{}\",\"signal_count\":{},\"accuracy\":{:.4}}}]}}",
                agent_id, old_state, state, signal_count, record.accuracy
            );
        }

        log!(
            "[UPDATE] {}: {} → {}, signals={}, accuracy={:.3}",
            agent_id, old_state, state, signal_count, record.accuracy
        );
        record
    }

    pub fn remove_agent(&mut self, agent_id: String) {
        self.assert_owner();
        require!(
            self.agents.get(&agent_id).cloned().is_some(),
            format!("Agent {} not found", agent_id)
        );
        self.agents.remove(&agent_id);
        let _ = &agent_id; // keep borrow checker happy
        log!("[REMOVE] Agent {} removed", agent_id);
    }

    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.assert_owner();
        log!("[OWNERSHIP] {} → {}", self.owner, new_owner);
        self.owner = new_owner;
    }

    // ── View Functions (public) ─────────────────────────────────────────────

    pub fn get_agent(&self, agent_id: String) -> Option<AgentTrustRecord> {
        self.agents.get(&agent_id).cloned()
    }

    pub fn get_all_agents(&self) -> Vec<AgentTrustRecord> {
        self.agents.values().cloned().collect()
    }

    pub fn get_agents_by_state(&self, state: String) -> Vec<AgentTrustRecord> {
        self.get_all_agents()
            .into_iter()
            .filter(|a| a.state == state)
            .collect()
    }

    pub fn get_trusted_agents(&self) -> Vec<AgentTrustRecord> {
        self.get_all_agents()
            .into_iter()
            .filter(|a| a.state == "TRUSTED" || a.state == "VALIDATED")
            .collect()
    }

    pub fn get_registry_stats(&self) -> RegistryStats {
        let all = self.get_all_agents();
        RegistryStats {
            total_agents: all.len() as u64,
            probation: all.iter().filter(|a| a.state == "PROBATION").count() as u64,
            validated: all.iter().filter(|a| a.state == "VALIDATED").count() as u64,
            trusted: all.iter().filter(|a| a.state == "TRUSTED").count() as u64,
            suspended: all.iter().filter(|a| a.state == "SUSPENDED").count() as u64,
            total_updates: self.total_updates,
            total_suspensions: self.total_suspensions,
            owner: self.owner.clone(),
        }
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    // ── Internal ────────────────────────────────────────────────────────────

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            format!("Only owner ({}) can call this method", self.owner)
        );
    }
}

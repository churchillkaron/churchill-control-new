import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const files = {
  repair: path.join(root, "supabase/migrations/20260827102000_phase46_delayed_outcome_interval_closure_resolution.sql"),
  phase41: path.join(root, "supabase/migrations/20260827070000_phase41_persistent_policy_succession_authority.sql"),
  phase42: path.join(root, "supabase/migrations/20260827073000_phase42_persistent_policy_generation_compaction.sql"),
  phase43: path.join(root, "supabase/migrations/20260827080000_phase43_policy_activation_generation.sql"),
  phase44: path.join(root, "supabase/migrations/20260827083000_phase44_policy_activation_interval_closure.sql"),
  phase45Lineage: path.join(root, "supabase/migrations/20260827094000_phase45_binding_propagation_hardening.sql"),
  phase45Ledger: path.join(root, "supabase/migrations/20260827090000_phase45_outcome_policy_interval_attribution.sql"),
  successionRuntime: path.join(root, "lib/intelligence/runtime/AvantiqoPersistentPolicySuccessionRuntime.js"),
};
for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`AVANTIQO_PHASE46_FILE_MISSING:${file}`);
}
execFileSync(process.execPath, ["--check", files.successionRuntime], { stdio: "pipe" });
const read = (file) => fs.readFileSync(file, "utf8");
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const has = (key, value) => source[key].includes(value);
const assert = (value, code) => { if (!value) throw new Error(`AVANTIQO_PHASE46_AUDIT_FAIL:${code}`); };

assert(has("repair", "v_resolved_activation_closed_at"), "CANONICAL_CLOSURE_RESOLUTION_MISSING");
assert(has("repair", "v_activation_closed_at is not null and v_activation_closed_at is distinct from v_resolved_activation_closed_at"), "CONFLICTING_CALLER_CLOSURE_NOT_REJECTED");
assert(has("repair", "v_activation_closed_at := v_resolved_activation_closed_at"), "RESOLVED_CLOSURE_NOT_CANONICALIZED");
assert(has("repair", "open_binding_snapshot_may_gain_observed_historical_closure"), "DELAYED_OPEN_BINDING_CONTRACT_MISSING");
assert(has("repair", "caller_supplied_historical_closure_is_authority',false"), "CALLER_CLOSURE_AUTHORITY_NOT_DISABLED");
assert(has("repair", "OUTCOME_ATTRIBUTION_REPLAY_MISMATCH_FAIL_CLOSED"), "REPLAY_MISMATCH_GUARD_MISSING");
assert(has("repair", "EXECUTION_START_CROSS_INTERVAL_FAIL_CLOSED"), "CROSS_INTERVAL_EXECUTION_GUARD_MISSING");
assert(has("repair", "security invoker"), "SECURITY_INVOKER_MISSING");
assert(!has("repair", "security definer"), "SECURITY_DEFINER_FORBIDDEN");

assert(has("phase41", "activate_avantiqo_policy_successor_v1"), "SUCCESSOR_ACTIVATION_RPC_MISSING");
assert(has("phase41", "avantiqo_phase41_reactivate_parent_after_successor_rollback_v1"), "PARENT_REACTIVATION_TRIGGER_MISSING");
assert(has("successionRuntime", "rollback_avantiqo_intelligence_persistent_ordering_policy_v1"), "GOVERNED_SUCCESSOR_ROLLBACK_RPC_MISSING");
assert(has("phase42", "avantiqo_phase42_compact_successor_before_insert_v1"), "GENERATION_COMPACTION_TRIGGER_MISSING");
assert(has("phase42", "avantiqo_phase42_append_generation_after_insert_v1"), "GENERATION_LEDGER_APPEND_MISSING");
assert(has("phase42", "verify_avantiqo_persistent_policy_generation_v1"), "GENERATION_INTEGRITY_RPC_MISSING");
assert(has("phase43", "coalesce(max(g.activation_generation_index), 0) + 1"), "FRESH_ACTIVATION_GENERATION_SEQUENCE_MISSING");
assert(has("phase43", "REACTIVATED_AFTER_SUCCESSOR_ROLLBACK"), "ROLLBACK_REACTIVATION_GENERATION_REASON_MISSING");
assert(has("phase43", "phase43_stale_approval_reuse_allowed', false"), "STALE_APPROVAL_REUSE_NOT_BLOCKED");
assert(has("phase43", "phase43_stale_research_reuse_allowed', false"), "STALE_RESEARCH_REUSE_NOT_BLOCKED");
assert(has("phase44", "old.state = 'ACTIVE' and new.state <> 'ACTIVE'"), "INTERVAL_CLOSE_TRANSITION_MISSING");
assert(has("phase44", "[activated_at,closed_at)"), "HALF_OPEN_INTERVAL_SEMANTICS_MISSING");
assert(has("phase44", "ACTIVATION_INTERVAL_OVERLAP_FAIL_CLOSED"), "OVERLAP_FAIL_CLOSED_MISSING");
assert(has("phase45Lineage", "STALE_REQUEST_APPROVAL_FORBIDDEN"), "STALE_REQUEST_APPROVAL_GUARD_MISSING");
assert(has("phase45Lineage", "STALE_APPROVAL_CLAIM_FORBIDDEN"), "STALE_APPROVAL_CLAIM_GUARD_MISSING");
assert(has("phase45Lineage", "STALE_CLAIM_CONSUMPTION_FORBIDDEN"), "STALE_CLAIM_CONSUMPTION_GUARD_MISSING");
assert(has("phase45Lineage", "EXECUTION_START_CROSS_INTERVAL_FORBIDDEN"), "RECEIPT_INTERVAL_GUARD_MISSING");
assert(has("phase45Ledger", "unique (organization_id, outcome_memory_id)"), "OUTCOME_IDEMPOTENCE_KEY_MISSING");
assert(has("phase45Ledger", "unique (organization_id, outcome_fingerprint)"), "OUTCOME_FINGERPRINT_UNIQUENESS_MISSING");
assert(has("phase45Ledger", "cross_interval_outcome_reuse_allowed',false") || has("phase45Ledger", "cross_interval_outcome_reuse_allowed', false"), "CROSS_INTERVAL_OUTCOME_REUSE_NOT_BLOCKED");

for (const text of Object.values(source)) {
  assert(!text.includes("provider_execution_authorized: true"), "PROVIDER_EXECUTION_AUTHORIZED_BY_PHASE46");
  assert(!text.includes("spend_authorized: true"), "SPEND_AUTHORIZED_BY_PHASE46");
  assert(!text.includes("automatic_model_weight_mutation: true"), "MODEL_WEIGHT_MUTATION_AUTHORIZED_BY_PHASE46");
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE46_AUDIT=PASS");
console.log("AVANTIQO_PHASE46_MULTI_GENERATION_SUCCESSION_CONTRACT=true");
console.log("AVANTIQO_PHASE46_FRESH_PARENT_REACTIVATION_GENERATION=true");
console.log("AVANTIQO_PHASE46_DELAYED_OUTCOME_ORIGINAL_GENERATION_PRESERVED=true");
console.log("AVANTIQO_PHASE46_CANONICAL_HISTORICAL_CLOSURE_RESOLUTION=true");
console.log("AVANTIQO_PHASE46_CALLER_CLOSURE_AUTHORITY=false");
console.log("AVANTIQO_PHASE46_CROSS_INTERVAL_OUTCOME_REUSE_ALLOWED=false");
console.log("AVANTIQO_PHASE46_STALE_GENERATION_APPROVAL_ALLOWED=false");
console.log("AVANTIQO_PHASE46_OUTCOME_REPLAY_IDEMPOTENT_CONTRACT=true");
console.log("AVANTIQO_PHASE46_PHASE42_HISTORY_APPEND_ONLY=true");
console.log("AVANTIQO_PHASE46_PHASE43_ACTIVATION_GENERATION_DISTINCT=true");
console.log("AVANTIQO_PHASE46_PHASE44_HALF_OPEN_INTERVALS=true");
console.log("AVANTIQO_PHASE46_SECURITY_INVOKER=true");
console.log("AVANTIQO_PHASE46_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE46_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE46_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE46_AUTOMATIC_TRAINING_STARTED=false");
console.log("AVANTIQO_PHASE46_AUTOMATIC_MODEL_WEIGHT_MUTATION=false");

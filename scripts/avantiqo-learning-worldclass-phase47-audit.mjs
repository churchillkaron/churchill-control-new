import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const files = {
  evidence: path.join(root, "audits/avantiqo-learning-worldclass-phase47-live-evidence.json"),
  route: path.join(root, "app/api/internal/intelligence/continuous-learning/process/route.js"),
  phase35: path.join(root, "supabase/migrations/20260827043500_phase35_persistent_ordering_policy_authority.sql"),
  phase41: path.join(root, "supabase/migrations/20260827070000_phase41_persistent_policy_succession_authority.sql"),
  phase42: path.join(root, "supabase/migrations/20260827073000_phase42_persistent_policy_generation_compaction.sql"),
  phase43: path.join(root, "supabase/migrations/20260827080000_phase43_policy_activation_generation.sql"),
  phase44: path.join(root, "supabase/migrations/20260827083000_phase44_policy_activation_interval_closure.sql"),
  phase45Lineage: path.join(root, "supabase/migrations/20260827092000_phase45_execution_lineage_enforcement.sql"),
  phase46Repair: path.join(root, "supabase/migrations/20260827102000_phase46_delayed_outcome_interval_closure_resolution.sql"),
  successionRuntime: path.join(root, "lib/intelligence/runtime/AvantiqoPersistentPolicySuccessionRuntime.js"),
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`AVANTIQO_PHASE47_FILE_MISSING:${file}`);
}
execFileSync(process.execPath, ["--check", files.route], { stdio: "pipe" });
execFileSync(process.execPath, ["--check", files.successionRuntime], { stdio: "pipe" });

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);
const evidence = JSON.parse(source.evidence);
const has = (key, value) => source[key].includes(value);
const assert = (value, code) => {
  if (!value) throw new Error(`AVANTIQO_PHASE47_AUDIT_FAIL:${code}`);
};

assert(evidence.contract === "AVANTIQO_LEARNING_WORLDCLASS_PHASE47_PRODUCTION_READINESS_V1", "LIVE_EVIDENCE_CONTRACT_INVALID");
assert(evidence.fixture_scope === "isolated_random_organization_only", "FIXTURE_SCOPE_NOT_ISOLATED");
assert(evidence.production_fixture_rows_remaining === 0, "FIXTURE_RESIDUE_REPORTED");
assert(evidence.forced_mid_transition_failure?.error === "AVANTIQO_PHASE42_SUCCESSOR_AUTHORITY_BOUNDARY_INVALID", "FORCED_FAILURE_NOT_OBSERVED");
assert(evidence.forced_mid_transition_failure?.root_state_after_failure === "ACTIVE", "ROOT_NOT_RECOVERED_AFTER_FAILED_TRANSITION");
assert(evidence.forced_mid_transition_failure?.policy_count_after_failure === 1, "FAILED_TRANSITION_POLICY_CARDINALITY_INVALID");
assert(evidence.forced_mid_transition_failure?.activation_generation_count_after_failure === 1, "FAILED_TRANSITION_GENERATION_CARDINALITY_INVALID");
assert(evidence.forced_mid_transition_failure?.closure_count_after_failure === 0, "FAILED_TRANSITION_LEFT_CLOSURE");
assert(evidence.forced_mid_transition_failure?.partial_commit_observed === false, "PARTIAL_COMMIT_OBSERVED");
assert(evidence.recovery?.valid_successor_activation_generation === 2, "SUCCESSOR_RECOVERY_GENERATION_INVALID");
assert(evidence.recovery?.valid_successor_policy_generation === 1, "SUCCESSOR_POLICY_GENERATION_INVALID");
assert(evidence.recovery?.rollback_reactivated_parent_generation === 3, "ROLLBACK_PARENT_GENERATION_NOT_FRESH");
assert(evidence.recovery?.phase42_integrity === true, "PHASE42_INTEGRITY_NOT_VERIFIED");
assert(evidence.recovery?.phase43_integrity === true, "PHASE43_INTEGRITY_NOT_VERIFIED");
assert(evidence.recovery?.phase44_integrity === true, "PHASE44_INTEGRITY_NOT_VERIFIED");
assert(evidence.recovery?.phase45_integrity === true, "PHASE45_INTEGRITY_NOT_VERIFIED");
assert(evidence.retry_safety?.rollback_retry_idempotent === true, "ROLLBACK_RETRY_NOT_IDEMPOTENT");
assert(evidence.retry_safety?.rollback_timestamp_preserved === true, "ROLLBACK_RETRY_TIMESTAMP_CHANGED");
assert(evidence.retry_safety?.rollback_reason_preserved === true, "ROLLBACK_RETRY_REASON_CHANGED");
assert(evidence.retry_safety?.stale_execution_request_retry_rejected === true, "STALE_REQUEST_RETRY_NOT_REJECTED");
assert(evidence.retry_safety?.stale_execution_request_error === "AVANTIQO_PHASE45_STALE_EXECUTION_REQUEST_REBIND_FORBIDDEN", "STALE_REQUEST_RETRY_ERROR_INVALID");
assert(Object.values(evidence.cleanup || {}).every((value) => value === 0), "FIXTURE_CLEANUP_NOT_ZERO");
assert(evidence.side_effects?.provider_call_performed === false, "PROVIDER_CALL_PERFORMED");
assert(evidence.side_effects?.wallet_write_performed === false, "WALLET_WRITE_PERFORMED");
assert(evidence.side_effects?.runpod_job_submitted === false, "RUNPOD_JOB_SUBMITTED");
assert(evidence.side_effects?.automatic_training_started === false, "AUTOMATIC_TRAINING_STARTED");
assert(evidence.side_effects?.automatic_model_weight_mutation === false, "MODEL_WEIGHT_MUTATION_STARTED");

assert(has("phase35", "pg_advisory_xact_lock"), "PHASE35_TRANSACTION_LOCK_MISSING");
assert(has("phase41", "pg_advisory_xact_lock"), "PHASE41_TRANSACTION_LOCK_MISSING");
assert(has("phase41", "rollback_avantiqo_intelligence_persistent_ordering_policy_v1") || has("successionRuntime", "rollback_avantiqo_intelligence_persistent_ordering_policy_v1"), "GOVERNED_ROLLBACK_AUTHORITY_MISSING");
assert(has("phase42", "AVANTIQO_PHASE42_SUCCESSOR_AUTHORITY_BOUNDARY_INVALID"), "SUCCESSOR_BOUNDARY_FAIL_CLOSED_MISSING");
assert(has("phase42", "avantiqo_phase42_compact_successor_before_insert_v1"), "SUCCESSOR_COMPACTION_TRIGGER_MISSING");
assert(has("phase43", "coalesce(max(g.activation_generation_index), 0) + 1"), "FRESH_ACTIVATION_GENERATION_SEQUENCE_MISSING");
assert(has("phase43", "REACTIVATED_AFTER_SUCCESSOR_ROLLBACK"), "ROLLBACK_REACTIVATION_REASON_MISSING");
assert(has("phase44", "old.state = 'ACTIVE' and new.state <> 'ACTIVE'"), "TRANSACTIONAL_INTERVAL_CLOSE_TRIGGER_MISSING");
assert(has("phase44", "ACTIVATION_INTERVAL_OVERLAP_FAIL_CLOSED"), "INTERVAL_OVERLAP_FAIL_CLOSED_MISSING");
assert(has("phase45Lineage", "STALE_EXECUTION_REQUEST_REBIND_FORBIDDEN"), "STALE_REQUEST_REBIND_GUARD_MISSING");
assert(has("phase45Lineage", "STALE_REQUEST_APPROVAL_FORBIDDEN"), "STALE_REQUEST_APPROVAL_GUARD_MISSING");
assert(has("phase45Lineage", "STALE_APPROVAL_CLAIM_FORBIDDEN"), "STALE_APPROVAL_CLAIM_GUARD_MISSING");
assert(has("phase45Lineage", "STALE_CLAIM_CONSUMPTION_FORBIDDEN"), "STALE_CLAIM_CONSUMPTION_GUARD_MISSING");
assert(has("phase46Repair", "canonical_historical_closure_resolved_at_outcome_ingress"), "DELAYED_OUTCOME_RECOVERY_REPAIR_MISSING");

assert(has("route", "if (!authorized(request))"), "CRON_AUTHORIZATION_GUARD_MISSING");
assert(has("route", "{ status: 401 }"), "CRON_UNAUTHORIZED_401_MISSING");
assert(has("route", "? 207"), "CRON_PARTIAL_FAILURE_207_MISSING");
assert(has("route", "{ status: 500 }"), "CRON_FATAL_FAILURE_500_MISSING");
assert(has("route", "execution_request_generation_allowed !== false"), "EXECUTION_REQUEST_FAIL_CLOSED_GATE_MISSING");
assert(has("route", "execution_authorized: false"), "BLOCKED_EXECUTION_AUTHORITY_FALSE_MISSING");
assert(has("route", "spend_authorized: false"), "BLOCKED_SPEND_AUTHORITY_FALSE_MISSING");
assert(has("route", "reconcileAvantiqoExperimentExecutionRequests"), "EXECUTION_REQUEST_RECONCILIATION_MISSING");
assert(has("route", "BLOCKED_BY_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_FAIL_CLOSED"), "ACTIVATION_GENERATION_ROUTE_GATE_MISSING");
assert(has("route", "BLOCKED_BY_PERSISTENT_POLICY_GENERATION_INTEGRITY_FAIL_CLOSED"), "POLICY_GENERATION_ROUTE_GATE_MISSING");
assert(has("route", "BLOCKED_BY_REBASED_SELECTION_POLICY_CANARY_FAIL_CLOSED"), "CANARY_ROUTE_GATE_MISSING");

for (const key of ["phase35", "phase41", "phase42", "phase43", "phase44", "phase45Lineage", "phase46Repair"]) {
  assert(!/security\s+definer/i.test(source[key]), `${key.toUpperCase()}_SECURITY_DEFINER_FORBIDDEN`);
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE47_AUDIT=PASS");
console.log("AVANTIQO_PHASE47_TRANSACTIONAL_PARTIAL_FAILURE_ROLLBACK=true");
console.log("AVANTIQO_PHASE47_VALID_RETRY_RECOVERY=true");
console.log("AVANTIQO_PHASE47_ROLLBACK_RETRY_IDEMPOTENT=true");
console.log("AVANTIQO_PHASE47_STALE_GENERATION_RETRY_REJECTED=true");
console.log("AVANTIQO_PHASE47_FRESH_REACTIVATION_GENERATION=true");
console.log("AVANTIQO_PHASE47_CRON_UNAUTHORIZED_STATUS=401");
console.log("AVANTIQO_PHASE47_CRON_BLOCKED_STATUS=207");
console.log("AVANTIQO_PHASE47_CRON_FATAL_STATUS=500");
console.log("AVANTIQO_PHASE47_EXECUTION_REQUESTS_FAIL_CLOSED=true");
console.log("AVANTIQO_PHASE47_SECURITY_INVOKER=true");
console.log("AVANTIQO_PHASE47_FIXTURE_ROWS_REMAINING=0");
console.log("AVANTIQO_PHASE47_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE47_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE47_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE47_AUTOMATIC_TRAINING_STARTED=false");
console.log("AVANTIQO_PHASE47_AUTOMATIC_MODEL_WEIGHT_MUTATION=false");

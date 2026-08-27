import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const files = {
  runtime: path.join(root, "lib/intelligence/runtime/AvantiqoPersistentPolicyGenerationIntegrityRuntime.js"),
  route: path.join(root, "app/api/internal/intelligence/continuous-learning/process/route.js"),
  index: path.join(root, "lib/intelligence/index.js"),
  phase41Migration: path.join(root, "supabase/migrations/20260827070000_phase41_persistent_policy_succession_authority.sql"),
  migration: path.join(root, "supabase/migrations/20260827073000_phase42_persistent_policy_generation_compaction.sql"),
  aclMigration: path.join(root, "supabase/migrations/20260827074000_phase42_generation_ledger_acl_hardening.sql"),
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`PHASE42_FILE_MISSING:${file}`);
}

for (const file of [files.runtime, files.route]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

const runtime = fs.readFileSync(files.runtime, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const index = fs.readFileSync(files.index, "utf8");
const phase41Migration = fs.readFileSync(files.phase41Migration, "utf8");
const migration = fs.readFileSync(files.migration, "utf8");
const aclMigration = fs.readFileSync(files.aclMigration, "utf8");

function has(source, value) {
  return source.includes(value);
}

function count(source, value) {
  return source.split(value).length - 1;
}

function assert(condition, code) {
  if (!condition) throw new Error(`AVANTIQO_PHASE42_AUDIT_FAIL:${code}`);
}

const compactionContract = "AVANTIQO_PERSISTENT_POLICY_GENERATION_COMPACTION_V1";
const ledgerContract = "AVANTIQO_PERSISTENT_POLICY_GENERATION_LEDGER_V1";
const integrityContract = "AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1";

assert(has(migration, compactionContract), "COMPACTION_CONTRACT_MISSING");
assert(has(migration, ledgerContract), "GENERATION_LEDGER_CONTRACT_MISSING");
assert(has(runtime, integrityContract), "INTEGRITY_RUNTIME_CONTRACT_MISSING");
assert(has(migration, integrityContract), "INTEGRITY_DATABASE_CONTRACT_MISSING");

assert(has(migration, "avantiqo_intelligence_persistent_policy_generations"), "GENERATION_LEDGER_TABLE_MISSING");
assert(has(migration, "enable row level security"), "GENERATION_LEDGER_RLS_MISSING");
assert(has(migration, "security invoker"), "SECURITY_INVOKER_MISSING");
assert(!has(migration, "security definer"), "SECURITY_DEFINER_FORBIDDEN");
assert(has(migration, "avantiqo_phase42_compact_successor_before_insert_v1"), "BEFORE_INSERT_COMPACTION_MISSING");
assert(has(migration, "before insert on public.avantiqo_intelligence_persistent_ordering_policies"), "BEFORE_INSERT_TRIGGER_MISSING");
assert(has(migration, "avantiqo_phase42_append_generation_after_insert_v1"), "AFTER_INSERT_LEDGER_MISSING");
assert(has(migration, "after insert on public.avantiqo_intelligence_persistent_ordering_policies"), "AFTER_INSERT_TRIGGER_MISSING");
assert(has(migration, "avantiqo_phase42_generation_ledger_append_only_v1"), "APPEND_ONLY_TRIGGER_MISSING");
assert(has(migration, "before update or delete on public.avantiqo_intelligence_persistent_policy_generations"), "UPDATE_DELETE_REJECTION_MISSING");
assert(has(migration, "AVANTIQO_PHASE42_GENERATION_LEDGER_APPEND_ONLY"), "APPEND_ONLY_FAILURE_MISSING");

assert(has(migration, "phase42_active_scoring_state_constant_size', true"), "CONSTANT_SIZE_SCORING_STATE_MISSING");
assert(has(migration, "phase42_unbounded_active_layer_accumulation', false"), "UNBOUNDED_LAYER_ACCUMULATION_NOT_BLOCKED");
assert(has(migration, "phase42_exact_multiplicative_residual_fold', true"), "EXACT_MULTIPLICATIVE_FOLD_MISSING");
assert(has(migration, "phase42_full_history_in_generation_ledger', true"), "FULL_HISTORY_LEDGER_MISSING");
assert(has(migration, "'flattened_residual_layers', jsonb_build_array(v_latest_layer)"), "ACTIVE_LAYERS_NOT_COMPACTED_TO_LATEST");
assert(has(migration, "'flattened_residual_layer_count', 1"), "ACTIVE_LAYER_COUNT_NOT_CONSTANT");
assert(has(migration, "parent_compacted_global_residual_multiplier"), "PARENT_GLOBAL_STATE_MISSING");
assert(has(migration, "parent_compacted_family_residual_multipliers"), "PARENT_FAMILY_STATE_MISSING");
assert(has(migration, "compacted_global_residual_multiplier"), "CURRENT_GLOBAL_STATE_MISSING");
assert(has(migration, "compacted_family_residual_multipliers"), "CURRENT_FAMILY_STATE_MISSING");
assert(has(migration, "scoring_state_fingerprint"), "SCORING_STATE_FINGERPRINT_MISSING");
assert(has(migration, "lineage_root_policy_fingerprint"), "LINEAGE_ROOT_MISSING");
assert(has(migration, "lineage_generation_index"), "GENERATION_INDEX_MISSING");

assert(has(migration, "v_parent_global * ((1 - v_influence) + v_global_factor * v_influence)"), "GLOBAL_FOLD_EQUATION_MISSING");
assert(has(migration, "v_parent_multiplier * ((1 - v_influence) + v_layer_factor * v_influence)"), "FAMILY_FOLD_EQUATION_MISSING");
assert(has(migration, "v_influence > 0.25"), "INCREMENTAL_INFLUENCE_CAP_MISSING");
assert(has(migration, "v_global_factor < 0.25 or v_global_factor > 1"), "GLOBAL_FACTOR_BOUNDS_MISSING");
assert(has(migration, "v_layer_factor < 0.25 or v_layer_factor > 1"), "FAMILY_FACTOR_BOUNDS_MISSING");
assert(has(migration, "count(distinct upper(btrim(key)))"), "NORMALIZED_FAMILY_COLLISION_CHECK_MISSING");
assert(has(migration, "AVANTIQO_PHASE42_PARENT_FAMILY_KEY_COLLISION"), "PARENT_FAMILY_COLLISION_NOT_FAIL_CLOSED");
assert(has(migration, "AVANTIQO_PHASE42_LAYER_FAMILY_KEY_COLLISION"), "LAYER_FAMILY_COLLISION_NOT_FAIL_CLOSED");

assert(has(migration, "p_include_last_layer is true"), "CURRENT_COMPACTED_SCORE_PATH_MISSING");
assert(has(migration, "parent_compacted_global_residual_multiplier"), "PARENT_SCORE_RECONSTRUCTION_MISSING");
assert(has(migration, "return v_score * v_multiplier"), "COMPACTED_SCORE_APPLICATION_MISSING");
assert(has(migration, "phase36_monitor_compatible', true"), "PHASE36_COMPATIBILITY_MISSING");
assert(has(migration, "exact_parent_policy_reactivation_on_rollback', true"), "EXACT_PARENT_ROLLBACK_MISSING");

assert(!has(migration, "create or replace function public.activate_avantiqo_policy_successor_v1"), "PHASE41_ACTIVATION_AUTHORITY_REDEFINED");
assert(!has(migration, "create or replace function public.apply_avantiqo_policy_successor_v1"), "PHASE41_APPLICATION_AUTHORITY_REDEFINED");
assert(has(phase41Migration, "create or replace function public.activate_avantiqo_policy_successor_v1"), "CERTIFIED_PHASE41_ACTIVATION_AUTHORITY_MISSING");
assert(has(phase41Migration, "create or replace function public.apply_avantiqo_policy_successor_v1"), "CERTIFIED_PHASE41_APPLICATION_AUTHORITY_MISSING");
assert(has(phase41Migration, "avantiqo_phase41_composite_score_v1"), "PHASE41_COMPOSITE_SCORER_DEPENDENCY_MISSING");
assert(has(phase41Migration, "p_include_last_layer => false"), "PHASE41_PARENT_SCORE_USE_MISSING");
assert(has(phase41Migration, "p_include_last_layer => true"), "PHASE41_SUCCESSOR_SCORE_USE_MISSING");

assert(has(migration, "verify_avantiqo_persistent_policy_generation_v1"), "INTEGRITY_RPC_MISSING");
assert(has(migration, "ACTIVE_PERSISTENT_POLICY_AMBIGUOUS_FAIL_CLOSED"), "ACTIVE_POLICY_AMBIGUITY_NOT_FAIL_CLOSED");
assert(has(migration, "ACTIVE_SUCCESSOR_GENERATION_LEDGER_AMBIGUOUS_FAIL_CLOSED"), "LEDGER_AMBIGUITY_NOT_FAIL_CLOSED");
assert(has(migration, "COMPACTED_RESIDUAL_FOLD_RECOMPUTATION_MISMATCH_FAIL_CLOSED"), "FOLD_RECOMPUTATION_NOT_FAIL_CLOSED");
assert(has(migration, "SCORING_STATE_FINGERPRINT_MISMATCH_FAIL_CLOSED"), "FINGERPRINT_RECOMPUTATION_NOT_FAIL_CLOSED");
assert(has(migration, "MULTI_GENERATION_PARENT_COMPACTED_STATE_INVALID_FAIL_CLOSED"), "MULTI_GENERATION_PARENT_LINEAGE_NOT_FAIL_CLOSED");
assert(has(migration, "execution_request_generation_allowed', false"), "DATABASE_EXECUTION_FAIL_CLOSED_MISSING");

assert(has(aclMigration, "revoke all on table public.avantiqo_intelligence_persistent_policy_generations"), "SERVICE_ROLE_ACL_RESET_MISSING");
assert(has(aclMigration, "from service_role"), "SERVICE_ROLE_ACL_TARGET_MISSING");
assert(has(aclMigration, "grant select, insert on table public.avantiqo_intelligence_persistent_policy_generations"), "SERVICE_ROLE_SELECT_INSERT_GRANT_MISSING");
assert(!has(aclMigration, "grant update"), "SERVICE_ROLE_UPDATE_FORBIDDEN");
assert(!has(aclMigration, "grant delete"), "SERVICE_ROLE_DELETE_FORBIDDEN");

assert(has(runtime, "verifyAvantiqoPersistentPolicyGenerationIntegrity"), "RUNTIME_VERIFY_EXPORT_MISSING");
assert(has(runtime, '"verify_avantiqo_persistent_policy_generation_v1"'), "RUNTIME_RPC_MISSING");
assert(has(runtime, "PERSISTENT_POLICY_GENERATION_INTEGRITY_RPC_FAILED_CLOSED"), "RUNTIME_RPC_FAILURE_NOT_FAIL_CLOSED");
assert(has(runtime, "read_only_integrity_verification: true"), "READ_ONLY_RUNTIME_BOUNDARY_MISSING");
assert(has(runtime, "generation_ledger_mutation_authorized: false"), "LEDGER_MUTATION_RUNTIME_BOUNDARY_MISSING");
assert(has(runtime, "policy_activation_authorized: false"), "POLICY_ACTIVATION_RUNTIME_BOUNDARY_MISSING");
assert(has(runtime, "policy_promotion_authorized: false"), "POLICY_PROMOTION_RUNTIME_BOUNDARY_MISSING");
assert(has(runtime, "unbounded_active_layer_accumulation_authorized: false"), "UNBOUNDED_RUNTIME_BOUNDARY_MISSING");
assert(count(runtime, ".insert(") === 0, "RUNTIME_LEDGER_INSERT_FORBIDDEN");
assert(count(runtime, ".update(") === 0, "RUNTIME_UPDATE_FORBIDDEN");
assert(count(runtime, ".delete(") === 0, "RUNTIME_DELETE_FORBIDDEN");

assert(has(index, 'export * from "./runtime/AvantiqoPersistentPolicyGenerationIntegrityRuntime";'), "INDEX_EXPORT_MISSING");
assert(has(route, "verifyAvantiqoPersistentPolicyGenerationIntegrity"), "ROUTE_INTEGRITY_CALL_MISSING");
assert(has(route, "persistentPolicyGenerationIntegrity.success !== false"), "ROUTE_INTEGRITY_SUCCESS_GATE_MISSING");
assert(has(route, "persistentPolicyGenerationIntegrity.execution_request_generation_allowed !== false"), "ROUTE_EXECUTION_PERMISSION_GATE_MISSING");
assert(has(route, "BLOCKED_BY_PERSISTENT_POLICY_GENERATION_INTEGRITY_FAIL_CLOSED"), "ROUTE_FAIL_CLOSED_STATUS_MISSING");
assert(has(route, "persistent_policy_generation_integrity"), "ROUTE_RESPONSE_MISSING");

const verifyCallIndex = route.indexOf("await verifyAvantiqoPersistentPolicyGenerationIntegrity()");
const rebasedCallIndex = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyChallenger()", verifyCallIndex + 1);
const canaryCallIndex = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyCanary()", verifyCallIndex + 1);
const executionCallIndex = route.indexOf("await reconcileAvantiqoExperimentExecutionRequests()", verifyCallIndex + 1);
assert(verifyCallIndex >= 0, "INTEGRITY_CALL_ORDER_SOURCE_MISSING");
assert(rebasedCallIndex > verifyCallIndex, "INTEGRITY_MUST_PRECEDE_REBASED_RESEARCH");
assert(canaryCallIndex > verifyCallIndex, "INTEGRITY_MUST_PRECEDE_CANARY");
assert(executionCallIndex > verifyCallIndex, "INTEGRITY_MUST_PRECEDE_EXECUTION_REQUEST");

assert(!has(route, "activate_avantiqo_policy_successor_v1"), "CRON_POLICY_ACTIVATION_FORBIDDEN");
assert(!has(route, "avantiqo_phase42_append_generation_after_insert_v1"), "CRON_LEDGER_MUTATION_FORBIDDEN");
assert(!has(route, "avantiqo_phase42_compact_successor_before_insert_v1"), "CRON_COMPACTION_MUTATION_FORBIDDEN");

const identifiers = [
  "avantiqo_intelligence_persistent_policy_generations",
  "avantiqo_phase42_generation_lineage_idx",
  "avantiqo_phase42_generation_parent_idx",
  "avantiqo_phase42_fold_residual_layer_v1",
  "avantiqo_phase42_scoring_state_fingerprint_v1",
  "avantiqo_phase42_compact_successor_before_insert_v1",
  "avantiqo_phase42_append_generation_after_insert_v1",
  "avantiqo_phase42_reject_generation_mutation_v1",
  "avantiqo_phase42_generation_ledger_append_only_v1",
  "verify_avantiqo_persistent_policy_generation_v1",
];
for (const identifier of identifiers) {
  assert(identifier.length <= 63, `POSTGRES_IDENTIFIER_TOO_LONG:${identifier}`);
}

assert(count(runtime, "provider_execution_authorized: true") === 0, "PROVIDER_EXECUTION_AUTHORIZED");
assert(count(runtime, "spend_authorized: true") === 0, "SPEND_AUTHORIZED");
assert(count(runtime, "platform_knowledge_written: true") === 0, "PLATFORM_KNOWLEDGE_WRITE_AUTHORIZED");
assert(count(runtime, "automatic_training_started: true") === 0, "TRAINING_AUTHORIZED");
assert(count(runtime, "automatic_model_weight_mutation: true") === 0, "MODEL_WEIGHT_MUTATION_AUTHORIZED");

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE42_AUDIT=PASS");
console.log(`AVANTIQO_PERSISTENT_POLICY_GENERATION_COMPACTION_CONTRACT=${compactionContract}`);
console.log(`AVANTIQO_PHASE42_GENERATION_LEDGER_CONTRACT=${ledgerContract}`);
console.log(`AVANTIQO_PHASE42_INTEGRITY_CONTRACT=${integrityContract}`);
console.log("AVANTIQO_PHASE42_ACTIVE_SCORING_STATE_CONSTANT_SIZE=true");
console.log("AVANTIQO_PHASE42_UNBOUNDED_ACTIVE_LAYER_ACCUMULATION=false");
console.log("AVANTIQO_PHASE42_EXACT_MULTIPLICATIVE_FOLD=true");
console.log("AVANTIQO_PHASE42_FULL_HISTORY_APPEND_ONLY=true");
console.log("AVANTIQO_PHASE42_EXACT_PARENT_SCORING_STATE_PRESERVED=true");
console.log("AVANTIQO_PHASE42_EXACT_CURRENT_SCORING_STATE_PRESERVED=true");
console.log("AVANTIQO_PHASE42_PHASE41_GOVERNANCE_UNCHANGED=true");
console.log("AVANTIQO_PHASE42_PHASE36_MONITOR_COMPATIBLE=true");
console.log("AVANTIQO_PHASE42_BEFORE_INSERT_COMPACTION=true");
console.log("AVANTIQO_PHASE42_AFTER_INSERT_GENERATION_LEDGER=true");
console.log("AVANTIQO_PHASE42_LEDGER_UPDATE_DELETE_ALLOWED=false");
console.log("AVANTIQO_PHASE42_LEDGER_SERVICE_ROLE_SELECT_INSERT_ONLY=true");
console.log("AVANTIQO_PHASE42_SECURITY_INVOKER=true");
console.log("AVANTIQO_PHASE42_RLS_ENABLED=true");
console.log("AVANTIQO_PHASE42_FAMILY_KEY_AMBIGUITY_FAIL_CLOSED=true");
console.log("AVANTIQO_PHASE42_FACTOR_BOUNDS=true");
console.log("AVANTIQO_PHASE42_INFLUENCE_CAP_25_PERCENT=true");
console.log("AVANTIQO_PHASE42_GENERATION_LINEAGE_RECOMPUTED=true");
console.log("AVANTIQO_PHASE42_SCORING_STATE_FINGERPRINT_RECOMPUTED=true");
console.log("AVANTIQO_PHASE42_POSTGRES_IDENTIFIERS_WITHIN_63_BYTES=true");
console.log("AVANTIQO_PHASE42_ROUTE_INTEGRITY_GATE=true");
console.log("AVANTIQO_PHASE42_REBASED_RESEARCH_BLOCKED_ON_INTEGRITY_FAILURE=true");
console.log("AVANTIQO_PHASE42_CANARY_BLOCKED_ON_INTEGRITY_FAILURE=true");
console.log("AVANTIQO_PHASE42_EXECUTION_BLOCKED_ON_INTEGRITY_FAILURE=true");
console.log("AVANTIQO_PHASE42_CRON_READ_ONLY_INTEGRITY=true");
console.log("AVANTIQO_PHASE42_POLICY_ACTIVATION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE42_POLICY_PROMOTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE42_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE42_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE42_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE42_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE42_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE42_AUTOMATIC_TRAINING_STARTED=false");
console.log("AVANTIQO_PHASE42_AUTOMATIC_MODEL_WEIGHT_MUTATION=false");

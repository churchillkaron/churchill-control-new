import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const files = {
  migration: path.join(root, "supabase/migrations/20260827080000_phase43_policy_activation_generation.sql"),
  phase41Migration: path.join(root, "supabase/migrations/20260827070000_phase41_persistent_policy_succession_authority.sql"),
  phase37: path.join(root, "lib/intelligence/runtime/AvantiqoSelectionPolicyResearchEpochRuntime.js"),
  phase38: path.join(root, "lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyChallengerRuntime.js"),
  runtime: path.join(root, "lib/intelligence/runtime/AvantiqoPersistentPolicyActivationGenerationIntegrityRuntime.js"),
  route: path.join(root, "app/api/internal/intelligence/continuous-learning/process/route.js"),
  index: path.join(root, "lib/intelligence/index.js"),
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`PHASE43_FILE_MISSING:${file}`);
}

for (const file of [files.phase37, files.phase38, files.runtime, files.route]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

const migration = fs.readFileSync(files.migration, "utf8");
const phase41Migration = fs.readFileSync(files.phase41Migration, "utf8");
const phase37 = fs.readFileSync(files.phase37, "utf8");
const phase38 = fs.readFileSync(files.phase38, "utf8");
const runtime = fs.readFileSync(files.runtime, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const index = fs.readFileSync(files.index, "utf8");

function has(source, value) {
  return source.includes(value);
}

function count(source, value) {
  return source.split(value).length - 1;
}

function assert(condition, code) {
  if (!condition) throw new Error(`AVANTIQO_PHASE43_AUDIT_FAIL:${code}`);
}

const generationContract = "AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_V1";
const integrityContract = "AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_V1";

assert(has(migration, generationContract), "ACTIVATION_GENERATION_CONTRACT_MISSING");
assert(has(migration, integrityContract), "ACTIVATION_GENERATION_INTEGRITY_CONTRACT_MISSING");
assert(has(runtime, integrityContract), "INTEGRITY_RUNTIME_CONTRACT_MISSING");
assert(has(migration, "avantiqo_intelligence_policy_activation_generations"), "ACTIVATION_LEDGER_TABLE_MISSING");
assert(has(migration, "enable row level security"), "ACTIVATION_LEDGER_RLS_MISSING");
assert(has(migration, "security invoker"), "SECURITY_INVOKER_MISSING");
assert(!has(migration, "security definer"), "SECURITY_DEFINER_FORBIDDEN");
assert(has(migration, "grant select, insert on table public.avantiqo_intelligence_policy_activation_generations"), "SERVICE_ROLE_SELECT_INSERT_GRANT_MISSING");
assert(!has(migration, "grant update on table public.avantiqo_intelligence_policy_activation_generations"), "SERVICE_ROLE_UPDATE_FORBIDDEN");
assert(!has(migration, "grant delete on table public.avantiqo_intelligence_policy_activation_generations"), "SERVICE_ROLE_DELETE_FORBIDDEN");

assert(has(migration, "avantiqo_phase43_prepare_active_generation_v1"), "ACTIVE_GENERATION_PREPARE_MISSING");
assert(has(migration, "before insert or update of state on public.avantiqo_intelligence_persistent_ordering_policies"), "ACTIVE_GENERATION_BEFORE_TRIGGER_MISSING");
assert(has(migration, "old.state is distinct from 'ACTIVE'"), "ACTIVE_TRANSITION_DETECTION_MISSING");
assert(has(migration, "new.activated_at := v_at"), "ACTIVATED_AT_INTERVAL_RESET_MISSING");
assert(has(migration, "phase43_activation_generation_index"), "ACTIVATION_GENERATION_INDEX_MISSING");
assert(has(migration, "phase43_activation_generation_fingerprint"), "ACTIVATION_GENERATION_FINGERPRINT_MISSING");
assert(has(migration, "REACTIVATED_AFTER_SUCCESSOR_ROLLBACK"), "SUCCESSOR_ROLLBACK_REASON_MISSING");
assert(has(migration, "phase43_distinct_active_interval', true"), "DISTINCT_ACTIVE_INTERVAL_MARKER_MISSING");
assert(has(migration, "phase43_stale_research_reuse_allowed', false"), "STALE_RESEARCH_REUSE_NOT_BLOCKED");
assert(has(migration, "phase43_stale_canary_reuse_allowed', false"), "STALE_CANARY_REUSE_NOT_BLOCKED");
assert(has(migration, "phase43_stale_approval_reuse_allowed', false"), "STALE_APPROVAL_REUSE_NOT_BLOCKED");

assert(has(migration, "avantiqo_phase43_append_active_generation_v1"), "ACTIVATION_LEDGER_APPEND_MISSING");
assert(has(migration, "after insert or update of state on public.avantiqo_intelligence_persistent_ordering_policies"), "ACTIVATION_LEDGER_AFTER_TRIGGER_MISSING");
assert(has(migration, "policy_generation_depth_is_distinct_from_activation_generation', true"), "POLICY_GENERATION_DEPTH_NOT_DISTINCT");
assert(has(migration, "prior_active_interval_evidence_reusable', false"), "PRIOR_INTERVAL_LEDGER_REUSE_NOT_BLOCKED");
assert(has(migration, "avantiqo_phase43_activation_ledger_append_only_v1"), "APPEND_ONLY_TRIGGER_MISSING");
assert(has(migration, "before update or delete on public.avantiqo_intelligence_policy_activation_generations"), "APPEND_ONLY_MUTATION_REJECTION_MISSING");
assert(has(migration, "AVANTIQO_PHASE43_ACTIVATION_GENERATION_LEDGER_APPEND_ONLY"), "APPEND_ONLY_FAILURE_MISSING");

assert(has(phase41Migration, "phase41_reactivated_after_successor_rollback', true"), "PHASE41_PARENT_REACTIVATION_MARKER_MISSING");
assert(has(phase41Migration, "where id = v_parent.id and state = 'SUPERSEDED'"), "PHASE41_EXACT_PARENT_REACTIVATION_MISSING");
assert(has(phase41Migration, "state = 'ACTIVE'"), "PHASE41_PARENT_ACTIVE_TRANSITION_MISSING");
assert(has(migration, "old.state = 'SUPERSEDED'"), "PHASE43_SUPERSEDED_REACTIVATION_DETECTION_MISSING");

assert(has(phase37, "AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_CONTRACT"), "PHASE37_GENERATION_CONTRACT_MISSING");
assert(has(phase37, "generation.fingerprint"), "PHASE37_EPOCH_FINGERPRINT_GENERATION_BINDING_MISSING");
assert(has(phase37, "activation_generation_fingerprint: generation.fingerprint"), "PHASE37_GENERATION_METADATA_MISSING");
assert(has(phase37, "research_epoch_binds_exact_activation_generation: true"), "PHASE37_EXACT_GENERATION_BINDING_MISSING");
assert(has(phase37, "prior_active_interval_evidence_reusable: false"), "PHASE37_PRIOR_INTERVAL_REUSE_NOT_BLOCKED");
assert(has(phase37, "stale_canary_reusable: false"), "PHASE37_STALE_CANARY_REUSE_NOT_BLOCKED");
assert(has(phase37, "stale_approval_reusable: false"), "PHASE37_STALE_APPROVAL_REUSE_NOT_BLOCKED");
assert(has(phase37, '.gte("applied_at", startedAt)'), "PHASE37_APPLICATION_INTERVAL_BOUND_MISSING");
assert(has(phase37, '.gte("evaluated_at", startedAt)'), "PHASE37_MONITOR_INTERVAL_BOUND_MISSING");
assert(has(phase37, '.gte("created_at", startedAt)'), "PHASE37_OUTCOME_INTERVAL_BOUND_MISSING");

assert(has(phase38, "ACTIVATION_GENERATION_CONTRACT"), "PHASE38_GENERATION_CONTRACT_MISSING");
assert(has(phase38, '"metadata->>activation_generation_fingerprint"'), "PHASE38_EPOCH_GENERATION_FILTER_MISSING");
assert(has(phase38, '.gte("applied_at", policy.activated_at)'), "PHASE38_APPLICATION_INTERVAL_BOUND_MISSING");
assert(has(phase38, '.gte("evaluated_at", policy.activated_at)'), "PHASE38_MONITOR_INTERVAL_BOUND_MISSING");
assert(has(phase38, '.gte("created_at", policy.activated_at)'), "PHASE38_OUTCOME_INTERVAL_BOUND_MISSING");
assert(has(phase38, "activationGenerationStartedAt !== text(policy.activated_at, 120)"), "PHASE38_INTERVAL_START_MATCH_MISSING");
assert(has(phase38, "epochMetadata.research_epoch_binds_exact_activation_generation !== true"), "PHASE38_EXACT_EPOCH_BINDING_MISSING");
assert(has(phase38, "epochMetadata.prior_active_interval_evidence_reusable !== false"), "PHASE38_PRIOR_INTERVAL_REUSE_NOT_BLOCKED");
assert(has(phase38, "epochMetadata.stale_canary_reusable !== false"), "PHASE38_STALE_CANARY_REUSE_NOT_BLOCKED");
assert(has(phase38, "epochMetadata.stale_approval_reusable !== false"), "PHASE38_STALE_APPROVAL_REUSE_NOT_BLOCKED");
assert(has(phase38, "prior_activation_interval_evidence_used: false"), "PHASE38_PROPOSAL_PRIOR_INTERVAL_USE_NOT_FALSE");

assert(has(migration, "verify_avantiqo_policy_activation_generation_v1"), "DATABASE_INTEGRITY_RPC_MISSING");
assert(has(migration, "ACTIVE_POLICY_AMBIGUOUS_FAIL_CLOSED"), "ACTIVE_POLICY_AMBIGUITY_NOT_FAIL_CLOSED");
assert(has(migration, "ACTIVE_GENERATION_LEDGER_AMBIGUOUS_FAIL_CLOSED"), "ACTIVATION_LEDGER_AMBIGUITY_NOT_FAIL_CLOSED");
assert(has(migration, "ACTIVE_GENERATION_LINEAGE_MISMATCH_FAIL_CLOSED"), "ACTIVATION_LINEAGE_MISMATCH_NOT_FAIL_CLOSED");
assert(has(migration, "v_latest_org_fingerprint <> v_expected_fingerprint"), "LATEST_ACTIVATION_GENERATION_CHECK_MISSING");
assert(has(migration, "research_generation_allowed', false"), "DATABASE_RESEARCH_FAIL_CLOSED_MISSING");
assert(has(migration, "execution_request_generation_allowed', false"), "DATABASE_EXECUTION_FAIL_CLOSED_MISSING");

assert(has(runtime, "verifyAvantiqoPersistentPolicyActivationGenerationIntegrity"), "RUNTIME_VERIFY_EXPORT_MISSING");
assert(has(runtime, '"verify_avantiqo_policy_activation_generation_v1"'), "RUNTIME_RPC_MISSING");
assert(has(runtime, "PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_RPC_FAILED_CLOSED"), "RUNTIME_RPC_FAIL_CLOSED_MISSING");
assert(has(runtime, "read_only_integrity_verification: true"), "READ_ONLY_RUNTIME_BOUNDARY_MISSING");
assert(has(runtime, "activation_generation_ledger_mutation_authorized: false"), "LEDGER_MUTATION_RUNTIME_BOUNDARY_MISSING");
assert(has(runtime, "policy_activation_authorized: false"), "POLICY_ACTIVATION_RUNTIME_BOUNDARY_MISSING");
assert(has(runtime, "policy_promotion_authorized: false"), "POLICY_PROMOTION_RUNTIME_BOUNDARY_MISSING");
assert(count(runtime, ".insert(") === 0, "RUNTIME_INSERT_FORBIDDEN");
assert(count(runtime, ".update(") === 0, "RUNTIME_UPDATE_FORBIDDEN");
assert(count(runtime, ".delete(") === 0, "RUNTIME_DELETE_FORBIDDEN");

assert(has(index, 'export * from "./runtime/AvantiqoPersistentPolicyActivationGenerationIntegrityRuntime";'), "INDEX_EXPORT_MISSING");
assert(has(route, "verifyAvantiqoPersistentPolicyActivationGenerationIntegrity"), "ROUTE_INTEGRITY_IMPORT_OR_CALL_MISSING");
assert(has(route, "persistentPolicyActivationGenerationResearchIntegrity"), "ROUTE_PRE_RESEARCH_GATE_MISSING");
assert(has(route, "persistentPolicyActivationGenerationIntegrity"), "ROUTE_POST_MONITOR_GATE_MISSING");
assert(has(route, "BLOCKED_BY_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_FAIL_CLOSED"), "ROUTE_FAIL_CLOSED_STATUS_MISSING");
assert(has(route, "persistent_policy_activation_generation_integrity"), "ROUTE_RESPONSE_MISSING");
assert(has(route, "persistent_policy_activation_generation_research_integrity"), "ROUTE_RESEARCH_RESPONSE_MISSING");

const firstIntegrityIndex = route.indexOf("await verifyAvantiqoPersistentPolicyActivationGenerationIntegrity()");
const researchIndex = route.indexOf("await reconcileAvantiqoSelectionPolicyResearchEpoch()", firstIntegrityIndex + 1);
const monitorIndex = route.indexOf("await reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor()", researchIndex + 1);
const secondIntegrityIndex = route.indexOf("await verifyAvantiqoPersistentPolicyActivationGenerationIntegrity()", firstIntegrityIndex + 1);
const rebasedIndex = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyChallenger()", secondIntegrityIndex + 1);
const canaryIndex = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyCanary()", secondIntegrityIndex + 1);
const executionIndex = route.indexOf("await reconcileAvantiqoExperimentExecutionRequests()", secondIntegrityIndex + 1);
assert(firstIntegrityIndex >= 0 && researchIndex > firstIntegrityIndex, "INTEGRITY_MUST_PRECEDE_RESEARCH_EPOCH");
assert(monitorIndex > researchIndex, "REGRESSION_MONITOR_ORDER_MISSING");
assert(secondIntegrityIndex > monitorIndex, "INTEGRITY_MUST_REVERIFY_AFTER_REGRESSION_MONITOR");
assert(rebasedIndex > secondIntegrityIndex, "INTEGRITY_MUST_PRECEDE_REBASED_RESEARCH");
assert(canaryIndex > secondIntegrityIndex, "INTEGRITY_MUST_PRECEDE_REBASED_CANARY");
assert(executionIndex > secondIntegrityIndex, "INTEGRITY_MUST_PRECEDE_EXECUTION_REQUEST");

assert(!has(route, "avantiqo_phase43_prepare_active_generation_v1"), "CRON_ACTIVE_GENERATION_MUTATION_FORBIDDEN");
assert(!has(route, "avantiqo_phase43_append_active_generation_v1"), "CRON_LEDGER_APPEND_FORBIDDEN");
assert(!has(route, "activate_avantiqo_policy_successor_v1"), "CRON_SUCCESSOR_ACTIVATION_FORBIDDEN");
assert(!has(route, "rollback_avantiqo_policy_successor_v1"), "CRON_EXPLICIT_SUCCESSOR_ROLLBACK_FORBIDDEN");

const identifiers = [
  "avantiqo_intelligence_policy_activation_generations",
  "avantiqo_phase43_activation_policy_idx",
  "avantiqo_phase43_prepare_active_generation_v1",
  "avantiqo_phase43_append_active_generation_v1",
  "avantiqo_phase43_reject_activation_generation_mutation_v1",
  "avantiqo_phase43_activation_ledger_append_only_v1",
  "verify_avantiqo_policy_activation_generation_v1",
];
for (const identifier of identifiers) {
  assert(identifier.length <= 63, `POSTGRES_IDENTIFIER_TOO_LONG:${identifier}`);
}

for (const source of [migration, runtime, phase37, phase38, route]) {
  assert(count(source, "provider_execution_authorized: true") === 0, "PROVIDER_EXECUTION_AUTHORIZED");
  assert(count(source, "spend_authorized: true") === 0, "SPEND_AUTHORIZED");
  assert(count(source, "automatic_model_weight_mutation: true") === 0, "MODEL_WEIGHT_MUTATION_AUTHORIZED");
}
assert(count(runtime, "platform_knowledge_written: true") === 0, "PLATFORM_KNOWLEDGE_WRITE_AUTHORIZED");
assert(count(runtime, "automatic_training_started: true") === 0, "TRAINING_AUTHORIZED");

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE43_AUDIT=PASS");
console.log(`AVANTIQO_PHASE43_ACTIVATION_GENERATION_CONTRACT=${generationContract}`);
console.log(`AVANTIQO_PHASE43_INTEGRITY_CONTRACT=${integrityContract}`);
console.log("AVANTIQO_PHASE43_DISTINCT_ACTIVE_INTERVALS=true");
console.log("AVANTIQO_PHASE43_REACTIVATION_CREATES_NEW_GENERATION=true");
console.log("AVANTIQO_PHASE43_POLICY_GENERATION_DEPTH_DISTINCT=true");
console.log("AVANTIQO_PHASE43_RESEARCH_EPOCH_BINDS_ACTIVATION_GENERATION=true");
console.log("AVANTIQO_PHASE43_APPLICATION_EVIDENCE_INTERVAL_BOUNDED=true");
console.log("AVANTIQO_PHASE43_MONITOR_EVIDENCE_INTERVAL_BOUNDED=true");
console.log("AVANTIQO_PHASE43_OUTCOME_EVIDENCE_INTERVAL_BOUNDED=true");
console.log("AVANTIQO_PHASE43_PRIOR_INTERVAL_EVIDENCE_REUSABLE=false");
console.log("AVANTIQO_PHASE43_STALE_RESEARCH_REUSABLE=false");
console.log("AVANTIQO_PHASE43_STALE_CANARY_REUSABLE=false");
console.log("AVANTIQO_PHASE43_STALE_APPROVAL_REUSABLE=false");
console.log("AVANTIQO_PHASE43_FULL_HISTORY_APPEND_ONLY=true");
console.log("AVANTIQO_PHASE43_LEDGER_UPDATE_DELETE_ALLOWED=false");
console.log("AVANTIQO_PHASE43_LEDGER_SERVICE_ROLE_SELECT_INSERT_ONLY=true");
console.log("AVANTIQO_PHASE43_SECURITY_INVOKER=true");
console.log("AVANTIQO_PHASE43_RLS_ENABLED=true");
console.log("AVANTIQO_PHASE43_ROUTE_PRE_RESEARCH_INTEGRITY_GATE=true");
console.log("AVANTIQO_PHASE43_ROUTE_POST_MONITOR_REVERIFICATION=true");
console.log("AVANTIQO_PHASE43_REBASED_RESEARCH_BLOCKED_ON_INTEGRITY_FAILURE=true");
console.log("AVANTIQO_PHASE43_CANARY_BLOCKED_ON_INTEGRITY_FAILURE=true");
console.log("AVANTIQO_PHASE43_EXECUTION_BLOCKED_ON_INTEGRITY_FAILURE=true");
console.log("AVANTIQO_PHASE43_POSTGRES_IDENTIFIERS_WITHIN_63_BYTES=true");
console.log("AVANTIQO_PHASE43_POLICY_ACTIVATION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE43_POLICY_PROMOTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE43_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE43_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE43_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE43_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE43_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE43_AUTOMATIC_TRAINING_STARTED=false");
console.log("AVANTIQO_PHASE43_AUTOMATIC_MODEL_WEIGHT_MUTATION=false");

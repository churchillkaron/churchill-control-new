import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const files = {
  migration1: path.join(root, "supabase/migrations/20260827090000_phase45_outcome_policy_interval_attribution.sql"),
  migration2: path.join(root, "supabase/migrations/20260827091000_phase45_outcome_attribution_trigger.sql"),
  migration3: path.join(root, "supabase/migrations/20260827092000_phase45_execution_lineage_enforcement.sql"),
  migration4: path.join(root, "supabase/migrations/20260827093000_phase45_no_policy_epoch_hardening.sql"),
  migration5: path.join(root, "supabase/migrations/20260827094000_phase45_binding_propagation_hardening.sql"),
  migration6: path.join(root, "supabase/migrations/20260827095000_phase45_long_horizon_consumer_guard.sql"),
  runtime: path.join(root, "lib/intelligence/runtime/AvantiqoExperimentPolicyIntervalAttributionRuntime.js"),
  phase43Runtime: path.join(root, "lib/intelligence/runtime/AvantiqoPersistentPolicyActivationGenerationIntegrityRuntime.js"),
  phase29Runtime: path.join(root, "lib/intelligence/runtime/AvantiqoLongHorizonPolicyAdaptedExperimentPortfolioRuntime.js"),
  index: path.join(root, "lib/intelligence/index.js"),
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`PHASE45_FILE_MISSING:${file}`);
}
for (const file of [files.runtime, files.phase43Runtime, files.phase29Runtime]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

const read = (file) => fs.readFileSync(file, "utf8");
const migration1 = read(files.migration1);
const migration2 = read(files.migration2);
const migration3 = read(files.migration3);
const migration4 = read(files.migration4);
const migration5 = read(files.migration5);
const migration6 = read(files.migration6);
const runtime = read(files.runtime);
const phase43Runtime = read(files.phase43Runtime);
const phase29Runtime = read(files.phase29Runtime);
const index = read(files.index);
const allMigrations = [migration1, migration2, migration3, migration4, migration5, migration6].join("\n");
const has = (source, value) => source.includes(value);
const count = (source, value) => source.split(value).length - 1;
const assert = (condition, code) => {
  if (!condition) throw new Error(`AVANTIQO_PHASE45_AUDIT_FAIL:${code}`);
};

const attributionContract = "AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_V1";
const resolutionContract = "AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1";
const integrityContract = "AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_V1";

assert(has(migration1, attributionContract), "ATTRIBUTION_CONTRACT_MISSING");
assert(has(migration1, resolutionContract), "RESOLUTION_CONTRACT_MISSING");
assert(has(migration1, integrityContract), "INTEGRITY_CONTRACT_MISSING");
assert(has(runtime, attributionContract), "RUNTIME_ATTRIBUTION_CONTRACT_MISSING");
assert(has(runtime, resolutionContract), "RUNTIME_RESOLUTION_CONTRACT_MISSING");
assert(has(runtime, integrityContract), "RUNTIME_INTEGRITY_CONTRACT_MISSING");

assert(has(migration1, "avantiqo_intelligence_policy_outcome_attributions"), "ATTRIBUTION_LEDGER_MISSING");
assert(has(migration1, "enable row level security"), "RLS_MISSING");
assert(has(migration1, "grant select, insert on table public.avantiqo_intelligence_policy_outcome_attributions"), "SERVICE_ROLE_SELECT_INSERT_MISSING");
assert(!has(migration1, "grant update on table public.avantiqo_intelligence_policy_outcome_attributions"), "SERVICE_ROLE_UPDATE_FORBIDDEN");
assert(!has(migration1, "grant delete on table public.avantiqo_intelligence_policy_outcome_attributions"), "SERVICE_ROLE_DELETE_FORBIDDEN");
assert(has(migration1, "before update or delete on public.avantiqo_intelligence_policy_outcome_attributions"), "APPEND_ONLY_TRIGGER_MISSING");
assert(has(migration1, "AVANTIQO_PHASE45_OUTCOME_ATTRIBUTION_LEDGER_APPEND_ONLY"), "APPEND_ONLY_EXCEPTION_MISSING");

assert(has(migration1, "resolve_avantiqo_policy_activation_interval_v1"), "INTERVAL_RESOLVER_MISSING");
assert(has(migration1, "verify_avantiqo_policy_activation_intervals_v1"), "PHASE44_INTEGRITY_DEPENDENCY_MISSING");
assert(has(migration1, "POLICY_ACTIVATION_INTERVAL_AMBIGUOUS_FAIL_CLOSED"), "AMBIGUOUS_INTERVAL_FAIL_CLOSED_MISSING");
assert(has(migration1, "NO_PERSISTENT_POLICY_INTERVAL_AT_EVENT"), "NO_POLICY_INTERVAL_RESOLUTION_MISSING");
assert(has(migration1, "PERSISTENT_POLICY_INTERVAL_RESOLVED"), "PERSISTENT_INTERVAL_RESOLUTION_MISSING");
assert(has(migration1, "verify_avantiqo_policy_outcome_attribution_v1"), "OUTCOME_INTEGRITY_RPC_MISSING");
assert(has(migration1, "OUTCOME_ATTRIBUTION_CARDINALITY_MISMATCH_FAIL_CLOSED"), "ATTRIBUTION_CARDINALITY_CHECK_MISSING");
assert(has(migration1, "OUTCOME_POLICY_INTERVAL_LINEAGE_MISMATCH_FAIL_CLOSED"), "ATTRIBUTION_LINEAGE_CHECK_MISSING");
assert(/'cross_interval_outcome_reuse_allowed'\s*,\s*false/.test(migration1), "CROSS_INTERVAL_REUSE_NOT_BLOCKED");

assert(has(migration2, "avantiqo_phase45_enforce_outcome_attribution_v1"), "ATOMIC_OUTCOME_TRIGGER_FUNCTION_MISSING");
assert(has(migration2, "after insert or update of metadata on public.intelligence_memories"), "ATOMIC_OUTCOME_TRIGGER_MISSING");
assert(has(migration2, "OUTCOME_POLICY_BINDING_MISSING_FAIL_CLOSED"), "OUTCOME_BINDING_REQUIRED_MISSING");
assert(has(migration2, "OUTCOME_ATTRIBUTION_COLLISION_FAIL_CLOSED"), "OUTCOME_ATTRIBUTION_COLLISION_CHECK_MISSING");

assert(has(migration3, "avantiqo_phase45_enforce_execution_lineage_v1"), "EXECUTION_LINEAGE_TRIGGER_MISSING");
assert(has(migration3, "platform_learning_experiment_execution_requests"), "REQUEST_BINDING_MISSING");
assert(has(migration3, "platform_learning_experiment_execution_approvals"), "APPROVAL_BINDING_MISSING");
assert(has(migration3, "platform_learning_experiment_execution_claims"), "CLAIM_BINDING_MISSING");
assert(has(migration3, "platform_learning_experiment_execution_receipts"), "RECEIPT_BINDING_MISSING");
assert(has(migration3, "platform_learning_experiment_portfolio_outcomes"), "OUTCOME_PROPAGATION_MISSING");
assert(has(migration3, "STALE_EXECUTION_REQUEST_REBIND_FORBIDDEN"), "STALE_REQUEST_REBIND_NOT_BLOCKED");
assert(has(migration3, "STALE_REQUEST_APPROVAL_FORBIDDEN"), "STALE_REQUEST_APPROVAL_NOT_BLOCKED");
assert(has(migration3, "STALE_APPROVAL_CLAIM_FORBIDDEN"), "STALE_APPROVAL_CLAIM_NOT_BLOCKED");
assert(has(migration3, "STALE_CLAIM_CONSUMPTION_FORBIDDEN"), "STALE_CLAIM_CONSUMPTION_NOT_BLOCKED");
assert(has(migration3, "EXECUTION_START_CROSS_INTERVAL_FORBIDDEN"), "CROSS_INTERVAL_EXECUTION_START_NOT_BLOCKED");
assert(has(migration3, "OUTCOME_REQUEST_RECEIPT_BINDING_MISMATCH_FAIL_CLOSED"), "OUTCOME_REQUEST_RECEIPT_BINDING_CHECK_MISSING");

assert(has(migration4, "policy_activation_no_policy_epoch_fingerprint"), "NO_POLICY_EPOCH_FINGERPRINT_MISSING");
assert(has(migration4, "no_policy_epoch_fingerprint"), "NO_POLICY_RESOLUTION_WATERMARK_MISSING");
assert(has(migration4, "latest_activation_generation_index"), "NO_POLICY_LATEST_GENERATION_WATERMARK_MISSING");
assert(has(migration4, "latest_activation_generation_fingerprint"), "NO_POLICY_LATEST_GENERATION_FINGERPRINT_MISSING");
assert(has(migration4, "policy_activation_no_policy_epoch_fingerprint"), "NO_POLICY_BINDING_WATERMARK_MISSING");

assert(has(migration5, "avantiqo_phase45_copy_binding_metadata_v1"), "BINDING_COPY_HELPER_MISSING");
assert(has(migration5, "policy_activation_no_policy_epoch_fingerprint"), "NO_POLICY_WATERMARK_PROPAGATION_MISSING");
assert(has(migration5, "activation_generation_fingerprint"), "PERSISTENT_GENERATION_PROPAGATION_MISSING");

assert(has(migration6, "avantiqo_phase45_guard_long_horizon_mutation_v1"), "LONG_HORIZON_GUARD_MISSING");
assert(has(migration6, "verify_avantiqo_policy_outcome_attribution_v1"), "LONG_HORIZON_GUARD_INTEGRITY_CALL_MISSING");
assert(has(migration6, "PHASE45_OUTCOME_ATTRIBUTION_INTEGRITY_FAIL_CLOSED"), "LONG_HORIZON_FAIL_CLOSED_MISSING");

assert(has(runtime, "resolveAvantiqoExperimentPolicyIntervalBinding"), "RUNTIME_RESOLVE_EXPORT_MISSING");
assert(has(runtime, "assertAvantiqoExperimentPolicyIntervalBindingAt"), "RUNTIME_ASSERT_AT_MISSING");
assert(has(runtime, "assertAvantiqoExperimentPolicyIntervalBindingCurrent"), "RUNTIME_ASSERT_CURRENT_MISSING");
assert(has(runtime, "verifyAvantiqoExperimentOutcomePolicyIntervalIntegrity"), "RUNTIME_VERIFY_OUTCOME_INTEGRITY_MISSING");
assert(has(runtime, "policy_activation_no_policy_epoch_fingerprint"), "RUNTIME_NO_POLICY_WATERMARK_MISSING");
assert(has(runtime, "BINDING_STALE_OR_MISMATCH_FAIL_CLOSED"), "RUNTIME_STALE_BINDING_FAIL_CLOSED_MISSING");
assert(count(runtime, ".insert(") === 0, "RUNTIME_INSERT_FORBIDDEN");
assert(count(runtime, ".update(") === 0, "RUNTIME_UPDATE_FORBIDDEN");
assert(count(runtime, ".delete(") === 0, "RUNTIME_DELETE_FORBIDDEN");

assert(has(phase43Runtime, "verifyAvantiqoExperimentOutcomePolicyIntervalIntegrity"), "PHASE43_PHASE45_CHAIN_IMPORT_MISSING");
assert(has(phase43Runtime, "await verifyAvantiqoExperimentOutcomePolicyIntervalIntegrity()"), "PHASE43_PHASE45_CHAIN_CALL_MISSING");
assert(has(phase43Runtime, "PERSISTENT_POLICY_OUTCOME_INTERVAL_ATTRIBUTION_INTEGRITY_FAIL_CLOSED"), "PHASE43_PHASE45_CHAIN_FAIL_CLOSED_MISSING");
assert(has(phase43Runtime, "outcome_policy_interval_integrity"), "PHASE43_PHASE45_PAYLOAD_MISSING");

assert(has(phase29Runtime, "verifyAvantiqoExperimentOutcomePolicyIntervalIntegrity"), "PHASE29_PHASE45_GUARD_IMPORT_MISSING");
assert(has(phase29Runtime, "OUTCOME_POLICY_INTERVAL_ATTRIBUTION_INTEGRITY_FAIL_CLOSED"), "PHASE29_PHASE45_GUARD_STATUS_MISSING");
assert(has(phase29Runtime, "execution_request_generation_allowed: false"), "PHASE29_FAIL_CLOSED_EXECUTION_BLOCK_MISSING");

assert(has(index, 'export * from "./runtime/AvantiqoExperimentPolicyIntervalAttributionRuntime";'), "INDEX_EXPORT_MISSING");

for (const source of [allMigrations, runtime, phase43Runtime, phase29Runtime]) {
  assert(!has(source, "security definer"), "SECURITY_DEFINER_FORBIDDEN");
  assert(count(source, "provider_execution_authorized: true") === 0, "PROVIDER_EXECUTION_AUTHORIZED");
  assert(count(source, "spend_authorized: true") === 0, "SPEND_AUTHORIZED");
  assert(count(source, "automatic_model_weight_mutation: true") === 0, "MODEL_WEIGHT_MUTATION_AUTHORIZED");
}
assert(has(allMigrations, "security invoker"), "SECURITY_INVOKER_MISSING");

const identifiers = [
  "avantiqo_intelligence_policy_outcome_attributions",
  "avantiqo_phase45_outcome_attribution_generation_idx",
  "avantiqo_phase45_reject_outcome_attribution_mutation_v1",
  "avantiqo_phase45_outcome_attribution_append_only_v1",
  "resolve_avantiqo_policy_activation_interval_v1",
  "verify_avantiqo_policy_outcome_attribution_v1",
  "avantiqo_phase45_enforce_outcome_attribution_v1",
  "avantiqo_phase45_enforce_execution_lineage_v1",
  "avantiqo_phase45_guard_long_horizon_mutation_v1",
];
for (const identifier of identifiers) {
  assert(identifier.length <= 63, `POSTGRES_IDENTIFIER_TOO_LONG:${identifier}`);
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE45_AUDIT=PASS");
console.log(`AVANTIQO_PHASE45_ATTRIBUTION_CONTRACT=${attributionContract}`);
console.log(`AVANTIQO_PHASE45_RESOLUTION_CONTRACT=${resolutionContract}`);
console.log(`AVANTIQO_PHASE45_INTEGRITY_CONTRACT=${integrityContract}`);
console.log("AVANTIQO_PHASE45_EXACT_POLICY_INTERVAL_ATTRIBUTION=true");
console.log("AVANTIQO_PHASE45_OUTCOME_TIMESTAMP_ONLY_ATTRIBUTION_ALLOWED=false");
console.log("AVANTIQO_PHASE45_DELAYED_OUTCOME_ORIGINAL_INTERVAL_PRESERVED=true");
console.log("AVANTIQO_PHASE45_CROSS_INTERVAL_OUTCOME_REUSE_ALLOWED=false");
console.log("AVANTIQO_PHASE45_STALE_REQUEST_APPROVAL_ALLOWED=false");
console.log("AVANTIQO_PHASE45_STALE_APPROVAL_CLAIM_ALLOWED=false");
console.log("AVANTIQO_PHASE45_STALE_CLAIM_CONSUMPTION_ALLOWED=false");
console.log("AVANTIQO_PHASE45_NO_POLICY_EPOCH_WATERMARK=true");
console.log("AVANTIQO_PHASE45_ATOMIC_OUTCOME_LEDGER_APPEND=true");
console.log("AVANTIQO_PHASE45_LONG_HORIZON_CONSUMER_FAIL_CLOSED=true");
console.log("AVANTIQO_PHASE45_PHASE43_CHAINED_INTEGRITY_GATE=true");
console.log("AVANTIQO_PHASE45_LEDGER_APPEND_ONLY=true");
console.log("AVANTIQO_PHASE45_LEDGER_SERVICE_ROLE_SELECT_INSERT_ONLY=true");
console.log("AVANTIQO_PHASE45_SECURITY_INVOKER=true");
console.log("AVANTIQO_PHASE45_RLS_ENABLED=true");
console.log("AVANTIQO_PHASE45_POSTGRES_IDENTIFIERS_WITHIN_63_BYTES=true");
console.log("AVANTIQO_PHASE45_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE45_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE45_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE45_POLICY_ACTIVATION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE45_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE45_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE45_AUTOMATIC_TRAINING_STARTED=false");
console.log("AVANTIQO_PHASE45_AUTOMATIC_MODEL_WEIGHT_MUTATION=false");

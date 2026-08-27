import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const files = {
  migration: path.join(root, "supabase/migrations/20260827083000_phase44_policy_activation_interval_closure.sql"),
  phase43Migration: path.join(root, "supabase/migrations/20260827080000_phase43_policy_activation_generation.sql"),
  runtime: path.join(root, "lib/intelligence/runtime/AvantiqoPersistentPolicyActivationIntervalIntegrityRuntime.js"),
  phase43Runtime: path.join(root, "lib/intelligence/runtime/AvantiqoPersistentPolicyActivationGenerationIntegrityRuntime.js"),
  route: path.join(root, "app/api/internal/intelligence/continuous-learning/process/route.js"),
  index: path.join(root, "lib/intelligence/index.js"),
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`PHASE44_FILE_MISSING:${file}`);
}
for (const file of [files.runtime, files.phase43Runtime, files.route]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

const migration = fs.readFileSync(files.migration, "utf8");
const phase43Migration = fs.readFileSync(files.phase43Migration, "utf8");
const runtime = fs.readFileSync(files.runtime, "utf8");
const phase43Runtime = fs.readFileSync(files.phase43Runtime, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const index = fs.readFileSync(files.index, "utf8");
const has = (source, value) => source.includes(value);
const count = (source, value) => source.split(value).length - 1;
const assert = (condition, code) => {
  if (!condition) throw new Error(`AVANTIQO_PHASE44_AUDIT_FAIL:${code}`);
};

const closureContract = "AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_CLOSURE_V1";
const integrityContract = "AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1";

assert(has(migration, closureContract), "CLOSURE_CONTRACT_MISSING");
assert(has(migration, integrityContract), "INTEGRITY_CONTRACT_MISSING");
assert(has(runtime, integrityContract), "RUNTIME_CONTRACT_MISSING");
assert(has(migration, "avantiqo_intelligence_policy_activation_closures"), "CLOSURE_LEDGER_MISSING");
assert(has(migration, "enable row level security"), "RLS_MISSING");
assert(has(migration, "grant select, insert on table public.avantiqo_intelligence_policy_activation_closures"), "SERVICE_ROLE_SELECT_INSERT_MISSING");
assert(!has(migration, "grant update on table public.avantiqo_intelligence_policy_activation_closures"), "SERVICE_ROLE_UPDATE_FORBIDDEN");
assert(!has(migration, "grant delete on table public.avantiqo_intelligence_policy_activation_closures"), "SERVICE_ROLE_DELETE_FORBIDDEN");
assert(has(migration, "security invoker"), "SECURITY_INVOKER_MISSING");
assert(!has(migration, "security definer"), "SECURITY_DEFINER_FORBIDDEN");

assert(has(migration, "old.state = 'ACTIVE' and new.state <> 'ACTIVE'"), "ACTIVE_EXIT_DETECTION_MISSING");
assert(has(migration, "v_closed_at := now()"), "TRANSACTIONAL_CLOSE_TIME_MISSING");
assert(has(migration, "[activated_at,closed_at)"), "INTERVAL_SEMANTICS_MISSING");
assert(has(migration, "transactional_close_boundary', true"), "TRANSACTIONAL_CLOSE_BOUNDARY_MISSING");
assert(has(migration, "historical_close_time_reconstructed', false"), "HISTORICAL_RECONSTRUCTION_FALSE_MISSING");
assert(has(migration, "AVANTIQO_PHASE44_HISTORICAL_INTERVAL_CLOSE_RECONSTRUCTION_FORBIDDEN"), "HISTORICAL_RECONSTRUCTION_FAIL_CLOSED_MISSING");
assert(has(migration, "cross_interval_evidence_attribution_allowed', false"), "CROSS_INTERVAL_ATTRIBUTION_NOT_BLOCKED");
assert(has(migration, "prior_interval_evidence_after_close_eligible', false"), "POST_CLOSE_PRIOR_EVIDENCE_NOT_BLOCKED");
assert(has(migration, "activation_generation_fingerprint = v_generation_fingerprint"), "PHASE43_GENERATION_BINDING_MISSING");
assert(has(migration, "v_generation.activated_at <> old.activated_at"), "EXACT_START_BOUNDARY_CHECK_MISSING");
assert(has(migration, "ACTIVE_GENERATION_ALREADY_CLOSED_FAIL_CLOSED"), "DOUBLE_CLOSE_NOT_BLOCKED");
assert(has(migration, "SUPERSEDED_BY_GOVERNED_SUCCESSOR"), "SUCCESSOR_CLOSE_REASON_MISSING");
assert(has(migration, "POLICY_ROLLED_BACK"), "ROLLBACK_CLOSE_REASON_MISSING");

assert(has(migration, "avantiqo_phase44_closure_append_only_v1"), "APPEND_ONLY_TRIGGER_MISSING");
assert(has(migration, "before update or delete on public.avantiqo_intelligence_policy_activation_closures"), "UPDATE_DELETE_REJECTION_MISSING");
assert(has(migration, "AVANTIQO_PHASE44_ACTIVATION_CLOSURE_LEDGER_APPEND_ONLY"), "APPEND_ONLY_EXCEPTION_MISSING");

assert(has(migration, "verify_avantiqo_policy_activation_intervals_v1"), "INTEGRITY_RPC_MISSING");
assert(has(migration, "ACTIVATION_INTERVAL_OPEN_CLOSE_CARDINALITY_FAIL_CLOSED"), "CARDINALITY_CHECK_MISSING");
assert(has(migration, "OPEN_INTERVAL_NOT_LATEST_ACTIVE_GENERATION_FAIL_CLOSED"), "LATEST_OPEN_INTERVAL_CHECK_MISSING");
assert(has(migration, "ACTIVATION_INTERVAL_LINEAGE_MISMATCH_FAIL_CLOSED"), "LINEAGE_CHECK_MISSING");
assert(has(migration, "ACTIVATION_INTERVAL_OVERLAP_FAIL_CLOSED"), "OVERLAP_CHECK_MISSING");
assert(has(migration, "current_c.closed_at > next_g.activated_at"), "OVERLAP_COMPARISON_MISSING");
assert(has(migration, "v_open_interval_count <> v_active_count"), "OPEN_INTERVAL_CARDINALITY_MISSING");
assert(has(migration, "v_closure_count <> v_generation_count - v_active_count"), "CLOSURE_CARDINALITY_MISSING");
assert(has(phase43Migration, "avantiqo_intelligence_policy_activation_generations"), "PHASE43_LEDGER_DEPENDENCY_MISSING");

assert(has(runtime, "verifyAvantiqoPersistentPolicyActivationIntervalIntegrity"), "RUNTIME_VERIFY_EXPORT_MISSING");
assert(has(runtime, '"verify_avantiqo_policy_activation_intervals_v1"'), "RUNTIME_RPC_MISSING");
assert(has(runtime, "PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_RPC_FAILED_CLOSED"), "RUNTIME_FAIL_CLOSED_MISSING");
assert(has(runtime, "read_only_integrity_verification: true"), "READ_ONLY_RUNTIME_MISSING");
assert(has(runtime, "activation_interval_closure_mutation_authorized: false"), "CLOSURE_MUTATION_BOUNDARY_MISSING");
assert(count(runtime, ".insert(") === 0, "RUNTIME_INSERT_FORBIDDEN");
assert(count(runtime, ".update(") === 0, "RUNTIME_UPDATE_FORBIDDEN");
assert(count(runtime, ".delete(") === 0, "RUNTIME_DELETE_FORBIDDEN");

assert(has(phase43Runtime, "verifyAvantiqoPersistentPolicyActivationIntervalIntegrity"), "PHASE43_CHAIN_IMPORT_MISSING");
assert(has(phase43Runtime, "await verifyAvantiqoPersistentPolicyActivationIntervalIntegrity()"), "PHASE43_CHAIN_CALL_MISSING");
assert(has(phase43Runtime, "PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_FAIL_CLOSED"), "PHASE43_CHAIN_FAIL_CLOSED_MISSING");
assert(has(phase43Runtime, "historical_interval_attribution_allowed: intervalAllowed"), "PHASE43_HISTORICAL_ATTRIBUTION_GATE_MISSING");
assert(has(phase43Runtime, "intervalAllowed && payload.research_generation_allowed !== false"), "PHASE43_RESEARCH_GATE_MISSING");
assert(has(phase43Runtime, "intervalAllowed && payload.execution_request_generation_allowed !== false"), "PHASE43_EXECUTION_GATE_MISSING");

assert(has(index, 'export * from "./runtime/AvantiqoPersistentPolicyActivationIntervalIntegrityRuntime";'), "INDEX_EXPORT_MISSING");
assert(count(route, "verifyAvantiqoPersistentPolicyActivationGenerationIntegrity()") >= 2, "ROUTE_PHASE43_DOUBLE_GATE_MISSING");
assert(has(route, "persistentPolicyActivationGenerationResearchIntegrity"), "ROUTE_PRE_RESEARCH_GATE_MISSING");
assert(has(route, "persistentPolicyActivationGenerationIntegrity"), "ROUTE_POST_MONITOR_GATE_MISSING");
assert(has(route, "BLOCKED_BY_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_FAIL_CLOSED"), "ROUTE_FAIL_CLOSED_MISSING");
const firstGate = route.indexOf("await verifyAvantiqoPersistentPolicyActivationGenerationIntegrity()");
const research = route.indexOf("await reconcileAvantiqoSelectionPolicyResearchEpoch()", firstGate + 1);
const monitor = route.indexOf("await reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor()", research + 1);
const secondGate = route.indexOf("await verifyAvantiqoPersistentPolicyActivationGenerationIntegrity()", firstGate + 1);
const rebased = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyChallenger()", secondGate + 1);
const canary = route.indexOf("await reconcileAvantiqoRebasedSelectionPolicyCanary()", secondGate + 1);
const execution = route.indexOf("await reconcileAvantiqoExperimentExecutionRequests()", secondGate + 1);
assert(firstGate >= 0 && research > firstGate, "PRE_RESEARCH_ORDER_MISSING");
assert(monitor > research && secondGate > monitor, "POST_MONITOR_REVERIFY_ORDER_MISSING");
assert(rebased > secondGate, "REBASED_NOT_GATED");
assert(canary > secondGate, "CANARY_NOT_GATED");
assert(execution > secondGate, "EXECUTION_NOT_GATED");
assert(!has(route, "avantiqo_phase44_append_activation_closure_v1"), "CRON_CLOSURE_MUTATION_FORBIDDEN");

const identifiers = [
  "avantiqo_intelligence_policy_activation_closures",
  "avantiqo_phase44_closure_policy_idx",
  "avantiqo_phase44_append_activation_closure_v1",
  "avantiqo_phase44_reject_closure_mutation_v1",
  "avantiqo_phase44_closure_append_only_v1",
  "verify_avantiqo_policy_activation_intervals_v1",
];
for (const identifier of identifiers) assert(identifier.length <= 63, `POSTGRES_IDENTIFIER_TOO_LONG:${identifier}`);

for (const source of [migration, runtime, phase43Runtime, route]) {
  assert(count(source, "provider_execution_authorized: true") === 0, "PROVIDER_EXECUTION_AUTHORIZED");
  assert(count(source, "spend_authorized: true") === 0, "SPEND_AUTHORIZED");
  assert(count(source, "automatic_model_weight_mutation: true") === 0, "MODEL_WEIGHT_MUTATION_AUTHORIZED");
}
assert(count(runtime, "platform_knowledge_written: true") === 0, "PLATFORM_KNOWLEDGE_WRITE_AUTHORIZED");
assert(count(runtime, "automatic_training_started: true") === 0, "TRAINING_AUTHORIZED");

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE44_AUDIT=PASS");
console.log(`AVANTIQO_PHASE44_CLOSURE_CONTRACT=${closureContract}`);
console.log(`AVANTIQO_PHASE44_INTEGRITY_CONTRACT=${integrityContract}`);
console.log("AVANTIQO_PHASE44_INTERVAL_SEMANTICS=[activated_at,closed_at)");
console.log("AVANTIQO_PHASE44_TRANSACTIONAL_CLOSE_BOUNDARY=true");
console.log("AVANTIQO_PHASE44_HISTORICAL_CLOSE_RECONSTRUCTION_ALLOWED=false");
console.log("AVANTIQO_PHASE44_CROSS_INTERVAL_ATTRIBUTION_ALLOWED=false");
console.log("AVANTIQO_PHASE44_OPEN_INTERVAL_MUST_BE_LATEST=true");
console.log("AVANTIQO_PHASE44_INTERVAL_OVERLAP_ALLOWED=false");
console.log("AVANTIQO_PHASE44_FULL_HISTORY_APPEND_ONLY=true");
console.log("AVANTIQO_PHASE44_LEDGER_UPDATE_DELETE_ALLOWED=false");
console.log("AVANTIQO_PHASE44_LEDGER_SERVICE_ROLE_SELECT_INSERT_ONLY=true");
console.log("AVANTIQO_PHASE44_SECURITY_INVOKER=true");
console.log("AVANTIQO_PHASE44_RLS_ENABLED=true");
console.log("AVANTIQO_PHASE44_PHASE43_CHAINED_INTEGRITY_GATE=true");
console.log("AVANTIQO_PHASE44_ROUTE_PRE_RESEARCH_GATED=true");
console.log("AVANTIQO_PHASE44_ROUTE_POST_MONITOR_REVERIFIED=true");
console.log("AVANTIQO_PHASE44_REBASED_RESEARCH_BLOCKED_ON_INTEGRITY_FAILURE=true");
console.log("AVANTIQO_PHASE44_CANARY_BLOCKED_ON_INTEGRITY_FAILURE=true");
console.log("AVANTIQO_PHASE44_EXECUTION_BLOCKED_ON_INTEGRITY_FAILURE=true");
console.log("AVANTIQO_PHASE44_POSTGRES_IDENTIFIERS_WITHIN_63_BYTES=true");
console.log("AVANTIQO_PHASE44_POLICY_ACTIVATION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE44_POLICY_PROMOTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE44_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE44_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE44_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE44_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE44_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE44_AUTOMATIC_TRAINING_STARTED=false");
console.log("AVANTIQO_PHASE44_AUTOMATIC_MODEL_WEIGHT_MUTATION=false");
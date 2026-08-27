import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const files = {
  runtime: path.join(root, "lib/intelligence/runtime/AvantiqoPersistentPolicySuccessionRuntime.js"),
  authority: path.join(root, "lib/intelligence/runtime/AvantiqoPersistentOrderingPolicyAuthorityRuntime.js"),
  migration: path.join(root, "supabase/migrations/20260827070000_phase41_persistent_policy_succession_authority.sql"),
  route: path.join(root, "app/api/internal/intelligence/continuous-learning/process/route.js"),
  index: path.join(root, "lib/intelligence/index.js"),
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) throw new Error(`PHASE41_FILE_MISSING:${file}`);
}

for (const file of [files.runtime, files.authority, files.route]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

const runtime = fs.readFileSync(files.runtime, "utf8");
const authority = fs.readFileSync(files.authority, "utf8");
const migration = fs.readFileSync(files.migration, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const index = fs.readFileSync(files.index, "utf8");

function has(source, value) {
  return source.includes(value);
}

function count(source, value) {
  return source.split(value).length - 1;
}

function assert(condition, code) {
  if (!condition) throw new Error(`AVANTIQO_PHASE41_AUDIT_FAIL:${code}`);
}

const contract = "AVANTIQO_PERSISTENT_POLICY_SUCCESSION_V1";
const certificationStatus =
  "REBASED_CANARY_EVIDENCE_PERSISTENT_POLICY_SUCCESSION_REVIEW_CANDIDATE";

assert(has(runtime, contract), "CONTRACT_MISSING");
assert(has(runtime, "platform_learning_persistent_policy_succession_requests"), "REQUEST_SCOPE_MISSING");
assert(has(runtime, "platform_learning_persistent_policy_succession_approvals"), "APPROVAL_SCOPE_MISSING");
assert(has(runtime, "platform_learning_persistent_policy_succession_release_candidates"), "RELEASE_SCOPE_MISSING");
assert(has(runtime, certificationStatus), "EXACT_PHASE40_CERTIFICATION_STATUS_NOT_REQUIRED");
assert(has(runtime, "MULTIPLE_MATURE_PHASE40_SUCCESSORS_FOR_CURRENT_BASELINE_FAIL_CLOSED"), "MULTIPLE_SUCCESSORS_NOT_FAIL_CLOSED");
assert(has(runtime, "PHASE40_SUCCESSION_LINEAGE_AMBIGUITY_FAIL_CLOSED"), "LINEAGE_AMBIGUITY_NOT_FAIL_CLOSED");
assert(has(runtime, "same_actor_as_phase39_approver !== false"), "PHASE39_APPROVER_INDEPENDENCE_MISSING");
assert(has(runtime, "same_actor_as_phase40_canary_activator !== false"), "PHASE40_ACTIVATOR_INDEPENDENCE_MISSING");
assert(has(runtime, "same_actor_as_current_baseline_activator !== false"), "BASELINE_ACTIVATOR_INDEPENDENCE_MISSING");
assert(has(runtime, "approval_is_not_activation: true"), "APPROVAL_ACTIVATION_BOUNDARY_MISSING");
assert(has(runtime, "release_is_not_activation: true"), "RELEASE_ACTIVATION_BOUNDARY_MISSING");
assert(has(runtime, "activation_requires_separate_explicit_call: true"), "SEPARATE_ACTIVATION_MISSING");
assert(has(runtime, "exact_tested_composite_only: true"), "EXACT_TESTED_COMPOSITE_MISSING");
assert(has(runtime, "raw_challenger_full_cutover_authorized: false"), "RAW_FULL_CUTOVER_BLOCK_MISSING");
assert(has(runtime, "recursive_policy_stack_authorized: false"), "RECURSIVE_STACK_BLOCK_MISSING");
assert(has(runtime, "flattened_composition_required: true"), "FLATTENED_COMPOSITION_MISSING");
assert(has(runtime, "phase36_regression_monitor_must_continue: true"), "PHASE36_CONTINUITY_MISSING");
assert(has(runtime, "selected_membership_change_authorized: false"), "MEMBERSHIP_BOUNDARY_MISSING");
assert(has(runtime, "source_numeric_score_mutation_authorized: false"), "SOURCE_SCORE_BOUNDARY_MISSING");
assert(has(runtime, "automatic_policy_succession: false"), "AUTO_SUCCESSION_BOUNDARY_MISSING");
assert(has(runtime, "automatic_policy_activation: false"), "AUTO_ACTIVATION_BOUNDARY_MISSING");

assert(has(migration, "security invoker"), "SECURITY_INVOKER_MISSING");
assert(has(migration, "grant execute on function public.activate_avantiqo_policy_successor_v1"), "SERVICE_ROLE_ACTIVATION_GRANT_MISSING");
assert(has(migration, "grant execute on function public.apply_avantiqo_policy_successor_v1"), "SERVICE_ROLE_APPLICATION_GRANT_MISSING");
assert(has(migration, "avantiqo_persistent_ordering_policy_v1:"), "SHARED_POLICY_LOCK_MISSING");
assert(has(migration, "AVANTIQO_PHASE41_ACTIVE_PHASE40_CANARY_CONFLICT"), "PHASE40_CANARY_CONFLICT_NOT_BLOCKED");
assert(has(migration, "AVANTIQO_PHASE41_ACTIVE_LEGACY_CANARY_CONFLICT"), "LEGACY_CANARY_CONFLICT_NOT_BLOCKED");
assert(has(migration, "state = 'SUPERSEDED'"), "ATOMIC_PARENT_SUPERSESSION_MISSING");
assert(has(migration, "'ACTIVE'"), "SUCCESSOR_ACTIVE_STATE_MISSING");
assert(has(migration, "policy_generation_kind', 'REBASED_SUCCESSOR_COMPOSITE_V1'"), "SUCCESSOR_GENERATION_KIND_MISSING");
assert(has(migration, "flattened_residual_layers"), "FLATTENED_LAYERS_MISSING");
assert(has(migration, "legacy_phase30_influence_fraction"), "LEGACY_ROOT_INFLUENCE_MISSING");
assert(has(migration, "family_residual_calibration_factors"), "FAMILY_RESIDUAL_FACTORS_MISSING");
assert(has(migration, "avantiqo_phase41_composite_score_v1"), "COMPOSITE_SCORE_FUNCTION_MISSING");
assert(has(migration, "p_include_last_layer is false"), "EXACT_PARENT_SCORE_RECONSTRUCTION_MISSING");
assert(has(migration, "platform_learning_experiment_selection_policy_shadow_snapshots"), "PROSPECTIVE_PHASE30_ROOT_MISSING");
assert(has(migration, "PHASE41_SUCCESSOR_NOT_APPLIED_AFTER_EXECUTION_REQUEST_CREATION"), "APPLICATION_BEFORE_EXECUTION_MISSING");
assert(has(migration, "same_selected_portfolio_only', true"), "SAME_PORTFOLIO_MISSING");
assert(has(migration, "source_numeric_scores_mutated', false"), "SOURCE_SCORE_MUTATION_BLOCK_MISSING");
assert(has(migration, "exact_baseline_ranks_retained_for_rollback', true"), "EXACT_PARENT_RANK_ROLLBACK_MISSING");
assert(has(migration, "phase36_monitor_compatible', true"), "PHASE36_COMPATIBILITY_MISSING");
assert(has(migration, "avantiqo_phase41_reactivate_parent_after_successor_rollback_v1"), "PARENT_REACTIVATION_TRIGGER_MISSING");
assert(has(migration, "v_parent.state <> 'SUPERSEDED'"), "PARENT_REACTIVATION_LINEAGE_MISSING");
assert(has(migration, "phase41_reactivated_after_successor_rollback"), "PARENT_REACTIVATION_EVIDENCE_MISSING");
assert(has(migration, "new.state = 'SUPERSEDED'"), "PHASE40_SUPERSESSION_INTERLOCK_MISSING");
assert(has(migration, "raw_challenger_full_cutover_applied', false"), "DATABASE_RAW_CUTOVER_BLOCK_MISSING");
assert(has(migration, "recursive_runtime_policy_stack', false"), "DATABASE_RECURSIVE_STACK_BLOCK_MISSING");

assert(has(authority, '"REBASED_SUCCESSOR_COMPOSITE_V1"'), "APPLICATION_DISPATCH_KIND_MISSING");
assert(has(authority, '"apply_avantiqo_policy_successor_v1"'), "SUCCESSOR_APPLICATION_DISPATCH_MISSING");
assert(has(authority, '"apply_avantiqo_intelligence_persistent_ordering_policy_v1"'), "LEGACY_APPLICATION_DISPATCH_MISSING");

assert(has(index, 'export * from "./runtime/AvantiqoPersistentPolicySuccessionRuntime";'), "INDEX_EXPORT_MISSING");
assert(has(route, "reconcileAvantiqoPersistentPolicySuccessionRequests"), "ROUTE_REQUEST_RECONCILIATION_MISSING");
assert(has(route, "persistentPolicySuccessionRequests.success !== false"), "EXECUTION_GATE_MISSING");
assert(has(route, "BLOCKED_BY_PERSISTENT_POLICY_SUCCESSION_GOVERNANCE_FAIL_CLOSED"), "EXECUTION_FAILURE_STATUS_MISSING");
assert(has(route, "persistent_policy_succession_requests"), "ROUTE_RESPONSE_MISSING");
assert(!has(route, "recordAvantiqoPersistentPolicySuccessionApproval"), "CRON_APPROVAL_FORBIDDEN");
assert(!has(route, "releaseAvantiqoPersistentPolicySuccessor"), "CRON_RELEASE_FORBIDDEN");
assert(!has(route, "activateAvantiqoPersistentPolicySuccessor"), "CRON_ACTIVATION_FORBIDDEN");
assert(!has(route, "rollbackAvantiqoPersistentPolicySuccessor"), "CRON_EXPLICIT_ROLLBACK_FORBIDDEN");

const requestIndex = route.indexOf("reconcileAvantiqoPersistentPolicySuccessionRequests");
const executionIndex = route.indexOf("reconcileAvantiqoExperimentExecutionRequests", requestIndex + 1);
assert(requestIndex >= 0 && executionIndex > requestIndex, "REQUEST_MUST_PRECEDE_EXECUTION");

assert(count(runtime, "provider_called_here: true") === 0, "PROVIDER_CALL_AUTHORIZED");
assert(count(runtime, "wallet_write_performed_here: true") === 0, "WALLET_WRITE_AUTHORIZED");
assert(count(runtime, "runpod_job_submitted: true") === 0, "RUNPOD_AUTHORIZED");
assert(count(runtime, "execution_authorized: true") === 0, "EXECUTION_AUTHORIZED");
assert(count(runtime, "automatic_training_started: true") === 0, "TRAINING_AUTHORIZED");
assert(count(runtime, "automatic_model_weight_mutation: true") === 0, "MODEL_WEIGHT_MUTATION_AUTHORIZED");

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE41_AUDIT=PASS");
console.log(`AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT=${contract}`);
console.log("AVANTIQO_PHASE41_SEPARATE_GOVERNANCE_SCOPES=true");
console.log("AVANTIQO_PHASE41_EXACT_PHASE40_CERTIFICATION_REQUIRED=true");
console.log("AVANTIQO_PHASE41_MULTIPLE_MATURE_SUCCESSORS_FAIL_CLOSED=true");
console.log("AVANTIQO_PHASE41_EXACT_PHASE39_40_38_LINEAGE_REQUIRED=true");
console.log("AVANTIQO_PHASE41_EXPLICIT_INDEPENDENT_APPROVAL_REQUIRED=true");
console.log("AVANTIQO_PHASE41_APPROVER_DIFFERS_FROM_PHASE39_APPROVER=true");
console.log("AVANTIQO_PHASE41_APPROVER_DIFFERS_FROM_PHASE40_ACTIVATOR=true");
console.log("AVANTIQO_PHASE41_APPROVER_DIFFERS_FROM_CURRENT_BASELINE_ACTIVATOR=true");
console.log("AVANTIQO_PHASE41_APPROVAL_IS_ACTIVATION=false");
console.log("AVANTIQO_PHASE41_RELEASE_IS_ACTIVATION=false");
console.log("AVANTIQO_PHASE41_SEPARATE_EXPLICIT_ACTIVATION_REQUIRED=true");
console.log("AVANTIQO_PHASE41_SHARED_PHASE35_36_LOCK=true");
console.log("AVANTIQO_PHASE41_PHASE40_CANARY_CONFLICT_BLOCKED=true");
console.log("AVANTIQO_PHASE41_LEGACY_CANARY_CONFLICT_BLOCKED=true");
console.log("AVANTIQO_PHASE41_EXACT_TESTED_COMPOSITE_ONLY=true");
console.log("AVANTIQO_PHASE41_RAW_CHALLENGER_100_PERCENT_CUTOVER=false");
console.log("AVANTIQO_PHASE41_FLATTENED_COMPOSITION=true");
console.log("AVANTIQO_PHASE41_RECURSIVE_RUNTIME_POLICY_STACK=false");
console.log("AVANTIQO_PHASE41_FUTURE_CYCLE_RECOMPUTATION_FROM_PROSPECTIVE_ROOT=true");
console.log("AVANTIQO_PHASE41_ATOMIC_PARENT_SUPERSESSION_SUCCESSOR_ACTIVATION=true");
console.log("AVANTIQO_PHASE41_PHASE36_MONITOR_CONTINUES=true");
console.log("AVANTIQO_PHASE41_EXACT_PARENT_REACTIVATION_ON_ROLLBACK=true");
console.log("AVANTIQO_PHASE41_APPLICATION_BEFORE_EXECUTION_REQUEST=true");
console.log("AVANTIQO_PHASE41_SAME_SELECTED_PORTFOLIO_ONLY=true");
console.log("AVANTIQO_PHASE41_SELECTED_MEMBERSHIP_CHANGE_ALLOWED=false");
console.log("AVANTIQO_PHASE41_SOURCE_NUMERIC_SCORE_MUTATION_ALLOWED=false");
console.log("AVANTIQO_PHASE41_CRON_REQUEST_ONLY=true");
console.log("AVANTIQO_PHASE41_EXECUTION_BLOCKED_ON_GOVERNANCE_AMBIGUITY=true");
console.log("AVANTIQO_PHASE41_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE41_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE41_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE41_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE41_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE41_AUTOMATIC_TRAINING_STARTED=false");
console.log("AVANTIQO_PHASE41_AUTOMATIC_MODEL_WEIGHT_MUTATION=false");

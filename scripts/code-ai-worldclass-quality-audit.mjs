import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_SOURCE_AUDIT_V9";

const files = Object.freeze({
  qualityPolicy: "lib/code/runtime/CodeAIWorldClassQualityPolicy.js",
  behavioralVerification: "lib/code/runtime/CodeAIBehavioralVerificationRuntime.js",
  testProvenance: "lib/code/runtime/CodeAITestProvenanceRuntime.js",
  repairClosure: "lib/code/runtime/CodeAIRepairClosureRuntime.js",
  fastStart: "lib/code/runtime/CodeAIEmployeeFastStartRuntime.js",
  employee: "lib/code/runtime/CodeAIEmployeeRuntime.js",
  worldclass: "lib/code/runtime/CodeAIWorldClassRuntime.js",
  worldclassCommitGuard: "lib/code/runtime/CodeAIWorldClassCommitGuard.js",
  autonomousCapability: "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
  commitCapability: "lib/platform/capabilities/createCodeAICommitCapability.js",
  autonomous: "lib/code/runtime/CodeAIAutonomousRuntime.js",
  plannerPrompt: "lib/code/runtime/CodeAIPlannerPromptRuntime.js",
  mission: "lib/code/runtime/CodeAIMissionRuntime.js",
  workspace: "lib/code/runtime/CodeWorkspaceSandboxRuntime.js",
  commit: "lib/code/runtime/CodeGitHubCommitRuntime.js",
  lease: "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
  leasePolicy: "config/avantiqo-runpod-safe-lease-policy.json",
});

async function source(path) {
  try { return await readFile(path, "utf8"); }
  catch (error) { throw new Error(`${CONTRACT}_FILE_MISSING:${path}:${error?.code || "READ_FAILED"}`); }
}

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) throw new Error(`${CONTRACT}_${label}_MARKERS_MISSING:${missing.join("|")}`);
}

const [
  qualityPolicy,
  behavioralVerification,
  testProvenance,
  repairClosure,
  fastStart,
  employee,
  worldclass,
  worldclassCommitGuard,
  autonomousCapability,
  commitCapability,
  autonomous,
  plannerPrompt,
  mission,
  workspace,
  commit,
  lease,
  leasePolicySource,
] = await Promise.all(Object.values(files).map(source));

requireMarkers("QUALITY_POLICY", qualityPolicy, [
  "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
  "CODE_AI_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED",
  "CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED",
  "freshVerificationEvidence",
  "codeAIVerificationFamily",
  "fresh_verification_family_count",
  "requiredCodeAIVerificationGateCount",
  'if (risk === "critical") return 3',
  'if (risk === "high") return 2',
  "source_manifest_matches_workspace",
  "authorization_effect: \"NONE\"",
]);
if (/Sandbox|ServiceExecutionRuntime|RUNPOD|fetch\s*\(/.test(qualityPolicy)) {
  throw new Error(`${CONTRACT}_QUALITY_POLICY_MUST_REMAIN_PURE`);
}

requireMarkers("BEHAVIORAL_VERIFICATION", behavioralVerification, [
  "AVANTIQO_CODE_AI_BEHAVIORAL_VERIFICATION_V1",
  "OBSERVED_RELATED_TEST_FROM_REPOSITORY_EVIDENCE",
  "matched_impacted_test_paths",
  "broad_test_operation_ids",
  "repository_call_performed: false",
  "authorization_effect: \"NONE\"",
]);

requireMarkers("TEST_PROVENANCE", testProvenance, [
  "AVANTIQO_CODE_AI_TEST_PROVENANCE_V1",
  "ONLY_MISSION_MODIFIED_TEST_PROOF",
  "UNCHANGED_OBSERVED_RELATED_TEST",
  "BROAD_SUITE",
  "test_changes_can_self_certify_high_risk_behavior: false",
  "authorization_effect: \"NONE\"",
]);

requireMarkers("REPAIR_CLOSURE", repairClosure, [
  "AVANTIQO_CODE_AI_REPAIR_CLOSURE_V2",
  "SAME_VERIFICATION_COMMAND_SIGNATURE_MUST_PASS_AFTER_FAILURE_AND_FINAL_EDIT",
  "failed_verifier_count_after_final_edit",
  "unresolved_failed_verifier_count",
  "successful_post_edit_verifiers",
  "source_mutation_authority: false",
  "authorization_effect: \"NONE\"",
]);

requireMarkers("FAST_START", fastStart, [
  "AVANTIQO_CODE_AI_EMPLOYEE_FAST_START_V2",
  "ensureCodeAIWorkerSession",
  "Promise.all([preparationPromise, workerPromise])",
  'status: "worker_warming"',
  "executeCodeAIEmployeeMission",
  "model_call_required_to_start: false",
  "employee_fast_start_inspect",
  "employee_fast_start_read_",
]);

requireMarkers("EMPLOYEE_RUNTIME", employee, [
  "AVANTIQO_CODE_AI_EMPLOYEE_RUNTIME_V1",
  "AVANTIQO_CODE_AI_EMPLOYEE_COMPLETION_V2",
  "assessCodeAIWorldClassQuality",
  "assessCodeAIBehavioralVerificationCoverage",
  "assessCodeAITestProvenance",
  "assessCodeAIRepairClosure",
  "CODE_AI_EMPLOYEE_BEHAVIORAL_VERIFICATION_REQUIRED",
  "CODE_AI_EMPLOYEE_TEST_PROVENANCE_REQUIRED",
  "CODE_AI_EMPLOYEE_FAILED_VERIFIER_CLOSURE_REQUIRED",
  "behavioral_verification_required: true",
  "test_provenance_required_for_high_risk: true",
  "failed_verifier_closure_required: true",
  "continue_until_verified_complete",
  "required_next_actions",
]);

requireMarkers("WORLDCLASS_LEGACY_RUNTIME", worldclass, [
  "executeAutonomousCodeMission",
  "CodeAIWorldClassQualityPolicy.js",
  "assessCodeAIWorldClassQuality",
  "MAX_QUALITY_CONVERGENCE_PASSES",
  "canAutoConverge",
  "resume_state: state",
]);

requireMarkers("WORLDCLASS_COMMIT_GUARD", worldclassCommitGuard, [
  "AVANTIQO_CODE_AI_WORLDCLASS_COMMIT_GUARD_V5",
  "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
  "CODE_AI_COMMIT_WORLDCLASS_QUALITY_EVIDENCE_REQUIRED",
  "CODE_AI_COMMIT_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED",
  "CODE_AI_COMMIT_WORLDCLASS_SOURCE_MANIFEST_MISMATCH",
  "CODE_AI_COMMIT_WORLDCLASS_SUBSTANTIVE_VERIFICATION_REQUIRED",
  "CODE_AI_COMMIT_BEHAVIORAL_VERIFICATION_REQUIRED",
  "CODE_AI_COMMIT_INDEPENDENT_TEST_PROVENANCE_REQUIRED",
  "CODE_AI_COMMIT_FAILED_VERIFIER_CLOSURE_REQUIRED",
  "CODE_AI_COMMIT_FINAL_INDEPENDENT_REVIEW_REQUIRED",
  "assessCodeAIBehavioralVerificationCoverage",
  "assessCodeAITestProvenance",
  "assessCodeAIRepairClosure",
  "fresh_verification_family_count",
  "observedFamilies < required",
]);

requireMarkers("AUTONOMOUS_CAPABILITY", autonomousCapability, [
  "executeCodeAIEmployeeFastStartMission",
  "executeCodeAIEmployeeZeroIdleFastStartMission",
  "const executeFastStart = zeroIdle",
  "const result = await executeFastStart({",
  "CODE_AI_EMPLOYEE_FAST_START_CONTRACT",
  "CODE_AI_EMPLOYEE_RUNTIME_CONTRACT",
  "fresh-verification",
  "final-diff-review",
  "risk-sensitive-quality",
  "world-class-quality-gate",
  "persistCodeAICommitArtifact",
  "reasoning_call_budget",
]);
if (
  autonomousCapability.includes("executeWorldClassCodeMission({") ||
  autonomousCapability.includes("executeCodeAIEmployeeMission({")
) {
  throw new Error(`${CONTRACT}_PUBLIC_CAPABILITY_MUST_USE_FAST_START_EMPLOYEE_RUNTIME`);
}

requireMarkers("COMMIT_CAPABILITY", commitCapability, [
  "assertCodeAIWorldClassCommitReady",
  "world-class-quality-required",
  "fresh-verification-required",
  "final-diff-review-required",
  "worldclass_quality_verified: true",
  "operatorRequiresConfirmation: true",
]);

const commitScopeIndex = commitCapability.indexOf("assertMissionScope(missionState, context)");
const worldclassCommitIndex = commitCapability.indexOf("assertCodeAIWorldClassCommitReady(missionState)");
const recoveryIndex = commitCapability.indexOf("await recoverPriorAttempt");
if (commitScopeIndex < 0 || worldclassCommitIndex <= commitScopeIndex || recoveryIndex <= worldclassCommitIndex) {
  throw new Error(`${CONTRACT}_WORLDCLASS_COMMIT_GUARD_MUST_PRECEDE_RECOVERY_OR_WRITE`);
}

requireMarkers("AUTONOMOUS_RUNTIME", autonomous, [
  "buildCodeAIPlannerPromptTransport",
  "CODE_AI_AUTONOMOUS_CHANGED_MISSION_REQUIRES_VERIFICATION",
  "CODE_AI_AUTONOMOUS_ITERATION_BUDGET_EXHAUSTED",
]);

requireMarkers("PLANNER_PROMPT", plannerPrompt, [
  "AVANTIQO_CODE_AI_PLANNER_PROMPT_TRANSPORT_V1",
  "Inspect/search/read before editing when evidence is insufficient.",
  "When a command/test fails, inspect the failure and repair instead of claiming completion.",
  "Use verify after source changes.",
  "Use research only when current external technical evidence is genuinely needed.",
  "CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS = 24000",
  "worker_instruction_hard_limit_chars: 30000",
]);

requireMarkers("MISSION", mission, [
  "CODE_AI_COMMAND_MUTATED_SOURCE_USE_APPLY_FILES",
  "CODE_AI_UNDECLARED_SOURCE_MUTATION",
  "CODE_AI_CHANGED_FILES_REQUIRE_SUCCESSFUL_VERIFICATION",
  "CODE_AI_FINAL_DIFF_CHECK_FAILED",
  "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
]);

requireMarkers("WORKSPACE", workspace, [
  "Sandbox.create",
  'runtime: "node24"',
  "persistent: false",
  "CODE_AI_GIT_PUSH_REQUIRES_GOVERNED_COMMIT_RUNTIME",
  "CODE_AI_DEPLOYMENT_OR_DATABASE_TOOL_BLOCKED",
  "CODE_AI_ENV_FILE_WRITE_BLOCKED",
  "CODE_AI_GIT_METADATA_WRITE_BLOCKED",
  "CODE_AI_PATCH_TOO_LARGE_FOR_DURABLE_STATE",
  '"diff", "--binary", "--no-ext-diff"',
  '"diff", "--check"',
]);

requireMarkers("COMMIT", commit, [
  "verifyCodeMissionStateAttestation",
  "CODE_AI_GITHUB_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
  "base_tree",
  "force: false",
  "CODE_AI_GITHUB_POST_COMMIT_VERIFICATION_FAILED",
  "assertCodeProductCompletionCriteriaVerified",
]);

requireMarkers("LEASE", lease, [
  "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
  "workersMin: 0",
  "workersMax",
  "laneRestingWorkersMax",
  "intentionalIdleCapacity",
  "LANE_RESTING_CAPACITY",
  "waitForRestingState",
  "zero_paid_gpu_when_no_active_worker: true",
  "max_concurrent_paid_leases",
  "default_max_account_hourly_usd",
  "max_jobs_per_lease",
  "production_deploy_performed: false",
]);

const leasePolicy = JSON.parse(leasePolicySource);
if (leasePolicy.contract !== "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2") throw new Error(`${CONTRACT}_LEASE_POLICY_CONTRACT_INVALID`);
if (leasePolicy.resting_workers_min !== 0 || leasePolicy.resting_workers_max !== 0) throw new Error(`${CONTRACT}_GLOBAL_LEASE_REST_STATE_MUST_BE_0_0`);
if (Number(leasePolicy?.lane_resting_workers_max?.code ?? leasePolicy.resting_workers_max) !== 0) throw new Error(`${CONTRACT}_CODE_LEASE_REST_STATE_MUST_BE_0_0`);
if (Object.values(leasePolicy?.lane_resting_workers_max || {}).some((value) => ![0, 1].includes(Number(value)))) {
  throw new Error(`${CONTRACT}_LANE_REST_STATE_UNBOUNDED`);
}
if (leasePolicy.workers_min_one_allowed !== false) throw new Error(`${CONTRACT}_WORKERS_MIN_ONE_MUST_BE_FORBIDDEN`);
if (leasePolicy.parallel_work_allowed !== true || leasePolicy.max_concurrent_paid_leases < 2) throw new Error(`${CONTRACT}_BOUNDED_PARALLEL_WORK_REQUIRED`);
if (!leasePolicy.lanes?.code) throw new Error(`${CONTRACT}_CODE_LEASE_LANE_REQUIRED`);

const durableFastStartImport = autonomousCapability.indexOf("executeCodeAIEmployeeFastStartMission");
const zeroIdleFastStartImport = autonomousCapability.indexOf("executeCodeAIEmployeeZeroIdleFastStartMission");
const fastStartSelector = autonomousCapability.indexOf("const executeFastStart = zeroIdle");
const executionCall = autonomousCapability.indexOf("const result = await executeFastStart({");
const attestationCall = autonomousCapability.indexOf("result.state = attestCodeMissionState");
if (
  durableFastStartImport < 0 ||
  zeroIdleFastStartImport < 0 ||
  fastStartSelector < 0 ||
  executionCall <= fastStartSelector ||
  attestationCall <= executionCall
) {
  throw new Error(`${CONTRACT}_FAST_START_EMPLOYEE_WORLDCLASS_GATE_MUST_PRECEDE_ATTESTATION`);
}
const workerGate = fastStart.indexOf("if (worker?.ready !== true)");
const fastStartEmployeeCall = fastStart.indexOf("await executeCodeAIEmployeeMission({");
if (workerGate < 0 || fastStartEmployeeCall <= workerGate) {
  throw new Error(`${CONTRACT}_WORKER_READINESS_MUST_PRECEDE_EMPLOYEE_REASONING`);
}
const employeeQualityImport = employee.indexOf("assessCodeAIWorldClassQuality");
const employeeQualityCall = employee.indexOf("const worldClass = assessCodeAIWorldClassQuality(source)");
const employeeBehavioralCall = employee.indexOf("const behavioralVerification = assessCodeAIBehavioralVerificationCoverage({");
const employeeProvenanceCall = employee.indexOf("const testProvenance = assessCodeAITestProvenance({");
const employeeRepairClosureCall = employee.indexOf("const repairClosure = assessCodeAIRepairClosure(source)");
const employeeCompletionDecision = employee.indexOf("completion.complete === true");
if (
  employeeQualityImport < 0 ||
  employeeQualityCall < 0 ||
  employeeBehavioralCall <= employeeQualityCall ||
  employeeProvenanceCall <= employeeBehavioralCall ||
  employeeRepairClosureCall <= employeeProvenanceCall ||
  employeeCompletionDecision <= employeeRepairClosureCall
) {
  throw new Error(`${CONTRACT}_EMPLOYEE_COMPLETION_MUST_FOLLOW_ALL_PROOF_ASSESSMENTS`);
}
if (/workersMin\s*:\s*1/.test(leasePolicySource)) throw new Error(`${CONTRACT}_POLICY_MUST_NEVER_SET_WORKERS_MIN_1`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    pure_quality_policy_without_runtime_dependencies: true,
    deterministic_fast_start_overlaps_worker_warmup: true,
    worker_readiness_precedes_paid_employee_reasoning: true,
    mandatory_worldclass_employee_gate: true,
    public_fast_start_employee_execution_precedes_attestation: true,
    durable_and_zero_idle_fast_start_selector_verified: true,
    legacy_worldclass_runtime_retained_as_non_public_compatibility: true,
    planner_rules_owned_by_bounded_prompt_transport: true,
    stale_verification_rejected_by_position: true,
    final_diff_review_required: true,
    standard_one_verification_family_required: true,
    high_two_independent_verification_families_required: true,
    critical_three_independent_verification_families_required: true,
    substantive_high_risk_verification_required: true,
    observed_impacted_behavior_verification_required: true,
    high_risk_changed_tests_cannot_self_certify: true,
    every_failed_verifier_must_close_after_failure_and_final_edit: true,
    employee_completion_consumes_behavioral_provenance_and_repair_proof: true,
    independent_high_risk_review_required_at_commit: true,
    employee_quality_convergence_enabled: true,
    source_manifest_workspace_convergence_required: true,
    commit_defense_in_depth_worldclass_guard: true,
    worldclass_commit_guard_precedes_recovery_or_write: true,
    bounded_isolated_node24_workspace: true,
    production_side_effect_commands_blocked: true,
    governed_non_force_github_commit_separated: true,
    concurrent_main_replan_guard_present: true,
    bounded_parallel_runpod_leases: true,
    global_runpod_resting_state_zero_zero: true,
    code_runpod_resting_state_zero_zero: true,
    code_idle_schedulable_capacity_required: false,
    workers_min_one_forbidden: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);

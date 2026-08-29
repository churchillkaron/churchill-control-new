import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_SOURCE_AUDIT_V7";

const files = Object.freeze({
  qualityPolicy: "lib/code/runtime/CodeAIWorldClassQualityPolicy.js",
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
  "assessCodeAIWorldClassQuality",
  "const worldClass = assessCodeAIWorldClassQuality(source)",
  "worldclass_quality: worldClass",
  "worldclass_quality_required: true",
  "CODE_AI_EMPLOYEE_FINAL_DIFF_REVIEW_REQUIRED",
  "CODE_AI_EMPLOYEE_SUCCESSFUL_VERIFICATION_REQUIRED",
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
  "AVANTIQO_CODE_AI_WORLDCLASS_COMMIT_GUARD_V1",
  "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
  "CODE_AI_COMMIT_WORLDCLASS_QUALITY_EVIDENCE_REQUIRED",
  "CODE_AI_COMMIT_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED",
  "CODE_AI_COMMIT_WORLDCLASS_SOURCE_MANIFEST_MISMATCH",
  "fresh_verification_family_count",
  "observedFamilies < required",
]);

requireMarkers("AUTONOMOUS_CAPABILITY", autonomousCapability, [
  "executeCodeAIEmployeeFastStartMission",
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
if (Number(leasePolicy?.lane_resting_workers_max?.code) !== 1) throw new Error(`${CONTRACT}_CODE_LEASE_REST_STATE_MUST_BE_0_1`);
if (Object.values(leasePolicy?.lane_resting_workers_max || {}).some((value) => ![0, 1].includes(Number(value)))) {
  throw new Error(`${CONTRACT}_LANE_REST_STATE_UNBOUNDED`);
}
if (leasePolicy.workers_min_one_allowed !== false) throw new Error(`${CONTRACT}_WORKERS_MIN_ONE_MUST_BE_FORBIDDEN`);
if (leasePolicy.parallel_work_allowed !== true || leasePolicy.max_concurrent_paid_leases < 2) throw new Error(`${CONTRACT}_BOUNDED_PARALLEL_WORK_REQUIRED`);
if (!leasePolicy.lanes?.code) throw new Error(`${CONTRACT}_CODE_LEASE_LANE_REQUIRED`);

const fastStartImport = autonomousCapability.indexOf("executeCodeAIEmployeeFastStartMission");
const executionCall = autonomousCapability.indexOf("await executeCodeAIEmployeeFastStartMission");
const attestationCall = autonomousCapability.indexOf("result.state = attestCodeMissionState");
if (fastStartImport < 0 || executionCall < 0 || attestationCall <= executionCall) {
  throw new Error(`${CONTRACT}_FAST_START_EMPLOYEE_WORLDCLASS_GATE_MUST_PRECEDE_ATTESTATION`);
}
const workerGate = fastStart.indexOf("if (worker?.ready !== true)");
const fastStartEmployeeCall = fastStart.indexOf("await executeCodeAIEmployeeMission({");
if (workerGate < 0 || fastStartEmployeeCall <= workerGate) {
  throw new Error(`${CONTRACT}_WORKER_READINESS_MUST_PRECEDE_EMPLOYEE_REASONING`);
}
const employeeQualityImport = employee.indexOf("assessCodeAIWorldClassQuality");
const employeeQualityCall = employee.indexOf("const worldClass = assessCodeAIWorldClassQuality(source)");
const employeeCompletionDecision = employee.indexOf("completion.complete === true");
if (
  employeeQualityImport < 0 ||
  employeeQualityCall < 0 ||
  employeeCompletionDecision < 0 ||
  employeeCompletionDecision <= employeeQualityCall
) {
  throw new Error(`${CONTRACT}_EMPLOYEE_COMPLETION_MUST_FOLLOW_WORLDCLASS_ASSESSMENT`);
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
    legacy_worldclass_runtime_retained_as_non_public_compatibility: true,
    planner_rules_owned_by_bounded_prompt_transport: true,
    stale_verification_rejected_by_position: true,
    final_diff_review_required: true,
    standard_one_verification_family_required: true,
    high_two_independent_verification_families_required: true,
    critical_three_independent_verification_families_required: true,
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
    code_runpod_resting_state_zero_one_without_active_worker: true,
    code_idle_schedulable_capacity_not_counted_as_paid_gpu: true,
    workers_min_one_forbidden: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);

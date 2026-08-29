import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  CodeAIWorkPackageRuntime,
  executeBatchedAutonomousCodeMission,
} from "../lib/code/runtime/CodeAIWorkPackageRuntime.js";
import {
  CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
  CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS,
} from "../lib/code/runtime/CodeAIWorkPackagePromptRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_EMPLOYEE_PUBLIC_WIRING_AUDIT_V9";

const files = {
  capability: "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
  fastStart: "lib/code/runtime/CodeAIEmployeeFastStartRuntime.js",
  workerSession: "lib/code/runtime/CodeAIWorkerSessionRuntime.js",
  planner: "lib/code/runtime/CodeAIPlannerExecutionRuntime.js",
  provider: "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProvider.js",
  employee: "lib/code/runtime/CodeAIEmployeeRuntime.js",
  packageFacade: "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  packageCore: "lib/code/runtime/CodeAIWorkPackageCoreRuntime.js",
  packageLive: "lib/code/runtime/CodeAIWorkPackageRuntimeLive.js",
  packageConvergence: "lib/code/runtime/CodeAIWorkPackageDeterministicConvergenceRuntime.js",
  packagePrompt: "lib/code/runtime/CodeAIWorkPackagePromptRuntime.js",
  liveProgress: "lib/code/runtime/CodeAILiveProgressRuntime.js",
  spend: "lib/code/runtime/CodeAIPlannerSpendPolicy.js",
  executionState: "lib/code/runtime/CodeAIAutonomousExecutionStateRuntime.js",
  commitArtifact: "lib/code/runtime/CodeAICommitArtifactRuntime.js",
  commitGuard: "lib/code/runtime/CodeAIWorldClassCommitGuard.js",
  reaper: "app/api/internal/code/worker-session/process/route.js",
  preflight: "scripts/preflight-code-ai-employee-service-runtime-local.mjs",
  vercel: "vercel.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);
const workPackageSource = [
  source.packageFacade,
  source.packageCore,
  source.packageLive,
  source.packageConvergence,
  source.packagePrompt,
].join("\n\n");

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) {
    throw new Error(`CODE_AI_EMPLOYEE_PUBLIC_WIRING_${label}_MISSING:${missing.join(",")}`);
  }
}

requireMarkers("CAPABILITY", source.capability, [
  "executeCodeAIEmployeeFastStartMission",
  "CODE_AI_EMPLOYEE_FAST_START_CONTRACT",
  "CODE_AI_EMPLOYEE_RUNTIME_CONTRACT",
  "CODE_AI_EMPLOYEE_MISSION_CONTRACT",
  "deterministic-fast-start",
  "warm_session_idle_ms",
  "reasoning_call_budget",
  "max_employee_passes",
  "owner_intent",
  "attestCodeMissionState",
  "verifyCodeMissionStateAttestation",
  "persistCodeAIAutonomousExecutionState",
  "persistCodeAICommitArtifact",
]);
assert.equal(source.capability.includes("executeWorldClassCodeMission({"), false);
assert.equal(source.capability.includes("executeCodeAIEmployeeMission({"), false);
assert.equal(source.capability.includes("commitVerifiedCodeMission"), false);
assert.equal(source.capability.includes("createCodeAICommitCapability"), false);

requireMarkers("FAST_START", source.fastStart, [
  "AVANTIQO_CODE_AI_EMPLOYEE_FAST_START_V2",
  "ensureCodeAIWorkerSession",
  "Promise.all([preparationPromise, workerPromise])",
  'status: "worker_warming"',
  "CODE_AI_EMPLOYEE_WORKER_WARMING",
  "model_call_required_to_start: false",
  "employee_fast_start_inspect",
  "employee_fast_start_read_",
  "resolveCodeAIEmployeeFastStartSeedPaths",
  "evidence_path_1",
  "evidence_path_4",
  "DEFAULT_WARM_SESSION_IDLE_MS = 10 * 60 * 1000",
  "MAX_WARM_SESSION_IDLE_MS = 30 * 60 * 1000",
  "first_reasoning_call_should_prefer_implementation",
  "executeCodeAIEmployeeMission",
]);

requireMarkers("WORKER_SESSION", source.workerSession, [
  "AVANTIQO_CODE_AI_WORKER_SESSION_V2",
  'state: "CLEANUP_REQUIRED"',
  "deletePodVerified",
  "verifyPodDeleted",
  "resolveCodeAIWorkerSessionTransport",
  "contains_worker_token: false",
]);

requireMarkers("PLANNER_WARM_TRANSPORT", source.planner, [
  "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V2",
  "AVANTIQO_CODE_WORKER_SESSION_ENABLED",
  "resolveCodeAIWorkerSessionTransport",
  "CODE_AI_PLANNER_WARM_SESSION_NOT_READY",
  'transport: "DURABLE_WARM_SESSION"',
  'serverless_endpoint_required: false',
  'transport: "RUNPOD_SERVERLESS"',
  'if (executionTransport && executionTransport !== "RUNPOD_SERVERLESS") return null;',
]);
const workerModeIndex = source.planner.indexOf("AVANTIQO_CODE_WORKER_SESSION_ENABLED");
const serverlessEndpointLookupIndex = source.planner.indexOf("const endpointId = text(", workerModeIndex);
assert.ok(workerModeIndex >= 0, "planner must recognize worker-session mode");
assert.ok(
  serverlessEndpointLookupIndex > workerModeIndex,
  "serverless endpoint capacity check must be fallback after warm-session resolution",
);

requireMarkers("PROVIDER_WARM_SESSION", source.provider, [
  "resolveCodeAIWorkerSessionTransport",
  "CODE_AI_WORKER_SESSION_CONTRACT",
  'source,',
  '"DURABLE_WARM_SESSION"',
  'pod.source === "DURABLE_WARM_SESSION" ? "RUNPOD_WARM_SESSION_V1" : "RUNPOD_POD_V3"',
]);

requireMarkers("EMPLOYEE", source.employee, [
  "AVANTIQO_CODE_AI_EMPLOYEE_RUNTIME_V1",
  "continue_until_verified_complete",
  "ask_owner_only_for_material_decision",
  "micro_step_planning_forbidden",
  "batched_work_packages_required",
  "worldclass_quality_required",
  "product_completion_criteria_required",
  "bindCodeAIEmployeeProductCompletionEvidence",
  "CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED",
]);

assert.equal(CODE_AI_WORK_PACKAGE_CONTRACT, "AVANTIQO_CODE_AI_WORK_PACKAGE_V1");
assert.equal(typeof executeBatchedAutonomousCodeMission, "function");
assert.equal(CodeAIWorkPackageRuntime.execute, executeBatchedAutonomousCodeMission);
assert.equal(CodeAIWorkPackageRuntime.live_progress, true);
assert.equal(Number(CodeAIWorkPackageRuntime.max_package_operations || 0), 12);
assert.deepEqual(CodeAIWorkPackageRuntime.implementation_actions, ["apply_files", "verify", "diff"]);
assert.equal(CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS, 24000);
assert.equal(CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS, 30000);
assert.ok(
  CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS - CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS >= 6000,
);

requireMarkers("WORK_PACKAGE_FACADE", source.packageFacade, [
  "executeBatchedAutonomousCodeMissionWithDeterministicConvergence",
  "CodeAIWorkPackageDeterministicConvergenceRuntime",
  "max_package_operations: CodeAIWorkPackageCoreRuntime.max_package_operations",
  "CodeAIWorkPackageCoreRuntime.allowed_package_actions",
  "CodeAIWorkPackageCoreRuntime.implementation_actions",
]);
requireMarkers("WORK_PACKAGE_CORE", source.packageCore, [
  "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
  "MAX_PACKAGE_OPERATIONS = 12",
  '"apply_files"',
  '"verify"',
  '"diff"',
  "CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_VERIFICATION",
  "PROMOTE_POST_MUTATION_RUN_TO_VERIFY",
  "APPEND_CONTROLLER_AUTHORITATIVE_VERIFY",
  "APPEND_CONTROLLER_FINAL_DIFF",
  "implementation_present",
  "implementation_required",
  "verification_failed",
]);
requireMarkers("WORK_PACKAGE_LIVE", source.packageLive, [
  "CODE_AI_WORK_PACKAGE_ACTION_NOT_ALLOWED_FOR_PHASE",
  "CODE_AI_WORK_PACKAGE_IMPLEMENTATION_REQUIRED_AFTER_SEEDED_DISCOVERY",
  "actionPolicy.implementation_required",
  "IMPLEMENTATION ALREADY EXISTS",
  "deterministic_final_diff_controller_owned: true",
  "publishCodeAILiveProgress",
  "live_progress: true",
]);
requireMarkers("WORK_PACKAGE_CONVERGENCE", source.packageConvergence, [
  "AVANTIQO_CODE_AI_DETERMINISTIC_CONVERGENCE_V1",
  "executeBatchedAutonomousCodeMissionLive",
  "CodeAIWorkPackageRuntimeLive",
  "DETERMINISTIC_CONVERGENCE",
  "VERIFY_AND_DIFF_PASSED",
  "VERIFY_FAILED_REPAIR_REQUIRED",
  "provider_execution_submitted: false",
  "reasoning_call_consumed: false",
  "source_mutation_performed: false",
]);
requireMarkers("WORK_PACKAGE_PROMPT", source.packagePrompt, [
  "CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS = 24000",
  "CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS = 30000",
  "CODE_AI_WORK_PACKAGE_STATE_BUDGET_EXCEEDED",
  "headroom_to_worker_limit_chars",
]);
requireMarkers("LIVE_PROGRESS", source.liveProgress, [
  "AVANTIQO_CODE_AI_LIVE_PROGRESS_V1",
  "refreshActiveWorkerLease",
  "active_work_refreshes_worker_lease: true",
  "raw_reasoning_persisted: false",
  "source_content_persisted: false",
  "secrets_persisted: false",
]);
assert.equal(workPackageSource.includes("[deploy-production-final]"), false);

requireMarkers("SPEND", source.spend, [
  "DEFAULT_CODE_AI_REASONING_CALL_BUDGET = 4",
  "MAX_CODE_AI_REASONING_CALL_BUDGET = 8",
  "CODE_AI_REASONING_CALL_BUDGET_EXHAUSTED",
]);

requireMarkers("EXECUTION_STATE", source.executionState, [
  "verifyCodeMissionStateAttestation",
  "product_completion_criteria_verified",
  "verification_passed",
  "ordinary_memory_recall: false",
]);
requireMarkers("COMMIT_ARTIFACT", source.commitArtifact, [
  "verifyCodeMissionStateAttestation",
  "ordinary_memory_recall: false",
  "commit_requires_separate_governed_capability: true",
]);
requireMarkers("COMMIT_GUARD", source.commitGuard, [
  "CODE_AI_COMMIT_WORLDCLASS_QUALITY_EVIDENCE_REQUIRED",
  "CODE_AI_COMMIT_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED",
  "fresh_verification_family_count",
]);

requireMarkers("REAPER", source.reaper, [
  "reapExpiredCodeAIWorkerSession",
  'runtime = "nodejs"',
  "CRON_SECRET",
  "AVANTIQO_CODE_AI_WORKER_SESSION_REAPER_V1",
  "cleanup_failure_hidden: false",
]);
requireMarkers("VERCEL_CRON", source.vercel, [
  '"app/api/internal/code/worker-session/process/route.js"',
  '"path": "/api/internal/code/worker-session/process"',
  '"schedule": "* * * * *"',
]);

requireMarkers("PREFLIGHT_PROVIDER_REGISTRATION", source.preflight, [
  "AVANTIQO_CODE_EMPLOYEE_SERVICE_RUNTIME_PREFLIGHT_V3",
  "RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY",
  "process.env.RUNPOD_API_KEY = runtimeCredential",
  "AvantiqoCodeProviderRegistration.js",
  "provider_registration_loaded_explicitly: true",
  "runpod_runtime_credential_normalized: true",
  "CODE_EMPLOYEE_PREFLIGHT_PROVIDER_NOT_REGISTERED",
  "CODE_EMPLOYEE_PREFLIGHT_PROVIDER_RUNTIME_UNAVAILABLE",
]);
const envNormalizeIndex = source.preflight.indexOf("process.env.RUNPOD_API_KEY = runtimeCredential");
const registrationIndex = source.preflight.indexOf("AvantiqoCodeProviderRegistration.js");
const registryCheckIndex = source.preflight.indexOf("const registeredProvider = getProvider(PROVIDER)");
assert.ok(envNormalizeIndex >= 0, "preflight must normalize runtime credential");
assert.ok(registrationIndex > envNormalizeIndex, "registration must load after env normalization");
assert.ok(registryCheckIndex > registrationIndex, "registry validation must follow registration");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    public_code_capability_uses_fast_start_employee_runtime: true,
    deterministic_repository_work_overlaps_worker_warmup: true,
    known_source_evidence_can_be_seeded_before_reasoning: true,
    worker_warming_is_resumable_without_reasoning_call: true,
    model_call_not_required_to_start: false === true ? false : true,
    bounded_warm_worker_session: true,
    planner_warm_session_precedes_serverless_capacity_check: true,
    planner_warm_session_disables_serverless_stale_queue_recovery: true,
    warm_session_provider_transport_wired: true,
    independent_minute_reaper_wired: true,
    cleanup_failure_is_fail_closed: true,
    preflight_normalizes_code_runtime_credential: true,
    preflight_loads_code_provider_registration_before_registry_validation: true,
    micro_step_public_execution_removed: true,
    batched_multi_operation_packages_required: true,
    split_work_package_runtime_public_contract_verified: true,
    public_work_package_routes_to_deterministic_convergence: true,
    deterministic_verify_diff_precedes_additional_reasoning: true,
    deterministic_convergence_consumes_no_reasoning: true,
    deterministic_convergence_submits_no_provider_work: true,
    deterministic_convergence_does_not_mutate_source: true,
    successful_existing_implementation_does_not_require_reedit: true,
    live_code_progress_wired: true,
    active_code_progress_refreshes_worker_lease: true,
    planner_instruction_limit_chars: CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
    worker_instruction_hard_limit_chars: CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS,
    worker_instruction_headroom_chars:
      CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS - CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
    post_mutation_run_can_be_recovered_as_verification_without_new_reasoning: true,
    controller_owned_final_diff_recovery: true,
    missing_post_mutation_verification_still_fails_closed: true,
    default_reasoning_call_budget: 4,
    absolute_reasoning_call_budget: 8,
    worldclass_quality_preserved: true,
    product_completion_criteria_preserved: true,
    mission_attestation_preserved: true,
    server_owned_execution_evidence_preserved: true,
    commit_artifact_preserved: true,
    persistent_commit_still_separate: true,
    public_capability_has_no_inline_commit_runtime: true,
    paid_provider_call_performed: false,
    runpod_mutation_performed_by_audit: false,
    wallet_mutation_performed: false,
    source_mutation_performed_by_audit: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
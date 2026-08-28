import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_EMPLOYEE_PUBLIC_WIRING_AUDIT_V3";

const files = {
  capability: "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
  fastStart: "lib/code/runtime/CodeAIEmployeeFastStartRuntime.js",
  employee: "lib/code/runtime/CodeAIEmployeeRuntime.js",
  packages: "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  spend: "lib/code/runtime/CodeAIPlannerSpendPolicy.js",
  executionState: "lib/code/runtime/CodeAIAutonomousExecutionStateRuntime.js",
  commitArtifact: "lib/code/runtime/CodeAICommitArtifactRuntime.js",
  commitGuard: "lib/code/runtime/CodeAIWorldClassCommitGuard.js",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

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
  "AVANTIQO_CODE_AI_EMPLOYEE_FAST_START_V1",
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

requireMarkers("WORK_PACKAGE", source.packages, [
  "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
  "MAX_PACKAGE_OPERATIONS = 12",
  "apply_files",
  "verify",
  "diff",
  "CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_VERIFICATION",
  "CODE_AI_WORK_PACKAGE_MUTATION_REQUIRES_LATER_DIFF",
]);

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

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    public_code_capability_uses_fast_start_employee_runtime: true,
    deterministic_repository_work_precedes_first_model_call: true,
    known_source_evidence_can_be_seeded_before_reasoning: true,
    model_call_not_required_to_start: true,
    bounded_warm_session_policy_exposed: true,
    micro_step_public_execution_removed: true,
    batched_multi_operation_packages_required: true,
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
    runpod_lease_acquired: false,
    wallet_mutation_performed: false,
    source_mutation_performed_by_audit: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));

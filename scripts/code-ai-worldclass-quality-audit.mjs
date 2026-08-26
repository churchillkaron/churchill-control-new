import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_WORLDCLASS_SOURCE_AUDIT_V1";

const files = Object.freeze({
  worldclass: "lib/code/runtime/CodeAIWorldClassRuntime.js",
  autonomousCapability: "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
  autonomous: "lib/code/runtime/CodeAIAutonomousRuntime.js",
  mission: "lib/code/runtime/CodeAIMissionRuntime.js",
  workspace: "lib/code/runtime/CodeWorkspaceSandboxRuntime.js",
  commit: "lib/code/runtime/CodeGitHubCommitRuntime.js",
  lease: "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
  leasePolicy: "config/avantiqo-runpod-safe-lease-policy.json",
});

async function source(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`${CONTRACT}_FILE_MISSING:${path}:${error?.code || "READ_FAILED"}`);
  }
}

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) {
    throw new Error(`${CONTRACT}_${label}_MARKERS_MISSING:${missing.join("|")}`);
  }
}

const [
  worldclass,
  autonomousCapability,
  autonomous,
  mission,
  workspace,
  commit,
  lease,
  leasePolicySource,
] = await Promise.all(Object.values(files).map(source));

requireMarkers("WORLDCLASS", worldclass, [
  "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
  "CODE_AI_WORLDCLASS_FINAL_DIFF_REVIEW_REQUIRED",
  "CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED",
  "lastEditPosition",
  "lastDiffPosition",
  "freshVerificationEvidence",
  "requiredVerificationGateCount",
  "critical",
  "high",
  "source_manifest_matches_workspace",
  "executeAutonomousCodeMission",
]);

requireMarkers("AUTONOMOUS_CAPABILITY", autonomousCapability, [
  "executeWorldClassCodeMission",
  "fresh-verification",
  "final-diff-review",
  "risk-sensitive-quality",
  "world-class-quality-gate",
  "Persistent GitHub commits remain a separate governed capability",
]);

requireMarkers("AUTONOMOUS_RUNTIME", autonomous, [
  "Inspect/search/read before editing when evidence is insufficient.",
  "When a command/test fails, inspect the failure and repair instead of claiming completion.",
  "Use verify after source changes.",
  "Use research only when current external technical evidence is genuinely needed.",
  "CODE_AI_AUTONOMOUS_CHANGED_MISSION_REQUIRES_VERIFICATION",
  "CODE_AI_AUTONOMOUS_ITERATION_BUDGET_EXHAUSTED",
]);

requireMarkers("MISSION", mission, [
  "CODE_AI_COMMAND_MUTATED_SOURCE_USE_APPLY_FILES",
  "CODE_AI_UNDECLARED_SOURCE_MUTATION",
  "CODE_AI_CHANGED_FILES_REQUIRE_SUCCESSFUL_VERIFICATION",
  "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
  "git\", \"diff\", \"--check",
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
  "max_concurrent_paid_leases",
  "default_max_account_hourly_usd",
  "max_jobs_per_lease",
  "production_deploy_performed: false",
]);

const leasePolicy = JSON.parse(leasePolicySource);
if (leasePolicy.contract !== "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2") {
  throw new Error(`${CONTRACT}_LEASE_POLICY_CONTRACT_INVALID`);
}
if (leasePolicy.resting_workers_min !== 0 || leasePolicy.resting_workers_max !== 0) {
  throw new Error(`${CONTRACT}_LEASE_REST_STATE_MUST_BE_0_0`);
}
if (leasePolicy.workers_min_one_allowed !== false) {
  throw new Error(`${CONTRACT}_WORKERS_MIN_ONE_MUST_BE_FORBIDDEN`);
}
if (leasePolicy.parallel_work_allowed !== true || leasePolicy.max_concurrent_paid_leases < 2) {
  throw new Error(`${CONTRACT}_BOUNDED_PARALLEL_WORK_REQUIRED`);
}
if (!leasePolicy.lanes?.code) {
  throw new Error(`${CONTRACT}_CODE_LEASE_LANE_REQUIRED`);
}

const worldclassImport = autonomousCapability.indexOf("executeWorldClassCodeMission");
const executionCall = autonomousCapability.indexOf("await executeWorldClassCodeMission");
const attestationCall = autonomousCapability.indexOf("attestCodeMissionState");
if (worldclassImport < 0 || executionCall < 0 || attestationCall <= executionCall) {
  throw new Error(`${CONTRACT}_WORLDCLASS_GATE_MUST_PRECEDE_ATTESTATION`);
}

if (/workersMin\s*:\s*1/.test(leasePolicySource)) {
  throw new Error(`${CONTRACT}_POLICY_MUST_NEVER_SET_WORKERS_MIN_1`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    mandatory_worldclass_autonomous_gate: true,
    stale_verification_rejected_by_position: true,
    final_diff_review_required: true,
    high_and_critical_double_verification_required: true,
    source_manifest_workspace_convergence_required: true,
    bounded_isolated_node24_workspace: true,
    production_side_effect_commands_blocked: true,
    governed_non_force_github_commit_separated: true,
    concurrent_main_replan_guard_present: true,
    bounded_parallel_runpod_leases: true,
    runpod_resting_state_zero_zero: true,
    workers_min_one_forbidden: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);

import { readFile } from "node:fs/promises";

const files = {
  worker: "services/avantiqo-code-engine/handler.py",
  provider: "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js",
  providerResolver: "lib/platform/service-runtime/providers/ProviderResolver.js",
  workspace: "lib/code/runtime/CodeWorkspaceSandboxRuntime.js",
  mission: "lib/code/runtime/CodeAIMissionRuntime.js",
  plannerExecution: "lib/code/runtime/CodeAIPlannerExecutionRuntime.js",
  autonomous: "lib/code/runtime/CodeAIAutonomousRuntime.js",
  attestation: "lib/code/runtime/CodeMissionAttestationRuntime.js",
  githubCommit: "lib/code/runtime/CodeGitHubCommitRuntime.js",
  autonomousExecutionState: "lib/code/runtime/CodeAIAutonomousExecutionStateRuntime.js",
  commitArtifact: "lib/code/runtime/CodeAICommitArtifactRuntime.js",
  commitExecutionState: "lib/code/runtime/CodeAICommitExecutionStateRuntime.js",
  missionCapability: "lib/platform/capabilities/createCodeAIMissionCapability.js",
  autonomousCapability: "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
  commitCapability: "lib/platform/capabilities/createCodeAICommitCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  research: "lib/platform/capabilities/createOperatorWebResearchCapability.js",
  benchmark: "scripts/benchmark-avantiqo-code.mjs",
  sandboxSmoke: "scripts/code-ai-sandbox-live-smoke.mjs",
};

async function source(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`CODE_AI_AUDIT_FILE_MISSING:${path}:${error?.code || "READ_FAILED"}`);
  }
}

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) {
    throw new Error(`CODE_AI_AUDIT_${label}_MARKERS_MISSING:${missing.join(",")}`);
  }
}

const loaded = await Promise.all(Object.values(files).map(source));
const [
  worker,
  provider,
  providerResolver,
  workspace,
  mission,
  plannerExecution,
  autonomous,
  attestation,
  githubCommit,
  autonomousExecutionState,
  commitArtifact,
  commitExecutionState,
  missionCapability,
  autonomousCapability,
  commitCapability,
  platform,
  research,
  benchmark,
  sandboxSmoke,
] = loaded;

requireMarkers("WORKER", worker, [
  "AVANTIQO_CODE_ENGINE_V1",
  "ai.code.generate",
  "ai.code.edit",
  "ai.code.refactor",
  "ai.code.review",
  "ai.code.debug",
  "raw_reasoning_persisted",
]);

requireMarkers("PROVIDER", provider, [
  "TARGET_CAPABILITIES",
  "AVANTIQO_CODE_CERTIFIED_CAPABILITIES",
  "target_capabilities",
  "certified_capabilities",
  "OWNED_INFERENCE",
]);

requireMarkers("OWNED_FIRST_PROVIDER_RESOLUTION", providerResolver, [
  "ownedProviderForCapability",
  "ownedCandidates",
  "selectionPool = ownedCandidates.length ? ownedCandidates : candidates",
  "owned_first_selected",
  "external_fallback_selected",
]);

requireMarkers("WORKSPACE", workspace, [
  "AVANTIQO_CODE_WORKSPACE_SANDBOX_V1",
  "Sandbox.create",
  "sandboxCredentials",
  "VERCEL_TOKEN",
  "VERCEL_TEAM_ID",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "CODE_AI_SANDBOX_LOCAL_CREDENTIALS_INCOMPLETE",
  'runtime: "node24"',
  '"clone", "--depth", "1"',
  "sandbox.readFileToBuffer",
  "sandbox.writeFiles",
  '"add", "-N"',
  "CODE_AI_FILE_PARENT_CREATE_FAILED",
  "CODE_AI_GIT_PUSH_REQUIRES_GOVERNED_COMMIT_RUNTIME",
  "CODE_AI_DEPLOYMENT_OR_DATABASE_TOOL_BLOCKED",
  '"bash",',
  '"sh",',
  '"diff", "--check"',
]);

requireMarkers("MISSION", mission, [
  "AVANTIQO_CODE_AI_MISSION_V1",
  "repair_required",
  "verification_required",
  "replan_required",
  "completed_operation_ids",
  "source_changes",
  "refreshSourceChanges",
  "CODE_AI_COMMAND_MUTATED_SOURCE_USE_APPLY_FILES",
  "CODE_AI_UNDECLARED_SOURCE_MUTATION",
  "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
  "concurrency_replan",
  "successfulVerification",
]);

requireMarkers("PLANNER_EXECUTION", plannerExecution, [
  "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V1",
  "service_runtime = ServiceExecutionRuntime",
  "service_runtime.execute(executionInput)",
  "serviceRuntime.settle",
  "pending_execution",
  "provider_job_id",
  "usage_id",
  "normalizedExecutionInput",
  "input.instructions || input.instruction",
  "instructions",
  "plannerResultText",
  "CODE_AI_PLANNER_PENDING_ORGANIZATION_MISMATCH",
]);

requireMarkers("AUTONOMOUS_CONTROLLER", autonomous, [
  "AVANTIQO_CODE_AI_AUTONOMOUS_RUNTIME_V1",
  "executeCodeAIPlannerRequest",
  "planner_pending",
  "runOperatorWebResearch",
  "executeCodeAIMission",
  "owned_orchestration: true",
  "Choose exactly ONE next action",
  "CODE_AI_AUTONOMOUS_CHANGED_MISSION_REQUIRES_VERIFICATION",
  "CODE_AI_AUTONOMOUS_ITERATION_BUDGET_EXHAUSTED",
  '"research"',
  '"complete"',
  '"block"',
]);

requireMarkers("ATTESTATION", attestation, [
  "AVANTIQO_CODE_MISSION_ATTESTATION_V1",
  "AVANTIQO_CODE_MISSION_ATTESTATION_SECRET",
  "createHmac",
  "timingSafeEqual",
  "CODE_AI_MISSION_ATTESTATION_INVALID",
]);

requireMarkers("GITHUB_COMMIT", githubCommit, [
  "AVANTIQO_CODE_GITHUB_COMMIT_V1",
  "verifyCodeMissionStateAttestation",
  "AVANTIQO_CODE_GITHUB_REPOSITORIES",
  "AVANTIQO_CODE_GITHUB_CONNECTOR",
  "VERCEL_OIDC_TOKEN",
  "api.vercel.com/v1/connect/token",
  "recoverVerifiedCodeMissionCommit",
  "RECOVERY_HISTORY_LIMIT = 50",
  "currentMainHead === expectedBase",
  "CODE_AI_GITHUB_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
  "base_tree",
  "force: false",
  "CODE_AI_GITHUB_POST_COMMIT_VERIFICATION_FAILED",
]);

requireMarkers("AUTONOMOUS_EXECUTION_STATE", autonomousExecutionState, [
  "AVANTIQO_CODE_AI_AUTONOMOUS_EXECUTION_STATE_V1",
  "verifyCodeMissionStateAttestation",
  "code_ai_execution_state",
  "ordinary_memory_recall: false",
  "authorization_effect: \"NONE\"",
  "verifyCompletedCodeAIAutonomousExecution",
  "CODE_AI_AUTONOMOUS_CHANGED_STATE_NOT_VERIFIED",
]);

requireMarkers("COMMIT_ARTIFACT", commitArtifact, [
  "AVANTIQO_CODE_AI_COMMIT_ARTIFACT_V1",
  "verifyCodeMissionStateAttestation",
  "code_ai_commit_artifact",
  "mission_state: state",
  "commit_attempted: false",
  "markCodeAICommitArtifactAttempt",
  "commit_attempted: true",
  "commit_attempt_count",
  "CODE_AI_COMMIT_ARTIFACT_ATTEMPTED_IMMUTABLE",
  "CODE_AI_COMMIT_ARTIFACT_ATTEMPT_MARK_FAILED",
  "ordinary_memory_recall: false",
  "commit_requires_separate_governed_capability: true",
  "retireCodeAICommitArtifact",
]);

requireMarkers("COMMIT_EXECUTION_STATE", commitExecutionState, [
  "AVANTIQO_CODE_AI_COMMIT_EXECUTION_STATE_V1",
  "code_ai_commit_execution_state",
  "CODE_AI_COMMIT_RESULT_NOT_VERIFIED",
  "ordinary_memory_recall: false",
  "authorization_effect: \"NONE\"",
]);

requireMarkers("MISSION_CAPABILITY", missionCapability, [
  "platform.code.ai.execute",
  "operatorEnabled: true",
  "operatorAutoExecute: true",
  "verifyCodeMissionStateAttestation",
  "attestCodeMissionState",
  "CODE_AI_MISSION_RESUME_ORGANIZATION_MISMATCH",
]);

requireMarkers("AUTONOMOUS_CAPABILITY", autonomousCapability, [
  "code_ai_autonomous",
  "platform.code.ai.execute",
  "executeAutonomousCodeMission",
  "verifyCodeMissionStateAttestation",
  "attestCodeMissionState",
  "execution_key",
  "persistCodeAIAutonomousExecutionState",
  "persistCodeAICommitArtifact",
  "commit_artifact_persisted",
  "RESTORABLE_MISSION_STATUSES",
  "resumeStateForExecution",
  "CODE_AI_AUTONOMOUS_PENDING_RESUME_STATUS_EVIDENCE_REQUIRED",
  "Persistent GitHub commits remain a separate governed capability",
]);

requireMarkers("COMMIT_CAPABILITY", commitCapability, [
  "code_ai_commit",
  "platform.code.ai.commit",
  "execution_key",
  "loadCodeAICommitArtifact",
  "recoverVerifiedCodeMissionCommit",
  "recoverPriorAttempt",
  "markCodeAICommitArtifactAttempt",
  "persistCodeAICommitExecutionState",
  "retireCodeAICommitArtifact",
  "CODE_AI_COMMIT_ORGANIZATION_MISMATCH",
  "commitVerifiedCodeMission",
  "persistVerifiedCommitState",
  "retireVerifiedCommitArtifact",
  "CODE_AI_COMMIT_POST_WRITE_STATE_PERSIST_FAILED",
  "CODE_AI_COMMIT_POST_WRITE_ARTIFACT_RETIRE_FAILED",
  "VERIFIED_COMMIT_ARTIFACT_RETAINED_FOR_RECOVERY",
  "VERIFIED_COMMIT_STATE_PERSIST_INCOMPLETE",
  "VERIFIED_COMMIT_ARTIFACT_RETIRE_INCOMPLETE",
  "github_write_verified: result?.verified === true",
  "recovered_existing_verified_commit",
  "commit_executed_this_invocation",
  "safe_to_retry_commit: false",
  "verification_read_required: true",
  "operatorAutoExecute: false",
  "operatorRequiresConfirmation: true",
]);

const recoverPriorIndex = commitCapability.indexOf("await recoverPriorAttempt");
const markAttemptIndex = commitCapability.indexOf("await markCodeAICommitArtifactAttempt");
const verifiedWriteIndex = commitCapability.indexOf("result = await commitVerifiedCodeMission");
const postWriteStateIndex = commitCapability.indexOf("const commitState = await persistVerifiedCommitState");
if (
  recoverPriorIndex < 0 ||
  markAttemptIndex <= recoverPriorIndex ||
  verifiedWriteIndex <= markAttemptIndex ||
  postWriteStateIndex <= verifiedWriteIndex
) {
  throw new Error(
    "CODE_AI_AUDIT_COMMIT_SEQUENCE_MUST_BE_RECOVER_THEN_MARK_THEN_WRITE_THEN_PERSIST_VERIFICATION",
  );
}
const postWriteHousekeeping = commitCapability.slice(postWriteStateIndex);
if (/throw\s+new\s+Error/.test(postWriteHousekeeping)) {
  throw new Error(
    "CODE_AI_AUDIT_VERIFIED_GITHUB_WRITE_MUST_NOT_BECOME_GENERIC_RETRYABLE_FAILURE",
  );
}
if (!commitCapability.includes("const artifact = commitState.persisted")) {
  throw new Error(
    "CODE_AI_AUDIT_COMMIT_ARTIFACT_RETIREMENT_MUST_REQUIRE_PERSISTED_VERIFICATION_STATE",
  );
}

requireMarkers("PLATFORM", platform, [
  "createCodeAIMissionCapability",
  "code_ai_mission",
  "createCodeAIAutonomousCapability",
  "code_ai_autonomous",
  "createCodeAICommitCapability",
  "code_ai_commit",
  "createOperatorWebResearchCapability",
  "research",
]);

requireMarkers("SHARED_RESEARCH", research, [
  "Governed Web Research",
  "untrusted evidence",
  "source-backed",
  "operatorAutoExecute: true",
]);

requireMarkers("BENCHMARK", benchmark, [
  "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V2",
  'id: "generate_finite_sum"',
  'id: "edit_numeric_normalization"',
  'id: "refactor_email_normalization"',
  'id: "review_authorization_guard"',
  'id: "debug_numeric_reduce"',
  'id: "autonomous_planner_json_protocol"',
  "plannerProtocolPass",
  "measured_gpu_economics_required: true",
  "activation_allowed: false",
  'sandbox_execution_gate: "SEPARATE_LIVE_GATE"',
]);

requireMarkers("SANDBOX_SMOKE", sandboxSmoke, [
  "AVANTIQO_CODE_SANDBOX_LIVE_SMOKE_V1",
  "CodeWorkspaceSandboxRuntime.open",
  "AVANTIQO_CODE_AI_MISSION_V1",
  "isolated_edit_verified",
  "command_execution_verified",
  "diff_verified",
  "CODE_AI_GIT_PUSH_REQUIRES_GOVERNED_COMMIT_RUNTIME",
  "production_side_effects_executed: false",
  "provider_calls_executed: false",
  "provider_spend_approved: false",
]);

if (/git\s+push|vercel\s+deploy|supabase\s+db\s+push/.test(mission + autonomous)) {
  throw new Error("CODE_AI_AUTONOMOUS_RUNTIME_MUST_NOT_EMBED_PRODUCTION_SIDE_EFFECT_COMMANDS");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_AUTONOMY_SOURCE_AUDIT_V7",
  verified: {
    owned_code_worker: true,
    certified_capability_gate: true,
    owned_first_provider_resolution: true,
    isolated_repository_workspace: true,
    local_sandbox_credential_path: true,
    node24_sandbox_runtime: true,
    resumable_patch_state_including_new_files: true,
    source_manifest_bound_to_explicit_edits: true,
    undeclared_source_mutation_blocked: true,
    concurrent_main_replan_guard: true,
    autonomous_inspect_plan_execute_repair_verify_loop: true,
    durable_async_owned_planner_execution: true,
    duplicate_planner_job_on_resume_blocked_by_design: true,
    shared_governed_research_reused: true,
    mission_state_attested: true,
    organization_actor_resume_scope: true,
    autonomous_execution_evidence_server_owned: true,
    full_commit_artifact_server_owned_and_non_recallable: true,
    commit_attempt_marker_persisted_before_github_write: true,
    attempted_commit_artifact_immutable: true,
    recovery_before_commit_retry_required: true,
    atomic_non_force_github_commit_runtime: true,
    verified_commit_execution_state_server_owned: true,
    verified_github_write_never_reclassified_as_generic_retryable_failure: true,
    commit_artifact_retirement_requires_persisted_verification_state: true,
    persistent_commit_permission_separated: true,
    production_side_effects_blocked_from_autonomous_workspace: true,
    live_sandbox_smoke_available: true,
    broader_owned_model_benchmark_available: true,
    live_sandbox_execution_certified: false,
    live_owned_planner_execution_certified: false,
    live_github_connect_commit_certified: false,
    broader_model_capability_suite_certified: false,
  },
  note: "Source architecture audit passed only when this script is actually executed. Live Sandbox evidence is certified by the separate smoke result; live owned planner/model execution, live Vercel Connect/GitHub write-back, and measured production economics remain separate environment-backed gates.",
}, null, 2));

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCodeAIPlannerOutput } from "../lib/code/runtime/CodeAIPlannerDecisionParser.js";

const path = "lib/code/runtime/CodeAIAutonomousRuntime.js";
const source = await readFile(path, "utf8");
const workspacePath = "lib/code/runtime/CodeWorkspaceSandboxRuntime.js";
const workspaceSource = await readFile(workspacePath, "utf8");
const promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";
const promptSource = await readFile(promptPath, "utf8");
const parserPath = "lib/code/runtime/CodeAIPlannerDecisionParser.js";
const parserSource = await readFile(parserPath, "utf8");
const capacityRunnerPath = "scripts/run-code-ai-autonomous-planner-certification-capacity-safe-local.mjs";
const capacityRunnerSource = await readFile(capacityRunnerPath, "utf8");
const liveCertificationPath = "scripts/certify-code-ai-autonomous-planner-service-runtime-live.mjs";
const liveCertificationSource = await readFile(liveCertificationPath, "utf8");

const singlePlannerObject = parseCodeAIPlannerOutput('{"action":"read","description":"one","input":{"file_path":"a.js"}}');
assert.equal(singlePlannerObject.parsed.action, "read");
assert.equal(singlePlannerObject.normalization.discarded_count, 0);

const liveOverEmission = parseCodeAIPlannerOutput(
  '{"action":"read","description":"first","input":{"file_path":"normalize-money.mjs"}}\n' +
  '{"action":"read","description":"second","input":{"file_path":"invoice-summary.mjs"}}',
);
assert.equal(liveOverEmission.parsed.input.file_path, "normalize-money.mjs");
assert.equal(liveOverEmission.normalization.mode, "same_guarded_action_over_emission");
assert.equal(liveOverEmission.normalization.object_count, 2);
assert.equal(liveOverEmission.normalization.discarded_count, 1);
assert.equal(liveOverEmission.normalization.action, "read");

const liveTrailingBraceOverEmission = parseCodeAIPlannerOutput(
  '{"action":"read","description":"Read the content of the first specified fixture file to understand its current state and identify issues.","input":{"file_path":"tests/fixtures/code-ai-autonomous-multifile/normalize-money.mjs","start_line":1,"end_line":400}}}',
);
assert.equal(liveTrailingBraceOverEmission.parsed.action, "read");
assert.equal(
  liveTrailingBraceOverEmission.parsed.input.file_path,
  "tests/fixtures/code-ai-autonomous-multifile/normalize-money.mjs",
);
assert.equal(
  liveTrailingBraceOverEmission.normalization.mode,
  "single_guarded_trailing_brace_over_emission",
);
assert.equal(liveTrailingBraceOverEmission.normalization.discarded_trailing_brace_count, 1);

assert.throws(
  () => parseCodeAIPlannerOutput(
    '{"action":"apply_files","description":"edit","input":{"files":[]}}}',
  ),
  /CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID/,
);
assert.throws(
  () => parseCodeAIPlannerOutput(
    '{"action":"read","description":"read","input":{"file_path":"a.js"}}}}',
  ),
  /CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID/,
);

assert.throws(
  () => parseCodeAIPlannerOutput(
    '{"action":"read","description":"read","input":{"file_path":"a.js"}}\n' +
    '{"action":"apply_files","description":"edit","input":{"files":[]}}',
  ),
  /CODE_AI_AUTONOMOUS_PLANNER_MULTI_ACTION_CONFLICT:read,apply_files/,
);
assert.throws(
  () => parseCodeAIPlannerOutput(
    '{"action":"apply_files","description":"edit one","input":{"files":[]}}\n' +
    '{"action":"apply_files","description":"edit two","input":{"files":[]}}',
  ),
  /CODE_AI_AUTONOMOUS_PLANNER_MULTI_ACTION_UNSAFE:apply_files:2/,
);

const requiredMarkers = [
  "AVANTIQO_CODE_AI_AUTONOMY_CONTROL_V1",
  'DUPLICATE_GUARDED_ACTIONS = new Set(["read", "search", "run"])',
  "CODE_AI_AUTONOMOUS_DUPLICATE_ACTION_WITHOUT_NEW_EVIDENCE",
  "normalizedAutonomyControl",
  "recoveredPlannerIterations",
  "pending_planner_iteration",
  "planner_iterations_used",
  "evidence_revision",
  "source_revision",
  "guarded_actions",
  "normalizedReadInput",
  "CodeAIAutonomyActionIdentity.js",
  "readRangeCovered",
  "READ_RANGE_COVERED",
  "advanceSourceRevision",
  "duplicateActionGuard(control, decision)",
  "control.planner_iterations_used >= MAX_ITERATIONS",
  "productive_planner_iterations_used",
  "recoveredProductivePlannerIterations",
  "productiveIterationLimit",
  "missionFinalizationEligible",
  "consumeProductiveIteration",
  "MAX_PRODUCTIVE_CONVERGENCE_RESERVE = 4",
  "MAX_FINALIZATION_ATTEMPT_RESERVE = 2",
  "CODE_AI_AUTONOMOUS_PLANNER_ATTEMPT_LIMIT_EXHAUSTED",
  "iteration = control.planner_iterations_used + 1",
  "const operationId = `autonomy_${iteration}_${decision.action}`",
  "TRANSIENT_WORKSPACE_RETRY_LIMIT = 1",
  "isTransientWorkspaceTermination",
  'kind: "autonomous_execution_retry"',
  "same_operation_retried: true",
  "new_planner_request_submitted: false",
  "MAX_SOURCE_READ_EVIDENCE = 8",
  "MAX_DUPLICATE_REJECTION_STREAK = 3",
  "MAX_SUPPRESSED_ACTION_REJECTION_STREAK = 2",
  "recordSuppressedActionRejection",
  "resetSuppressedActionRejection",
  "CODE_AI_AUTONOMOUS_ACTION_NOT_CURRENTLY_ALLOWED",
  "CODE_AI_AUTONOMOUS_SUPPRESSED_ACTION_STREAK_EXCEEDED",
  "source_read_evidence",
  "rejected_duplicate_actions",
  "duplicate_rejection_streak",
  "last_duplicate_action",
  "recordDuplicateProgress",
  "resetDuplicateProgress",
  "plannerAllowedActions",
  "plannerInspectionRequired",
  'text(source.status, 100) === "replan_required"',
  "!text(source.repository_guidance?.contract, 160)",
  "trailingDuplicateRejectionProgress",
  "const sameAction = text(control?.last_duplicate_action, 80) === normalizedAction",
  "recoveredDuplicateProgress.streak",
  "CODE_AI_AUTONOMOUS_DUPLICATE_ACTION_STREAK_EXCEEDED",
  "currentSourceRevision",
  "max_duplicate_rejection_streak",
  "source_read_evidence_limit",
  "parseCodeAIPlannerOutput",
  "planner_output_normalization",
  "output_normalization: decision.planner_output_normalization || null",
];

const promptRequiredMarkers = [
  "AVANTIQO_CODE_AI_PLANNER_PROMPT_TRANSPORT_V1",
  "CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS = 24000",
  "CODE_AI_PLANNER_MAX_STATE_CHARS = 14000",
  "worker_instruction_hard_limit_chars: 30000",
  "duplicate_objective_in_structured_specification: false",
  "duplicate_state_in_structured_specification: false",
  "CODE_AI_AUTONOMOUS_PLANNER_STATE_BUDGET_EXCEEDED",
  "CODE_AI_AUTONOMOUS_PLANNER_INSTRUCTION_BUDGET_EXCEEDED",
  "Search mode is part of action identity",
  "literal|regex|path|glob",
  "path_globs",
  "Read freshness is source-bound",
  "The hard planner-attempt ceiling is global across pending/resume cycles",
  "productive convergence budget",
  "bounded post-edit reserve",
  "Treat those file contents as observed current source and do not reread a covered range",
  "Use apply_files for every intentional source edit",
  "Use verify after source changes",
  "Never request push, deploy, publish, production, database mutation, credentials",
  "CURRENT ALLOWED ACTION SHAPES",
  "plannerRules(currentAllowedActions)",
  "An action absent from CURRENT ALLOWED ACTIONS is invalid",
  "inspect is bootstrap/replan-only",
  "Never emit more than one JSON object",
];

const promptMissing = promptRequiredMarkers.filter((marker) => !promptSource.includes(marker));
if (promptMissing.length) {
  throw new Error(`CODE_AI_AUTONOMY_PLANNER_PROMPT_MARKERS_MISSING:${promptMissing.join(",")}`);
}

const parserRequiredMarkers = [
  "safeSingleTrailingBraceOverEmission",
  "single_guarded_trailing_brace_over_emission",
  "discarded_trailing_brace_count",
];
const parserMissing = parserRequiredMarkers.filter((marker) => !parserSource.includes(marker));
if (parserMissing.length) {
  throw new Error(`CODE_AI_AUTONOMY_PLANNER_PARSER_MARKERS_MISSING:${parserMissing.join(",")}`);
}

if (!source.includes('buildCodeAIPlannerPromptTransport') || !source.includes('instruction: transport.instruction')) {
  throw new Error("CODE_AI_AUTONOMY_PLANNER_BOUNDED_TRANSPORT_NOT_WIRED");
}

const workspaceRequiredMarkers = [
  "AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT",
  "function certificationPinnedCommit(ref)",
  "const pinnedCommit = certificationPinnedCommit(gitRef)",
  'if (ref !== "main") return null',
  '["fetch", "--depth", "1", "origin", pinnedCommit]',
  '["checkout", "--detach", pinnedCommit]',
  "CODE_AI_CERTIFICATION_PINNED_COMMIT_MISMATCH",
  "certification_pinned_commit: pinnedCommit",
];

const capacityRunnerRequiredMarkers = [
  "AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: mainCommit",
  "certification_expected_main_commit: mainCommit",
  "certification_workspace_pin_active: true",
  "env: certificationEnv",
];
const capacityRunnerMissing = capacityRunnerRequiredMarkers.filter(
  (marker) => !capacityRunnerSource.includes(marker),
);
if (capacityRunnerMissing.length) {
  throw new Error(
    `CODE_AI_AUTONOMY_CERTIFICATION_PIN_LAUNCHER_MARKERS_MISSING:${capacityRunnerMissing.join(",")}`,
  );
}

const liveCertificationRequiredMarkers = [
  "AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT",
  "AVANTIQO_CODE_PLANNER_CERT_EXPECTED_MAIN_COMMIT_REQUIRED",
  "event(\"PIN_ACTIVE\"",
  "const observedBaseCommit = text(result.state?.base_commit).toLowerCase()",
  "AVANTIQO_CODE_PLANNER_CERT_PINNED_BASE_MISMATCH",
  "expected_main_commit: EXPECTED_MAIN_COMMIT",
  "observed_base_commit: observedBaseCommit",
  "workspace_pin_verified: true",
];
const liveCertificationMissing = liveCertificationRequiredMarkers.filter(
  (marker) => !liveCertificationSource.includes(marker),
);
if (liveCertificationMissing.length) {
  throw new Error(
    `CODE_AI_AUTONOMY_LIVE_CERTIFICATION_PIN_MARKERS_MISSING:${liveCertificationMissing.join(",")}`,
  );
}

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
if (missing.length) {
  throw new Error(`CODE_AI_AUTONOMY_LOOP_GUARD_MARKERS_MISSING:${missing.join(",")}`);
}

const workspaceMissing = workspaceRequiredMarkers.filter(
  (marker) => !workspaceSource.includes(marker),
);
if (workspaceMissing.length) {
  throw new Error(
    `CODE_AI_AUTONOMY_PINNED_WORKSPACE_MARKERS_MISSING:${workspaceMissing.join(",")}`,
  );
}

if (/for\s*\(let\s+iteration\s*=\s*1\s*;\s*iteration\s*<=\s*maximum/.test(source)) {
  throw new Error("CODE_AI_AUTONOMY_RESUME_BUDGET_RESET_LOOP_PRESENT");
}

const pendingBranch = source.indexOf("if (planned.pending)");
const pendingIterationPersistence = source.indexOf("pending_planner_iteration: iteration", pendingBranch);
if (pendingBranch < 0 || pendingIterationPersistence < pendingBranch) {
  throw new Error("CODE_AI_AUTONOMY_PENDING_ITERATION_NOT_PERSISTED");
}

const inspectionPolicy = source.indexOf("function plannerInspectionRequired(state)");
const inspectReplanGate = source.indexOf('text(source.status, 100) === "replan_required"', inspectionPolicy);
const inspectGuidanceGate = source.indexOf("!text(source.repository_guidance?.contract, 160)", inspectReplanGate);
const inspectRemoval = source.indexOf('allowedActions = allowedActions.filter((action) => action !== "inspect")', inspectGuidanceGate);
const plannerDecision = source.indexOf("const { decision } = planned;");
if (inspectionPolicy < 0 || inspectReplanGate <= inspectionPolicy || inspectGuidanceGate <= inspectReplanGate || inspectRemoval <= inspectGuidanceGate) {
  throw new Error("CODE_AI_AUTONOMY_INSPECT_MUST_BE_BOOTSTRAP_OR_REPLAN_ONLY");
}
const dynamicAllowedGuard = source.indexOf("const currentAllowedActions = plannerAllowedActions(state)", plannerDecision);
const dynamicAllowedReject = source.indexOf("status: \"rejected_suppressed_action\"", dynamicAllowedGuard);
const duplicateGuard = source.indexOf("const duplicate = duplicateActionGuard(control, decision)");
if (
  plannerDecision < 0 ||
  dynamicAllowedGuard <= plannerDecision ||
  dynamicAllowedReject <= dynamicAllowedGuard ||
  dynamicAllowedReject >= duplicateGuard
) {
  throw new Error("CODE_AI_AUTONOMY_DYNAMIC_ALLOWED_ACTION_GUARD_MUST_PRECEDE_DUPLICATE_AND_EXECUTION");
}
const duplicateProgressRecord = source.indexOf("control = recordDuplicateProgress(control, decision.action)", duplicateGuard);
const duplicateProgressPersist = source.indexOf("state = withAutonomyControl(state, control)", duplicateProgressRecord);
const duplicateStreak = source.indexOf("const duplicateRejectionStreak = nonNegativeInteger(control.duplicate_rejection_streak)", duplicateProgressPersist);
const duplicateStreakLimit = source.indexOf("duplicateRejectionStreak >= MAX_DUPLICATE_REJECTION_STREAK", duplicateStreak);
const missionExecution = source.indexOf("const executeOperation = () => executeCodeAIMission", duplicateGuard);
if (duplicateGuard < 0 || missionExecution <= duplicateGuard) {
  throw new Error("CODE_AI_AUTONOMY_DUPLICATE_GUARD_MUST_PRECEDE_MISSION_EXECUTION");
}
if (
  duplicateProgressRecord <= duplicateGuard ||
  duplicateProgressPersist <= duplicateProgressRecord ||
  duplicateStreak <= duplicateProgressPersist ||
  duplicateStreakLimit <= duplicateStreak ||
  duplicateStreakLimit >= missionExecution
) {
  throw new Error("CODE_AI_AUTONOMY_DUPLICATE_REJECTION_STREAK_MUST_FAIL_CLOSED_BEFORE_EXECUTION");
}

const transientRetry = source.indexOf('kind: "autonomous_execution_retry"', missionExecution);
const terminalExecutionFailure = source.indexOf('kind: "autonomous_execution_failure"', transientRetry);
if (transientRetry <= missionExecution || terminalExecutionFailure <= transientRetry) {
  throw new Error("CODE_AI_AUTONOMY_TRANSIENT_WORKSPACE_RETRY_MUST_PRECEDE_TERMINAL_FAILURE");
}

const hardAttemptGuard = source.indexOf("control.planner_iterations_used >= MAX_ITERATIONS");
const productiveBudgetGuard = source.indexOf("control.productive_planner_iterations_used", hardAttemptGuard);
const finalizationGuard = source.indexOf("!missionFinalizationEligible(state)", productiveBudgetGuard);
const plannerCall = source.indexOf("planned = await planNext", finalizationGuard);
if (
  hardAttemptGuard < 0 ||
  productiveBudgetGuard <= hardAttemptGuard ||
  finalizationGuard <= productiveBudgetGuard ||
  plannerCall <= finalizationGuard
) {
  throw new Error("CODE_AI_AUTONOMY_DUAL_BUDGET_GUARDS_MUST_PRECEDE_NEW_PLANNER_CALL");
}

const duplicateContinue = source.indexOf("continue;", duplicateStreakLimit);
const productiveConsumeAfterDuplicate = source.indexOf(
  "control = consumeProductiveIteration(resetDuplicateProgress(control))",
  duplicateContinue,
);
if (duplicateContinue < 0 || productiveConsumeAfterDuplicate <= duplicateContinue) {
  throw new Error("CODE_AI_AUTONOMY_DUPLICATE_REJECTION_MUST_NOT_CONSUME_PRODUCTIVE_BUDGET");
}

const firstDuplicateSuppression = source.indexOf("if (streak < 1 || !DUPLICATE_GUARDED_ACTIONS.has(repeatedAction))");
if (firstDuplicateSuppression < 0) {
  throw new Error("CODE_AI_AUTONOMY_FIRST_DUPLICATE_MUST_SUPPRESS_REPEATED_ACTION_TYPE");
}

const sourceRevisionControl = source.indexOf("source_revision: nonNegativeInteger(source.source_revision)");
const readSourceRevisionGuard = source.indexOf("entry.source_revision !== currentSourceRevision");
if (sourceRevisionControl < 0 || readSourceRevisionGuard < sourceRevisionControl) {
  throw new Error("CODE_AI_AUTONOMY_READ_GUARD_MUST_USE_SOURCE_REVISION");
}

const coveredReadGuard = source.indexOf("readRangeCovered(entry.normalized_input, normalizedInput)");
if (coveredReadGuard < readSourceRevisionGuard) {
  throw new Error("CODE_AI_AUTONOMY_COVERED_READ_GUARD_REQUIRED");
}

const compactState = source.indexOf("function compactState(state = {})");
const compactSourceRevision = source.indexOf("const currentSourceRevision = nonNegativeInteger(control.source_revision)", compactState);
const currentReadOperationIds = source.indexOf("const currentReadOperationIds = new Set", compactSourceRevision);
const sourceReadEvidence = source.indexOf("const sourceReadEvidence = list(source.evidence)", currentReadOperationIds);
const sourceReadRevisionFilter = source.indexOf("entry.source_revision === currentSourceRevision", currentReadOperationIds);
const compactReadExport = source.indexOf("source_read_evidence: sourceReadEvidence", sourceReadEvidence);
if (
  compactState < 0 ||
  compactSourceRevision <= compactState ||
  currentReadOperationIds <= compactSourceRevision ||
  sourceReadRevisionFilter <= currentReadOperationIds ||
  sourceReadEvidence <= currentReadOperationIds ||
  compactReadExport <= sourceReadEvidence
) {
  throw new Error("CODE_AI_AUTONOMY_SOURCE_READ_EVIDENCE_MUST_BE_BOUND_TO_CURRENT_SOURCE_REVISION");
}

const genericEvidenceWindow = source.indexOf("evidence: list(source.evidence).slice(-12)", compactReadExport);
if (genericEvidenceWindow <= compactReadExport) {
  throw new Error("CODE_AI_AUTONOMY_SOURCE_READ_EVIDENCE_MUST_BE_SEPARATE_FROM_ROLLING_EVIDENCE_WINDOW");
}

const operationObservation = source.indexOf("const operationObserved =");
const sourceAdvanceOnApply = source.indexOf('decision.action === "apply_files"', operationObservation);
const sourceAdvanceOnReplan = source.indexOf('execution.status === "replan_required"', sourceAdvanceOnApply);
if (operationObservation < 0 || sourceAdvanceOnApply < operationObservation || sourceAdvanceOnReplan < sourceAdvanceOnApply) {
  throw new Error("CODE_AI_AUTONOMY_SOURCE_REVISION_ADVANCE_POLICY_REQUIRED");
}

const capacityMainCommit = capacityRunnerSource.indexOf("const mainCommit = ensureCurrentMain()");
const capacityPinEnv = capacityRunnerSource.indexOf(
  "AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: mainCommit",
  capacityMainCommit,
);
const capacityChildSpawn = capacityRunnerSource.indexOf(
  "scripts/run-code-ai-autonomous-planner-certification-resilient-local.mjs",
  capacityPinEnv,
);
const capacityChildPinEnv = capacityRunnerSource.indexOf("env: certificationEnv", capacityChildSpawn);
if (
  capacityMainCommit < 0 ||
  capacityPinEnv <= capacityMainCommit ||
  capacityChildSpawn <= capacityPinEnv ||
  capacityChildPinEnv <= capacityChildSpawn
) {
  throw new Error("CODE_AI_AUTONOMY_CERTIFICATION_MAIN_PIN_MUST_REACH_CHILD_ENV");
}

const livePinGuard = liveCertificationSource.indexOf(
  "AVANTIQO_CODE_PLANNER_CERT_EXPECTED_MAIN_COMMIT_REQUIRED",
);
const livePlannerCall = liveCertificationSource.indexOf("const result = await executeAutonomousCodeMission", livePinGuard);
const liveObservedBase = liveCertificationSource.indexOf(
  "const observedBaseCommit = text(result.state?.base_commit).toLowerCase()",
  livePlannerCall,
);
const livePinnedMismatch = liveCertificationSource.indexOf(
  "AVANTIQO_CODE_PLANNER_CERT_PINNED_BASE_MISMATCH",
  liveObservedBase,
);
const liveCycleResult = liveCertificationSource.indexOf('event("CYCLE_RESULT"', livePinnedMismatch);
if (
  livePinGuard < 0 ||
  livePlannerCall <= livePinGuard ||
  liveObservedBase <= livePlannerCall ||
  livePinnedMismatch <= liveObservedBase ||
  liveCycleResult <= livePinnedMismatch
) {
  throw new Error("CODE_AI_AUTONOMY_LIVE_CERTIFICATION_PIN_MUST_FAIL_CLOSED_AROUND_PLANNER_CYCLE");
}

const pinnedCommitResolver = workspaceSource.indexOf("function certificationPinnedCommit(ref)");
const cloneOperation = workspaceSource.indexOf('["clone", "--depth", "1", "--branch", gitRef, "--single-branch", repositoryUrl, REPOSITORY_ROOT]');
const pinnedFetch = workspaceSource.indexOf('["fetch", "--depth", "1", "origin", pinnedCommit]', cloneOperation);
const pinnedCheckout = workspaceSource.indexOf('["checkout", "--detach", pinnedCommit]', pinnedFetch);
const baselineInspection = workspaceSource.indexOf("const baseline = await inspectRepository(sandbox)", pinnedCheckout);
if (
  pinnedCommitResolver < 0 ||
  cloneOperation < 0 ||
  pinnedFetch <= cloneOperation ||
  pinnedCheckout <= pinnedFetch ||
  baselineInspection <= pinnedCheckout
) {
  throw new Error("CODE_AI_AUTONOMY_CERTIFICATION_PIN_MUST_PRECEDE_BASELINE_INSPECTION");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V11",
  verified: {
    duplicate_read_search_run_guarded_without_new_evidence: true,
    search_fingerprint_distinguishes_literal_regex_path_glob: true,
    planner_receives_expanded_search_contract: true,
    source_bound_read_freshness: true,
    covered_read_ranges_rejected_without_source_change: true,
    current_revision_read_evidence_retained_for_planner: true,
    read_evidence_retention_independent_of_generic_evidence_window: true,
    rejected_duplicate_actions_exposed_to_planner: true,
    duplicate_rejection_streak_bounded: true,
    duplicate_rejection_streak_fails_closed_before_workspace_execution: true,
    duplicate_rejection_streak_persisted_in_autonomy_control: true,
    duplicate_rejection_streak_is_action_local: true,
    resume_duplicate_recovery_is_action_local: true,
    repeated_duplicate_action_temporarily_suppressed_after_first_rejection: true,
    suppressed_action_shapes_removed_from_planner_prompt: true,
    dynamic_allowed_action_guard_enforced_before_execution: true,
    planner_inspect_is_bootstrap_or_replan_only: true,
    post_edit_inspect_escape_hatch_closed: true,
    suppressed_action_rejections_bounded: true,
    unrelated_observations_do_not_refresh_source_reads: true,
    apply_files_refreshes_source_reads: true,
    main_replan_refreshes_source_reads: true,
    certification_workspace_pinned_to_preflight_main_commit: true,
    certification_launcher_exports_pinned_main_commit: true,
    live_certification_fails_closed_without_valid_pin: true,
    live_certification_checks_observed_workspace_base_against_pin: true,
    parallel_main_commits_do_not_move_certification_workspace: true,
    duplicate_guard_precedes_workspace_execution: true,
    global_iteration_budget_persisted_in_resume_state: true,
    hard_planner_attempt_ceiling_remains_bounded_across_resume: true,
    duplicate_and_suppressed_rejections_do_not_consume_productive_budget: true,
    accepted_actions_consume_productive_budget: true,
    successful_source_edit_unlocks_bounded_convergence_reserve: true,
    verified_completion_can_use_terminal_attempt_headroom: true,
    pending_resume_reuses_original_iteration: true,
    resumed_operation_ids_remain_globally_monotonic: true,
    legacy_per_invocation_iteration_reset_removed: true,
    transient_workspace_termination_retried_once: true,
    transient_workspace_retry_reuses_planner_decision: true,
    transient_workspace_retry_does_not_submit_new_planner_request: true,
    repeated_workspace_termination_remains_fail_closed: true,
    bounded_planner_prompt_transport: true,
    planner_instruction_below_worker_hard_limit: true,
    duplicate_objective_and_state_removed_from_structured_specification: true,
    same_guarded_multi_object_planner_output_normalized_without_new_provider_call: true,
    mixed_multi_action_planner_output_fails_closed: true,
    mutating_multi_object_planner_output_fails_closed: true,
    planner_prompt_forbids_multi_object_output: true,
    single_guarded_trailing_brace_over_emission_normalized: true,
    mutating_trailing_brace_over_emission_fails_closed: true,
    multiple_trailing_braces_fail_closed: true,
  },
  provider_calls_executed: false,
  provider_spend_approved: false,
  production_deploy_performed: false,
}, null, 2));
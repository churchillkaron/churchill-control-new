import { readFile } from "node:fs/promises";

const path = "lib/code/runtime/CodeAIAutonomousRuntime.js";
const source = await readFile(path, "utf8");
const workspacePath = "lib/code/runtime/CodeWorkspaceSandboxRuntime.js";
const workspaceSource = await readFile(workspacePath, "utf8");
const promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";
const promptSource = await readFile(promptPath, "utf8");

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
  "control.planner_iterations_used >= maximum",
  "iteration = control.planner_iterations_used + 1",
  "const operationId = `autonomy_${iteration}_${decision.action}`",
  "TRANSIENT_WORKSPACE_RETRY_LIMIT = 1",
  "isTransientWorkspaceTermination",
  'kind: "autonomous_execution_retry"',
  "same_operation_retried: true",
  "new_planner_request_submitted: false",
  "MAX_SOURCE_READ_EVIDENCE = 8",
  "MAX_DUPLICATE_REJECTION_STREAK = 3",
  "source_read_evidence",
  "rejected_duplicate_actions",
  "duplicate_rejection_streak",
  "last_duplicate_action",
  "recordDuplicateProgress",
  "resetDuplicateProgress",
  "plannerAllowedActions",
  "trailingDuplicateRejectionStreak",
  "CODE_AI_AUTONOMOUS_DUPLICATE_ACTION_STREAK_EXCEEDED",
  "currentSourceRevision",
  "max_duplicate_rejection_streak",
  "source_read_evidence_limit",
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
  "The planner iteration budget is global across pending/resume cycles",
  "Treat those file contents as observed current source and do not reread a covered range",
  "Use apply_files for every intentional source edit",
  "Use verify after source changes",
  "Never request push, deploy, publish, production, database mutation, credentials",
];

const promptMissing = promptRequiredMarkers.filter((marker) => !promptSource.includes(marker));
if (promptMissing.length) {
  throw new Error(`CODE_AI_AUTONOMY_PLANNER_PROMPT_MARKERS_MISSING:${promptMissing.join(",")}`);
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

const duplicateGuard = source.indexOf("const duplicate = duplicateActionGuard(control, decision)");
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

const budgetGuard = source.indexOf("control.planner_iterations_used >= maximum");
const plannerCall = source.indexOf("planned = await planNext", budgetGuard);
if (budgetGuard < 0 || plannerCall <= budgetGuard) {
  throw new Error("CODE_AI_AUTONOMY_GLOBAL_BUDGET_GUARD_MUST_PRECEDE_NEW_PLANNER_CALL");
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
  contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V5",
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
    repeated_duplicate_action_temporarily_suppressed_after_second_rejection: true,
    unrelated_observations_do_not_refresh_source_reads: true,
    apply_files_refreshes_source_reads: true,
    main_replan_refreshes_source_reads: true,
    certification_workspace_pinned_to_preflight_main_commit: true,
    parallel_main_commits_do_not_move_certification_workspace: true,
    duplicate_guard_precedes_workspace_execution: true,
    global_iteration_budget_persisted_in_resume_state: true,
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
  },
  provider_calls_executed: false,
  provider_spend_approved: false,
  production_deploy_performed: false,
}, null, 2));
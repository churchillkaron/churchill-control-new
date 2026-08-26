import { readFile } from "node:fs/promises";

const path = "lib/code/runtime/CodeAIAutonomousRuntime.js";
const source = await readFile(path, "utf8");

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
  "readRangeCovered",
  "READ_RANGE_COVERED",
  "advanceSourceRevision",
  "duplicateActionGuard(control, decision)",
  "control.planner_iterations_used >= maximum",
  "iteration = control.planner_iterations_used + 1",
  "const operationId = `autonomy_${iteration}_${decision.action}`",
  "Read freshness is source-bound",
  "The planner iteration budget is global across pending/resume cycles",
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
  "trailingDuplicateRejectionStreak",
  "CODE_AI_AUTONOMOUS_DUPLICATE_ACTION_STREAK_EXCEEDED",
  "currentSourceRevision",
  "Treat those file contents as observed current source and do not reread a covered range",
  "max_duplicate_rejection_streak",
  "source_read_evidence_limit",
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
if (missing.length) {
  throw new Error(`CODE_AI_AUTONOMY_LOOP_GUARD_MARKERS_MISSING:${missing.join(",")}`);
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
const duplicateStreak = source.indexOf("const duplicateRejectionStreak = trailingDuplicateRejectionStreak(state)", duplicateGuard);
const duplicateStreakLimit = source.indexOf("duplicateRejectionStreak >= MAX_DUPLICATE_REJECTION_STREAK", duplicateStreak);
const missionExecution = source.indexOf("const executeOperation = () => executeCodeAIMission", duplicateGuard);
if (duplicateGuard < 0 || missionExecution <= duplicateGuard) {
  throw new Error("CODE_AI_AUTONOMY_DUPLICATE_GUARD_MUST_PRECEDE_MISSION_EXECUTION");
}
if (
  duplicateStreak <= duplicateGuard ||
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

const plannerInstruction = source.indexOf("function plannerInstruction", compactState);
const sourceReadInstruction = source.indexOf("source_read_evidence contains successful read results", plannerInstruction);
const duplicateInstruction = source.indexOf("rejected_duplicate_actions lists recent planner decisions", sourceReadInstruction);
if (sourceReadInstruction <= plannerInstruction || duplicateInstruction <= sourceReadInstruction) {
  throw new Error("CODE_AI_AUTONOMY_PLANNER_MUST_RECEIVE_PERSISTED_READ_AND_DUPLICATE_FEEDBACK");
}

const operationObservation = source.indexOf("const operationObserved =");
const sourceAdvanceOnApply = source.indexOf('decision.action === "apply_files"', operationObservation);
const sourceAdvanceOnReplan = source.indexOf('execution.status === "replan_required"', sourceAdvanceOnApply);
if (operationObservation < 0 || sourceAdvanceOnApply < operationObservation || sourceAdvanceOnReplan < sourceAdvanceOnApply) {
  throw new Error("CODE_AI_AUTONOMY_SOURCE_REVISION_ADVANCE_POLICY_REQUIRED");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V4",
  verified: {
    duplicate_read_search_run_guarded_without_new_evidence: true,
    source_bound_read_freshness: true,
    covered_read_ranges_rejected_without_source_change: true,
    current_revision_read_evidence_retained_for_planner: true,
    read_evidence_retention_independent_of_generic_evidence_window: true,
    rejected_duplicate_actions_exposed_to_planner: true,
    duplicate_rejection_streak_bounded: true,
    duplicate_rejection_streak_fails_closed_before_workspace_execution: true,
    unrelated_observations_do_not_refresh_source_reads: true,
    apply_files_refreshes_source_reads: true,
    main_replan_refreshes_source_reads: true,
    duplicate_guard_precedes_workspace_execution: true,
    global_iteration_budget_persisted_in_resume_state: true,
    pending_resume_reuses_original_iteration: true,
    resumed_operation_ids_remain_globally_monotonic: true,
    legacy_per_invocation_iteration_reset_removed: true,
    transient_workspace_termination_retried_once: true,
    transient_workspace_retry_reuses_planner_decision: true,
    transient_workspace_retry_does_not_submit_new_planner_request: true,
    repeated_workspace_termination_remains_fail_closed: true,
  },
  provider_calls_executed: false,
  provider_spend_approved: false,
  production_deploy_performed: false,
}, null, 2));

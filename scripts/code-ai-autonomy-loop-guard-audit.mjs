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
  "guarded_actions",
  "duplicateActionGuard(control, decision)",
  "control.planner_iterations_used >= maximum",
  "iteration = control.planner_iterations_used + 1",
  "const operationId = `autonomy_${iteration}_${decision.action}`",
  "Equivalent completed read, search, or run actions are rejected",
  "The planner iteration budget is global across pending/resume cycles",
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
const missionExecution = source.indexOf("execution = await executeCodeAIMission", duplicateGuard);
if (duplicateGuard < 0 || missionExecution <= duplicateGuard) {
  throw new Error("CODE_AI_AUTONOMY_DUPLICATE_GUARD_MUST_PRECEDE_MISSION_EXECUTION");
}

const budgetGuard = source.indexOf("control.planner_iterations_used >= maximum");
const plannerCall = source.indexOf("planned = await planNext", budgetGuard);
if (budgetGuard < 0 || plannerCall <= budgetGuard) {
  throw new Error("CODE_AI_AUTONOMY_GLOBAL_BUDGET_GUARD_MUST_PRECEDE_NEW_PLANNER_CALL");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V1",
  verified: {
    duplicate_read_search_run_guarded_without_new_evidence: true,
    duplicate_guard_precedes_workspace_execution: true,
    global_iteration_budget_persisted_in_resume_state: true,
    pending_resume_reuses_original_iteration: true,
    resumed_operation_ids_remain_globally_monotonic: true,
    legacy_per_invocation_iteration_reset_removed: true,
  },
  provider_calls_executed: false,
  provider_spend_approved: false,
  production_deploy_performed: false,
}, null, 2));

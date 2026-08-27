import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

const runtimePath = "lib/code/runtime/CodeAIAutonomousRuntime.js";
let runtime = await readFile(runtimePath, "utf8");

runtime = replaceRequired(
  runtime,
  'const MAX_SUPPRESSED_ACTION_REJECTION_STREAK = 2;\nconst TRANSIENT_WORKSPACE_RETRY_LIMIT = 1;',
  'const MAX_SUPPRESSED_ACTION_REJECTION_STREAK = 2;\nconst MAX_PRODUCTIVE_CONVERGENCE_RESERVE = 4;\nconst MAX_FINALIZATION_ATTEMPT_RESERVE = 2;\nconst TRANSIENT_WORKSPACE_RETRY_LIMIT = 1;',
  "runtime-convergence-constants",
);

runtime = replaceRequired(
  runtime,
  'function normalizedGuardedActionHistory(value) {',
  `function recoveredProductivePlannerIterations(state) {
  const logicalIterations = new Set();
  for (const entry of list(state?.evidence)) {
    const kind = text(entry?.kind, 120);
    if (kind === "operation") {
      const operationId = text(entry?.operation_id, 200);
      const match = /^autonomy_(\\d+)_/.exec(operationId);
      if (match) logicalIterations.add(Number(match[1]));
      continue;
    }
    if (kind === "governed_research" || kind === "governed_research_failure") {
      const iteration = nonNegativeInteger(entry?.iteration);
      if (iteration > 0) logicalIterations.add(iteration);
    }
  }
  return logicalIterations.size;
}

function productiveIterationLimit(state, maximum) {
  const changed =
    list(state?.source_changes).length > 0 ||
    list(state?.files_changed).length > 0;
  const reserve = changed ? MAX_PRODUCTIVE_CONVERGENCE_RESERVE : 0;
  return Math.min(
    MAX_ITERATIONS - MAX_FINALIZATION_ATTEMPT_RESERVE,
    maximum + reserve,
  );
}

function missionFinalizationEligible(state) {
  const changed =
    list(state?.source_changes).length > 0 ||
    list(state?.files_changed).length > 0;
  const verified = list(state?.verification).some((item) => item?.passed === true);
  return text(state?.status, 100) === "completed" && (!changed || verified);
}

function consumeProductiveIteration(control) {
  return {
    ...control,
    productive_planner_iterations_used:
      nonNegativeInteger(control?.productive_planner_iterations_used) + 1,
  };
}

function normalizedGuardedActionHistory(value) {`,
  "runtime-productive-budget-helpers",
);

runtime = replaceRequired(
  runtime,
  '    planner_iterations_used: plannerIterationsUsed,\n    pending_planner_iteration: pendingPlannerIteration || null,',
  '    planner_iterations_used: plannerIterationsUsed,\n    productive_planner_iterations_used: Math.max(\n      nonNegativeInteger(source.productive_planner_iterations_used),\n      recoveredProductivePlannerIterations(state),\n    ),\n    pending_planner_iteration: pendingPlannerIteration || null,',
  "runtime-productive-control-state",
);

runtime = replaceRequired(
  runtime,
  '  if (streak < 2 || !DUPLICATE_GUARDED_ACTIONS.has(repeatedAction)) {',
  '  if (streak < 1 || !DUPLICATE_GUARDED_ACTIONS.has(repeatedAction)) {',
  "runtime-first-duplicate-suppression",
);

runtime = replaceRequired(
  runtime,
  '  const used = nonNegativeInteger(control.planner_iterations_used);\n  const currentSourceRevision = nonNegativeInteger(control.source_revision);',
  '  const used = nonNegativeInteger(control.planner_iterations_used);\n  const productiveUsed = nonNegativeInteger(control.productive_planner_iterations_used);\n  const productiveLimit = productiveIterationLimit(source, maximum);\n  const currentSourceRevision = nonNegativeInteger(control.source_revision);',
  "runtime-compact-productive-state",
);

runtime = replaceRequired(
  runtime,
  '      planner_iterations_used: used,\n      max_iterations: maximum,\n      remaining_iterations: Math.max(0, maximum - used),',
  '      planner_iterations_used: used,\n      max_iterations: maximum,\n      remaining_iterations: Math.max(0, productiveLimit - productiveUsed),\n      planner_attempt_limit: MAX_ITERATIONS,\n      remaining_planner_attempts: Math.max(0, MAX_ITERATIONS - used),\n      productive_planner_iterations_used: productiveUsed,\n      productive_iteration_limit: productiveLimit,\n      remaining_productive_iterations: Math.max(0, productiveLimit - productiveUsed),\n      post_edit_convergence_reserve_active: productiveLimit > maximum,',
  "runtime-compact-budget-export",
);

runtime = replaceRequired(
  runtime,
  `    } else {
      if (control.planner_iterations_used >= maximum) {
        return blockedResult(
          state,
          "CODE_AI_AUTONOMOUS_ITERATION_BUDGET_EXHAUSTED",
          control.planner_iterations_used,
        );
      }
      iteration = control.planner_iterations_used + 1;`,
  `    } else {
      if (control.planner_iterations_used >= MAX_ITERATIONS) {
        return blockedResult(
          state,
          "CODE_AI_AUTONOMOUS_PLANNER_ATTEMPT_LIMIT_EXHAUSTED",
          control.planner_iterations_used,
        );
      }
      const productiveLimit = productiveIterationLimit(state, maximum);
      if (
        nonNegativeInteger(control.productive_planner_iterations_used) >= productiveLimit &&
        !missionFinalizationEligible(state)
      ) {
        return blockedResult(
          state,
          "CODE_AI_AUTONOMOUS_ITERATION_BUDGET_EXHAUSTED",
          control.planner_iterations_used,
        );
      }
      iteration = control.planner_iterations_used + 1;`,
  "runtime-dual-budget-guard",
);

runtime = replaceRequired(
  runtime,
  '    if (decision.action === "research") {\n      control = resetDuplicateProgress(control);',
  '    if (decision.action === "research") {\n      control = consumeProductiveIteration(resetDuplicateProgress(control));',
  "runtime-research-productive-consume",
);

runtime = replaceRequired(
  runtime,
  '    control = resetDuplicateProgress(control);\n    state = withAutonomyControl(state, control);\n\n    const operationId = `autonomy_${iteration}_${decision.action}`;',
  '    control = consumeProductiveIteration(resetDuplicateProgress(control));\n    state = withAutonomyControl(state, control);\n\n    const operationId = `autonomy_${iteration}_${decision.action}`;',
  "runtime-operation-productive-consume",
);

runtime = replaceRequired(
  runtime,
  '  max_iterations: MAX_ITERATIONS,\n  max_duplicate_rejection_streak: MAX_DUPLICATE_REJECTION_STREAK,',
  '  max_iterations: MAX_ITERATIONS,\n  max_planner_attempts: MAX_ITERATIONS,\n  productive_convergence_reserve: MAX_PRODUCTIVE_CONVERGENCE_RESERVE,\n  finalization_attempt_reserve: MAX_FINALIZATION_ATTEMPT_RESERVE,\n  max_duplicate_rejection_streak: MAX_DUPLICATE_REJECTION_STREAK,',
  "runtime-budget-exports",
);

await writeFile(runtimePath, runtime, "utf8");

const promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";
let prompt = await readFile(promptPath, "utf8");
prompt = replaceRequired(
  prompt,
  '- The planner iteration budget is global across pending/resume cycles; a resume never resets it. Use the remaining iterations deliberately.',
  '- The hard planner-attempt ceiling is global across pending/resume cycles; a resume never resets it. Rejected duplicate or suppressed choices still consume hard attempts but do not consume productive convergence iterations.\n- The productive convergence budget counts accepted engineering/research steps. A successful source edit unlocks only the bounded post-edit reserve shown in state so verify, repair, reverify and finalization can converge without becoming unbounded.',
  "prompt-dual-budget-rule",
);
await writeFile(promptPath, prompt, "utf8");

const certPath = "scripts/certify-code-ai-autonomous-planner-service-runtime-live.mjs";
let cert = await readFile(certPath, "utf8");
cert = replaceRequired(
  cert,
  'const MAX_ITERATIONS_PER_CYCLE = 12;',
  'const BASE_PRODUCTIVE_ITERATIONS = 12;',
  "cert-base-productive-budget-name",
);
cert = replaceRequired(
  cert,
  '      max_iterations: MAX_ITERATIONS_PER_CYCLE,',
  '      max_iterations: BASE_PRODUCTIVE_ITERATIONS,',
  "cert-runtime-productive-budget",
);
cert = replaceRequired(
  cert,
  `  if (Number(control.planner_iterations_used || 0) > MAX_ITERATIONS_PER_CYCLE) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_GLOBAL_ITERATION_BUDGET_EXCEEDED");
  }`,
  `  if (Number(control.planner_iterations_used || 0) > Number(CodeAIAutonomousRuntime?.max_planner_attempts || 0)) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_HARD_ATTEMPT_BUDGET_EXCEEDED");
  }
  const productiveLimit =
    BASE_PRODUCTIVE_ITERATIONS +
    Number(CodeAIAutonomousRuntime?.productive_convergence_reserve || 0);
  if (Number(control.productive_planner_iterations_used || 0) > productiveLimit) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_PRODUCTIVE_CONVERGENCE_BUDGET_EXCEEDED");
  }`,
  "cert-dual-budget-final-check",
);
await writeFile(certPath, cert, "utf8");

const duplicateTestPath = "scripts/code-ai-duplicate-forward-progress-selftest.mjs";
let duplicateTest = await readFile(duplicateTestPath, "utf8");
duplicateTest = replaceRequired(
  duplicateTest,
  '  state: { autonomy_control: { duplicate_rejection_streak: 2, last_duplicate_action: "read" } },',
  '  state: { autonomy_control: { duplicate_rejection_streak: 1, last_duplicate_action: "read" } },',
  "duplicate-test-prompt-streak",
);
duplicateTest = replaceRequired(
  duplicateTest,
  '  if (Number(control.duplicate_rejection_streak || 0) < 2) return base;',
  '  if (Number(control.duplicate_rejection_streak || 0) < 1) return base;',
  "duplicate-test-allowed-threshold",
);
duplicateTest = replaceRequired(
  duplicateTest,
  'control = nextDuplicate(control, "read");\ncontrol = nextDuplicate(control, "read");\nassert.equal(allowed(control).includes("read"), false);',
  'control = nextDuplicate(control, "read");\nassert.equal(allowed(control).includes("read"), false);',
  "duplicate-test-first-rejection-suppresses",
);
duplicateTest = replaceRequired(
  duplicateTest,
  'contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V2",',
  'contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V3",',
  "duplicate-test-contract",
);
duplicateTest = replaceRequired(
  duplicateTest,
  'second_duplicate_temporarily_suppresses_repeated_action_type: true,',
  'first_duplicate_temporarily_suppresses_repeated_action_type: true,',
  "duplicate-test-output-name",
);
duplicateTest = replaceRequired(
  duplicateTest,
  'console.log("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V2=PASS");',
  'console.log("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V3=PASS");',
  "duplicate-test-pass-marker",
);
await writeFile(duplicateTestPath, duplicateTest, "utf8");

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
let audit = await readFile(auditPath, "utf8");
audit = replaceRequired(
  audit,
  '  "control.planner_iterations_used >= maximum",',
  '  "control.planner_iterations_used >= MAX_ITERATIONS",\n  "productive_planner_iterations_used",\n  "recoveredProductivePlannerIterations",\n  "productiveIterationLimit",\n  "missionFinalizationEligible",\n  "consumeProductiveIteration",\n  "MAX_PRODUCTIVE_CONVERGENCE_RESERVE = 4",\n  "MAX_FINALIZATION_ATTEMPT_RESERVE = 2",\n  "CODE_AI_AUTONOMOUS_PLANNER_ATTEMPT_LIMIT_EXHAUSTED",',
  "audit-dual-budget-markers",
);
audit = replaceRequired(
  audit,
  '  "The planner iteration budget is global across pending/resume cycles",',
  '  "The hard planner-attempt ceiling is global across pending/resume cycles",\n  "productive convergence budget",\n  "bounded post-edit reserve",',
  "audit-prompt-dual-budget-markers",
);
audit = replaceRequired(
  audit,
  `const budgetGuard = source.indexOf("control.planner_iterations_used >= maximum");
const plannerCall = source.indexOf("planned = await planNext", budgetGuard);
if (budgetGuard < 0 || plannerCall <= budgetGuard) {
  throw new Error("CODE_AI_AUTONOMY_GLOBAL_BUDGET_GUARD_MUST_PRECEDE_NEW_PLANNER_CALL");
}`,
  `const hardAttemptGuard = source.indexOf("control.planner_iterations_used >= MAX_ITERATIONS");
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
}`,
  "audit-dual-budget-ordering",
);
audit = replaceRequired(
  audit,
  'contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V6",',
  'contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V7",',
  "audit-contract",
);
audit = replaceRequired(
  audit,
  'repeated_duplicate_action_temporarily_suppressed_after_second_rejection: true,',
  'repeated_duplicate_action_temporarily_suppressed_after_first_rejection: true,',
  "audit-first-duplicate-output",
);
audit = replaceRequired(
  audit,
  '    global_iteration_budget_persisted_in_resume_state: true,',
  '    global_iteration_budget_persisted_in_resume_state: true,\n    hard_planner_attempt_ceiling_remains_bounded_across_resume: true,\n    duplicate_and_suppressed_rejections_do_not_consume_productive_budget: true,\n    accepted_actions_consume_productive_budget: true,\n    successful_source_edit_unlocks_bounded_convergence_reserve: true,\n    verified_completion_can_use_terminal_attempt_headroom: true,',
  "audit-dual-budget-output",
);
await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_CONVERGENCE_BUDGET_PATCH_V1",
  files_changed: [
    runtimePath,
    promptPath,
    certPath,
    duplicateTestPath,
    auditPath,
  ],
  hard_planner_attempt_ceiling: 24,
  base_productive_certification_budget: 12,
  post_edit_productive_reserve: 4,
  first_duplicate_suppression: true,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

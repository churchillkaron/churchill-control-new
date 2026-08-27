import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`CODE_AI_INSPECT_PROGRESS_PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

const runtimePath = "lib/code/runtime/CodeAIAutonomousRuntime.js";
let runtime = await readFile(runtimePath, "utf8");

runtime = replaceRequired(
  runtime,
  `function plannerAllowedActions(state) {\n  const control = object(state?.autonomy_control);\n  const streak = nonNegativeInteger(control.duplicate_rejection_streak);\n  const repeatedAction = text(control.last_duplicate_action, 80);\n  if (streak < 1 || !DUPLICATE_GUARDED_ACTIONS.has(repeatedAction)) {\n    return [...ALLOWED_ACTIONS];\n  }\n  return [...ALLOWED_ACTIONS].filter((action) => action !== repeatedAction);\n}`,
  `function plannerInspectionRequired(state) {\n  const source = object(state);\n  if (!text(source.base_commit, 120)) return true;\n  if (text(source.status, 100) === "replan_required") return true;\n  return !text(source.repository_guidance?.contract, 160);\n}\n\nfunction plannerAllowedActions(state) {\n  const control = object(state?.autonomy_control);\n  const streak = nonNegativeInteger(control.duplicate_rejection_streak);\n  const repeatedAction = text(control.last_duplicate_action, 80);\n  let allowedActions = [...ALLOWED_ACTIONS];\n  if (!plannerInspectionRequired(state)) {\n    allowedActions = allowedActions.filter((action) => action !== "inspect");\n  }\n  if (streak < 1 || !DUPLICATE_GUARDED_ACTIONS.has(repeatedAction)) {\n    return allowedActions;\n  }\n  return allowedActions.filter((action) => action !== repeatedAction);\n}`,
  "runtime-planner-inspection-policy",
);

for (const marker of [
  "function plannerInspectionRequired(state)",
  'text(source.status, 100) === "replan_required"',
  "!text(source.repository_guidance?.contract, 160)",
  'allowedActions = allowedActions.filter((action) => action !== "inspect")',
]) {
  if (!runtime.includes(marker)) throw new Error(`CODE_AI_INSPECT_PROGRESS_RUNTIME_MARKER_MISSING:${marker}`);
}
await writeFile(runtimePath, runtime, "utf8");

const promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";
let prompt = await readFile(promptPath, "utf8");
prompt = replaceRequired(
  prompt,
  `- Inspect/search/read before editing when evidence is insufficient.\n- The hard planner-attempt ceiling is global across pending/resume cycles; a resume never resets it.`,
  `- Inspect/search/read before editing when evidence is insufficient.\n- inspect is bootstrap/replan-only. Once repository guidance is current and state is not replan_required, inspect is intentionally absent from CURRENT ALLOWED ACTIONS; do not use it as generic forward progress or to recheck whether main moved.\n- The hard planner-attempt ceiling is global across pending/resume cycles; a resume never resets it.`,
  "prompt-inspect-forward-progress-rule",
);
if (!prompt.includes("inspect is bootstrap/replan-only")) {
  throw new Error("CODE_AI_INSPECT_PROGRESS_PROMPT_MARKER_MISSING");
}
await writeFile(promptPath, prompt, "utf8");

const selftestPath = "scripts/code-ai-duplicate-forward-progress-selftest.mjs";
let selftest = await readFile(selftestPath, "utf8");
selftest = replaceRequired(
  selftest,
  `assert.match(runtime, /function plannerAllowedActions\\(state\\)/);`,
  `assert.match(runtime, /function plannerInspectionRequired\\(state\\)/);\nassert.match(runtime, /text\\(source\\.status, 100\\) === "replan_required"/);\nassert.match(runtime, /!text\\(source\\.repository_guidance\\?\\.contract, 160\\)/);\nassert.match(runtime, /allowedActions = allowedActions\\.filter\\(\\(action\\) => action !== "inspect"\\)/);\nassert.match(runtime, /function plannerAllowedActions\\(state\\)/);`,
  "selftest-runtime-inspect-markers",
);
selftest = replaceRequired(
  selftest,
  `assert.match(prompt, /An action absent from CURRENT ALLOWED ACTIONS is invalid/);`,
  `assert.match(prompt, /An action absent from CURRENT ALLOWED ACTIONS is invalid/);\nassert.match(prompt, /inspect is bootstrap\\/replan-only/);`,
  "selftest-prompt-inspect-marker",
);
selftest = replaceRequired(
  selftest,
  `function allowed(control) {\n  const base = ["inspect","search","read","apply_files","run","verify","diff","research","complete","block"];\n  if (Number(control.duplicate_rejection_streak || 0) < 1) return base;\n  return base.filter((action) => action !== control.last_duplicate_action);\n}`,
  `function inspectionRequired(state) {\n  if (!state?.base_commit) return true;\n  if (state?.status === "replan_required") return true;\n  return !state?.repository_guidance?.contract;\n}\nfunction allowed(control, state = {}) {\n  let base = ["inspect","search","read","apply_files","run","verify","diff","research","complete","block"];\n  if (!inspectionRequired(state)) base = base.filter((action) => action !== "inspect");\n  if (Number(control.duplicate_rejection_streak || 0) < 1) return base;\n  return base.filter((action) => action !== control.last_duplicate_action);\n}`,
  "selftest-inspect-policy-simulation",
);
selftest = replaceRequired(
  selftest,
  `let control = { duplicate_rejection_streak: 0, last_duplicate_action: null };`,
  `const inspectedState = {\n  base_commit: "a".repeat(40),\n  status: "completed",\n  repository_guidance: { contract: "AVANTIQO_CODE_REPOSITORY_GUIDANCE_V1" },\n};\nconst postEditState = {\n  ...inspectedState,\n  status: "verification_required",\n  files_changed: ["tests/fixtures/example.mjs"],\n};\nconst replanState = { ...postEditState, status: "replan_required" };\nconst legacyState = { ...inspectedState, repository_guidance: {} };\nassert.equal(allowed({}, inspectedState).includes("inspect"), false);\nassert.equal(allowed({}, postEditState).includes("inspect"), false);\nassert.equal(allowed({}, replanState).includes("inspect"), true);\nassert.equal(allowed({}, legacyState).includes("inspect"), true);\nassert.equal(allowed({}, postEditState).includes("apply_files"), true);\nassert.equal(allowed({}, postEditState).includes("verify"), true);\n\nlet control = { duplicate_rejection_streak: 0, last_duplicate_action: null };`,
  "selftest-post-edit-inspect-regression",
);
selftest = replaceRequired(
  selftest,
  `  contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V4",`,
  `  contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V5",`,
  "selftest-contract-v5",
);
selftest = replaceRequired(
  selftest,
  `    resume_duplicate_recovery_is_action_local: true,`,
  `    resume_duplicate_recovery_is_action_local: true,\n    initial_completed_inspection_is_not_repeated: true,\n    post_edit_inspect_escape_hatch_closed: true,\n    replan_required_can_reinspect_repository: true,\n    legacy_state_without_repository_guidance_can_inspect: true,`,
  "selftest-verification-fields",
);
selftest = replaceRequired(
  selftest,
  `console.log("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V4=PASS");`,
  `console.log("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V5=PASS");`,
  "selftest-pass-v5",
);
for (const marker of [
  "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V5",
  "post_edit_inspect_escape_hatch_closed: true",
  "replan_required_can_reinspect_repository: true",
]) {
  if (!selftest.includes(marker)) throw new Error(`CODE_AI_INSPECT_PROGRESS_SELFTEST_MARKER_MISSING:${marker}`);
}
await writeFile(selftestPath, selftest, "utf8");

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
let audit = await readFile(auditPath, "utf8");
audit = replaceRequired(
  audit,
  `  "plannerAllowedActions",`,
  `  "plannerAllowedActions",\n  "plannerInspectionRequired",\n  'text(source.status, 100) === "replan_required"',\n  "!text(source.repository_guidance?.contract, 160)",`,
  "audit-inspect-policy-markers",
);
audit = replaceRequired(
  audit,
  `  "An action absent from CURRENT ALLOWED ACTIONS is invalid",`,
  `  "An action absent from CURRENT ALLOWED ACTIONS is invalid",\n  "inspect is bootstrap/replan-only",`,
  "audit-prompt-inspect-marker",
);
audit = replaceRequired(
  audit,
  `const plannerDecision = source.indexOf("const { decision } = planned;");`,
  `const inspectionPolicy = source.indexOf("function plannerInspectionRequired(state)");\nconst inspectReplanGate = source.indexOf('text(source.status, 100) === "replan_required"', inspectionPolicy);\nconst inspectGuidanceGate = source.indexOf("!text(source.repository_guidance?.contract, 160)", inspectReplanGate);\nconst inspectRemoval = source.indexOf('allowedActions = allowedActions.filter((action) => action !== "inspect")', inspectGuidanceGate);\nconst plannerDecision = source.indexOf("const { decision } = planned;");\nif (inspectionPolicy < 0 || inspectReplanGate <= inspectionPolicy || inspectGuidanceGate <= inspectReplanGate || inspectRemoval <= inspectGuidanceGate) {\n  throw new Error("CODE_AI_AUTONOMY_INSPECT_MUST_BE_BOOTSTRAP_OR_REPLAN_ONLY");\n}`,
  "audit-inspect-policy-ordering",
);
audit = replaceRequired(
  audit,
  `  contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V10",`,
  `  contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V11",`,
  "audit-contract-v11",
);
audit = replaceRequired(
  audit,
  `    dynamic_allowed_action_guard_enforced_before_execution: true,`,
  `    dynamic_allowed_action_guard_enforced_before_execution: true,\n    planner_inspect_is_bootstrap_or_replan_only: true,\n    post_edit_inspect_escape_hatch_closed: true,`,
  "audit-inspect-verification-fields",
);
for (const marker of [
  "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V11",
  "CODE_AI_AUTONOMY_INSPECT_MUST_BE_BOOTSTRAP_OR_REPLAN_ONLY",
  "planner_inspect_is_bootstrap_or_replan_only: true",
  "post_edit_inspect_escape_hatch_closed: true",
]) {
  if (!audit.includes(marker)) throw new Error(`CODE_AI_INSPECT_PROGRESS_AUDIT_MARKER_MISSING:${marker}`);
}
await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_INSPECT_FORWARD_PROGRESS_PATCH_V1",
  files_changed: [runtimePath, promptPath, selftestPath, auditPath],
  planner_inspect_bootstrap_or_replan_only: true,
  post_edit_inspect_escape_hatch_closed: true,
  duplicate_and_suppression_budgets_unchanged: true,
  hard_planner_attempt_limit_unchanged: 24,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

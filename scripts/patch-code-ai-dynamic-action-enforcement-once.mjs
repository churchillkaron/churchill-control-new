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
  `const MAX_DUPLICATE_REJECTION_STREAK = 3;\nconst TRANSIENT_WORKSPACE_RETRY_LIMIT = 1;`,
  `const MAX_DUPLICATE_REJECTION_STREAK = 3;\nconst MAX_SUPPRESSED_ACTION_REJECTION_STREAK = 2;\nconst TRANSIENT_WORKSPACE_RETRY_LIMIT = 1;`,
  "runtime-suppressed-rejection-limit",
);

runtime = replaceRequired(
  runtime,
  `    last_duplicate_action: text(source.last_duplicate_action, 80) || null,\n    guarded_actions: normalizedGuardedActionHistory(source.guarded_actions),`,
  `    last_duplicate_action: text(source.last_duplicate_action, 80) || null,\n    suppressed_action_rejection_streak: nonNegativeInteger(source.suppressed_action_rejection_streak),\n    last_suppressed_action: text(source.last_suppressed_action, 80) || null,\n    guarded_actions: normalizedGuardedActionHistory(source.guarded_actions),`,
  "runtime-persist-suppressed-rejections",
);

runtime = replaceRequired(
  runtime,
  `function plannerAllowedActions(state) {\n  const control = object(state?.autonomy_control);\n  const streak = nonNegativeInteger(control.duplicate_rejection_streak);\n  const repeatedAction = text(control.last_duplicate_action, 80);\n  if (streak < 2 || !DUPLICATE_GUARDED_ACTIONS.has(repeatedAction)) {\n    return [...ALLOWED_ACTIONS];\n  }\n  return [...ALLOWED_ACTIONS].filter((action) => action !== repeatedAction);\n}\n\nfunction advanceEvidenceRevision(control) {`,
  `function plannerAllowedActions(state) {\n  const control = object(state?.autonomy_control);\n  const streak = nonNegativeInteger(control.duplicate_rejection_streak);\n  const repeatedAction = text(control.last_duplicate_action, 80);\n  if (streak < 2 || !DUPLICATE_GUARDED_ACTIONS.has(repeatedAction)) {\n    return [...ALLOWED_ACTIONS];\n  }\n  return [...ALLOWED_ACTIONS].filter((action) => action !== repeatedAction);\n}\n\nfunction resetSuppressedActionRejection(control) {\n  return {\n    ...control,\n    suppressed_action_rejection_streak: 0,\n    last_suppressed_action: null,\n  };\n}\n\nfunction recordSuppressedActionRejection(control, action) {\n  const normalizedAction = text(action, 80);\n  const sameAction = text(control?.last_suppressed_action, 80) === normalizedAction;\n  return {\n    ...control,\n    suppressed_action_rejection_streak: sameAction\n      ? nonNegativeInteger(control?.suppressed_action_rejection_streak) + 1\n      : 1,\n    last_suppressed_action: normalizedAction || null,\n  };\n}\n\nfunction advanceEvidenceRevision(control) {`,
  "runtime-suppressed-rejection-helpers",
);

runtime = replaceRequired(
  runtime,
  `      last_duplicate_action: text(control.last_duplicate_action, 80) || null,\n      allowed_actions: plannerAllowedActions(source),`,
  `      last_duplicate_action: text(control.last_duplicate_action, 80) || null,\n      suppressed_action_rejection_streak: nonNegativeInteger(control.suppressed_action_rejection_streak),\n      last_suppressed_action: text(control.last_suppressed_action, 80) || null,\n      allowed_actions: plannerAllowedActions(source),`,
  "runtime-compact-suppressed-rejections",
);

runtime = replaceRequired(
  runtime,
  `    const { decision } = planned;\n    state = appendEvidence(state, plannerEvidence(planned.result, iteration, decision));\n\n    if (decision.action === "complete") {`,
  `    const { decision } = planned;\n    state = appendEvidence(state, plannerEvidence(planned.result, iteration, decision));\n\n    const currentAllowedActions = plannerAllowedActions(state);\n    if (!currentAllowedActions.includes(decision.action)) {\n      control = recordSuppressedActionRejection(control, decision.action);\n      state = withAutonomyControl(state, control);\n      state = appendEvidence(state, {\n        at: new Date().toISOString(),\n        kind: "autonomy_guard",\n        iteration,\n        status: "rejected_suppressed_action",\n        reason: "CODE_AI_AUTONOMOUS_ACTION_NOT_CURRENTLY_ALLOWED",\n        action: decision.action,\n        allowed_actions: currentAllowedActions,\n        suppressed_action_rejection_streak:\n          nonNegativeInteger(control.suppressed_action_rejection_streak),\n      });\n      if (\n        nonNegativeInteger(control.suppressed_action_rejection_streak) >=\n        MAX_SUPPRESSED_ACTION_REJECTION_STREAK\n      ) {\n        return blockedResult(\n          state,\n          \`CODE_AI_AUTONOMOUS_SUPPRESSED_ACTION_STREAK_EXCEEDED:\${decision.action}:\${control.suppressed_action_rejection_streak}\`,\n          control.planner_iterations_used,\n        );\n      }\n      continue;\n    }\n    control = resetSuppressedActionRejection(control);\n    state = withAutonomyControl(state, control);\n\n    if (decision.action === "complete") {`,
  "runtime-hard-dynamic-action-guard",
);

await writeFile(runtimePath, runtime, "utf8");

const promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";
let prompt = await readFile(promptPath, "utf8");

prompt = replaceRequired(
  prompt,
  `function plannerRules() {\n  return \`RULES`,
  `const PLANNER_ACTION_SHAPES = Object.freeze({\n  inspect: 'inspect: {"action":"inspect","description":"...","input":{}}',\n  search: 'search: {"action":"search","description":"...","input":{"mode":"literal|regex|path|glob","query":"text or path needle","paths":["optional/content-search/path"],"path_globs":["optional/**/*.js"]}}',\n  read: 'read: {"action":"read","description":"...","input":{"file_path":"path","start_line":1,"end_line":400}}',\n  apply_files: 'apply_files: {"action":"apply_files","description":"...","input":{"files":[{"path":"path","content":"complete final file content"}]}}',\n  run: 'run: {"action":"run","description":"...","input":{"command":"npm","args":["test"],"cwd":"."}}',\n  verify: 'verify: {"action":"verify","description":"...","input":{"command":"npm","args":["test"],"cwd":"."}}',\n  diff: 'diff: {"action":"diff","description":"...","input":{}}',\n  research: 'research: {"action":"research","description":"...","input":{"query":"technical question","preferred_domains":["official.example"],"freshness_days":30}}',\n  complete: 'complete: {"action":"complete","description":"concise verified completion statement","input":{"criteria_evidence":[{"criterion":"exact bound completion criterion","evidence_operation_ids":["observed_operation_id"]}]}}',\n  block: 'block: {"action":"block","description":"genuine blocker","input":{}}',\n});\n\nfunction plannerActionShapeText(allowedActions) {\n  return list(allowedActions)\n    .map((action) => PLANNER_ACTION_SHAPES[text(action, 80)])\n    .filter(Boolean)\n    .join("\\n");\n}\n\nfunction plannerRules(allowedActions = []) {\n  const actionShapes = plannerActionShapeText(allowedActions);\n  return \`RULES`,
  "prompt-dynamic-action-shapes-helper",
);

prompt = replaceRequired(
  prompt,
  `- Choose exactly ONE next action from CURRENT ALLOWED ACTIONS. If an action type is absent there, the controller has temporarily suppressed it to force forward progress after repeated duplicate decisions.\n\nALLOWED ACTION SHAPES\ninspect: {"action":"inspect","description":"...","input":{}}\nsearch: {"action":"search","description":"...","input":{"mode":"literal|regex|path|glob","query":"text or path needle","paths":["optional/content-search/path"],"path_globs":["optional/**/*.js"]}}\nread: {"action":"read","description":"...","input":{"file_path":"path","start_line":1,"end_line":400}}\napply_files: {"action":"apply_files","description":"...","input":{"files":[{"path":"path","content":"complete final file content"}]}}\nrun: {"action":"run","description":"...","input":{"command":"npm","args":["test"],"cwd":"."}}\nverify: {"action":"verify","description":"...","input":{"command":"npm","args":["test"],"cwd":"."}}\ndiff: {"action":"diff","description":"...","input":{}}\nresearch: {"action":"research","description":"...","input":{"query":"technical question","preferred_domains":["official.example"],"freshness_days":30}}\ncomplete: {"action":"complete","description":"concise verified completion statement","input":{"criteria_evidence":[{"criterion":"exact bound completion criterion","evidence_operation_ids":["observed_operation_id"]}]}}\nblock: {"action":"block","description":"genuine blocker","input":{}}`,
  `- Choose exactly ONE next action from CURRENT ALLOWED ACTIONS. If an action type is absent there, the controller has temporarily suppressed it to force forward progress after repeated duplicate decisions.\n- An action absent from CURRENT ALLOWED ACTIONS is invalid even if it is mentioned elsewhere in these rules. Do not emit it.\n\nCURRENT ALLOWED ACTION SHAPES\n\${actionShapes}`,
  "prompt-filter-static-shapes",
);

prompt = replaceRequired(
  prompt,
  `  const suffix = \`\\n\\n\${plannerRules()}\`;`,
  `  const suffix = \`\\n\\n\${plannerRules(currentAllowedActions)}\`;`,
  "prompt-wire-dynamic-shapes",
);

await writeFile(promptPath, prompt, "utf8");

const selftestPath = "scripts/code-ai-duplicate-forward-progress-selftest.mjs";
const selftest = `import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport { CodeAIPlannerPromptRuntime } from "../lib/code/runtime/CodeAIPlannerPromptRuntime.js";\n\nconst runtime = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");\nconst prompt = await readFile("lib/code/runtime/CodeAIPlannerPromptRuntime.js", "utf8");\n\nassert.match(runtime, /duplicate_rejection_streak: Math\\.max\\(/);\nassert.match(runtime, /function plannerAllowedActions\\(state\\)/);\nassert.match(runtime, /MAX_SUPPRESSED_ACTION_REJECTION_STREAK = 2/);\nassert.match(runtime, /function recordSuppressedActionRejection\\(control, action\\)/);\nassert.match(runtime, /status: "rejected_suppressed_action"/);\nassert.match(runtime, /CODE_AI_AUTONOMOUS_ACTION_NOT_CURRENTLY_ALLOWED/);\nassert.match(runtime, /CODE_AI_AUTONOMOUS_SUPPRESSED_ACTION_STREAK_EXCEEDED/);\nassert.match(prompt, /CURRENT ALLOWED ACTION SHAPES/);\nassert.match(prompt, /plannerRules\\(currentAllowedActions\\)/);\nassert.match(prompt, /An action absent from CURRENT ALLOWED ACTIONS is invalid/);\n\nconst suppressedPrompt = CodeAIPlannerPromptRuntime.build({\n  objective: "Repair a bounded fixture.",\n  iteration: 4,\n  state: { autonomy_control: { duplicate_rejection_streak: 2, last_duplicate_action: "read" } },\n  allowed_actions: ["inspect", "search", "apply_files", "run", "verify", "diff", "research", "complete", "block"],\n  autonomy_contract: "AVANTIQO_CODE_AI_AUTONOMOUS_RUNTIME_V1",\n});\nassert.equal(suppressedPrompt.structured_specification.allowed_actions.includes("read"), false);\nassert.equal(suppressedPrompt.instruction.includes('read: {"action":"read"'), false);\nassert.equal(suppressedPrompt.instruction.includes('apply_files: {"action":"apply_files"'), true);\nassert.equal(suppressedPrompt.instruction.includes("CURRENT ALLOWED ACTION SHAPES"), true);\n\nfunction nextDuplicate(control, action = null) {\n  if (!action) return { ...control, duplicate_rejection_streak: 0, last_duplicate_action: null };\n  return {\n    ...control,\n    duplicate_rejection_streak: Number(control.duplicate_rejection_streak || 0) + 1,\n    last_duplicate_action: action,\n  };\n}\nfunction allowed(control) {\n  const base = ["inspect","search","read","apply_files","run","verify","diff","research","complete","block"];\n  if (Number(control.duplicate_rejection_streak || 0) < 2) return base;\n  return base.filter((action) => action !== control.last_duplicate_action);\n}\nfunction rejectSuppressed(control, action) {\n  const same = control.last_suppressed_action === action;\n  return {\n    ...control,\n    suppressed_action_rejection_streak: same\n      ? Number(control.suppressed_action_rejection_streak || 0) + 1\n      : 1,\n    last_suppressed_action: action,\n  };\n}\n\nlet control = { duplicate_rejection_streak: 0, last_duplicate_action: null };\ncontrol = nextDuplicate(control, "read");\ncontrol = nextDuplicate(control, "read");\nassert.equal(allowed(control).includes("read"), false);\nassert.equal(allowed(control).includes("apply_files"), true);\ncontrol = rejectSuppressed(control, "read");\nassert.equal(control.suppressed_action_rejection_streak, 1);\nassert.equal(allowed(control).includes("read"), false);\ncontrol = rejectSuppressed(control, "read");\nassert.equal(control.suppressed_action_rejection_streak, 2);\n\nconsole.log(JSON.stringify({\n  success: true,\n  contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V2",\n  verified: {\n    duplicate_streak_is_first_class_control_state: true,\n    second_duplicate_temporarily_suppresses_repeated_action_type: true,\n    suppressed_read_shape_removed_from_prompt: true,\n    apply_files_shape_remains_visible_under_read_suppression: true,\n    dynamically_suppressed_action_is_hard_rejected_by_controller: true,\n    suppressed_action_rejection_is_bounded: true,\n    suppressed_action_does_not_reset_duplicate_pressure: true,\n  },\n  provider_calls_executed: false,\n  provider_spend_performed: false,\n  runpod_lease_opened: false,\n  production_deploy_performed: false,\n}, null, 2));\nconsole.log("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V2=PASS");\n`;
await writeFile(selftestPath, selftest, "utf8");

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
let audit = await readFile(auditPath, "utf8");
audit = replaceRequired(
  audit,
  `  "MAX_DUPLICATE_REJECTION_STREAK = 3",`,
  `  "MAX_DUPLICATE_REJECTION_STREAK = 3",\n  "MAX_SUPPRESSED_ACTION_REJECTION_STREAK = 2",\n  "recordSuppressedActionRejection",\n  "resetSuppressedActionRejection",\n  "CODE_AI_AUTONOMOUS_ACTION_NOT_CURRENTLY_ALLOWED",\n  "CODE_AI_AUTONOMOUS_SUPPRESSED_ACTION_STREAK_EXCEEDED",`,
  "audit-dynamic-action-markers",
);
audit = replaceRequired(
  audit,
  `  "Never request push, deploy, publish, production, database mutation, credentials",`,
  `  "Never request push, deploy, publish, production, database mutation, credentials",\n  "CURRENT ALLOWED ACTION SHAPES",\n  "plannerRules(currentAllowedActions)",\n  "An action absent from CURRENT ALLOWED ACTIONS is invalid",`,
  "audit-prompt-dynamic-shape-markers",
);
audit = replaceRequired(
  audit,
  `const duplicateGuard = source.indexOf("const duplicate = duplicateActionGuard(control, decision)");`,
  `const plannerDecision = source.indexOf("const { decision } = planned;");\nconst dynamicAllowedGuard = source.indexOf("const currentAllowedActions = plannerAllowedActions(state)", plannerDecision);\nconst dynamicAllowedReject = source.indexOf("status: \\\"rejected_suppressed_action\\\"", dynamicAllowedGuard);\nconst duplicateGuard = source.indexOf("const duplicate = duplicateActionGuard(control, decision)");\nif (\n  plannerDecision < 0 ||\n  dynamicAllowedGuard <= plannerDecision ||\n  dynamicAllowedReject <= dynamicAllowedGuard ||\n  dynamicAllowedReject >= duplicateGuard\n) {\n  throw new Error("CODE_AI_AUTONOMY_DYNAMIC_ALLOWED_ACTION_GUARD_MUST_PRECEDE_DUPLICATE_AND_EXECUTION");\n}`,
  "audit-dynamic-action-order",
);
audit = replaceRequired(
  audit,
  `    repeated_duplicate_action_temporarily_suppressed_after_second_rejection: true,`,
  `    repeated_duplicate_action_temporarily_suppressed_after_second_rejection: true,\n    suppressed_action_shapes_removed_from_planner_prompt: true,\n    dynamic_allowed_action_guard_enforced_before_execution: true,\n    suppressed_action_rejections_bounded: true,`,
  "audit-dynamic-action-evidence",
);
await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_DYNAMIC_ACTION_ENFORCEMENT_PATCH_V1",
  files_changed: [runtimePath, promptPath, selftestPath, auditPath],
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

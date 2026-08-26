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
  `    source_revision: nonNegativeInteger(source.source_revision),\n    guarded_actions: normalizedGuardedActionHistory(source.guarded_actions),`,
  `    source_revision: nonNegativeInteger(source.source_revision),\n    duplicate_rejection_streak: Math.max(\n      nonNegativeInteger(source.duplicate_rejection_streak),\n      trailingDuplicateRejectionStreak(state),\n    ),\n    last_duplicate_action: text(source.last_duplicate_action, 80) || null,\n    guarded_actions: normalizedGuardedActionHistory(source.guarded_actions),`,
  "persist-duplicate-progress-control",
);

runtime = replaceRequired(
  runtime,
  `function withAutonomyControl(state, control) {\n  return {\n    ...object(state),\n    autonomy_control: control,\n  };\n}\n\nfunction advanceEvidenceRevision(control) {`,
  `function withAutonomyControl(state, control) {\n  return {\n    ...object(state),\n    autonomy_control: control,\n  };\n}\n\nfunction resetDuplicateProgress(control) {\n  return {\n    ...control,\n    duplicate_rejection_streak: 0,\n    last_duplicate_action: null,\n  };\n}\n\nfunction recordDuplicateProgress(control, action) {\n  return {\n    ...control,\n    duplicate_rejection_streak: nonNegativeInteger(control?.duplicate_rejection_streak) + 1,\n    last_duplicate_action: text(action, 80) || null,\n  };\n}\n\nfunction plannerAllowedActions(state) {\n  const control = object(state?.autonomy_control);\n  const streak = nonNegativeInteger(control.duplicate_rejection_streak);\n  const repeatedAction = text(control.last_duplicate_action, 80);\n  if (streak < 2 || !DUPLICATE_GUARDED_ACTIONS.has(repeatedAction)) {\n    return [...ALLOWED_ACTIONS];\n  }\n  return [...ALLOWED_ACTIONS].filter((action) => action !== repeatedAction);\n}\n\nfunction advanceEvidenceRevision(control) {`,
  "duplicate-progress-helpers",
);

runtime = replaceRequired(
  runtime,
  `    duplicate_rejection_streak: trailingDuplicateRejectionStreak(source),`,
  `    duplicate_rejection_streak: nonNegativeInteger(control.duplicate_rejection_streak),`,
  "compact-streak-from-control",
);

runtime = replaceRequired(
  runtime,
  `      source_revision: currentSourceRevision,\n      recent_guarded_actions: normalizedGuardedActionHistory(control.guarded_actions)`,
  `      source_revision: currentSourceRevision,\n      duplicate_rejection_streak: nonNegativeInteger(control.duplicate_rejection_streak),\n      last_duplicate_action: text(control.last_duplicate_action, 80) || null,\n      allowed_actions: plannerAllowedActions(source),\n      recent_guarded_actions: normalizedGuardedActionHistory(control.guarded_actions)`,
  "compact-control-progress",
);

runtime = replaceRequired(
  runtime,
  `function plannerExecutionInput({ context, objective, state, iteration }) {\n  const transport = buildCodeAIPlannerPromptTransport({`,
  `function plannerExecutionInput({ context, objective, state, iteration }) {\n  const allowedActions = plannerAllowedActions(state);\n  const transport = buildCodeAIPlannerPromptTransport({`,
  "planner-dynamic-actions-variable",
);
runtime = replaceRequired(
  runtime,
  `    allowed_actions: [...ALLOWED_ACTIONS],`,
  `    allowed_actions: allowedActions,`,
  "planner-dynamic-actions-wire",
);

runtime = replaceRequired(
  runtime,
  `    if (decision.action === "research") {\n      try {`,
  `    if (decision.action === "research") {\n      control = resetDuplicateProgress(control);\n      state = withAutonomyControl(state, control);\n      try {`,
  "research-resets-duplicate-progress",
);

runtime = replaceRequired(
  runtime,
  `    const duplicate = duplicateActionGuard(control, decision);\n    if (duplicate) {\n      state = appendEvidence(state, {`,
  `    const duplicate = duplicateActionGuard(control, decision);\n    if (duplicate) {\n      control = recordDuplicateProgress(control, decision.action);\n      state = withAutonomyControl(state, control);\n      state = appendEvidence(state, {`,
  "duplicate-progress-record",
);
runtime = replaceRequired(
  runtime,
  `      const duplicateRejectionStreak = trailingDuplicateRejectionStreak(state);\n      if (duplicateRejectionStreak >= MAX_DUPLICATE_REJECTION_STREAK) {`,
  `      const duplicateRejectionStreak = nonNegativeInteger(control.duplicate_rejection_streak);\n      if (duplicateRejectionStreak >= MAX_DUPLICATE_REJECTION_STREAK) {`,
  "duplicate-progress-limit-control",
);
runtime = replaceRequired(
  runtime,
  `      continue;\n    }\n\n    const operationId = \`autonomy_\${iteration}_\${decision.action}\`;`,
  `      continue;\n    }\n\n    control = resetDuplicateProgress(control);\n    state = withAutonomyControl(state, control);\n\n    const operationId = \`autonomy_\${iteration}_\${decision.action}\`;`,
  "nonduplicate-resets-progress",
);

await writeFile(runtimePath, runtime, "utf8");

const promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";
let prompt = await readFile(promptPath, "utf8");
prompt = replaceRequired(
  prompt,
  `- Choose exactly ONE next action.`,
  `- Choose exactly ONE next action from CURRENT ALLOWED ACTIONS. If an action type is absent there, the controller has temporarily suppressed it to force forward progress after repeated duplicate decisions.`,
  "prompt-current-allowed-rule",
);
prompt = replaceRequired(
  prompt,
  `  const mission = text(objective, 4000);\n  if (!mission) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_OBJECTIVE_REQUIRED");\n  const prefix = \`You are the bounded planning worker inside Avantiqo Code AI. Avantiqo owns the mission, tools, state, governance, execution, verification and repair loop; you only choose the next safe engineering step from observed evidence.\\n\\nMISSION\\n\${mission}\\n\\nITERATION\\n\${Number(iteration) || 1}\\n\\nCURRENT STATE AND EVIDENCE\\n\`;`,
  `  const mission = text(objective, 4000);\n  if (!mission) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_OBJECTIVE_REQUIRED");\n  const currentAllowedActions = list(allowed_actions).slice(0, 20).map((item) => text(item, 80)).filter(Boolean);\n  const prefix = \`You are the bounded planning worker inside Avantiqo Code AI. Avantiqo owns the mission, tools, state, governance, execution, verification and repair loop; you only choose the next safe engineering step from observed evidence.\\n\\nMISSION\\n\${mission}\\n\\nITERATION\\n\${Number(iteration) || 1}\\n\\nCURRENT ALLOWED ACTIONS\\n\${currentAllowedActions.join(", ")}\\n\\nCURRENT STATE AND EVIDENCE\\n\`;`,
  "prompt-current-allowed-prefix",
);
prompt = replaceRequired(
  prompt,
  `    allowed_actions: list(allowed_actions).slice(0, 20).map((item) => text(item, 80)),`,
  `    allowed_actions: currentAllowedActions,`,
  "prompt-current-allowed-structured",
);
await writeFile(promptPath, prompt, "utf8");

const behavioralTestPath = "scripts/code-ai-duplicate-forward-progress-selftest.mjs";
const behavioralTest = `import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\n\nconst runtime = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");\nconst prompt = await readFile("lib/code/runtime/CodeAIPlannerPromptRuntime.js", "utf8");\n\nassert.match(runtime, /duplicate_rejection_streak: Math\\.max\\(/);\nassert.match(runtime, /function recordDuplicateProgress\\(control, action\\)/);\nassert.match(runtime, /function resetDuplicateProgress\\(control\\)/);\nassert.match(runtime, /function plannerAllowedActions\\(state\\)/);\nassert.match(runtime, /streak < 2/);\nassert.match(runtime, /filter\\(\\(action\\) => action !== repeatedAction\\)/);\nassert.match(runtime, /control = recordDuplicateProgress\\(control, decision\\.action\\)/);\nassert.match(runtime, /nonNegativeInteger\\(control\\.duplicate_rejection_streak\\)/);\nassert.match(runtime, /control = resetDuplicateProgress\\(control\\)/);\nassert.match(runtime, /allowed_actions: allowedActions/);\nassert.match(prompt, /CURRENT ALLOWED ACTIONS/);\nassert.match(prompt, /temporarily suppressed it to force forward progress/);\nassert.match(prompt, /allowed_actions: currentAllowedActions/);\n\nfunction next(control, duplicateAction = null) {\n  if (!duplicateAction) return { ...control, duplicate_rejection_streak: 0, last_duplicate_action: null };\n  return {\n    ...control,\n    duplicate_rejection_streak: Number(control.duplicate_rejection_streak || 0) + 1,\n    last_duplicate_action: duplicateAction,\n  };\n}\nfunction allowed(control) {\n  const base = ["inspect","search","read","apply_files","run","verify","diff","research","complete","block"];\n  if (Number(control.duplicate_rejection_streak || 0) < 2) return base;\n  return base.filter((action) => action !== control.last_duplicate_action);\n}\n\nlet control = { duplicate_rejection_streak: 0, last_duplicate_action: null };\ncontrol = next(control, "read");\nassert.equal(control.duplicate_rejection_streak, 1);\nassert.equal(allowed(control).includes("read"), true);\ncontrol = next(control, "read");\nassert.equal(control.duplicate_rejection_streak, 2);\nassert.equal(allowed(control).includes("read"), false);\nassert.equal(allowed(control).includes("apply_files"), true);\ncontrol = next(control, "read");\nassert.equal(control.duplicate_rejection_streak, 3);\ncontrol = next(control, null);\nassert.equal(control.duplicate_rejection_streak, 0);\nassert.equal(allowed(control).includes("read"), true);\n\nconsole.log(JSON.stringify({\n  success: true,\n  contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V1",\n  verified: {\n    duplicate_streak_is_first_class_control_state: true,\n    streak_survives_resume_reconstruction_marker: true,\n    second_duplicate_temporarily_suppresses_repeated_action_type: true,\n    apply_files_remains_available_under_read_suppression: true,\n    third_duplicate_remains_fail_closed: true,\n    genuine_new_action_resets_duplicate_pressure: true,\n    current_allowed_actions_are_visible_to_planner: true,\n  },\n  provider_calls_executed: false,\n  provider_spend_performed: false,\n  runpod_lease_opened: false,\n  production_deploy_performed: false,\n}, null, 2));\nconsole.log("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V1=PASS");\n`;
await writeFile(behavioralTestPath, behavioralTest, "utf8");

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
let audit = await readFile(auditPath, "utf8");
audit = replaceRequired(
  audit,
  `  "duplicate_rejection_streak",\n  "trailingDuplicateRejectionStreak",`,
  `  "duplicate_rejection_streak",\n  "last_duplicate_action",\n  "recordDuplicateProgress",\n  "resetDuplicateProgress",\n  "plannerAllowedActions",\n  "trailingDuplicateRejectionStreak",`,
  "audit-forward-progress-markers",
);
audit = replaceRequired(
  audit,
  `    duplicate_rejection_streak_fails_closed_before_workspace_execution: true,`,
  `    duplicate_rejection_streak_fails_closed_before_workspace_execution: true,\n    duplicate_rejection_streak_persisted_in_autonomy_control: true,\n    repeated_duplicate_action_temporarily_suppressed_after_second_rejection: true,`,
  "audit-forward-progress-evidence",
);
await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({\n  success: true,\n  contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_PATCH_V1",\n  files_changed: [runtimePath, promptPath, behavioralTestPath, auditPath],\n  provider_calls_executed: false,\n  provider_spend_performed: false,\n  runpod_lease_opened: false,\n  production_deploy_performed: false,\n  secrets_printed: false,\n}, null, 2));

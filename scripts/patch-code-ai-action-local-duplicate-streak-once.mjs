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
  `function recordDuplicateProgress(control, action) {\n  return {\n    ...control,\n    duplicate_rejection_streak: nonNegativeInteger(control?.duplicate_rejection_streak) + 1,\n    last_duplicate_action: text(action, 80) || null,\n  };\n}`,
  `function recordDuplicateProgress(control, action) {\n  const normalizedAction = text(action, 80);\n  const sameAction = text(control?.last_duplicate_action, 80) === normalizedAction;\n  return {\n    ...control,\n    duplicate_rejection_streak: sameAction\n      ? nonNegativeInteger(control?.duplicate_rejection_streak) + 1\n      : 1,\n    last_duplicate_action: normalizedAction || null,\n  };\n}`,
  "runtime-action-local-record-duplicate-progress",
);

runtime = replaceRequired(
  runtime,
  `function trailingDuplicateRejectionStreak(state) {\n  let streak = 0;\n  for (const entry of [...list(state?.evidence)].reverse()) {\n    const kind = text(entry?.kind, 120);\n    const status = text(entry?.status, 120);\n    if (kind === \"autonomy_guard\" && status === \"rejected_duplicate_action\") {\n      streak += 1;\n      continue;\n    }\n    if (kind === \"autonomous_planner\" || kind === \"autonomous_planner_pending\") {\n      continue;\n    }\n    if (streak > 0) break;\n  }\n  return streak;\n}`,
  `function trailingDuplicateRejectionProgress(state) {\n  let streak = 0;\n  let action = null;\n  for (const entry of [...list(state?.evidence)].reverse()) {\n    const kind = text(entry?.kind, 120);\n    const status = text(entry?.status, 120);\n    if (kind === \"autonomy_guard\" && status === \"rejected_duplicate_action\") {\n      const entryAction = text(entry?.action, 80);\n      if (!DUPLICATE_GUARDED_ACTIONS.has(entryAction)) break;\n      if (!action) {\n        action = entryAction;\n        streak = 1;\n        continue;\n      }\n      if (entryAction === action) {\n        streak += 1;\n        continue;\n      }\n      break;\n    }\n    if (kind === \"autonomous_planner\" || kind === \"autonomous_planner_pending\") {\n      continue;\n    }\n    if (streak > 0) break;\n  }\n  return { streak, action };\n}`,
  "runtime-action-local-trailing-duplicate-recovery",
);

runtime = replaceRequired(
  runtime,
  `  if (pendingPlannerIteration > plannerIterationsUsed) {\n    plannerIterationsUsed = pendingPlannerIteration;\n  }\n  return {`,
  `  if (pendingPlannerIteration > plannerIterationsUsed) {\n    plannerIterationsUsed = pendingPlannerIteration;\n  }\n  const recoveredDuplicateProgress = trailingDuplicateRejectionProgress(state);\n  const sourceDuplicateStreak = nonNegativeInteger(source.duplicate_rejection_streak);\n  const sourceDuplicateAction = text(source.last_duplicate_action, 80) || null;\n  const recoveredDuplicateAvailable =\n    recoveredDuplicateProgress.streak > 0 &&\n    DUPLICATE_GUARDED_ACTIONS.has(recoveredDuplicateProgress.action);\n  return {`,
  "runtime-recovered-duplicate-progress-context",
);

runtime = replaceRequired(
  runtime,
  `    duplicate_rejection_streak: Math.max(\n      nonNegativeInteger(source.duplicate_rejection_streak),\n      trailingDuplicateRejectionStreak(state),\n    ),\n    last_duplicate_action: text(source.last_duplicate_action, 80) || null,`,
  `    duplicate_rejection_streak: recoveredDuplicateAvailable\n      ? recoveredDuplicateProgress.streak\n      : sourceDuplicateStreak,\n    last_duplicate_action: recoveredDuplicateAvailable\n      ? recoveredDuplicateProgress.action\n      : sourceDuplicateAction,`,
  "runtime-action-local-duplicate-recovery-use",
);

await writeFile(runtimePath, runtime, "utf8");

const selftestPath = "scripts/code-ai-duplicate-forward-progress-selftest.mjs";
let selftest = await readFile(selftestPath, "utf8");

selftest = replaceRequired(
  selftest,
  `function nextDuplicate(control, action = null) {\n  if (!action) return { ...control, duplicate_rejection_streak: 0, last_duplicate_action: null };\n  return {\n    ...control,\n    duplicate_rejection_streak: Number(control.duplicate_rejection_streak || 0) + 1,\n    last_duplicate_action: action,\n  };\n}`,
  `function nextDuplicate(control, action = null) {\n  if (!action) return { ...control, duplicate_rejection_streak: 0, last_duplicate_action: null };\n  const sameAction = control.last_duplicate_action === action;\n  return {\n    ...control,\n    duplicate_rejection_streak: sameAction\n      ? Number(control.duplicate_rejection_streak || 0) + 1\n      : 1,\n    last_duplicate_action: action,\n  };\n}\nfunction trailingDuplicateProgress(evidence) {\n  let streak = 0;\n  let action = null;\n  for (const entry of [...evidence].reverse()) {\n    if (entry.kind === \"autonomy_guard\" && entry.status === \"rejected_duplicate_action\") {\n      if (!action) { action = entry.action; streak = 1; continue; }\n      if (entry.action === action) { streak += 1; continue; }\n      break;\n    }\n    if (entry.kind === \"autonomous_planner\" || entry.kind === \"autonomous_planner_pending\") continue;\n    if (streak > 0) break;\n  }\n  return { streak, action };\n}`,
  "selftest-action-local-next-duplicate",
);

selftest = replaceRequired(
  selftest,
  `control = rejectSuppressed(control, \"read\");\nassert.equal(control.suppressed_action_rejection_streak, 2);`,
  `control = rejectSuppressed(control, \"read\");\nassert.equal(control.suppressed_action_rejection_streak, 2);\n\nlet mixed = { duplicate_rejection_streak: 0, last_duplicate_action: null };\nmixed = nextDuplicate(mixed, \"run\");\nassert.equal(mixed.duplicate_rejection_streak, 1);\nmixed = nextDuplicate(mixed, \"read\");\nassert.equal(mixed.duplicate_rejection_streak, 1);\nassert.equal(mixed.last_duplicate_action, \"read\");\nmixed = nextDuplicate(mixed, \"run\");\nassert.equal(mixed.duplicate_rejection_streak, 1);\nassert.equal(mixed.last_duplicate_action, \"run\");\nmixed = nextDuplicate(mixed, \"run\");\nassert.equal(mixed.duplicate_rejection_streak, 2);\n\nconst recoveredMixed = trailingDuplicateProgress([\n  { kind: \"autonomy_guard\", status: \"rejected_duplicate_action\", action: \"run\" },\n  { kind: \"autonomous_planner\" },\n  { kind: \"autonomy_guard\", status: \"rejected_duplicate_action\", action: \"read\" },\n  { kind: \"autonomous_planner\" },\n  { kind: \"autonomy_guard\", status: \"rejected_duplicate_action\", action: \"run\" },\n]);\nassert.deepEqual(recoveredMixed, { streak: 1, action: \"run\" });\n\nassert.match(runtime, /const sameAction = text\\(control\\?\\.last_duplicate_action, 80\\) === normalizedAction/);\nassert.match(runtime, /function trailingDuplicateRejectionProgress\\(state\\)/);\nassert.match(runtime, /entryAction === action/);`,
  "selftest-live-mixed-duplicate-pattern",
);

selftest = replaceRequired(
  selftest,
  `  contract: \"AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V3\",`,
  `  contract: \"AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V4\",`,
  "selftest-contract-v4",
);
selftest = replaceRequired(
  selftest,
  `    suppressed_action_does_not_reset_duplicate_pressure: true,`,
  `    suppressed_action_does_not_reset_duplicate_pressure: true,\n    duplicate_streak_is_action_local: true,\n    mixed_duplicate_action_types_do_not_accumulate_one_streak: true,\n    resume_duplicate_recovery_is_action_local: true,`,
  "selftest-action-local-verification-fields",
);
selftest = replaceRequired(
  selftest,
  `console.log(\"AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V3=PASS\");`,
  `console.log(\"AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V4=PASS\");`,
  "selftest-pass-v4",
);

await writeFile(selftestPath, selftest, "utf8");

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
let audit = await readFile(auditPath, "utf8");
audit = replaceRequired(
  audit,
  `  \"trailingDuplicateRejectionStreak\",`,
  `  \"trailingDuplicateRejectionProgress\",\n  \"const sameAction = text(control?.last_duplicate_action, 80) === normalizedAction\",\n  \"recoveredDuplicateProgress.streak\",`,
  "audit-action-local-markers",
);
audit = replaceRequired(
  audit,
  `  contract: \"AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V8\",`,
  `  contract: \"AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V9\",`,
  "audit-contract-v9",
);
audit = replaceRequired(
  audit,
  `    duplicate_rejection_streak_persisted_in_autonomy_control: true,`,
  `    duplicate_rejection_streak_persisted_in_autonomy_control: true,\n    duplicate_rejection_streak_is_action_local: true,\n    resume_duplicate_recovery_is_action_local: true,`,
  "audit-action-local-verification-fields",
);
await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_ACTION_LOCAL_DUPLICATE_STREAK_PATCH_V1",
  files_changed: [runtimePath, selftestPath, auditPath],
  live_failure_pattern: "run_duplicate -> read_duplicate -> run_duplicate",
  mixed_action_duplicates_accumulate_same_streak: false,
  same_action_duplicate_fail_close_limit: 3,
  resume_recovery_action_local: true,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

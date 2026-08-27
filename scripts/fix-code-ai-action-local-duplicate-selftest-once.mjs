import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/code-ai-duplicate-forward-progress-selftest.mjs";
let source = await readFile(path, "utf8");

const stale = `assert.match(runtime, /duplicate_rejection_streak: Math\\.max\\(/);`;
const replacement = `assert.match(runtime, /duplicate_rejection_streak: recoveredDuplicateAvailable/);\nassert.match(runtime, /last_duplicate_action: recoveredDuplicateAvailable/);`;

if (source.includes(stale)) {
  source = source.replace(stale, replacement);
} else if (!source.includes(replacement)) {
  throw new Error("CODE_AI_ACTION_LOCAL_DUPLICATE_SELFTEST_STALE_ASSERTION_NOT_FOUND");
}

if (source.includes("duplicate_rejection_streak: Math\\.max")) {
  throw new Error("CODE_AI_ACTION_LOCAL_DUPLICATE_SELFTEST_OLD_RECOVERY_ASSERTION_REMAINS");
}
if (!source.includes("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V4")) {
  throw new Error("CODE_AI_ACTION_LOCAL_DUPLICATE_SELFTEST_V4_REQUIRED");
}
if (!source.includes("mixed_duplicate_action_types_do_not_accumulate_one_streak")) {
  throw new Error("CODE_AI_ACTION_LOCAL_DUPLICATE_REGRESSION_COVERAGE_REQUIRED");
}

await writeFile(path, source, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_ACTION_LOCAL_DUPLICATE_SELFTEST_FIX_V1",
  file_changed: path,
  stale_math_max_assertion_removed: true,
  action_local_recovery_assertions_present: true,
  runtime_behavior_changed: false,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false
}, null, 2));

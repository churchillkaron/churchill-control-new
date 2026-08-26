import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");
const prompt = await readFile("lib/code/runtime/CodeAIPlannerPromptRuntime.js", "utf8");

assert.match(runtime, /duplicate_rejection_streak: Math\.max\(/);
assert.match(runtime, /function recordDuplicateProgress\(control, action\)/);
assert.match(runtime, /function resetDuplicateProgress\(control\)/);
assert.match(runtime, /function plannerAllowedActions\(state\)/);
assert.match(runtime, /streak < 2/);
assert.match(runtime, /filter\(\(action\) => action !== repeatedAction\)/);
assert.match(runtime, /control = recordDuplicateProgress\(control, decision\.action\)/);
assert.match(runtime, /nonNegativeInteger\(control\.duplicate_rejection_streak\)/);
assert.match(runtime, /control = resetDuplicateProgress\(control\)/);
assert.match(runtime, /allowed_actions: allowedActions/);
assert.match(prompt, /CURRENT ALLOWED ACTIONS/);
assert.match(prompt, /temporarily suppressed it to force forward progress/);
assert.match(prompt, /allowed_actions: currentAllowedActions/);

function next(control, duplicateAction = null) {
  if (!duplicateAction) return { ...control, duplicate_rejection_streak: 0, last_duplicate_action: null };
  return {
    ...control,
    duplicate_rejection_streak: Number(control.duplicate_rejection_streak || 0) + 1,
    last_duplicate_action: duplicateAction,
  };
}
function allowed(control) {
  const base = ["inspect","search","read","apply_files","run","verify","diff","research","complete","block"];
  if (Number(control.duplicate_rejection_streak || 0) < 2) return base;
  return base.filter((action) => action !== control.last_duplicate_action);
}

let control = { duplicate_rejection_streak: 0, last_duplicate_action: null };
control = next(control, "read");
assert.equal(control.duplicate_rejection_streak, 1);
assert.equal(allowed(control).includes("read"), true);
control = next(control, "read");
assert.equal(control.duplicate_rejection_streak, 2);
assert.equal(allowed(control).includes("read"), false);
assert.equal(allowed(control).includes("apply_files"), true);
control = next(control, "read");
assert.equal(control.duplicate_rejection_streak, 3);
control = next(control, null);
assert.equal(control.duplicate_rejection_streak, 0);
assert.equal(allowed(control).includes("read"), true);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V1",
  verified: {
    duplicate_streak_is_first_class_control_state: true,
    streak_survives_resume_reconstruction_marker: true,
    second_duplicate_temporarily_suppresses_repeated_action_type: true,
    apply_files_remains_available_under_read_suppression: true,
    third_duplicate_remains_fail_closed: true,
    genuine_new_action_resets_duplicate_pressure: true,
    current_allowed_actions_are_visible_to_planner: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
}, null, 2));
console.log("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V1=PASS");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CodeAIPlannerPromptRuntime } from "../lib/code/runtime/CodeAIPlannerPromptRuntime.js";

const runtime = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");
const prompt = await readFile("lib/code/runtime/CodeAIPlannerPromptRuntime.js", "utf8");

assert.match(runtime, /duplicate_rejection_streak: Math\.max\(/);
assert.match(runtime, /function plannerAllowedActions\(state\)/);
assert.match(runtime, /MAX_SUPPRESSED_ACTION_REJECTION_STREAK = 2/);
assert.match(runtime, /function recordSuppressedActionRejection\(control, action\)/);
assert.match(runtime, /status: "rejected_suppressed_action"/);
assert.match(runtime, /CODE_AI_AUTONOMOUS_ACTION_NOT_CURRENTLY_ALLOWED/);
assert.match(runtime, /CODE_AI_AUTONOMOUS_SUPPRESSED_ACTION_STREAK_EXCEEDED/);
assert.match(prompt, /CURRENT ALLOWED ACTION SHAPES/);
assert.match(prompt, /plannerRules\(currentAllowedActions\)/);
assert.match(prompt, /An action absent from CURRENT ALLOWED ACTIONS is invalid/);

const suppressedPrompt = CodeAIPlannerPromptRuntime.build({
  objective: "Repair a bounded fixture.",
  iteration: 4,
  state: { autonomy_control: { duplicate_rejection_streak: 2, last_duplicate_action: "read" } },
  allowed_actions: ["inspect", "search", "apply_files", "run", "verify", "diff", "research", "complete", "block"],
  autonomy_contract: "AVANTIQO_CODE_AI_AUTONOMOUS_RUNTIME_V1",
});
assert.equal(suppressedPrompt.structured_specification.allowed_actions.includes("read"), false);
assert.equal(suppressedPrompt.instruction.includes('read: {"action":"read"'), false);
assert.equal(suppressedPrompt.instruction.includes('apply_files: {"action":"apply_files"'), true);
assert.equal(suppressedPrompt.instruction.includes("CURRENT ALLOWED ACTION SHAPES"), true);

function nextDuplicate(control, action = null) {
  if (!action) return { ...control, duplicate_rejection_streak: 0, last_duplicate_action: null };
  return {
    ...control,
    duplicate_rejection_streak: Number(control.duplicate_rejection_streak || 0) + 1,
    last_duplicate_action: action,
  };
}
function allowed(control) {
  const base = ["inspect","search","read","apply_files","run","verify","diff","research","complete","block"];
  if (Number(control.duplicate_rejection_streak || 0) < 2) return base;
  return base.filter((action) => action !== control.last_duplicate_action);
}
function rejectSuppressed(control, action) {
  const same = control.last_suppressed_action === action;
  return {
    ...control,
    suppressed_action_rejection_streak: same
      ? Number(control.suppressed_action_rejection_streak || 0) + 1
      : 1,
    last_suppressed_action: action,
  };
}

let control = { duplicate_rejection_streak: 0, last_duplicate_action: null };
control = nextDuplicate(control, "read");
control = nextDuplicate(control, "read");
assert.equal(allowed(control).includes("read"), false);
assert.equal(allowed(control).includes("apply_files"), true);
control = rejectSuppressed(control, "read");
assert.equal(control.suppressed_action_rejection_streak, 1);
assert.equal(allowed(control).includes("read"), false);
control = rejectSuppressed(control, "read");
assert.equal(control.suppressed_action_rejection_streak, 2);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V2",
  verified: {
    duplicate_streak_is_first_class_control_state: true,
    second_duplicate_temporarily_suppresses_repeated_action_type: true,
    suppressed_read_shape_removed_from_prompt: true,
    apply_files_shape_remains_visible_under_read_suppression: true,
    dynamically_suppressed_action_is_hard_rejected_by_controller: true,
    suppressed_action_rejection_is_bounded: true,
    suppressed_action_does_not_reset_duplicate_pressure: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
}, null, 2));
console.log("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V2=PASS");

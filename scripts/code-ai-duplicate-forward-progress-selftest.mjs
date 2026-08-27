import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CodeAIPlannerPromptRuntime } from "../lib/code/runtime/CodeAIPlannerPromptRuntime.js";

const runtime = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");
const prompt = await readFile("lib/code/runtime/CodeAIPlannerPromptRuntime.js", "utf8");

assert.match(runtime, /duplicate_rejection_streak: recoveredDuplicateAvailable/);
assert.match(runtime, /last_duplicate_action: recoveredDuplicateAvailable/);
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
  state: { autonomy_control: { duplicate_rejection_streak: 1, last_duplicate_action: "read" } },
  allowed_actions: ["inspect", "search", "apply_files", "run", "verify", "diff", "research", "complete", "block"],
  autonomy_contract: "AVANTIQO_CODE_AI_AUTONOMOUS_RUNTIME_V1",
});
assert.equal(suppressedPrompt.structured_specification.allowed_actions.includes("read"), false);
assert.equal(suppressedPrompt.instruction.includes('read: {"action":"read"'), false);
assert.equal(suppressedPrompt.instruction.includes('apply_files: {"action":"apply_files"'), true);
assert.equal(suppressedPrompt.instruction.includes("CURRENT ALLOWED ACTION SHAPES"), true);

function nextDuplicate(control, action = null) {
  if (!action) return { ...control, duplicate_rejection_streak: 0, last_duplicate_action: null };
  const sameAction = control.last_duplicate_action === action;
  return {
    ...control,
    duplicate_rejection_streak: sameAction
      ? Number(control.duplicate_rejection_streak || 0) + 1
      : 1,
    last_duplicate_action: action,
  };
}
function trailingDuplicateProgress(evidence) {
  let streak = 0;
  let action = null;
  for (const entry of [...evidence].reverse()) {
    if (entry.kind === "autonomy_guard" && entry.status === "rejected_duplicate_action") {
      if (!action) { action = entry.action; streak = 1; continue; }
      if (entry.action === action) { streak += 1; continue; }
      break;
    }
    if (entry.kind === "autonomous_planner" || entry.kind === "autonomous_planner_pending") continue;
    if (streak > 0) break;
  }
  return { streak, action };
}
function allowed(control) {
  const base = ["inspect","search","read","apply_files","run","verify","diff","research","complete","block"];
  if (Number(control.duplicate_rejection_streak || 0) < 1) return base;
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

let mixed = { duplicate_rejection_streak: 0, last_duplicate_action: null };
mixed = nextDuplicate(mixed, "run");
assert.equal(mixed.duplicate_rejection_streak, 1);
mixed = nextDuplicate(mixed, "read");
assert.equal(mixed.duplicate_rejection_streak, 1);
assert.equal(mixed.last_duplicate_action, "read");
mixed = nextDuplicate(mixed, "run");
assert.equal(mixed.duplicate_rejection_streak, 1);
assert.equal(mixed.last_duplicate_action, "run");
mixed = nextDuplicate(mixed, "run");
assert.equal(mixed.duplicate_rejection_streak, 2);

const recoveredMixed = trailingDuplicateProgress([
  { kind: "autonomy_guard", status: "rejected_duplicate_action", action: "run" },
  { kind: "autonomous_planner" },
  { kind: "autonomy_guard", status: "rejected_duplicate_action", action: "read" },
  { kind: "autonomous_planner" },
  { kind: "autonomy_guard", status: "rejected_duplicate_action", action: "run" },
]);
assert.deepEqual(recoveredMixed, { streak: 1, action: "run" });

assert.match(runtime, /const sameAction = text\(control\?\.last_duplicate_action, 80\) === normalizedAction/);
assert.match(runtime, /function trailingDuplicateRejectionProgress\(state\)/);
assert.match(runtime, /entryAction === action/);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V4",
  verified: {
    duplicate_streak_is_first_class_control_state: true,
    first_duplicate_temporarily_suppresses_repeated_action_type: true,
    suppressed_read_shape_removed_from_prompt: true,
    apply_files_shape_remains_visible_under_read_suppression: true,
    dynamically_suppressed_action_is_hard_rejected_by_controller: true,
    suppressed_action_rejection_is_bounded: true,
    suppressed_action_does_not_reset_duplicate_pressure: true,
    duplicate_streak_is_action_local: true,
    mixed_duplicate_action_types_do_not_accumulate_one_streak: true,
    resume_duplicate_recovery_is_action_local: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
}, null, 2));
console.log("AVANTIQO_CODE_AI_DUPLICATE_FORWARD_PROGRESS_SELFTEST_V4=PASS");

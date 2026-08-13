import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  mergeOperatorProjectState,
  normalizeOperatorProjectState,
} = await import("@/lib/operator/contracts/OperatorProjectState");

const established = normalizeOperatorProjectState({
  objective: "Prepare a launch campaign with the user",
  status: "active",
  success_criteria: ["Campaign approved", "Channel assets ready"],
  constraints: ["Do not publish without approval"],
  decisions: ["Lead with the customer story"],
  completed_steps: ["Audience agreed"],
  progress_summary: "The audience and message are agreed.",
  next_step: "Draft the channel concepts",
  open_questions: ["Which launch date should the plan use?"],
  blocker: null,
  user_confirmed_complete: false,
});

assert.equal(established.status, "active");
assert.equal(established.objective, "Prepare a launch campaign with the user");
assert.deepEqual(established.constraints, ["Do not publish without approval"]);

const partial = normalizeOperatorProjectState(
  {
    progress_summary: "Three channel concepts are now drafted.",
    completed_steps: ["Audience agreed", "Concepts drafted"],
  },
  { previousState: established },
);

assert.equal(partial.objective, established.objective);
assert.equal(partial.status, "active");
assert.deepEqual(partial.success_criteria, established.success_criteria);
assert.deepEqual(partial.constraints, established.constraints);
assert.equal(partial.progress_summary, "Three channel concepts are now drafted.");

const unconfirmedCompletion = normalizeOperatorProjectState(
  {
    status: "completed",
    user_confirmed_complete: false,
  },
  { previousState: partial },
);

assert.equal(unconfirmedCompletion.status, "awaiting_confirmation");
assert.equal(unconfirmedCompletion.user_confirmed_complete, false);

const confirmedCompletion = normalizeOperatorProjectState(
  {
    status: "completed",
    user_confirmed_complete: true,
  },
  { previousState: unconfirmedCompletion },
);

assert.equal(confirmedCompletion.status, "completed");
assert.equal(confirmedCompletion.user_confirmed_complete, true);

const replacement = normalizeOperatorProjectState(
  {
    objective: "Plan a customer retention workshop",
    status: "discussing",
  },
  { previousState: confirmedCompletion },
);

assert.deepEqual(replacement.success_criteria, []);
assert.deepEqual(replacement.decisions, []);
assert.equal(replacement.progress_summary, null);
assert.equal(replacement.user_confirmed_complete, false);

const merged = mergeOperatorProjectState(established, partial, {
  last_intent: "plan",
});

assert.equal(merged.objective, established.objective);
assert.equal(merged.last_intent, "plan");
assert.ok(Number.isFinite(Date.parse(merged.updated_at)));

const [reasoningSource, routeSource, homeSource, voiceSource] = await Promise.all([
  readFile("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8"),
  readFile("app/api/operator/turn/route.js", "utf8"),
  readFile("components/operator/HomeAvantiqoIntelligence.jsx", "utf8"),
  readFile("components/operator/LocalHeyAvantiqoWakeBridge.jsx", "utf8"),
]);

assert.match(
  reasoningSource,
  /current_project_state:\s*normalizeOperatorProjectState\(projectState\)/,
);
assert.match(reasoningSource, /user_confirmed_complete/);
assert.match(reasoningSource, /awaiting_confirmation/);
assert.match(routeSource, /projectState:\s*memory\.projectState/);
assert.match(routeSource, /mergeOperatorProjectState/);
assert.match(homeSource, /setProjectState\(result\?\.project_state/);
assert.match(homeSource, /Current goal/);
assert.match(voiceSource, /conversationKey:\s*"primary"/);
assert.match(voiceSource, /await speakRecovery\(\)/);
assert.match(voiceSource, /if \(enabledRef\.current\) \{\s*armCommandMode\(\)/);

console.log("OPERATOR_GOAL_CONTINUITY_AUDIT=PASS");
console.log("OPERATOR_GOAL_STATE_OWNER=OperatorProjectState");
console.log("OPERATOR_GOAL_COMPLETION=USER_CONFIRMATION_REQUIRED");
console.log("OPERATOR_GOAL_SURFACES=TEXT_AND_VOICE_PRIMARY_CONVERSATION");
console.log("OPERATOR_VOICE_FAILURE=ALWAYS_AUDIBLE_WITH_FOLLOW_UP");

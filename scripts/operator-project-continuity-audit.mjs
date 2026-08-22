import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  isFastConversationTurn,
  projectContinuityReply,
} = await import("@/lib/operator/runtime/OperatorFastConversationRuntime");

function voice(message) {
  return isFastConversationTurn({
    message,
    source: "voice",
    locale: "en-US",
    timezone: "Asia/Bangkok",
  });
}

const projectState = {
  objective: "Launch the new operating model",
  status: "active",
  decisions: ["Use the registered runtime", "Keep the rollout reversible"],
  completed_steps: ["Audited current state", "Defined the rollout"],
  progress_summary: "The architecture is agreed and implementation is underway",
  next_step: "Finish verification",
  open_questions: ["Which rollout window should we use"],
  blocker: "Waiting for final verification",
};

for (const message of [
  "where are we?",
  "where are we now?",
  "where did we stop?",
  "remind me where we are",
  "remind me where we stopped",
  "what did we decide?",
  "what have we decided?",
  "what was the decision?",
  "what did I decide?",
  "what did we agree?",
  "remind me what we decided",
  "what are we working on?",
  "what's the plan?",
  "remind me of the plan",
  "what have we done?",
  "what did we finish?",
  "what was the last step?",
  "what remains?",
  "what's left?",
  "what still needs to be done?",
  "what's still missing?",
  "what are the open questions?",
  "what are we waiting for?",
  "what's blocking us?",
]) {
  assert.equal(
    voice(message),
    true,
    `Read-only project status should use the local continuity lane: ${message}`,
  );
  assert.ok(
    projectContinuityReply({ message, projectState }),
    `Project continuity reply should resolve from durable state: ${message}`,
  );
}

for (const message of [
  "next",
  "continue",
  "resume",
  "what's next?",
  "what's the next step?",
  "what should happen next?",
  "what do we need to do next?",
]) {
  assert.equal(
    voice(message),
    false,
    `Project execution controls must stay on the full Operator path: ${message}`,
  );
}

for (const message of [
  "what do you think?",
  "what would you do?",
  "which option is best?",
  "what's the best move?",
  "what are the tradeoffs?",
  "is this a good idea?",
  "why?",
  "tell me more",
]) {
  assert.equal(
    voice(message),
    true,
    `Short strategic follow-up should use compact project context: ${message}`,
  );
}

for (const message of [
  "what should I do about inventory?",
  "what do you think about finance?",
  "should we publish the campaign?",
  "what should I do with payroll?",
]) {
  assert.equal(
    voice(message),
    false,
    `Business-data or action-bearing strategy must stay governed: ${message}`,
  );
}

for (const message of [
  "hello",
  "how are you?",
  "thanks",
  "what time is it?",
]) {
  assert.equal(
    voice(message),
    true,
    `Lightweight voice conversation should remain fast: ${message}`,
  );
}

assert.match(
  projectContinuityReply({ message: "what did we decide?", projectState }),
  /registered runtime/i,
);
assert.match(
  projectContinuityReply({ message: "where are we?", projectState }),
  /operating model/i,
);
assert.match(
  projectContinuityReply({ message: "what's left?", projectState }),
  /verification/i,
);
assert.match(
  projectContinuityReply({ message: "what's blocking us?", projectState }),
  /final verification/i,
);
assert.equal(
  projectContinuityReply({ message: "where are we?", projectState: {} }),
  "We do not have an active project goal recorded yet.",
);

console.log("OPERATOR_PROJECT_CONTINUITY_AUDIT=PASS");
console.log("OPERATOR_PROJECT_STATUS=LOCAL_DURABLE_STATE_NO_MODEL_CALL");
console.log("OPERATOR_PROJECT_CONTROLS=FULL_CONTEXT_FOR_EXECUTION_CONTINUE_NEXT");
console.log("OPERATOR_STRATEGIC_FOLLOW_UP=COMPACT_PROJECT_CONTEXT_NO_CAPABILITY_CATALOG");
console.log("OPERATOR_STRATEGIC_BUSINESS_DATA=FULL_GOVERNED_OPERATOR_PATH");
console.log("OPERATOR_PROJECT_FOLLOW_UP_SOURCE=DURABLE_PROJECT_STATE");
console.log("OPERATOR_CASUAL_VOICE_PATH=FAST_UNCHANGED");

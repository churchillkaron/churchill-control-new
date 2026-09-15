import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");

test("semantic outage never anchors a new message to the previous project objective", () => {
  assert.doesNotMatch(synthetic, /current work on \$\{activeObjective\}/);
  assert.match(synthetic, /semantic_understanding_unavailable: true/);
  assert.match(synthetic, /user_goal: text\(effectiveOptions\.message, 1400\)/);
  assert.match(synthetic, /clarification_required: false/);
});

test("semantic outage is read-only and routes to normal conversation", () => {
  const marker = synthetic.indexOf("semantic_understanding_unavailable: true");
  assert.ok(marker > 0);
  const window = synthetic.slice(Math.max(0, marker - 1200), marker + 500);
  assert.match(window, /route: "conversation"/);
  assert.match(window, /requires_mutation: false/);
  assert.match(window, /ambiguity_level: "none"/);
  assert.match(window, /continuity_required: false/);
});

test("fallback conversation treats current message as authoritative over old project context", () => {
  const fast = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");
  assert.match(fast, /Treat the CURRENT user message as authoritative/);
  assert.match(fast, /do not assume the user is continuing it/);
  assert.match(fast, /naturally allow topic changes, casual conversation, new questions, and new strategic goals/);
});

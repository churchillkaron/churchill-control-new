import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");

test("local conversation timeout never silently escalates to external paid reasoning", () => {
  assert.match(source, /owned local conversation lane timed out/);
  assert.match(source, /without starting external compute/);
  assert.match(source, /external_compute_started: false/);
  assert.match(source, /local_timeout: true/);
  assert.match(source, /zero_price_owned_cpu_lane: true/);
  assert.doesNotMatch(source, /FAST_CONVERSATION_ESCALATION/);
  assert.doesNotMatch(source, /FAST_PROJECT_CONVERSATION_ESCALATION/);
});

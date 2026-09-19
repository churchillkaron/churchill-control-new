import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fast = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");
const reasoning = fs.readFileSync("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8");

test("normal Business Partner conversation is proactively advisory when context warrants it", () => {
  assert.match(fast, /Act as a senior partner, not a passive command box/);
  assert.match(fast, /surface it proactively even if the user did not explicitly ask for a recommendation/);
  assert.match(fast, /A recommendation never authorizes execution/);
});

test("reasoning policy does not require an explicit recommendation request", () => {
  assert.match(reasoning, /Do not wait for the user to ask/);
  assert.match(reasoning, /recommendation separate from authorization or execution/);
});

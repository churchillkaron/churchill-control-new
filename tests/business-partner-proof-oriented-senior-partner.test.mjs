import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fast = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");
const reasoning = fs.readFileSync("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8");

test("Business Partner recommendations use proof-oriented self-challenge", () => {
  assert.match(fast, /distinguish what is verified, what is inferred, and what is only proposed/);
  assert.match(fast, /strongest plausible alternative/);
  assert.match(fast, /uncertainty that could change the recommendation/);
  assert.match(reasoning, /test the preferred option against the strongest credible alternative/);
});

test("recommendation quality never substitutes for durable completion proof or authority", () => {
  assert.match(fast, /Never call work finished, fixed, deployed, correct, or verified unless/);
  assert.match(reasoning, /Never claim a fix, deployment, business effect, or mission completion without the exact durable verification/);
  assert.match(reasoning, /Recommendation quality never increases execution authority/);
});

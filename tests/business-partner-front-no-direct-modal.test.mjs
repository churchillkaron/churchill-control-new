import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync("lib/operator/runtime/OperatorFrontCognitionRuntime.js", "utf8");

test("zero-price Business Partner front cognition never executes Modal directly", () => {
  assert.doesNotMatch(runtime, /AvantiqoIntelligenceModalDirectRuntime/);
  assert.doesNotMatch(runtime, /executeIntelligenceModalDirect/);
  assert.doesNotMatch(runtime, /resolveProviderCredential/);
  assert.match(runtime, /zero_price_owned_cpu_lane: true/);
  assert.match(runtime, /wallet_reservation_required: false/);
});

test("front escalation is opt-in and routes through governed fast reasoning", () => {
  assert.match(runtime, /allow_fast_escalation = false/);
  assert.match(runtime, /if \(!allow_fast_escalation\) throw error/);
  assert.match(runtime, /AvantiqoIntelligenceReasoningRuntime\.run/);
  assert.match(runtime, /execution_lane: "fast"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveOperatorInstantGreeting } from "../lib/operator/runtime/OperatorInstantGreetingPolicy.js";

test("common text greetings resolve locally", () => {
  for (const message of ["hi", "Hi there", "hello there!", "hey", "good evening"]) {
    assert.equal(resolveOperatorInstantGreeting({ message, source: "text" }), "Hi. I'm here and ready.");
  }
});

test("voice and non-greeting business requests are not intercepted", () => {
  assert.equal(resolveOperatorInstantGreeting({ message: "hi there", source: "voice" }), null);
  assert.equal(resolveOperatorInstantGreeting({ message: "show me revenue", source: "text" }), null);
});

test("Operator front door checks greeting before cognitive routing", async () => {
  const source = await readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
  const greetingIndex = source.indexOf("resolveOperatorInstantGreeting({");
  const cognitiveIndex = source.indexOf("needsOwnedCognitiveBrief({");
  const governedIndex = source.indexOf("runGovernedOperatorTurn(effectiveOptions)");
  assert.ok(greetingIndex >= 0);
  assert.ok(cognitiveIndex > greetingIndex);
  assert.ok(governedIndex > cognitiveIndex);
  assert.match(source, /if \(instantGreeting\) return instantGreetingTurn/);
  assert.match(source, /intelligence_lease_required: false/);
  assert.match(source, /provider_request_performed: false/);
});

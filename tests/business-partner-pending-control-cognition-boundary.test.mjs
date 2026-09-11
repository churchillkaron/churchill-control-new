import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const synthetic = fs.readFileSync(new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url), "utf8");
const operator = fs.readFileSync(new URL("../lib/operator/runtime/OperatorTurnRuntime.js", import.meta.url), "utf8");

test("pending human control bypasses a new synthetic cognitive brief", () => {
  assert.match(synthetic, /pendingControlDecision/);
  assert.match(synthetic, /preparedAttachmentReflex \|\| pendingControlDecision[\s\S]*\? null[\s\S]*: await ownedCognitiveBrief/);
});

test("pending human control does not require a new Operator cognitive plan", () => {
  assert.match(operator, /pendingControlDecision/);
  assert.match(operator, /const required = pendingControlDecision[\s\S]*\? false[\s\S]*: needsOwnedCognitiveBrief/);
});

test("pending control still enters the existing governed Operator runtime", () => {
  assert.match(operator, /const result = await runGovernedOperatorTurn\(effectiveOptions\)/);
  assert.doesNotMatch(operator, /pendingControlDecision[\s\S]{0,500}executeCapability/);
});

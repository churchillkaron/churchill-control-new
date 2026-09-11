import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorRepairSupervisionRuntime.js", import.meta.url),
  "utf8",
);

test("deterministic non-applicable repair exits before tools or owned Intelligence", () => {
  const eligibility = source.indexOf("if (!eligibility.applicable)");
  const tools = source.indexOf("OperatorIntelligencePlanningToolRuntime.createTools");
  const intelligence = source.indexOf("AvantiqoStructuredIntelligenceSupervisorRuntime.run");
  assert.ok(eligibility >= 0);
  assert.ok(tools > eligibility);
  assert.ok(intelligence > tools);
});

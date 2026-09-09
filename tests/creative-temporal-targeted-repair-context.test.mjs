import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");

test("temporal repair batches failures instead of re-emitting the whole plan", () => {
  assert.match(source, /MAXIMUM_CONTRACT_REPAIR_FAILURES_PER_PASS = 12/);
  assert.match(source, /const roleFailures = allFailures\.filter/);
  assert.match(source, /const otherFailures = allFailures\.filter/);
  assert.match(source, /MAXIMUM_CONTRACT_REPAIR_FAILURES_PER_PASS - roleFailures\.length/);
  assert.match(source, /TARGETED CURRENT PLAN CONTEXT/);
  assert.doesNotMatch(source, /CURRENT PLAN\n\$\{JSON\.stringify\(plan/);
});

test("temporal repair sends only failed roles and failed shot slices", () => {
  assert.match(source, /failed_role_decisions/);
  assert.match(source, /shotTargets/);
  assert.match(source, /compactRepairAsset/);
});

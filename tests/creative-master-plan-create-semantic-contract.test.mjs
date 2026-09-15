import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeMasterPlanRuntime.js",
  "utf8",
);

test("fresh master-plan create always binds the semantic mission contract", () => {
  const start = source.indexOf("async create");
  const end = source.indexOf("async resumeFromResult", start);
  const block = source.slice(start, end);
  assert.match(block, /applySemanticMissionContract\(\s*policyBoundPlan/);
  assert.doesNotMatch(block, /defer_semantic_mission_contract/);
});

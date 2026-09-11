import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const council = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url),
  "utf8",
);
const master = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeMasterPlanRuntime.js", import.meta.url),
  "utf8",
);

test("Concept Council revalidates and repairs the selected revision before returning", () => {
  assert.match(council, /CreativeMasterPlanRuntime\.repairExistingPlan\(/);
  assert.match(council, /plan:\s*normalizedPlan/);
  assert.match(council, /const plan = repairedMaster\.plan/);
  assert.match(council, /post_revision_master_validation/);
});

test("existing master repair uses the canonical bounded validation and repair loop", () => {
  assert.match(master, /async repairExistingPlan\(/);
  assert.match(master, /validatePlan\(\{/);
  assert.match(master, /repairInvalidPlan\(\{/);
  assert.match(master, /MAXIMUM_CONTRACT_REPAIR_ATTEMPTS/);
  assert.match(master, /settled_result: settledRepairResults\[attempt\] \|\| null/);
});

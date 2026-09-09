import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const validator = fs.readFileSync("lib/creative/director/validation/CreativeMasterPlanValidator.js", "utf8");

test("temporal contract repair accumulates partial improvements instead of discarding them", () => {
  assert.match(temporal, /afterFailures < beforeFailures/);
  assert.match(temporal, /partial_repair_accepted: true/);
  assert.match(temporal, /plan = candidate/);
});

test("temporal repair normalizes numeric scene maps and scalar repair lists", () => {
  assert.match(temporal, /normalizeTemporalRepairPatch/);
  assert.match(temporal, /TEMPORAL_REPAIR_LIST_FIELDS/);
  assert.match(temporal, /numericKeys/);
});

test("applicable temporal agency roles cannot be waived as not required", () => {
  assert.match(validator, /AGENCY_ROLE_ACTIVE_REQUIRED/);
  assert.match(temporal, /registry applies_to contains ALL or TEMPORAL must be ACTIVE/);
});

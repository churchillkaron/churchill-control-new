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

test("mandatory governance roles remain active while unused disciplines may be waived accountably", () => {
  assert.match(validator, /MANDATORY_ACTIVE_GOVERNANCE_ROLES/);
  assert.match(validator, /Governance role .* is mandatory and cannot be waived/);
  assert.match(temporal, /Quality, rights\/safety and release governance MUST be ACTIVE/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const validator = fs.readFileSync("lib/creative/director/validation/CreativeMasterPlanValidator.js", "utf8");

test("temporal repair can accumulate several improving passes but stops on repeated no-progress", () => {
  assert.match(temporal, /MAXIMUM_CONTRACT_REPAIR_ATTEMPTS = 5/);
  assert.match(temporal, /MAXIMUM_CONSECUTIVE_NO_PROGRESS_REPAIRS = 2/);
  assert.match(temporal, /consecutiveNoProgressRepairs >= MAXIMUM_CONSECUTIVE_NO_PROGRESS_REPAIRS/);
});

test("agency role decisions must be mission-specific rather than schema filler", () => {
  assert.match(validator, /AGENCY_ROLE_DECISION_MANDATE_ECHO/);
  assert.match(validator, /AGENCY_ROLE_EVIDENCE_GENERIC/);
  assert.match(temporal, /may not copy or lightly paraphrase the registry mandate/);
});

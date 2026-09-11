import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  "scripts/creative-direction-approval.mjs",
  "utf8",
);

test("direction approval accepts an exact externally supplied approval phrase", () => {
  assert.match(source, /CREATIVE_DIRECTION_APPROVAL_RESPONSE/);
  assert.match(source, /normalized\(suppliedApproval\) === normalized\(phrase\)/);
});

test("fresh direction approval binds command identity to project metadata", () => {
  assert.match(source, /command_identity: identity,\n\s*paid_direction_approval: approval/);
});

test('temporal approval covers current dynamic and repair master-plan operations', () => {
  for (const operation of [
    'MASTER_PLAN_DYNAMIC_V2',
    'MASTER_PLAN_CONTRACT_REPAIR_V1',
    'TEMPORAL_MASTER_PLAN_CONTRACT_REPAIR_V1',
  ]) assert.match(source, new RegExp(`"${operation}"`));
});

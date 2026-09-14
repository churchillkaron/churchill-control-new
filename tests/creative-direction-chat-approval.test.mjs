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


test("non-temporal Image Studio approval budgets the full council and repair envelope", () => {
  assert.match(source, /const NON_TEMPORAL_OPERATIONS/);
  assert.match(source, /maximum_calls: 14/);
  assert.match(source, /UNIVERSAL_NON_TEMPORAL_COUNCIL_AND_REPAIR_MAXIMUM/);
  for (const operation of [
    "MASTER_PLAN_DYNAMIC_V2",
    "MASTER_PLAN_CONTRACT_REPAIR_V1",
    "CREATIVE_CONCEPT_DIRECTOR_*",
    "CREATIVE_CONCEPT_CRITIC_*",
    "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
    "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
  ]) assert.ok(source.includes(`"${operation}"`));
});

test("completed under-budget direction approval requires an explicit bounded supplement", () => {
  assert.match(source, /APPROVE DIRECTION SUPPLEMENT/);
  assert.match(source, /CREATIVE_DIRECTION_SUPPLEMENT_APPROVAL_RESPONSE/);
  assert.match(source, /CREATIVE_DIRECTION_BUDGET_SUPPLEMENT_V1/);
  assert.match(source, /additional_maximum_customer_price/);
  assert.match(source, /supplemental_authorizations/);
  assert.match(source, /media_generation_authorized: false/);
  assert.match(source, /publication_authorized: false/);
});

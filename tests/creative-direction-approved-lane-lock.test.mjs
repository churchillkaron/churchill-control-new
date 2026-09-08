import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", "utf8");
test("Studio direction locks every governed call to the approved capability and model", () => {
  assert.match(source, /service_id: approval\.capability/);
  assert.match(source, /preferred_models: \[approval\.model\]/);
  assert.match(source, /direction_approval_capability: approval\.capability/);
  assert.match(source, /direction_approval_model: approval\.model/);
});
test("Studio direction keeps provider and settlement lane fail-closed", () => {
  assert.match(source, /allowed_providers: \[approval\.provider\]/);
  assert.match(source, /preferred_providers: \[approval\.provider\]/);
  assert.match(source, /CREATIVE_DIRECTION_BUDGET_SETTLEMENT_MISMATCH/);
});

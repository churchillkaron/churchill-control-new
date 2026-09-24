import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", "utf8");

test("Studio direction locks every governed call to the approved capability and model", () => {
  assert.match(source, /service_id: approval\.capability/);
  assert.match(source, /provider_id: approval\.provider/);
  assert.match(source, /allowed_models: \[approval\.model\]/);
  assert.match(source, /preferred_models: \[approval\.model\]/);
  assert.match(source, /metadataPrefix.*approval_capability/);
  assert.match(source, /metadataPrefix.*approval_model/);
});

test("Studio direction keeps provider pricing and settlement lane fail-closed", () => {
  assert.match(source, /allowed_providers: \[approval\.provider\]/);
  assert.match(source, /preferred_providers: \[approval\.provider\]/);
  assert.match(source, /text\(pricing\.provider\) !== text\(approval\.provider\)/);
  assert.match(source, /text\(pricing\.model\) !== text\(approval\.model\)/);
  assert.match(source, /channel\.errorPrefix.*BUDGET_SETTLEMENT_MISMATCH/);
});

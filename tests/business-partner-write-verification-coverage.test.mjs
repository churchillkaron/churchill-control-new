import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const draft=fs.readFileSync("lib/commercial/communications/capabilities/draftMessage.js","utf8");
const recipe=fs.readFileSync("lib/inventory/production/RecipeOperatorCapability.js","utf8");
const costs=fs.readFileSync("lib/inventory/costing/VendorInvoiceCostProjectionCapability.js","utf8");
const verifiers=fs.readFileSync("lib/inventory/runtime/SupplyChainBusinessWriteVerificationCapabilities.js","utf8");
const domain=fs.readFileSync("lib/inventory/runtime/InventoryDomainRuntime.js","utf8");

test("commercial draft message has exact result-bound read verification",()=>{
  assert.match(draft,/commercial\.communication\.read/);
  assert.match(draft,/conversation_id/); assert.match(draft,/message_id/);
});
test("recipe upsert verifies the full governed recipe component value set",()=>{
  assert.match(recipe,/supply_chain\.recipes\.verify/);
  assert.match(recipe,/payload_from_input:\{dish_id:"dish_id",items:"items"\}/);
  assert.match(verifiers,/recipeFingerprint/); assert.match(verifiers,/authoritativeCollectionAssertion/);
});
test("vendor invoice cost projection verifies every affected inventory item",()=>{
  assert.match(costs,/supply_chain\.purchase_costs\.verify_vendor_invoice/);
  assert.match(verifiers,/vendor_invoice_lines/); assert.match(verifiers,/cost_source_id/);
  assert.match(verifiers,/cost_effective_at/); assert.match(verifiers,/vendor_invoice_costs:/);
});
test("new verification reads are registered in Supply Chain runtime",()=>{
  assert.match(domain,/verify_vendor_invoice/); assert.match(domain,/recipes:[\s\S]*verify:/);
});


test("restaurant session customer change has exact session read verification",()=>{
  const manifest=fs.readFileSync("lib/restaurant/session/ChangeCustomer/manifest.js","utf8");
  const runtime=fs.readFileSync("lib/restaurant/RestaurantRuntime.js","utf8");
  const read=fs.readFileSync("lib/restaurant/session/ReadSession/execute.js","utf8");
  assert.match(manifest,/restaurant\.session\.read/); assert.match(manifest,/sessionId/);
  assert.match(runtime,/ReadSession\/execute/); assert.match(read,/refreshSessionReadModel/);
});


test("dynamic Operations commands bind exact record verification",()=>{
  const command=fs.readFileSync("lib/operations/capabilities/createOperationsCommandCapability.js","utf8");
  const list=fs.readFileSync("lib/operations/capabilities/createOperationsListCapability.js","utf8");
  assert.match(command,/operatorVerification/); assert.match(command,/payload_keys: \["id"\]/);
  assert.match(command,/payload_from_result/); assert.match(list,/name: "id"/);
});

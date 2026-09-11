import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { attachActionIdentityEvidence, verifierPayloadFromActionIdentityEvidence } from "../lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs";

const customer=fs.readFileSync("lib/finance/accounts-receivable/documents/createCustomerInvoice.js","utf8");
const vendor=fs.readFileSync("lib/finance/accounts-payable/documents/createVendorInvoice.js","utf8");
const mission=fs.readFileSync("lib/platform/capabilities/createOperatorMissionCapability.js","utf8");
const core=fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js","utf8");

test("pre-generated finance ids survive write failure as non-authorizing evidence",()=>{
  const error=attachActionIdentityEvidence(new Error("network"),["id:abc","invoice_id:abc"]);
  assert.deepEqual(error.action_identity_evidence,["id:abc","invoice_id:abc"]);
  assert.equal(error.mutation_completion_proven,false);
});

test("verifier payload resolves only from exact declared identity key",()=>{
  assert.deepEqual(verifierPayloadFromActionIdentityEvidence({payload_from_result:{id:["invoice.id"]}},["id:abc"]),{id:"abc"});
  assert.equal(verifierPayloadFromActionIdentityEvidence({payload_from_result:{id:["invoice.id"]}},["invoice_number:INV-1"]),null);
});

test("customer and vendor invoice RPC failures attach exact generated ids",()=>{
  assert.match(customer,/attachActionIdentityEvidence/); assert.match(customer,/`id:\$\{prepared\.invoiceId\}`/);
  assert.match(vendor,/attachActionIdentityEvidence/); assert.match(vendor,/`id:\$\{invoiceId\}`/);
});

test("mission failure evidence carries exact verifier recovery without authority",()=>{
  assert.match(mission,/verification_recovery/); assert.match(mission,/authorization_effect: "NONE"/);
  assert.match(core,/Reinspect exact failed write identity/);
});
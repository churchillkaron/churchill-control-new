import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const vendorService = fs.readFileSync("lib/finance/payments/capabilities/processVendorPayment.js", "utf8");
const vendorCapability = fs.readFileSync("lib/finance/accounts-payable/capabilities/postVendorPayment.js", "utf8");
const moneyReads = fs.readFileSync("lib/finance/runtime/FinanceMoneyVerificationCapabilities.js", "utf8");
const financeRuntime = fs.readFileSync("lib/finance/FinanceRuntime.js", "utf8");
const identityRuntime = fs.readFileSync("lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs", "utf8");
const outcomeRuntime = fs.readFileSync("lib/operator/runtime/BusinessEffectOutcomeRuntime.mjs", "utf8");

test("vendor payment operator path prebinds exact payment identity", () => {
  assert.match(vendorCapability, /const paymentId = randomUUID\(\)/);
  assert.match(vendorCapability, /payment_id: paymentId/);
  assert.match(vendorCapability, /throw_on_error: true/);
  assert.match(vendorCapability, /operatorVerification:[\s\S]*finance\.vendor_payments\.read[\s\S]*payment_id/);
});

test("vendor payment service preserves identity only after mutation attempt", () => {
  assert.match(vendorService, /let mutationAttempted = false/);
  assert.match(vendorService, /mutationAttempted = true;[\s\S]*finance_post_vendor_payment_allocation_idempotent/);
  assert.match(vendorService, /if \(mutationAttempted\)[\s\S]*attachActionIdentityEvidence\(error, \[`payment_id:\$\{paymentId\}`\]\)/);
  assert.match(vendorService, /throw_on_error === true/);
});

test("vendor payment exact read verifier is registered", () => {
  assert.match(moneyReads, /createVendorPaymentReadCapability/);
  assert.match(moneyReads, /capability: "vendor_payments"[\s\S]*table: "vendor_payments"[\s\S]*idKey: "payment_id"/);
  assert.match(financeRuntime, /vendor_payments:[\s\S]*createVendorPaymentReadCapability[\s\S]*postVendorPayment/);
});

test("action identity evidence never proves mutation completion", () => {
  assert.match(identityRuntime, /mutation_completion_proven=false/);
  assert.match(outcomeRuntime, /action_identity_evidence/);
  assert.match(outcomeRuntime, /authoritative_server_evidence/);
  assert.match(outcomeRuntime, /exact_business_scope_matched/);
});

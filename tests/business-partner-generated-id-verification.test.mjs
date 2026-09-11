import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const catalog = fs.readFileSync("lib/operator/runtime/OperatorCapabilityCatalog.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const turn = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
const customer = fs.readFileSync("lib/finance/accounts-receivable/CreateCustomerInvoice/execute.js", "utf8");
const vendor = fs.readFileSync("lib/finance/accounts-payable/capabilities/createVendorBill.js", "utf8");
const customerRoute = fs.readFileSync("app/api/finance/customer-invoices/route.js", "utf8");
const vendorRoute = fs.readFileSync("app/api/finance/vendor-invoices/list/route.js", "utf8");

test("customer invoice create declares a result-bound verifier", () => {
  assert.match(customer, /finance\.customer_invoices\.read/);
  assert.match(customer, /payload_from_result/);
  assert.match(customer, /invoice\.id/);
});

test("vendor bill create declares a result-bound verifier", () => {
  assert.match(vendor, /finance\.vendor_bills\.read/);
  assert.match(vendor, /payload_from_result/);
  assert.match(vendor, /vendor_invoice\.id/);
});
test("catalog preserves explicit verifier declarations", () => {
  assert.match(catalog, /declared_operator_verification/);
  assert.match(catalog, /manifest\?\.operatorVerification/);
});

test("selected recommendation preflights declared verifier before mutation", () => {
  assert.match(turn, /actionCapability/);
  assert.match(turn, /operator_verification/);
  assert.match(turn, /POST_ACTION_VERIFICATION_NOT_REGISTERED/);
});

test("post-action verification binds verifier payload from action result", () => {
  assert.match(core, /function resultBoundVerification/);
  assert.match(core, /payload_from_result/);
  assert.match(core, /resolvedResultVerification/);
  assert.match(core, /pending: resolvedResultVerification/);
});

test("finance read endpoints enforce exact generated id when supplied", () => {
  assert.match(customerRoute, /searchParams\.get\("id"\)/);
  assert.match(customerRoute, /query = query\.eq\("id", invoiceId\)/);
  assert.match(vendorRoute, /searchParams\.get\("id"\)/);
  assert.match(vendorRoute, /invoiceQuery = invoiceQuery\.eq\("id", invoiceId\)/);
});

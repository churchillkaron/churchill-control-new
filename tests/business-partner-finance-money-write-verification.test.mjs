import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const runtime = read("lib/finance/FinanceRuntime.js");
const verifier = read("lib/finance/runtime/FinanceMoneyVerificationCapabilities.js");
const customer = read("lib/finance/accounts-receivable/capabilities/postCustomerReceipt.js");
const customerWriter = read("lib/finance/accounts-receivable/capabilities/postCustomerPayment.js");
const expense = read("lib/finance/expense-receipts/capabilities/postPaidExpenseReceipt.js");

test("Finance registers exact read verifiers for Operator money writes", () => {
  assert.match(runtime, /customer_receipt:[\s\S]*createCustomerReceiptReadCapability/);
  assert.match(runtime, /expense_receipts:[\s\S]*createExpenseReceiptReadCapability/);
  assert.match(verifier, /\.eq\("organization_id", context\.organizationId\)/);
  assert.match(verifier, /\.eq\("entity_id", context\.entityId\)/);
  assert.match(verifier, /\.eq\("id", id\)\.maybeSingle\(\)/);
});

test("customer receipt binds generated payment id and preserves it on RPC failure", () => {
  assert.match(customer, /finance\.customer_receipt\.read/);
  assert.match(customer, /payload_from_result: \{ payment_id: \["payment_id"\] \}/);
  assert.match(customerWriter, /payment_id:\$\{paymentId\}/);
  assert.match(customerWriter, /attachActionIdentityEvidence/);
});
test("paid expense receipt binds generated receipt id and preserves it on RPC failure", () => {
  assert.match(expense, /finance\.expense_receipts\.read/);
  assert.match(expense, /payload_from_result: \{ receipt_id: \["receipt_id", "id"\] \}/);
  assert.match(expense, /receipt_id:\$\{receiptId\}/);
  assert.match(expense, /attachActionIdentityEvidence/);
  assert.match(expense, /receipt_id: result\.data\?\.receipt_id \|\| result\.data\?\.id \|\| receiptId/);
});

test("money read verifier is read-only and permission scoped", () => {
  assert.match(verifier, /operatorMode: "read"/);
  assert.match(verifier, /operatorAutoExecute: true/);
  assert.match(verifier, /operatorRequiresConfirmation: false/);
  assert.match(verifier, /contextScope: "entity"/);
  assert.match(verifier, /requireExecutionPermission\(context, permission\)/);
});

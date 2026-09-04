import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = JSON.parse(
  fs.readFileSync("lib/finance/runtime/financeCapabilityRuntimeManifest.json", "utf8")
);
const registry = fs.readFileSync(
  "lib/platform/erp-engine/renderers/RendererRegistry.js",
  "utf8"
);
const workspace = fs.readFileSync(
  "components/workspace/finance/FinancePaymentsWorkCenter.jsx",
  "utf8"
);
const paymentList = fs.readFileSync(
  "app/api/finance/payments/list/route.js",
  "utf8"
);
const customerPayments = fs.readFileSync(
  "app/api/finance/customer-payments/list/route.js",
  "utf8"
);
const vendorPaymentRoute = fs.readFileSync(
  "app/api/finance/accounts-payable/pay/route.js",
  "utf8"
);
const customerPaymentRoute = fs.readFileSync(
  "app/api/finance/customer-payments/create/route.js",
  "utf8"
);

assert.deepEqual(manifest.payments, {
  kind: "records",
  scope: "entity",
  owner: "finance",
  api: "/api/finance/payments/list",
  rowsKey: "rows",
  renderer: "FinancePaymentsWorkCenter",
});

assert.match(
  registry,
  /import FinancePaymentsWorkCenter from "@\/components\/workspace\/finance\/FinancePaymentsWorkCenter";/
);
assert.match(
  registry,
  /registerRenderer\("FinancePaymentsWorkCenter", RegisteredFinancePaymentsWorkCenter\);/
);

for (const marker of [
  "Ready to Pay",
  "On Hold",
  "Money Out",
  "Money In",
  "/api/finance/payments/list",
  "/api/finance/customer-payments/list",
  "/api/finance/accounts-payable/pay",
  "/api/finance/customer-payments/create",
  "idempotency_key",
  "payment_hold",
]) {
  assert.ok(workspace.includes(marker), `Payments workspace missing contract marker: ${marker}`);
}

assert.ok(
  paymentList.indexOf('searchParams.get("view")') <
    paymentList.indexOf('searchParams.get("capabilityId")'),
  "Explicit payment view must take precedence over capabilityId"
);
assert.match(paymentList, /checkFinancePermission/);
assert.match(paymentList, /finance\.payables\.view/);
assert.match(paymentList, /view === "vendor_payments"/);

assert.match(customerPayments, /resolveEntity/);
assert.match(customerPayments, /query = query\.eq\("entity_id", entity\.id\)/);
assert.match(customerPayments, /customer_name/);
assert.match(customerPayments, /bank_account_name/);
assert.match(customerPayments, /invoice_number/);
assert.match(customerPayments, /finance\.receivables\.view/);

assert.match(vendorPaymentRoute, /idempotency_key/);
assert.match(vendorPaymentRoute, /finance\.payables\.manage/);
assert.match(customerPaymentRoute, /idempotency_key/);
assert.match(customerPaymentRoute, /finance\.receivables\.manage/);

console.log("Finance payments workspace contract OK");

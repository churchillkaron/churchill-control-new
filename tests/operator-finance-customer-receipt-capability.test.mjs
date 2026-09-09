import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const capability = fs.readFileSync(
  new URL("../lib/finance/accounts-receivable/capabilities/postCustomerReceipt.js", import.meta.url),
  "utf8",
);
const financeRuntime = fs.readFileSync(
  new URL("../lib/finance/FinanceRuntime.js", import.meta.url),
  "utf8",
);
const paymentRuntime = fs.readFileSync(
  new URL("../lib/finance/accounts-receivable/capabilities/postCustomerPayment.js", import.meta.url),
  "utf8",
);
const liveRoute = fs.readFileSync(
  new URL("../app/api/operator/turn/live/route.js", import.meta.url),
  "utf8",
);

test("Finance exposes a governed customer receipt capability to Business Partner", () => {
  assert.match(financeRuntime, /customer_receipt:\s*\{/);
  assert.match(financeRuntime, /postCustomerReceipt/);
  assert.match(capability, /operatorEnabled:\s*true/);
  assert.match(capability, /operatorMode:\s*"approve"/);
  assert.match(capability, /operatorRequiresConfirmation:\s*true/);
  assert.match(capability, /risk:\s*"high"/);
  assert.match(capability, /finance\.receivables\.manage/);
});
test("routine invoice payment language is first-class capability vocabulary", () => {
  assert.match(capability, /mark invoice paid/);
  assert.match(capability, /record invoice payment/);
  assert.match(capability, /post customer receipt/);
  assert.match(capability, /Mark invoice INV-26090001 paid on 8 Sep 2026/);
});

test("receipt capability resolves business records and verifies paid state", () => {
  assert.match(capability, /from\("customer_invoices"\)/);
  assert.match(capability, /from\("bank_accounts"\)/);
  assert.match(capability, /postCustomerPaymentCommand/);
  assert.match(capability, /operator-customer-receipt-v1/);
  assert.match(capability, /status\)\.toUpperCase\(\) === "PAID"/);
  assert.match(capability, /outstanding_balance/);
  assert.match(capability, /mode=receipt/);
  assert.match(capability, /mime_type:\s*"application\/pdf"/);
});

test("underlying customer payment runtime has UUID generation wired", () => {
  assert.match(paymentRuntime, /import \{ randomUUID \} from "node:crypto"/);
  assert.match(paymentRuntime, /const paymentId = randomUUID\(\)/);
});

test("live turn status does not falsely announce Deep planning before routing", () => {
  assert.match(liveRoute, /phase:\s*"REQUEST_ROUTING"/);
  assert.doesNotMatch(liveRoute, /phase:\s*"COGNITIVE_PLANNING"/);
  assert.doesNotMatch(liveRoute, /Intelligence is building the execution brief/);
  assert.match(liveRoute, /paid_execution_running:\s*false/);
});
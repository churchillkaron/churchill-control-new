import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("customer invoice keeps accounting implementation details out of the normal form", () => {
  const formContract = read("lib/platform/forms/FinanceFormContract.js");
  const createEngine = read("components/workspace/engines/CreateEngine.jsx");

  assert.match(formContract, /result = result\.filter\(\(field\) => field\?\.name !== "exchange_rate"\)/);
  assert.doesNotMatch(createEngine, /invoiceForm && field\.name === "exchange_rate"\) resolvedDefault = 1/);
  assert.match(createEngine, /invoiceForm && currency && field\.name === "currency_code"/);
  assert.match(createEngine, /Exchange rates are resolved automatically when needed/);
});

test("customer invoice creation lets Finance resolve exchange rates instead of inventing 1.0", () => {
  const route = read("app/api/finance/customer-invoices/create/route.js");
  const creator = read("lib/finance/accounts-receivable/documents/createCustomerInvoice.js");

  assert.match(route, /exchange_rate: body\.exchange_rate \?\? null/);
  assert.match(creator, /resolveFinanceExchangeRate/);
  assert.match(creator, /if \(!Number\.isFinite\(resolvedExchangeRate\) \|\| resolvedExchangeRate <= 0\)/);
});

test("customer invoice mobile create sheet locks the background and prevents horizontal drift", () => {
  const createEngine = read("components/workspace/engines/CreateEngine.jsx");

  assert.match(createEngine, /document\.body\.style\.overflow = "hidden"/);
  assert.match(createEngine, /overflow-hidden overscroll-none/);
  assert.match(createEngine, /overflow-y-auto overflow-x-hidden overscroll-contain/);
  assert.match(createEngine, /safe-area-inset-bottom/);
});

test("new-customer details stay collapsed until the user actually chooses to create one", () => {
  const customerField = read("components/workspace/engines/DynamicCustomerField.jsx");

  assert.match(customerField, /const \[editingDetails, setEditingDetails\] = useState\(false\)/);
  assert.match(customerField, /onClick=\{confirmNewCustomer\}/);
});

test("empty customer-invoice workspaces still receive the legal-entity currency", () => {
  const listRoute = read("app/api/finance/customer-invoices/list/route.js");

  assert.match(listRoute, /currencyCode: entity\?\.currency \|\| null/);
  assert.match(listRoute, /currency_code: entity\?\.currency \|\| null/);
});

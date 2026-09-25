import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const semantic = fs.readFileSync(
  "lib/operator/runtime/OperatorSemanticActionPreparationRuntime.js",
  "utf8",
);
const finance = fs.readFileSync(
  "lib/finance/accounts-receivable/CorrectCustomerInvoice/execute.js",
  "utf8",
);
const runtime = fs.readFileSync("lib/finance/FinanceRuntime.js", "utf8");
const actions = fs.readFileSync(
  "lib/operator/runtime/OperatorFastActionIndex.js",
  "utf8",
);

test("generic correction turns receive compact identity from the last verified execution", () => {
  assert.match(semantic, /function compactLastExecutionTarget\(/);
  assert.match(semantic, /last_verified_execution:/);
  assert.match(semantic, /correction_or_revision === true/);
  assert.match(semantic, /goal_relation[\s\S]*revise/);
  assert.match(
    semantic,
    /Use its identities only to bind a fresh registered read/,
  );
  assert.doesNotMatch(
    semantic,
    /Moonshine|previous Thursday|previous Sunday/,
  );
});

test("Finance exposes a governed customer invoice correction capability", () => {
  assert.match(runtime, /CorrectCustomerInvoice/);
  assert.match(
    actions,
    /finance\.accounts_receivable\.CorrectCustomerInvoice/,
  );
  assert.match(finance, /action: "CorrectCustomerInvoice"/);
  assert.match(finance, /operatorRequiresConfirmation: true/);
  assert.match(finance, /transactional: false/);
});

test("invoice correction preflights replacement before compensating source invoice", () => {
  const preflight = finance.indexOf("await prepareCustomerInvoice({");
  const credit = finance.indexOf(
    "await issueCustomerCreditNoteCommand({",
  );
  const replacement = finance.indexOf(
    "await createCustomerInvoiceCommand({",
  );

  assert.ok(preflight >= 0);
  assert.ok(credit > preflight);
  assert.ok(replacement > credit);
  assert.match(finance, /automatic replace-by-credit is blocked/);
  assert.match(
    finance,
    /Source invoice has payment or settlement activity/,
  );
});

test("invoice correction verifies both source compensation and replacement", () => {
  assert.match(
    finance,
    /Source invoice correction could not be independently verified/,
  );
  assert.match(
    finance,
    /Replacement invoice dates could not be independently verified/,
  );
  assert.match(finance, /source_invoice_credited: true/);
  assert.match(finance, /replacement_invoice_verified: true/);
});

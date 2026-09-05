import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const submit = read("app/api/finance/vat-returns/mark-submitted/route.js");
const runtime = read("app/api/finance/tax/runtime/route.js");
const methodPolicy = read("lib/finance/tax/FinanceVatCalculationMethodPolicy.js");
const salesMigration = read("supabase/migrations/20260904124500_vat_calculation_excludes_reversed_postings.sql");
const purchaseMigration = read("supabase/migrations/20260905074500_vat_calculation_excludes_reversed_purchase_postings.sql");
const preflight = read("lib/finance/tax/FinanceVatReturnPreflight.js");

test("VAT filing rejects calculations produced by an older evidence method", () => {
  assert.match(submit, /REQUIRED_VAT_CALCULATION_METHOD = "POSTED_GOVERNED_VAT_LINE_EVIDENCE_V2"/);
  assert.match(submit, /preflight\?\.return\?\.calculation\?\.method/);
  assert.match(submit, /storedMethod !== REQUIRED_VAT_CALCULATION_METHOD/);
  assert.match(submit, /Recalculate from governed line evidence before filing/);
  assert.match(submit, /requireCurrentCalculationMethod\(preflight\)/);
});

test("VAT database calculation excludes reversed sales posting evidence", () => {
  assert.match(salesMigration, /customer_invoice_lines/);
  assert.match(salesMigration, /POSTED_GOVERNED_VAT_LINE_EVIDENCE_V2/);
  assert.match(salesMigration, /coalesce\(je\.reversed,false\) is not true/);
});

test("VAT database calculation excludes reversed purchase posting evidence", () => {
  assert.match(purchaseMigration, /vendor_invoice_lines/);
  assert.match(purchaseMigration, /je\.id = vi\.journal_entry_id/);
  assert.match(purchaseMigration, /upper\(coalesce\(je\.status,''\)\) = 'POSTED'/);
  assert.match(purchaseMigration, /coalesce\(je\.reversed,false\) is not true/);
  assert.match(purchaseMigration, /POSTED_GOVERNED_VAT_LINE_EVIDENCE_V2/);
});

test("Input VAT preflight independently proves the linked vendor journal is posted and non-reversed", () => {
  assert.match(preflight, /vendorJournalIds/);
  assert.match(preflight, /label: "Vendor posting evidence"/);
  assert.match(preflight, /vendorJournalsById/);
  assert.match(preflight, /upper\(linkedJournal\.status\) === "POSTED"/);
  assert.match(preflight, /linkedJournalPosted && linkedJournal\.reversed !== true/);
  assert.match(preflight, /code: reversedLinkedJournal \? "INPUT_POSTING_REVERSED" : "INPUT_NOT_APPROVED_POSTED"/);
  assert.match(preflight, /functional_tax_amount: readyInvoice \? roundMoney/);
  assert.match(preflight, /\.\.\.relevantVendorJournals/);
});

test("Tax runtime surfaces old VAT calculation methods as stale before submission", () => {
  assert.match(methodPolicy, /REQUIRED_VAT_CALCULATION_METHOD = "POSTED_GOVERNED_VAT_LINE_EVIDENCE_V2"/);
  assert.match(methodPolicy, /upper\(preflight\?\.return\?\.status\) !== "CALCULATED"/);
  assert.match(methodPolicy, /storedMethod === REQUIRED_VAT_CALCULATION_METHOD/);
  assert.match(methodPolicy, /calculation_stale: true/);
  assert.match(methodPolicy, /ready_to_submit: false/);
  assert.match(methodPolicy, /state: "NEEDS_ATTENTION"/);
  assert.match(methodPolicy, /blocks_submission: true/);
  assert.match(runtime, /applyFinanceVatCalculationMethodToPreflight/);
  assert.match(runtime, /applyFinanceVatCalculationMethodToPreflight\(calendarPreflight\)/);
});

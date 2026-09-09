import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260909183000_historical_customer_payment_evidence_and_quotation_date.sql",
  "utf8",
);
const receiptRenderer = fs.readFileSync(
  "lib/finance/accounts-receivable/documents/renderCustomerInvoicePdf.js",
  "utf8",
);
const quotationService = fs.readFileSync(
  "lib/commercial/quotations/QuotationService.js",
  "utf8",
);

test("Cole Ley reconciliation preserves quotation issue date as a real field", () => {
  assert.match(migration, /add column if not exists quotation_date date/);
  assert.match(quotationService, /quotationDate \|\| body\.quotation_date \|\| body\.date/);
  assert.match(quotationService, /update\(\{ quotation_date: quotationDate \}\)/);
});

test("historical receipt evidence is separate from live bank posting", () => {
  assert.match(migration, /finance_historical_customer_payment_evidence/);
  assert.match(migration, /Does not create bank or ledger effects/);
  assert.match(receiptRenderer, /finance_customer_payment_allocations/);
  assert.match(receiptRenderer, /finance_historical_customer_payment_evidence/);
  assert.match(receiptRenderer, /LEGACY_COLELEY_INVOICE/);
  assert.match(receiptRenderer, /verified posted payment or migrated historical payment evidence/);
});

test("receipt output carries original historical receipt facts", () => {
  assert.match(receiptRenderer, /historical\?\.receipt_number/);
  assert.match(receiptRenderer, /historical\?\.paid_date/);
  assert.match(receiptRenderer, /historical\?\.amount/);
  assert.match(receiptRenderer, /historical\?\.payment_method/);
  assert.match(receiptRenderer, /Tax ID: \$\{text\(party\.tax_id\)\}/);
});

test("Cole Ley backfill is tenant-scoped and cardinality-locked", () => {
  const backfill = fs.readFileSync(
    "supabase/migrations/20260909183500_coleley_legacy_finance_evidence_backfill.sql",
    "utf8",
  );
  assert.match(backfill, /o\.name = 'Cole Ley Co\., Ltd\.'/);
  assert.equal((backfill.match(/QT-2026-/g) || []).length, 6);
  assert.equal((backfill.match(/CL-2026-/g) || []).length, 21);
  assert.equal((backfill.match(/RC-2026-/g) || []).length, 21);
});

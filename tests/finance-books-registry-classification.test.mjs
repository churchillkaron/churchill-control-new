import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../components/workspace/finance/FinanceBooksDesk.jsx", import.meta.url), "utf8");

test("Finance Books uses explicit registry groups instead of keyword classification", () => {
  assert.match(source, /BOOK_AREA_BY_GROUP/);
  assert.match(source, /accounting: "ledger"/);
  assert.match(source, /order_to_cash: "receivables"/);
  assert.match(source, /procure_to_pay: "payables"/);
  assert.match(source, /treasury: "banking"/);
  assert.match(source, /compliance: "tax"/);
  assert.doesNotMatch(source, /REPORT_WORDS|CONFIGURE_WORDS|firstMatch|classificationText/);
});

test("Finance Books core desk resolves exact capability IDs", () => {
  for (const id of ["trial_balance", "general_ledger", "customer_invoices", "vendor_bills", "bank_reconciliation", "journals"]) {
    assert.match(source, new RegExp(`id: "${id}"`));
  }
  assert.match(source, /candidate\.id === slot\.id/);
});

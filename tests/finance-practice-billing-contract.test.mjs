import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260918094500_accounting_practice_billing_authority.sql", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/workspace/finance/practice-billing/route.js", import.meta.url), "utf8");
const practiceTime = fs.readFileSync(new URL("../app/api/workspace/finance/practice-time/route.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeTimeWip.jsx", import.meta.url), "utf8");

test("practice billing hands off only through canonical customer invoice authority", () => {
  assert.match(route, /createCustomerInvoiceCommand/);
  assert.match(route, /finance\.receivables\.manage/);
  assert.match(route, /source_document_type: "ACCOUNTING_PRACTICE_WIP"/);
  assert.doesNotMatch(route, /from\(["']customer_invoices["']\)\.insert/);
});

test("practice billing requires exact firm billing identity and accounting policy", () => {
  assert.match(route, /Billing entity must be configured before invoicing/);
  assert.match(route, /Finance customer party must be configured before invoicing/);
  assert.match(route, /Revenue account must be configured before invoicing/);
  assert.match(route, /Finance tax rule must be configured before invoicing/);
  assert.match(route, /Tax treatment must be confirmed before invoicing/);
  assert.match(practiceTime, /Billing customer party is outside the accounting firm/);
  assert.match(practiceTime, /Selected billing account must be a revenue\/income account/);
});

test("practice tax rate is snapshotted from governed Finance tax rule", () => {
  assert.match(practiceTime, /from\("tax_rules"\)/);
  assert.match(practiceTime, /taxRatePercent = Number\(taxRule\.tax_rate \|\| 0\) \* 100/);
  assert.match(route, /subtotal \* Number\(profile\.tax_rate_percent \|\| 0\)\) \/ 100/);
  assert.match(ui, /Select Finance tax rule/);
  assert.doesNotMatch(ui, /Tax rate %/);
});

test("practice billing is durable and idempotent at exact WIP or billing period scope", () => {
  assert.match(migration, /accounting_practice_billing_batches/);
  assert.match(migration, /time_entry_ids uuid\[\]/);
  assert.match(migration, /billing_period_key text not null/);
  assert.match(migration, /unique \(accounting_firm_id, idempotency_key\)/);
  assert.match(route, /entryIds = rows\.map/);
  assert.match(route, /billingPeriodKey/);
  assert.match(route, /idempotency_key: key/);
  assert.match(route, /batch\.status === "INVOICED"/);
});

test("practice billing marks only exact approved entries billed after invoice authority returns an id", () => {
  const invoiceIndex = route.indexOf("const createdInvoiceId = invoiceId(result)");
  const billedIndex = route.indexOf('status: "BILLED"');
  assert.ok(invoiceIndex >= 0 && billedIndex > invoiceIndex);
  assert.match(route, /\.in\("id", entryIds\)\.eq\("status", "APPROVED"\)/);
  assert.match(route, /Customer invoice authority returned no invoice id/);
});

test("fixed recurring practice fees are period-idempotent and advance only after invoice success", () => {
  assert.match(migration, /billing_cadence in \('ON_DEMAND','MONTHLY','QUARTERLY','ANNUAL'\)/);
  assert.match(migration, /next_billing_date date/);
  assert.match(route, /periodKey\(billingDate, cadence\)/);
  assert.match(route, /Next billing date must be configured for recurring practice billing/);
  const invoiceIndex = route.indexOf("const createdInvoiceId = invoiceId(result)");
  const advanceIndex = route.indexOf("const nextBillingDate = addCadence");
  assert.ok(invoiceIndex >= 0 && advanceIndex > invoiceIndex);
  assert.match(ui, /Billing cadence/);
  assert.match(ui, /Next billing date/);
});

test("human WIP screen explains blockers and exposes invoice action only from ready engagement", () => {
  assert.match(ui, /Billing readiness/);
  assert.match(ui, /Avantiqo tells you exactly what is missing before invoice creation is allowed/);
  assert.match(ui, /row\.blockers/);
  assert.match(ui, /row\.invoice_ready/);
  assert.match(ui, /Create invoice/);
  assert.match(ui, /createInvoice\(row\.engagement_id\)/);
  assert.match(ui, /Apply rate to unpriced WIP/);
});

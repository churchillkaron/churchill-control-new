import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260918094500_accounting_practice_billing_authority.sql", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/workspace/finance/practice-billing/route.js", import.meta.url), "utf8");
const practiceTime = fs.readFileSync(new URL("../app/api/workspace/finance/practice-time/route.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeTimeWip.jsx", import.meta.url), "utf8");
const atomicPolicyMigration = fs.readFileSync(new URL("../supabase/migrations/20260919102500_accounting_practice_billing_policy_atomicity.sql", import.meta.url), "utf8");
const atomicFinalizationMigration = fs.readFileSync(new URL("../supabase/migrations/20260919104500_accounting_practice_billing_finalization_atomicity.sql", import.meta.url), "utf8");

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
  assert.match(practiceTime, /Selected Finance customer must be active/);
  assert.match(practiceTime, /Selected revenue account must be active/);
  assert.match(practiceTime, /Selected billing account must be a revenue\/income account/);
  assert.match(practiceTime, /Billing currency must use a three-letter currency code/);
});

test("practice tax rate is snapshotted from governed Finance tax rule", () => {
  assert.match(practiceTime, /from\("tax_rules"\)/);
  assert.match(atomicPolicyMigration, /v_tax_rate_percent := greatest\(0, least\(100, coalesce\(v_tax\.tax_rate, 0\) \* 100\)\)/);
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

test("practice billing finalizes exact approved entries only after invoice authority returns an id", () => {
  const invoiceIndex = route.indexOf("const createdInvoiceId = invoiceId(result)");
  const finalizeIndex = route.indexOf('rpc("finalize_accounting_practice_billing_batch"');
  assert.ok(invoiceIndex >= 0 && finalizeIndex > invoiceIndex);
  assert.match(route, /Customer invoice authority returned no invoice id/);
  assert.match(atomicFinalizationMigration, /e\.id = any\(v_batch\.time_entry_ids\)/);
  assert.match(atomicFinalizationMigration, /e\.status = 'APPROVED'/);
  assert.match(atomicFinalizationMigration, /e\.billing_reference = p_invoice_id::text/);
  assert.match(atomicFinalizationMigration, /PRACTICE_BILLING_WIP_SCOPE_CHANGED/);
});

test("fixed recurring practice fees are period-idempotent and advance only inside atomic finalization", () => {
  assert.match(migration, /billing_cadence in \('ON_DEMAND','MONTHLY','QUARTERLY','ANNUAL'\)/);
  assert.match(migration, /next_billing_date date/);
  assert.match(route, /periodKey\(billingDate, cadence\)/);
  assert.match(route, /Next billing date must be configured for recurring practice billing/);
  assert.match(route, /billing_cadence: cadence, billing_date: billingDate/);
  assert.match(atomicFinalizationMigration, /PRACTICE_BILLING_CADENCE_CHANGED_DURING_INVOICE/);
  assert.match(atomicFinalizationMigration, /PRACTICE_BILLING_DATE_CHANGED_DURING_INVOICE/);
  assert.match(atomicFinalizationMigration, /set next_billing_date = v_next_billing_date/);
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

test("billing policy save and optional WIP repricing use one atomic database mutation", () => {
  assert.match(practiceTime, /\.rpc\("upsert_accounting_practice_billing_policy"/);
  assert.doesNotMatch(practiceTime, /from\("accounting_practice_billing_profiles"\)\.upsert/);
  assert.match(atomicPolicyMigration, /insert into public\.accounting_practice_billing_profiles/);
  assert.match(atomicPolicyMigration, /update public\.accounting_practice_time_entries/);
  assert.match(atomicPolicyMigration, /get diagnostics v_repriced = row_count/);
  assert.match(atomicPolicyMigration, /'repriced_entries', v_repriced/);
});

test("atomic billing policy independently validates exact firm scope and live references", () => {
  assert.match(atomicPolicyMigration, /accounting_firm_id = p_accounting_firm_id/);
  assert.match(atomicPolicyMigration, /status = 'ACTIVE'/);
  assert.match(atomicPolicyMigration, /organization_id = p_accounting_firm_id[\s\S]*coalesce\(is_active, true\) = true/);
  assert.match(atomicPolicyMigration, /public\.parties[\s\S]*upper\(coalesce\(status, ''\)\) = 'ACTIVE'/);
  assert.match(atomicPolicyMigration, /public\.chart_of_accounts[\s\S]*is_active = true/);
  assert.match(atomicPolicyMigration, /PRACTICE_BILLING_REVENUE_ACCOUNT_INVALID/);
});

test("atomic billing policy derives the tax snapshot from the governed live tax rule", () => {
  assert.match(atomicPolicyMigration, /public\.tax_rules/);
  assert.match(atomicPolicyMigration, /v_tax\.effective_from/);
  assert.match(atomicPolicyMigration, /v_tax\.effective_to/);
  assert.match(atomicPolicyMigration, /v_tax_rate_percent := greatest\(0, least\(100, coalesce\(v_tax\.tax_rate, 0\) \* 100\)\)/);
  assert.doesNotMatch(practiceTime, /p_tax_rate_percent/);
});

test("atomic billing policy mutation is invoker-safe and service-role isolated", () => {
  assert.match(atomicPolicyMigration, /security invoker/);
  assert.match(atomicPolicyMigration, /revoke all on function public\.upsert_accounting_practice_billing_policy/);
  assert.match(atomicPolicyMigration, /from public, anon, authenticated/);
  assert.match(atomicPolicyMigration, /grant execute on function public\.upsert_accounting_practice_billing_policy[\s\S]*to service_role/);
});

test("billing policy route rejects malformed cadence terms before the atomic mutation", () => {
  assert.match(practiceTime, /Payment terms must be between 0 and 3650 days/);
  assert.match(practiceTime, /Unsupported billing cadence/);
  assert.match(practiceTime, /Next billing date must use YYYY-MM-DD/);
});

test("billing finalization proves the exact canonical invoice source and is retry-idempotent", () => {
  assert.match(atomicFinalizationMigration, /upper\(coalesce\(source_document_type, ''\)\) = 'ACCOUNTING_PRACTICE_WIP'/);
  assert.match(atomicFinalizationMigration, /source_document_id = v_batch\.id/);
  assert.match(atomicFinalizationMigration, /if v_batch\.status = 'INVOICED' then/);
  assert.match(atomicFinalizationMigration, /v_batch\.invoice_id is distinct from p_invoice_id/);
  assert.match(atomicFinalizationMigration, /'idempotent', true/);
});

test("billing finalization cannot be downgraded by the route failure recorder", () => {
  assert.match(route, /\.in\("status", \["PREPARING", "FAILED"\]\)/);
  assert.doesNotMatch(route, /\.update\(\{ status: "FAILED"[\s\S]*\.eq\("id", batch\.id\);/);
});

test("billing finalization is one invoker-safe service-role-only database transaction", () => {
  assert.match(atomicFinalizationMigration, /security invoker/);
  assert.match(atomicFinalizationMigration, /update public\.accounting_practice_time_entries/);
  assert.match(atomicFinalizationMigration, /update public\.accounting_practice_billing_profiles/);
  assert.match(atomicFinalizationMigration, /update public\.accounting_practice_billing_batches/);
  assert.match(atomicFinalizationMigration, /revoke all on function public\.finalize_accounting_practice_billing_batch/);
  assert.match(atomicFinalizationMigration, /to service_role/);
});

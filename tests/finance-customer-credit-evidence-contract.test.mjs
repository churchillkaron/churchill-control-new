import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260920023859_finance_customer_credit_evidence_integrity.sql", import.meta.url), "utf8");

test("completed customer credit events are globally immutable", () => {
  assert.match(migration, /CUSTOMER_CREDIT_NOTE/);
  assert.match(migration, /CUSTOMER_CREDIT_APPLY/);
  assert.match(migration, /CUSTOMER_CREDIT_REFUND/);
  assert.match(migration, /CUSTOMER_CREDIT_EVENT_EVIDENCE_IMMUTABLE/);
});

test("posted customer credit-note header and lines become immutable evidence", () => {
  assert.match(migration, /CUSTOMER_CREDIT_NOTE_EVIDENCE_IMMUTABLE/);
  assert.match(migration, /CUSTOMER_CREDIT_NOTE_LINE_EVIDENCE_IMMUTABLE/);
  assert.match(migration, /before update or delete on public\.customer_invoices/);
  assert.match(migration, /before insert or update or delete on public\.customer_invoice_lines/);
});

test("customer credit balance aggregate preserves identity monotonic use and accounting equation", () => {
  assert.match(migration, /CUSTOMER_CREDIT_BALANCE_EVIDENCE_INVALID/);
  assert.match(migration, /new\.applied_amount, 0\) < coalesce\(old\.applied_amount, 0\)/);
  assert.match(migration, /new\.refunded_amount, 0\) < coalesce\(old\.refunded_amount, 0\)/);
  assert.match(migration, /new\.available_amount, 0\) > coalesce\(old\.available_amount, 0\)/);
  assert.match(migration, /new\.available_amount, 0\)[\s\S]*new\.applied_amount, 0\)[\s\S]*new\.refunded_amount, 0\)[\s\S]*new\.original_amount, 0\)/);
});

test("customer credit application and refund event rows are append-only", () => {
  assert.match(migration, /CUSTOMER_CREDIT_APPLICATION_EVIDENCE_IMMUTABLE/);
  assert.match(migration, /before update or delete on public\.finance_customer_credit_applications/);
  assert.match(migration, /CUSTOMER_CREDIT_REFUND_EVIDENCE_IMMUTABLE/);
  assert.match(migration, /before update or delete on public\.finance_customer_credit_refunds/);
});

test("customer credit-note and refund journals become terminal proof", () => {
  assert.match(migration, /CUSTOMER_CREDIT_NOTE_POSTED/);
  assert.match(migration, /CUSTOMER_CREDIT_REFUNDED/);
  assert.match(migration, /CUSTOMER_CREDIT_JOURNAL_EVIDENCE_IMMUTABLE/);
  assert.match(migration, /CUSTOMER_CREDIT_JOURNAL_LINE_EVIDENCE_IMMUTABLE/);
  assert.match(migration, /CUSTOMER_CREDIT_GENERAL_LEDGER_EVIDENCE_IMMUTABLE/);
});

test("customer credit refund bank evidence allows only one-way reconciliation binding", () => {
  assert.match(migration, /customer_credit_refund/);
  assert.match(migration, /CUSTOMER_CREDIT_REFUND_BANK_EVIDENCE_IMMUTABLE/);
  assert.match(migration, /old\.period_id is null and new\.period_id is not null/);
  assert.match(migration, /old\.reconciled_statement_id is null and new\.reconciled_statement_id is not null/);
});

test("matched customer credit refund bank statement is terminal evidence", () => {
  assert.match(migration, /CUSTOMER_CREDIT_BANK_STATEMENT_EVIDENCE_IMMUTABLE/);
  assert.match(migration, /before update or delete on public\.bank_statements/);
  assert.match(migration, /old\.ledger_reference_id is null and new\.ledger_reference_id is not null/);
  assert.match(migration, /old\.matched_at is null and new\.matched_at is not null/);
});

test("customer credit evidence helpers are invoker-safe and service-role isolated", () => {
  assert.match(migration, /security invoker/g);
  assert.match(migration, /from public, anon, authenticated/g);
  assert.match(migration, /to service_role/g);
  assert.doesNotMatch(migration, /security definer/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260910023500_finance_bank_statement_exact_reconciliation.sql', 'utf8');
const route = readFileSync('app/api/finance/bank-statements/import/route.js', 'utf8');

test('bank statement auto reconciliation is scoped, exact and ambiguity-safe', () => {
  for (const marker of [
    'p_organization_id', 'p_entity_id', 'p_bank_account_id', 'p_statement_import_id',
    'reconciled_statement_id is null', 'statement_import_id = p_statement_import_id',
    "lower(coalesce(l.source_document, '')) = 'customer_payment'",
    'cp.payment_date::date = v_statement.transaction_date',
    'v_candidate_count = 1', 'v_statement_candidate_count = 1',
    'EXACT_UNIQUE_REFERENCE_OR_SOURCE_PAYMENT_DATE_V1',
  ]) assert.ok(migration.includes(marker), `missing reconciliation marker: ${marker}`);
  assert.match(migration, /security invoker/i);
  assert.match(route, /finance_reconcile_bank_statement_import_exact_atomic/);
  assert.match(route, /imported:\s*true/);
  assert.match(route, /REVIEW_REQUIRED/);
});

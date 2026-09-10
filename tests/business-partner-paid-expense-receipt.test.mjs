import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasPreparedAttachmentReflexCandidate,
  resolvePreparedAttachmentReflex,
} from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

const capability = {
  key: 'finance.expense_receipts.post',
  mode: 'approve',
  requires_confirmation: true,
  auto_execute: false,
};

function paidCandidate(overrides = {}) {
  return {
    name: 'receipt.pdf', sha256: 'abc123',
    prepared_candidate: {
      type: 'paid_expense_receipt', recognized: true,
      status: 'READY_FOR_REVIEW', payment_status: 'PAID',
      receipt: { receipt_number:'R-100', receipt_date:'2026-09-10', currency_code:'THB', total_amount:1070, tax_amount:70 },
      payment_source: { type:'BANK_ACCOUNT', id:'bank-1', label:'Company Bank' },
      import_payload: { receipt_number:'R-100', receipt_date:'2026-09-10', currency_code:'THB', exchange_rate:1, payment_source_type:'BANK_ACCOUNT', payment_source_id:'bank-1', evidence_checksum:'abc123', lines:[{ description:'Supplies', gross_amount:1070, tax_amount:70, posting_account_id:'expense-1', tax_account_id:'vat-1' }] },
      authorization_effect:'NONE', ...overrides,
    },
  };
}
test('ready paid receipt stages confirmation-gated Finance posting without payable', () => {
  const file = paidCandidate();
  assert.equal(hasPreparedAttachmentReflexCandidate([file], 'Record this expense'), true);
  const result = resolvePreparedAttachmentReflex({
    message:'Record this expense', entityId:'entity-1', attachments:[file], capabilities:[capability],
  });
  assert.equal(result.intent, 'execute');
  assert.equal(result.execution.capability_key, 'finance.expense_receipts.post');
  assert.equal(result.execution.payload.payment_source_id, 'bank-1');
  assert.match(result.response_text, /requires your confirmation/i);
  assert.match(result.response_text, /will not create an accounts-payable liability/i);
});

test('unknown paid status asks before any accounting action', () => {
  const file = paidCandidate({ status:'CLARIFICATION_REQUIRED', payment_status:'UNKNOWN', import_payload:null, clarification_question:'Was this receipt already paid, or is it still payable to the supplier?' });
  const result = resolvePreparedAttachmentReflex({
    message:'Record this expense', entityId:'entity-1', attachments:[file], capabilities:[capability],
  });
  assert.equal(result.intent, 'clarify');
  assert.equal(result.execution.capability_key, null);
  assert.match(result.response_text, /already paid.*still payable/i);
});

test('classification-only question never posts a paid receipt', () => {
  const result = resolvePreparedAttachmentReflex({
    message:'What is this?', entityId:'entity-1', attachments:[paidCandidate()], capabilities:[capability],
  });
  assert.equal(result.intent, 'answer');
  assert.equal(result.execution.capability_key, null);
  assert.match(result.response_text, /No accounting entry has been posted/i);
});
test('paid expense capability is high-risk and never creates a payable', () => {
  const source = readFileSync('lib/finance/expense-receipts/capabilities/postPaidExpenseReceipt.js','utf8');
  assert.match(source, /finance\.accounting\.manage/);
  assert.match(source, /operatorRequiresConfirmation:\s*true/);
  assert.match(source, /risk:\s*"high"/);
  assert.match(source, /payable_created:\s*false/);
  assert.match(source, /Direct payment account must be an asset or liability account/);
});

test('paid expense migration is atomic and does not touch legacy expenses table', () => {
  const sql = readFileSync('supabase/migrations/20260910140500_finance_paid_expense_receipts.sql','utf8');
  assert.match(sql, /create table if not exists public\.finance_expense_receipts/);
  assert.match(sql, /finance_create_paid_expense_receipt_atomic/);
  assert.match(sql, /finance_post_journal_atomic/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.expenses\b/i);
  assert.doesNotMatch(sql, /update\s+public\.expenses\b/i);
});

test('preparer refuses receipt-equals-paid and keeps unpaid for AP', () => {
  const source = readFileSync('lib/finance/expense-receipts/PaidExpenseReceiptAttachmentPreparationRuntime.js','utf8');
  assert.match(source, /return "UNKNOWN"/);
  assert.match(source, /payment_status:\s*"UNPAID"/);
  assert.match(source, /payable_candidate:\s*true/);
  assert.match(source, /Was this receipt already paid, or is it still payable to the supplier\?/);
  assert.match(source, /authorization_effect:\s*"NONE"/);
});

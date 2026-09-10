import assert from 'node:assert/strict';
import test from 'node:test';
import { matchStatementPaymentEvidence } from '../lib/finance/bank-statements/BankStatementPaymentEvidenceRuntime.js';

const statements = [
  { id:'s1', transaction_date:'2026-09-08', amount:25000, direction:'IN', reference_number:null },
  { id:'s2', transaction_date:'2026-09-09', amount:1000, direction:'OUT', reference_number:'REF-2' },
];

test('payment evidence matches are unique and never reconciliation authority', () => {
  const report = matchStatementPaymentEvidence({ statements, transactions:[
    { id:'b1', transaction_date:'2026-09-08', amount:25000, type:'deposit', reference:null },
    { id:'b2', transaction_date:'2026-09-09', amount:1000, type:'withdrawal', reference:'REF-2' },
  ]});
  assert.equal(report.matched_count, 2);
  assert.equal(report.unmatched_count, 0);
  assert.equal(report.reconciliation_authority, false);
});

test('ambiguous same-day amount evidence is not auto matched', () => {
  const report = matchStatementPaymentEvidence({ statements:[statements[0]], transactions:[
    { id:'b1', transaction_date:'2026-09-08', amount:25000, type:'deposit', reference:null },
    { id:'b2', transaction_date:'2026-09-08', amount:25000, type:'deposit', reference:null },
  ]});
  assert.equal(report.matched_count, 0);
  assert.equal(report.unmatched[0].reason, 'AMBIGUOUS_PAYMENT_EVIDENCE');
});

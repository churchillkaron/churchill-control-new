import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasPreparedAttachmentReflexCandidate,
  resolvePreparedAttachmentReflex,
} from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

const capability = {
  key: 'finance.bank_statements.create',
  mode: 'write',
  requires_confirmation: true,
  auto_execute: false,
};

function readyFile() {
  return {
    name: 'statement.xlsx',
    prepared_candidate: {
      type: 'bank_statement',
      recognized: true,
      status: 'READY_FOR_REVIEW',
      statement: {
        statement_start_date: '2026-09-01',
        statement_end_date: '2026-09-30',
        closing_balance: 25000,
        currency_code: 'THB',
        lines: [{ transaction_date:'2026-09-08', amount:25000, direction:'IN' }],
      },
      bank_account: { bank_name:'Kasikorn Bank', account_number_last4:'1234' },
      import_payload: {
        entity_id:'entity-1', bank_account_id:'bank-1', statement_number:'SEP-2026',
        statement_start_date:'2026-09-01', statement_end_date:'2026-09-30',
        opening_balance:0, closing_balance:25000, currency_code:'THB',
        lines:[{ transaction_date:'2026-09-08', amount:25000, direction:'IN' }],
      },
      authorization_effect: 'NONE',
    },
  };
}

test('ready bank statement stages exact governed import without model reasoning', () => {
  const attachments = [readyFile()];
  assert.equal(hasPreparedAttachmentReflexCandidate(attachments), true);
  const result = resolvePreparedAttachmentReflex({
    message:'Import this bank statement', entityId:'entity-1', attachments, capabilities:[capability],
  });
  assert.equal(result.intent, 'execute');
  assert.equal(result.execution.capability_key, 'finance.bank_statements.create');
  assert.equal(result.execution.payload.bank_account_id, 'bank-1');
  assert.match(result.response_text, /requires your confirmation/i);
});

test('classification question never stages a write', () => {
  const result = resolvePreparedAttachmentReflex({
    message:'What is this?', entityId:'entity-1', attachments:[readyFile()], capabilities:[capability],
  });
  assert.equal(result.intent, 'answer');
  assert.equal(result.execution.capability_key, null);
  assert.match(result.response_text, /have not imported it/i);
});

test('missing entity asks before account matching or import', () => {
  const file = readyFile();
  file.prepared_candidate.status = 'CLARIFICATION_REQUIRED';
  file.prepared_candidate.clarification_question = 'Which legal entity should I use for this bank statement?';
  file.prepared_candidate.import_payload = null;
  const result = resolvePreparedAttachmentReflex({
    message:'Process this', entityId:null, attachments:[file], capabilities:[capability],
  });
  assert.equal(result.intent, 'clarify');
  assert.equal(result.clarification.required, true);
  assert.equal(result.execution.capability_key, null);
});

test('multiple statement candidates do not trigger deterministic single-document reflex', () => {
  assert.equal(hasPreparedAttachmentReflexCandidate([readyFile(), readyFile()]), false);
});

test('synthetic runtime skips owned cognitive brief for prepared attachment reflex', () => {
  const synthetic = readFileSync('lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js', 'utf8');
  assert.match(synthetic, /hasPreparedAttachmentReflexCandidate/);
  assert.match(synthetic, /preparedAttachmentReflex \? null : await ownedCognitiveBrief/);
});

test('bank statement preparation requires entity before scoped account query', () => {
  const preparation = readFileSync('lib/finance/bank-statements/BankStatementAttachmentPreparationRuntime.js', 'utf8');
  const guard = preparation.indexOf('if (!text(entityId, 160))');
  const query = preparation.indexOf('scopedBankAccounts({ organizationId, entityId })', guard);
  assert.ok(guard >= 0 && query > guard);
  assert.match(preparation, /Which legal entity should I use for this bank statement\?/);
});

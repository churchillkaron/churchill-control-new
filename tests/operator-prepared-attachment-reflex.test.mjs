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

test('unique existing business match blocks accidental duplicate creation', () => {
  const file = readyFile();
  file.business_match = {
    status:'UNIQUE_MATCH',
    candidates:[{ record_type:'customer_invoice', record_id:'invoice-1', label:'INV-26090001' }],
    match_basis:['invoice_number','entity_id'],
    authorization_effect:'NONE',
  };
  assert.equal(hasPreparedAttachmentReflexCandidate([file], 'Import this'), true);
  const result = resolvePreparedAttachmentReflex({
    message:'Import this', entityId:'entity-1', attachments:[file], capabilities:[capability],
  });
  assert.equal(result.intent, 'answer');
  assert.equal(result.execution.capability_key, null);
  assert.match(result.response_text, /already in Avantiqo/i);
  assert.match(result.response_text, /not created a duplicate/i);
});

test('ambiguous existing business match asks before any prepared write', () => {
  const file = readyFile();
  file.business_match = {
    status:'AMBIGUOUS_MATCH',
    candidates:[{record_id:'a'},{record_id:'b'}],
    clarification_required:true,
    clarification_question:'Which existing record should I use?',
    authorization_effect:'NONE',
  };
  const result = resolvePreparedAttachmentReflex({
    message:'Import this', entityId:'entity-1', attachments:[file], capabilities:[capability],
  });
  assert.equal(result.intent, 'clarify');
  assert.equal(result.execution.capability_key, null);
  assert.equal(result.clarification.question, 'Which existing record should I use?');
});

test('single understood document stages canonical controlled-document create', () => {
  const file = {
    id:'file_1', attachment_set_id:'11111111-1111-1111-1111-111111111111', name:'agreement.pdf', logical_object_count:1,
    analysis:{ status:'ANALYZED', evidence:{ object_type:'document', document_type:'service agreement', candidate_domains:['Documents'], key_fields:{ document_number:'AGR-22' } } },
    business_match:{ status:'NO_MATCH', candidates:[], authorization_effect:'NONE' },
    prepared_candidate:{ type:'universal_destination', status:'DESTINATION_RESOLVED', destination:{ domain:'Documents', domain_id:'documents', route:'/documents/contracts', label:'Contracts' }, evidence_classification:{ object_type:'document', document_type:'service agreement', confidence:0.96 }, authorization_effect:'NONE' },
  };
  const result = resolvePreparedAttachmentReflex({
    message:'File this in the correct place', attachments:[file], capabilities:[{ key:'documents.files.create', mode:'write', requires_confirmation:true }],
  });
  assert.equal(result.intent, 'execute');
  assert.equal(result.execution.capability_key, 'documents.files.create');
  assert.equal(result.execution.payload.attachment_set_id, file.attachment_set_id);
  assert.equal(result.execution.payload.file_id, 'file_1');
  assert.equal(result.execution.payload.document_number, 'AGR-22');
  assert.match(result.response_text, /requires your confirmation/i);
});

test('document create never passes a signed URL and multi-object source is not auto-filed whole', () => {
  const source = readFileSync('lib/operator/runtime/OperatorPreparedAttachmentReflex.js','utf8');
  assert.doesNotMatch(source, /payload:\s*\{[^}]*url:/s);
  assert.match(source, /logical_object_count/);
  const file = {
    id:'file_1', attachment_set_id:'set-1', name:'pack.pdf', logical_object_count:2,
    analysis:{ status:'ANALYZED', evidence:{ object_type:'document', document_type:'contract', candidate_domains:['Documents'] } },
    prepared_candidate:{ type:'universal_destination', status:'DESTINATION_RESOLVED', destination:{domain:'Documents',domain_id:'documents',route:'/documents/contracts',label:'Contracts'}, evidence_classification:{object_type:'document',document_type:'contract'} },
  };
  const result = resolvePreparedAttachmentReflex({ message:'File this', attachments:[file], capabilities:[{key:'documents.files.create'}] });
  assert.equal(result.execution.capability_key, null);
});

test('supporting evidence can be filed against one strong existing record without duplicating it', () => {
  const file = {
    id:'file_1', attachment_set_id:'11111111-1111-1111-1111-111111111111', name:'training-cert.pdf', logical_object_count:1,
    analysis:{ status:'ANALYZED', evidence:{ object_type:'certificate', document_type:'training_certificate', candidate_domains:['People','Documents'], key_fields:{ employee_email:'worker@example.com' } } },
    business_match:{ status:'UNIQUE_MATCH', candidates:[{record_type:'employee',record_id:'staff-1',label:'Worker',match_basis:['employee_email','organization_membership']}], authorization_effect:'NONE' },
    prepared_candidate:{ type:'universal_destination', status:'CLARIFICATION_REQUIRED', destination:null, authorization_effect:'NONE' },
  };
  const result = resolvePreparedAttachmentReflex({ message:'Attach this certificate to the employee', attachments:[file], capabilities:[{key:'documents.files.create'}] });
  assert.equal(result.intent, 'execute');
  assert.equal(result.execution.capability_key, 'documents.files.create');
  assert.equal(result.execution.payload.reference_type, 'employee');
  assert.equal(result.execution.payload.reference_id, 'staff-1');
  assert.match(result.response_text, /linked to that existing record/i);
});

test('exact controlled-document or exact-file duplicate is never filed again', () => {
  const base = {
    id:'file_1', attachment_set_id:'11111111-1111-1111-1111-111111111111', name:'same.pdf', logical_object_count:1,
    analysis:{ status:'ANALYZED', evidence:{ object_type:'document', candidate_domains:['Documents'] } },
    prepared_candidate:{ type:'universal_destination', status:'DESTINATION_RESOLVED', destination:{domain:'Documents',domain_id:'documents',route:'/documents',label:'Documents'} },
  };
  for (const file of [
    {...base, business_match:{status:'UNIQUE_MATCH',candidates:[{record_type:'enterprise_document',record_id:'doc-1',label:'DOC-1'}]}},
    {...base, exact_duplicate:{exact_bytes:true}, business_match:{status:'UNIQUE_MATCH',candidates:[{record_type:'project',record_id:'p-1',label:'P-1'}]}},
  ]) {
    const result = resolvePreparedAttachmentReflex({ message:'File this', attachments:[file], capabilities:[{key:'documents.files.create'}] });
    assert.equal(result.execution.capability_key, null);
    assert.match(result.response_text, /have not created a duplicate record/i);
  }
});

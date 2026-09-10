import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasPreparedAttachmentReflexCandidate,
  resolvePreparedAttachmentReflex,
} from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

const supplierCapability = { key:'supply-chain.suppliers.create', mode:'write', requires_confirmation:true, auto_execute:false };

function readySupplier() {
  return {
    name:'supplier-onboarding.pdf', sha256:'abc123', attachment_set_id:'set-1', id:'file-1',
    prepared_candidate:{ type:'supplier', recognized:true, status:'READY_FOR_REVIEW',
      supplier:{ legal_name:'ABC Supply Co., Ltd.', vendor_code:'SUP-001', tax_id:'1234567890123', email:'ap@example.com' },
      import_payload:{ legal_name:'ABC Supply Co., Ltd.', display_name:'ABC Supply', vendor_code:'SUP-001', tax_id:'1234567890123', email:'ap@example.com', source_attachment_sha256:'abc123' },
      authorization_effect:'NONE' },
  };
}

test('explicit supplier onboarding stages atomic governed supplier create', () => {
  const attachments=[readySupplier()];
  assert.equal(hasPreparedAttachmentReflexCandidate(attachments,'Create this supplier'),true);
  const result=resolvePreparedAttachmentReflex({ message:'Create this supplier', attachments, capabilities:[supplierCapability] });
  assert.equal(result.intent,'execute');
  assert.equal(result.execution.capability_key,'supply-chain.suppliers.create');
  assert.equal(result.execution.payload.vendor_code,'SUP-001');
  assert.match(result.response_text,/requires your confirmation/i);
});
test('supplier identity clarification never stages a write', () => {
  const file=readySupplier();
  file.prepared_candidate.status='CLARIFICATION_REQUIRED';
  file.prepared_candidate.clarification_question='What supplier code, tax ID, or email should I use to identify this supplier uniquely?';
  file.prepared_candidate.import_payload=null;
  const result=resolvePreparedAttachmentReflex({ message:'Create this supplier', attachments:[file], capabilities:[supplierCapability] });
  assert.equal(result.intent,'clarify');
  assert.equal(result.execution.capability_key,null);
});

test('existing supplier is not recreated and can be filed as evidence', () => {
  const file=readySupplier();
  file.prepared_candidate.status='EXISTING_RECORD';
  file.prepared_candidate.existing_record={ record_type:'supplier', record_id:'party-1', label:'ABC Supply Co., Ltd.' };
  const documentCapability={ key:'documents.files.create' };
  const result=resolvePreparedAttachmentReflex({ message:'File this supplier document', attachments:[file], capabilities:[supplierCapability,documentCapability] });
  assert.equal(result.intent,'execute');
  assert.equal(result.execution.capability_key,'documents.files.create');
  assert.equal(result.execution.payload.reference_id,'party-1');
});

test('supplier capability requires procurement manage and a strong identifier', () => {
  const capability=readFileSync('lib/inventory/procurement/suppliers/SupplierOperatorCapability.js','utf8');
  assert.match(capability,/procurement\.manage/);
  assert.match(capability,/Strong supplier identifier required/);
  assert.match(capability,/operatorRequiresConfirmation: true/);
});
test('supplier service is atomic and reuses an exact existing party without mutating identity', () => {
  const migration=readFileSync('supabase/migrations/20260910152000_procurement_supplier_atomic_create.sql','utf8');
  const service=readFileSync('lib/inventory/procurement/suppliers/documents/createVendor.js','utf8');
  assert.match(migration,/procurement_create_supplier_atomic/);
  assert.match(migration,/SUPPLIER_IDENTITY_CONFLICT/);
  assert.match(migration,/insert into public\.party_relationships/);
  assert.match(migration,/insert into public\.supplier_profiles/);
  assert.doesNotMatch(service,/\.from\("parties"\)\.insert/);
  assert.match(service,/\.rpc\("procurement_create_supplier_atomic"/);
});

test('direct supplier API enforces the same procurement permission', () => {
  const api=readFileSync('app/api/procurement/vendors/route.js','utf8');
  assert.match(api,/permissionKey: "procurement\.manage"/);
  assert.match(api,/request: req/);
});

test('supplier routing resolves canonical Supply Chain Suppliers workspace', () => {
  const router=readFileSync('lib/platform/runtime/UniversalAttachmentRoutingRuntime.js','utf8');
  assert.match(router,/itemId: "suppliers"/);
  assert.doesNotMatch(router,/supplier name.*match/i);
});

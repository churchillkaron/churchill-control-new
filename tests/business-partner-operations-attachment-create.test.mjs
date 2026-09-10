import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolvePreparedAttachmentReflex } from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

function operationsFile(fields = {}) {
  return {
    id:'f-op', attachment_set_id:'s-op', name:'service-report.pdf', mime_type:'application/pdf', sha256:'ops123', logical_object_count:1,
    analysis:{ status:'ANALYZED', evidence:{ object_type:'maintenance_report', document_type:'service_report', candidate_domains:['Operations'], key_fields:{ work_order_code:'WO-100', work_name:'Replace pump seal', description:'Seal leaking during inspection', priority:'high', ...fields } } },
    prepared_candidate:{ type:'universal_destination', status:'DESTINATION_RESOLVED', destination:{ domain_id:'operations', route:'/operations', label:'Operations' }, evidence_classification:{ object_type:'maintenance_report', document_type:'service_report' } },
    business_match:{ status:'NO_MATCH', candidates:[] },
  };
}

const capabilities = [
  { key:'operations.work_orders.create' },
  { key:'documents.files.create' },
];

test('explicit new maintenance intent stages canonical Operations work order', () => {
  const result = resolvePreparedAttachmentReflex({ message:'create a maintenance work order from this', entityId:'entity-1', attachments:[operationsFile()], capabilities });
  assert.equal(result.execution.capability_key, 'operations.work_orders.create');
  assert.equal(result.execution.payload.name, 'Replace pump seal');
  assert.equal(result.execution.payload.code, 'WO-100');
  assert.equal(result.execution.payload.priority, 'high');
  assert.match(result.response_text, /requires your confirmation/i);
  assert.match(result.response_text, /does not create an asset or Finance transaction/i);
});

test('filing a service report creates controlled evidence only', () => {
  const result = resolvePreparedAttachmentReflex({ message:'file this service report', entityId:'entity-1', attachments:[operationsFile()], capabilities });
  assert.equal(result.execution.capability_key, 'documents.files.create');
  assert.match(result.response_text, /does not create new operational work/i);
});

test('new work creation asks for scope instead of guessing', () => {
  const file = operationsFile({ work_name:'', title:'' });
  file.analysis.evidence.key_fields.work_name='';
  file.analysis.evidence.title='';
  file.analysis.evidence.summary='';
  const result = resolvePreparedAttachmentReflex({ message:'open a maintenance work order from this', entityId:'entity-1', attachments:[file], capabilities });
  assert.equal(result.intent, 'clarify');
  assert.match(result.response_text, /work-order name or scope/i);
});

test('Operations attachment matcher uses exact work-order references only', () => {
  const matcher = readFileSync('lib/platform/runtime/UniversalAttachmentBusinessMatchRuntime.js','utf8');
  assert.match(matcher, /matchOperationsWorkOrder/);
  assert.match(matcher, /capability_id\", \"work-orders/);
  assert.match(matcher, /\.eq\(\"code\", code\)/);
  assert.doesNotMatch(matcher, /levenshtein|similarity/);
});

test('Operations create remains owned by existing canonical runtime', () => {
  const domain = readFileSync('lib/operations/OperationsDomainRuntime.js','utf8');
  const catalog = readFileSync('lib/operations/runtime/OperationsCapabilityCatalog.js','utf8');
  const reflex = readFileSync('lib/operator/runtime/OperatorPreparedAttachmentReflex.js','utf8');
  assert.match(domain, /createOperationsCommandCapability/);
  assert.match(catalog, /\[\"work-orders\", \"Work Orders\"/);
  assert.match(reflex, /operations\.work_orders\.create/);
  assert.doesNotMatch(reflex, /\.from\(\"operations_records\"\).*insert/s);
});

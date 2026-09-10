import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { attachmentLogicalObjects } from '../lib/platform/runtime/ConversationAttachmentObjectRuntime.js';

function multiFile() {
  return {
    id:'file_1', name:'pack.pdf', sha256:'abc', mime_type:'application/pdf',
    analysis:{ status:'ANALYZED', analysis_version:'V3', confidence:0.93,
      evidence:{ objects:[
        { object_id:'invoice_1', object_type:'invoice', document_type:'customer_invoice', confidence:0.98, candidate_domains:['Finance'], evidence_span:{pages:[1,2]}, invoice_number:'INV-1' },
        { object_id:'certificate_1', object_type:'certificate', document_type:'training_certificate', confidence:0.96, candidate_domains:['People','Documents'], evidence_span:{pages:[3]} },
      ]}, authorization_effect:'NONE' },
  };
}

test('one physical upload expands into independently scoped logical objects', () => {
  const objects = attachmentLogicalObjects(multiFile());
  assert.equal(objects.length, 2);
  assert.equal(objects[0].logical_object_id, 'invoice_1');
  assert.deepEqual(objects[0].evidence_span.pages, [1,2]);
  assert.equal(objects[0].analysis.evidence.invoice_number, 'INV-1');
  assert.deepEqual(objects[1].analysis.candidate_domains, ['People','Documents']);
  assert.equal(objects.every(item => item.sha256 === 'abc'), true);
  assert.equal(objects.every(item => item.analysis.authorization_effect === 'NONE'), true);
});

test('legacy single-object analysis remains compatible', () => {
  const file = { name:'one.pdf', analysis:{ status:'ANALYZED', evidence:{ object_type:'contract', candidate_domains:['Documents'] } } };
  const objects = attachmentLogicalObjects(file);
  assert.equal(objects.length, 1);
  assert.equal(objects[0].logical_object_id, 'object_1');
  assert.equal(objects[0].analysis.evidence.object_type, 'contract');
});

test('turn expands logical objects before business matching and preparation', () => {
  const route = readFileSync('app/api/operator/turn/route.js','utf8');
  const expand = route.indexOf('attachmentLogicalObjects(file)');
  const match = route.indexOf('matchAnalyzedAttachmentToBusiness', expand);
  const prepare = route.indexOf('prepareBankStatementAttachment', match);
  assert.ok(expand >= 0 && match > expand && prepare > match);
});

test('Operator context preserves logical object identity and evidence span', () => {
  const runtime = readFileSync('lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js','utf8');
  assert.match(runtime, /logical_object_id=/);
  assert.match(runtime, /evidence_span=/);
});

test('analysis V3 requires objects array and distinct-object splitting', () => {
  const analysis = readFileSync('lib/platform/runtime/ConversationAttachmentAnalysisRuntime.js','utf8');
  const contract = readFileSync('lib/platform/runtime/ConversationAttachmentAnalysisContract.js','utf8');
  assert.match(contract, /ATTACHMENT_ANALYSIS_V3/);
  assert.match(analysis, /objects array/);
  assert.match(analysis, /Split distinct business objects instead of merging them/);
  assert.match(analysis, /evidence_span/);
});

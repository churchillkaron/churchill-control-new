import assert from 'node:assert/strict';
import test from 'node:test';
import { routeAnalyzedAttachment } from '../lib/platform/runtime/UniversalAttachmentRoutingRuntime.js';
import { resolvePreparedAttachmentReflex } from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

function analyzed(evidence) {
  return {
    name:'upload.bin',
    analysis:{
      status:'ANALYZED',
      confidence:evidence.confidence ?? 0.95,
      candidate_domains:evidence.candidate_domains || [],
      evidence,
      clarification_required:evidence.clarification_required === true,
      clarification_question:evidence.clarification_question || null,
    },
  };
}

test('equipment evidence routes to Compliance Assets Equipment without creating a record', () => {
  const file = analyzed({
    object_type:'equipment', confidence:0.98,
    candidate_domains:['Operations','Compliance'],
    asset_details:{ asset_type:'equipment', category:'machine' },
  });
  const routed = routeAnalyzedAttachment(file);
  assert.equal(routed.status, 'DESTINATION_RESOLVED');
  assert.equal(routed.destination.route, '/compliance/assets/equipment');
  assert.equal(routed.authorization_effect, 'NONE');

  const response = resolvePreparedAttachmentReflex({
    message:'Put this in the correct place',
    attachments:[{...file, prepared_candidate:routed}],
  });
  assert.equal(response.intent, 'answer');
  assert.equal(response.execution.capability_key, null);
  assert.match(response.response_text, /Equipment/);
  assert.match(response.response_text, /have not written anything/);
});

test('contract evidence routes to Documents Contracts', () => {
  const routed = routeAnalyzedAttachment(analyzed({
    object_type:'document', document_type:'service agreement',
    candidate_domains:['Documents','Commercial'], confidence:0.96,
  }));
  assert.equal(routed.destination.route, '/documents/contracts');
  assert.equal(routed.authorization_effect, 'NONE');
});

test('single domain evidence resolves a domain destination', () => {
  const routed = routeAnalyzedAttachment(analyzed({
    object_type:'marketing_image', document_type:'campaign creative',
    candidate_domains:['Creative'], confidence:0.94,
  }));
  assert.equal(routed.destination.domain, 'Creative');
  assert.equal(routed.destination.route, '/commercial/marketing/assets');
});

test('ambiguous non-specialized domains require clarification', () => {
  const routed = routeAnalyzedAttachment(analyzed({
    object_type:'report', document_type:'status report',
    candidate_domains:['Projects','Operations'], confidence:0.74,
  }));
  assert.equal(routed.status, 'CLARIFICATION_REQUIRED');
  assert.equal(routed.destination, null);
  assert.match(routed.clarification_question, /Projects or Operations/);
});

test('vision-requested clarification is preserved', () => {
  const routed = routeAnalyzedAttachment(analyzed({
    object_type:'document', candidate_domains:['People'],
    clarification_required:true,
    clarification_question:'Is this an employee record or a contractor document?',
  }));
  assert.equal(routed.status, 'CLARIFICATION_REQUIRED');
  assert.equal(routed.clarification_question, 'Is this an employee record or a contractor document?');
});

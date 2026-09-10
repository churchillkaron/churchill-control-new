import assert from 'node:assert/strict';
import test from 'node:test';
import { routeAnalyzedAttachment } from '../lib/platform/runtime/UniversalAttachmentRoutingRuntime.js';
import { resolvePreparedAttachmentReflex } from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

const registry = {
  domains: [
    { id:'finance', name:'Finance', route:'/finance' },
    { id:'supply-chain', name:'Supply Chain', route:'/supply-chain' },
    { id:'people', name:'People', route:'/people' },
    { id:'projects', name:'Projects', route:'/projects' },
    { id:'operations', name:'Operations', route:'/operations' },
    { id:'commercial', name:'Commercial', route:'/commercial' },
    { id:'documents', name:'Documents', route:'/documents' },
    { id:'creative', name:'Creative', route:'/creative' },
    { id:'administration', name:'Administration', route:'/settings' },
    { id:'compliance', name:'Compliance', route:'/compliance' },
  ],
  workspaces: {
    compliance: { title:'Compliance', groups:[{ id:'assets', name:'Assets', items:[
      {id:'vehicles',name:'Vehicles',route:'/compliance/assets/vehicles'},
      {id:'equipment',name:'Equipment',route:'/compliance/assets/equipment'},
      {id:'properties',name:'Properties',route:'/compliance/assets/properties'},
      {id:'digital_assets',name:'Digital Assets',route:'/compliance/assets/digital-assets'},
    ]}]},
    documents: { title:'Documents', groups:[{ id:'document_management', name:'Document Management', items:[
      {id:'contracts',name:'Contracts',route:'/documents/contracts'},
    ]}]},
    creative: { title:'Creative', groups:[] },
  },
};

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
  const routed = routeAnalyzedAttachment(file, { registry });
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
  }), { registry });
  assert.equal(routed.destination.route, '/documents/contracts');
  assert.equal(routed.authorization_effect, 'NONE');
});

test('single domain evidence resolves a domain destination', () => {
  const routed = routeAnalyzedAttachment(analyzed({
    object_type:'marketing_image', document_type:'campaign creative',
    candidate_domains:['Creative'], confidence:0.94,
  }), { registry });
  assert.equal(routed.destination.domain, 'Creative');
  assert.equal(routed.destination.route, '/creative');
});

test('ambiguous non-specialized domains require clarification', () => {
  const routed = routeAnalyzedAttachment(analyzed({
    object_type:'report', document_type:'status report',
    candidate_domains:['Projects','Operations'], confidence:0.74,
  }), { registry });
  assert.equal(routed.status, 'CLARIFICATION_REQUIRED');
  assert.equal(routed.destination, null);
  assert.match(routed.clarification_question, /Projects or Operations/);
});

test('vision-requested clarification is preserved', () => {
  const routed = routeAnalyzedAttachment(analyzed({
    object_type:'document', candidate_domains:['People'],
    clarification_required:true,
    clarification_question:'Is this an employee record or a contractor document?',
  }), { registry });
  assert.equal(routed.status, 'CLARIFICATION_REQUIRED');
  assert.equal(routed.clarification_question, 'Is this an employee record or a contractor document?');
});


test('router fails closed when canonical registry has no destination', () => {
  const routed = routeAnalyzedAttachment(analyzed({ object_type:'report', candidate_domains:['Finance'] }), { registry:{ domains:[], workspaces:{} } });
  assert.equal(routed.status, 'CLARIFICATION_REQUIRED');
  assert.equal(routed.destination, null);
});

test('employee or training certificate is not misrouted as a digital asset', () => {
  const routed = routeAnalyzedAttachment(analyzed({
    object_type:'certificate', document_type:'training certificate',
    candidate_domains:['People','Documents'], confidence:0.97,
  }), { registry });
  assert.equal(routed.status, 'CLARIFICATION_REQUIRED');
  assert.equal(routed.destination, null);
  assert.doesNotMatch(routed.clarification_question, /Digital Assets/);
});

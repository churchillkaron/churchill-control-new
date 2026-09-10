import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolvePreparedAttachmentReflex } from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

function customerFile(fields = {}) {
  return {
    id:'f-c', attachment_set_id:'s-c', name:'customer-onboarding.pdf', mime_type:'application/pdf', sha256:'cust123', logical_object_count:1,
    analysis:{ status:'ANALYZED', evidence:{ object_type:'customer_profile', document_type:'customer_onboarding_form', candidate_domains:['Commercial','Documents'], key_fields:{ customer_name:'Acme Co.', customer_number:'C-100', tax_id:'TX-999', email:'hello@example.test', phone:'+66000000000', ...fields } } },
    prepared_candidate:{ type:'universal_destination', status:'DESTINATION_RESOLVED', destination:{ domain_id:'commercial', group_id:'customer_management', item_id:'customers', route:'/commercial/customers', label:'Customers' }, evidence_classification:{ object_type:'customer_profile' } },
    business_match:{ status:'NO_MATCH', candidates:[] },
  };
}

const capabilities = [{key:'commercial.customers.create'},{key:'documents.files.create'}];

test('explicit customer create intent stages canonical Commercial customer capability', () => {
  const result = resolvePreparedAttachmentReflex({ message:'create this customer', entityId:'entity-1', attachments:[customerFile()], capabilities });
  assert.equal(result.execution.capability_key,'commercial.customers.create');
  assert.equal(result.execution.payload.customer_name,'Acme Co.');
  assert.equal(result.execution.payload.customer_number,'C-100');
  assert.equal(result.execution.payload.tax_id,'TX-999');
  assert.match(result.response_text,/Existing customers are never updated/i);
});

test('filing customer material creates evidence only', () => {
  const result = resolvePreparedAttachmentReflex({ message:'file this customer document', entityId:'entity-1', attachments:[customerFile()], capabilities });
  assert.equal(result.execution.capability_key,'documents.files.create');
  assert.match(result.response_text,/does not create or update a customer/i);
});

test('customer creation asks for missing customer name', () => {
  const file=customerFile({customer_name:''});
  file.analysis.evidence.key_fields.customer_name='';
  const result=resolvePreparedAttachmentReflex({message:'add this customer',entityId:'entity-1',attachments:[file],capabilities});
  assert.equal(result.intent,'clarify');
  assert.match(result.response_text,/customer or company name/i);
});

test('Commercial runtime exposes create-only customer Operator capability', () => {
  const runtime=readFileSync('lib/commercial/runtime/CommercialRuntime.js','utf8');
  const capability=readFileSync('lib/commercial/customers/capabilities/createCustomer.js','utf8');
  assert.match(runtime,/customers:[\s\S]*create:/);
  assert.match(capability,/upsertCustomerParty/);
  assert.match(capability,/action: "create"/);
  assert.doesNotMatch(capability,/party_id:/);
});

test('customer matcher uses only exact customer identifiers and relationship proof', () => {
  const matcher=readFileSync('lib/platform/runtime/UniversalAttachmentBusinessMatchRuntime.js','utf8');
  assert.match(matcher,/matchCustomerParty/);
  assert.match(matcher,/customer_number/);
  assert.match(matcher,/tax_id/);
  assert.match(matcher,/customer_email/);
  assert.match(matcher,/relationship_type\", \"customer/);
  assert.doesNotMatch(matcher,/levenshtein|similarity|\.ilike/);
});

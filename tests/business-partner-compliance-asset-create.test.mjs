import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolvePreparedAttachmentReflex } from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

function equipmentFile(fields = {}) {
  return {
    id:'f1', attachment_set_id:'s1', name:'machine.pdf', mime_type:'application/pdf', sha256:'abc123', logical_object_count:1,
    analysis:{ status:'ANALYZED', evidence:{ object_type:'equipment', document_type:'equipment_record', candidate_domains:['Compliance'], key_fields:{ asset_code:'EQ-100', asset_name:'Compressor', manufacturer:'Atlas', model:'X1', serial_number:'SER-99', ...fields }, asset_details:{} } },
    prepared_candidate:{ type:'universal_destination', status:'DESTINATION_RESOLVED', destination:{ domain_id:'compliance', group_id:'assets', item_id:'equipment', route:'/compliance/assets/equipment', label:'Equipment' }, evidence_classification:{ object_type:'equipment' } },
    business_match:{ status:'NO_MATCH', candidates:[] },
  };
}

const capabilities = [
  { key:'compliance.assets.create' },
  { key:'documents.files.create' },
];

test('explicit register intent stages Compliance asset create without Finance mutation', () => {
  const result = resolvePreparedAttachmentReflex({ message:'register this equipment as an asset', entityId:'entity-1', attachments:[equipmentFile()], capabilities });
  assert.equal(result.execution.capability_key, 'compliance.assets.create');
  assert.equal(result.execution.payload.asset_type, 'EQUIPMENT');
  assert.equal(result.execution.payload.asset_code, 'EQ-100');
  assert.equal(result.execution.payload.serial_number, 'SER-99');
  assert.match(result.response_text, /does not create or change a Finance fixed asset/i);
});

test('filing equipment evidence does not create an asset', () => {
  const result = resolvePreparedAttachmentReflex({ message:'file this equipment document', entityId:'entity-1', attachments:[equipmentFile()], capabilities });
  assert.equal(result.execution.capability_key, 'documents.files.create');
  assert.match(result.response_text, /does not create an asset/i);
});

test('asset creation asks for missing legal entity and identity instead of guessing', () => {
  const noEntity = resolvePreparedAttachmentReflex({ message:'register this equipment as an asset', entityId:null, attachments:[equipmentFile()], capabilities });
  assert.equal(noEntity.intent, 'clarify');
  assert.match(noEntity.response_text, /legal entity/i);
  const missing = equipmentFile({ asset_code:'', asset_name:'' });
  missing.analysis.evidence.key_fields.asset_code=''; missing.analysis.evidence.key_fields.asset_name='';
  const noIdentity = resolvePreparedAttachmentReflex({ message:'register this equipment as an asset', entityId:'entity-1', attachments:[missing], capabilities });
  assert.equal(noIdentity.intent, 'clarify');
  assert.match(noIdentity.response_text, /asset code.*asset name/i);
});

test('Compliance foundation is separate from Finance fixed asset accounting', () => {
  const migration = readFileSync('supabase/migrations/20260910131000_compliance_business_assets_foundation.sql','utf8');
  const capability = readFileSync('lib/compliance/runtime/ComplianceAssetOperatorCapability.js','utf8');
  const registry = readFileSync('lib/ubte/runtime/domains/DomainRuntimeRegistry.js','utf8');
  assert.match(migration, /create table if not exists public\.compliance_assets/i);
  assert.match(migration, /finance_fixed_asset_id uuid/);
  assert.match(migration, /create_compliance_asset_atomic/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(capability, /\.from\(["']fixed_assets["']\).*insert/s);
  assert.match(capability, /finance_fixed_asset_created: false/);
  assert.match(registry, /ComplianceDomainRuntime/);
});

test('business matcher uses strong Compliance asset identifiers', () => {
  const matcher = readFileSync('lib/platform/runtime/UniversalAttachmentBusinessMatchRuntime.js','utf8');
  assert.match(matcher, /matchComplianceAsset/);
  assert.match(matcher, /serial_number/);
  assert.match(matcher, /registration_number/);
  assert.match(matcher, /reference_identifier/);
  assert.match(matcher, /compliance_asset/);
});

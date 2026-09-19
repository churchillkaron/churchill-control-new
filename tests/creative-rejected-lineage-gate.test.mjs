import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('concept council blocks rejected creative families after blind invention', () => {
  const source = fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');
  assert.match(source, /REJECTED_CREATIVE_FAMILIES/);
  assert.match(source, /PROPAGATING_SIGNAL_OR_CONNECTIVE_PROXY/);
  assert.match(source, /SAAS_RELIEF_OR_CHAOS_TO_HARMONY/);
  assert.match(source, /rejectedLineageCollision/);
  assert.match(source, /FRESH-LINEAGE REPAIR/);
  assert.match(source, /LINEAGE_RETRY_/);
});

test('blind directors still do not receive rejected lineage vocabulary', () => {
  const source = fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');
  assert.match(source, /positiveMissionContract\(input, \{ includeAvoidances: false \}\)/);
  assert.match(source, /rejectedCreativeLineage: list\(project\.metadata\?\.rejected_direction_history\)/);
});

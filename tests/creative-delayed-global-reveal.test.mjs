import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');

test('opening keeps Avantiqo unexplained until act two or later', () => {
  assert.match(source, /audience_visible_beats/);
  assert.match(source, /ACT_2_OR_LATER/);
  assert.match(source, /INDEPENDENT_CONCEPT_REVEAL_TOO_EARLY/);
  assert.match(source, /\\bavantiqo\\b/);
});

test('global reach uses independent organization worlds with sovereign context', () => {
  assert.match(source, /business_worlds/);
  assert.match(source, /organization_sovereignty/);
  assert.match(source, /shared_architecture_not_shared_context/);
});

test('capability horizon covers the full canonical domain set through human clusters', () => {
  assert.match(source, /system_scope_clusters/);
  assert.match(source, /missingRegistryDomains/);
  assert.match(source, /clusters\.length < 4/);
});

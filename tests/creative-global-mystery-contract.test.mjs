import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');

test('master story explicitly contracts mystery before explanation', () => {
  assert.match(source, /opening_mystery/);
  assert.match(source, /unanswered_question/);
  assert.match(source, /withheld_truth/);
  assert.match(source, /sound_and_silence_logic/);
  assert.match(source, /INDEPENDENT_CONCEPT_OPENING_EXPLAINS_TOO_EARLY/);
});

test('global investor story must prove one reusable intelligence architecture across separate organizations', () => {
  assert.match(source, /global_system_arc/);
  assert.match(source, /INDEPENDENT_CONCEPT_GLOBAL_BUSINESS_WORLDS_REQUIRED/);
  assert.match(source, /INDEPENDENT_CONCEPT_GLOBAL_ARCHITECTURE_REVEAL_REQUIRED/);
});

test('global long-form story expands capability proof without becoming a feature tour', () => {
  assert.match(source, /capability_horizon/);
  assert.match(source, /minimumCapabilities = longForm && requiresGlobal \? 6/);
  assert.match(source, /minimumDomains = longForm && requiresGlobal \? 5/);
  assert.match(source, /system_scope_clusters/);
  assert.match(source, /missingRegistryDomains/);
});

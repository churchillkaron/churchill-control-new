import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');

test('global Avantiqo means independent business worlds, not one world brain', () => {
  assert.match(source, /business_worlds/);
  assert.match(source, /organization_sovereignty/);
  assert.match(source, /shared_architecture_not_shared_context/);
  assert.match(source, /INDEPENDENT_CONCEPT_ORGANIZATION_SOVEREIGNTY_REQUIRED/);
});

test('story proves Business Partner cognition and governed action', () => {
  assert.match(source, /business_partner_arc/);
  assert.match(source, /understands_context/);
  assert.match(source, /discusses_with_human/);
  assert.match(source, /authorized_action/);
  assert.match(source, /independent_verification/);
});

test('Avantiqo is shown in ordinary business life, not just crisis response', () => {
  assert.match(source, /operating_life_arc/);
  assert.match(source, /ordinary_work/);
  assert.match(source, /growth_or_opportunity/);
  assert.match(source, /creative_or_planning/);
  assert.match(source, /crisis-response cannot be the film's central definition/);
});

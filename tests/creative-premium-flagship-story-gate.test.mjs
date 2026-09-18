import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const council = fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');
const regen = fs.readFileSync('lib/creative/director/runtime/CreativeAutonomousConceptRegenerationRuntime.js','utf8');

test('selector revalidates even recovered selections against rejected lineage', () => {
  assert.match(council, /const selectedLineageCollision = rejectedLineageCollision\(selectedConcept, context\)/);
  assert.match(council, /CREATIVE_EXECUTIVE_CONCEPT_SELECTION_REJECTED_LINEAGE/);
  assert.match(regen, /CREATIVE_EXECUTIVE_CONCEPT_SELECTION_REJECTED_LINEAGE/);
});

test('premium flagship long-form rejects SaaS pain-to-relief story grammar', () => {
  assert.match(council, /function premiumFlagshipStoryCollision/);
  assert.match(council, /PREMIUM_FLAGSHIP_SAAS_RELIEF/);
  assert.match(council, /stressed\|frustrat\|overwhelm/);
  assert.match(council, /dashboard\|software\|platform\|workflow\|screen/);
  assert.match(regen, /INDEPENDENT_CONCEPT_PREMIUM_FLAGSHIP_/);
});

test('explicit brain-or-intelligence hero mission cannot silently switch protagonist', () => {
  assert.match(council, /PREMIUM_FLAGSHIP_WRONG_HERO/);
  assert.match(council, /PREMIUM_FLAGSHIP_HERO_ABSENT_FROM_OPENING/);
  assert.match(council, /brain\|intelligence\|avantiqo/);
});

test('selector also applies premium flagship structural veto after model selection', () => {
  assert.match(council, /const selectedFlagshipCollision = premiumFlagshipStoryCollision\(selectedConcept, evidence\)/);
  assert.match(council, /CREATIVE_EXECUTIVE_CONCEPT_SELECTION_FLAGSHIP_REJECTED/);
  assert.match(regen, /CREATIVE_EXECUTIVE_CONCEPT_SELECTION_FLAGSHIP_REJECTED/);
});

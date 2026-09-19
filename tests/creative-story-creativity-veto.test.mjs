import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('concept council includes a story-creativity veto before production planning', () => {
  const source = fs.readFileSync('lib/creative/director/runtime/CreativeConceptCouncilRuntime.js','utf8');
  assert.match(source, /id:\s*"story_creativity"/);
  assert.match(source, /role:\s*"STORY_CREATIVITY_AND_MYTHOLOGY_CRITIC"/);
  assert.match(source, /minimum:\s*92/);
  assert.match(source, /weight:\s*0/);
  assert.match(source, /governing world and world rules/);
  assert.match(source, /causal continuity across the full requested duration/);
  assert.match(source, /mystery-before-explanation/);
});

test('world-class concept policy requires story creativity to pass', () => {
  const source = fs.readFileSync('lib/creative/director/runtime/CreativeWorldClassConceptPolicy.js','utf8');
  assert.match(source, /story_creativity:\s*92/);
});

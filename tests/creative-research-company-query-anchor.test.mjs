import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js','utf8');
test('company market research keeps organization identity in every objective fragment query',()=>{
  assert.match(src,/\.\.\.fragments\.map\(\(fragment\) => \[identity, fragment\]/);
  assert.doesNotMatch(src,/\.\.\.fragments\.map\(\(fragment\) => \[fragment, locality\]/);
});

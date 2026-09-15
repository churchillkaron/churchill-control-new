import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js','utf8');

test('perceptual review transport does not serialize full generation task payload', () => {
  assert.doesNotMatch(source, /SOURCE GENERATION TASK/);
  assert.match(source, /SOURCE SHOT ESSENTIALS/);
  assert.doesNotMatch(source, /requirements:\s*source\.input\?\.requirements,/);
  assert.doesNotMatch(source, /generation:\s*source\.input\?\.generation,/);
  assert.doesNotMatch(source, /metadata:\s*source\.metadata,/);
});

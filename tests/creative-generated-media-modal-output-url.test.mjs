import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('perceptual review accepts canonical Modal asset and storage output fields', () => {
  const source=fs.readFileSync('lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js','utf8');
  assert.match(source,/value\.asset_url/);
  assert.match(source,/value\.storage_reference/);
});

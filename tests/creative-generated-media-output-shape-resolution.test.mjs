import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('perceptual review searches top-level and Modal nested media output shapes', () => {
  const source=fs.readFileSync('lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js','utf8');
  assert.match(source,/output,\s*\n\s*output\?\.output\?\.output/);
  assert.match(source,/output\?\.provider_poll\?\.output/);
  assert.match(source,/output\?\.provider_submission\?\.output/);
  assert.match(source,/value\.file_url/);
});

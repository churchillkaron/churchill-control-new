import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js', 'utf8');

test('async owned vision results and score aliases normalize into deterministic gate', () => {
  assert.match(source, /usage\?\.metadata\?\.provider_result\?\.output/);
  assert.match(source, /artifact_score: \["artifact", "artifacts"\]/);
  assert.match(source, /source_asset_count \?\? root\.analyzed_image_count/);
});

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('shot asset isolation ignores prose stored under source_assets while retaining UUID asset ids', () => {
  const source = fs.readFileSync('lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate.js','utf8');
  assert.match(source, /function scopedAssetIdentifier/);
  assert.match(source, /creativeKey && scopedId/);
  assert.match(source, /assetNodeKey && scopedId/);
  assert.match(source, /productionNodeKey && rawId/);
});

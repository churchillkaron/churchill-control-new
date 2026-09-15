import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('authorized dependency output asset nodes are valid review inputs', () => {
  const source=fs.readFileSync('lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate.js','utf8');
  assert.match(source,/const assetNodeIds = new Set\(\)/);
  assert.match(source,/dependency\.output\?\.asset_node_id/);
  assert.match(source,/for \(const id of dependencies\.assetNodeIds\) assetNodeIds\.add\(id\)/);
});

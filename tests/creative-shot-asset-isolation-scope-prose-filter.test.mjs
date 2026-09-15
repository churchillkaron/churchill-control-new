import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('execution scope filters prose from creative and asset-node id sets before database lookup', () => {
  const source=fs.readFileSync('lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate.js','utf8');
  assert.match(source,/scope\.creative_asset_ids\)\.map\(scopedAssetIdentifier\)\.filter\(Boolean\)/);
  assert.match(source,/scope\.asset_node_ids\)\.map\(scopedAssetIdentifier\)\.filter\(Boolean\)/);
});

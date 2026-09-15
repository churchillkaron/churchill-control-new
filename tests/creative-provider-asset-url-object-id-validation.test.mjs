import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('provider asset resolver rejects prose object asset ids before database lookup', () => {
  const source=fs.readFileSync('lib/creative/assets/storage/resolveCreativeProviderAssetUrl.js','utf8');
  assert.match(source,/const source = text\(value\.asset_id \|\| value\.assetId \|\| value\.id\)/);
  assert.match(source,/\^\[0-9a-f\]\{8\}/);
});

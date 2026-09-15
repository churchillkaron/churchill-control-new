import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('strict media scope treats signed Supabase URL and storage reference as the same scoped file', () => {
  const source=fs.readFileSync('lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate.js','utf8');
  assert.match(source,/function canonicalMediaIdentity/);
  assert.match(source,/storage:\\\/\\\//);
  assert.match(source,/allowedMediaIdentities/);
  assert.match(source,/canonicalMediaIdentity\(entry\.url\)/);
});

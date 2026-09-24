import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('tribunal output normalization can read a terminal provider result persisted on usage metadata', () => {
  assert.match(source, /result\?\.usage\?\.metadata\?\.provider_result/);
  assert.match(source, /settledProviderResult\?\.output\?\.text/);
});
test('settlement parser still prefers live provider output before persisted fallback', () => {
  const start = source.indexOf('const parsed = parseJson(');
  const end = source.indexOf(');', start);
  const parser = source.slice(start, end + 2);
  assert.ok(parser.indexOf('transport?.output?.text') < parser.indexOf('settledProviderResult?.output?.text'));
});

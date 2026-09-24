import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativePreproductionCreativeRepairRuntime.js',import.meta.url),'utf8');
test('preproduction repair parser unwraps live settlement raw output',()=>{
  assert.match(source,/const raw = object\(transport\)\.raw/);
  assert.match(source,/transport\?\.output\?\.text/);
});
test('preproduction repair parser falls back to persisted provider result',()=>{
  assert.match(source,/result\?\.usage\?\.metadata\?\.provider_result/);
  assert.match(source,/persistedProviderResult\?\.output\?\.text/);
});

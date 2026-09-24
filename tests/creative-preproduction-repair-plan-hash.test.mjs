import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativePreproductionCreativeRepairRuntime.js',import.meta.url),'utf8');
test('settled preproduction repairs require exact source plan hash',()=>{
  assert.match(source,/const sourcePlanHash = fingerprint\(plan\)/);
  assert.match(source,/usage\?\.metadata\?\.preproduction_repair_source_plan_hash\) !== sourcePlanHash/);
});
test('new preproduction repair usage persists source plan hash',()=>{
  assert.match(source,/preproduction_repair_source_plan_hash: fingerprint\(plan\)/);
});

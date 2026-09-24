import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativePreproductionCreativeRepairRuntime.js',import.meta.url),'utf8');
test('benchmark repair preserves per-reference analysis dimensions',()=>{
  assert.match(source,/const entryAnalysis = object\(entry\.analysis\)/);
  assert.match(source,/const grounded = \(dimension, value\) =>/);
  assert.match(source,/narrative: grounded\("narrative", entryAnalysis\.narrative \|\| analysis\.narrative\)/);
  assert.match(source,/production_craft: grounded\("production craft", entryAnalysis\.production_craft \|\| analysis\.production_craft\)/);
});
test('benchmark repair derives creative floor governance fields',()=>{
  assert.match(source,/repaired\.anti_cliche_rules = list\(benchmarkLab\.craft_dna\?\.anti_copy_rules\)/);
  assert.match(source,/contract: "CREATIVE_BENCHMARK_REFERENCE_STRATEGY_V1"/);
  assert.match(source,/authority: "EVIDENCE_ONLY"/);
});

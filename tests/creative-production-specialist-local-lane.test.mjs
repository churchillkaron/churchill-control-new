import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativeProductionSpecialistExecutionRuntime.js',import.meta.url),'utf8');
test('production specialists use bounded deep local execution',()=>{
  assert.match(source,/execution_lane: "deep"/);
  assert.match(source,/infrastructure_policy: "local_only"/);
  assert.match(source,/local_compute_required: true/);
  assert.match(source,/max_output_tokens: 6000/);
  assert.doesNotMatch(source,/max_output_tokens: 12000/);
});

test('production specialists receive requirement-scoped compact production context',()=>{
  assert.match(source,/function compactProductionContext\(productionContext = \{\}, workOrder = \{\}\)/);
  assert.match(source,/function compactShotForSpecialist\(shot = \{\}, requirement = 0\)/);
  assert.match(source,/production_context: compactProductionContext\(production_context, work_order\)/);
  assert.match(source,/approved_scenes: scenes/);
  assert.match(source,/source_manifest: productionContext\.approved_research\.source_manifest/);
  assert.doesNotMatch(source,/production_context: object\(production_context\)/);
});

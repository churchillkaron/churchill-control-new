import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const tribunal=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js',import.meta.url),'utf8');
test('Tribunal repair normalization never adopts control-envelope scaffolding as plan authority',()=>{
  assert.match(tribunal,/const echoedEnvelope = Boolean/);
  assert.match(tribunal,/allowedRootFields/);
  assert.match(tribunal,/never adopt task\/context\/rules scaffolding/);
  assert.match(tribunal,/repairPatchHasPlanShape\(repairPatch\)/);
  assert.match(tribunal,/CREATIVE_TRIBUNAL_REPAIR_WRONG_OUTPUT_CONTRACT/);
});
test('corrupted durable Tribunal resume is ignored and rebuilt',()=>{
  assert.match(workflow,/settled_review_source_plan/);
  assert.match(workflow,/controlKeys\.some\(\(key\) => sourcePlan\[key\] !== undefined\)/);
});

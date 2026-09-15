import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const tribunal=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js',import.meta.url),'utf8');
test('Tribunal rejects repair control envelopes masquerading as plans',()=>{
  assert.match(tribunal,/CREATIVE_TRIBUNAL_REPAIR_CONTROL_ENVELOPE_AS_PLAN/);
  assert.match(tribunal,/forbiddenControlKeys/);
  assert.match(tribunal,/const candidate = mergeCreativeRepairedPlan\(plan, normalizedRepairPatch\(output, plan\)\)/);
});
test('corrupted durable Tribunal resume is ignored and rebuilt',()=>{
  assert.match(workflow,/settled_review_source_plan/);
  assert.match(workflow,/controlKeys\.some\(\(key\) => sourcePlan\[key\] !== undefined\)/);
});

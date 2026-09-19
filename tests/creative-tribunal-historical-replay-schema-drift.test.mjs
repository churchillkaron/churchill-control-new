import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tribunal=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
const recovery=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js',import.meta.url),'utf8');

test('historical Tribunal replay tolerates only pre-existing schema validation debt',()=>{
  assert.match(tribunal,/historical_replay = false/);
  assert.match(tribunal,/const existingDebt = new Set\(failureKeys\(plan\)\)/);
  assert.match(tribunal,/CREATIVE_TRIBUNAL_REPAIR_NEW_VALIDATION_FAILURES/);
  assert.match(recovery,/historical_replay: true/);
});

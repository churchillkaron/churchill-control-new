import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativeProductionSpecialistExecutionRuntime.js',import.meta.url),'utf8');
test('material physics specialist accepts known cloth hair dynamics alias',()=>{
  assert.match(source,/Number\(workOrder\?\.requirement\) === 8/);
  assert.match(source,/normalized\.cloth_hair_behavior = normalized\.cloth_hair_dynamics_behavior/);
});

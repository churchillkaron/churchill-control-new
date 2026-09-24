import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativeProductionSpecialistExecutionRuntime.js',import.meta.url),'utf8');
test('production specialists use bounded deep local execution',()=>{
  assert.match(source,/execution_lane: "deep"/);
  assert.match(source,/max_output_tokens: 6000/);
  assert.doesNotMatch(source,/max_output_tokens: 12000/);
});

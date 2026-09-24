import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativeProductionSpecialistExecutionRuntime.js',import.meta.url),'utf8');
test('production specialist parser reads terminal usage result text',()=>{
  assert.match(source,/result\?\.usage\?\.metadata\?\.result/);
  assert.match(source,/persistedResult\?\.output\?\.text/);
});

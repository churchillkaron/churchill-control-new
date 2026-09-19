import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js',import.meta.url),'utf8');
test('Tribunal recovery reads fresh durable project ledger',()=>{
  assert.match(source,/const liveProject = await CreativeProjectRuntime\.get\(context\.creative_project_id\)/);
  assert.match(source,/liveProject\?\.metadata\?\.paid_tribunal_approval \|\| project\?\.metadata\?\.paid_tribunal_approval/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativeProductionRoomBootstrapRuntime.js',import.meta.url),'utf8');
test('technical scout reuses sealed research scouting evidence',()=>{
  assert.match(source,/TECHNICAL_SCOUT: \{/);
  assert.match(source,/supplied_workstream_reports: researchReport\?\.workstream_report\?\.passed === true/);
});

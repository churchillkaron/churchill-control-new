import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativeProductionRoomBootstrapRuntime.js',import.meta.url),'utf8');
test('durable stage reports merge with trusted supplied reports by requirement',()=>{
  assert.match(source,/const durableReports = list\(durable_state\?\.reports_by_stage\?\.\[stage\.id\]\)/);
  assert.match(source,/const suppliedReports = list\(generatedReports\[stage\.id\]\)/);
  assert.match(source,/merged\.set\(requirement, report\)/);
});

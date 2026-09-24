import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const bootstrap=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativeProductionRoomBootstrapRuntime.js',import.meta.url),'utf8');
const front=fs.readFileSync(new URL('../lib/creative/production-room/runtime/CreativeFrontProductionRoomsRuntime.js',import.meta.url),'utf8');
test('production rooms can resolve durable story-lineage recovery council',()=>{
  assert.match(bootstrap,/creative_story_lineage_recovery\?\.master/);
  assert.match(bootstrap,/CREATIVE_STORY_LINEAGE_RECOVERY_COUNCIL_V1/);
  assert.match(bootstrap,/completion_repair_usage_id/);
});
test('concept competition accepts only provenance-backed recovery council',()=>{
  assert.match(front,/CREATIVE_STORY_LINEAGE_RECOVERY_COUNCIL_V1/);
  assert.match(front,/recovered_lineage_authority: true/);
  assert.match(front,/completion_repair_usage_id/);
});

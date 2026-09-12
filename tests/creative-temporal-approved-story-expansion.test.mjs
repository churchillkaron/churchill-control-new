import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source=await readFile(new URL('../lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js',import.meta.url),'utf8');
test('tribunal-approved story-level temporal masters continue into scene architecture',()=>{
  assert.match(source,/if \(tribunalSeeded && list\(approvedMasterPlan\.scenes\)\.length\)/);
  assert.match(source,/if \(tribunalSeeded\) \{\s*basePlan = \{/);
  assert.match(source,/operation: "TEMPORAL_SCENE_ARCHITECTURE_V1"/);
});

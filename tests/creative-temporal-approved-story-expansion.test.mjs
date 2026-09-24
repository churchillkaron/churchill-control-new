import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source=await readFile(new URL('../lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js',import.meta.url),'utf8');
const validator=await readFile(new URL('../lib/creative/director/validation/CreativeMasterPlanValidator.js',import.meta.url),'utf8');

test('tribunal-approved temporal story is expanded without substitute-world drift',()=>{
  assert.match(source,/if \(tribunalSeeded && list\(approvedMasterPlan\.scenes\)\.length\)/);
  assert.match(source,/if \(tribunalSeeded\) \{\s*basePlan = \{/);
  assert.match(source,/const arrowBeats = causal/);
  assert.match(source,/const approvedTurns = list\(concept\.irreversible_turns\)/);
  assert.match(source,/approvedTurns\.length >= 3/);
  assert.match(source,/CREATIVE_TEMPORAL_APPROVED_STORY_BEATS_REQUIRED/);
  assert.match(source,/APPROVED SCENE AUTHORITY/);
  assert.match(source,/approved_scene: tribunalSeeded \? scene : null/);
  assert.doesNotMatch(source,/Near-future operations environment/);
  assert.match(validator,/APPROVED_SCENE_LINEAGE_DRIFT/);
  assert.match(validator,/APPROVED_SCENE_SUBSTITUTE_WORLD_FORBIDDEN/);
  assert.match(validator,/manager.*office.*dashboard.*sensor.*hologram.*corporate.*operations environment/s);
});

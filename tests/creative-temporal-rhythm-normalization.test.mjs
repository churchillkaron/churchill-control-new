import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js', import.meta.url), 'utf8');

test('temporal direction deterministically breaks uniform duration runs before validation', () => {
  assert.match(source, /function normalizeDynamicRhythmDurations\(scenes = \[\], minimumSeconds = 0\.5\)/);
  assert.match(source, /Math\.abs\(right - left\) <= 0\.12 \? run \+ 1 : 1/);
  assert.match(source, /const delta = 0\.125/);
  assert.match(source, /duration_seconds: rounded/);
  assert.match(source, /const completedScenes = normalizeDynamicRhythmDurations\(/);
});

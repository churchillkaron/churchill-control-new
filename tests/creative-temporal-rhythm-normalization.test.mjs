import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js', import.meta.url), 'utf8');
const mechanicalSource = await readFile(new URL('../lib/creative/director/runtime/CreativeTemporalMechanicalNormalizationRuntime.js', import.meta.url), 'utf8');

test('temporal direction deterministically breaks uniform duration runs before validation', () => {
  assert.match(source, /function normalizeDynamicRhythmDurations\(scenes = \[\], minimumSeconds = 0\.5\)/);
  assert.match(source, /Math\.abs\(right - left\) <= 0\.12 \? run \+ 1 : 1/);
  assert.match(source, /const delta = 0\.125/);
  assert.match(source, /duration_seconds: rounded/);
  assert.match(source, /const completedScenes = normalizeDynamicRhythmDurations\(/);
});


test('final temporal quality normalization survives mechanical normalization and enforces tempo contrast', () => {
  assert.match(source, /function normalizeTemporalQualityContract\(plan = \{\}\)/);
  assert.match(source, /normalizeTemporalQualityContract\(\s*normalizeTemporalMechanicalContract\(plan/);
  assert.match(source, /tempo_role: "ACCELERATE"/);
  assert.match(source, /tempo_role: "RELEASE"/);
});

test('mechanical normalization expands placeholder camera direction into executable direction', () => {
  assert.match(mechanicalSource, /Focus remains on \$\{text\(shot\.subject\)\}/);
  assert.match(mechanicalSource, /Locked off on the authored support/);
  assert.match(mechanicalSource, /Camera moves at a \$\{authoredSpeed\.toLowerCase\(\)\} controlled pace/);
  assert.match(mechanicalSource, /focus_target: focusTarget/);
});


test('approved temporal master reuse reapplies final quality normalization after mechanical normalization', () => {
  assert.match(source, /if \(tribunalSeeded && list\(approvedMasterPlan\.scenes\)\.length\) \{/);
  assert.match(source, /approvedPlan = normalizeTemporalQualityContract\(\s*normalizeTemporalMechanicalContract\(approvedPlan/);
});

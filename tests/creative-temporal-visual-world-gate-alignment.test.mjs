import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js', import.meta.url), 'utf8');

test('visual world selector contract matches release-gate list minimums', () => {
  const start = source.indexOf('function visualWorldSelectionPrompt');
  const end = source.indexOf('\nasync function recoverChallengerSettledDirection', start);
  const helper = source.slice(start, end);
  assert.match(helper, /at least 4 signature_images/);
  assert.match(helper, /at least 3 anti_flatness_rules/);
  assert.match(helper, /at least 4 forbidden_defaults/);
  assert.match(helper, /"signature_images":\["","","",""\]/);
  assert.match(helper, /"anti_flatness_rules":\["","",""\]/);
  assert.match(helper, /"forbidden_defaults":\["","","",""\]/);
});

test('selected visual world completeness is topped up only from authored plan evidence', () => {
  assert.match(source, /function completeSelectedVisualWorld\(/);
  assert.match(source, /selected\.signature_images,[\s\S]{0,180}concept\.signature_images/);
  assert.match(source, /selected\.forbidden_defaults,[\s\S]{0,180}concept\.refused_devices/);
  assert.match(source, /const selectedWorld = completeSelectedVisualWorld\(/);
});

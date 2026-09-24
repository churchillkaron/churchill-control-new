import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('compact tribunal reviewers disable hierarchical local decomposition', () => {
  assert.match(source, /hierarchical_local_disabled = false/);
  assert.match(source, /hierarchical_local_disabled \? \{ hierarchical_local_disabled: true \} : \{\}/);
  assert.match(source, /\["SOUND_VISUAL_SYNC", "HUMAN_PERFORMANCE", "RIGHTS_SAFETY"\]\.includes\(reviewerDiscipline\(reviewer\)\)[\s\S]{0,180}\? "fast"/);
  assert.match(source, /hierarchical_local_disabled: \["SOUND_VISUAL_SYNC", "HUMAN_PERFORMANCE", "RIGHTS_SAFETY"\]\.includes\(reviewerDiscipline\(reviewer\)\)/);
});

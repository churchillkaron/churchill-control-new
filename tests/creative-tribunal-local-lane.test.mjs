import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('human performance and rights safety reviews stay on single-pass fast local lane', () => {
  assert.match(source, /execution_lane: \["SOUND_VISUAL_SYNC", "HUMAN_PERFORMANCE", "RIGHTS_SAFETY"\]\.includes\(reviewerDiscipline\(reviewer\)\)[\s\S]{0,180}\? "fast"/);
  assert.match(source, /hierarchical_local_disabled: \["SOUND_VISUAL_SYNC", "HUMAN_PERFORMANCE", "RIGHTS_SAFETY"\]\.includes\(reviewerDiscipline\(reviewer\)\)/);
});

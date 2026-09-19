import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('challenger replay supports indexed settled temporal contract repairs', () => {
  const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js', import.meta.url), 'utf8');
  assert.match(source, /settled_temporal_repair_usage_ids/);
  assert.match(source, /repair attempt\\s\+\(\\d\+\)\\s\+of/i);
  assert.match(source, /repair_index/);
});

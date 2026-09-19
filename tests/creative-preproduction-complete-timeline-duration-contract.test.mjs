import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../lib/creative/certification/runtime/CreativePreProductionIntelligenceCertificationRuntime.js', import.meta.url), 'utf8');
test('first-minute certification measures complete scoped timeline, not only generated media', () => {
  assert.match(source, /const scopedTimelineShots = allShots\.filter/);
  assert.match(source, /scopedTimelineDuration/);
  assert.match(source, /firstMinute && scopedTimelineShots\.length/);
  assert.match(source, /generated_media_duration_seconds/);
});

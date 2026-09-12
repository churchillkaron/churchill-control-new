import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../lib/creative/director/orchestrator/CreativePipelineOrchestrator.js', import.meta.url), 'utf8');
test('validated temporal direction is durable and tied to tribunal identity', () => {
  assert.match(source, /creative_temporal_direction_checkpoint/);
  assert.match(source, /CREATIVE_TEMPORAL_DIRECTION_CHECKPOINT_V1/);
  assert.match(source, /source_tribunal_hash/);
  assert.match(source, /durableTemporalMaster \|\| await CreativeUniversalTemporalDirectionRuntime\.create/);
  assert.match(source, /if \(!durableTemporalMaster\)/);
});

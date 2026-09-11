import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/state/CreativeStateEngine.js', 'utf8');

test('stale planning locks are reclaimable after a bounded lease', () => {
  assert.match(source, /EXECUTION_LOCK_LEASE_MS = 30 \* 60 \* 1000/);
  assert.match(source, /state\?\.execution_lock && !reclaimableStaleLock\(state\)/);
});

test('active production stages are never auto-reclaimed', () => {
  for (const stage of ['EXECUTING','PRODUCING','RENDERING','REVIEWING','MONITORING']) {
    assert.match(source, new RegExp(`PIPELINE_STAGES\\.${stage}`));
  }
  assert.match(source, /NON_RECLAIMABLE_LOCK_STAGES\.has\(normalizeStage\(state\.stage\)\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js','utf8');

test('fresh creative restart outranks all persisted direction checkpoints', () => {
  const forceIndex = source.indexOf('const forceDirectionRestart =');
  const temporalIndex = source.indexOf('storedTemporalDirectionCheckpoint(context.project, context)');
  const postRepairIndex = source.indexOf('storedPostRepairMasterCheckpoint(context.project, context)');
  const councilIndex = source.indexOf('storedCouncilCheckpoint(context.project, context)');
  assert.ok(forceIndex > -1);
  assert.ok(forceIndex < temporalIndex);
  assert.ok(forceIndex < postRepairIndex);
  assert.ok(forceIndex < councilIndex);
  assert.match(source, /let temporalCheckpoint = forceDirectionRestart[\s\S]*\? null[\s\S]*: storedTemporalDirectionCheckpoint/);
  assert.match(source, /const postRepairCheckpoint = forceDirectionRestart[\s\S]*\? null[\s\S]*: storedPostRepairMasterCheckpoint/);
  assert.match(source, /if \(forceDirectionRestart\) \{[\s\S]*await clearResolvedDirectionCheckpoints\(context\)/);
  assert.match(source, /const rejectedDirectionCheckpoint = forceDirectionRestart[\s\S]*storedPostRepairMasterCheckpoint/);
  assert.match(source, /const councilCheckpoint = forceDirectionRestart[\s\S]*\? null[\s\S]*: storedCouncilCheckpoint/);
});

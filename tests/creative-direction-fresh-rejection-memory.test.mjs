import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('fresh direction restart preserves negative lineage memory without replaying rejected plan', () => {
  const workflow = fs.readFileSync('lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js', 'utf8');
  const master = fs.readFileSync('lib/creative/director/runtime/CreativeMasterPlanRuntime.js', 'utf8');
  assert.match(workflow, /CREATIVE_FRESH_DIRECTION_REJECTION_MEMORY_V1/);
  assert.match(workflow, /creative_fresh_direction_rejection_memory/);
  assert.match(workflow, /storedPostRepairMasterCheckpoint/);
  assert.match(master, /creative_fresh_direction_rejection_memory/);
  assert.match(master, /The rejection memory is a prohibition, never a seed/);
});

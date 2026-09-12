import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../lib/creative/director/orchestrator/CreativePipelineOrchestrator.js', import.meta.url), 'utf8');
test('validated temporal direction is durable and tied to tribunal identity', () => {
  assert.match(source, /creative_temporal_direction_checkpoint/);
  assert.match(source, /CREATIVE_TEMPORAL_DIRECTION_CHECKPOINT_V1/);
  assert.match(source, /source_tribunal_hash/);
  assert.match(source, /durableTemporalMaster \|\| await CreativeUniversalTemporalDirectionRuntime\.create/);
  assert.match(source, /list\(checkpointPlan\.concept_candidates\)\.length >= 3/);
  assert.match(source, /dry_run_dossier_required_before_paid_generation === true/);
  assert.match(source, /if \(!durableTemporalMaster \|\| resolvedMaster !== durableTemporalMaster\)/);
});


test('workflow resolution resumes validated temporal direction before council or tribunal work', async () => {
  const workflowSource = await readFile(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js', import.meta.url), 'utf8');
  assert.match(workflowSource, /creative_temporal_direction_checkpoint/);
  assert.match(workflowSource, /const temporalCheckpoint = storedTemporalDirectionCheckpoint\(context\.project, context\)/);
  assert.match(workflowSource, /if \(temporalCheckpoint\) \{/);
  assert.match(workflowSource, /resumed_temporal_direction_checkpoint: true/);
});

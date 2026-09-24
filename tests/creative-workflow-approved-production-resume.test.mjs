import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js', import.meta.url), 'utf8');
test('workflow can resume production directly from durable Tribunal approval', () => {
  const start = source.indexOf('async resumeApprovedProduction(input = {})');
  const end = source.indexOf('\n  async finalizeResolvedHandoff', start);
  const body = source.slice(start, end);
  assert.match(body, /storedTribunalApprovedMaster\(context\.project, context\)/);
  assert.match(body, /CREATIVE_TRIBUNAL_APPROVED_MASTER_REQUIRED/);
  assert.match(body, /bootstrapResolvedProductionRooms\(/);
  assert.match(body, /persistTemporalDirectionCheckpoint\(context, resolved\.governedMaster\)/);
  assert.match(body, /resumed_from_tribunal_approved_checkpoint: true/);
  assert.doesNotMatch(body, /CreativeDynamicTribunalRuntime\.review/);
  assert.doesNotMatch(body, /resumeApprovedCouncilPlan/);
});

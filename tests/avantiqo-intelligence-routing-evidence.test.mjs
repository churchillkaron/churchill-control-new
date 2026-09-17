import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const execution = fs.readFileSync('lib/platform/service-runtime/execution/ServiceExecutionRuntime.js','utf8');
const usage = fs.readFileSync('lib/platform/service-runtime/usage/UsageRuntime.js','utf8');
const compute = fs.readFileSync('app/api/workspace/administration/compute/route.js','utf8');

test('service usage stamps durable intelligence routing evidence', () => {
  assert.match(execution, /AVANTIQO_SERVICE_ROUTING_EVIDENCE_V1/);
  assert.match(execution, /execution_lane: intelligenceExecutionLane/);
  assert.match(execution, /local_lane_eligible: intelligenceLocalLaneEligible/);
  assert.match(execution, /selected_provider: provider/);
  assert.match(execution, /selected_model: model/);
  assert.match(execution, /routing_evidence: routingEvidence/);
});

test('terminal usage settlement preserves start metadata', () => {
  assert.match(usage, /const current = await Repository\.getById\(usage_id\)/);
  assert.match(usage, /sanitizeMetadata\(\{ \.\.\.object\(current\?\.metadata\), \.\.\.object\(updates\.metadata\) \}\)/);
  assert.match(usage, /metadata: mergedMetadata/);
});

test('compute prefers recorded lane evidence over historical heuristics', () => {
  assert.match(compute, /row\.metadata\?\.routing_evidence/);
  assert.match(compute, /RECORDED_DEEP_LANE/);
  assert.match(compute, /RECORDED_\$\{evidenceLane\.toUpperCase\(\)\}_LOCAL_ELIGIBLE/);
  assert.match(compute, /provider_request_id,metadata,created_at/);
});

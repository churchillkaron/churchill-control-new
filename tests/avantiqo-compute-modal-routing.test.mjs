import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('app/api/workspace/administration/compute/route.js','utf8');
test('compute telemetry separates intentional Modal, fallback, and unclassified local candidates',()=>{
  assert.match(source,/DEEP_REASONING_30B/);
  assert.match(source,/INTERACTIVE_TTS_HYBRID/);
  assert.match(source,/LOCAL_STT_CAPABLE/);
  assert.match(source,/HISTORICAL_LANE_MISSING/);
  assert.match(source,/modal_local_candidate_unclassified_calls_30d/);
  assert.match(source,/modal_intentional_calls_30d/);
  assert.match(source,/fallback_cost_by_capability/);
  assert.match(source,/modalSummary\.local_fallback_calls/);
  assert.match(source,/modal_gpu/);
  assert.match(source,/execution_resource: "MODAL_GPU"/);
  assert.match(source,/execution_path: `MODAL →/);
  assert.doesNotMatch(source,/modalCostsByCapability/);
  assert.doesNotMatch(source,/const operationalJobs = jobs\.filter\([\s\S]*?const operationalJobs = jobs\.filter/);
});

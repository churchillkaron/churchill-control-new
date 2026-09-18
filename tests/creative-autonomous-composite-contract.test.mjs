import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const materializer=fs.readFileSync('lib/creative/compositing/runtime/CreativeCompositeTaskMaterializationRuntime.js','utf8');
const review=fs.readFileSync('lib/creative/compositing/runtime/CreativeCompositeReviewTaskRuntime.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');
const renderer=fs.readFileSync('lib/creative/compositing/runtime/CreativeLayeredCompositingRenderRuntime.js','utf8');

test('autonomous composite requires pre-authored contract lineage task',()=>{
  assert.match(materializer,/COMPOSITING_LINEAGE_TASK_REQUIRED/);
  assert.match(materializer,/contractFromTask/);
  assert.match(materializer,/CreativeCompositingRuntime\.verify/);
});

test('autonomous composite prechecks every authored layer source and QC status',()=>{
  assert.match(materializer,/COMPOSITING_LAYER_EVIDENCE_REQUIRED/);
  assert.match(materializer,/layerReady/);
  assert.match(materializer,/simulation_qc_sealed/);
  assert.match(materializer,/vfx_qc_sealed/);
  assert.match(materializer,/shot_candidate_review_passed/);
});

test('composite task is idempotent per shot',()=>{
  assert.match(materializer,/creative\.shot\.composite/);
  assert.match(materializer,/const prior=tasks\.find/);
  assert.match(materializer,/existing\.push\(prior\)/);
});

test('queue runs final composite locally through governed layered compositor',()=>{
  assert.match(queue,/capability === "creative\.shot\.composite"/);
  assert.match(queue,/passRole === "FINAL_COMPOSITE"/);
  assert.match(queue,/CreativeLayeredCompositingRenderRuntime\.render/);
  assert.match(queue,/provider: "avantiqo-owned-compositor"/);
  assert.match(queue,/settlement: "LOCAL_EXECUTION"/);
  assert.match(queue,/provider_calls_performed: false/);
});

test('layered renderer repeats strict source gate and checksum identity reuse',()=>{
  assert.match(renderer,/COMPOSITING_SOURCE_GATE_BLOCKED/);
  assert.match(renderer,/COMPOSITING_SIMULATION_QC_SEAL_REQUIRED/);
  assert.match(renderer,/COMPOSITING_VFX_QC_SEAL_REQUIRED/);
  assert.match(renderer,/compositing_identity/);
  assert.match(renderer,/reused: true/);
});

test('completed composite automatically materializes perceptual review',()=>{
  assert.match(review,/creative\.shot\.composite/);
  assert.match(review,/GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1/);
  assert.match(review,/source_generation_task_id:source\.id/);
  assert.match(review,/media_kind:"VIDEO"/);
  assert.match(queue,/CreativeCompositeReviewTaskRuntime\.ensure\(input\)/);
});

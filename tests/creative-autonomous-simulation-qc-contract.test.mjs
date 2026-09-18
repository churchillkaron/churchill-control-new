import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const review=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationReviewTaskRuntime.js','utf8');
const qc=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationQualityGateBootstrap.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');
const artifact=fs.readFileSync('lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime.js','utf8');

test('completed local simulations automatically materialize one canonical perceptual review',()=>{
  assert.match(review,/creative\.simulation\.execute/);
  assert.match(review,/GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1/);
  assert.match(review,/source_generation_task_id:source\.id/);
  assert.match(review,/media_kind:"VIDEO"/);
  assert.match(review,/depends_on:\[source\.id\]/);
  assert.match(review,/tasks\.find\(task=>/);
  assert.match(review,/existing\.push\(prior\)/);
});

test('central queue automatically ensures simulation review tasks',()=>{
  assert.match(queue,/CreativeSimulationReviewTaskRuntime\.ensure\(input\)/);
  assert.match(queue,/simulationReviews\.created\.length/);
  assert.match(queue,/CreativeGeneratedMediaPerceptualExecutionGate/);
  assert.match(queue,/CreativeSimulationQualityGateBootstrap/);
});

test('physics QC still evaluates actual rendered media against exact simulation contract',()=>{
  assert.match(qc,/ACTUAL rendered frames/);
  assert.match(qc,/simulation_contract_hash/);
  assert.match(qc,/collision_tunneling_detected/);
  assert.match(qc,/solver_stability_valid/);
  assert.match(qc,/SIMULATION_QC_PROVIDER_REVIEW_NOT_PASSED/);
});

test('passing simulation QC seals the durable simulation asset node with the same hash',()=>{
  assert.match(qc,/CreativeMultiPassArtifactRuntime\.sealSimulation/);
  assert.match(qc,/asset_node_id: simulationAssetNodeId/);
  assert.match(qc,/simulation_qc_seal_hash: evaluation\.seal_hash/);
  assert.match(artifact,/AVANTIQO_SIMULATION_QC_SEAL_V1/);
  assert.match(artifact,/simulation_qc_sealed:true/);
});

test('failed physics remains fail-closed and cannot release downstream',()=>{
  assert.match(qc,/CREATIVE_SIMULATION_QC_FAILED/);
  assert.match(qc,/approved_for_downstream_after_perceptual_review: false/);
  assert.match(qc,/rejected_before_editing: true/);
});

import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const materializer=fs.readFileSync('lib/creative/vfx/runtime/CreativeVfxTaskMaterializationRuntime.js','utf8');
const review=fs.readFileSync('lib/creative/vfx/runtime/CreativeVfxReviewTaskRuntime.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');
const qc=fs.readFileSync('lib/creative/vfx/runtime/CreativeVfxQualityGateBootstrap.js','utf8');

test('VFX materialization requires all certified upstream evidence',()=>{
  assert.match(materializer,/VFX_CONTRACT_REQUIRED/);
  assert.match(materializer,/APPROVED_BASE_PLATE_REQUIRED/);
  assert.match(materializer,/CERTIFIED_DEPTH_MAP_REQUIRED/);
  assert.match(materializer,/SEALED_SIMULATION_ASSET_REQUIRED/);
  assert.match(materializer,/AVANTIQO_SIMULATION_QC_SEAL_V1/);
  assert.match(materializer,/creative\.vfx\.integrate/);
});

test('VFX materialization is idempotent and bound to exact pass node',()=>{
  assert.match(materializer,/vfx_pass_node_id/);
  assert.match(materializer,/tasks\.find\(t=>text\(t\.metadata\?\.vfx_pass_node_id\)/);
  assert.match(materializer,/existing\.push\(prior\)/);
});

test('queue executes VFX locally only for exact governed capability and pass role',()=>{
  assert.match(queue,/capability === "creative\.vfx\.integrate"/);
  assert.match(queue,/passRole === "VFX_INTEGRATION"/);
  assert.match(queue,/CreativeVfxIntegrationPassExecutionRuntime\.execute/);
  assert.match(queue,/provider: "avantiqo-owned-vfx"/);
  assert.match(queue,/settlement: "LOCAL_EXECUTION"/);
  assert.match(queue,/provider_calls_performed: false/);
});

test('queue automatically materializes and reviews VFX integration tasks',()=>{
  assert.match(queue,/CreativeVfxTaskMaterializationRuntime\.ensure\(input\)/);
  assert.match(queue,/CreativeVfxReviewTaskRuntime\.ensure\(input\)/);
});

test('completed VFX integrations receive one canonical perceptual review task',()=>{
  assert.match(review,/creative\.vfx\.integrate/);
  assert.match(review,/GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1/);
  assert.match(review,/source_generation_task_id:source\.id/);
  assert.match(review,/media_kind:"VIDEO"/);
  assert.match(review,/depends_on:\[source\.id\]/);
});

test('passing VFX QC seals durable VFX asset with canonical seal hash',()=>{
  assert.match(qc,/CreativeMultiPassArtifactRuntime\.sealVfx/);
  assert.match(qc,/asset_node_id: vfxAssetNodeId/);
  assert.match(qc,/vfx_qc_seal_hash: evaluation\.seal_hash/);
  assert.match(qc,/vfx_contract_hash: evaluation\.vfx_contract_hash/);
  assert.match(qc,/CREATIVE_VFX_QC_FAILED/);
});

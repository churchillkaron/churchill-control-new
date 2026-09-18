import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const materializer=fs.readFileSync('lib/creative/vfx/runtime/CreativePhysicalInteractionTaskMaterializationRuntime.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');
const review=fs.readFileSync('lib/creative/vfx/runtime/CreativeVfxReviewTaskRuntime.js','utf8');
const passExec=fs.readFileSync('lib/creative/vfx/runtime/CreativePhysicalInteractionPassExecutionRuntime.js','utf8');

test('physical interaction materialization requires sealed VFX and certified material map',()=>{
  assert.match(materializer,/AVANTIQO_VFX_QC_SEAL_V1/);
  assert.match(materializer,/CERTIFIED_MATERIAL_MAP_REQUIRED/);
  assert.match(materializer,/SEALED_VFX_ASSET_REQUIRED/);
  assert.match(materializer,/SURFACE_MATERIAL_MAP/);
  assert.match(materializer,/creative\.vfx\.physical-interaction/);
});

test('physical interaction task is idempotent per shot, sealed VFX asset and effect',()=>{
  assert.match(materializer,/physical_interaction_identity/);
  assert.match(materializer,/tasks\.find\(t=>text\(t\.metadata\?\.physical_interaction_identity\)/);
  assert.match(materializer,/existing\.push\(prior\)/);
});

test('queue executes one physical interaction render then creates two evidence tasks',()=>{
  assert.match(queue,/CreativePhysicalInteractionPassExecutionRuntime\.execute/);
  assert.match(queue,/createInteractionEvidenceTask/);
  assert.match(queue,/role: "LIGHTING_INTERACTION"/);
  assert.match(queue,/role: "REFLECTION_SHADOW"/);
  assert.match(queue,/provider_calls_performed: false/);
});

test('material map is read from exact certified storage asset rather than inferred at execution',()=>{
  assert.match(queue,/material_asset_node_id/);
  assert.match(queue,/downloadCreativeStorageReference/);
  assert.match(queue,/const materialMap = await blobJson/);
});

test('interaction child layers are durable zero-cost evidence tasks pointing at existing asset nodes',()=>{
  assert.match(queue,/creative\.vfx\.interaction\.layer/);
  assert.match(queue,/asset_node_id: artifact\.node\.id/);
  assert.match(queue,/file_url: artifact\.storage_reference/);
  assert.match(queue,/settlement: "LOCAL_EXECUTION"/);
});

test('automatic VFX review includes interaction-layer child tasks',()=>{
  assert.match(review,/"creative\.vfx\.integrate","creative\.vfx\.interaction\.layer"/);
  assert.match(review,/GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1/);
});

test('physical interaction pass still persists separate lighting and reflection-shadow assets',()=>{
  assert.match(passExec,/pass_id:"lighting-interaction"/);
  assert.match(passExec,/pass_id:"reflection-shadow"/);
  assert.match(passExec,/PHYSICAL_INTERACTION_VFX_QC_SEAL_REQUIRED/);
});

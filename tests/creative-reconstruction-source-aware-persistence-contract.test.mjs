import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSceneReconstructionRuntime } from '../lib/creative/reconstruction/runtime/CreativeSceneReconstructionRuntime.js';
import { CreativeSceneReconstructionExecutionRuntime } from '../lib/creative/reconstruction/runtime/CreativeSceneReconstructionExecutionRuntime.js';

const artifacts=fs.readFileSync('lib/creative/reconstruction/runtime/CreativeReconstructionArtifactRuntime.js','utf8');
const assembler=fs.readFileSync('lib/creative/reconstruction/runtime/CreativeSceneReconstructionAssemblerRuntime.js','utf8');
const opencv=fs.readFileSync('lib/creative/tools/runtime/CreativeOpenCVRuntime.js','utf8');

test('still source uses single-view camera proxy and image segmentation, never video tracking',()=>{
  const contract=CreativeSceneReconstructionRuntime.buildForShot({
    id:'churchill-still',subject:'Churchill restaurant interior',primary_source_asset_id:'a1',
    reference_assets:[{asset_id:'a1',role:'PRIMARY_SOURCE'}],source_media_kind:'IMAGE',
    source_reinterpretation:{required:true,mode:'CINEMATIC_REINTERPRETATION',identity_truth:'Preserve real venue geometry'}
  });
  assert.equal(contract.source_media_kind,'IMAGE');
  const state=CreativeSceneReconstructionExecutionRuntime.readiness(contract);
  assert.equal(state.capabilities.camera_solution.capability,'creative.camera.single-view-proxy');
  assert.equal(state.capabilities.segmentation.capability,'creative.image.segmentation.execute');
  assert.notEqual(state.capabilities.camera_solution.capability,'creative.camera.track');
});

test('video source retains temporal camera tracking and temporal segmentation',()=>{
  const contract={
    contract:'CREATIVE_SCENE_RECONSTRUCTION_CONTRACT_V1',contract_hash:'v1',source_media_kind:'VIDEO',source_asset_ids:['v1'],
    reconstruction_scope:{camera_estimation_required:true,depth_estimation_required:true,geometry_proxy_required:true,surface_material_classification_required:true,practical_light_source_estimation_required:true,occlusion_map_required:true,reflection_shadow_receiver_map_required:true}
  };
  const state=CreativeSceneReconstructionExecutionRuntime.readiness(contract);
  assert.equal(state.capabilities.camera_solution.capability,'creative.camera.track');
  assert.equal(state.capabilities.segmentation.capability,'creative.segmentation.execute');
});

test('OpenCV has a distinct still-image segmentation operation',()=>{
  assert.match(opencv,/IMAGE_SEGMENTATION/);
  assert.match(opencv,/def image_segmentation\(\)/);
  assert.match(opencv,/CREATIVE_OPENCV_IMAGE_SEGMENTATION_SOURCE_REQUIRED/);
  assert.match(opencv,/IMAGE_SEGMENTATION_MASK/);
});

test('reconstruction artifacts persist checksums, project scope and release-disabled lineage',()=>{
  assert.match(artifacts,/CREATIVE_RECONSTRUCTION_ARTIFACT_V1/);
  assert.match(artifacts,/checksum_sha256/);
  assert.match(artifacts,/reconstruction_contract_hash/);
  assert.match(artifacts,/shot_id/);
  assert.match(artifacts,/pass_id: "scene-reconstruction"/);
  assert.match(artifacts,/durable_evidence: true/);
  assert.match(artifacts,/release_approved: false/);
  assert.match(artifacts,/createOrFindByMetadataIdentity/);
});

test('assembler derives local layers from authorized semantic inputs and stops at QC',()=>{
  assert.match(assembler,/IMAGE_SEGMENTATION/);
  assert.match(assembler,/DEPTH_NORMALS/);
  assert.match(assembler,/CreativeDepthGeometryProxyRuntime\.build/);
  assert.match(assembler,/PRACTICAL_LIGHTS/);
  assert.match(assembler,/SURFACE_MATERIAL_MAP/);
  assert.match(assembler,/SINGLE_VIEW_CAMERA_PROXY/);
  assert.match(assembler,/RECONSTRUCTION_MANIFEST/);
  assert.match(assembler,/provider_calls_executed_by_assembler: false/);
  assert.match(assembler,/qc_status: "REQUIRES_RECONSTRUCTION_QC"/);
  assert.match(assembler,/release_approved: false/);
  assert.match(assembler,/large_orbit_allowed: false/);
  assert.match(assembler,/reverse_angle_allowed: false/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSceneReconstructionExecutionRuntime } from '../lib/creative/reconstruction/runtime/CreativeSceneReconstructionExecutionRuntime.js';
import { CreativeMultiPassExecutionRuntime } from '../lib/creative/multipass/runtime/CreativeMultiPassExecutionRuntime.js';

const reconstruction = {
  contract:'CREATIVE_SCENE_RECONSTRUCTION_CONTRACT_V1',
  contract_hash:'abc',
  source_asset_ids:['venue-1'],
  reconstruction_scope:{camera_estimation_required:true,depth_estimation_required:true,geometry_proxy_required:true,surface_material_classification_required:true,practical_light_source_estimation_required:true,occlusion_map_required:true,reflection_shadow_receiver_map_required:true}
};

test('owned reconstruction readiness resolves all required scene-reconstruction capabilities',()=>{
  const state=CreativeSceneReconstructionExecutionRuntime.readiness(reconstruction);
  for (const key of ['camera_solution','segmentation','depth_map','geometry_proxy','surface_normals','surface_materials','practical_lights']) {
    assert.equal(state.capabilities[key].available,true,key);
  }
  assert.equal(state.capabilities.geometry_proxy.tool_id,'depth-geometry-proxy');
  assert.equal(state.capabilities.surface_normals.tool_id,'opencv');
  assert.equal(state.capabilities.practical_lights.tool_id,'opencv');
  assert.equal(state.capabilities.surface_materials.tool_id,'service-runtime');
  assert.equal(state.no_fake_completion,true);
  assert.deepEqual(state.blockers,[]);
  assert.equal(state.ready,true);
});

test('reconstruction execution plan is executable only because every required capability is now real',()=>{
  const plan=CreativeSceneReconstructionExecutionRuntime.plan(reconstruction);
  assert.equal(plan.executable_now,true);
  assert.equal(plan.steps.find(s=>s.id==='depth').status,'READY_WHEN_DEPENDENCIES_COMPLETE');
  assert.equal(plan.steps.find(s=>s.id==='surface-normals').status,'READY_WHEN_DEPENDENCIES_COMPLETE');
  assert.equal(plan.steps.find(s=>s.id==='materials').status,'READY_WHEN_DEPENDENCIES_COMPLETE');
  assert.equal(plan.steps.find(s=>s.id==='practical-lights').status,'READY_WHEN_DEPENDENCIES_COMPLETE');
  assert.equal(plan.certification_policy,'ALL_REQUIRED_LAYERS_MUST_HAVE_REAL_ARTIFACT_EVIDENCE');
});

test('multipass readiness still blocks final composite until upstream artifacts are actually completed',()=>{
  const contract={contract:'CREATIVE_MULTIPASS_SHOT_CONTRACT_V1',passes:[
    {id:'scene-reconstruction',role:'SCENE_RECONSTRUCTION',depends_on:[],required:true},
    {id:'base-plate',role:'BASE_PLATE',depends_on:['scene-reconstruction'],required:true},
    {id:'composite',role:'FINAL_COMPOSITE',depends_on:['base-plate'],required:true},
    {id:'shot-qc',role:'PERCEPTUAL_AND_TECHNICAL_QC',depends_on:['composite'],required:true},
  ]};
  const graph={nodes:[
    {id:'s1',type:'SHOT',requirements:{multipass_contract:contract}},
    {id:'pass:s1:scene-reconstruction',metadata:{}},
    {id:'pass:s1:base-plate',metadata:{}},
    {id:'pass:s1:composite',metadata:{}},
    {id:'pass:s1:shot-qc',metadata:{}},
  ]};
  const state=CreativeMultiPassExecutionRuntime.readiness({graph,shot_id:'s1',reconstruction_readiness:{ready:true}});
  assert.equal(state.final_composite_releasable,false);
  assert.equal(state.shot_release_ready,false);
  assert.equal(state.single_generation_finished_shot_forbidden,true);
  assert.ok(state.required_blocker_count>0);
  assert.ok(state.next_ready_passes.some(p=>p.pass_id==='scene-reconstruction'));
});

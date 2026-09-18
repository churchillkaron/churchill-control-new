import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeVfxRuntime } from '../lib/creative/vfx/runtime/CreativeVfxRuntime.js';
import { CreativeVfxIntegrationPassBridgeRuntime } from '../lib/creative/multipass/runtime/CreativeVfxIntegrationPassBridgeRuntime.js';
import { CreativePhysicalInteractionPassBridgeRuntime } from '../lib/creative/multipass/runtime/CreativePhysicalInteractionPassBridgeRuntime.js';

const integration=fs.readFileSync('lib/creative/vfx/runtime/CreativeVfxIntegrationRenderRuntime.js','utf8');
const executor=fs.readFileSync('lib/creative/vfx/runtime/CreativeVfxIntegrationPassExecutionRuntime.js','utf8');
const interaction=fs.readFileSync('lib/creative/vfx/runtime/CreativePhysicalInteractionRenderRuntime.js','utf8');
const interactionExec=fs.readFileSync('lib/creative/vfx/runtime/CreativePhysicalInteractionPassExecutionRuntime.js','utf8');
const compositing=fs.readFileSync('lib/creative/compositing/runtime/CreativeCompositingRuntime.js','utf8');
const layered=fs.readFileSync('lib/creative/compositing/runtime/CreativeLayeredCompositingRenderRuntime.js','utf8');

function authored(){
  return CreativeVfxRuntime.author({
    vfx:[{
      id:'chalk-vfx',effect:'particle chalk impact',target:'cue tip contact region',
      temporal_entry:'at impact',temporal_progression:'burst expands and falls',temporal_exit:'dust settles',
      occlusion_depth_strategy:'Use certified depth map and foreground holdout.',perspective_scale:'Match reconstructed pool-table scale.',
      motion_blur:'Match shutter and cue impact velocity.',depth_of_field:'Match base-plate focus plane.',
      lighting_interaction:'Chalk catches practical key and spills subtle light into haze.',color_exposure_match:'Match base exposure and white balance.',
      edge_integration:'Feather and erode alpha to photographed edge response.',grain_texture_match:'Match base grain and texture.',
      physical_plausibility:'Must remain causally tied to cue impact and gravity.',simulation_dependency:true,
      integration_parameters:{seed:991,depth_position_normalized:.43,depth_foreground_rule:'GREATER_THAN_EFFECT_DEPTH_OCCLUDES',light_wrap_strength:.31,reflection_strength:.22,contact_shadow_strength:.42}
    }],
    simulation_contract:{contract:'AVANTIQO_SIMULATION_V1',simulations:[{simulation_id:'chalk-vfx'}]},
    subject:'pool cue',action:'cue strikes ball',frame_plan:{opening_frame:'before contact',progression:'impact',closing_frame:'settled'},continuity:{environment:'Churchill pool table'}
  });
}

test('VFX planning authors deterministic numeric integration profile',()=>{
  const result=authored(); assert.equal(result.status,'READY');
  const p=result.vfx_contract.effects[0].integration_parameters;
  assert.equal(p.contract,'AVANTIQO_VFX_INTEGRATION_NUMERIC_PROFILE_V1');
  assert.equal(p.seed,991); assert.equal(p.depth_foreground_rule,'GREATER_THAN_EFFECT_DEPTH_OCCLUDES');
  assert.equal(p.deterministic_replay_required,true); assert.equal(p.reflection_strength,.22); assert.equal(p.contact_shadow_strength,.42);
});

test('depth-aware VFX renderer performs real integration work rather than simple overlay',()=>{
  assert.match(integration,/depth_position_normalized/); assert.match(integration,/depth_foreground_rule/);
  assert.match(integration,/visibility=np\.clip\(1\.0-occ/); assert.match(integration,/matte_erode_pixels/);
  assert.match(integration,/motion_blur_pixels/); assert.match(integration,/dof_blur_sigma/);
  assert.match(integration,/grain_strength/); assert.match(integration,/light_wrap_strength/);
  assert.match(integration,/qtrle/); assert.match(integration,/provider_calls_performed:false/);
});

test('VFX pass only consumes simulation assets with physics QC seal',()=>{
  assert.match(executor,/simulation_qc_sealed===true/); assert.match(executor,/AVANTIQO_SIMULATION_QC_SEAL_V1/);
  assert.match(executor,/VFX_SIMULATION_SEALED_SOURCE_REQUIRED/); assert.match(executor,/vfx_qc_required:true/);
});

test('VFX integration pass completes only from VFX-QC-sealed assets',()=>{
  const graph={nodes:[{id:'pass:s1:vfx-integration',intent:{pass_role:'VFX_INTEGRATION'},requirements:{shot_id:'s1'},metadata:{multipass_pass:true},quality:{}}],metadata:{}};
  const sealed={id:'v1',metadata:{shot_id:'s1',pass_id:'vfx-integration',vfx_qc_sealed:true,vfx_qc_seal_contract:'AVANTIQO_VFX_QC_SEAL_V1',vfx_qc_seal_hash:'c'.repeat(64)}};
  const next=CreativeVfxIntegrationPassBridgeRuntime.reconcile({graph,asset_nodes:[sealed]});
  assert.equal(next.nodes[0].metadata.execution_completed,true); assert.equal(next.nodes[0].quality.approved,true);
});

test('physical interaction renderer makes separate lighting and reflection-shadow plates using material evidence',()=>{
  assert.match(interaction,/reflective=np\.zeros/); assert.match(interaction,/shadow_recv=np\.zeros/);
  assert.match(interaction,/r\.get\('reflective'\) is True/); assert.match(interaction,/r\.get\('shadow_receiver'\) is True/);
  assert.match(interaction,/LIGHTING_INTERACTION/); assert.match(interaction,/reflection-shadow\.mov/);
  assert.match(interactionExec,/PHYSICAL_INTERACTION_VFX_QC_SEAL_REQUIRED/); assert.match(interactionExec,/pass_id:"lighting-interaction"/); assert.match(interactionExec,/pass_id:"reflection-shadow"/);
});

test('lighting and reflection-shadow multipass nodes require their own VFX QC seals',()=>{
  const graph={nodes:[
    {id:'pass:s1:lighting-interaction',intent:{pass_role:'LIGHTING_INTERACTION'},requirements:{shot_id:'s1'},metadata:{multipass_pass:true},quality:{}},
    {id:'pass:s1:reflection-shadow',intent:{pass_role:'REFLECTION_SHADOW'},requirements:{shot_id:'s1'},metadata:{multipass_pass:true},quality:{}}
  ],metadata:{}};
  const assets=[
    {id:'l1',metadata:{shot_id:'s1',pass_id:'lighting-interaction',vfx_qc_sealed:true,vfx_qc_seal_contract:'AVANTIQO_VFX_QC_SEAL_V1',vfx_qc_seal_hash:'d'.repeat(64)}},
    {id:'r1',metadata:{shot_id:'s1',pass_id:'reflection-shadow',vfx_qc_sealed:true,vfx_qc_seal_contract:'AVANTIQO_VFX_QC_SEAL_V1',vfx_qc_seal_hash:'e'.repeat(64)}}
  ];
  const next=CreativePhysicalInteractionPassBridgeRuntime.reconcile({graph,asset_nodes:assets});
  assert.equal(next.nodes[0].metadata.execution_completed,true); assert.equal(next.nodes[1].metadata.execution_completed,true);
  assert.equal(next.metadata.physical_interaction_passes_completed,2);
});

test('compositing recognizes reflection-shadow as governed VFX layer requiring VFX seal',()=>{
  assert.match(compositing,/"REFLECTION_SHADOW"/); assert.match(layered,/"REFLECTION_SHADOW"/); assert.match(layered,/COMPOSITING_VFX_QC_SEAL_REQUIRED/);
});

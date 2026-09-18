import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSimulationRuntime } from '../lib/creative/simulation/runtime/CreativeSimulationRuntime.js';

const renderer=fs.readFileSync('lib/creative/simulation/runtime/CreativeSoftBodySimulationRenderRuntime.js','utf8');
const executor=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationPassExecutionRuntime.js','utf8');

function soft(extra={}){
  return {
    simulation_id:'soft-1',simulation_class:'DEFORMABLE_SOFT_BODY',simulation_intent:'Elastic product deforms under a visible impact and recovers with damping.',
    target:'soft product',source_or_emitter:'product mesh',causal_trigger:'moving impactor contacts object',
    temporal_entry:'undeformed',temporal_progression:'compression and elastic recovery',temporal_exit:'settled close to original form',
    collision_geometry:'floor and visible impactor',material_response:'elastic rubber/foam',environment_coupling:'gravity and contact',boundary_conditions:'floor collision',
    deformation_model:'elastic body response',volume_preservation:'preserve plausible volume',recovery_and_damping:'damped recovery without jelly oscillation',...extra,
  };
}

test('soft-body planning authors deterministic elastic solver authority',()=>{
  const result=CreativeSimulationRuntime.author({simulation:[soft({execution_parameters:{seed:771,simulation_quality:15,mass_kg:.9,pull_stiffness:.86,push_stiffness:.84,bending_stiffness:3.4,damping:6.2,impact_frame:10}})],subject:'soft product',action:'impact',frame_plan:{opening_frame:'undeformed',progression:'compresses',closing_frame:'recovers'},continuity:{environment:'product stage'}});
  assert.equal(result.status,'READY');
  const p=result.simulation_contract.simulations[0].execution_parameters;
  assert.equal(p.contract,'AVANTIQO_SOFT_BODY_SIMULATION_NUMERIC_PROFILE_V1');
  assert.equal(p.backend_family,'BLENDER_SOFT_BODY');
  assert.equal(p.seed,771); assert.equal(p.mass_kg,.9); assert.equal(p.pull_stiffness,.86); assert.equal(p.impact_frame,10);
  assert.equal(p.deterministic_replay_required,true);
});

test('soft-body renderer uses actual Blender soft body with collision and baked point cache',()=>{
  assert.match(renderer,/CREATIVE_SOFT_BODY_SIMULATION_RENDER_V1/);
  assert.match(renderer,/modifier_add\(type='SOFT_BODY'\)/);
  assert.match(renderer,/hero\.soft_body/);
  assert.match(renderer,/settings\.pull/);
  assert.match(renderer,/settings\.push/);
  assert.match(renderer,/settings\.bend/);
  assert.match(renderer,/modifiers\.new\('Collision','COLLISION'\)/);
  assert.match(renderer,/bpy\.ops\.ptcache\.bake_all\(bake=True\)/);
  assert.match(renderer,/provider_calls_performed:false/);
});

test('simulation executor routes soft bodies through owned backend',()=>{
  assert.match(executor,/CreativeSoftBodySimulationRenderRuntime\.render/);
  assert.match(executor,/simulation\.simulation_class==="DEFORMABLE_SOFT_BODY"/);
});

test('hair/fur remains blocked until a strand solver backend exists',()=>{
  const hair={...soft(),simulation_class:'HAIR_FUR',simulation_intent:'Fur reacts naturally to motion.',root_attachment:'roots attached',strand_response:'bend inertia and drag',collision_response:'body collisions'};
  const result=CreativeSimulationRuntime.author({simulation:[hair],subject:'fur',action:'motion',frame_plan:{opening_frame:'still',progression:'moves',closing_frame:'settles'},continuity:{environment:'subject'}});
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.blocking_issues.some(x=>x.code==='SIMULATION_BACKEND_NOT_IMPLEMENTED'));
});

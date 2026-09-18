import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSimulationRuntime } from '../lib/creative/simulation/runtime/CreativeSimulationRuntime.js';

const renderer=fs.readFileSync('lib/creative/simulation/runtime/CreativeRigidBodySimulationRenderRuntime.js','utf8');
const executor=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationPassExecutionRuntime.js','utf8');

function base(simulation_class, extra={}){
  return {
    simulation_id:`sim-${simulation_class.toLowerCase()}`,simulation_class,
    simulation_intent:'Physically plausible object impact response.',target:'hero object',source_or_emitter:'hero object',causal_trigger:'visible impact',
    temporal_entry:'before impact',temporal_progression:'impact and physical response',temporal_exit:'settles under gravity',
    collision_geometry:'certified floor and nearby scene geometry',material_response:'preserve visible material mass and bounce response',
    environment_coupling:'gravity and canonical collisions',boundary_conditions:'floor is lower boundary',...extra,
  };
}

test('rigid-body planning authors complete deterministic solver authority',()=>{
  const result=CreativeSimulationRuntime.author({simulation:[base('RIGID_BODY',{execution_parameters:{seed:77,object_shape:'SPHERE',mass_kg:.17,initial_velocity:[2.4,0,.1],initial_angular_velocity:[0,0,5]}})],subject:'pool ball',action:'cue strike',frame_plan:{opening_frame:'pre-impact',progression:'ball moves',closing_frame:'ball settles'},continuity:{environment:'pool table'}});
  assert.equal(result.status,'READY');
  const p=result.simulation_contract.simulations[0].execution_parameters;
  assert.equal(p.contract,'AVANTIQO_RIGID_BODY_NUMERIC_PROFILE_V1');
  assert.equal(p.backend_family,'BLENDER_RIGID_BODY');
  assert.equal(p.seed,77); assert.equal(p.mass_kg,.17); assert.deepEqual(p.initial_velocity,[2.4,0,.1]);
  assert.equal(p.deterministic_replay_required,true);
});

test('destruction planning authors fracture-specific numeric authority',()=>{
  const result=CreativeSimulationRuntime.author({simulation:[base('DESTRUCTION_FRACTURE',{simulation_intent:'Bottle shatters only after visible impact.',fracture_topology:'fracture starts at impact region',constraint_strength:'intact before trigger',trigger_and_strain:'impact causes breakage',secondary_debris:'fragments inherit impact momentum',execution_parameters:{seed:88,fracture_piece_count:18,trigger_frame:9,impulse_strength:4.2}})],subject:'glass bottle',action:'impact',frame_plan:{opening_frame:'intact',progression:'impact and shatter',closing_frame:'debris settles'},continuity:{environment:'bar'}});
  assert.equal(result.status,'READY');
  const p=result.simulation_contract.simulations[0].execution_parameters;
  assert.equal(p.contract,'AVANTIQO_FRACTURE_SIMULATION_NUMERIC_PROFILE_V1');
  assert.equal(p.backend_family,'BLENDER_RIGID_BODY_FRACTURE');
  assert.equal(p.fracture_piece_count,18); assert.equal(p.trigger_frame,9); assert.equal(p.impulse_strength,4.2);
});

test('owned rigid renderer supports intact collision and trigger-gated fracture',()=>{
  assert.match(renderer,/CREATIVE_RIGID_BODY_SIMULATION_RENDER_V1/);
  assert.match(renderer,/supported_classes:\["RIGID_BODY","DESTRUCTION_FRACTURE"\]/);
  assert.match(renderer,/bpy\.ops\.rigidbody\.world_add\(\)/);
  assert.match(renderer,/substeps_per_frame/); assert.match(renderer,/solver_iterations/);
  assert.match(renderer,/trigger=int\(cfg\.get\('trigger_frame'/);
  assert.match(renderer,/hero\.hide_render=False/); assert.match(renderer,/rb\.kinematic=True/);
  assert.match(renderer,/provider_calls_performed:false/);
});

test('simulation executor routes particles and rigid/fracture but still blocks unsupported heavy solvers',()=>{
  assert.match(executor,/CreativeRigidBodySimulationRenderRuntime\.render/);
  assert.match(executor,/\["RIGID_BODY","DESTRUCTION_FRACTURE"\]/);
  assert.match(executor,/SIMULATION_RENDER_BACKEND_UNAVAILABLE/);
});

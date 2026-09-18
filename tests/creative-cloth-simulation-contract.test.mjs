import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSimulationRuntime } from '../lib/creative/simulation/runtime/CreativeSimulationRuntime.js';

const renderer=fs.readFileSync('lib/creative/simulation/runtime/CreativeClothSimulationRenderRuntime.js','utf8');
const executor=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationPassExecutionRuntime.js','utf8');

function cloth(extra={}){
  return {
    simulation_id:'cloth-1',simulation_class:'DEFORMABLE_CLOTH',simulation_intent:'Luxury curtain reacts naturally to a controlled wind gust.',
    target:'curtain',source_or_emitter:'fabric panel',causal_trigger:'wind gust begins',
    temporal_entry:'fabric at rest',temporal_progression:'gust lifts folds and propagates waves',temporal_exit:'fabric settles with damping',
    collision_geometry:'floor and nearby scene geometry',material_response:'heavy woven fabric',environment_coupling:'gravity, drag and wind',boundary_conditions:'top edge remains attached',
    attachment_and_pins:'top edge pinned',stretch_bend_shear:'woven fabric stiffness',self_collision:'prevent self intersection',aerodynamic_response:'wind from left with turbulence',...extra,
  };
}

test('cloth planning authors deterministic deformable solver authority',()=>{
  const result=CreativeSimulationRuntime.author({simulation:[cloth({execution_parameters:{seed:661,simulation_quality:14,mass_kg:.42,bending_stiffness:1.1,wind_strength:720,pinned_edge:'TOP',subdivisions_x:72,subdivisions_y:48}})],subject:'curtain',action:'wind gust',frame_plan:{opening_frame:'still',progression:'moves',closing_frame:'settles'},continuity:{environment:'luxury interior'}});
  assert.equal(result.status,'READY');
  const p=result.simulation_contract.simulations[0].execution_parameters;
  assert.equal(p.contract,'AVANTIQO_CLOTH_SIMULATION_NUMERIC_PROFILE_V1');
  assert.equal(p.backend_family,'BLENDER_CLOTH');
  assert.equal(p.seed,661); assert.equal(p.simulation_quality,14); assert.equal(p.mass_kg,.42); assert.equal(p.wind_strength,720); assert.equal(p.pinned_edge,'TOP');
  assert.equal(p.deterministic_replay_required,true);
});

test('cloth renderer uses actual Blender cloth physics, pins, self collision, wind and cache bake',()=>{
  assert.match(renderer,/CREATIVE_CLOTH_SIMULATION_RENDER_V1/);
  assert.match(renderer,/modifiers\.new\('ClothPhysics','CLOTH'\)/);
  assert.match(renderer,/vertex_groups\.new\(name='PinGroup'\)/);
  assert.match(renderer,/vertex_group_mass='PinGroup'/);
  assert.match(renderer,/use_self_collision/);
  assert.match(renderer,/effector_add\(type='WIND'/);
  assert.match(renderer,/bpy\.ops\.ptcache\.bake_all\(bake=True\)/);
  assert.match(renderer,/provider_calls_performed:false/);
});

test('simulation executor routes cloth through owned cloth backend',()=>{
  assert.match(executor,/CreativeClothSimulationRenderRuntime\.render/);
  assert.match(executor,/simulation\.simulation_class==="DEFORMABLE_CLOTH"/);
});

test('soft body remains blocked until its own solver backend exists',()=>{
  const soft={...cloth(),simulation_class:'DEFORMABLE_SOFT_BODY',simulation_intent:'Rubber prop deforms under impact.',deformation_model:'elastic rubber',volume_preservation:'preserve plausible volume',recovery_and_damping:'damped elastic recovery'};
  const result=CreativeSimulationRuntime.author({simulation:[soft],subject:'rubber prop',action:'impact',frame_plan:{opening_frame:'undeformed',progression:'compresses',closing_frame:'recovers'},continuity:{environment:'set'}});
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.blocking_issues.some(x=>x.code==='SIMULATION_BACKEND_NOT_IMPLEMENTED'));
});

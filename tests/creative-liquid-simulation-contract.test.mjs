import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSimulationRuntime } from '../lib/creative/simulation/runtime/CreativeSimulationRuntime.js';

const renderer=fs.readFileSync('lib/creative/simulation/runtime/CreativeLiquidSimulationRenderRuntime.js','utf8');
const executor=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationPassExecutionRuntime.js','utf8');

function liquid(extra={}){
  return {
    simulation_id:'liquid-1',simulation_class:'LIQUID_FLUID',simulation_intent:'Water pours into an open glass and settles naturally.',
    target:'glass interior',source_or_emitter:'pour stream',causal_trigger:'visible pour begins',
    temporal_entry:'glass empty',temporal_progression:'stream enters and splashes',temporal_exit:'surface settles',
    collision_geometry:'open cylindrical glass walls and base',material_response:'water-like liquid',environment_coupling:'gravity and glass collisions',boundary_conditions:'open top, closed sides and bottom',
    density_and_viscosity:'water-like',volume_continuity:'preserve liquid volume',surface_response:'free-surface splash and surface tension',wetting_and_collision:'collide with glass walls and bottom',...extra,
  };
}

test('liquid planning authors free-surface solver authority',()=>{
  const result=CreativeSimulationRuntime.author({simulation:[liquid({execution_parameters:{seed:551,domain_resolution:104,container_type:'CYLINDER_OPEN',container_radius:.19,container_height:.42,initial_velocity:[0,0,-1.6],viscosity_base:1,viscosity_exponent:-6}})],subject:'water',action:'pours',frame_plan:{opening_frame:'empty',progression:'pouring',closing_frame:'settled'},continuity:{environment:'glass'}});
  assert.equal(result.status,'READY');
  const p=result.simulation_contract.simulations[0].execution_parameters;
  assert.equal(p.contract,'AVANTIQO_LIQUID_SIMULATION_NUMERIC_PROFILE_V1');
  assert.equal(p.backend_family,'BLENDER_MANTA_LIQUID');
  assert.equal(p.seed,551); assert.equal(p.domain_resolution,104); assert.equal(p.container_type,'CYLINDER_OPEN');
  assert.deepEqual(p.initial_velocity,[0,0,-1.6]); assert.equal(p.deterministic_replay_required,true);
});

test('liquid renderer uses real Mantaflow liquid domain and baked mesh',()=>{
  assert.match(renderer,/CREATIVE_LIQUID_SIMULATION_RENDER_V1/);
  assert.match(renderer,/ds\.domain_type='LIQUID'/);
  assert.match(renderer,/fs\.flow_type='LIQUID'/);
  assert.match(renderer,/bpy\.ops\.fluid\.bake_data\(\)/);
  assert.match(renderer,/bpy\.ops\.fluid\.bake_mesh\(\)/);
  assert.match(renderer,/mesh_particle_radius/);
  assert.match(renderer,/viscosity_base/);
  assert.match(renderer,/surface_tension/);
  assert.match(renderer,/CYLINDER_OPEN/);
  assert.match(renderer,/Transmission Weight/);
  assert.match(renderer,/provider_calls_performed:false/);
});

test('simulation executor routes liquid through owned liquid backend',()=>{
  assert.match(executor,/CreativeLiquidSimulationRenderRuntime\.render/);
  assert.match(executor,/simulation\.simulation_class==="LIQUID_FLUID"/);
});

test('cloth remains blocked until its dedicated solver exists',()=>{
  const cloth={...liquid(),simulation_class:'DEFORMABLE_CLOTH',simulation_intent:'Curtain reacts to a wind gust.',attachment_and_pins:'top edge pinned',stretch_bend_shear:'fabric stiffness',self_collision:'prevent self intersection',aerodynamic_response:'wind from left'};
  const result=CreativeSimulationRuntime.author({simulation:[cloth],subject:'curtain',action:'wind gust',frame_plan:{opening_frame:'still',progression:'moves',closing_frame:'settles'},continuity:{environment:'room'}});
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.blocking_issues.some(x=>x.code==='SIMULATION_BACKEND_NOT_IMPLEMENTED'));
});

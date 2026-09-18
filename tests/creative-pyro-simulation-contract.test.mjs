import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSimulationRuntime } from '../lib/creative/simulation/runtime/CreativeSimulationRuntime.js';

const renderer=fs.readFileSync('lib/creative/simulation/runtime/CreativePyroSimulationRenderRuntime.js','utf8');
const executor=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationPassExecutionRuntime.js','utf8');

function pyro(extra={}){
  return {
    simulation_id:'flame-1',simulation_class:'PYRO_SMOKE_FIRE',simulation_intent:'Gas flame ignites from a visible burner and produces coherent flame/smoke.',
    target:'burner flame',source_or_emitter:'visible burner jet',causal_trigger:'burner ignition',
    temporal_entry:'ignition',temporal_progression:'flame rises and smoke advects upward',temporal_exit:'source stops and residual smoke dissipates',
    collision_geometry:'nearby hood and wall geometry',material_response:'hot gas and smoke volume',environment_coupling:'buoyancy and room airflow',boundary_conditions:'open upper domain',
    source_fields:'density fuel heat only from burner',buoyancy_advection:'hot gas rises with coherent advection',combustion_or_emission:'fuel follows burner source',dissipation_turbulence:'fine turbulence without frame boiling',...extra,
  };
}

test('pyro planning authors real gas-solver numeric authority',()=>{
  const result=CreativeSimulationRuntime.author({simulation:[pyro({execution_parameters:{seed:443,domain_resolution:112,vorticity:1.35,fuel:1.4,emission_end_frame:30}})],subject:'burner',action:'ignites',frame_plan:{opening_frame:'cold',progression:'burning',closing_frame:'smoke clears'},continuity:{environment:'kitchen'}});
  assert.equal(result.status,'READY');
  const p=result.simulation_contract.simulations[0].execution_parameters;
  assert.equal(p.contract,'AVANTIQO_PYRO_SIMULATION_NUMERIC_PROFILE_V1');
  assert.equal(p.backend_family,'BLENDER_MANTA_GAS');
  assert.equal(p.seed,443); assert.equal(p.domain_resolution,112); assert.equal(p.vorticity,1.35); assert.equal(p.fuel,1.4);
  assert.equal(p.deterministic_replay_required,true);
});

test('pyro renderer uses a real Blender gas domain with bake and volume material',()=>{
  assert.match(renderer,/CREATIVE_PYRO_SIMULATION_RENDER_V1/);
  assert.match(renderer,/mod\.fluid_type='DOMAIN'/);
  assert.match(renderer,/ds\.domain_type='GAS'/);
  assert.match(renderer,/flow\.fluid_type='FLOW'/);
  assert.match(renderer,/fs\.flow_type='BOTH'/);
  assert.match(renderer,/bpy\.ops\.fluid\.bake_data\(\)/);
  assert.match(renderer,/bpy\.ops\.fluid\.bake_noise\(\)/);
  assert.match(renderer,/ShaderNodeVolumePrincipled/);
  assert.match(renderer,/Density Attribute/);
  assert.match(renderer,/Blackbody Intensity/);
  assert.match(renderer,/provider_calls_performed:false/);
});

test('simulation executor routes smoke/fire through owned pyro backend',()=>{
  assert.match(executor,/CreativePyroSimulationRenderRuntime\.render/);
  assert.match(executor,/simulation\.simulation_class==="PYRO_SMOKE_FIRE"/);
});

test('soft-body remains blocked until a dedicated soft-body solver backend is implemented',()=>{
  const cloth={...pyro(),simulation_class:'DEFORMABLE_SOFT_BODY',simulation_intent:'Curtain reacts to wind.',attachment_and_pins:'top edge pinned',stretch_bend_shear:'fabric stiffness',self_collision:'prevent self intersection',aerodynamic_response:'wind from left'};
  const result=CreativeSimulationRuntime.author({simulation:[cloth],subject:'curtain',action:'wind gust',frame_plan:{opening_frame:'still',progression:'moves',closing_frame:'settled'},continuity:{environment:'room'}});
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.blocking_issues.some(x=>x.code==='SIMULATION_BACKEND_NOT_IMPLEMENTED'));
});

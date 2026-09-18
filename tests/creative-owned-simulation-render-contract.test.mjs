import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSimulationRuntime } from '../lib/creative/simulation/runtime/CreativeSimulationRuntime.js';
import { CreativeSimulationPassBridgeRuntime } from '../lib/creative/multipass/runtime/CreativeSimulationPassBridgeRuntime.js';

const renderer=fs.readFileSync('lib/creative/simulation/runtime/CreativeParticleSimulationRenderRuntime.js','utf8');
const executor=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationPassExecutionRuntime.js','utf8');
const artifact=fs.readFileSync('lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime.js','utf8');
const planner=fs.readFileSync('lib/creative/production-graph/planner/ProductionGraphPlanner.js','utf8');

function request(simulation_class='PARTICLE_GRANULAR'){
  return {
    simulation_id:'chalk-impact',simulation_class,
    simulation_intent:'A cue strike ejects a short physically plausible burst of chalk dust and granular debris.',
    target:'cue-tip contact region',source_or_emitter:'cue-tip contact point',causal_trigger:'cue ball impact',
    temporal_entry:'impact frame',temporal_progression:'burst expands, slows, falls under gravity',temporal_exit:'particles dissipate or settle',
    collision_geometry:'table plane and nearby ball surfaces',material_response:'dry chalk dust and tiny granular fragments',
    environment_coupling:'gravity, air drag and table collision',boundary_conditions:'table surface is the lower collision boundary',
    execution_parameters:{seed:260918,particle_count:140,duration_seconds:2.5,frame_rate:24}
  };
}

test('particle simulation receives deterministic numeric execution authority at planning time',()=>{
  const authored=CreativeSimulationRuntime.author({simulation:[request()],subject:'pool cue impact',action:'cue hits ball',frame_plan:{opening_frame:'before impact',progression:'impact and burst',closing_frame:'settled dust'},continuity:{environment:'real pool table'}});
  assert.equal(authored.status,'READY');
  const sim=authored.simulation_contract.simulations[0];
  assert.equal(sim.execution_parameters.contract,'AVANTIQO_PARTICLE_SIMULATION_NUMERIC_PROFILE_V1');
  assert.equal(sim.execution_parameters.backend_family,'DETERMINISTIC_BALLISTIC_PARTICLE_PLATE');
  assert.equal(sim.execution_parameters.seed,260918);
  assert.equal(sim.execution_parameters.particle_count,140);
  assert.equal(sim.execution_parameters.deterministic_replay_required,true);
});

test('unsupported heavy solver remains blocked instead of being faked',()=>{
  const authored=CreativeSimulationRuntime.author({simulation:[request('DEFORMABLE_SOFT_BODY')],subject:'flame source',action:'ignition',frame_plan:{opening_frame:'source cold',progression:'ignites',closing_frame:'smoke rises'},continuity:{environment:'kitchen'}});
  assert.equal(authored.status,'BLOCKED');
  assert.ok(authored.blocking_issues.some(x=>x.code==='SIMULATION_BACKEND_NOT_IMPLEMENTED'));
});

test('particle renderer is owned deterministic transparent Blender plate execution',()=>{
  assert.match(renderer,/CREATIVE_PARTICLE_SIMULATION_RENDER_V1/);
  assert.match(renderer,/random\.seed\(cfg\['seed'\]\)/);
  assert.match(renderer,/scene\.render\.film_transparent=True/);
  assert.match(renderer,/scene\.render\.ffmpeg\.codec='QTRLE'/);
  assert.match(renderer,/gravity_mps2/);
  assert.match(renderer,/linear_drag/);
  assert.match(renderer,/restitution/);
  assert.match(renderer,/provider_calls_performed: false/);
});

test('simulation executor persists unapproved pass artifacts and requires existing QC seal',()=>{
  assert.match(executor,/CreativeSimulationRuntime\.assertReady/);
  assert.match(executor,/CreativeParticleSimulationRenderRuntime\.render/);
  assert.match(executor,/pass_id:"simulation"/);
  assert.match(executor,/physics_qc_required:true/);
  assert.match(executor,/simulation_qc_seal_required_before_compositing:true/);
  assert.match(artifact,/simulation_qc_sealed:false/);
  assert.match(artifact,/AVANTIQO_SIMULATION_QC_SEAL_V1/);
  assert.match(artifact,/SIMULATION_QC_SEAL_HASH_REQUIRED/);
  assert.match(planner,/simulation_contract: object\(shot\.simulation_contract\)/);
});

test('simulation multipass node completes only from sealed artifacts',()=>{
  const graph={nodes:[
    {id:'s1',type:'SHOT',requirements:{simulation_contract:{simulations:[{simulation_id:'a'}]}}},
    {id:'pass:s1:simulation',intent:{pass_role:'PHYSICAL_SIMULATION'},requirements:{shot_id:'s1'},metadata:{multipass_pass:true},quality:{}}
  ],metadata:{}};
  const unsealed={id:'asset1',metadata:{shot_id:'s1',pass_id:'simulation',simulation_qc_sealed:false}};
  const blocked=CreativeSimulationPassBridgeRuntime.reconcile({graph,asset_nodes:[unsealed]});
  assert.notEqual(blocked.nodes[1].metadata.execution_completed,true);
  const sealed={id:'asset1',metadata:{shot_id:'s1',pass_id:'simulation',simulation_qc_sealed:true,simulation_qc_seal_contract:'AVANTIQO_SIMULATION_QC_SEAL_V1',simulation_qc_seal_hash:'b'.repeat(64)}};
  const completed=CreativeSimulationPassBridgeRuntime.reconcile({graph,asset_nodes:[sealed]});
  assert.equal(completed.nodes[1].metadata.execution_completed,true);
  assert.equal(completed.nodes[1].quality.approved,true);
});

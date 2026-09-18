import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const materializer=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationTaskMaterializationRuntime.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');
const executor=fs.readFileSync('lib/creative/simulation/runtime/CreativeSimulationPassExecutionRuntime.js','utf8');

test('simulation task materialization is limited to the governed physical-simulation pass',()=>{
  assert.match(materializer,/PHYSICAL_SIMULATION/);
  assert.match(materializer,/multipass_pass===true/);
  assert.match(materializer,/BASE_PLATE_CERTIFICATION_REQUIRED/);
  assert.match(materializer,/SIMULATION_CONTRACT_REQUIRED/);
  assert.match(materializer,/creative\.simulation\.execute/);
  assert.match(materializer,/simulation_pass_node_id/);
  assert.match(materializer,/simulation_backend_selection_authority:"SIMULATION_CLASS"/);
});

test('materializer is idempotent and does not create duplicate simulation tasks',()=>{
  assert.match(materializer,/tasks\.find\(t=>text\(t\.metadata\?\.simulation_pass_node_id\)/);
  assert.match(materializer,/existing\.push\(prior\)/);
});

test('central production queue automatically ensures simulation tasks',()=>{
  assert.match(queue,/CreativeSimulationTaskMaterializationRuntime\.ensure\(input\)/);
  assert.match(queue,/simulationMaterialization\.created\.length/);
});

test('local simulation execution requires exact capability and physical pass role',()=>{
  assert.match(queue,/capability === "creative\.simulation\.execute"/);
  assert.match(queue,/passRole === "PHYSICAL_SIMULATION"/);
  assert.match(queue,/if \(localSimulationOperation\(routed\)\) return dispatchSimulationTask\(routed\)/);
});

test('local simulation worker reuses normal dossier authority before owned execution',()=>{
  assert.match(queue,/CreativeProductionDossierExecutionGate\.approvedDossier\(task\)/);
  assert.match(queue,/CreativeProjectRepository\.getById/);
  assert.match(queue,/CreativeSimulationPassExecutionRuntime\.execute/);
  assert.match(queue,/provider: "avantiqo-owned-simulation"/);
  assert.match(queue,/settlement: "LOCAL_EXECUTION"/);
  assert.match(queue,/provider_calls_performed: false/);
});

test('owned executor selects backend solely from authored simulation class',()=>{
  assert.match(executor,/simulation\.simulation_class==="PARTICLE_GRANULAR"/);
  assert.match(executor,/\["RIGID_BODY","DESTRUCTION_FRACTURE"\]\.includes/);
  assert.match(executor,/simulation\.simulation_class==="PYRO_SMOKE_FIRE"/);
  assert.match(executor,/simulation\.simulation_class==="LIQUID_FLUID"/);
  assert.match(executor,/simulation\.simulation_class==="DEFORMABLE_CLOTH"/);
  assert.match(executor,/simulation\.simulation_class==="DEFORMABLE_SOFT_BODY"/);
  assert.match(executor,/SIMULATION_RENDER_BACKEND_UNAVAILABLE/);
});

import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeBasePlateContractRuntime } from '../lib/creative/multipass/runtime/CreativeBasePlateContractRuntime.js';
import { CreativeBasePlatePassBridgeRuntime } from '../lib/creative/multipass/runtime/CreativeBasePlatePassBridgeRuntime.js';

const visualGraph=fs.readFileSync('lib/creative/production-graph/runtime/CreativeVisualProductionGraphRuntime.js','utf8');
const executionGate=fs.readFileSync('lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js','utf8');

test('base plate contract preserves pass separation and reconstruction authority',()=>{
  const contract=CreativeBasePlateContractRuntime.build({shot:{id:'s1',source_reinterpretation:{required:true},scene_reconstruction_contract:{contract_hash:'rh'}},reconstruction_pass_node_id:'pass:s1:scene-reconstruction'});
  assert.equal(contract.rules.reconstruction_certification_required_before_dispatch,true);
  assert.equal(contract.rules.later_pass_responsibilities_must_remain_separable,true);
  assert.ok(contract.forbidden_baked_layers.some(x=>x.includes('physical simulation')));
  assert.ok(contract.forbidden_baked_layers.some(x=>x.includes('motion graphics')));
  assert.ok(contract.forbidden_baked_layers.some(x=>x.includes('final color grade')));
});

test('visual graph links certified reconstruction to derived-frame executor and base-plate pass',()=>{
  assert.match(visualGraph,/base_plate_contract: basePlate/);
  assert.match(visualGraph,/from: reconstructionPass\.id[\s\S]*to: derivedFrameNodeId/);
  assert.match(visualGraph,/from: derivedFrameNodeId[\s\S]*to: basePlatePass\.id/);
  assert.match(visualGraph,/base_plate_execution_node_id: derivedFrameNodeId/);
  assert.match(visualGraph,/later_pass_responsibilities_must_remain_separable: true/);
});

test('dispatch gate fail-closes before provider execution when reconstruction evidence is absent',()=>{
  assert.match(executionGate,/BASE_PLATE_RECONSTRUCTION_CERTIFICATION_REQUIRED/);
  assert.match(executionGate,/BASE_PLATE_RECONSTRUCTION_CERTIFICATION_HASH_REQUIRED/);
  assert.match(executionGate,/BASE_PLATE_RECONSTRUCTION_ARTIFACT_EVIDENCE_REQUIRED/);
  assert.match(executionGate,/assertBasePlateReconstructionCertified\(task\)/);
});

test('perceptually approved derived frame reconciles the bookkeeping base-plate pass',()=>{
  const graph={nodes:[
    {id:'pass:s1:base-plate',intent:{pass_role:'BASE_PLATE'},metadata:{multipass_pass:true,base_plate_execution_node_id:'s1:visual-derived-frame'},quality:{}},
  ],metadata:{}};
  const tasks=[{id:'t1',status:'COMPLETED',metadata:{execution_node_id:'s1:visual-derived-frame',approved_for_downstream_after_perceptual_review:true,automated_perceptual_validation_passed:true,shot_candidate_review_score:96},output:{output:{asset_url:'storage://creative-assets/o/p/base.png'}}}];
  const next=CreativeBasePlatePassBridgeRuntime.reconcile({graph,tasks});
  const pass=next.nodes[0];
  assert.equal(pass.metadata.execution_completed,true);
  assert.equal(pass.metadata.artifact_evidence_complete,true);
  assert.equal(pass.quality.approved,true);
  assert.equal(pass.quality.score,96);
  assert.equal(pass.metadata.base_plate_task_id,'t1');
});

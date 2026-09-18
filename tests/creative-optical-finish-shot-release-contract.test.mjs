import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeCompositePassBridgeRuntime } from '../lib/creative/multipass/runtime/CreativeCompositePassBridgeRuntime.js';
import { CreativeOpticalFinishPassBridgeRuntime } from '../lib/creative/multipass/runtime/CreativeOpticalFinishPassBridgeRuntime.js';
import { CreativeShotFinalQcBridgeRuntime } from '../lib/creative/multipass/runtime/CreativeShotFinalQcBridgeRuntime.js';
import { CreativeMultiPassShotRuntime } from '../lib/creative/multipass/runtime/CreativeMultiPassShotRuntime.js';

const optical=fs.readFileSync('lib/creative/post-production/runtime/CreativeOpticalFinishingRuntime.js','utf8');

test('shot pipeline ends at optical QC and defers final Color/DI until after edit',()=>{
  const multi=CreativeMultiPassShotRuntime.buildForShot({id:'s1',source_reinterpretation:{required:true},primary_source_asset_id:'a1'});
  assert.ok(multi.passes.some(p=>p.id==='optical-finish'));
  assert.ok(multi.passes.some(p=>p.id==='shot-qc'&&p.depends_on.includes('optical-finish')));
  assert.equal(multi.passes.some(p=>p.id==='color-di'),false);
  assert.equal(multi.rules.final_color_di_is_project_level_after_edit,true);
});

test('reviewed layered composite completes FINAL_COMPOSITE pass',()=>{
  const graph={nodes:[{id:'pass:s1:composite',intent:{pass_role:'FINAL_COMPOSITE'},requirements:{shot_id:'s1'},metadata:{multipass_pass:true},quality:{}}],metadata:{}};
  const asset={id:'c1',technical:{checksum:'abc'},metadata:{shot_id:'s1',compositing_render_contract:'AVANTIQO_LAYERED_COMPOSITING_RENDER_V1',compositing_source_gate_passed:true,shot_candidate_review_passed:true,selected_for_master:true,shot_candidate_review_score:97}};
  const next=CreativeCompositePassBridgeRuntime.reconcile({graph,asset_nodes:[asset]});
  assert.equal(next.nodes[0].metadata.execution_completed,true);
  assert.equal(next.nodes[0].quality.approved,true);
});

test('optical finishing is a deterministic lens stage and explicitly forbids color grading',()=>{
  assert.match(optical,/CREATIVE_OPTICAL_FINISHING_V1/);
  assert.match(optical,/lenscorrection/);
  assert.match(optical,/rgbashift/);
  assert.match(optical,/gblur/);
  assert.match(optical,/vignette/);
  assert.match(optical,/noise=alls/);
  assert.match(optical,/color_grade_forbidden:true/);
  assert.match(optical,/CreativeRenderTechnicalQualityRuntime\.evaluate/);
  assert.match(optical,/optical_technical_qc_passed/);
});

test('optical pass completes only after technical and perceptual review',()=>{
  const graph={nodes:[{id:'pass:s1:optical-finish',intent:{pass_role:'OPTICAL_FINISH'},requirements:{shot_id:'s1'},metadata:{multipass_pass:true},quality:{}}],metadata:{}};
  const unreviewed={id:'o1',metadata:{shot_id:'s1',pass_id:'optical-finish',optical_contract:'CREATIVE_OPTICAL_FINISHING_V1',optical_technical_qc_passed:true,shot_candidate_review_passed:false}};
  let next=CreativeOpticalFinishPassBridgeRuntime.reconcile({graph,asset_nodes:[unreviewed]});
  assert.notEqual(next.nodes[0].metadata.execution_completed,true);
  const reviewed={...unreviewed,technical:{checksum:'def'},metadata:{...unreviewed.metadata,shot_candidate_review_passed:true,shot_candidate_review_score:96}};
  next=CreativeOpticalFinishPassBridgeRuntime.reconcile({graph,asset_nodes:[reviewed]});
  assert.equal(next.nodes[0].metadata.execution_completed,true);
  assert.equal(next.nodes[0].metadata.optical_perceptual_review_passed,true);
});

test('final shot QC releases optical-finished shot to edit but leaves global Color/DI pending',()=>{
  const graph={nodes:[{id:'pass:s1:shot-qc',intent:{pass_role:'PERCEPTUAL_AND_TECHNICAL_QC'},requirements:{shot_id:'s1'},metadata:{multipass_pass:true},quality:{}}],metadata:{}};
  const opticalAsset={id:'o1',metadata:{shot_id:'s1',pass_id:'optical-finish',optical_technical_qc_passed:true,shot_candidate_review_passed:true,shot_candidate_review_score:98}};
  const next=CreativeShotFinalQcBridgeRuntime.reconcile({graph,asset_nodes:[opticalAsset]});
  assert.equal(next.nodes[0].metadata.shot_release_ready_for_edit,true);
  assert.equal(next.nodes[0].metadata.final_color_di_pending_after_edit,true);
  assert.equal(next.metadata.final_color_di_stage,'PROJECT_LEVEL_AFTER_EDIT');
});

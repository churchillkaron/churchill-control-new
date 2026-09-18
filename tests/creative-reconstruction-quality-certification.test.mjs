import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSceneReconstructionQualityRuntime } from '../lib/creative/reconstruction/runtime/CreativeSceneReconstructionQualityRuntime.js';
import { CreativeMultiPassExecutionRuntime } from '../lib/creative/multipass/runtime/CreativeMultiPassExecutionRuntime.js';

const kinds=['DEPTH_MAP','IMAGE_SEGMENTATION_MASK','SURFACE_NORMAL_MAP','GEOMETRY_PROXY_OBJ','SINGLE_VIEW_CAMERA_PROXY','PRACTICAL_LIGHT_MAP','SURFACE_MATERIAL_MAP'];
const sha='a'.repeat(64);
const manifest={
  contract:'CREATIVE_SCENE_RECONSTRUCTION_ASSEMBLER_V1',shot_id:'s1',reconstruction_contract_hash:'hash1',
  artifacts:Object.fromEntries(kinds.map((kind,i)=>[`a${i}`,{node_id:`n${i}`,artifact_kind:kind,storage_reference:`storage://b/o/p/${i}`,checksum_sha256:sha}])),
  truth_limits:{single_view_source:true,metric_scale_resolved:false,full_hidden_geometry_reconstructed:false,large_orbit_allowed:false,reverse_angle_allowed:false}
};
const review={
  contract:'CREATIVE_SCENE_RECONSTRUCTION_SEMANTIC_REVIEW_V1',passed:true,failures:[],
  source_identity_preserved:true,architecture_preserved:true,layout_preserved:true,distinctive_materials_preserved:true,
  signage_brand_marks_preserved:true,major_object_placement_preserved:true,depth_order_plausible:true,segmentation_plausible:true,
  material_regions_plausible:true,practical_light_evidence_plausible:true,camera_proxy_within_safe_motion_bounds:true,hallucinated_architecture_absent:true,
  source_fidelity_score:98,architecture_score:97,geometry_consistency_score:95,material_grounding_score:94,lighting_grounding_score:93,overall_score:96,
};

test('complete grounded reconstruction can certify and unlock base plate',()=>{
  const result=CreativeSceneReconstructionQualityRuntime.evaluate({manifest,semantic_review:review});
  assert.equal(result.passed,true);
  assert.equal(result.base_plate_unlock_allowed,true);
  assert.match(result.certification_hash,/^[a-f0-9]{64}$/);

  const graph={nodes:[
    {id:'s1',type:'SHOT',requirements:{multipass_contract:{contract:'CREATIVE_MULTIPASS_SHOT_CONTRACT_V1',passes:[
      {id:'scene-reconstruction',role:'SCENE_RECONSTRUCTION',depends_on:[],required:true},
      {id:'base-plate',role:'BASE_PLATE',depends_on:['scene-reconstruction'],required:true},
      {id:'composite',role:'FINAL_COMPOSITE',depends_on:['base-plate'],required:true},
      {id:'shot-qc',role:'PERCEPTUAL_AND_TECHNICAL_QC',depends_on:['composite'],required:true},
    ]}}},
    {id:'pass:s1:scene-reconstruction',metadata:{},quality:{}},
    {id:'s1:visual-derived-frame',metadata:{shot_id:'s1',base_plate_role:true},requirements:{},generation:{provider_parameters:{}}},
    {id:'pass:s1:base-plate',metadata:{},quality:{}},
    {id:'pass:s1:composite',metadata:{},quality:{}},
    {id:'pass:s1:shot-qc',metadata:{},quality:{}},
  ],metadata:{}};
  const certifiedGraph=CreativeSceneReconstructionQualityRuntime.applyToGraph({graph,shot_id:'s1',certification:result});
  const state=CreativeMultiPassExecutionRuntime.readiness({graph:certifiedGraph,shot_id:'s1',reconstruction_readiness:{ready:true}});
  assert.ok(state.next_ready_passes.some(p=>p.pass_id==='base-plate'));
  assert.equal(certifiedGraph.nodes.find(n=>n.id==='pass:s1:scene-reconstruction').quality.approved,true);
  const executor=certifiedGraph.nodes.find(n=>n.id==='s1:visual-derived-frame');
  assert.equal(executor.requirements.reconstruction_certification_passed,true);
  assert.equal(executor.requirements.reconstruction_qc_certification_hash,result.certification_hash);
  assert.equal(executor.requirements.reconstruction_artifact_node_ids.length,7);
});

test('missing semantic review fails closed',()=>{
  const result=CreativeSceneReconstructionQualityRuntime.evaluate({manifest,semantic_review:{}});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes('RECONSTRUCTION_SEMANTIC_REVIEW_REQUIRED'));
});

test('low fidelity or hallucinated architecture blocks certification',()=>{
  const bad={...review,source_fidelity_score:80,hallucinated_architecture_absent:false,passed:false};
  const result=CreativeSceneReconstructionQualityRuntime.evaluate({manifest,semantic_review:bad});
  assert.equal(result.passed,false);
  assert.ok(result.failures.some(f=>f.includes('source_fidelity_score')));
  assert.ok(result.failures.some(f=>f.includes('hallucinated_architecture_absent')));
});

test('single-view reconstruction cannot overclaim hidden geometry or orbit freedom',()=>{
  const badManifest={...manifest,truth_limits:{...manifest.truth_limits,full_hidden_geometry_reconstructed:true,large_orbit_allowed:true}};
  const result=CreativeSceneReconstructionQualityRuntime.evaluate({manifest:badManifest,semantic_review:review});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes('RECONSTRUCTION_HIDDEN_GEOMETRY_OVERCLAIMED'));
  assert.ok(result.failures.includes('RECONSTRUCTION_LARGE_ORBIT_FORBIDDEN'));
});

test('missing durable artifact checksum blocks certification',()=>{
  const artifacts=structuredClone(manifest.artifacts); artifacts.a0.checksum_sha256='';
  const result=CreativeSceneReconstructionQualityRuntime.evaluate({manifest:{...manifest,artifacts},semantic_review:review});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes('RECONSTRUCTION_CHECKSUM_INVALID:DEPTH_MAP'));
});

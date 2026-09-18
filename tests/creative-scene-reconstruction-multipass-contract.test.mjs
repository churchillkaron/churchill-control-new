import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeSceneReconstructionRuntime } from '../lib/creative/reconstruction/runtime/CreativeSceneReconstructionRuntime.js';
import { CreativeMultiPassShotRuntime } from '../lib/creative/multipass/runtime/CreativeMultiPassShotRuntime.js';

test('Churchill-like venue still becomes reconstruction truth plus premium multipass production', () => {
  const shot = {
    id:'shot-churchill-1', title:'Pool table strike', subject:'Churchill restaurant interior and orange pool table',
    action:'Macro cue strike transitions into a low tracking move through the real venue.', duration_seconds:4,
    primary_source_asset_id:'churchill-photo-1',
    reference_assets:[{asset_id:'churchill-photo-1',role:'PRIMARY_SOURCE'}],
    source_reinterpretation:{required:true,mode:'CINEMATIC_REINTERPRETATION',identity_truth:'Preserve the real Churchill architecture, orange pool cloth, bar layout and distinctive venue features.',production_value_transformation:'Re-photograph the real venue with sculpted practical lighting, macro material detail, haze, depth, controlled camera acceleration and premium optical finishing.',new_viewpoint_logic:'Use reconstructed room depth and world anchors to support a physically plausible low tracking camera path without inventing doors, walls or furniture.',vfx_cgi_integration:'Physically integrate cue-chalk particles, contact shadow, reflected practical light and atmospheric depth into the reconstructed real venue.',consumer_ai_failure_test:'A slow zoom, depth-map parallax, stock fog or generic particle overlay on the uploaded still is an automatic failure.',source_frame_is_not_final_frame:true},
    vfx:[{effect:'chalk particulate impact with tracked integration'}],
  };
  const recon=CreativeSceneReconstructionRuntime.buildForShot(shot);
  assert.equal(recon.contract,'CREATIVE_SCENE_RECONSTRUCTION_CONTRACT_V1');
  assert.equal(recon.world_truth_locks.preserve_architecture,true);
  assert.equal(recon.world_truth_locks.hallucinated_architecture_forbidden,true);
  assert.ok(recon.output_layers.includes('DEPTH_MAP'));
  assert.ok(recon.output_layers.includes('GEOMETRY_PROXY'));
  const enriched={...shot,scene_reconstruction_contract:recon};
  const multi=CreativeMultiPassShotRuntime.buildForShot(enriched);
  assert.equal(multi.contract,'CREATIVE_MULTIPASS_SHOT_CONTRACT_V1');
  const ids=multi.passes.map(p=>p.id);
  for(const id of ['scene-reconstruction','base-plate','vfx-integration','lighting-interaction','reflection-shadow','composite','optical-finish','shot-qc']) assert.ok(ids.includes(id),id);
  assert.equal(multi.rules.single_generation_equals_finished_shot_forbidden,true);
  assert.equal(multi.rules.final_color_di_is_project_level_after_edit,true);
  assert.equal(multi.rules.per_shot_final_color_di_forbidden,true);
  assert.equal(multi.passes.some(p=>p.id==='color-di'),false);
});

test('synthetic hero VFX shot can use multipass production without venue reconstruction',()=>{
  const shot={id:'brain-birth',title:'Brain birth',subject:'Avantiqo intelligence core',action:'Mechanical intelligence architecture assembles under controlled pressure.',duration_seconds:5,vfx:[{effect:'mechanical assembly and material interaction'}],source_reinterpretation:{required:false}};
  assert.equal(CreativeSceneReconstructionRuntime.buildForShot(shot),null);
  const multi=CreativeMultiPassShotRuntime.buildForShot(shot);
  assert.ok(multi);
  assert.ok(multi.passes.some(p=>p.id==='base-plate'));
  assert.ok(multi.passes.some(p=>p.id==='vfx-integration'));
  assert.ok(multi.passes.some(p=>p.id==='composite'));
  assert.ok(multi.passes.some(p=>p.id==='shot-qc'));
});

test('multipass graph creates explicit pass dependency nodes',()=>{
  const shot={id:'s1',title:'Venue hero',duration_seconds:3,primary_source_asset_id:'a1',source_reinterpretation:{required:true,mode:'CINEMATIC_REINTERPRETATION'},scene_reconstruction_contract:{contract:'CREATIVE_SCENE_RECONSTRUCTION_CONTRACT_V1'},vfx:[{effect:'integrated atmosphere'}]};
  const authored=CreativeMultiPassShotRuntime.author({shots:[shot],creative_plan:{}});
  const graph={nodes:[{id:'s1',type:'SHOT',requirements:{},metadata:{}}],edges:[],metadata:{}};
  const next=CreativeMultiPassShotRuntime.applyToGraph(graph,authored.shots);
  assert.equal(next.metadata.multipass_injected_shot_count,1);
  assert.ok(next.nodes.some(n=>n.id==='pass:s1:composite'));
  assert.ok(next.edges.some(e=>e.from==='pass:s1:base-plate' && e.to==='pass:s1:composite'));
});

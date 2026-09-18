import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeAovCompositingRuntime } from '../lib/creative/compositing/runtime/CreativeAovCompositingRuntime.js';

const req=['COMBINED','DEPTH','NORMAL','VECTOR'];
function base(){return{shot_id:'s1',base_plate_asset_node_id:'base',camera_solution_asset_node_id:'cam',depth_authority_asset_node_id:'depth',scene_linear:true,aovs:req.map((role,i)=>({role,asset_node_id:`a${i}`}))};}

test('AOV composite requires camera, depth and scene-linear authority',()=>{const p=CreativeAovCompositingRuntime.author(base());assert.equal(p.status,'READY');assert.equal(p.color_policy.creative_grade_after_composite_only,true);});
test('flattening CGI before integration is forbidden',()=>{const p=CreativeAovCompositingRuntime.author(base());assert.equal(p.render_policy.aov_preservation_required,true);assert.equal(p.render_policy.flatten_only_after_qc,true);});
test('missing motion/depth/normal AOV fails closed',()=>{const i=base();i.aovs=i.aovs.filter(a=>a.role!=='VECTOR');const p=CreativeAovCompositingRuntime.author(i);assert.equal(p.status,'BLOCKED');assert.ok(p.blockers.includes('AOV_REQUIRED:VECTOR'));});
test('specular/transmission/shadow remain independent controls',()=>{const i=base();i.aovs.push({role:'GLOSSY_DIRECT',asset_node_id:'g'},{role:'TRANSMISSION_DIRECT',asset_node_id:'t'},{role:'SHADOW',asset_node_id:'sh'});const p=CreativeAovCompositingRuntime.author(i);assert.equal(p.status,'READY');assert.equal(p.light_integration_policy.diffuse_and_specular_separate,true);});

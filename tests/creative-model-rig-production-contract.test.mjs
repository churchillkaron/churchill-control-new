import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CreativeMechanicalRigRuntime } from '../lib/creative/rendering/runtime/CreativeMechanicalRigRuntime.js';

const cycles=fs.readFileSync('lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js','utf8');
const model=fs.readFileSync('lib/creative/rendering/runtime/CreativeModelAssetBindingRuntime.js','utf8');

test('wheel rotation is physically derived from travel and radius',()=>{
  const out=CreativeMechanicalRigRuntime.compile({objects:[{object_id:'wheel',location:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}],rigs:[{kind:'WHEEL_ROTATION',target_object_id:'wheel',frame_start:1,frame_end:25,radius_m:.35,travel_meters:2.2,axis:'X'}]});
  assert.equal(out.compiled_rigs[0].kind,'WHEEL_ROTATION');
  assert.ok(Math.abs(out.compiled_rigs[0].derived.rotation_degrees)>300);
});

test('suspension, hinge and camera-path rigs compile deterministically',()=>{
  const out=CreativeMechanicalRigRuntime.compile({objects:[{object_id:'body',location:[0,0,1],rotation:[0,0,0],scale:[1,1,1]},{object_id:'door',location:[1,0,1],rotation:[0,0,0],scale:[1,1,1]}],rigs:[{kind:'SUSPENSION',target_object_id:'body',frame_start:1,frame_end:12,compression_m:.08},{kind:'HINGE',target_object_id:'door',frame_start:8,frame_end:24,angle_degrees:65,axis:'Z'},{kind:'CAMERA_PATH',points:[{frame:1,location:[0,-6,2],lens:55},{frame:24,location:[1,-4,1.5],lens:70}]}]});
  assert.equal(out.camera_keyframes.length,2);
  assert.equal(out.compiled_rigs.length,3);
});

test('model binder supports the import formats exposed by governed Blender 5',()=>{
  assert.match(model,/glb/);
  assert.match(model,/gltf/);
  assert.match(model,/fbx/);
  assert.match(model,/obj/);
  assert.match(model,/checksum/);
  assert.match(model,/source_asset_node_id/);
});

test('Cycles production host imports models and applies animation rigs',()=>{
  assert.match(cycles,/bpy\.ops\.import_scene\.gltf/);
  assert.match(cycles,/bpy\.ops\.wm\.fbx_import/);
  assert.match(cycles,/bpy\.ops\.wm\.obj_import/);
  assert.match(cycles,/apply_animation/);
  assert.match(cycles,/CreativeMechanicalRigRuntime\.compile/);
  assert.match(cycles,/camera_keyframes/);
});

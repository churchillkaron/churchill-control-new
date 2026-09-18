import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeMatchmoveAuthorityRuntime } from '../lib/creative/tracking/runtime/CreativeMatchmoveAuthorityRuntime.js';
import { CreativeRotoMatteAuthorityRuntime } from '../lib/creative/roto/runtime/CreativeRotoMatteAuthorityRuntime.js';
import { CreativeTemporal4KMasteringRuntime } from '../lib/creative/upscale/runtime/CreativeTemporal4KMasteringRuntime.js';

test('2D affine tracking allows planar graphics but not world-space CGI',()=>{
  const r=CreativeMatchmoveAuthorityRuntime.evaluate({track_result:{samples:[{tracked_points:40,inliers:25},{tracked_points:38,inliers:22}]}});
  assert.equal(r.status,'READY');
  assert.equal(r.mode,'PLANAR_AFFINE_TRACK');
  assert.equal(r.authority.planar_graphics_allowed,true);
  assert.equal(r.authority.world_space_cgi_allowed,false);
});

test('3D matchmove authority requires camera intrinsics lens model and parallax evidence',()=>{
  const r=CreativeMatchmoveAuthorityRuntime.evaluate({track_result:{samples:[{tracked_points:60,inliers:40},{tracked_points:52,inliers:36}]},camera_intrinsics:{fx:1000},lens_model:{type:'BROWN_CONRADY'},parallax_evidence:{sufficient:true}});
  assert.equal(r.mode,'CAMERA_3D_SOLVE');
  assert.equal(r.authority.world_space_cgi_allowed,true);
});

test('roto authority requires temporal propagation edge refinement and motion blur matte',()=>{
  const r=CreativeRotoMatteAuthorityRuntime.author({subject_id:'car',seed_matte_asset_node_id:'seed',tracking_asset_node_id:'track'});
  assert.equal(r.status,'READY');
  assert.equal(r.qc.temporal_chatter_forbidden,true);
});

test('temporal 4K plan uses FlashVSR and forbids independent per-frame SR',()=>{
  const r=CreativeTemporal4KMasteringRuntime.plan({source_width:1920,source_height:1080,fps:24,frame_count:120,source_asset_node_id:'master'});
  assert.equal(r.status,'READY');
  assert.equal(r.flashvsr.worker_contract,'AVANTIQO_VIDEO_FLASHVSR_GPU_MASTER_V1');
  assert.equal(r.flashvsr.per_frame_independent_sr_forbidden,true);
  assert.equal(r.delivery.target_width,3840);
  assert.equal(r.delivery.target_height,2160);
  assert.equal((r.flashvsr.padded_frame_count-1)%8,0);
});

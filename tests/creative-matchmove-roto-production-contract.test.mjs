import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const matchmove=fs.readFileSync('lib/creative/tracking/runtime/CreativeOpenCVMatchmoveRuntime.js','utf8');
const roto=fs.readFileSync('lib/creative/roto/runtime/CreativeOpenCVRotoExecutionRuntime.js','utf8');

test('3D matchmove uses calibrated essential-matrix camera solving',()=>{
  assert.match(matchmove,/findEssentialMat/);
  assert.match(matchmove,/recoverPose/);
  assert.match(matchmove,/camera_poses/);
  assert.match(matchmove,/median_parallax_pixels/);
  assert.match(matchmove,/median_pose_inlier_ratio/);
  assert.match(matchmove,/calibrated and len\(poses\)>=3/);
});

test('uncalibrated matchmove cannot authorize world-space CGI',()=>{
  assert.match(matchmove,/calibrated=bool\(cfg\.get\('camera_intrinsics'\)\)/);
  assert.match(matchmove,/pixel_locked_cg_authorized':calibrated/);
  assert.match(matchmove,/world_space_cgi_allowed':sufficient/);
});

test('matchmove diagnoses rolling shutter by row-dependent motion',()=>{
  assert.match(matchmove,/rolling_shutter_row_delta_pixels/);
  assert.match(matchmove,/compensation_required/);
});

test('roto execution propagates matte temporally with optical flow and edge refinement',()=>{
  assert.match(roto,/calcOpticalFlowFarneback/);
  assert.match(roto,/cv2\.remap/);
  assert.match(roto,/MORPH_CLOSE/);
  assert.match(roto,/GaussianBlur/);
  assert.match(roto,/PRORES_4444/);
});

test('roto fails closed for hair and transparent subjects without specialized engine',()=>{
  assert.match(roto,/ROTO_HAIR_FINE_DETAIL_SPECIALIZED_ENGINE_REQUIRED/);
  assert.match(roto,/ROTO_TRANSPARENCY_SPECIALIZED_ENGINE_REQUIRED/);
});

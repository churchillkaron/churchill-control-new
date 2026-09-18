import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const matchmove=fs.readFileSync('lib/creative/tracking/runtime/CreativeOpenCVMatchmoveExecutionRuntime.js','utf8');
const roto=fs.readFileSync('lib/creative/roto/runtime/CreativeOpenCVRotoExecutionRuntime.js','utf8');

test('3D matchmove execution uses calibrated essential matrix and pose recovery',()=>{
  assert.match(matchmove,/cv2\.findEssentialMat/);
  assert.match(matchmove,/cv2\.recoverPose/);
  assert.match(matchmove,/camera_intrinsics/);
  assert.match(matchmove,/lens_model/);
  assert.match(matchmove,/parallax_evidence/);
  assert.match(matchmove,/CreativeMatchmoveAuthorityRuntime\.evaluate/);
});

test('3D matchmove preserves lens distortion and rolling shutter evidence',()=>{
  assert.match(matchmove,/cv2\.undistort/);
  assert.match(matchmove,/BROWN_CONRADY/);
  assert.match(matchmove,/rolling_shutter_model/);
});

test('roto execution temporally propagates mattes using dense optical flow',()=>{
  assert.match(roto,/cv2\.calcOpticalFlowFarneback/);
  assert.match(roto,/cv2\.remap/);
  assert.match(roto,/temporal_propagation/);
});

test('roto execution refines edges and packages lossless grayscale matte video',()=>{
  assert.match(roto,/cv2\.morphologyEx/);
  assert.match(roto,/cv2\.GaussianBlur/);
  assert.match(roto,/"-c:v","ffv1"/);
  assert.match(roto,/"-pix_fmt","gray"/);
  assert.match(roto,/CreativeRotoMatteAuthorityRuntime\.author/);
});

test('both execution lanes are owned and make no provider calls',()=>{
  assert.match(matchmove,/provider_calls_performed:false/);
  assert.match(roto,/provider_calls_performed:false/);
});

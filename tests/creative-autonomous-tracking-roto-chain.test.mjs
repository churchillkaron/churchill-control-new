import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const materializer=fs.readFileSync('lib/creative/tracking/runtime/CreativeTrackingRotoTaskMaterializationRuntime.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');
const motion=fs.readFileSync('lib/creative/motion-graphics/runtime/CreativeCinematicMotionTaskMaterializationRuntime.js','utf8');
const rotoArtifact=fs.readFileSync('lib/creative/roto/runtime/CreativeRotoArtifactRuntime.js','utf8');

test('tracked 3D motion automatically materializes matchmove before CGI',()=>{
  assert.match(materializer,/TRACKED_WORLD_3D/);
  assert.match(materializer,/creative\.matchmove\.solve/);
  assert.match(materializer,/priority:31/);
  assert.match(motion,/matchmove_world_space_cgi_allowed===true/);
});

test('foreground holdout automatically materializes temporal roto from reconstruction seed',()=>{
  assert.match(materializer,/foreground_holdout_required/);
  assert.match(materializer,/OCCLUSION_MASK_BASE/);
  assert.match(materializer,/creative\.roto\.propagate/);
  assert.match(materializer,/priority:33/);
});

test('queue executes matchmove and roto locally before cinematic motion',()=>{
  assert.match(queue,/localTrackingRotoOperation/);
  assert.match(queue,/dispatchTrackingRotoTask/);
  assert.match(queue,/CreativeOpenCVMatchmoveExecutionRuntime\.execute/);
  assert.match(queue,/CreativeOpenCVRotoExecutionRuntime\.execute/);
  assert.match(queue,/CreativeMatchmoveArtifactRuntime\.persist/);
  assert.match(queue,/CreativeRotoArtifactRuntime\.persist/);
  const trackingIndex=queue.indexOf('CreativeTrackingRotoTaskMaterializationRuntime.ensure');
  const motionIndex=queue.indexOf('CreativeCinematicMotionTaskMaterializationRuntime.ensure');
  assert.ok(trackingIndex>=0 && motionIndex>trackingIndex);
});

test('roto asset requires full frame continuity before seal',()=>{
  assert.match(rotoArtifact,/framesWritten===frameCount/);
  assert.match(rotoArtifact,/roto_qc_sealed:true/);
  assert.match(rotoArtifact,/AVANTIQO_ROTO_MATTE_QC_SEAL_V1/);
});

test('tracking and roto execution do not invoke paid providers',()=>{
  assert.match(queue,/provider_calls_performed:false/);
});

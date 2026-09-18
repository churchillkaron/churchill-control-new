import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const multipass=fs.readFileSync('lib/creative/multipass/runtime/CreativeMultiPassShotRuntime.js','utf8');
const temporal=fs.readFileSync('lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js','utf8');
const planner=fs.readFileSync('lib/creative/production-graph/planner/ProductionGraphPlanner.js','utf8');
const materializer=fs.readFileSync('lib/creative/motion-graphics/runtime/CreativeCinematicMotionTaskMaterializationRuntime.js','utf8');
const brand=fs.readFileSync('lib/creative/motion-graphics/runtime/CreativeCinematicBrandLockRuntime.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');

test('director shot contract exposes governed cinematic motion events',()=>{
  assert.match(temporal,/cinematic_motion_events/);
  assert.match(temporal,/PROCEDURAL_ASSEMBLY/);
  assert.match(temporal,/MATERIAL_TRANSFORMATION/);
  assert.match(temporal,/TRANSITION_PHYSICS/);
  assert.match(temporal,/Generic fade, slide, zoom, glow, light sweep or stock-particle behavior is forbidden/);
});

test('production graph preserves cinematic motion requirements',()=>{
  assert.match(planner,/cinematic_motion_design/);
  assert.match(planner,/cinematic_motion_events/);
});

test('multipass pipeline places cinematic motion before physical interaction and final composite',()=>{
  assert.match(multipass,/CINEMATIC_MOTION_DESIGN/);
  assert.match(multipass,/hasCinematicMotion/);
  assert.match(multipass,/hasCinematicMotion \? 'cinematic-motion' : null/);
  assert.match(multipass,/LIGHTING_INTERACTION/);
  assert.match(multipass,/FINAL_COMPOSITE/);
});

test('source-world cinematic motion auto-binds certified reconstruction evidence',()=>{
  assert.match(materializer,/SOURCE_WORLD_INTEGRATED/);
  assert.match(materializer,/CAMERA_SOLUTION/);
  assert.match(materializer,/SINGLE_VIEW_CAMERA_PROXY/);
  assert.match(materializer,/DEPTH_MAP/);
  assert.match(materializer,/reconstruction_qc_passed===true/);
});

test('cinematic motion is a local owned queue lane with dedicated QC seal',()=>{
  assert.match(queue,/localCinematicMotionOperation/);
  assert.match(queue,/CreativeCinematicMotionTaskMaterializationRuntime\.ensure/);
  assert.match(queue,/CreativeCinematicMotionDesignRenderRuntime\.render/);
  assert.match(queue,/CreativeMultiPassArtifactRuntime\.sealCinematicMotion/);
  assert.match(queue,/provider_calls_performed: false/);
});

test('logo transformations terminate in exact approved logo pixels',()=>{
  assert.match(brand,/AssetGraphRepository\.getById/);
  assert.match(brand,/materializeMedia/);
  assert.match(brand,/generated_logo_pixels_used:false/);
  assert.match(brand,/brand_lock_applied:true/);
  assert.match(queue,/CreativeCinematicBrandLockRuntime\.apply/);
  assert.match(queue,/CINEMATIC_BRAND_LOCK_SINGLE_EXACT_LOGO_REQUIRED/);
});

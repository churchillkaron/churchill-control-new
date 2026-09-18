import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const delivery=fs.readFileSync('lib/creative/upscale/runtime/CreativeTemporal4KDeliveryTaskRuntime.js','utf8');
const review=fs.readFileSync('lib/creative/upscale/runtime/CreativeTemporal4KReviewTaskRuntime.js','utf8');
const mastering=fs.readFileSync('lib/creative/post-production/runtime/CreativeGovernedVideoMasteringRuntime.js','utf8');

test('sub-4K locked master materializes a governed temporal upscale task',()=>{
  assert.match(delivery,/capability:"ai\.video\.upscale"/);
  assert.match(delivery,/temporal_4k_plan:plan/);
  assert.match(delivery,/per_frame_independent_sr_forbidden:true/);
  assert.match(delivery,/delivery_width:3840/);
  assert.match(delivery,/delivery_height:2160/);
});

test('existing native 4K master bypasses upscale safely',()=>{
  assert.match(delivery,/if\(is4k\(source_render\)\)return\{contract:CREATIVE_TEMPORAL_4K_DELIVERY_TASK_CONTRACT,status:"READY_4K"/);
});

test('completed FlashVSR task requires perceptual validation before release',()=>{
  assert.match(delivery,/prior\.metadata\?\.automated_perceptual_validation_passed===true/);
  assert.match(delivery,/status:"AWAITING_4K_QC"/);
  assert.match(review,/GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1/);
  assert.match(review,/minimum_continuity_score:94/);
  assert.match(review,/minimum_artifact_score:94/);
});

test('governed mastering blocks final approval until verified 4K exists',()=>{
  assert.match(mastering,/CreativeTemporal4KDeliveryTaskRuntime\.ensure/);
  assert.match(mastering,/CreativeTemporal4KReviewTaskRuntime\.ensure/);
  assert.match(mastering,/if \(delivery\.status !== "READY_4K"\)/);
  assert.match(mastering,/final_4k_verified: false/);
  assert.match(mastering,/final_4k_verified: true/);
  assert.match(mastering,/render: delivery\.delivery_render/);
});

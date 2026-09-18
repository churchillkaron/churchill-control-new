import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const materializer=fs.readFileSync('lib/creative/post-production/runtime/CreativeOpticalTaskMaterializationRuntime.js','utf8');
const review=fs.readFileSync('lib/creative/post-production/runtime/CreativeOpticalReviewTaskRuntime.js','utf8');
const release=fs.readFileSync('lib/creative/post-production/runtime/CreativeShotEditReleaseRuntime.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');
const optical=fs.readFileSync('lib/creative/post-production/runtime/CreativeOpticalFinishingRuntime.js','utf8');

test('optical task materializes only from reviewed selected composite',()=>{
  assert.match(materializer,/AVANTIQO_LAYERED_COMPOSITING_RENDER_V1/);
  assert.match(materializer,/compositing_source_gate_passed===true/);
  assert.match(materializer,/shot_candidate_review_passed===true/);
  assert.match(materializer,/selected_for_master===true/);
});

test('optical profile is made explicit before execution',()=>{
  assert.match(materializer,/CreativeOpticalFinishingRuntime\.profile/);
  assert.match(materializer,/optical_profile:opticalProfile/);
  assert.match(materializer,/optical_profile_contract:opticalProfile\.contract/);
});

test('queue runs optical finishing locally and preserves deterministic QC result',()=>{
  assert.match(queue,/capability === "creative\.video\.optical-finish"/);
  assert.match(queue,/passRole === "OPTICAL_FINISH"/);
  assert.match(queue,/CreativeOpticalFinishingRuntime\.finish/);
  assert.match(queue,/provider: "avantiqo-owned-optical"/);
  assert.match(queue,/technical_qc: result\.technical_qc/);
  assert.match(queue,/provider_calls_performed: false/);
});

test('optical renderer still performs deterministic lens stage and technical QC',()=>{
  assert.match(optical,/lenscorrection/);
  assert.match(optical,/rgbashift/);
  assert.match(optical,/vignette/);
  assert.match(optical,/noise=alls/);
  assert.match(optical,/CreativeRenderTechnicalQualityRuntime\.evaluate/);
  assert.match(optical,/color_grade_forbidden:true/);
});

test('completed optical output automatically enters perceptual review',()=>{
  assert.match(review,/creative\.video\.optical-finish/);
  assert.match(review,/GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1/);
  assert.match(review,/source_generation_task_id:source\.id/);
  assert.match(queue,/CreativeOpticalReviewTaskRuntime\.ensure\(input\)/);
});

test('reviewed optical asset automatically releases shot to edit and defers global Color DI',()=>{
  assert.match(release,/optical_technical_qc_passed===true/);
  assert.match(release,/shot_candidate_review_passed===true/);
  assert.match(release,/CreativeOpticalFinishPassBridgeRuntime\.reconcile/);
  assert.match(release,/CreativeShotFinalQcBridgeRuntime\.reconcile/);
  assert.match(release,/shot_release_ready_for_edit:true/);
  assert.match(release,/final_color_di_pending_after_edit:true/);
  assert.match(release,/PROJECT_LEVEL_AFTER_EDIT/);
  assert.match(queue,/CreativeShotEditReleaseRuntime\.ensure\(input\)/);
});

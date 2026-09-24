import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const videoProvider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js","utf8");
const localVideo=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js","utf8");
const productionTaskRuntime=fs.readFileSync("lib/operations/tasks/runtime/ProductionTaskRuntime.js","utf8");
const assetGraphRuntime=fs.readFileSync("lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime.js","utf8");
const shotCandidateGate=fs.readFileSync("lib/creative/quality/runtime/CreativeShotCandidateQualityGateBootstrap.js","utf8");
const shotCandidateReview=fs.readFileSync("lib/creative/quality/runtime/CreativeShotCandidateReviewRuntime.js","utf8");
const shotCandidateSelection=fs.readFileSync("lib/creative/quality/runtime/CreativeShotCandidateSelectionRuntime.js","utf8");
const shotContinuationGate=fs.readFileSync("lib/creative/continuity/runtime/CreativeShotContinuationExecutionGate.js","utf8");

test("Studio lineage enters the mastered Node01 video path",()=>{
  assert.match(videoProvider,/AVANTIQO_VIDEO_STUDIO_LINEAGE_V1/);
  assert.match(videoProvider,/CREATIVE_SHOT_BIBLE_V1/);
  assert.match(videoProvider,/AVANTIQO_VIDEO_STUDIO_SHOT_ID_MISMATCH/);
  assert.match(videoProvider,/studio_lineage:\s*lineage/);
  assert.match(videoProvider,/AvantiqoVideoLocalQueueProvider\.execute\(advancedInput\(input\)\)/);
  assert.match(localVideo,/generation_envelope/);
  assert.match(localVideo,/shot_bible/);
  assert.match(localVideo,/shot_id/);
});

test("Node01 queue binds exactly one governed generation job to the usage and output target",()=>{
  assert.match(localVideo,/avantiqo_local_compute_jobs/);
  assert.match(localVideo,/max_attempts: 1/);
  assert.match(localVideo,/organization_id: organizationId/);
  assert.match(localVideo,/usage_id: usageId/);
  assert.match(localVideo,/storage_reference: storageUpload\.storage_reference/);
  assert.match(localVideo,/provider_job_id: JOB_PREFIX \+ inserted\.data\.id/);
});

test("completed Video tasks materialize canonical shot candidates without another provider call",()=>{
  assert.match(productionTaskRuntime,/assetNode = await CreativeAssetGraphRuntime\.createFromProductionTask\(\{\s*task,\s*output,/);
  assert.match(productionTaskRuntime,/status:\s*PRODUCTION_TASK_STATUS\.COMPLETED/);
  assert.match(productionTaskRuntime,/asset_node_id:\s*assetNode\?\.id \|\| null/);
  assert.match(assetGraphRuntime,/type:\s*inferType\(task,/);
  assert.match(assetGraphRuntime,/production_task_id:\s*task\.id/);
  assert.match(assetGraphRuntime,/shot_id:\s*task\.shot_id \|\| input\.shot_id \|\| metadata\.shot_id \|\| null/);
  assert.match(assetGraphRuntime,/status:\s*CREATIVE_ASSET_NODE_STATUS\.GENERATED/);
});

test("canonical generated VIDEO assets enter the Studio shot-candidate quality gate",()=>{
  assert.match(shotCandidateGate,/node\.type === CREATIVE_ASSET_NODE_TYPES\.VIDEO/);
  assert.match(shotCandidateGate,/CreativeShotCandidateReviewRuntime\.analyze/);
  assert.match(shotCandidateGate,/CreativeShotCandidateSelectionRuntime\.select/);
  assert.match(shotCandidateGate,/SHOT_CANDIDATE_QUALITY_BLOCKED/);
});

test("shot review is grounded in the canonical Shot Bible and remains spend governed",()=>{
  assert.match(shotCandidateReview,/CreativeShotBibleRuntime\.assert/);
  assert.match(shotCandidateReview,/CreativeShotBibleRuntime\.build\(\{ shot, task \}\)/);
  assert.match(shotCandidateReview,/SHOT_CANDIDATE_REVIEW_PRICE_CEILING_REQUIRED/);
  assert.match(shotCandidateReview,/CreativeApprovedProductionSpendGuardRuntime[\s\S]*assertAdditionalSpendAllowed/);
  assert.match(shotCandidateReview,/operation:\s*"SHOT_CANDIDATE_VISUAL_REVIEW"/);
});

test("selection fails closed below the world-class weakest-link floor",()=>{
  assert.match(shotCandidateSelection,/const WORLD_CLASS_FLOOR = 94/);
  assert.match(shotCandidateSelection,/score\.weakest >= WORLD_CLASS_FLOOR/);
  assert.match(shotCandidateSelection,/score\.overall >= WORLD_CLASS_FLOOR/);
  assert.match(shotCandidateSelection,/NO_WORLD_CLASS_CANDIDATE/);
  assert.match(shotCandidateSelection,/selected_for_master:\s*true/);
});

test("next-shot continuity can only bind a reviewed released predecessor",()=>{
  assert.match(shotContinuationGate,/CREATIVE_REVIEWED_CLOSING_FRAME_HANDOFF_V1/);
  assert.match(shotContinuationGate,/CREATIVE_SHOT_CONTINUATION_REVIEW_NOT_APPROVED/);
  assert.match(shotContinuationGate,/approved_for_downstream_after_perceptual_review !== true/);
  assert.match(shotContinuationGate,/role:\s*"PREVIOUS_REVIEWED_CLOSING_FRAME"/);
  assert.match(shotContinuationGate,/first_frame:\s*stored\.reference/);
});

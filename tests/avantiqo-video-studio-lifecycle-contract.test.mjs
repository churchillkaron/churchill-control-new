import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const videoProvider = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js",
  "utf8",
);
const modalWorker = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-owned/AvantiqoOwnedModalWorker.js",
  "utf8",
);
const modalNativeJob = fs.readFileSync(
  "services/avantiqo-video-engine/modal_native_job.py",
  "utf8",
);
const productionTaskRuntime = fs.readFileSync(
  "lib/operations/tasks/runtime/ProductionTaskRuntime.js",
  "utf8",
);
const assetGraphRuntime = fs.readFileSync(
  "lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime.js",
  "utf8",
);
const shotCandidateGate = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeShotCandidateQualityGateBootstrap.js",
  "utf8",
);
const shotCandidateReview = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeShotCandidateReviewRuntime.js",
  "utf8",
);
const shotCandidateSelection = fs.readFileSync(
  "lib/creative/quality/runtime/CreativeShotCandidateSelectionRuntime.js",
  "utf8",
);
const shotContinuationGate = fs.readFileSync(
  "lib/creative/continuity/runtime/CreativeShotContinuationExecutionGate.js",
  "utf8",
);

test("Studio lineage enters the mastered direct Modal video path", () => {
  assert.match(videoProvider, /AVANTIQO_VIDEO_STUDIO_LINEAGE_V1/);
  assert.match(videoProvider, /CREATIVE_SHOT_BIBLE_V1/);
  assert.match(videoProvider, /AVANTIQO_VIDEO_STUDIO_SHOT_ID_MISMATCH/);
  assert.match(videoProvider, /studio_lineage:\s*lineage/);
  assert.match(videoProvider, /modalVideoWorker\.execute\(advancedInput\(input\)\)/);

  assert.match(modalWorker, /structured_specification:\s*cleanOutput\(/);
  assert.match(modalWorker, /metadata:\s*input\.metadata/);
  assert.match(modalWorker, /const call = await worker\.spawn\(\[payload\]\)/);
  assert.match(modalWorker, /provider_job_id:\s*`\$\{jobPrefix\}\$\{rawJobId\}`/);
});

test("CPU Modal adapter validates Studio lineage before exactly one native render", () => {
  assert.match(modalNativeJob, /STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1"/);
  assert.match(modalNativeJob, /SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1"/);
  assert.match(modalNativeJob, /studio_lineage = _studio_lineage\(data\)/);
  assert.match(modalNativeJob, /AVANTIQO_VIDEO_LTX25_MODAL_SHOT_ID_MISMATCH/);
  assert.match(modalNativeJob, /AVANTIQO_VIDEO_LTX25_MODAL_SHOT_BIBLE_ORGANIZATION_MISMATCH/);
  assert.match(modalNativeJob, /generation = generate_native_master\.remote\(/);
  assert.match(modalNativeJob, /"gpu_generation_calls": 1/);
  assert.match(modalNativeJob, /"studio_lineage_validated": True/);
  assert.match(modalNativeJob, /"shot_id": job\["studio_lineage"\]\["shot_id"\]/);
});

test("completed Video tasks materialize canonical shot candidates without another provider call", () => {
  assert.match(
    productionTaskRuntime,
    /assetNode = await CreativeAssetGraphRuntime\.createFromProductionTask\(\{\s*task,\s*output,/,
  );
  assert.match(
    productionTaskRuntime,
    /status:\s*PRODUCTION_TASK_STATUS\.COMPLETED/,
  );
  assert.match(productionTaskRuntime, /asset_node_id:\s*assetNode\?\.id \|\| null/);

  assert.match(assetGraphRuntime, /type:\s*inferType\(task,/);
  assert.match(assetGraphRuntime, /production_task_id:\s*task\.id/);
  assert.match(
    assetGraphRuntime,
    /shot_id:\s*task\.shot_id \|\| input\.shot_id \|\| metadata\.shot_id \|\| null/,
  );
  assert.match(assetGraphRuntime, /status:\s*CREATIVE_ASSET_NODE_STATUS\.GENERATED/);
});

test("canonical generated VIDEO assets enter the Studio shot-candidate quality gate", () => {
  assert.match(
    shotCandidateGate,
    /node\.type === CREATIVE_ASSET_NODE_TYPES\.VIDEO/,
  );
  assert.match(shotCandidateGate, /Boolean\(text\(node\.metadata\?\.shot_id\)\)/);
  assert.match(
    shotCandidateGate,
    /Boolean\(text\(node\.production_task_id \|\| node\.metadata\?\.production_task_id\)\)/,
  );
  assert.match(shotCandidateGate, /CreativeShotCandidateReviewRuntime\.analyze/);
  assert.match(shotCandidateGate, /CreativeShotCandidateSelectionRuntime\.select/);
  assert.match(shotCandidateGate, /SHOT_CANDIDATE_QUALITY_BLOCKED/);
});

test("shot review is grounded in the canonical Shot Bible and remains spend governed", () => {
  assert.match(shotCandidateReview, /CreativeShotBibleRuntime\.assert/);
  assert.match(shotCandidateReview, /CreativeShotBibleRuntime\.build\(\{ shot, task \}\)/);
  assert.match(shotCandidateReview, /SHOT_CANDIDATE_REVIEW_PRICE_CEILING_REQUIRED/);
  assert.match(
    shotCandidateReview,
    /CreativeApprovedProductionSpendGuardRuntime[\s\S]*assertAdditionalSpendAllowed/,
  );
  assert.match(shotCandidateReview, /operation:\s*"SHOT_CANDIDATE_VISUAL_REVIEW"/);
  assert.match(shotCandidateReview, /shot_id:\s*resolved\.task\.shot_id/);
});

test("selection fails closed below the world-class weakest-link floor", () => {
  assert.match(shotCandidateSelection, /const WORLD_CLASS_FLOOR = 94/);
  assert.match(
    shotCandidateSelection,
    /score\.weakest >= WORLD_CLASS_FLOOR/,
  );
  assert.match(
    shotCandidateSelection,
    /score\.overall >= WORLD_CLASS_FLOOR/,
  );
  assert.match(shotCandidateSelection, /reason:\s*candidates\.length[\s\S]*"NO_WORLD_CLASS_CANDIDATE"/);
  assert.match(shotCandidateSelection, /selected_candidate_asset_node_id:\s*winner\.id/);
  assert.match(shotCandidateSelection, /selected_for_master:\s*true/);
});

test("next-shot continuity can only bind a reviewed released predecessor", () => {
  assert.match(
    shotContinuationGate,
    /CREATIVE_REVIEWED_CLOSING_FRAME_HANDOFF_V1/,
  );
  assert.match(
    shotContinuationGate,
    /CREATIVE_SHOT_CONTINUATION_REVIEW_NOT_APPROVED/,
  );
  assert.match(
    shotContinuationGate,
    /approved_for_downstream_after_perceptual_review !== true/,
  );
  assert.match(
    shotContinuationGate,
    /role:\s*"PREVIOUS_REVIEWED_CLOSING_FRAME"/,
  );
  assert.match(
    shotContinuationGate,
    /first_frame:\s*stored\.reference/,
  );
  assert.match(
    shotContinuationGate,
    /ProductionTaskRuntime\.dispatch = async function dispatchWithShotContinuation/,
  );
});

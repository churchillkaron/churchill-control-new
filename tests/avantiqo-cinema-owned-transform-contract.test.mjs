import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("owned Cinema provider transports governed source ranges", () => {
  const provider = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProvider.js",
  );

  assert.match(provider, /const MAX_SOURCE_RANGE_SECONDS = 600;/);
  assert.match(provider, /function sourceRange\(/);
  assert.match(provider, /source_start_seconds: range\.start/);
  assert.match(provider, /source_end_seconds: range\.end/);
  assert.match(provider, /source_range_bound: range\.bound/);
  assert.match(provider, /AVANTIQO_VIDEO_SOURCE_RANGE_INVALID/);
});

test("owned Cinema worker remains queue-serverless and honors source ranges", () => {
  const worker = source("services/avantiqo-video-engine/handler.py");

  assert.match(
    worker,
    /runpod\.serverless\.start\(\{["']handler["']:\s*handler\}\)/,
  );
  assert.match(worker, /source_start_seconds/);
  assert.match(worker, /source_end_seconds/);
  assert.match(worker, /MAX_SOURCE_RANGE_SECONDS/);
});

test("first-last Cinema generations remain fail-closed behind perceptual endpoint review", () => {
  const graph = source(
    "lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualGraphRuntime.js",
  );
  const executionGate = source(
    "lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js",
  );

  assert.match(
    graph,
    /first_last_frame_conditioning_expected:\s*firstLast/,
  );
  assert.match(
    graph,
    /compare_first_frame_when_required:\s*expectation\.first_last_frame_conditioning_expected/,
  );
  assert.match(
    graph,
    /compare_last_frame_when_required:\s*expectation\.first_last_frame_conditioning_expected/,
  );
  assert.match(
    executionGate,
    /For video, inspect opening, progression and closing states/,
  );
  assert.match(
    executionGate,
    /GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED/,
  );
});

test("first-last Cinema release requires deterministic endpoint fidelity and explicit temporal evidence", () => {
  const endpointGate = source(
    "lib/creative/quality/runtime/CreativeCinemaEndpointFidelityExecutionGate.js",
  );
  const continuationGate = source(
    "lib/creative/continuity/runtime/CreativeShotContinuationExecutionGate.js",
  );

  assert.match(
    continuationGate,
    /CreativeCinemaEndpointFidelityExecutionGate/,
  );
  assert.match(
    endpointGate,
    /CREATIVE_CINEMA_ENDPOINT_FIDELITY_V1/,
  );
  assert.match(endpointGate, /extractEndpointFrame/);
  assert.match(endpointGate, /compareImages/);
  assert.match(endpointGate, /minimum_similarity/);
  assert.match(endpointGate, /requested_camera_correct:\s*true/);
  assert.match(endpointGate, /physics_valid:\s*true/);
  assert.match(endpointGate, /continuity_valid:\s*true/);
  assert.match(endpointGate, /identity_preserved:\s*expected\.identity_expected === true/);
  assert.match(endpointGate, /provider_calls_added:\s*0/);
  assert.match(endpointGate, /CREATIVE_CINEMA_ENDPOINT_FIDELITY_FAILED/);
});

test("continued first-last Cinema autonomously plans and binds a governed closing keyframe", () => {
  const continuationGraph = source(
    "lib/creative/continuity/runtime/CreativeShotContinuationGraphRuntime.js",
  );
  const continuationGate = source(
    "lib/creative/continuity/runtime/CreativeShotContinuationExecutionGate.js",
  );
  const closingGate = source(
    "lib/creative/continuity/runtime/CreativeClosingKeyframeExecutionGate.js",
  );

  assert.match(continuationGraph, /CREATIVE_CLOSING_KEYFRAME_V1/);
  assert.match(continuationGraph, /CREATIVE_CLOSING_KEYFRAME_REVIEW_V1/);
  assert.match(continuationGraph, /provider:\s*"avantiqo-image"/);
  assert.match(continuationGraph, /closing_keyframe_required:\s*true/);
  assert.match(
    continuationGraph,
    /last_frame_binding_required_at_execution:\s*true/,
  );
  assert.match(
    continuationGate,
    /CreativeClosingKeyframeExecutionGate/,
  );
  assert.doesNotMatch(
    continuationGate,
    /CREATIVE_SHOT_CONTINUATION_LAST_FRAME_REQUIRED/,
  );
  assert.match(closingGate, /CREATIVE_APPROVED_CLOSING_KEYFRAME_BINDING_V1/);
  assert.match(closingGate, /closing_state_correct === true/);
  assert.match(closingGate, /camera_handoff_coherent === true/);
  assert.match(closingGate, /artifacts_absent === true/);
  assert.match(closingGate, /last_frame:\s*url/);
  assert.match(closingGate, /role:\s*"APPROVED_CLOSING_KEYFRAME"/);
  assert.match(closingGate, /CREATIVE_CLOSING_KEYFRAME_REVIEW_FAILED/);
});

test("Cinema endpoint failures enter isolated pair repair without mutating continuity bindings", () => {
  const repair = source(
    "lib/creative/quality/runtime/CreativeCinemaRepairContinuityBootstrap.js",
  );
  const instrumentation = source("instrumentation.js");
  const localBootstrap = source("scripts/creative-runtime-bootstrap.mjs");

  assert.match(repair, /CREATIVE_CINEMA_REPAIR_CONTINUITY_MEMORY_V1/);
  assert.match(repair, /normalizeEndpointFailures/);
  assert.match(repair, /perceptual_validation_failed:\s*true/);
  assert.match(repair, /cinema_endpoint_failure_normalized_for_pair_recovery/);
  assert.match(repair, /preserve_approved_neighboring_shots:\s*true/);
  assert.match(repair, /preserve_governed_first_frame/);
  assert.match(repair, /preserve_governed_last_frame/);
  assert.match(repair, /CREATIVE_CINEMA_REPAIR_FIRST_FRAME_DRIFT_FORBIDDEN/);
  assert.match(repair, /CREATIVE_CINEMA_REPAIR_LAST_FRAME_DRIFT_FORBIDDEN/);
  assert.match(repair, /CREATIVE_CINEMA_REPAIR_IDENTITY_BINDING_DRIFT_FORBIDDEN/);
  assert.match(repair, /CREATIVE_CINEMA_REPAIR_CONTINUITY_BINDING_DRIFT_FORBIDDEN/);
  assert.match(repair, /CREATIVE_CINEMA_REPAIR_SOURCE_ASSET_DRIFT_FORBIDDEN/);
  assert.match(repair, /change_only_failed_requirements !== true/);
  assert.match(instrumentation, /CreativeCinemaRepairContinuityBootstrap/);
  assert.match(localBootstrap, /CreativeCinemaRepairContinuityBootstrap/);
});

test("advanced Cinema transforms stay implemented but not default production-certified", () => {
  const provider = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProvider.js",
  );

  const certifiedBlock = provider.match(
    /const DEFAULT_CERTIFIED_CAPABILITIES = new Set\(\[([\s\S]*?)\]\);/,
  );
  assert.ok(certifiedBlock, "default certified capability block must exist");
  assert.match(certifiedBlock[1], /ai\.video\.generate/);
  assert.match(certifiedBlock[1], /ai\.video\.image_to_video/);
  assert.doesNotMatch(certifiedBlock[1], /first_last_frame_to_video/);
  assert.doesNotMatch(certifiedBlock[1], /video_to_video/);
  assert.doesNotMatch(certifiedBlock[1], /ai\.video\.edit/);
  assert.doesNotMatch(certifiedBlock[1], /ai\.video\.inpaint/);
});
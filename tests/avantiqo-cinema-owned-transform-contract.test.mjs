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

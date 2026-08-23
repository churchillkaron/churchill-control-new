import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runner = fs.readFileSync(
  path.join(root, "scripts/benchmark-avantiqo-owned-media-full.mjs"),
  "utf8",
);

const IMAGE_CAPABILITIES = [
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.image.analyze",
];
const CINEMA_CAPABILITIES = [
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
  "ai.video.inpaint",
  "ai.video.extend",
  "ai.video.upscale",
  "ai.video.lipsync",
];

test("full owned media runner measures every Image and Cinema capability through certification execution", () => {
  assert.match(runner, /AVANTIQO_OWNED_MEDIA_FULL_CAPABILITY_BENCHMARK_V1/);
  for (const capability of [...IMAGE_CAPABILITIES, ...CINEMA_CAPABILITIES]) {
    assert.match(runner, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(runner, /certification_execution:\s*true/);
  assert.match(runner, /RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID/);
  assert.match(runner, /RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID/);
  assert.match(runner, /RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID/);
  assert.match(runner, /AVANTIQO_MEDIA_CERTIFICATION_FIXTURES/);
});

test("full media runner requires governed source, mask, frame and audio fixtures for advanced modes", () => {
  assert.match(runner, /image_source_url/);
  assert.match(runner, /image_mask_url/);
  assert.match(runner, /video_first_frame_url/);
  assert.match(runner, /video_last_frame_url/);
  assert.match(runner, /video_source_url/);
  assert.match(runner, /video_mask_url/);
  assert.match(runner, /audio_source_url/);
  assert.match(runner, /source_asset_roles:\s*\{ source_video: videoSource, source_audio: audioSource \}/);
});

test("mechanical benchmark can never promote owned media to production by itself", () => {
  assert.match(runner, /activation_allowed:\s*false/);
  assert.match(runner, /pricing_activation_performed:\s*false/);
  assert.match(runner, /production_certified:\s*0/);
  assert.match(runner, /mechanical_benchmark_is_not_production_certification:\s*true/);
  assert.match(runner, /human_visual_review_required:\s*true/);
  assert.match(runner, /identity_review_required_for_identity_sensitive_video:\s*true/);
  assert.match(runner, /temporal_review_required_for_video:\s*true/);
  assert.match(runner, /lip_sync_quality_review_required:\s*true/);
  assert.match(runner, /endpoint_fidelity_review_required_for_first_last_video:\s*true/);
  assert.match(runner, /measured_gpu_economics_required:\s*true/);
  assert.match(runner, /automatic_activation_forbidden:\s*true/);
});

test("full runner exits nonzero when any capability lacks mechanical evidence", () => {
  assert.match(runner, /allCapabilities\.every/);
  assert.match(runner, /allMechanicalPassed = fullCoverage && failed\.length === 0/);
  assert.match(runner, /if \(!allMechanicalPassed\) process\.exitCode = 1/);
});

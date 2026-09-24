import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js", "utf8");
const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js", "utf8");

test("active Video route is the owned local Node01 queue and old capacity fallback is retired", () => {
  assert.match(provider, /return AvantiqoVideoLocalQueueProvider\.execute\(advancedInput\(input\)\)/);
  assert.match(provider, /AVANTIQO_VIDEO_LEGACY_JOB_TRANSPORT_RETIRED/);
  assert.doesNotMatch(provider, /MANAGED_FALLBACK|RunPod|runpod|Modal/);
  assert.match(registration, /local_only_execution:\s*true/);
  assert.match(registration, /modal_fallback_allowed:\s*false/);
});

test("Node01 Video capacity is bounded to the currently implemented LTX generation contract", () => {
  assert.match(local, /CAPABILITY = "ai\.video\.generate"/);
  assert.match(local, /durationSeconds = boundedInt\([^\n]+, 2, 1, 8\)/);
  assert.match(local, /fps = boundedInt\([^\n]+, 24, 8, 24\)/);
  assert.match(local, /execution_profile: "LOW_VRAM_6GB_CPU_OFFLOAD"/);
  assert.match(registration, /LOCAL_DEFAULT_RESOLUTION = "608x352"/);
  assert.match(registration, /allowed_duration_seconds: \[1, 8\]/);
  assert.match(registration, /reference_image_limit: 0/);
  assert.match(registration, /source_video_limit: 0/);
  assert.match(registration, /delivery_upscale_engine: null/);
});

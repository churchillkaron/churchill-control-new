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

test("owned Cinema implements all nine target capabilities without default over-certification", () => {
  const registration = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
  );

  for (const capability of [
    "ai.video.generate",
    "ai.video.image_to_video",
    "ai.video.first_last_frame_to_video",
    "ai.video.video_to_video",
    "ai.video.edit",
    "ai.video.inpaint",
    "ai.video.extend",
    "ai.video.upscale",
    "ai.video.lipsync",
  ]) {
    assert.match(registration, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(registration, /IMPLEMENTED_CAPABILITIES = Object\.freeze\(\[\.\.\.TARGET_CAPABILITIES\]\)/);
  assert.match(registration, /DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\[\s*"ai\.video\.generate",\s*"ai\.video\.image_to_video",\s*\]\)/s);
  assert.match(registration, /PROVIDER_VIDEO_CAPABILITY_CONFIGURATION_V2/);
});

test("Cinema extend continues from the exact source tail under governed cinematic control", () => {
  const worker = source("services/avantiqo-video-engine/handler_v2.py");

  assert.match(worker, /EXTEND_CAPABILITY = "ai\.video\.extend"/);
  assert.match(worker, /source_asset_roles/);
  assert.match(worker, /_structured_transport/);
  assert.match(worker, /_governed_control/);
  assert.match(worker, /boundary = _last_frame\(source_path\)/);
  assert.match(worker, /prompt=legacy\._cinematic_instruction\(data\)/);
  assert.match(worker, /boundary_frame_from_exact_source_tail": True/);
  assert.match(worker, /source_then_generated_continuation": True/);
  assert.match(worker, /cinematic_control_contract/);
});

test("Cinema upscale is bounded owned super-resolution with mandatory temporal review", () => {
  const worker = source("services/avantiqo-video-engine/handler_v2.py");
  const registration = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
  );

  assert.match(worker, /UPSCALE_CAPABILITY = "ai\.video\.upscale"/);
  assert.match(worker, /caidas\/swin2SR-realworld-sr-x4-64-bsrgan-psnr/);
  assert.match(worker, /MAX_UPSCALE_SOURCE_SECONDS/);
  assert.match(worker, /MAX_UPSCALE_OUTPUT_PIXELS/);
  assert.match(worker, /deterministic_frame_super_resolution": True/);
  assert.match(worker, /temporal_quality_review_required": True/);
  assert.match(registration, /temporal_upscale_review_required:\s*true/);
});

test("Cinema lip-sync is isolated, pinned, offline-cache-complete and quality-gated", () => {
  const facade = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js",
  );
  const worker = source("services/avantiqo-lipsync-engine/handler.py");
  const docker = source("services/avantiqo-lipsync-engine/Dockerfile");

  assert.match(facade, /RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID/);
  assert.match(facade, /AVANTIQO_LIPSYNC_ENGINE_ENABLED/);
  assert.match(facade, /LIPSYNC_JOB_PREFIX = "lipsync:"/);
  assert.match(facade, /stripLipSyncJobPrefix/);
  assert.match(facade, /lipsyncWorker\.getStatus/);
  assert.match(worker, /ByteDance\/LatentSync-1\.6/);
  assert.match(worker, /a229c3948406bc2cf6eaf4873e662e70c6a04746/);
  assert.match(worker, /stabilityai\/sd-vae-ft-mse/);
  assert.match(worker, /AVANTIQO_LIPSYNC_INSIGHTFACE_BUFFALO_L_REQUIRED/);
  assert.match(worker, /AVANTIQO_LIPSYNC_SD_VAE_CACHE_REQUIRED/);
  assert.match(worker, /local_files_only=True/);
  assert.match(worker, /"HF_HUB_OFFLINE": "1"/);
  assert.match(worker, /offline_model_cache_required": True/);
  assert.match(worker, /identity_quality_review_required": True/);
  assert.match(worker, /sync_quality_review_required": True/);
  assert.match(docker, /git checkout a229c3948406bc2cf6eaf4873e662e70c6a04746/);
  assert.match(docker, /HF_HOME=\/runpod-volume\/huggingface-cache/);
  assert.match(docker, /HF_HUB_OFFLINE=1/);
  assert.match(docker, /TRANSFORMERS_OFFLINE=1/);
});

test("Service Runtime and cinematic state memory both target the V2 facade", () => {
  const executor = source(
    "lib/platform/service-runtime/providers/ProviderExecutorCore.js",
  );
  const memory = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCinematicStateMemoryBootstrap.js",
  );

  assert.match(executor, /import\("\.\/avantiqo-video\/AvantiqoVideoProviderV2\.js"\)/);
  assert.match(executor, /module\.AvantiqoVideoProviderV2/);
  assert.match(memory, /AvantiqoVideoProviderV2/);
  assert.match(memory, /providerRuntime:\s*"AvantiqoVideoProviderV2"/);
  assert.match(memory, /generation:\s*\{/);
  assert.match(memory, /shot_specification:\s*governedShotSpecification/);
  assert.match(memory, /continuity:\s*governedContinuity/);
});

test("advanced Cinema models are exact-capability license gated", () => {
  const policy = source(
    "lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js",
  );

  assert.match(policy, /"ai\.video\.image_to_video",\s*"ai\.video\.extend"/s);
  assert.match(policy, /caidas\/swin2SR-realworld-sr-x4-64-bsrgan-psnr/);
  assert.match(policy, /capabilities: Object\.freeze\(\["ai\.video\.upscale"\]\)/);
  assert.match(policy, /ByteDance\/LatentSync-1\.6/);
  assert.match(policy, /capabilities: Object\.freeze\(\["ai\.video\.lipsync"\]\)/);
  assert.match(policy, /pinned_upstream_commit:\s*"a229c3948406bc2cf6eaf4873e662e70c6a04746"/);
});

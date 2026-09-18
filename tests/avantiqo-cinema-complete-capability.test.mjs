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

test("owned Cinema separates target, implemented, and default-certified capabilities", () => {
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
  assert.match(registration, /const IMPLEMENTED_CAPABILITIES = Object\.freeze\(\[\s*"ai\.video\.generate",\s*"ai\.video\.image_to_video",\s*"ai\.video\.first_last_frame_to_video",\s*"ai\.video\.upscale",\s*\]\)/s);
  assert.match(registration, /DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\[\s*"ai\.video\.generate",\s*"ai\.video\.image_to_video",\s*\]\)/s);
  assert.match(registration, /PROVIDER_VIDEO_CAPABILITY_CONFIGURATION_V4/);
  assert.match(registration, /implemented_capabilities: IMPLEMENTED_CAPABILITIES/);
  assert.match(registration, /certified_capabilities: capabilities/);
  assert.equal(registration.includes("Wan-AI/Wan2"), false);
});

test("Cinema extend code remains present but is not falsely production-advertised", () => {
  const worker = source("services/avantiqo-video-engine/handler_v2.py");
  const registration = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
  );

  assert.match(worker, /EXTEND_CAPABILITY = "ai\.video\.extend"/);
  assert.match(worker, /boundary = _last_frame\(source_path\)/);
  assert.match(worker, /boundary_frame_from_exact_source_tail": True/);
  assert.match(worker, /source_then_generated_continuation": True/);
  assert.match(registration, /"ai\.video\.extend"/);
  const implementedBlock = registration.match(/const IMPLEMENTED_CAPABILITIES = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.equal(implementedBlock.includes('"ai.video.extend"'), false);
});

test("Cinema 4K delivery uses temporal FlashVSR rather than legacy frame SR", () => {
  const provider = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFlashVsrProvider.js",
  );
  const registration = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
  );

  assert.match(provider, /JunhaoZhuang\/FlashVSR-v1\.1/);
  assert.match(provider, /temporal_super_resolution:true/);
  assert.match(provider, /per_frame_independent_sr:false/);
  assert.match(registration, /delivery_upscale_engine: "FlashVSR-v1\.1"/);
  assert.match(registration, /temporal_super_resolution_engine: "FlashVSR-v1\.1"/);
  assert.match(registration, /per_frame_independent_super_resolution_production_forbidden: true/);
  assert.equal(registration.includes("swin2SR"), false);
});

test("lip-sync is separately governed and is not claimed as owned Cinema production certification", () => {
  const registration = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
  );
  const managed = source(
    "lib/platform/service-runtime/providers/lipsync/ManagedLipSyncProviderRegistration.js",
  );
  const validation = source(
    "lib/platform/service-runtime/providers/lipsync/ManagedLipSyncProvider.js",
  );

  const implementedBlock = registration.match(/const IMPLEMENTED_CAPABILITIES = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.equal(implementedBlock.includes('"ai.video.lipsync"'), false);
  assert.match(managed, /"ai\.video\.lipsync"/);
  assert.match(validation, /AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V2/);
  assert.match(validation, /HUMAN_FAIL_CLOSED_NO_TRUSTED_AUTOMATED_EVALUATOR/);
  assert.match(validation, /identity_profile_id/);
  assert.match(validation, /MANAGED_LIPSYNC_ENDPOINT_REQUIRED/);
  assert.equal(validation.includes("FalLipSyncProvider"), false);
  assert.equal(validation.includes("FAL_SYNC_V3"), false);
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

test("production registration and owned certification agree on LTX plus temporal FlashVSR", () => {
  const registration = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js",
  );
  const policy = source(
    "lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js",
  );

  assert.match(registration, /FAST_PRODUCTION_RESOLUTION = "1920x1088"/);
  assert.match(registration, /DELIVERY_MASTER_RESOLUTION = "3840x2160"/);
  assert.match(registration, /HERO_NATIVE_RESOLUTION = "3840x2176"/);
  assert.match(registration, /hero_native_generation_default: false/);
  assert.match(registration, /temporal_4k_mastering_required_for_4k_delivery: true/);
  assert.match(policy, /"Lightricks\/LTX-2\.5"/);
  assert.match(policy, /"JunhaoZhuang\/FlashVSR-v1\.1"/);
  const videoCatalog = policy.match(/"avantiqo-video": Object\.freeze\(\{([\s\S]*?)"avantiqo-audio":/)?.[1] || "";
  assert.equal(videoCatalog.includes("Wan-AI/Wan2"), false);
  assert.equal(videoCatalog.includes("swin2SR-realworld-sr-x4-64-bsrgan-psnr"), false);
});

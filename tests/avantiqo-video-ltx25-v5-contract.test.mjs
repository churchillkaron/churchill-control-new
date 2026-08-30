import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

const provider = read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js");
const workflow = read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntimeV5.js");
const pod = read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLtx25PodRuntime.js");
const worker = read("services/avantiqo-video-engine/ltx25_worker_v2.py");
const dockerfile = read("services/avantiqo-video-engine/Dockerfile.ltx25");
const master = read("lib/creative/video/runtime/CreativeVideoStudioNoUpscaleMasterRuntime.js");

function executionSection(source) {
  const start = source.indexOf("async execute(input = {})");
  const end = source.indexOf("async getStatus(input = {})", start);
  assert.ok(start >= 0 && end > start, "execute section must exist");
  return source.slice(start, end);
}

test("new Video generation routes only through owned LTX-2.5 V5", () => {
  const execute = executionSection(provider);
  assert.match(execute, /AvantiqoVideoWorkflowRuntimeV5\.execute\(input\)/);
  assert.doesNotMatch(execute, /AvantiqoVideoWorkflowRuntimeV4\.execute/);
  assert.doesNotMatch(execute, /AvantiqoVideoWorkflowRuntimeV2\.execute/);
  assert.doesNotMatch(execute, /AvantiqoVideoProvider\.execute/);
  assert.match(execute, /AVANTIQO_VIDEO_CAPABILITY_REQUIRES_LTX25_MIGRATION/);
});

test("V5 new-job workflow has no external or legacy generation fallback", () => {
  const execute = executionSection(workflow);
  assert.match(execute, /submitAvantiqoVideoLtx25Generation/);
  assert.match(execute, /resolution: "native-4k"/);
  assert.doesNotMatch(execute, /AvantiqoVideoWorkflowRuntimeV4|AvantiqoVideoWorkflowRuntimeV2/);
  assert.doesNotMatch(execute, /submitAvantiqoVideoGoogle|submitAvantiqoVideoFlashVsr/);
  assert.doesNotMatch(execute, /MANAGED_FALLBACK|GOOGLE_VEO|fal\.run/);
});

test("LTX-2.5 worker forbids 720p and uses DFR native aligned 4K", () => {
  assert.match(worker, /ltx_pipelines\.dfr_pipeline/);
  assert.match(worker, /return 3840, 2176/);
  assert.match(worker, /return 2176, 3840/);
  assert.match(worker, /AVANTIQO_VIDEO_720P_FORBIDDEN/);
  assert.match(worker, /AVANTIQO_VIDEO_LTX25_4K_REQUIRED/);
  assert.match(worker, /"pixel_720p_stage_used": False/);
  assert.match(worker, /"lanczos_upscale_used": False/);
  assert.match(worker, /"native_audio_generated": True/);
  assert.match(worker, /"learned_spatial_upscaler_used": True/);
  assert.match(worker, /"detailing_dfr_used": True/);
});

test("Production and Hero lanes are pinned to the intended Blackwell GPUs", () => {
  assert.match(pod, /AVANTIQO_VIDEO_LTX25_PRODUCTION_GPU = "NVIDIA RTX PRO 6000 Blackwell Server Edition"/);
  assert.match(pod, /AVANTIQO_VIDEO_LTX25_HERO_GPU = "NVIDIA B200"/);
  assert.match(pod, /gpuTypeIds: \[gpuTypeId\]/);
  assert.doesNotMatch(pod, /MANAGED_FALLBACK|GOOGLE_VEO|fal\.run/);
});

test("NVFP4 is fail-closed behind explicit Blackwell kernel certification", () => {
  assert.match(worker, /AVANTIQO_VIDEO_LTX25_NVFP4_KERNEL_CERTIFIED/);
  assert.match(worker, /AVANTIQO_VIDEO_LTX25_NVFP4_KERNEL_CERTIFICATION_REQUIRED/);
  assert.match(worker, /--quantization", "nvfp4-prequant/);
  assert.match(dockerfile, /NVFP4 is fail-closed/);
  assert.match(dockerfile, /COPY ltx25_worker_v2\.py \.\/ltx25_worker\.py/);
});

test("Studio delivery master may crop but can never upscale", () => {
  assert.match(master, /AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_SOURCE_TOO_SMALL/);
  assert.match(master, /crop=\$\{target\.width\}:\$\{target\.height\}/);
  assert.doesNotMatch(master, /flags=lanczos/);
  assert.doesNotMatch(master, /`scale=/);
  assert.match(master, /pixel_upscale_used: false/);
  assert.match(master, /lanczos_upscale_used: false/);
  assert.match(master, /AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_AUDIO_LOST/);
});

test("old workflows remain status-only compatibility, never new execution", () => {
  assert.match(provider, /workflowV4Job\(suppliedJobId\).*AvantiqoVideoWorkflowRuntimeV4\.getStatus/s);
  assert.match(provider, /workflowV2Job\(suppliedJobId\).*AvantiqoVideoWorkflowRuntimeV2\.getStatus/s);
  assert.match(provider, /legacyWorkflowJob\(suppliedJobId\).*AvantiqoVideoWorkflowRuntime\.getStatus/s);
});

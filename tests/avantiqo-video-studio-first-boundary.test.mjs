import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, ROOT), "utf8");
const IMMUTABLE_GPU_ONLY_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker-gpu-only@sha256:2f477f95fcc46fdcb7aff1dda03944ad282eb3a7d33c95098bd13d00a76c3425";

test("active Video paid worker is GPU-only and FFmpeg-free", async () => {
  const [dockerfile, handler, core, requirements] = await Promise.all([
    read("services/avantiqo-video-engine/Dockerfile.v6"),
    read("services/avantiqo-video-engine/handler_v6.py"),
    read("services/avantiqo-video-engine/gpu_core.py"),
    read("services/avantiqo-video-engine/requirements.gpu-only.txt"),
  ]);

  assert.match(dockerfile, /CMD \["python", "-u", "handler_v6\.py"\]/);
  assert.match(dockerfile, /COPY gpu_core\.py/);
  assert.match(dockerfile, /COPY handler_v6\.py/);
  assert.doesNotMatch(dockerfile, /\bffmpeg\b/i);
  assert.doesNotMatch(dockerfile, /handler_v[1-5]\.py/);
  assert.doesNotMatch(requirements, /imageio|ffmpeg/i);
  assert.doesNotMatch(core, /export_to_video|ffmpeg|storage_upload|fal\.run|fal-ai\/|FAL_KEY|FAL_API_KEY/i);
  assert.doesNotMatch(handler, /export_to_video|storage_upload|fal\.run|fal-ai\/|FAL_KEY|FAL_API_KEY/i);
  assert.match(handler, /intermediate_upload/);
  assert.match(handler, /paid_worker_intermediate_egress_only": True/);
  assert.match(handler, /video_encoded_on_paid_worker": False/);
  assert.match(handler, /final_artifact_persisted_on_paid_worker": False/);
  assert.match(handler, /COMPUTE_BOUNDARY_CONTRACT = "AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1"/);
});

test("Video Pod runtime ends paid GPU lifecycle before Studio media processing", async () => {
  const [runtime, runpod] = await Promise.all([
    read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js"),
    read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js"),
  ]);

  assert.match(runtime, /import requests,runpod,handler_v6/);
  assert.doesNotMatch(runtime, /handler_v5\.handler\(job\)/);
  assert.match(runtime, /intermediate_upload: intermediateUpload/);
  assert.doesNotMatch(runtime, /storage_upload: upload/);
  assert.match(runtime, /assembleCreativeVideoStudioFoundation/);
  const deleteIndex = runtime.indexOf("await deleteVideoPod(podId)");
  const studioIndex = runtime.indexOf("finalizeStudioFoundation({ organizationId, podJob, saved })");
  assert.ok(deleteIndex >= 0 && studioIndex >= 0 && deleteIndex < studioIndex, "Pod must be deleted before Studio foundation assembly");
  assert.match(runpod, new RegExp(IMMUTABLE_GPU_ONLY_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Video mastering is Studio-owned and FAL-free", async () => {
  const [workflow, master, foundation] = await Promise.all([
    read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntimeV3.js"),
    read("lib/creative/video/runtime/CreativeVideoStudioMasterRuntime.js"),
    read("lib/creative/video/runtime/CreativeVideoStudioFoundationRuntime.js"),
  ]);

  assert.doesNotMatch(workflow, /FAL_KEY|FAL_API_KEY|queue\.fal\.run|fal-ai\/bytedance-upscaler/i);
  assert.match(workflow, /renderCreativeVideoStudioMaster/);
  assert.match(workflow, /studio_compute_only_mastering = true/);
  assert.match(master, /STUDIO_CPU_FFMPEG_LANCZOS/);
  assert.match(master, /gpu_compute_used: false/);
  assert.match(master, /fal_contacted: false/);
  assert.match(foundation, /ffmpeg_location: "STUDIO"/);
  assert.match(foundation, /gpu_compute_used: false/);
});

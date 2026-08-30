import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, ROOT), "utf8");
const IMMUTABLE_GPU_ONLY_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker-gpu-only@sha256:2f477f95fcc46fdcb7aff1dda03944ad282eb3a7d33c95098bd13d00a76c3425";
const IMMUTABLE_FLASHVSR_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-flashvsr-v11@sha256:78db7a82d489731be6dd4c5e8b1e933535f909e0feaab797da44c00068a643da";

test("active Video paid generation worker is GPU-only and FFmpeg-free", async () => {
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

test("Video generation Pod ends paid GPU lifecycle before Studio media processing", async () => {
  const [runtime, runpod] = await Promise.all([
    read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js"),
    read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js"),
  ]);
  assert.match(runtime, /import requests,runpod,handler_v6/);
  assert.doesNotMatch(runtime, /handler_v5\.handler\(job\)/);
  assert.match(runtime, /intermediate_upload: intermediateUpload/);
  assert.doesNotMatch(runtime, /storage_upload: upload/);
  assert.match(runtime, /assembleCreativeVideoStudioFoundation/);
  const receiptBranch = runtime.indexOf("if (saved) {");
  const deleteIndex = runtime.indexOf("await deleteVideoPod(podId)", receiptBranch);
  const confirmIndex = runtime.indexOf("await confirmAvantiqoVideoPodTerminal(podId)", deleteIndex);
  const studioIndex = runtime.indexOf("const foundation = await finalizeStudioFoundation({ organizationId, podJob, saved })", receiptBranch);
  assert.ok(receiptBranch >= 0 && deleteIndex > receiptBranch && confirmIndex > deleteIndex && studioIndex > confirmIndex, "Pod termination must be confirmed before Studio foundation assembly");
  assert.ok(runpod.includes(IMMUTABLE_GPU_ONLY_IMAGE), "Pod runtime must use the certified GPU-only immutable image");
});

test("Video 4K uses learned FlashVSR with sequential CPU bridge and A100 ownership", async () => {
  const [workflow, master, foundation, flashStudio, flashPod, flashWorker, flashDocker, cpuBridge, leaseMigration] = await Promise.all([
    read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntimeV3.js"),
    read("lib/creative/video/runtime/CreativeVideoStudioMasterRuntime.js"),
    read("lib/creative/video/runtime/CreativeVideoStudioFoundationRuntime.js"),
    read("lib/creative/video/runtime/CreativeVideoStudioFlashVsrRuntime.js"),
    read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFlashVsrPodRuntime.js"),
    read("services/avantiqo-video-flashvsr/flashvsr_worker.py"),
    read("services/avantiqo-video-flashvsr/Dockerfile"),
    read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoRunpodVolumeCpuBridge.js"),
    read("supabase/migrations/20260828015200_avantiqo_video_runpod_lease.sql"),
  ]);
  assert.doesNotMatch(workflow, /FAL_KEY|FAL_API_KEY|queue\.fal\.run|fal-ai\/bytedance-upscaler/i);
  assert.match(workflow, /generation_backend: "OWNED_RUNPOD_POD_V6"/);
  assert.match(workflow, /state\.master_resolution === "4k"/);
  assert.match(workflow, /submitAvantiqoVideoFlashVsrMaster/);
  assert.match(workflow, /learned_super_resolution_used = true/);
  assert.match(workflow, /gpu_deleted_before_studio_encode/);
  assert.match(master, /STUDIO_CPU_FFMPEG_LANCZOS/);
  assert.match(master, /gpu_compute_used: false/);
  assert.match(foundation, /ffmpeg_location: "STUDIO"/);
  assert.match(foundation, /gpu_compute_used: false/);
  assert.match(flashStudio, /OWNED_GPU_FLASHVSR_V1_1_STUDIO_4K/);
  assert.match(flashStudio, /learned_super_resolution_used: true/);
  assert.match(flashStudio, /studio_final_encoding: true/);
  assert.match(flashStudio, /gpu_video_encoding_used: false/);
  assert.match(flashStudio, /-frames:v", String\(prepared\.source_frame_count\)/);
  assert.match(flashStudio, /volume_transfer_backend: "RUNPOD_CPU_VOLUME_BRIDGE"/);
  assert.match(flashStudio, /s3_credentials_required: false/);
  assert.match(flashStudio, /return \{ width: 3968, height: 2176 \}/);
  assert.match(flashStudio, /return \{ width: 2176, height: 3968 \}/);
  assert.doesNotMatch(flashStudio, /probe\.width \* 4|probe\.height \* 4/);
  assert.match(flashStudio, /function studioFinalFilter/);
  assert.match(flashStudio, /flags=lanczos,crop=\$\{targetWidth\}:\$\{targetHeight\}/);
  assert.match(flashStudio, /studio_final_scaling: outputWidth !== targetWidth \|\| outputHeight !== targetHeight/);
  assert.doesNotMatch(flashStudio, /scale=-2:2160:flags=lanczos/);
  assert.doesNotMatch(flashStudio, /presignAvantiqoVideoRunpodVolumeObject|RUNPOD_S3_ACCESS_KEY|RUNPOD_S3_SECRET_KEY/);
  assert.match(cpuBridge, /computeType: "CPU"/);
  assert.match(cpuBridge, /imageName: "python:3\.11-slim"/);
  assert.match(cpuBridge, /model_inference_used: false/);
  assert.match(cpuBridge, /ffmpeg_used: false/);
  assert.match(cpuBridge, /confirmed_terminal: true/);
  assert.doesNotMatch(cpuBridge, /torch|cuda|FAL_KEY|FAL_API_KEY|fal\.run|fal-ai\//i);
  assert.match(flashPod, /AVANTIQO_VIDEO_FLASHVSR_GPU_TYPE = "NVIDIA A100 80GB PCIe"/);
  assert.match(flashPod, /const STARTUP_TIMEOUT = 4 \* 60 \* 1000/);
  assert.match(flashPod, /const HARD_TIMEOUT = 12 \* 60 \* 1000/);
  assert.ok(flashPod.includes(IMMUTABLE_FLASHVSR_IMAGE), "FlashVSR runtime must use the certified immutable A100 image");
  assert.match(flashPod, /transfer_backend: "RUNPOD_CPU_VOLUME_BRIDGE_SEQUENTIAL"/);
  assert.match(flashPod, /upload_bridge_deleted_before_gpu: true/);
  assert.match(flashPod, /concurrent_volume_writers: false/);
  assert.match(flashPod, /s3_credentials_required: false/);
  assert.doesNotMatch(flashPod, /presignAvantiqoVideoRunpodVolumeObject|RUNPOD_S3_ACCESS_KEY|RUNPOD_S3_SECRET_KEY/);
  assert.match(leaseMigration, /owner_request_id uuid not null/);
  assert.match(leaseMigration, /p_owner_request_id uuid/);
  assert.match(flashPod, /const owner = crypto\.randomUUID\(\);/);
  assert.doesNotMatch(flashPod, /const owner = `master-\$\{crypto\.randomUUID\(\)\}`;/);
  const uploadPrepareIndex = flashPod.indexOf("prepared = await prepareCreativeVideoFlashVsrInput");
  const uploadBridgeDeleteIndex = flashPod.indexOf("const uploadBridgeDelete = await deleteAvantiqoVideoVolumeCpuBridge", uploadPrepareIndex);
  const leaseIndex = flashPod.indexOf("lease = await acquireVideoPodLease", uploadBridgeDeleteIndex);
  const gpuCreateIndex = flashPod.indexOf("const pod = await createMasterPod", leaseIndex);
  assert.ok(uploadPrepareIndex >= 0 && uploadBridgeDeleteIndex > uploadPrepareIndex && leaseIndex > uploadBridgeDeleteIndex && gpuCreateIndex > leaseIndex,
    "CPU upload bridge must be confirmed deleted before A100 lease/creation");
  const terminalBranch = flashPod.indexOf("if (!pod || podTerminal(pod)) {");
  const gpuDeleteIndex = flashPod.indexOf("await deleteVideoPod(podId)", terminalBranch);
  const gpuConfirmIndex = flashPod.indexOf("await confirmAvantiqoVideoPodTerminal(podId)", gpuDeleteIndex);
  const retrieveIndex = flashPod.indexOf("const retrieved = await retrieveAndFinalize(masterJob)", gpuConfirmIndex);
  const finalStudioIndex = flashPod.indexOf("const final = await finalizeCreativeVideoFlashVsrMaster", 0);
  assert.ok(terminalBranch >= 0 && gpuDeleteIndex > terminalBranch && gpuConfirmIndex > gpuDeleteIndex && retrieveIndex > gpuConfirmIndex,
    "A100 termination must be confirmed before retrieval bridge is created");
  assert.ok(finalStudioIndex >= 0, "Studio finalization must remain present after GPU lifecycle");
  assert.doesNotMatch(flashDocker, /\bffmpeg\b|libx264|libx265/i);
  assert.match(flashDocker, /BLOCK_SPARSE_ATTN_CUDA_ARCHS=80/);
  assert.match(flashDocker, /TORCH_CUDA_ARCH_LIST=8\.0/);
  assert.doesNotMatch(flashWorker, /\bffmpeg\b|libx264|libx265|FAL_KEY|FAL_API_KEY|fal\.run|fal-ai\//i);
  assert.match(flashWorker, /MODEL_REVISION = "a258bf2d58ac5a7d7193fb6ce4326aaff98ea6cb"/);
  assert.match(flashWorker, /video_encoded_on_paid_worker": False/);
  assert.match(flashWorker, /final_artifact_persisted_on_paid_worker": False/);
  assert.match(flashWorker, /ffmpeg_used_on_paid_worker": False/);
});
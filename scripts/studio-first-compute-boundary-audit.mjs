#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const CONTRACT = "AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1";
const ROOT = process.cwd();
const CERTIFIED_VIDEO_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker-gpu-only@sha256:2f477f95fcc46fdcb7aff1dda03944ad282eb3a7d33c95098bd13d00a76c3425";

const NON_VIDEO_PAID_WORKER_ROOTS = [
  "services/avantiqo-image-engine",
  "services/avantiqo-music-elastic-engine",
  "services/avantiqo-voice-stt",
  "services/avantiqo-voice-stt-realtime",
].map((entry) => path.join(ROOT, entry));

const ACTIVE_VIDEO_GPU_FILES = [
  "services/avantiqo-video-engine/Dockerfile.v6",
  "services/avantiqo-video-engine/gpu_core.py",
  "services/avantiqo-video-engine/handler_v6.py",
  "services/avantiqo-video-engine/requirements.gpu-only.txt",
];

const ACTIVE_VIDEO_WIRING_FILES = {
  podRuntime: "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js",
  podRunpod: "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js",
  workflowV3: "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntimeV3.js",
  studioFoundation: "lib/creative/video/runtime/CreativeVideoStudioFoundationRuntime.js",
  studioMaster: "lib/creative/video/runtime/CreativeVideoStudioMasterRuntime.js",
};

const GENERAL_FORBIDDEN = [
  ["FFMPEG_BINARY", /\bffmpeg\b/i],
  ["VIDEO_EXPORT", /\bexport_to_video\b/],
  ["VIDEO_CODEC", /\b(libx264|libx265|h264|hevc|av1|vp9)\b/i],
  ["MUX_OR_DEMUX", /\b(mux|demux|remux|transcode)\b/i],
  ["ARCHIVE_CPU_WORK", /\b(zipfile|tarfile|gzip|gunzip|unzip)\b/i],
  ["FINAL_STORAGE_ORCHESTRATION", /storage_upload|final_storage_reference|final_video_url/i],
];

const VIDEO_GPU_FORBIDDEN = [
  ["VIDEO_GPU_FFMPEG", /\bffmpeg\b/i],
  ["VIDEO_GPU_EXPORT", /export_to_video/i],
  ["VIDEO_GPU_CODEC", /\b(libx264|libx265|h264|hevc|av1|vp9)\b/i],
  ["VIDEO_GPU_FINAL_STORAGE", /storage_upload|final_storage_reference|final_video_url/i],
  ["VIDEO_GPU_FAL", /FAL_KEY|FAL_API_KEY|fal\.run|fal-ai\//i],
  ["VIDEO_GPU_LEGACY_HANDLER", /handler_v[1-5]\.py|import handler_v[1-5]\b|import handler\b/i],
];

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}
async function walk(dir) {
  if (!(await exists(dir))) return [];
  const rows = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const row of rows) {
    const full = path.join(dir, row.name);
    if (row.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}
function relative(file) { return path.relative(ROOT, file).replaceAll(path.sep, "/"); }
function isSource(file) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file);
  return [".py", ".js", ".mjs", ".ts", ".tsx", ".sh"].includes(ext) || /^Dockerfile(?:\.|$)/.test(base);
}
function violation(code, file, detail) { return { code, file, detail }; }
async function source(relativePath) {
  const full = path.join(ROOT, relativePath);
  if (!(await exists(full))) throw new Error(`${CONTRACT}_REQUIRED_FILE_MISSING:${relativePath}`);
  return readFile(full, "utf8");
}

const violations = [];
const scanned = [];

for (const root of NON_VIDEO_PAID_WORKER_ROOTS) {
  for (const file of await walk(root)) {
    if (!isSource(file)) continue;
    const body = await readFile(file, "utf8");
    const rel = relative(file);
    scanned.push(rel);
    for (const [code, pattern] of GENERAL_FORBIDDEN) {
      if (pattern.test(body)) violations.push(violation(code, rel, "Studio-capable operation found in paid worker source"));
    }
  }
}

for (const file of ACTIVE_VIDEO_GPU_FILES) {
  const body = await source(file);
  scanned.push(file);
  for (const [code, pattern] of VIDEO_GPU_FORBIDDEN) {
    if (pattern.test(body)) violations.push(violation(code, file, "Active Video GPU image contains Studio-capable or external mastering work"));
  }
}

const [dockerfile, gpuCore, gpuHandler, podRuntime, podRunpod, workflowV3, studioFoundation, studioMaster] = await Promise.all([
  source(ACTIVE_VIDEO_GPU_FILES[0]),
  source(ACTIVE_VIDEO_GPU_FILES[1]),
  source(ACTIVE_VIDEO_GPU_FILES[2]),
  source(ACTIVE_VIDEO_WIRING_FILES.podRuntime),
  source(ACTIVE_VIDEO_WIRING_FILES.podRunpod),
  source(ACTIVE_VIDEO_WIRING_FILES.workflowV3),
  source(ACTIVE_VIDEO_WIRING_FILES.studioFoundation),
  source(ACTIVE_VIDEO_WIRING_FILES.studioMaster),
]);

const requiredChecks = [
  ["VIDEO_DOCKER_GPU_ONLY_ENTRYPOINT", dockerfile.includes('CMD ["python", "-u", "handler_v6.py"]')],
  ["VIDEO_DOCKER_GPU_ONLY_CORE", dockerfile.includes("COPY gpu_core.py") && dockerfile.includes("COPY handler_v6.py")],
  ["VIDEO_GPU_BOUNDARY_CONTRACT", gpuHandler.includes('COMPUTE_BOUNDARY_CONTRACT = "AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1"')],
  ["VIDEO_GPU_INTERMEDIATE_ONLY", gpuHandler.includes('paid_worker_intermediate_egress_only": True')],
  ["VIDEO_GPU_NO_ENCODING", gpuHandler.includes('video_encoded_on_paid_worker": False')],
  ["VIDEO_GPU_NO_FINAL_PERSISTENCE", gpuHandler.includes('final_artifact_persisted_on_paid_worker": False')],
  ["VIDEO_GPU_QUALITY_PRESERVED", gpuCore.includes('QUALITY_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1"') && gpuCore.includes("torch_dtype=torch.float32") && gpuCore.includes("DTYPE = torch.bfloat16")],
  ["VIDEO_POD_V6_HANDLER", podRuntime.includes("import requests,runpod,handler_v6") && !podRuntime.includes("handler_v5.handler(job)")],
  ["VIDEO_POD_INTERMEDIATE_UPLOAD", podRuntime.includes("intermediate_upload: intermediateUpload") && !podRuntime.includes("storage_upload: upload")],
  ["VIDEO_POD_STUDIO_ASSEMBLY", podRuntime.includes("assembleCreativeVideoStudioFoundation")],
  ["VIDEO_POD_DELETE_BEFORE_STUDIO", (() => {
    const branch = podRuntime.indexOf("if (saved) {");
    const deletion = podRuntime.indexOf("await deleteVideoPod(podId)", branch);
    const studio = podRuntime.indexOf("const foundation = await finalizeStudioFoundation({ organizationId, podJob, saved })", branch);
    return branch >= 0 && deletion > branch && studio > deletion;
  })()],
  ["VIDEO_IMMUTABLE_GPU_ONLY_IMAGE", podRunpod.includes(CERTIFIED_VIDEO_IMAGE)],
  ["VIDEO_V3_FAL_FREE", !/FAL_KEY|FAL_API_KEY|queue\.fal\.run|fal-ai\/bytedance-upscaler/i.test(workflowV3)],
  ["VIDEO_V3_STUDIO_MASTER", workflowV3.includes("renderCreativeVideoStudioMaster") && workflowV3.includes("studio_compute_only_mastering = true")],
  ["VIDEO_STUDIO_FOUNDATION_FFMPEG", studioFoundation.includes('ffmpeg_location: "STUDIO"') && studioFoundation.includes("gpu_compute_used: false")],
  ["VIDEO_STUDIO_MASTER_FFMPEG", studioMaster.includes('backend: "STUDIO_CPU_FFMPEG_LANCZOS"') && studioMaster.includes("gpu_compute_used: false") && studioMaster.includes("fal_contacted: false")],
];
for (const [code, passed] of requiredChecks) {
  if (!passed) violations.push(violation(code, "ACTIVE_VIDEO_ARCHITECTURE", "Required Studio-first Video invariant is missing"));
}

const historicalVideoFiles = (await walk(path.join(ROOT, "services/avantiqo-video-engine")))
  .map(relative)
  .filter((file) => !ACTIVE_VIDEO_GPU_FILES.includes(file));
const failed = violations.length > 0;

console.log(JSON.stringify({
  success: !failed,
  contract: CONTRACT,
  default_placement: "STUDIO",
  paid_compute_allowed_reasons: [
    "GPU_ACCELERATOR_REQUIRED",
    "EXTERNAL_MODEL_INFERENCE_REQUIRED",
    "EXTERNAL_SYSTEM_SIDE_EFFECT_REQUIRED",
  ],
  video_enforcement: "STRICT_ACTIVE_CLOSURE",
  certified_video_gpu_image: CERTIFIED_VIDEO_IMAGE,
  active_video_gpu_files: ACTIVE_VIDEO_GPU_FILES,
  historical_video_files_retained_but_inactive: historicalVideoFiles.length,
  scanned_files: scanned.length,
  violation_count: violations.length,
  violations,
}, null, 2));

if (failed) {
  console.error(`${CONTRACT}=FAIL`);
  process.exit(1);
}

console.log(`${CONTRACT}=PASS`);

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  avantiqoVideoRunpodMasterObjectKeys,
  avantiqoVideoRunpodVolumePath,
} from "@/lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoRunpodVolumeS3";
import {
  deleteAvantiqoVideoVolumeObjectViaCpuBridge,
  downloadAvantiqoVideoVolumeFileViaCpuBridge,
  readAvantiqoVideoVolumeJsonViaCpuBridge,
  uploadAvantiqoVideoVolumeFileViaCpuBridge,
} from "@/lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoRunpodVolumeCpuBridge";

export const AVANTIQO_VIDEO_STUDIO_FLASHVSR_CONTRACT = "AVANTIQO_VIDEO_STUDIO_FLASHVSR_V1";
export const AVANTIQO_VIDEO_FLASHVSR_MODEL = "JunhaoZhuang/FlashVSR-v1.1";
export const AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION = "a258bf2d58ac5a7d7193fb6ce4326aaff98ea6cb";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function run(command, args, timeoutMs = 30 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("AVANTIQO_VIDEO_STUDIO_FLASHVSR_PROCESS_TIMEOUT"));
    }, timeoutMs);
    const finish = (error, result = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      const result = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0) finish(null, result);
      else finish(new Error(result.stderr || `AVANTIQO_VIDEO_STUDIO_FLASHVSR_PROCESS_EXIT_${code}`));
    });
  });
}

function fraction(value) {
  const [a, b] = String(value || "0/1").split("/").map(Number);
  if (!Number.isFinite(a)) return null;
  if (!Number.isFinite(b) || b === 0) return a;
  return a / b;
}

function ffmpegPath(mediaTools = {}) {
  return text(mediaTools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH || process.env.CREATIVE_MEDIA_FFMPEG_PATH) || "ffmpeg";
}
function ffprobePath(mediaTools = {}) {
  return text(mediaTools.ffprobe || process.env.CREATIVE_FFPROBE_PATH || process.env.CREATIVE_MEDIA_FFPROBE_PATH) || "ffprobe";
}
function requireBridge(volumeBridge) {
  if (!volumeBridge?.pod_id || !volumeBridge?.token || !volumeBridge?.base_url) {
    throw new Error("AVANTIQO_VIDEO_STUDIO_FLASHVSR_CPU_VOLUME_BRIDGE_REQUIRED");
  }
  return volumeBridge;
}

async function probeVideo(ffprobe, filePath) {
  const result = await run(ffprobe, [
    "-v", "error",
    "-select_streams", "v:0",
    "-count_frames",
    "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=duration",
    "-of", "json",
    filePath,
  ], 120_000);
  const parsed = JSON.parse(result.stdout || "{}");
  const video = Array.isArray(parsed.streams) ? parsed.streams[0] : null;
  if (!video) throw new Error("AVANTIQO_VIDEO_STUDIO_FLASHVSR_VIDEO_STREAM_REQUIRED");
  return {
    width: Math.max(1, Math.round(finite(video.width, 0))),
    height: Math.max(1, Math.round(finite(video.height, 0))),
    fps: fraction(video.avg_frame_rate || video.r_frame_rate) || 24,
    frame_count: Math.max(1, Math.round(finite(video.nb_read_frames, 0))),
    duration_seconds: Math.max(0, finite(parsed.format?.duration, 0)),
  };
}

function fourKAlignedTarget(width, height) {
  if (width === height) return { width: 2176, height: 2176 };
  if (width > height) return { width: 3968, height: 2176 };
  return { width: 2176, height: 3968 };
}

function scaleCropForTarget(width, height, targetWidth, targetHeight) {
  const factor = Math.max(targetWidth / width, targetHeight / height);
  const scaledWidth = Math.max(targetWidth, Math.ceil((width * factor) / 2) * 2);
  const scaledHeight = Math.max(targetHeight, Math.ceil((height * factor) / 2) * 2);
  return { scaledWidth, scaledHeight };
}

function studioFinalFilter(width, height, targetWidth, targetHeight) {
  if (width >= targetWidth && height >= targetHeight) {
    return `crop=${targetWidth}:${targetHeight}:(iw-${targetWidth})/2:(ih-${targetHeight})/2`;
  }
  const scaled = scaleCropForTarget(width, height, targetWidth, targetHeight);
  return `scale=${scaled.scaledWidth}:${scaled.scaledHeight}:flags=lanczos,crop=${targetWidth}:${targetHeight}:(iw-${targetWidth})/2:(ih-${targetHeight})/2`;
}

function nextCausalFrameWindow(sourceFrames) {
  const minimum = Math.max(9, sourceFrames + 4);
  return Math.ceil((minimum - 1) / 8) * 8 + 1;
}

export async function prepareCreativeVideoFlashVsrInput({ organization_id, source_url, owner_request_id, volume_bridge, media_tools = {} } = {}) {
  if (!organization_id) throw new Error("AVANTIQO_VIDEO_STUDIO_FLASHVSR_ORGANIZATION_REQUIRED");
  if (!source_url) throw new Error("AVANTIQO_VIDEO_STUDIO_FLASHVSR_SOURCE_REQUIRED");
  if (!owner_request_id) throw new Error("AVANTIQO_VIDEO_STUDIO_FLASHVSR_OWNER_REQUIRED");
  const bridge = requireBridge(volume_bridge);
  const ffprobe = ffprobePath(media_tools);
  const source = await materializeMedia({
    organization_id,
    url: source_url,
    file_name: "avantiqo-video-flashvsr-source.mp4",
    mime_type: "video/mp4",
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300_000, max_redirects: 0 },
  });
  const keys = avantiqoVideoRunpodMasterObjectKeys(owner_request_id);
  try {
    const probe = await probeVideo(ffprobe, source.file_path);
    const target = fourKAlignedTarget(probe.width, probe.height);
    const sourceFrames = probe.frame_count;
    const paddedFrames = nextCausalFrameWindow(sourceFrames);
    const startedAt = Date.now();
    const bytes = await uploadAvantiqoVideoVolumeFileViaCpuBridge(bridge, keys.input_mp4, source.file_path);
    return {
      success: true,
      contract: AVANTIQO_VIDEO_STUDIO_FLASHVSR_CONTRACT,
      model: AVANTIQO_VIDEO_FLASHVSR_MODEL,
      model_revision: AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION,
      input_key: keys.input_mp4,
      input_path: avantiqoVideoRunpodVolumePath(keys.input_mp4),
      input_format: "video/mp4",
      output_key: keys.output_rgb,
      output_path: avantiqoVideoRunpodVolumePath(keys.output_rgb),
      receipt_key: keys.receipt,
      receipt_path: avantiqoVideoRunpodVolumePath(keys.receipt),
      width: target.width,
      height: target.height,
      source_width: probe.width,
      source_height: probe.height,
      source_frame_count: sourceFrames,
      padded_frame_count: paddedFrames,
      fps: probe.fps,
      duration_seconds: probe.duration_seconds,
      input_bytes: bytes,
      studio_preprocessing: false,
      worker_input_decode: true,
      gpu_compute_used: false,
      ffmpeg_location: "STUDIO_FINAL_ONLY",
      volume_transfer_backend: "RUNPOD_CPU_VOLUME_BRIDGE_COMPACT_MP4",
      s3_credentials_required: false,
      processing_ms: Date.now() - startedAt,
    };
  } finally {
    await source.cleanup().catch(() => {});
  }
}

export async function readCreativeVideoFlashVsrReceipt(receiptKey, volumeBridge) {
  const bridge = requireBridge(volumeBridge);
  try {
    const receipt = await readAvantiqoVideoVolumeJsonViaCpuBridge(bridge, receiptKey, { max_bytes: 2 * 1024 * 1024 });
    if (receipt?.contract !== "AVANTIQO_VIDEO_FLASHVSR_GPU_MASTER_V1") throw new Error("AVANTIQO_VIDEO_FLASHVSR_RECEIPT_CONTRACT_INVALID");
    return receipt;
  } catch (error) {
    if (error?.code === "NOT_FOUND" || text(error?.message).includes("_NOT_FOUND")) return null;
    throw error;
  }
}

export async function finalizeCreativeVideoFlashVsrMaster({ organization_id, source_url, prepared, receipt, volume_bridge, media_tools = {} } = {}) {
  if (!organization_id || !source_url || !prepared || !receipt) throw new Error("AVANTIQO_VIDEO_STUDIO_FLASHVSR_FINALIZE_INPUT_REQUIRED");
  if (receipt.success !== true) throw new Error(receipt.error_code || "AVANTIQO_VIDEO_FLASHVSR_GPU_MASTER_FAILED");
  if (receipt.video_encoded_on_paid_worker !== false || receipt.final_artifact_persisted_on_paid_worker !== false || receipt.ffmpeg_used_on_paid_worker !== false) {
    throw new Error("AVANTIQO_VIDEO_FLASHVSR_PAID_CPU_BOUNDARY_VIOLATION");
  }
  const bridge = requireBridge(volume_bridge);
  const ffmpeg = ffmpegPath(media_tools);
  const ffprobe = ffprobePath(media_tools);
  const source = await materializeMedia({
    organization_id,
    url: source_url,
    file_name: "avantiqo-video-flashvsr-source.mp4",
    mime_type: "video/mp4",
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300_000, max_redirects: 0 },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-video-flashvsr-final-"));
  const rawPath = path.join(root, "enhanced.rgb");
  const outputPath = path.join(root, "master-4k.mp4");
  try {
    const sourceProbe = await probeVideo(ffprobe, source.file_path);
    await downloadAvantiqoVideoVolumeFileViaCpuBridge(bridge, prepared.output_key, rawPath, { max_bytes: 16 * 1024 * 1024 * 1024 });
    const outputWidth = Math.round(finite(receipt.output_width, 0));
    const outputHeight = Math.round(finite(receipt.output_height, 0));
    const outputFrames = Math.round(finite(receipt.output_frame_count, 0));
    if (outputWidth !== prepared.width || outputHeight !== prepared.height || outputFrames < prepared.source_frame_count) {
      throw new Error(`AVANTIQO_VIDEO_FLASHVSR_OUTPUT_SHAPE_INVALID:${outputWidth}x${outputHeight}:${outputFrames}`);
    }
    const landscape = sourceProbe.width >= sourceProbe.height;
    const square = sourceProbe.width === sourceProbe.height;
    const targetWidth = square ? 2160 : landscape ? 3840 : 2160;
    const targetHeight = square ? 2160 : landscape ? 2160 : 3840;
    const filter = studioFinalFilter(outputWidth, outputHeight, targetWidth, targetHeight);
    const startedAt = Date.now();
    await run(ffmpeg, [
      "-y",
      "-f", "rawvideo",
      "-pixel_format", "rgb24",
      "-video_size", `${outputWidth}x${outputHeight}`,
      "-framerate", String(prepared.fps),
      "-i", rawPath,
      "-i", source.file_path,
      "-frames:v", String(prepared.source_frame_count),
      "-map", "0:v:0",
      "-map", "1:a?",
      "-vf", filter,
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "14",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "320k",
      "-shortest",
      outputPath,
    ], 40 * 60 * 1000);
    const outputProbe = await probeVideo(ffprobe, outputPath);
    if (outputProbe.width !== targetWidth || outputProbe.height !== targetHeight) {
      throw new Error(`AVANTIQO_VIDEO_FLASHVSR_FINAL_DIMENSIONS_INVALID:${outputProbe.width}x${outputProbe.height}`);
    }
    const buffer = await fs.readFile(outputPath);
    if (!buffer.length) throw new Error("AVANTIQO_VIDEO_FLASHVSR_FINAL_EMPTY");
    return {
      success: true,
      contract: AVANTIQO_VIDEO_STUDIO_FLASHVSR_CONTRACT,
      backend: "OWNED_GPU_FLASHVSR_V1_1_STUDIO_4K",
      model: AVANTIQO_VIDEO_FLASHVSR_MODEL,
      model_revision: AVANTIQO_VIDEO_FLASHVSR_MODEL_REVISION,
      buffer,
      output_probe: outputProbe,
      target_resolution: "4k",
      target_width: targetWidth,
      target_height: targetHeight,
      learned_master_width: outputWidth,
      learned_master_height: outputHeight,
      studio_final_scaling: outputWidth !== targetWidth || outputHeight !== targetHeight,
      learned_super_resolution_used: true,
      studio_final_encoding: true,
      gpu_inference_used: true,
      gpu_video_encoding_used: false,
      fal_contacted: false,
      external_mastering_provider_contacted: false,
      volume_transfer_backend: "RUNPOD_CPU_VOLUME_BRIDGE",
      s3_credentials_required: false,
      processing_ms: Date.now() - startedAt,
    };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export async function cleanupCreativeVideoFlashVsrObjects(prepared = {}, volumeBridge) {
  const bridge = requireBridge(volumeBridge);
  const keys = [prepared.input_key, prepared.output_key, prepared.receipt_key].map(text).filter(Boolean);
  for (const key of keys) await deleteAvantiqoVideoVolumeObjectViaCpuBridge(bridge, key).catch(() => null);
}

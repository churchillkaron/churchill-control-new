import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

export const AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT = "AVANTIQO_VIDEO_STUDIO_CPU_MASTER_V1";
export const AVANTIQO_VIDEO_STUDIO_MASTER_MODEL = "avantiqo-studio-ffmpeg-lanczos-v1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function run(command, args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("AVANTIQO_VIDEO_STUDIO_MASTER_PROCESS_TIMEOUT"));
    }, timeoutMs);

    const finish = (error, value = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      const output = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) finish(null, output);
      else finish(new Error(output.stderr || `AVANTIQO_VIDEO_STUDIO_MASTER_PROCESS_EXIT_${code}`));
    });
  });
}

function fraction(value) {
  const [numerator, denominator] = String(value || "0/1").split("/").map(Number);
  if (!Number.isFinite(numerator)) return null;
  if (!Number.isFinite(denominator) || denominator === 0) return numerator;
  return numerator / denominator;
}

async function probe(ffprobe, filePath) {
  const result = await run(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,sample_rate,channels",
    "-of", "json",
    filePath,
  ], 120_000);
  const parsed = JSON.parse(result.stdout || "{}");
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((entry) => entry.codec_type === "video");
  const audio = streams.find((entry) => entry.codec_type === "audio") || null;
  if (!video) throw new Error("AVANTIQO_VIDEO_STUDIO_MASTER_VIDEO_STREAM_REQUIRED");
  return {
    width: Math.max(1, Math.round(finite(video.width, 0))),
    height: Math.max(1, Math.round(finite(video.height, 0))),
    duration_seconds: Math.max(0, finite(parsed.format?.duration, 0)),
    frame_rate: fraction(video.avg_frame_rate || video.r_frame_rate),
    video_codec: text(video.codec_name) || null,
    has_audio: Boolean(audio),
    audio_codec: text(audio?.codec_name) || null,
    audio_sample_rate: finite(audio?.sample_rate, null),
    audio_channels: finite(audio?.channels, null),
  };
}

function targetDimensions(resolution, sourceWidth, sourceHeight) {
  const requested = text(resolution).toLowerCase();
  const longEdge = requested === "4k" ? 3840 : requested === "2k" ? 2560 : 1920;
  const shortEdge = requested === "4k" ? 2160 : requested === "2k" ? 1440 : 1080;
  if (sourceWidth === sourceHeight) return { width: shortEdge, height: shortEdge };
  if (sourceHeight > sourceWidth) return { width: shortEdge, height: longEdge };
  return { width: longEdge, height: shortEdge };
}

function ffmpegPath(input = {}) {
  return text(
    input.media_tools?.ffmpeg ||
    process.env.CREATIVE_FFMPEG_PATH ||
    process.env.CREATIVE_MEDIA_FFMPEG_PATH,
  ) || "ffmpeg";
}

function ffprobePath(input = {}) {
  return text(
    input.media_tools?.ffprobe ||
    process.env.CREATIVE_FFPROBE_PATH ||
    process.env.CREATIVE_MEDIA_FFPROBE_PATH,
  ) || "ffprobe";
}

export async function renderCreativeVideoStudioMaster({
  organization_id,
  source_url,
  target_resolution = "4k",
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("AVANTIQO_VIDEO_STUDIO_MASTER_ORGANIZATION_REQUIRED");
  if (!source_url) throw new Error("AVANTIQO_VIDEO_STUDIO_MASTER_SOURCE_REQUIRED");

  const ffmpeg = ffmpegPath({ media_tools });
  const ffprobe = ffprobePath({ media_tools });
  const source = await materializeMedia({
    organization_id,
    url: source_url,
    file_name: "avantiqo-video-foundation.mp4",
    mime_type: "video/mp4",
    policy: {
      max_bytes: 2_147_483_648,
      timeout_ms: 300_000,
      max_redirects: 0,
    },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-video-studio-master-"));
  const outputPath = path.join(root, "master.mp4");

  try {
    const inputProbe = await probe(ffprobe, source.file_path);
    const target = targetDimensions(target_resolution, inputProbe.width, inputProbe.height);
    const filter = [
      `scale=${target.width}:${target.height}:flags=lanczos:force_original_aspect_ratio=decrease`,
      `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:black`,
      "setsar=1",
    ].join(",");

    const args = [
      "-y",
      "-i", source.file_path,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-vf", filter,
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "14",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "320k",
      outputPath,
    ];

    const startedAt = Date.now();
    await run(ffmpeg, args, 20 * 60 * 1000);
    const outputProbe = await probe(ffprobe, outputPath);
    if (outputProbe.width !== target.width || outputProbe.height !== target.height) {
      throw new Error(
        `AVANTIQO_VIDEO_STUDIO_MASTER_DIMENSIONS_INVALID:${outputProbe.width}x${outputProbe.height}:${target.width}x${target.height}`,
      );
    }
    if (inputProbe.duration_seconds > 0 && outputProbe.duration_seconds > 0) {
      const drift = Math.abs(inputProbe.duration_seconds - outputProbe.duration_seconds);
      if (drift > Math.max(0.08, inputProbe.duration_seconds * 0.01)) {
        throw new Error(`AVANTIQO_VIDEO_STUDIO_MASTER_DURATION_DRIFT:${drift.toFixed(6)}`);
      }
    }

    const buffer = await fs.readFile(outputPath);
    if (!buffer.length) throw new Error("AVANTIQO_VIDEO_STUDIO_MASTER_EMPTY_OUTPUT");
    return {
      success: true,
      contract: AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT,
      model: AVANTIQO_VIDEO_STUDIO_MASTER_MODEL,
      backend: "STUDIO_CPU_FFMPEG_LANCZOS",
      buffer,
      input_probe: inputProbe,
      output_probe: outputProbe,
      target_resolution: text(target_resolution).toLowerCase(),
      target_width: target.width,
      target_height: target.height,
      processing_ms: Date.now() - startedAt,
      studio_compute_only: true,
      gpu_compute_used: false,
      paid_provider_contacted: false,
      fal_contacted: false,
      external_mastering_provider_contacted: false,
    };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export const CreativeVideoStudioMasterRuntime = {
  contract: AVANTIQO_VIDEO_STUDIO_MASTER_CONTRACT,
  model: AVANTIQO_VIDEO_STUDIO_MASTER_MODEL,
  render: renderCreativeVideoStudioMaster,
};

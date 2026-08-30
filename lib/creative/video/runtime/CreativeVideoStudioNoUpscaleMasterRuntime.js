import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

export const AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_CONTRACT =
  "AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_4K_MASTER_V1";
export const AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_MODEL =
  "avantiqo-studio-native-4k-crop-encode-v1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function run(command, args, timeoutMs = 20 * 60 * 1000) {
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
      reject(new Error("AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_PROCESS_TIMEOUT"));
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
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) finish(null, result);
      else finish(new Error(result.stderr || `AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_EXIT_${code}`));
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
  if (!video) throw new Error("AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_VIDEO_REQUIRED");
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

function targetForSource(width, height) {
  if (width === height) return { width: 2160, height: 2160 };
  return width > height
    ? { width: 3840, height: 2160 }
    : { width: 2160, height: 3840 };
}

function noUpscaleCrop(source, target) {
  if (source.width < target.width || source.height < target.height) {
    throw new Error(
      `AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_SOURCE_TOO_SMALL:${source.width}x${source.height}:${target.width}x${target.height}`,
    );
  }
  const x = Math.floor((source.width - target.width) / 2);
  const y = Math.floor((source.height - target.height) / 2);
  return `crop=${target.width}:${target.height}:${x}:${y},setsar=1`;
}

function ffmpegPath(mediaTools = {}) {
  return text(
    mediaTools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH || process.env.CREATIVE_MEDIA_FFMPEG_PATH,
  ) || "ffmpeg";
}

function ffprobePath(mediaTools = {}) {
  return text(
    mediaTools.ffprobe || process.env.CREATIVE_FFPROBE_PATH || process.env.CREATIVE_MEDIA_FFPROBE_PATH,
  ) || "ffprobe";
}

export async function renderCreativeVideoStudioNoUpscaleMaster({
  organization_id,
  source_url,
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_ORGANIZATION_REQUIRED");
  if (!source_url) throw new Error("AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_SOURCE_REQUIRED");

  const ffmpeg = ffmpegPath(media_tools);
  const ffprobe = ffprobePath(media_tools);
  const source = await materializeMedia({
    organization_id,
    url: source_url,
    file_name: "avantiqo-ltx25-native-4k.mp4",
    mime_type: "video/mp4",
    policy: {
      max_bytes: 4_294_967_296,
      timeout_ms: 600_000,
      max_redirects: 0,
    },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-video-native-4k-master-"));
  const outputPath = path.join(root, "master.mp4");

  try {
    const inputProbe = await probe(ffprobe, source.file_path);
    const target = targetForSource(inputProbe.width, inputProbe.height);
    const filter = noUpscaleCrop(inputProbe, target);
    if (/scale\s*=|lanczos/i.test(filter)) {
      throw new Error("AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_FILTER_VIOLATION");
    }

    const args = [
      "-y",
      "-i", source.file_path,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-vf", filter,
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "12",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "320k",
      outputPath,
    ];

    const startedAt = Date.now();
    await run(ffmpeg, args);
    const outputProbe = await probe(ffprobe, outputPath);
    if (outputProbe.width !== target.width || outputProbe.height !== target.height) {
      throw new Error(
        `AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_DIMENSIONS_INVALID:${outputProbe.width}x${outputProbe.height}:${target.width}x${target.height}`,
      );
    }
    if (inputProbe.duration_seconds > 0 && outputProbe.duration_seconds > 0) {
      const drift = Math.abs(inputProbe.duration_seconds - outputProbe.duration_seconds);
      if (drift > Math.max(0.08, inputProbe.duration_seconds * 0.01)) {
        throw new Error(`AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_DURATION_DRIFT:${drift.toFixed(6)}`);
      }
    }
    if (inputProbe.has_audio && !outputProbe.has_audio) {
      throw new Error("AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_AUDIO_LOST");
    }

    const buffer = await fs.readFile(outputPath);
    if (!buffer.length) throw new Error("AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_EMPTY_OUTPUT");
    return {
      success: true,
      contract: AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_CONTRACT,
      model: AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_MODEL,
      backend: "STUDIO_CPU_NATIVE_4K_CROP_ENCODE",
      buffer,
      input_probe: inputProbe,
      output_probe: outputProbe,
      target_resolution: "4k",
      target_width: target.width,
      target_height: target.height,
      source_native_4k_required: true,
      pixel_upscale_used: false,
      lanczos_upscale_used: false,
      learned_super_resolution_used_in_master: false,
      studio_final_encoding: true,
      native_audio_preserved: inputProbe.has_audio ? outputProbe.has_audio : true,
      gpu_compute_used: false,
      external_provider_contacted: false,
      processing_ms: Date.now() - startedAt,
    };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export const CreativeVideoStudioNoUpscaleMasterRuntime = {
  contract: AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_CONTRACT,
  model: AVANTIQO_VIDEO_STUDIO_NO_UPSCALE_MASTER_MODEL,
  render: renderCreativeVideoStudioNoUpscaleMaster,
};

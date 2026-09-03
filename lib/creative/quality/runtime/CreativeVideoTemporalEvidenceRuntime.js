import { spawnSync } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  resolveCreativeFfmpegPath,
  resolveCreativeFfprobePath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const CONTRACT = "CREATIVE_VIDEO_TEMPORAL_EVIDENCE_V1";
const SAMPLE_FPS = 6;
const FRAME_WIDTH = 160;
const FRAME_HEIGHT = 90;
const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT;
const MAX_SAMPLE_FRAMES = 180;
const MAX_RAW_BYTES = FRAME_BYTES * MAX_SAMPLE_FRAMES;
const NEAR_DUPLICATE_MOTION_PERCENT = 0.12;
const AUDIO_VIDEO_DURATION_TOLERANCE_SECONDS = 0.12;
const AUDIO_VIDEO_START_TOLERANCE_SECONDS = 0.08;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function ratio(value) {
  if (!value) return null;
  const [left, right] = String(value).split("/").map(Number);
  if (!Number.isFinite(left)) return null;
  if (!Number.isFinite(right) || right === 0) return left;
  return left / right;
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function percentile(values, position) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(position * sorted.length) - 1),
  );
  return sorted[index];
}

function stderrText(value) {
  if (Buffer.isBuffer(value)) return value.toString("utf8").trim();
  return text(value);
}

function run(binary, args, label, options = {}) {
  const result = spawnSync(binary, args, {
    encoding: options.encoding === null ? null : "utf8",
    maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`${label}_UNAVAILABLE:${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}_FAILED:${stderrText(result.stderr) || result.status}`);
  }
  return result.stdout;
}

function probe(filePath, policy = {}) {
  const ffprobe = resolveCreativeFfprobePath(policy);
  if (!ffprobe) throw new Error("CREATIVE_VIDEO_TEMPORAL_FFPROBE_REQUIRED");
  const raw = run(
    ffprobe,
    [
      "-v", "error",
      "-show_entries",
      "format=duration,start_time:stream=index,codec_type,codec_name,duration,start_time,avg_frame_rate,sample_rate,channels",
      "-of", "json",
      filePath,
    ],
    "CREATIVE_VIDEO_TEMPORAL_FFPROBE",
  );
  let parsed;
  try {
    parsed = JSON.parse(String(raw || "{}"));
  } catch {
    throw new Error("CREATIVE_VIDEO_TEMPORAL_FFPROBE_INVALID_JSON");
  }
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video") || null;
  const audio = streams.find((stream) => stream.codec_type === "audio") || null;
  if (!video) throw new Error("CREATIVE_VIDEO_TEMPORAL_VIDEO_STREAM_REQUIRED");

  const formatDuration = finite(parsed.format?.duration);
  const videoDuration = finite(video.duration, formatDuration);
  const audioDuration = audio ? finite(audio.duration, formatDuration) : null;
  const videoStart = finite(video.start_time, finite(parsed.format?.start_time, 0)) || 0;
  const audioStart = audio ? finite(audio.start_time, finite(parsed.format?.start_time, 0)) || 0 : null;

  return {
    video: {
      codec: text(video.codec_name) || null,
      duration_seconds: videoDuration,
      start_seconds: videoStart,
      frame_rate: ratio(video.avg_frame_rate),
    },
    audio: audio
      ? {
          codec: text(audio.codec_name) || null,
          duration_seconds: audioDuration,
          start_seconds: audioStart,
          sample_rate: finite(audio.sample_rate),
          channels: finite(audio.channels),
        }
      : null,
    format_duration_seconds: formatDuration,
  };
}

function rawFrames(filePath, policy = {}) {
  const ffmpeg = resolveCreativeFfmpegPath(policy);
  if (!ffmpeg) throw new Error("CREATIVE_VIDEO_TEMPORAL_FFMPEG_REQUIRED");
  const filter = [
    `fps=${SAMPLE_FPS}`,
    `scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "format=gray",
  ].join(",");
  const stdout = run(
    ffmpeg,
    [
      "-v", "error",
      "-i", filePath,
      "-map", "0:v:0",
      "-an",
      "-vf", filter,
      "-frames:v", String(MAX_SAMPLE_FRAMES),
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "pipe:1",
    ],
    "CREATIVE_VIDEO_TEMPORAL_FFMPEG",
    { encoding: null, maxBuffer: MAX_RAW_BYTES + 1024 * 1024 },
  );
  const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || []);
  const frameCount = Math.floor(buffer.length / FRAME_BYTES);
  if (frameCount < 2) {
    throw new Error(`CREATIVE_VIDEO_TEMPORAL_SAMPLE_INSUFFICIENT:${frameCount}`);
  }
  return Array.from({ length: frameCount }, (_, index) =>
    buffer.subarray(index * FRAME_BYTES, (index + 1) * FRAME_BYTES),
  );
}

function frameMean(frame) {
  let sum = 0;
  for (const value of frame) sum += value;
  return sum / frame.length;
}

function difference(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += Math.abs(left[index] - right[index]);
  }
  return (sum / left.length / 255) * 100;
}

function summarizeFrames(frames) {
  const means = frames.map(frameMean);
  const motion = [];
  const lumaDelta = [];
  for (let index = 1; index < frames.length; index += 1) {
    motion.push(difference(frames[index - 1], frames[index]));
    lumaDelta.push((Math.abs(means[index] - means[index - 1]) / 255) * 100);
  }
  const jerk = motion.slice(1).map((value, index) =>
    Math.abs(value - motion[index]),
  );
  const nearDuplicates = motion.filter((value) =>
    value <= NEAR_DUPLICATE_MOTION_PERCENT,
  ).length;
  const dynamicPairs = motion.filter((value) => value >= 1).length;
  const firstLastChange = difference(frames[0], frames[frames.length - 1]);

  return {
    sampled_fps: SAMPLE_FPS,
    sampled_frame_count: frames.length,
    sampled_duration_seconds: round((frames.length - 1) / SAMPLE_FPS),
    motion_change_percent: {
      mean: round(motion.reduce((sum, value) => sum + value, 0) / motion.length),
      median: round(percentile(motion, 0.5)),
      p95: round(percentile(motion, 0.95)),
      maximum: round(Math.max(...motion)),
      first_to_last: round(firstLastChange),
    },
    motion_smoothness_proxy: {
      jerk_median: round(percentile(jerk, 0.5)),
      jerk_p95: round(percentile(jerk, 0.95)),
      jerk_maximum: round(jerk.length ? Math.max(...jerk) : 0),
    },
    temporal_flicker_proxy: {
      luma_delta_median: round(percentile(lumaDelta, 0.5)),
      luma_delta_p95: round(percentile(lumaDelta, 0.95)),
      luma_delta_maximum: round(Math.max(...lumaDelta)),
    },
    dynamic_degree_proxy: round(dynamicPairs / motion.length),
    near_duplicate_pair_ratio: round(nearDuplicates / motion.length),
    near_duplicate_threshold_percent: NEAR_DUPLICATE_MOTION_PERCENT,
  };
}

function timingEvidence(streams, { audio_required = false } = {}) {
  const video = object(streams.video);
  const audio = streams.audio ? object(streams.audio) : null;
  const durationDelta = audio && video.duration_seconds !== null && audio.duration_seconds !== null
    ? Math.abs(video.duration_seconds - audio.duration_seconds)
    : null;
  const startDelta = audio && video.start_seconds !== null && audio.start_seconds !== null
    ? Math.abs(video.start_seconds - audio.start_seconds)
    : null;
  const audioPresent = Boolean(audio?.codec);
  const passed = !audio_required || (
    audioPresent &&
    durationDelta !== null &&
    startDelta !== null &&
    durationDelta <= AUDIO_VIDEO_DURATION_TOLERANCE_SECONDS &&
    startDelta <= AUDIO_VIDEO_START_TOLERANCE_SECONDS
  );
  return {
    audio_required,
    audio_present: audioPresent,
    video_duration_seconds: round(video.duration_seconds),
    audio_duration_seconds: round(audio?.duration_seconds),
    duration_delta_seconds: round(durationDelta),
    duration_tolerance_seconds: AUDIO_VIDEO_DURATION_TOLERANCE_SECONDS,
    video_start_seconds: round(video.start_seconds),
    audio_start_seconds: round(audio?.start_seconds),
    start_delta_seconds: round(startDelta),
    start_tolerance_seconds: AUDIO_VIDEO_START_TOLERANCE_SECONDS,
    passed,
  };
}

function riskFlags(summary, timing) {
  const flags = [];
  if (
    summary.near_duplicate_pair_ratio >= 0.9 &&
    summary.motion_change_percent.p95 <= 0.5
  ) {
    flags.push("NEAR_STATIC_OR_FROZEN_SEQUENCE");
  }
  if (
    summary.motion_smoothness_proxy.jerk_p95 >= 8 &&
    summary.motion_change_percent.median <= 3
  ) {
    flags.push("TEMPORAL_MOTION_JERK_RISK");
  }
  if (summary.temporal_flicker_proxy.luma_delta_p95 >= 10) {
    flags.push("LUMA_FLICKER_OR_FLASH_RISK");
  }
  if (!timing.passed) flags.push("AUDIO_VIDEO_TIMING_MISMATCH");
  return flags;
}

export function analyzeCreativeVideoTemporalFile({
  file_path,
  policy = {},
  audio_required = false,
} = {}) {
  if (!file_path) throw new Error("CREATIVE_VIDEO_TEMPORAL_FILE_REQUIRED");
  const streams = probe(file_path, policy);
  const frames = rawFrames(file_path, policy);
  const summary = summarizeFrames(frames);
  const timing = timingEvidence(streams, { audio_required });
  const flags = riskFlags(summary, timing);
  return {
    contract: CONTRACT,
    evidence_ready: true,
    provider_calls_executed: 0,
    gpu_calls_executed: 0,
    sample: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      ...summary,
    },
    streams,
    audio_video_timing: timing,
    risk_flags: flags,
    hard_failures: timing.passed ? [] : ["AUDIO_VIDEO_TIMING_MISMATCH"],
    methodology: {
      inspiration: "VBench-style temporal dimensions",
      subject_or_identity_consistency_requires_perceptual_review: true,
      background_consistency_requires_perceptual_review: true,
      temporal_flicker_proxy_is_machine_evidence_not_final_verdict: true,
      motion_smoothness_proxy_is_machine_evidence_not_final_verdict: true,
      dynamic_degree_proxy_is_machine_evidence_not_final_verdict: true,
    },
  };
}

export async function analyzeCreativeVideoTemporalEvidence({
  organization_id,
  url,
  file_name = null,
  mime_type = null,
  policy = {},
  audio_required = false,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!url) throw new Error("CREATIVE_VIDEO_TEMPORAL_URL_REQUIRED");
  const media = await materializeMedia({
    organization_id,
    url,
    file_name,
    mime_type,
    policy,
  });
  try {
    return analyzeCreativeVideoTemporalFile({
      file_path: media.file_path,
      policy,
      audio_required,
    });
  } finally {
    await media.cleanup();
  }
}

export const CreativeVideoTemporalEvidenceRuntime = Object.freeze({
  contract: CONTRACT,
  sample_fps: SAMPLE_FPS,
  sample_width: FRAME_WIDTH,
  sample_height: FRAME_HEIGHT,
  analyzeFile: analyzeCreativeVideoTemporalFile,
  analyze: analyzeCreativeVideoTemporalEvidence,
});

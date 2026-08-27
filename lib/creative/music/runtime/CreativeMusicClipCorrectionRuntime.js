import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const CONTRACT = "AVANTIQO_MUSIC_CLIP_CORRECTION_RENDER_V1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function run(command, args, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CREATIVE_MUSIC_CLIP_CORRECTION_PROCESS_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolve(output);
      else reject(new Error(output.stderr || `CREATIVE_MUSIC_CLIP_CORRECTION_PROCESS_EXIT_${code}`));
    });
  });
}

async function probe(ffprobe, filePath) {
  const result = await run(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,sample_rate,channels",
    "-of", "json",
    filePath,
  ], 120000);
  const parsed = JSON.parse(result.stdout || "{}");
  const stream = (parsed.streams || []).find((entry) => entry.codec_type === "audio");
  if (!stream) throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_AUDIO_STREAM_REQUIRED");
  return {
    duration_seconds: finite(parsed.format?.duration, 0),
    sample_rate: Math.max(8000, Math.round(finite(stream.sample_rate, 48000))),
    channels: Math.max(1, Math.min(2, Math.round(finite(stream.channels, 2)))),
  };
}

function atempoFilters(factor) {
  const filters = [];
  let value = factor;
  while (value < 0.5) {
    filters.push("atempo=0.5");
    value /= 0.5;
  }
  while (value > 2) {
    filters.push("atempo=2.0");
    value /= 2;
  }
  filters.push(`atempo=${value.toFixed(8)}`);
  return filters;
}

export function normalizeMusicClipCorrection(input = {}) {
  const semitones = clamp(input.pitch_semitones, -12, 12, 0);
  const cents = clamp(input.pitch_cents, -100, 100, 0);
  const totalSemitones = clamp(semitones + cents / 100, -12, 12, 0);
  const timingPercent = clamp(input.timing_percent, 50, 200, 100);
  return {
    contract: CONTRACT,
    pitch_semitones: semitones,
    pitch_cents: cents,
    total_pitch_semitones: totalSemitones,
    pitch_ratio: 2 ** (totalSemitones / 12),
    timing_percent: timingPercent,
    timing_ratio: timingPercent / 100,
    formant_preservation: false,
    note_level_tuning: false,
    transient_aware_warp: false,
    destructive_processing: false,
  };
}

export async function renderMusicClipCorrection({
  organization_id,
  source_url,
  source_file_name = "music-source.wav",
  source_mime_type = null,
  source_offset_seconds = 0,
  duration_seconds,
  sample_rate = 48000,
  correction = {},
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_ORGANIZATION_REQUIRED");
  if (!source_url) throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_SOURCE_REQUIRED");
  const duration = Math.max(0.01, finite(duration_seconds, 0));
  if (!(duration > 0)) throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_DURATION_REQUIRED");
  const normalized = normalizeMusicClipCorrection(correction);
  if (Math.abs(normalized.total_pitch_semitones) < 0.0001 && Math.abs(normalized.timing_percent - 100) < 0.0001) {
    throw new Error("CREATIVE_MUSIC_CLIP_CORRECTION_CHANGE_REQUIRED");
  }

  const ffmpeg = text(media_tools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH) || "ffmpeg";
  const ffprobe = text(media_tools.ffprobe || process.env.CREATIVE_FFPROBE_PATH) || "ffprobe";
  const source = await materializeMedia({
    url: source_url,
    file_name: source_file_name,
    mime_type: source_mime_type,
    organization_id,
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300000, max_redirects: 0 },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-music-correction-"));
  try {
    const inputProbe = await probe(ffprobe, source.file_path);
    const outputSampleRate = Math.max(8000, Math.min(192000, Math.round(finite(sample_rate, 48000))));
    const outputPath = path.join(root, "corrected.wav");
    const filters = [
      `atrim=start=${Math.max(0, finite(source_offset_seconds, 0)).toFixed(8)}:duration=${duration.toFixed(8)}`,
      "asetpts=PTS-STARTPTS",
    ];

    if (Math.abs(normalized.total_pitch_semitones) >= 0.0001) {
      const shiftedRate = Math.max(1000, Math.round(inputProbe.sample_rate * normalized.pitch_ratio));
      filters.push(`asetrate=${shiftedRate}`);
      filters.push(`aresample=${outputSampleRate}`);
      filters.push(...atempoFilters(1 / normalized.pitch_ratio));
    } else if (inputProbe.sample_rate !== outputSampleRate) {
      filters.push(`aresample=${outputSampleRate}`);
    }

    if (Math.abs(normalized.timing_ratio - 1) >= 0.0001) {
      filters.push(...atempoFilters(1 / normalized.timing_ratio));
    }

    await run(ffmpeg, [
      "-y", "-i", source.file_path,
      "-af", filters.join(","),
      "-ar", String(outputSampleRate),
      "-ac", String(inputProbe.channels),
      "-c:a", "pcm_s24le",
      outputPath,
    ]);
    const outputProbe = await probe(ffprobe, outputPath);
    const buffer = await fs.readFile(outputPath);
    const expectedDuration = duration * normalized.timing_ratio;
    if (Math.abs(outputProbe.duration_seconds - expectedDuration) > Math.max(0.08, expectedDuration * 0.01)) {
      throw new Error(`CREATIVE_MUSIC_CLIP_CORRECTION_DURATION_DRIFT:expected=${expectedDuration}:observed=${outputProbe.duration_seconds}`);
    }

    return {
      success: true,
      contract: CONTRACT,
      buffer,
      correction: normalized,
      source_checksum: source.checksum || null,
      source_file_size_bytes: source.file_size_bytes || null,
      source_probe: inputProbe,
      output_probe: outputProbe,
      expected_duration_seconds: expectedDuration,
      bit_depth: 24,
      destructive_processing: false,
      original_source_preserved: true,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export const CreativeMusicClipCorrectionRuntime = {
  contract: CONTRACT,
  normalize: normalizeMusicClipCorrection,
  render: renderMusicClipCorrection,
};

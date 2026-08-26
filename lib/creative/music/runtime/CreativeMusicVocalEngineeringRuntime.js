import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_ENGINEERING_LOCAL_V1";
const BUCKET = "creative-assets";
const MAX_SOURCE_BYTES = 1_073_741_824;
const ANALYSIS_WINDOW_SECONDS = 120;
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safe(value, fallback = "audio") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function run(command, args, { timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CREATIVE_MUSIC_VOCAL_PROCESS_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolve(result);
      else reject(new Error(result.stderr || `CREATIVE_MUSIC_VOCAL_PROCESS_EXIT_${code}`));
    });
  });
}

async function probe(ffprobe, filePath) {
  const result = await run(ffprobe, [
    "-v", "error",
    "-show_entries",
    "format=duration,format_name,bit_rate:stream=codec_name,codec_type,sample_rate,channels,channel_layout",
    "-of", "json",
    filePath,
  ], { timeoutMs: 120000 });
  const parsed = JSON.parse(result.stdout || "{}");
  const audio = list(parsed.streams).find((stream) => stream.codec_type === "audio");
  if (!audio) throw new Error("CREATIVE_MUSIC_VOCAL_AUDIO_STREAM_REQUIRED");
  const duration = finite(parsed.format?.duration, null);
  if (!duration || duration <= 0 || duration > 900) {
    throw new Error("CREATIVE_MUSIC_VOCAL_DURATION_INVALID");
  }
  return {
    duration_seconds: duration,
    format_name: parsed.format?.format_name || null,
    bit_rate: finite(parsed.format?.bit_rate, null),
    codec_name: audio.codec_name || null,
    sample_rate: finite(audio.sample_rate, null),
    channels: finite(audio.channels, 1),
    channel_layout: audio.channel_layout || null,
  };
}

async function availableFilters(ffmpeg) {
  const result = await run(ffmpeg, ["-hide_banner", "-filters"], { timeoutMs: 120000 });
  const source = `${result.stdout}\n${result.stderr}`;
  const names = new Set();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*[TSC.]{3}\s+([A-Za-z0-9_]+)\s+/);
    if (match) names.add(match[1]);
  }
  return names;
}

function volumeStats(stderr) {
  const source = String(stderr || "");
  const mean = source.match(/mean_volume:\s*(-?[0-9.]+)\s*dB/i);
  const peak = source.match(/max_volume:\s*(-?[0-9.]+)\s*dB/i);
  return {
    mean_db: finite(mean?.[1], null),
    peak_dbfs: finite(peak?.[1], null),
  };
}

async function analyseVolume(ffmpeg, filePath, audioFilter = null) {
  const args = [
    "-hide_banner", "-nostats", "-i", filePath,
    "-t", String(ANALYSIS_WINDOW_SECONDS),
    "-vn",
    "-af", [audioFilter, "volumedetect"].filter(Boolean).join(","),
    "-f", "null", "-",
  ];
  const result = await run(ffmpeg, args, { timeoutMs: 180000 });
  return volumeStats(result.stderr);
}

async function spectralSnapshot(ffmpeg, filePath, filters) {
  const bands = {
    rumble: filters.has("highpass") && filters.has("lowpass")
      ? "highpass=f=25,lowpass=f=90"
      : null,
    body: filters.has("highpass") && filters.has("lowpass")
      ? "highpass=f=160,lowpass=f=500"
      : null,
    presence: filters.has("highpass") && filters.has("lowpass")
      ? "highpass=f=2200,lowpass=f=5200"
      : null,
    sibilance: filters.has("highpass") && filters.has("lowpass")
      ? "highpass=f=5600,lowpass=f=9500"
      : null,
  };
  const entries = await Promise.all(Object.entries(bands).map(async ([name, chain]) => {
    if (!chain) return [name, null];
    try {
      return [name, await analyseVolume(ffmpeg, filePath, chain)];
    } catch {
      return [name, null];
    }
  }));
  return Object.fromEntries(entries);
}

function dbDifference(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return left - right;
}

function engineeringMode(sourceRole) {
  return sourceRole === "vocal" ? "SOLO_VOCAL" : "PROGRAM_RESTORATION";
}

function buildAdaptiveChain({ sourceRole, filters, volume, spectrum }) {
  const mode = engineeringMode(sourceRole);
  const chain = [];
  const decisions = [];

  if (filters.has("highpass")) {
    const frequency = mode === "SOLO_VOCAL" ? 70 : 32;
    chain.push(`highpass=f=${frequency}`);
    decisions.push({
      processor: "high_pass",
      applied: true,
      reason: mode === "SOLO_VOCAL" ? "REMOVE_SUB_VOCAL_RUMBLE" : "REMOVE_SUB_PROGRAM_RUMBLE",
      frequency_hz: frequency,
    });
  }

  const rumbleVsBody = dbDifference(spectrum.rumble?.mean_db, spectrum.body?.mean_db);
  const noisyProgram = Number.isFinite(volume.mean_db) && volume.mean_db < -33;
  if (filters.has("afftdn") && (mode === "SOLO_VOCAL" || noisyProgram || (rumbleVsBody !== null && rumbleVsBody > -7))) {
    chain.push(mode === "SOLO_VOCAL" ? "afftdn=nf=-42" : "afftdn=nf=-48");
    decisions.push({
      processor: "spectral_denoise",
      applied: true,
      reason: mode === "SOLO_VOCAL" ? "VOCAL_CAPTURE_CLEANUP" : "LOW_LEVEL_PROGRAM_NOISE_CLEANUP",
      conservative: true,
    });
  }

  const bodyVsPresence = dbDifference(spectrum.body?.mean_db, spectrum.presence?.mean_db);
  if (filters.has("equalizer") && bodyVsPresence !== null && bodyVsPresence > 4) {
    const gain = mode === "SOLO_VOCAL" ? -1.5 : -0.8;
    chain.push(`equalizer=f=300:t=q:w=1:g=${gain}`);
    decisions.push({
      processor: "adaptive_eq",
      applied: true,
      reason: "LOW_MID_BODY_DOMINATES_PRESENCE",
      frequency_hz: 300,
      gain_db: gain,
    });
  }

  const presenceVsBody = dbDifference(spectrum.presence?.mean_db, spectrum.body?.mean_db);
  if (filters.has("equalizer") && mode === "SOLO_VOCAL" && presenceVsBody !== null && presenceVsBody < -7) {
    chain.push("equalizer=f=3300:t=q:w=0.9:g=1.0");
    decisions.push({
      processor: "adaptive_eq",
      applied: true,
      reason: "VOCAL_PRESENCE_DEFICIT",
      frequency_hz: 3300,
      gain_db: 1,
    });
  }

  const sibilanceVsPresence = dbDifference(spectrum.sibilance?.mean_db, spectrum.presence?.mean_db);
  if (mode === "SOLO_VOCAL" && sibilanceVsPresence !== null && sibilanceVsPresence > -2.5) {
    if (filters.has("deesser")) {
      chain.push("deesser=i=0.22:m=0.45:f=0.5");
      decisions.push({
        processor: "de_esser",
        applied: true,
        reason: "SIBILANCE_BAND_ELEVATED",
        conservative: true,
      });
    } else if (filters.has("equalizer")) {
      chain.push("equalizer=f=7200:t=q:w=1.6:g=-1.0");
      decisions.push({
        processor: "sibilance_eq_fallback",
        applied: true,
        reason: "DEESSER_FILTER_UNAVAILABLE",
        frequency_hz: 7200,
        gain_db: -1,
      });
    }
  }

  if (filters.has("acompressor")) {
    const compressor = mode === "SOLO_VOCAL"
      ? "acompressor=threshold=0.1:ratio=2.2:attack=15:release=120:makeup=1.12"
      : "acompressor=threshold=0.125:ratio=1.5:attack=25:release=180:makeup=1.04";
    chain.push(compressor);
    decisions.push({
      processor: "compression",
      applied: true,
      reason: mode === "SOLO_VOCAL" ? "VOCAL_DYNAMIC_CONTROL" : "PROGRAM_DYNAMIC_STABILIZATION",
      conservative: true,
    });
  }

  if (filters.has("alimiter")) {
    chain.push("alimiter=limit=0.891:attack=5:release=60");
    decisions.push({
      processor: "safety_limiter",
      applied: true,
      reason: "PROTECT_RESTORED_INTERMEDIATE_FROM_CLIPPING",
      ceiling_dbfs: -1,
    });
  }

  return {
    mode,
    filters: chain,
    decisions,
    pitch_correction: {
      automatic_decision_required: mode === "SOLO_VOCAL",
      execution_status: mode === "SOLO_VOCAL" ? "CERTIFIED_PITCH_LANE_REQUIRED" : "NOT_APPLICABLE_TO_MIXED_PROGRAM",
      safe_lease_required: mode === "SOLO_VOCAL",
      safe_lease_contract: mode === "SOLO_VOCAL" ? SAFE_LEASE_CONTRACT : null,
    },
    timing_correction: {
      automatic_decision_required: mode === "SOLO_VOCAL",
      execution_status: mode === "SOLO_VOCAL" ? "CERTIFIED_TIMING_LANE_REQUIRED" : "NOT_APPLICABLE_TO_MIXED_PROGRAM",
      safe_lease_required: mode === "SOLO_VOCAL",
      safe_lease_contract: mode === "SOLO_VOCAL" ? SAFE_LEASE_CONTRACT : null,
    },
  };
}

async function uploadProcessed({ organizationId, projectId, identity, sourcePath }) {
  const buffer = await fs.readFile(sourcePath);
  const storagePath = [
    safe(organizationId),
    safe(projectId),
    "music-auto-studio",
    "vocal-engineering",
    identity,
    "restored-source.wav",
  ].join("/");
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "audio/wav",
    upsert: false,
  });
  if (error && error.statusCode !== "409" && error.status !== 409) throw error;
  return {
    storage_reference: creativeStorageUri(BUCKET, storagePath),
    checksum: hash(buffer),
    file_size_bytes: buffer.length,
    mime_type: "audio/wav",
  };
}

export async function processMusicVocalEngineeringLocal(input = {}) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.creative_project_id);
  const sourceReference = input.source_media || input.source_audio || input.audio || null;
  const sourceRole = text(input.source_role || "song").toLowerCase();
  if (!organizationId) throw new Error("organization_id required");
  if (!projectId) throw new Error("creative_project_id required");
  if (!sourceReference) throw new Error("CREATIVE_MUSIC_VOCAL_SOURCE_REQUIRED");

  const ffmpeg = text(input.ffmpeg_path || process.env.CREATIVE_FFMPEG_PATH || "ffmpeg");
  const ffprobe = text(input.ffprobe_path || process.env.CREATIVE_FFPROBE_PATH || "ffprobe");
  const materialized = await materializeMedia({
    url: sourceReference,
    file_name: input.file_name || "music-source",
    mime_type: input.mime_type || null,
    organization_id: organizationId,
    policy: {
      max_bytes: MAX_SOURCE_BYTES,
      probe_timeout_ms: 120000,
    },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-music-vocal-"));

  try {
    const sourceProbe = await probe(ffprobe, materialized.file_path);
    const filters = await availableFilters(ffmpeg);
    const beforeVolume = await analyseVolume(ffmpeg, materialized.file_path);
    const spectrum = await spectralSnapshot(ffmpeg, materialized.file_path, filters);
    const chain = buildAdaptiveChain({
      sourceRole,
      filters,
      volume: beforeVolume,
      spectrum,
    });
    const outputPath = path.join(root, "restored-source.wav");
    const channelCount = sourceProbe.channels === 1 ? 1 : 2;
    const ffmpegArgs = [
      "-y",
      "-i", materialized.file_path,
      "-vn",
      ...(chain.filters.length ? ["-af", chain.filters.join(",")] : []),
      "-ar", "48000",
      "-ac", String(channelCount),
      "-c:a", "pcm_s24le",
      outputPath,
    ];
    await run(ffmpeg, ffmpegArgs, { timeoutMs: 900000 });
    const restoredProbe = await probe(ffprobe, outputPath);
    const afterVolume = await analyseVolume(ffmpeg, outputPath);
    if (Number.isFinite(afterVolume.peak_dbfs) && afterVolume.peak_dbfs > -0.3) {
      throw new Error(`CREATIVE_MUSIC_VOCAL_RESTORED_PEAK_UNSAFE:${afterVolume.peak_dbfs}`);
    }

    const identity = hash(Buffer.from(JSON.stringify({
      source_checksum: materialized.checksum,
      source_role: sourceRole,
      chain: chain.filters,
      source_probe: sourceProbe,
      version: CONTRACT,
    })));
    const stored = await uploadProcessed({
      organizationId,
      projectId,
      identity,
      sourcePath: outputPath,
    });

    return {
      success: true,
      contract: CONTRACT,
      source: {
        reference: sourceReference,
        checksum: materialized.checksum || null,
        probe: sourceProbe,
        preserved: true,
      },
      restored: {
        ...stored,
        probe: restoredProbe,
      },
      analysis: {
        window_seconds: Math.min(ANALYSIS_WINDOW_SECONDS, sourceProbe.duration_seconds),
        source_volume: beforeVolume,
        restored_volume: afterVolume,
        spectral_snapshot: spectrum,
      },
      engineering: chain,
      readiness: {
        local_mic_restoration_complete: true,
        adaptive_eq_complete: chain.decisions.some((entry) => entry.processor === "adaptive_eq") || filters.has("equalizer"),
        de_essing_evaluated: chain.mode !== "SOLO_VOCAL" || Boolean(spectrum.sibilance),
        dynamics_control_complete: chain.decisions.some((entry) => entry.processor === "compression"),
        pitch_correction_complete: chain.pitch_correction.execution_status !== "CERTIFIED_PITCH_LANE_REQUIRED",
        timing_correction_complete: chain.timing_correction.execution_status !== "CERTIFIED_TIMING_LANE_REQUIRED",
      },
      execution: {
        runtime: "LOCAL_FFMPEG",
        provider_job_submitted: false,
        runpod_used: false,
        endpoint_mutation_performed: false,
        direct_workers_max_write: false,
      },
    };
  } finally {
    await materialized.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export const CreativeMusicVocalEngineeringRuntime = Object.freeze({
  contract: CONTRACT,
  processLocal: processMusicVocalEngineeringLocal,
});

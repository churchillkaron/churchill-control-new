import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const CONTRACT = "AVANTIQO_MUSIC_MASTER_TECHNICAL_VALIDATION_V1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CREATIVE_MUSIC_MASTER_VALIDATION_PROCESS_TIMEOUT"));
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
      else reject(new Error(output.stderr || `CREATIVE_MUSIC_MASTER_VALIDATION_PROCESS_EXIT_${code}`));
    });
  });
}

async function probeAudio(ffprobe, filePath) {
  const result = await run(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration,format_name,bit_rate:stream=codec_name,codec_type,sample_rate,channels,channel_layout,bits_per_raw_sample,sample_fmt",
    "-of", "json",
    filePath,
  ], 120000);
  const parsed = JSON.parse(result.stdout || "{}");
  const stream = (parsed.streams || []).find((entry) => entry.codec_type === "audio");
  if (!stream) throw new Error("CREATIVE_MUSIC_MASTER_VALIDATION_AUDIO_STREAM_REQUIRED");
  const duration = finite(parsed.format?.duration, null);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("CREATIVE_MUSIC_MASTER_VALIDATION_DURATION_INVALID");
  return {
    duration_seconds: duration,
    format_name: text(parsed.format?.format_name) || null,
    bit_rate: finite(parsed.format?.bit_rate, null),
    codec_name: text(stream.codec_name) || null,
    sample_rate: finite(stream.sample_rate, null),
    channels: finite(stream.channels, null),
    channel_layout: text(stream.channel_layout) || null,
    bits_per_raw_sample: finite(stream.bits_per_raw_sample, null),
    sample_format: text(stream.sample_fmt) || null,
  };
}

function loudnessJson(stderr) {
  const match = String(stderr || "").match(/\{\s*"input_i"[\s\S]*?\}/m);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function analyseLoudness(ffmpeg, filePath) {
  const result = await run(ffmpeg, [
    "-hide_banner", "-nostats", "-i", filePath,
    "-af", "loudnorm=I=-24:LRA=20:TP=-1:print_format=json",
    "-f", "null", "-",
  ], 180000);
  const data = loudnessJson(result.stderr);
  if (!data) throw new Error("CREATIVE_MUSIC_MASTER_VALIDATION_LOUDNESS_ANALYSIS_REQUIRED");
  return {
    integrated_lufs: finite(data.input_i, null),
    true_peak_dbtp: finite(data.input_tp, null),
    loudness_range_lu: finite(data.input_lra, null),
    threshold_lufs: finite(data.input_thresh, null),
  };
}

function expectedContract(masterReport = {}, fallback = {}) {
  const master = masterReport?.master || {};
  return {
    master_id: text(masterReport?.master_id || fallback.master_id) || null,
    checksum: text(fallback.checksum) || null,
    target_lufs: finite(master.target_lufs ?? fallback.target_lufs, null),
    true_peak_dbtp: finite(master.true_peak_dbtp ?? fallback.true_peak_dbtp, null),
    loudness_range_lu: finite(master.loudness_range_lu ?? fallback.loudness_range_lu, null),
    tolerance_lu: finite(master.tolerance_lu ?? fallback.tolerance_lu, 0.5),
    true_peak_tolerance_db: finite(master.true_peak_tolerance_db ?? fallback.true_peak_tolerance_db, 0.1),
    sample_rate: finite(master.sample_rate ?? fallback.sample_rate, null),
    channels: finite(master.channels ?? fallback.channels, null),
    duration_seconds: finite(master.duration_seconds ?? fallback.duration_seconds, null),
    codec_name: text(master.codec_name || fallback.codec_name) || null,
  };
}

export async function validateMusicMasterArtifact({
  organization_id,
  file_url,
  file_name = null,
  mime_type = "audio/wav",
  expected_checksum = null,
  master_report = {},
  expected = {},
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("CREATIVE_MUSIC_MASTER_VALIDATION_ORGANIZATION_REQUIRED");
  if (!file_url) throw new Error("CREATIVE_MUSIC_MASTER_VALIDATION_FILE_REQUIRED");
  const ffmpeg = text(media_tools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH) || "ffmpeg";
  const ffprobe = text(media_tools.ffprobe || process.env.CREATIVE_FFPROBE_PATH) || "ffprobe";
  const material = await materializeMedia({
    url: file_url,
    file_name: file_name || "music-master.wav",
    mime_type,
    organization_id,
    policy: {
      max_bytes: 2_147_483_648,
      timeout_ms: 300000,
      max_redirects: 0,
    },
  });
  try {
    const probe = await probeAudio(ffprobe, material.file_path);
    const loudness = await analyseLoudness(ffmpeg, material.file_path);
    const contract = expectedContract(master_report, {
      ...expected,
      checksum: expected_checksum,
    });
    const failures = [];
    const warnings = [];

    if (contract.checksum && material.checksum !== contract.checksum) failures.push("MUSIC_MASTER_CHECKSUM_MISMATCH");
    if (!contract.checksum) warnings.push("MUSIC_MASTER_EXPECTED_CHECKSUM_UNAVAILABLE");

    if (Number.isFinite(contract.sample_rate) && Math.round(probe.sample_rate) !== Math.round(contract.sample_rate)) {
      failures.push("MUSIC_MASTER_SAMPLE_RATE_MISMATCH");
    }
    if (Number.isFinite(contract.channels) && Math.round(probe.channels) !== Math.round(contract.channels)) {
      failures.push("MUSIC_MASTER_CHANNEL_COUNT_MISMATCH");
    }
    if (contract.codec_name && probe.codec_name && probe.codec_name !== contract.codec_name) {
      failures.push("MUSIC_MASTER_CODEC_MISMATCH");
    }
    if (Number.isFinite(contract.duration_seconds) && Math.abs(probe.duration_seconds - contract.duration_seconds) > 0.25) {
      failures.push("MUSIC_MASTER_DURATION_MISMATCH");
    }
    if (Number.isFinite(contract.target_lufs)) {
      if (!Number.isFinite(loudness.integrated_lufs) || Math.abs(loudness.integrated_lufs - contract.target_lufs) > contract.tolerance_lu) {
        failures.push("MUSIC_MASTER_LOUDNESS_TARGET_MISSED");
      }
    } else {
      warnings.push("MUSIC_MASTER_LOUDNESS_TARGET_UNAVAILABLE");
    }
    if (Number.isFinite(contract.true_peak_dbtp)) {
      if (!Number.isFinite(loudness.true_peak_dbtp) || loudness.true_peak_dbtp > contract.true_peak_dbtp + contract.true_peak_tolerance_db) {
        failures.push("MUSIC_MASTER_TRUE_PEAK_EXCEEDED");
      }
    } else {
      warnings.push("MUSIC_MASTER_TRUE_PEAK_TARGET_UNAVAILABLE");
    }

    const passed = failures.length === 0;
    return {
      success: passed,
      passed,
      contract: CONTRACT,
      verdict: passed ? "PASS" : "FAIL",
      validated_at: new Date().toISOString(),
      failures: [...new Set(failures)],
      warnings: [...new Set(warnings)],
      checksum: {
        expected: contract.checksum,
        observed: material.checksum,
        verified: Boolean(contract.checksum) && material.checksum === contract.checksum,
      },
      expected: contract,
      observed: {
        ...probe,
        ...loudness,
        file_size_bytes: material.file_size_bytes || null,
        mime_type: material.mime_type || mime_type || null,
      },
      technical_only: true,
      semantic_review_performed: false,
      remastering_performed: false,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    };
  } finally {
    await material.cleanup().catch(() => {});
  }
}

export const CreativeMusicMasterValidationRuntime = {
  contract: CONTRACT,
  validate: validateMusicMasterArtifact,
};

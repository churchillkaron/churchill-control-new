import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const ANALYSIS_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_TRANSIENT_ANALYSIS_V1";
const WARP_PLAN_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_WARP_PLAN_V1";
const ANALYSIS_RATE = 22050;
const MAX_SECONDS = 900;
const DIVISIONS = Object.freeze(["1/4", "1/8", "1/16", "1/32"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max, fallback = min) { return Math.max(min, Math.min(max, finite(value, fallback))); }
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }

function run(command, args, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("CREATIVE_MUSIC_ELASTIC_ANALYSIS_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8") || `CREATIVE_MUSIC_ELASTIC_ANALYSIS_EXIT_${code}`));
    });
  });
}

function pcmFloat32(buffer) {
  const frames = Math.floor(buffer.byteLength / 4);
  const output = new Float32Array(frames);
  const view = new DataView(buffer.buffer, buffer.byteOffset, frames * 4);
  for (let index = 0; index < frames; index += 1) output[index] = view.getFloat32(index * 4, true);
  return output;
}

function onsetEnvelope(samples, sampleRate) {
  const hop = Math.max(64, Math.round(sampleRate * 0.005));
  const frame = hop * 4;
  const values = [];
  let previousRms = 0;
  for (let start = 0; start < samples.length; start += hop) {
    const end = Math.min(samples.length, start + frame);
    let energy = 0;
    let highFrequencyContent = 0;
    let previous = samples[start] || 0;
    for (let index = start; index < end; index += 1) {
      const current = samples[index];
      energy += current * current;
      highFrequencyContent += Math.abs(current - previous);
      previous = current;
    }
    const rms = Math.sqrt(energy / Math.max(1, end - start));
    const spectralRiseProxy = highFrequencyContent / Math.max(1, end - start);
    const energyRise = Math.max(0, rms - previousRms);
    values.push({
      sample: start,
      seconds: start / sampleRate,
      score: energyRise * 0.72 + spectralRiseProxy * 0.28,
      rms,
    });
    previousRms = rms;
  }
  return { values, hop };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function detectTransients(samples, sampleRate, sensitivity = 0.62) {
  const envelope = onsetEnvelope(samples, sampleRate);
  const scores = envelope.values.map((entry) => entry.score).filter((value) => value > 1e-8);
  const center = median(scores);
  const deviations = scores.map((value) => Math.abs(value - center));
  const mad = median(deviations) || center || 1e-6;
  const sensitivityValue = clamp(sensitivity, 0.1, 1, 0.62);
  const threshold = center + mad * (4.2 - sensitivityValue * 3.0);
  const refractorySeconds = 0.035;
  const candidates = envelope.values.filter((entry) => entry.score >= threshold);
  const transients = [];
  for (const candidate of candidates) {
    const previous = transients[transients.length - 1];
    if (previous && candidate.seconds - previous.source_seconds < refractorySeconds) {
      if (candidate.score > previous.score) {
        transients[transients.length - 1] = { ...previous, source_seconds: candidate.seconds, source_sample: candidate.sample, score: candidate.score, rms: candidate.rms };
      }
      continue;
    }
    transients.push({
      id: `transient-${transients.length + 1}`,
      transient_index: transients.length,
      source_seconds: Math.round(candidate.seconds * 1e6) / 1e6,
      source_sample: candidate.sample,
      score: Math.round(candidate.score * 1e7) / 1e7,
      rms: Math.round(candidate.rms * 1e7) / 1e7,
    });
  }
  return { transients: transients.slice(0, 4096), threshold, sensitivity: sensitivityValue };
}

function gridSeconds(bpm, division) {
  if (!DIVISIONS.includes(division)) throw new Error("CREATIVE_MUSIC_ELASTIC_GRID_DIVISION_INVALID");
  const denominator = Number(division.split("/")[1]);
  return (60 / clamp(bpm, 30, 300, 120)) * (4 / denominator);
}

function nearestGrid(seconds, bpm, division, offsetSeconds = 0) {
  const step = gridSeconds(bpm, division);
  const index = Math.round((seconds - offsetSeconds) / step);
  return offsetSeconds + index * step;
}

export function buildMusicElasticWarpPlan({
  analysis,
  bpm,
  division = "1/16",
  strength = 0.55,
  max_shift_ms = 90,
  grid_offset_seconds = 0,
} = {}) {
  if (analysis?.contract !== ANALYSIS_CONTRACT) throw new Error("CREATIVE_MUSIC_ELASTIC_ANALYSIS_CONTRACT_INVALID");
  const bpmValue = clamp(bpm, 30, 300, 120);
  const strengthValue = clamp(strength, 0, 1, 0.55);
  const maxShiftMs = clamp(max_shift_ms, 5, 250, 90);
  const offset = Math.max(0, finite(grid_offset_seconds, 0));
  const sourceDuration = Math.max(0.001, finite(analysis.duration_seconds, 0));
  const source = analysis.transients || [];
  const markers = source.map((entry, index) => {
    const rawTarget = nearestGrid(entry.source_seconds, bpmValue, division, offset);
    const rawShiftMs = (rawTarget - entry.source_seconds) * 1000;
    const boundedShiftMs = clamp(rawShiftMs * strengthValue, -maxShiftMs, maxShiftMs, 0);
    const targetSeconds = entry.source_seconds + boundedShiftMs / 1000;
    const previousSource = index > 0 ? source[index - 1].source_seconds : 0;
    const nextSource = index + 1 < source.length ? source[index + 1].source_seconds : sourceDuration;
    const localGuard = Math.min(0.012, Math.max(0.002, (nextSource - previousSource) * 0.04));
    const collisionSafe = targetSeconds > previousSource + localGuard && targetSeconds < nextSource - localGuard;
    const eligible = collisionSafe && Math.abs(boundedShiftMs) >= 2;
    return {
      id: `warp-${index + 1}`,
      transient_id: entry.id,
      source_seconds: entry.source_seconds,
      nearest_grid_seconds: Math.round(rawTarget * 1e6) / 1e6,
      raw_shift_ms: Math.round(rawShiftMs * 10) / 10,
      proposed_shift_ms: eligible ? Math.round(boundedShiftMs * 10) / 10 : 0,
      target_seconds: eligible ? Math.round(targetSeconds * 1e6) / 1e6 : entry.source_seconds,
      eligible,
      approved: false,
      musician_override: false,
      safety_reason: collisionSafe ? (eligible ? "SAFE_LOCAL_TRANSIENT_WINDOW" : "ALREADY_CLOSE_TO_GRID") : "NEIGHBOR_TRANSIENT_COLLISION_RISK",
    };
  });
  return {
    contract: WARP_PLAN_CONTRACT,
    source_asset_id: analysis.source_asset_id,
    source_checksum: analysis.source_checksum,
    source_offset_seconds: analysis.source_offset_seconds,
    duration_seconds: sourceDuration,
    bpm: bpmValue,
    division,
    strength: strengthValue,
    max_shift_ms: maxShiftMs,
    grid_offset_seconds: offset,
    markers,
    all_reviewed: markers.every((marker) => marker.eligible !== true || marker.approved === true),
    render_ready: false,
    pitch_preserving_render_required: true,
    transient_preservation_required: true,
    automatic_apply_forbidden: true,
    destructive_edit: false,
    provider_job_submitted: false,
    render_engine: null,
  };
}

export function reviewMusicElasticWarpMarker(plan = {}, markerId, patch = {}) {
  if (plan.contract !== WARP_PLAN_CONTRACT) throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_PLAN_CONTRACT_INVALID");
  const next = structuredClone(plan);
  const marker = next.markers.find((entry) => entry.id === text(markerId));
  if (!marker) throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_MARKER_NOT_FOUND");
  if (patch.target_seconds !== undefined) {
    const target = clamp(patch.target_seconds, 0, next.duration_seconds, marker.target_seconds);
    marker.target_seconds = Math.round(target * 1e6) / 1e6;
    marker.proposed_shift_ms = Math.round((target - marker.source_seconds) * 10000) / 10;
    marker.musician_override = true;
    marker.eligible = Math.abs(marker.proposed_shift_ms) <= next.max_shift_ms;
  }
  marker.approved = patch.approved === true && marker.eligible === true;
  next.all_reviewed = next.markers.every((entry) => entry.eligible !== true || entry.approved === true);
  next.render_ready = next.all_reviewed && next.markers.some((entry) => entry.approved === true && Math.abs(entry.proposed_shift_ms) >= 2);
  return next;
}

export async function analyzeMusicElasticAudio({
  organization_id,
  source_url,
  source_file_name,
  source_mime_type,
  source_asset_id,
  source_offset_seconds = 0,
  duration_seconds,
  sensitivity = 0.62,
} = {}) {
  const duration = clamp(duration_seconds, 0.05, MAX_SECONDS, 30);
  const offset = Math.max(0, finite(source_offset_seconds, 0));
  const media = await materializeMedia({ organization_id, source_url, source_file_name, source_mime_type });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-elastic-"));
  const pcmPath = path.join(directory, "source.f32le");
  try {
    await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-ss", String(offset), "-t", String(duration), "-i", media.path, "-vn", "-ac", "1", "-ar", String(ANALYSIS_RATE), "-f", "f32le", pcmPath]);
    const bytes = await fs.readFile(pcmPath);
    const samples = pcmFloat32(bytes);
    if (!samples.length) throw new Error("CREATIVE_MUSIC_ELASTIC_ANALYSIS_EMPTY_PCM");
    const detected = detectTransients(samples, ANALYSIS_RATE, sensitivity);
    return {
      contract: ANALYSIS_CONTRACT,
      source_asset_id: text(source_asset_id),
      source_checksum: sha256(bytes),
      source_offset_seconds: offset,
      duration_seconds: samples.length / ANALYSIS_RATE,
      analysis_sample_rate: ANALYSIS_RATE,
      transient_count: detected.transients.length,
      sensitivity: detected.sensitivity,
      threshold: detected.threshold,
      transients: detected.transients,
      pitch_analysis_performed: false,
      destructive_edit: false,
      provider_job_submitted: false,
      render_performed: false,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    await media.cleanup?.().catch?.(() => {});
  }
}

export const CreativeMusicElasticAudioRuntime = {
  analysisContract: ANALYSIS_CONTRACT,
  warpPlanContract: WARP_PLAN_CONTRACT,
  divisions: DIVISIONS,
  analyze: analyzeMusicElasticAudio,
  buildPlan: buildMusicElasticWarpPlan,
  reviewMarker: reviewMusicElasticWarpMarker,
};

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const CONTRACT = "AVANTIQO_MUSIC_MUSICAL_ANALYSIS_V1";
const ANALYSIS_RATE = 11025;
const MAX_ANALYSIS_SECONDS = 240;
const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function run(command, args, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_PROCESS_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString("utf8") });
      else reject(new Error(Buffer.concat(stderr).toString("utf8") || `CREATIVE_MUSIC_MUSICAL_ANALYSIS_PROCESS_EXIT_${code}`));
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

function normalizeVector(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  let energy = 0;
  const centered = values.map((value) => {
    const next = value - mean;
    energy += next * next;
    return next;
  });
  const scale = Math.sqrt(energy) || 1;
  return centered.map((value) => value / scale);
}

function correlation(left, right) {
  const a = normalizeVector(left);
  const b = normalizeVector(right);
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function buildOnsetEnvelope(samples, sampleRate) {
  const hop = Math.max(1, Math.round(sampleRate / 200));
  const envelope = [];
  let previousEnergy = 0;
  for (let start = 0; start < samples.length; start += hop) {
    const end = Math.min(samples.length, start + hop);
    let energy = 0;
    let diff = 0;
    let previous = samples[start] || 0;
    for (let index = start; index < end; index += 1) {
      const sample = samples[index];
      energy += sample * sample;
      diff += Math.abs(sample - previous);
      previous = sample;
    }
    energy = Math.sqrt(energy / Math.max(1, end - start));
    const rise = Math.max(0, energy - previousEnergy);
    envelope.push(rise * 0.7 + diff / Math.max(1, end - start) * 0.3);
    previousEnergy = energy;
  }
  const mean = envelope.reduce((sum, value) => sum + value, 0) / Math.max(1, envelope.length);
  return { envelope: envelope.map((value) => Math.max(0, value - mean * 0.55)), rate: sampleRate / hop };
}

function tempoEstimate(samples, sampleRate) {
  const onset = buildOnsetEnvelope(samples, sampleRate);
  const envelope = onset.envelope;
  const envelopeRate = onset.rate;
  const minBpm = 55;
  const maxBpm = 210;
  const minLag = Math.floor(envelopeRate * 60 / maxBpm);
  const maxLag = Math.ceil(envelopeRate * 60 / minBpm);
  const candidates = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = lag; index < envelope.length; index += 1) {
      const left = envelope[index];
      const right = envelope[index - lag];
      sum += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const score = sum / Math.max(1e-12, Math.sqrt(leftEnergy * rightEnergy));
    candidates.push({ bpm: envelopeRate * 60 / lag, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0] || { bpm: 0, score: 0 };
  const harmonics = candidates.filter((candidate) => {
    const ratio = candidate.bpm / Math.max(1, best.bpm);
    return Math.abs(ratio - 2) < 0.04 || Math.abs(ratio - 0.5) < 0.04;
  });
  for (const harmonic of harmonics) {
    if (harmonic.score >= best.score * 0.92 && harmonic.bpm >= 80 && harmonic.bpm <= 180) best = harmonic;
  }
  const second = candidates.find((candidate) => Math.abs(candidate.bpm - best.bpm) > 4 && Math.abs(candidate.bpm - best.bpm * 2) > 5 && Math.abs(candidate.bpm * 2 - best.bpm) > 5) || { score: 0 };
  const separation = Math.max(0, best.score - second.score);
  const confidence = clamp(best.score * 0.65 + separation * 1.35, 0, 1);
  return {
    bpm: Math.round(best.bpm * 10) / 10,
    confidence: Math.round(confidence * 1000) / 1000,
    autocorrelation_score: Math.round(best.score * 1000) / 1000,
    candidate_bpms: candidates.slice(0, 5).map((candidate) => ({ bpm: Math.round(candidate.bpm * 10) / 10, score: Math.round(candidate.score * 1000) / 1000 })),
  };
}

function goertzelEnergy(samples, start, length, sampleRate, frequency) {
  const omega = 2 * Math.PI * frequency / sampleRate;
  const coefficient = 2 * Math.cos(omega);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let index = 0; index < length; index += 1) {
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / Math.max(1, length - 1));
    s0 = samples[start + index] * window + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coefficient * s1 * s2);
}

function chromaVector(samples, sampleRate) {
  const windowSize = 4096;
  const hop = Math.max(windowSize, Math.round(sampleRate));
  const chroma = Array(12).fill(0);
  let windows = 0;
  const midiNotes = [];
  for (let midi = 40; midi <= 79; midi += 1) midiNotes.push({ frequency: 440 * 2 ** ((midi - 69) / 12), pitchClass: midi % 12 });
  for (let start = 0; start + windowSize <= samples.length; start += hop) {
    let rms = 0;
    for (let index = 0; index < windowSize; index += 1) rms += samples[start + index] ** 2;
    rms = Math.sqrt(rms / windowSize);
    if (rms < 0.002) continue;
    for (const note of midiNotes) chroma[note.pitchClass] += Math.sqrt(goertzelEnergy(samples, start, windowSize, sampleRate, note.frequency));
    windows += 1;
  }
  const sum = chroma.reduce((total, value) => total + value, 0) || 1;
  return { chroma: chroma.map((value) => value / sum), analysed_windows: windows };
}

function rotateProfile(profile, tonic) {
  return profile.map((_, index) => profile[(index - tonic + 12) % 12]);
}

function keyEstimate(samples, sampleRate) {
  const { chroma, analysed_windows } = chromaVector(samples, sampleRate);
  const candidates = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    candidates.push({ key: KEY_NAMES[tonic], mode: "major", score: correlation(chroma, rotateProfile(MAJOR_PROFILE, tonic)) });
    candidates.push({ key: KEY_NAMES[tonic], mode: "minor", score: correlation(chroma, rotateProfile(MINOR_PROFILE, tonic)) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || { key: null, mode: null, score: 0 };
  const second = candidates[1] || { score: 0 };
  const normalizedBest = clamp((best.score + 1) / 2, 0, 1);
  const separation = Math.max(0, best.score - second.score);
  const confidence = analysed_windows < 4 ? 0 : clamp(normalizedBest * 0.55 + separation * 1.75, 0, 1);
  return {
    key: best.key,
    mode: best.mode,
    label: best.key ? `${best.key} ${best.mode}` : null,
    confidence: Math.round(confidence * 1000) / 1000,
    analysed_windows,
    chroma: chroma.map((value) => Math.round(value * 10000) / 10000),
    candidates: candidates.slice(0, 5).map((candidate) => ({ key: candidate.key, mode: candidate.mode, score: Math.round(candidate.score * 1000) / 1000 })),
  };
}

export async function analyzeMusicMusicalContent({
  organization_id,
  source_url,
  source_file_name = "music-source.wav",
  source_mime_type = null,
  source_offset_seconds = 0,
  duration_seconds = null,
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_ORGANIZATION_REQUIRED");
  if (!source_url) throw new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_SOURCE_REQUIRED");
  const ffmpeg = text(media_tools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH) || "ffmpeg";
  const source = await materializeMedia({
    url: source_url,
    file_name: source_file_name,
    mime_type: source_mime_type,
    organization_id,
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300000, max_redirects: 0 },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-music-analysis-"));
  try {
    const pcmPath = path.join(root, "analysis.f32le");
    const trimArgs = [];
    if (finite(source_offset_seconds, 0) > 0) trimArgs.push("-ss", String(Math.max(0, finite(source_offset_seconds, 0))));
    const requestedDuration = Number.isFinite(Number(duration_seconds)) && Number(duration_seconds) > 0 ? Number(duration_seconds) : MAX_ANALYSIS_SECONDS;
    const analysisDuration = Math.min(MAX_ANALYSIS_SECONDS, requestedDuration);
    trimArgs.push("-t", String(analysisDuration));
    await run(ffmpeg, [
      "-y", ...trimArgs, "-i", source.file_path,
      "-vn", "-ac", "1", "-ar", String(ANALYSIS_RATE),
      "-f", "f32le", "-acodec", "pcm_f32le", pcmPath,
    ], 300000);
    const samples = pcmFloat32(await fs.readFile(pcmPath));
    const duration = samples.length / ANALYSIS_RATE;
    if (duration < 3) throw new Error("CREATIVE_MUSIC_MUSICAL_ANALYSIS_AUDIO_TOO_SHORT");
    const tempo = tempoEstimate(samples, ANALYSIS_RATE);
    const key = keyEstimate(samples, ANALYSIS_RATE);
    const tempoAccepted = tempo.confidence >= 0.42;
    const keyAccepted = key.confidence >= 0.42;
    return {
      success: true,
      contract: CONTRACT,
      duration_seconds: duration,
      requested_source_duration_seconds: Number.isFinite(Number(duration_seconds)) ? Number(duration_seconds) : null,
      analysis_window_capped: Number.isFinite(Number(duration_seconds)) && Number(duration_seconds) > MAX_ANALYSIS_SECONDS,
      max_analysis_seconds: MAX_ANALYSIS_SECONDS,
      analysis_sample_rate: ANALYSIS_RATE,
      source_checksum: source.checksum || null,
      tempo: { ...tempo, accepted: tempoAccepted },
      key: { ...key, accepted: keyAccepted },
      accepted: {
        bpm: tempoAccepted ? tempo.bpm : null,
        key: keyAccepted ? key.key : null,
        mode: keyAccepted ? key.mode : null,
        key_label: keyAccepted ? key.label : null,
      },
      confidence_threshold: 0.42,
      chord_analysis_ready: false,
      section_analysis_ready: false,
      metadata_guessing_forbidden: true,
      source_audio_measured: true,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export const CreativeMusicMusicalAnalysisRuntime = {
  contract: CONTRACT,
  analyze: analyzeMusicMusicalContent,
};

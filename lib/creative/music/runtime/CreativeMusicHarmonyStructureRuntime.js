import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const CONTRACT = "AVANTIQO_MUSIC_HARMONY_STRUCTURE_ANALYSIS_V1";
const SAMPLE_RATE = 11025;
const MAX_SECONDS = 240;
const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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
      reject(new Error("CREATIVE_MUSIC_HARMONY_STRUCTURE_PROCESS_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(Buffer.concat(stderr).toString("utf8") || `CREATIVE_MUSIC_HARMONY_STRUCTURE_PROCESS_EXIT_${code}`));
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

function normalized(values) {
  const sum = values.reduce((total, value) => total + Math.max(0, value), 0) || 1;
  return values.map((value) => Math.max(0, value) / sum);
}

function chromaFrames(samples, sampleRate) {
  const windowSize = 4096;
  const hop = Math.round(sampleRate * 2);
  const notes = [];
  for (let midi = 40; midi <= 79; midi += 1) notes.push({ pitchClass: midi % 12, frequency: 440 * 2 ** ((midi - 69) / 12) });
  const frames = [];
  for (let start = 0; start + windowSize <= samples.length; start += hop) {
    let sumSquares = 0;
    for (let index = 0; index < windowSize; index += 1) sumSquares += samples[start + index] ** 2;
    const rms = Math.sqrt(sumSquares / windowSize);
    const chroma = Array(12).fill(0);
    if (rms >= 0.002) {
      for (const note of notes) chroma[note.pitchClass] += Math.sqrt(goertzelEnergy(samples, start, windowSize, sampleRate, note.frequency));
    }
    frames.push({
      time_seconds: start / sampleRate,
      duration_seconds: hop / sampleRate,
      rms,
      chroma: normalized(chroma),
      silent: rms < 0.002,
    });
  }
  return frames;
}

function chordProfile(root, minor) {
  const values = Array(12).fill(0.05);
  values[root] = 1;
  values[(root + (minor ? 3 : 4)) % 12] = 0.82;
  values[(root + 7) % 12] = 0.72;
  return normalized(values);
}

function cosine(left, right) {
  let dot = 0;
  let a = 0;
  let b = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    a += left[index] ** 2;
    b += right[index] ** 2;
  }
  return dot / Math.max(1e-12, Math.sqrt(a * b));
}

function classifyChord(frame) {
  if (frame.silent) return { label: null, confidence: 0, accepted: false };
  const candidates = [];
  for (let root = 0; root < 12; root += 1) {
    candidates.push({ label: `${KEY_NAMES[root]}`, score: cosine(frame.chroma, chordProfile(root, false)) });
    candidates.push({ label: `${KEY_NAMES[root]}m`, score: cosine(frame.chroma, chordProfile(root, true)) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1] || { score: 0 };
  const separation = Math.max(0, best.score - second.score);
  const confidence = clamp((best.score - 0.45) * 1.15 + separation * 2.2, 0, 1);
  return {
    label: best.label,
    confidence: Math.round(confidence * 1000) / 1000,
    accepted: confidence >= 0.24,
    score: Math.round(best.score * 1000) / 1000,
  };
}

function chordSegments(frames) {
  const classified = frames.map((frame) => ({ ...frame, chord: classifyChord(frame) }));
  const segments = [];
  for (const frame of classified) {
    const label = frame.chord.accepted ? frame.chord.label : null;
    const previous = segments.at(-1);
    if (previous && previous.label === label) {
      previous.end_seconds = frame.time_seconds + frame.duration_seconds;
      previous.confidence_sum += frame.chord.confidence;
      previous.frames += 1;
      previous.confidence = Math.round((previous.confidence_sum / previous.frames) * 1000) / 1000;
      continue;
    }
    segments.push({
      label,
      start_seconds: frame.time_seconds,
      end_seconds: frame.time_seconds + frame.duration_seconds,
      confidence: frame.chord.confidence,
      confidence_sum: frame.chord.confidence,
      frames: 1,
    });
  }
  return segments.map(({ confidence_sum, frames, ...segment }) => ({ ...segment, accepted: Boolean(segment.label) }));
}

function noveltySeries(frames) {
  const novelty = [];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    const harmonicDistance = 1 - cosine(previous.chroma, current.chroma);
    const energyDistance = Math.min(1, Math.abs(Math.log10(Math.max(1e-5, current.rms)) - Math.log10(Math.max(1e-5, previous.rms))));
    novelty.push({
      time_seconds: current.time_seconds,
      score: harmonicDistance * 0.78 + energyDistance * 0.22,
    });
  }
  return novelty.map((item, index) => {
    const left = novelty[Math.max(0, index - 1)]?.score ?? item.score;
    const right = novelty[Math.min(novelty.length - 1, index + 1)]?.score ?? item.score;
    return { ...item, score: (left + item.score + right) / 3 };
  });
}

function structureBoundaries(frames, duration) {
  const novelty = noveltySeries(frames);
  if (!novelty.length) return { boundaries: [], sections: [{ id: "section-1", start_seconds: 0, end_seconds: duration, semantic_label: null }] };
  const mean = novelty.reduce((sum, item) => sum + item.score, 0) / novelty.length;
  const variance = novelty.reduce((sum, item) => sum + (item.score - mean) ** 2, 0) / novelty.length;
  const threshold = mean + Math.sqrt(variance) * 0.8;
  const candidates = novelty.filter((item) => item.score >= threshold).sort((a, b) => b.score - a.score);
  const accepted = [];
  for (const candidate of candidates) {
    if (candidate.time_seconds < 6 || duration - candidate.time_seconds < 6) continue;
    if (accepted.some((item) => Math.abs(item.time_seconds - candidate.time_seconds) < 8)) continue;
    accepted.push(candidate);
    if (accepted.length >= 12) break;
  }
  accepted.sort((a, b) => a.time_seconds - b.time_seconds);
  const points = [0, ...accepted.map((item) => item.time_seconds), duration];
  const sections = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    sections.push({
      id: `section-${index + 1}`,
      start_seconds: points[index],
      end_seconds: points[index + 1],
      semantic_label: null,
      boundary_evidence_only: true,
    });
  }
  return {
    threshold: Math.round(threshold * 1000) / 1000,
    boundaries: accepted.map((item) => ({ time_seconds: item.time_seconds, confidence: Math.round(clamp((item.score - threshold + 0.15) * 2, 0, 1) * 1000) / 1000, novelty_score: Math.round(item.score * 1000) / 1000 })),
    sections,
  };
}

export async function analyzeMusicHarmonyStructure({
  organization_id,
  source_url,
  source_file_name = "music-source.wav",
  source_mime_type = null,
  source_offset_seconds = 0,
  duration_seconds = null,
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("CREATIVE_MUSIC_HARMONY_STRUCTURE_ORGANIZATION_REQUIRED");
  if (!source_url) throw new Error("CREATIVE_MUSIC_HARMONY_STRUCTURE_SOURCE_REQUIRED");
  const ffmpeg = text(media_tools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH) || "ffmpeg";
  const source = await materializeMedia({
    url: source_url,
    file_name: source_file_name,
    mime_type: source_mime_type,
    organization_id,
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300000, max_redirects: 0 },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-music-harmony-"));
  try {
    const pcmPath = path.join(root, "analysis.f32le");
    const requested = Number.isFinite(Number(duration_seconds)) && Number(duration_seconds) > 0 ? Number(duration_seconds) : MAX_SECONDS;
    const analysedSeconds = Math.min(MAX_SECONDS, requested);
    const args = ["-y"];
    if (finite(source_offset_seconds, 0) > 0) args.push("-ss", String(Math.max(0, finite(source_offset_seconds, 0))));
    args.push("-t", String(analysedSeconds), "-i", source.file_path, "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-acodec", "pcm_f32le", pcmPath);
    await run(ffmpeg, args);
    const samples = pcmFloat32(await fs.readFile(pcmPath));
    const duration = samples.length / SAMPLE_RATE;
    if (duration < 4) throw new Error("CREATIVE_MUSIC_HARMONY_STRUCTURE_AUDIO_TOO_SHORT");
    const frames = chromaFrames(samples, SAMPLE_RATE);
    const chords = chordSegments(frames);
    const structure = structureBoundaries(frames, duration);
    return {
      success: true,
      contract: CONTRACT,
      duration_seconds: duration,
      analysis_window_capped: Number.isFinite(Number(duration_seconds)) && Number(duration_seconds) > MAX_SECONDS,
      max_analysis_seconds: MAX_SECONDS,
      chord_segments: chords,
      accepted_chord_segments: chords.filter((segment) => segment.accepted),
      structure_boundaries: structure.boundaries,
      sections: structure.sections,
      section_boundary_threshold: structure.threshold ?? null,
      semantic_section_labels: false,
      verse_chorus_labels: false,
      chord_quality_scope: ["major", "minor"],
      chord_labels_confidence_gated: true,
      source_audio_measured: true,
      metadata_guessing_forbidden: true,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export const CreativeMusicHarmonyStructureRuntime = {
  contract: CONTRACT,
  analyze: analyzeMusicHarmonyStructure,
};

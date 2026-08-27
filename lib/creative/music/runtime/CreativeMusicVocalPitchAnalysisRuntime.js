import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_PITCH_ANALYSIS_V1";
const SAMPLE_RATE = 8000;
const MAX_SECONDS = 120;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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
      reject(new Error("CREATIVE_MUSIC_VOCAL_PITCH_PROCESS_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(Buffer.concat(stderr).toString("utf8") || `CREATIVE_MUSIC_VOCAL_PITCH_PROCESS_EXIT_${code}`));
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

function noteFromMidi(midi) {
  const rounded = Math.round(midi);
  const pitchClass = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return { midi: rounded, name: `${NOTE_NAMES[pitchClass]}${octave}`, pitch_class: NOTE_NAMES[pitchClass], octave };
}

function estimateFramePitch(samples, start, frameSize, sampleRate) {
  let mean = 0;
  for (let index = 0; index < frameSize; index += 1) mean += samples[start + index] || 0;
  mean /= frameSize;
  let rms = 0;
  for (let index = 0; index < frameSize; index += 1) {
    const value = (samples[start + index] || 0) - mean;
    rms += value * value;
  }
  rms = Math.sqrt(rms / frameSize);
  if (rms < 0.006) return { voiced: false, rms, confidence: 0 };

  const minLag = Math.max(2, Math.floor(sampleRate / 1100));
  const maxLag = Math.min(frameSize - 4, Math.ceil(sampleRate / 65));
  let bestLag = 0;
  let bestScore = -Infinity;
  const scores = new Map();
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let dot = 0;
    let energyA = 0;
    let energyB = 0;
    const usable = frameSize - lag;
    for (let index = 0; index < usable; index += 1) {
      const left = (samples[start + index] || 0) - mean;
      const right = (samples[start + index + lag] || 0) - mean;
      dot += left * right;
      energyA += left * left;
      energyB += right * right;
    }
    const score = dot / Math.max(1e-12, Math.sqrt(energyA * energyB));
    scores.set(lag, score);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestScore < 0.58) return { voiced: false, rms, confidence: Math.max(0, bestScore) };

  const leftScore = scores.get(bestLag - 1) ?? bestScore;
  const centerScore = bestScore;
  const rightScore = scores.get(bestLag + 1) ?? bestScore;
  const denominator = leftScore - 2 * centerScore + rightScore;
  const delta = Math.abs(denominator) > 1e-9 ? 0.5 * (leftScore - rightScore) / denominator : 0;
  const interpolatedLag = bestLag + clamp(delta, -0.5, 0.5);
  const frequency = sampleRate / interpolatedLag;
  if (!Number.isFinite(frequency) || frequency < 65 || frequency > 1100) return { voiced: false, rms, confidence: bestScore };
  const midiFloat = 69 + 12 * Math.log2(frequency / 440);
  const note = noteFromMidi(midiFloat);
  const cents = (midiFloat - note.midi) * 100;
  return {
    voiced: true,
    rms,
    frequency_hz: frequency,
    midi_float: midiFloat,
    note,
    cents_deviation: cents,
    confidence: clamp(bestScore * Math.min(1, rms / 0.03), 0, 1),
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function smoothFrames(frames) {
  return frames.map((frame, index) => {
    if (!frame.voiced) return frame;
    const neighbors = frames.slice(Math.max(0, index - 2), Math.min(frames.length, index + 3)).filter((item) => item.voiced);
    const midi = median(neighbors.map((item) => item.midi_float));
    if (!Number.isFinite(midi)) return frame;
    const note = noteFromMidi(midi);
    return {
      ...frame,
      midi_float: midi,
      frequency_hz: 440 * 2 ** ((midi - 69) / 12),
      note,
      cents_deviation: (midi - note.midi) * 100,
    };
  });
}

function buildNoteSegments(frames, hopSeconds) {
  const segments = [];
  for (const frame of frames) {
    if (!frame.voiced || frame.confidence < 0.42) continue;
    const previous = segments.at(-1);
    if (previous && previous.midi === frame.note.midi && frame.time_seconds - previous.end_seconds <= hopSeconds * 1.6) {
      previous.end_seconds = frame.time_seconds + hopSeconds;
      previous.frames += 1;
      previous.confidence_sum += frame.confidence;
      previous.cents_sum += frame.cents_deviation;
      continue;
    }
    segments.push({
      midi: frame.note.midi,
      note: frame.note.name,
      pitch_class: frame.note.pitch_class,
      octave: frame.note.octave,
      start_seconds: frame.time_seconds,
      end_seconds: frame.time_seconds + hopSeconds,
      frames: 1,
      confidence_sum: frame.confidence,
      cents_sum: frame.cents_deviation,
    });
  }
  return segments
    .filter((segment) => segment.end_seconds - segment.start_seconds >= 0.08)
    .map(({ confidence_sum, cents_sum, frames, ...segment }) => ({
      ...segment,
      duration_seconds: segment.end_seconds - segment.start_seconds,
      confidence: Math.round((confidence_sum / frames) * 1000) / 1000,
      mean_cents_deviation: Math.round((cents_sum / frames) * 10) / 10,
      stable_note_evidence: true,
    }));
}

export async function analyzeMusicVocalPitch({
  organization_id,
  source_url,
  source_file_name = "vocal-source.wav",
  source_mime_type = null,
  source_offset_seconds = 0,
  duration_seconds = null,
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("CREATIVE_MUSIC_VOCAL_PITCH_ORGANIZATION_REQUIRED");
  if (!source_url) throw new Error("CREATIVE_MUSIC_VOCAL_PITCH_SOURCE_REQUIRED");
  const ffmpeg = text(media_tools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH) || "ffmpeg";
  const source = await materializeMedia({
    url: source_url,
    file_name: source_file_name,
    mime_type: source_mime_type,
    organization_id,
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300000, max_redirects: 0 },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-vocal-pitch-"));
  try {
    const requested = Number.isFinite(Number(duration_seconds)) && Number(duration_seconds) > 0 ? Number(duration_seconds) : MAX_SECONDS;
    const analysisDuration = Math.min(MAX_SECONDS, requested);
    const pcmPath = path.join(root, "pitch.f32le");
    const args = ["-y"];
    if (finite(source_offset_seconds, 0) > 0) args.push("-ss", String(Math.max(0, finite(source_offset_seconds, 0))));
    args.push("-t", String(analysisDuration), "-i", source.file_path, "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-acodec", "pcm_f32le", pcmPath);
    await run(ffmpeg, args);
    const samples = pcmFloat32(await fs.readFile(pcmPath));
    const duration = samples.length / SAMPLE_RATE;
    if (duration < 1) throw new Error("CREATIVE_MUSIC_VOCAL_PITCH_AUDIO_TOO_SHORT");
    const frameSize = Math.round(SAMPLE_RATE * 0.03);
    const hopSize = Math.round(SAMPLE_RATE * 0.02);
    const rawFrames = [];
    for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
      const estimate = estimateFramePitch(samples, start, frameSize, SAMPLE_RATE);
      rawFrames.push({
        time_seconds: start / SAMPLE_RATE,
        ...estimate,
      });
    }
    const frames = smoothFrames(rawFrames);
    const segments = buildNoteSegments(frames, hopSize / SAMPLE_RATE);
    const voiced = frames.filter((frame) => frame.voiced && frame.confidence >= 0.42);
    const meanConfidence = voiced.length ? voiced.reduce((sum, frame) => sum + frame.confidence, 0) / voiced.length : 0;
    return {
      success: true,
      contract: CONTRACT,
      duration_seconds: duration,
      analysis_sample_rate: SAMPLE_RATE,
      max_analysis_seconds: MAX_SECONDS,
      analysis_window_capped: Number.isFinite(Number(duration_seconds)) && Number(duration_seconds) > MAX_SECONDS,
      voiced_frame_count: voiced.length,
      total_frame_count: frames.length,
      voiced_ratio: frames.length ? Math.round((voiced.length / frames.length) * 1000) / 1000 : 0,
      mean_confidence: Math.round(meanConfidence * 1000) / 1000,
      note_segments: segments,
      frame_evidence: frames.filter((_, index) => index % 5 === 0).map((frame) => ({
        time_seconds: Math.round(frame.time_seconds * 1000) / 1000,
        voiced: frame.voiced === true,
        frequency_hz: frame.voiced ? Math.round(finite(frame.frequency_hz, 0) * 10) / 10 : null,
        note: frame.voiced ? frame.note?.name || null : null,
        cents_deviation: frame.voiced ? Math.round(finite(frame.cents_deviation, 0) * 10) / 10 : null,
        confidence: Math.round(finite(frame.confidence, 0) * 1000) / 1000,
      })),
      source_checksum: source.checksum || null,
      correction_applied: false,
      formant_processing_applied: false,
      auto_tune_applied: false,
      pitch_evidence_only: true,
      metadata_guessing_forbidden: true,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export const CreativeMusicVocalPitchAnalysisRuntime = {
  contract: CONTRACT,
  analyze: analyzeMusicVocalPitch,
};

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_ANALYSIS_V1";
const ANALYSIS_RATE = 16000;
const MAX_ANALYSIS_SECONDS = 900;

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max, fallback = 0) { return Math.max(min, Math.min(max, finite(value, fallback))); }

function run(command, args, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CREATIVE_MUSIC_VOCAL_TIMING_ANALYSIS_PROCESS_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8") || `CREATIVE_MUSIC_VOCAL_TIMING_ANALYSIS_PROCESS_EXIT_${code}`));
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

function frameEnvelope(samples, sampleRate) {
  const frame = Math.max(128, Math.round(sampleRate * 0.02));
  const hop = Math.max(64, Math.round(sampleRate * 0.01));
  const values = [];
  for (let start = 0; start < samples.length; start += hop) {
    const end = Math.min(samples.length, start + frame);
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += samples[index] * samples[index];
    values.push({
      start_sample: start,
      end_sample: end,
      rms: Math.sqrt(sum / Math.max(1, end - start)),
    });
  }
  return { frame, hop, values };
}

function robustThreshold(values) {
  const nonzero = values.map((entry) => entry.rms).filter((value) => value > 1e-7).sort((a, b) => a - b);
  if (!nonzero.length) return 0.002;
  const median = nonzero[Math.floor(nonzero.length * 0.5)] || 0;
  const upper = nonzero[Math.floor(nonzero.length * 0.75)] || median;
  return Math.max(0.0015, Math.min(0.04, median * 0.9 + upper * 0.18));
}

function detectedPhrases(samples, sampleRate) {
  const envelope = frameEnvelope(samples, sampleRate);
  const threshold = robustThreshold(envelope.values);
  const active = envelope.values.map((entry) => entry.rms >= threshold);
  const bridgeFrames = Math.round(0.16 / (envelope.hop / sampleRate));
  const minFrames = Math.max(1, Math.round(0.12 / (envelope.hop / sampleRate)));

  for (let index = 0; index < active.length; index += 1) {
    if (active[index]) continue;
    let previous = index - 1;
    while (previous >= 0 && !active[previous]) previous -= 1;
    let next = index + 1;
    while (next < active.length && !active[next]) next += 1;
    if (previous >= 0 && next < active.length && next - previous - 1 <= bridgeFrames) {
      for (let fill = previous + 1; fill < next; fill += 1) active[fill] = true;
      index = next;
    }
  }

  const phrases = [];
  let startFrame = null;
  for (let index = 0; index <= active.length; index += 1) {
    const isActive = active[index] === true;
    if (isActive && startFrame === null) startFrame = index;
    if ((!isActive || index === active.length) && startFrame !== null) {
      const endFrame = index - 1;
      if (endFrame - startFrame + 1 >= minFrames) {
        const start = envelope.values[startFrame].start_sample;
        const end = envelope.values[endFrame].end_sample;
        let energy = 0;
        for (let frameIndex = startFrame; frameIndex <= endFrame; frameIndex += 1) energy += envelope.values[frameIndex].rms;
        phrases.push({
          start_sample: start,
          end_sample: end,
          start_seconds: start / sampleRate,
          end_seconds: end / sampleRate,
          duration_seconds: (end - start) / sampleRate,
          mean_rms: energy / Math.max(1, endFrame - startFrame + 1),
        });
      }
      startFrame = null;
    }
  }
  return { threshold, phrases };
}

function nearestEighth(sourceSeconds, bpm, offsetSeconds) {
  const division = 60 / bpm / 2;
  const index = Math.round((sourceSeconds - offsetSeconds) / division);
  return offsetSeconds + index * division;
}

function safetyForPhrase(phrases, index, targetStart, guardSeconds, totalDuration) {
  const phrase = phrases[index];
  const targetEnd = targetStart + phrase.duration_seconds;
  if (targetStart < 0 || targetEnd > totalDuration) return { safe: false, reason: "OUTSIDE_SOURCE_BOUNDS" };
  const previousEnd = index > 0 ? phrases[index - 1].end_seconds : 0;
  const nextStart = index + 1 < phrases.length ? phrases[index + 1].start_seconds : totalDuration;
  const pocketStart = Math.max(0, previousEnd + guardSeconds);
  const pocketEnd = Math.min(totalDuration, nextStart - guardSeconds);
  if (targetStart < pocketStart || targetEnd > pocketEnd) return { safe: false, reason: "NEIGHBOR_PHRASE_COLLISION_RISK" };
  return { safe: true, reason: "SAFE_LOCAL_TIMING_POCKET" };
}

export function buildMusicVocalTimingEvidence({
  samples,
  sample_rate = ANALYSIS_RATE,
  bpm,
  beat_offset_seconds = 0,
  correction_strength = 0.45,
  max_shift_ms = 80,
} = {}) {
  if (!(samples instanceof Float32Array) || !samples.length) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_ANALYSIS_PCM_REQUIRED");
  const bpmValue = finite(bpm, null);
  if (!bpmValue || bpmValue < 30 || bpmValue > 300) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_ANALYSIS_BPM_INVALID");
  const offset = Math.max(0, finite(beat_offset_seconds, 0));
  const strength = clamp(correction_strength, 0, 1, 0.45);
  const maximumShiftMs = clamp(max_shift_ms, 10, 250, 80);
  const durationSeconds = samples.length / sample_rate;
  const detection = detectedPhrases(samples, sample_rate);
  const guardSeconds = 0.018;
  const minimumSuggestedMs = 4;

  const phrases = detection.phrases.map((phrase, index, all) => {
    const nearest = nearestEighth(phrase.start_seconds, bpmValue, offset);
    const rawShiftMs = (nearest - phrase.start_seconds) * 1000;
    const proposedShiftMs = clamp(rawShiftMs * strength, -maximumShiftMs, maximumShiftMs, 0);
    const withinMaximum = Math.abs(rawShiftMs) <= maximumShiftMs;
    const targetStart = phrase.start_seconds + proposedShiftMs / 1000;
    const safety = safetyForPhrase(all, index, targetStart, guardSeconds, durationSeconds);
    const needsMove = Math.abs(proposedShiftMs) >= minimumSuggestedMs;
    const eligible = withinMaximum && safety.safe && needsMove;
    return {
      id: `phrase-${index + 1}`,
      phrase_index: index,
      source_start_seconds: Math.round(phrase.start_seconds * 1e6) / 1e6,
      source_end_seconds: Math.round(phrase.end_seconds * 1e6) / 1e6,
      duration_seconds: Math.round(phrase.duration_seconds * 1e6) / 1e6,
      mean_rms: Math.round(phrase.mean_rms * 1e6) / 1e6,
      nearest_grid_seconds: Math.round(nearest * 1e6) / 1e6,
      raw_shift_ms: Math.round(rawShiftMs * 10) / 10,
      proposed_shift_ms: eligible ? Math.round(proposedShiftMs * 10) / 10 : 0,
      target_start_seconds: eligible ? Math.round(targetStart * 1e6) / 1e6 : phrase.start_seconds,
      eligible,
      safety_reason: safety.safe ? (needsMove ? safety.reason : "ALREADY_CLOSE_TO_REFERENCE_GRID") : safety.reason,
      outside_conservative_max_shift: !withinMaximum,
      approved: false,
      musician_shift_override: false,
    };
  });

  return {
    contract: CONTRACT,
    analysis_sample_rate: sample_rate,
    duration_seconds: durationSeconds,
    bpm: bpmValue,
    grid_division: "EIGHTH_NOTE",
    beat_offset_seconds: offset,
    settings: {
      correction_strength: strength,
      max_shift_ms: maximumShiftMs,
      minimum_suggested_shift_ms: minimumSuggestedMs,
      guard_seconds: guardSeconds,
    },
    phrase_detection_threshold_rms: Math.round(detection.threshold * 1e6) / 1e6,
    phrases,
    phrase_count: phrases.length,
    suggested_move_count: phrases.filter((phrase) => phrase.eligible).length,
    musician_approval_required: true,
    auto_apply_forbidden: true,
    whole_phrase_translation_only: true,
    time_stretch_used: false,
    internal_phrase_timing_preserved: true,
    syllable_warp_forbidden: true,
    provider_job_submitted: false,
  };
}

export async function analyzeMusicVocalTiming({
  organization_id,
  source_url,
  source_file_name = "vocal-source.wav",
  source_mime_type = null,
  source_offset_seconds = 0,
  duration_seconds = null,
  bpm,
  beat_offset_seconds = 0,
  correction_strength = 0.45,
  max_shift_ms = 80,
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_ANALYSIS_ORGANIZATION_REQUIRED");
  if (!source_url) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_ANALYSIS_SOURCE_REQUIRED");
  const ffmpeg = text(media_tools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH) || "ffmpeg";
  const source = await materializeMedia({
    url: source_url,
    file_name: source_file_name,
    mime_type: source_mime_type,
    organization_id,
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300000, max_redirects: 0 },
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-vocal-timing-"));
  try {
    const pcmPath = path.join(root, "timing.f32le");
    const offset = Math.max(0, finite(source_offset_seconds, 0));
    const duration = Number.isFinite(Number(duration_seconds)) && Number(duration_seconds) > 0
      ? Math.min(MAX_ANALYSIS_SECONDS, Number(duration_seconds))
      : MAX_ANALYSIS_SECONDS;
    await run(ffmpeg, [
      "-y", "-ss", String(offset), "-t", String(duration), "-i", source.file_path,
      "-vn", "-ac", "1", "-ar", String(ANALYSIS_RATE),
      "-f", "f32le", "-acodec", "pcm_f32le", pcmPath,
    ]);
    const samples = pcmFloat32(await fs.readFile(pcmPath));
    if (samples.length / ANALYSIS_RATE < 0.25) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_ANALYSIS_AUDIO_TOO_SHORT");
    return {
      ...buildMusicVocalTimingEvidence({
        samples,
        sample_rate: ANALYSIS_RATE,
        bpm,
        beat_offset_seconds,
        correction_strength,
        max_shift_ms,
      }),
      source_checksum: source.checksum || null,
      source_audio_measured: true,
    };
  } finally {
    await source.cleanup().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
}

export const CreativeMusicVocalTimingAnalysisRuntime = {
  contract: CONTRACT,
  buildEvidence: buildMusicVocalTimingEvidence,
  analyze: analyzeMusicVocalTiming,
};

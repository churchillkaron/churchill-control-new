import crypto from "node:crypto";
import { spawn } from "node:child_process";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value, fallback = null) {
  const number = finite(value);
  return number !== null && number > 0 ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function percentile(values = [], ratio = 0.5) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index];
}

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values = []) {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function dbfs(amplitude) {
  if (!Number.isFinite(amplitude) || amplitude <= 0) return -120;
  return 20 * Math.log10(amplitude);
}

function sourceUrl(asset = {}) {
  return asset.url || asset.file_url || asset.image_url || null;
}

function sourceMime(asset = {}) {
  return asset.mime_type ||
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical?.mime_type ||
    null;
}

function sourceName(asset = {}) {
  return asset.file_name || asset.name || asset.title || "audio-source";
}

function runPcmExtraction(command, args, timeoutMs, maximumBytes) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let settled = false;
    let timer = null;

    const finish = (error = null, value = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("AUDIO_INTELLIGENCE_EXTRACTION_TIMEOUT"));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (maximumBytes && bytes > maximumBytes) {
        child.kill("SIGKILL");
        finish(new Error("AUDIO_INTELLIGENCE_PCM_LIMIT_EXCEEDED"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `AUDIO_INTELLIGENCE_EXTRACTION_EXIT_${code}`,
        ));
        return;
      }
      finish(null, Buffer.concat(stdout));
    });
  });
}

function pcmSamples(buffer) {
  const sampleCount = Math.floor(buffer.length / 2);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = buffer.readInt16LE(index * 2) / 32768;
  }
  return samples;
}

function frameEvidence(samples, sampleRate, frameSize, hopSize) {
  const frames = [];
  let previousRms = 0;
  let previousDifference = 0;

  for (let offset = 0; offset + frameSize <= samples.length; offset += hopSize) {
    let squareSum = 0;
    let absoluteDifference = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let previous = samples[offset];

    for (let index = 0; index < frameSize; index += 1) {
      const value = samples[offset + index];
      squareSum += value * value;
      peak = Math.max(peak, Math.abs(value));
      if (index > 0) {
        absoluteDifference += Math.abs(value - previous);
        if ((value >= 0 && previous < 0) || (value < 0 && previous >= 0)) {
          zeroCrossings += 1;
        }
      }
      previous = value;
    }

    const rms = Math.sqrt(squareSum / frameSize);
    const difference = absoluteDifference / frameSize;
    const onset = Math.max(0, rms - previousRms) * 0.72 +
      Math.max(0, difference - previousDifference) * 0.28;

    frames.push({
      index: frames.length,
      time_seconds: offset / sampleRate,
      rms,
      peak,
      difference,
      zero_crossing_rate: zeroCrossings / frameSize,
      onset,
    });

    previousRms = rms;
    previousDifference = difference;
  }

  return frames;
}

function normalizeOnsets(frames = []) {
  const raw = frames.map((frame) => frame.onset);
  const floor = percentile(raw, 0.5) || 0;
  const high = percentile(raw, 0.98) || 1;
  const range = Math.max(1e-9, high - floor);
  return frames.map((frame) => ({
    ...frame,
    onset_normalized: clamp((frame.onset - floor) / range, 0, 1),
  }));
}

function tempoEvidence(frames = [], hopSeconds) {
  if (frames.length < 64) {
    return {
      bpm: null,
      confidence: 0,
      beat_interval_seconds: null,
      beat_times_seconds: [],
      downbeat_times_seconds: [],
      regularity: 0,
    };
  }

  const envelope = frames.map((frame) => frame.onset_normalized);
  const minimumBpm = 60;
  const maximumBpm = 190;
  const minimumLag = Math.max(1, Math.floor(60 / maximumBpm / hopSeconds));
  const maximumLag = Math.min(
    envelope.length - 2,
    Math.ceil(60 / minimumBpm / hopSeconds),
  );
  const candidates = [];

  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let numerator = 0;
    let leftPower = 0;
    let rightPower = 0;
    for (let index = lag; index < envelope.length; index += 1) {
      const left = envelope[index];
      const right = envelope[index - lag];
      numerator += left * right;
      leftPower += left * left;
      rightPower += right * right;
    }
    const denominator = Math.sqrt(leftPower * rightPower) || 1;
    const correlation = numerator / denominator;
    const bpm = 60 / (lag * hopSeconds);
    const centrality = 1 - Math.min(1, Math.abs(bpm - 120) / 120) * 0.08;
    candidates.push({ lag, bpm, score: correlation * centrality });
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0] || null;
  if (!best) {
    return {
      bpm: null,
      confidence: 0,
      beat_interval_seconds: null,
      beat_times_seconds: [],
      downbeat_times_seconds: [],
      regularity: 0,
    };
  }

  const distinct = candidates.filter((candidate) =>
    Math.abs(candidate.bpm - best.bpm) >= 3 &&
    Math.abs(candidate.bpm - best.bpm * 2) >= 4 &&
    Math.abs(candidate.bpm * 2 - best.bpm) >= 4,
  );
  const second = distinct[0] || { score: 0 };
  const ratio = best.score > 0 ? (best.score - second.score) / best.score : 0;
  const confidence = clamp(best.score * 0.7 + ratio * 0.3, 0, 1);

  let bestPhase = 0;
  let bestPhaseScore = -1;
  for (let phase = 0; phase < best.lag; phase += 1) {
    let score = 0;
    let count = 0;
    for (let index = phase; index < envelope.length; index += best.lag) {
      score += envelope[index];
      count += 1;
    }
    const normalized = count ? score / count : 0;
    if (normalized > bestPhaseScore) {
      bestPhaseScore = normalized;
      bestPhase = phase;
    }
  }

  const beatTimes = [];
  for (let index = bestPhase; index < frames.length; index += best.lag) {
    beatTimes.push(Number(frames[index].time_seconds.toFixed(4)));
  }
  const downbeats = beatTimes.filter((_, index) => index % 4 === 0);

  return {
    bpm: Number(best.bpm.toFixed(3)),
    confidence: Number(confidence.toFixed(4)),
    beat_interval_seconds: Number((60 / best.bpm).toFixed(6)),
    beat_times_seconds: beatTimes,
    downbeat_times_seconds: downbeats,
    regularity: Number(clamp(best.score, 0, 1).toFixed(4)),
  };
}

function energyEvidence(frames = [], durationSeconds = 0) {
  const secondCount = Math.max(1, Math.ceil(durationSeconds));
  const buckets = Array.from({ length: secondCount }, () => []);
  const onsetBuckets = Array.from({ length: secondCount }, () => []);

  for (const frame of frames) {
    const index = clamp(Math.floor(frame.time_seconds), 0, secondCount - 1);
    buckets[index].push(frame.rms);
    onsetBuckets[index].push(frame.onset_normalized);
  }

  const rawEnergy = buckets.map((bucket) => mean(bucket));
  const low = percentile(rawEnergy, 0.05) || 0;
  const high = percentile(rawEnergy, 0.95) || Math.max(...rawEnergy, 1);
  const range = Math.max(1e-9, high - low);

  return rawEnergy.map((value, index) => ({
    second: index,
    start_seconds: index,
    end_seconds: Math.min(durationSeconds, index + 1),
    energy: Number((clamp((value - low) / range, 0, 1) * 100).toFixed(2)),
    rms_dbfs: Number(dbfs(value).toFixed(3)),
    onset_density: Number(mean(onsetBuckets[index]).toFixed(4)),
  }));
}

function impactEvidence(frames = [], maximum = 500) {
  const threshold = percentile(
    frames.map((frame) => frame.onset_normalized),
    0.92,
  ) || 0.65;
  const impacts = [];
  let lastTime = -10;

  for (const frame of frames) {
    if (frame.onset_normalized < threshold) continue;
    if (frame.time_seconds - lastTime < 0.18) continue;
    impacts.push({
      time_seconds: Number(frame.time_seconds.toFixed(4)),
      strength: Number(frame.onset_normalized.toFixed(4)),
    });
    lastTime = frame.time_seconds;
    if (impacts.length >= maximum) break;
  }

  return impacts;
}

function structuralSections(energyCurve = [], impacts = [], durationSeconds = 0) {
  if (!energyCurve.length || durationSeconds <= 0) return [];
  const blockSeconds = 4;
  const blocks = [];

  for (let start = 0; start < durationSeconds; start += blockSeconds) {
    const end = Math.min(durationSeconds, start + blockSeconds);
    const entries = energyCurve.filter((entry) =>
      entry.start_seconds < end && entry.end_seconds > start,
    );
    blocks.push({
      start_seconds: start,
      end_seconds: end,
      energy: mean(entries.map((entry) => entry.energy)),
      onset_density: mean(entries.map((entry) => entry.onset_density)),
    });
  }

  const boundaries = [0];
  let lastBoundary = 0;
  for (let index = 1; index < blocks.length; index += 1) {
    const previous = blocks[index - 1];
    const current = blocks[index];
    const energyChange = Math.abs(current.energy - previous.energy);
    const rhythmChange = Math.abs(current.onset_density - previous.onset_density) * 100;
    const candidate = current.start_seconds;
    if (candidate - lastBoundary >= 8 && (energyChange >= 16 || rhythmChange >= 12)) {
      boundaries.push(candidate);
      lastBoundary = candidate;
    }
    if (candidate - lastBoundary >= 28) {
      boundaries.push(candidate);
      lastBoundary = candidate;
    }
  }
  if (boundaries[boundaries.length - 1] !== durationSeconds) {
    boundaries.push(durationSeconds);
  }

  const sections = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end - start < 1) continue;
    const entries = energyCurve.filter((entry) =>
      entry.start_seconds < end && entry.end_seconds > start,
    );
    const sectionImpacts = impacts
      .filter((impact) => impact.time_seconds >= start && impact.time_seconds < end)
      .sort((left, right) => right.strength - left.strength)
      .slice(0, 8)
      .sort((left, right) => left.time_seconds - right.time_seconds);
    const energies = entries.map((entry) => entry.energy);
    const onsets = entries.map((entry) => entry.onset_density);

    sections.push({
      id: `measured-section-${index + 1}`,
      start_seconds: Number(start.toFixed(3)),
      end_seconds: Number(end.toFixed(3)),
      measured_role: "STRUCTURAL_AUDIO_SECTION",
      energy_start: Number((energies[0] || 0).toFixed(2)),
      energy_end: Number((energies[energies.length - 1] || 0).toFixed(2)),
      energy_mean: Number(mean(energies).toFixed(2)),
      energy_peak: Number((Math.max(...energies, 0)).toFixed(2)),
      rhythmic_density: Number((mean(onsets) * 100).toFixed(2)),
      major_beats_or_impacts: sectionImpacts,
    });
  }

  return sections;
}

function aggregateEvidence(samples, frames, sampleRate, durationSeconds) {
  const absolute = [];
  for (let index = 0; index < samples.length; index += Math.max(1, Math.floor(sampleRate / 100))) {
    absolute.push(Math.abs(samples[index]));
  }
  const rmsValues = frames.map((frame) => frame.rms);
  const peak = Math.max(...frames.map((frame) => frame.peak), 0);
  const integratedRms = Math.sqrt(mean(samples.length
    ? Array.from({ length: Math.min(samples.length, 200000) }, (_, index) => {
      const sampleIndex = Math.floor(index * samples.length / Math.min(samples.length, 200000));
      return samples[sampleIndex] ** 2;
    })
    : [0]));
  const lowRms = percentile(rmsValues, 0.1) || 0;
  const highRms = percentile(rmsValues, 0.95) || 0;

  return {
    duration_seconds: Number(durationSeconds.toFixed(6)),
    sample_rate: sampleRate,
    analysed_sample_count: samples.length,
    integrated_rms_dbfs: Number(dbfs(integratedRms).toFixed(3)),
    peak_dbfs: Number(dbfs(peak).toFixed(3)),
    dynamic_range_db: Number((dbfs(highRms) - dbfs(lowRms)).toFixed(3)),
    crest_factor_db: Number((dbfs(peak) - dbfs(integratedRms)).toFixed(3)),
    signal_presence: percentile(absolute, 0.95) > 0.0005,
  };
}

function evidenceConfidence({ aggregate, tempo, sections, impacts }) {
  let confidence = 0;
  if (aggregate.signal_presence) confidence += 0.2;
  if (aggregate.duration_seconds >= 15) confidence += 0.15;
  if (aggregate.duration_seconds >= 60) confidence += 0.1;
  confidence += tempo.confidence * 0.35;
  if (tempo.beat_times_seconds.length >= 16) confidence += 0.1;
  if (sections.length >= 2) confidence += 0.05;
  if (impacts.length >= 8) confidence += 0.05;
  return clamp(confidence, 0, 1);
}

export const CreativeMeasuredAudioIntelligenceRuntime = {
  async analyze({
    organization_id,
    asset,
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!asset || !sourceUrl(asset)) {
      throw new Error("MEASURED_AUDIO_SOURCE_REQUIRED");
    }

    const ffmpegPath = policy.ffmpeg_path ||
      policy.ffmpegPath ||
      process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
      null;
    if (!ffmpegPath) {
      throw new Error("FFMPEG_NOT_CONFIGURED_FOR_AUDIO_INTELLIGENCE");
    }

    const sampleRate = positive(
      policy.sample_rate || policy.sampleRate,
      11025,
    );
    const frameSize = Math.max(128, Math.round(positive(
      policy.frame_size || policy.frameSize,
      512,
    )));
    const hopSize = Math.max(64, Math.round(positive(
      policy.hop_size || policy.hopSize,
      256,
    )));
    const timeoutMs = positive(
      policy.timeout_ms ||
      policy.timeoutMs ||
      process.env.CREATIVE_AUDIO_INTELLIGENCE_TIMEOUT_MS,
      180000,
    );
    const maximumBytes = positive(
      policy.max_pcm_bytes ||
      policy.maxPcmBytes ||
      process.env.CREATIVE_AUDIO_INTELLIGENCE_MAX_PCM_BYTES,
      128 * 1024 * 1024,
    );

    const materialized = await materializeMedia({
      url: sourceUrl(asset),
      file_name: sourceName(asset),
      mime_type: sourceMime(asset),
      organization_id,
      policy,
    });

    try {
      const pcm = await runPcmExtraction(
        ffmpegPath,
        [
          "-v", "error",
          "-i", materialized.file_path,
          "-vn",
          "-ac", "1",
          "-ar", String(sampleRate),
          "-f", "s16le",
          "-acodec", "pcm_s16le",
          "pipe:1",
        ],
        timeoutMs,
        maximumBytes,
      );
      if (pcm.length < sampleRate * 2) {
        throw new Error("MEASURED_AUDIO_SIGNAL_TOO_SHORT");
      }

      const samples = pcmSamples(pcm);
      const durationSeconds = samples.length / sampleRate;
      const frames = normalizeOnsets(
        frameEvidence(samples, sampleRate, frameSize, hopSize),
      );
      const hopSeconds = hopSize / sampleRate;
      const tempo = tempoEvidence(frames, hopSeconds);
      const energyCurve = energyEvidence(frames, durationSeconds);
      const impacts = impactEvidence(frames);
      const sections = structuralSections(energyCurve, impacts, durationSeconds);
      const aggregate = aggregateEvidence(
        samples,
        frames,
        sampleRate,
        durationSeconds,
      );
      const confidence = evidenceConfidence({
        aggregate,
        tempo,
        sections,
        impacts,
      });
      const evidence = {
        contract: "MEASURED_AUDIO_INTELLIGENCE_V1",
        source_asset_id: asset.id || asset.asset_id || null,
        source_checksum: materialized.checksum || null,
        method: "LOCAL_PCM_ONSET_AUTOCORRELATION_ENERGY_SEGMENTATION",
        aggregate,
        tempo,
        energy_curve: energyCurve,
        structural_sections: sections,
        impacts,
        confidence: Number(confidence.toFixed(4)),
        limitations: [
          "STRUCTURAL_SECTIONS_ARE_SIGNAL_BOUNDARIES_NOT_LYRIC_LABELS",
          tempo.confidence < 0.35 ? "TEMPO_CONFIDENCE_LOW" : null,
          "DOWNBEAT_PHASE_IS_ESTIMATED_FROM_ONSET_ALIGNMENT",
        ].filter(Boolean),
        measured_at: new Date().toISOString(),
      };
      evidence.evidence_hash = crypto
        .createHash("sha256")
        .update(JSON.stringify({
          source_checksum: evidence.source_checksum,
          aggregate: evidence.aggregate,
          tempo: evidence.tempo,
          energy_curve: evidence.energy_curve,
          structural_sections: evidence.structural_sections,
          impacts: evidence.impacts,
        }))
        .digest("hex");

      if (!aggregate.signal_presence) {
        throw new Error("MEASURED_AUDIO_SIGNAL_NOT_PRESENT");
      }
      if (!sections.length) {
        throw new Error("MEASURED_AUDIO_STRUCTURAL_SECTIONS_REQUIRED");
      }

      return evidence;
    } finally {
      await materialized.cleanup();
    }
  },
};

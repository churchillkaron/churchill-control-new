export const MUSIC_VOCAL_PERFORMANCE_EVIDENCE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_PERFORMANCE_EVIDENCE_V1";
const DEFAULT_RATE = 16000;

function amplitudeDb(value) {
  return 20 * Math.log10(Math.max(1e-9, Math.abs(value)));
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function frameMetrics(samples, start, end) {
  let sum = 0; let peak = 0; let diff = 0; let crossings = 0;
  let previous = samples[start] || 0;
  for (let index = start; index < end; index += 1) {
    const value = samples[index] || 0;
    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
    if (index > start) {
      diff += (value - previous) ** 2;
      if ((value >= 0) !== (previous >= 0)) crossings += 1;
    }
    previous = value;
  }
  const count = Math.max(1, end - start);
  const rms = Math.sqrt(sum / count);
  const diffRms = Math.sqrt(diff / Math.max(1, count - 1));
  return {
    rms_dbfs: amplitudeDb(rms),
    peak_dbfs: amplitudeDb(peak),
    crest_db: amplitudeDb(peak) - amplitudeDb(rms),
    high_frequency_proxy: diffRms / Math.max(1e-9, rms),
    zero_crossing_ratio: crossings / Math.max(1, count - 1),
  };
}

function groupCandidates(frames, key, type) {
  const groups = [];
  let current = null;
  for (const frame of frames) {
    if (!frame[key]) {
      if (current) groups.push(current);
      current = null;
      continue;
    }
    if (!current) current = { start_seconds: frame.start_seconds, end_seconds: frame.end_seconds, frames: [] };
    current.end_seconds = frame.end_seconds;
    current.frames.push(frame);
  }
  if (current) groups.push(current);
  return groups
    .filter((group) => group.end_seconds - group.start_seconds >= 0.04)
    .slice(0, 24)
    .map((group) => ({
      type,
      start_seconds: Number(group.start_seconds.toFixed(3)),
      end_seconds: Number(group.end_seconds.toFixed(3)),
      confidence_proxy: Number(Math.min(1, group.frames.reduce((sum, frame) => sum + frame.high_frequency_proxy, 0) / group.frames.length / 1.6).toFixed(3)),
      measured_signal_proxy: true,
      semantic_confirmation_required: true,
    }));
}

export function buildMusicVocalPerformanceEvidence({ samples, sample_rate = DEFAULT_RATE } = {}) {
  if (!(samples instanceof Float32Array) || !samples.length) {
    throw new Error("CREATIVE_MUSIC_VOCAL_PERFORMANCE_PCM_REQUIRED");
  }
  const window = Math.max(1, Math.round(sample_rate * 0.5));
  const hop = Math.max(1, Math.round(sample_rate * 0.25));
  const dynamics = [];
  for (let start = 0; start < samples.length; start += hop) {
    const end = Math.min(samples.length, start + window);
    if (end - start < sample_rate * 0.1) break;
    const metrics = frameMetrics(samples, start, end);
    dynamics.push({
      start_seconds: Number((start / sample_rate).toFixed(3)),
      end_seconds: Number((end / sample_rate).toFixed(3)),
      rms_dbfs: Number(metrics.rms_dbfs.toFixed(2)),
      peak_dbfs: Number(metrics.peak_dbfs.toFixed(2)),
      crest_db: Number(metrics.crest_db.toFixed(2)),
    });
  }
  const active = dynamics.filter((row) => row.rms_dbfs > -60);
  const p10 = percentile(active.map((row) => row.rms_dbfs), 0.1);
  const p90 = percentile(active.map((row) => row.rms_dbfs), 0.9);
  const shortFrame = Math.max(1, Math.round(sample_rate * 0.04));
  const shortHop = Math.max(1, Math.round(sample_rate * 0.02));
  const eventFrames = [];
  for (let start = 0; start + shortFrame <= samples.length; start += shortHop) {
    const metrics = frameMetrics(samples, start, start + shortFrame);
    const sibilant = metrics.rms_dbfs > -48
      && metrics.high_frequency_proxy > 0.95
      && metrics.zero_crossing_ratio > 0.16;
    const airNoise = !sibilant
      && metrics.rms_dbfs > -52 && metrics.rms_dbfs < -16
      && metrics.high_frequency_proxy > 0.55
      && metrics.zero_crossing_ratio > 0.1
      && metrics.crest_db < 14;
    eventFrames.push({
      start_seconds: start / sample_rate,
      end_seconds: (start + shortFrame) / sample_rate,
      ...metrics,
      sibilant,
      air_noise: airNoise,
    });
  }
  return {
    contract: MUSIC_VOCAL_PERFORMANCE_EVIDENCE_CONTRACT,
    dynamics_windows: dynamics.slice(0, 240),
    active_dynamic_range_db: Number.isFinite(p10) && Number.isFinite(p90)
      ? Number((p90 - p10).toFixed(2))
      : null,
    median_crest_db: active.length
      ? Number(percentile(active.map((row) => row.crest_db), 0.5).toFixed(2))
      : null,
    sibilant_event_candidates: groupCandidates(eventFrames, "sibilant", "SIBILANT_EVENT_CANDIDATE"),
    air_noise_event_candidates: groupCandidates(eventFrames, "air_noise", "AIR_NOISE_EVENT_CANDIDATE"),
    breath_events_confirmed: false,
    consonant_identity_inferred: false,
    signal_proxy_only: true,
    mutation_authorized: false,
  };
}

export const CreativeMusicVocalPerformanceAnalysisRuntime = Object.freeze({
  contract: MUSIC_VOCAL_PERFORMANCE_EVIDENCE_CONTRACT,
  build: buildMusicVocalPerformanceEvidence,
});

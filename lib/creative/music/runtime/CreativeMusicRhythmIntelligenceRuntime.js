import { buildMusicMeterIntelligence } from "./CreativeMusicMeterIntelligenceRuntime.js";

export const MUSIC_RHYTHM_INTELLIGENCE_CONTRACT = "AVANTIQO_MUSIC_RHYTHM_INTELLIGENCE_V1";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rounded(value, digits = 3) {
  const number = finite(value);
  return number === null ? null : Number(number.toFixed(digits));
}

function densityWindows(sections = {}) {
  const rows = list(object(sections).windows)
    .map((row) => ({
      start_seconds: finite(row.start_seconds),
      end_seconds: finite(row.end_seconds),
      transient_density: finite(row.transient_density),
    }))
    .filter((row) => row.start_seconds !== null && row.end_seconds !== null && row.transient_density !== null);
  if (!rows.length) return [];
  const mean = rows.reduce((sum, row) => sum + row.transient_density, 0) / rows.length;
  const variance = rows.reduce((sum, row) => sum + (row.transient_density - mean) ** 2, 0) / rows.length;
  const sigma = Math.sqrt(variance) || 1e-9;
  return rows.map((row) => ({
    ...row,
    density_z: rounded((row.transient_density - mean) / sigma),
    density_state: row.transient_density >= mean + sigma * 0.55 ? "HIGH" : row.transient_density <= mean - sigma * 0.55 ? "LOW" : "MID",
  }));
}
function grooveChanges(rows = []) {
  const changes = [];
  for (let index = 1; index < rows.length; index += 1) {
    const delta = Math.abs((rows[index].density_z || 0) - (rows[index - 1].density_z || 0));
    if (delta < 1.1) continue;
    changes.push({
      at_seconds: rows[index].start_seconds,
      density_delta_z: rounded(delta),
      from_state: rows[index - 1].density_state,
      to_state: rows[index].density_state,
      measured: true,
    });
  }
  return changes.slice(0, 24);
}

export function buildMusicRhythmIntelligence(analysis = {}) {
  const rhythm = object(analysis.rhythm);
  const pulseConfidence = finite(rhythm.pulse_phase_confidence);
  const beatRatio = finite(rhythm.beat_energy_ratio);
  const offbeatRatio = finite(rhythm.offbeat_energy_ratio);
  const pulseReady = rhythm.pulse_ready === true && pulseConfidence !== null;
  const density = densityWindows(analysis.sections);
  const meter = buildMusicMeterIntelligence(analysis);
  let syncopation = null;
  if (pulseReady && beatRatio !== null && offbeatRatio !== null) {
    syncopation = offbeatRatio >= beatRatio * 1.15 ? "OFFBEAT_HEAVY" : offbeatRatio >= beatRatio * 0.7 ? "MIXED" : "BEAT_CENTERED";
  }
  return Object.freeze({
    contract: MUSIC_RHYTHM_INTELLIGENCE_CONTRACT,
    bpm: finite(rhythm.bpm),
    pulse_stability: finite(rhythm.pulse_stability),
    pulse_phase_confidence: pulseConfidence,
    beat_energy_ratio: beatRatio,
    offbeat_energy_ratio: offbeatRatio,
    syncopation_tendency: syncopation,
    half_double_time_candidate: rhythm.half_double_time_candidate || null,
    density_profile: density.slice(0, 32),
    groove_change_points: grooveChanges(density),
    rhythm_analysis_ready: pulseReady,
    meter_intelligence: meter,
    downbeat_analysis_ready: meter.meter_analysis_ready === true,
    downbeat_confidence: meter.downbeat_confidence,
    downbeat_claim_forbidden_without_meter_phase_model: meter.meter_analysis_ready !== true,
    measured_from_audio: rhythm.measured_from_audio === true,
    user_intent_inference_allowed: false,
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicRhythmIntelligenceRuntime = Object.freeze({
  contract: MUSIC_RHYTHM_INTELLIGENCE_CONTRACT,
  build: buildMusicRhythmIntelligence,
});

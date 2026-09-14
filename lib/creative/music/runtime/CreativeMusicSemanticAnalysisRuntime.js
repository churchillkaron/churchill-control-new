import { buildMusicHarmonyIntelligence } from "./CreativeMusicHarmonyIntelligenceRuntime.js";

export const MUSIC_SEMANTIC_ANALYSIS_CONTRACT = "AVANTIQO_MUSIC_SEMANTIC_ANALYSIS_V1";
const MAX_PATTERNS = 12;
const MAX_HARMONIC_POINTS = 24;

function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function rounded(value, digits = 3) {
  const n = finite(value);
  return n === null ? null : Number(n.toFixed(digits));
}
function mean(values) {
  const rows = values.map(finite).filter((value) => value !== null);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : 0;
}
function sigma(values, center = mean(values)) {
  const rows = values.map(finite).filter((value) => value !== null);
  if (!rows.length) return 0;
  return Math.sqrt(rows.reduce((sum, value) => sum + (value - center) ** 2, 0) / rows.length);
}
function energyProfile(windows = []) {
  const rows = list(windows).map((row) => ({
    start_seconds: finite(row.start_seconds),
    end_seconds: finite(row.end_seconds),
    rms: finite(row.rms),
    transient_density: finite(row.transient_density),
  })).filter((row) => row.start_seconds !== null && row.end_seconds !== null && row.rms !== null && row.transient_density !== null);
  if (!rows.length) return [];
  const rmsMean = mean(rows.map((row) => row.rms));
  const rmsSigma = sigma(rows.map((row) => row.rms), rmsMean) || 1e-9;
  const transientMean = mean(rows.map((row) => row.transient_density));
  const transientSigma = sigma(rows.map((row) => row.transient_density), transientMean) || 1e-9;
  return rows.map((row) => ({
    ...row,
    energy_z: rounded((row.rms - rmsMean) / rmsSigma),
    density_z: rounded((row.transient_density - transientMean) / transientSigma),
    energy_state: row.rms >= rmsMean + rmsSigma * 0.55 ? "HIGH" : row.rms <= rmsMean - rmsSigma * 0.55 ? "LOW" : "MID",
    density_state: row.transient_density >= transientMean + transientSigma * 0.55 ? "HIGH" : row.transient_density <= transientMean - transientSigma * 0.55 ? "LOW" : "MID",
  }));
}

function patternFingerprint(rows = []) {
  if (!rows.length) return null;
  const rms = rows.map((row) => row.rms);
  const transient = rows.map((row) => row.transient_density);
  const rmsMean = mean(rms) || 1e-9;
  const transientMean = mean(transient) || 1e-9;
  return [
    ...rms.map((value) => rounded(value / rmsMean, 4)),
    ...transient.map((value) => rounded(value / transientMean, 4)),
  ];
}
function vectorDistance(left = [], right = []) {
  if (!left.length || left.length !== right.length) return null;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += (left[index] - right[index]) ** 2;
  return Math.sqrt(sum / left.length);
}

function recurringPatterns(windows = []) {
  const rows = list(windows);
  const span = 4;
  const blocks = [];
  for (let index = 0; index + span <= rows.length; index += span) {
    const slice = rows.slice(index, index + span);
    const fingerprint = patternFingerprint(slice);
    if (!fingerprint) continue;
    blocks.push({
      start_seconds: finite(slice[0]?.start_seconds),
      end_seconds: finite(slice.at(-1)?.end_seconds),
      fingerprint,
    });
  }
  const matches = [];
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 2; right < blocks.length; right += 1) {
      const distance = vectorDistance(blocks[left].fingerprint, blocks[right].fingerprint);
      if (distance === null || distance > 0.23) continue;
      matches.push({
        first_start_seconds: blocks[left].start_seconds,
        first_end_seconds: blocks[left].end_seconds,
        repeat_start_seconds: blocks[right].start_seconds,
        repeat_end_seconds: blocks[right].end_seconds,
        similarity: rounded(Math.max(0, 1 - distance), 3),
        measured: true,
        label: "recurring_texture_energy_candidate",
      });
    }
  }
  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, MAX_PATTERNS);
}

function harmonicMovement(harmonic = {}) {
  const source = object(harmonic);
  return list(source.change_points).slice(0, MAX_HARMONIC_POINTS).map((row) => ({
    at_seconds: finite(row.at_seconds),
    chroma_distance: finite(row.chroma_distance),
    confidence: finite(row.confidence),
    measured: true,
    chord_label: null,
  })).filter((row) => row.at_seconds !== null && row.chroma_distance !== null);
}
export function buildMusicSemanticAnalysis(analysis = {}) {
  const sections = object(analysis.sections);
  const energy = energyProfile(sections.windows);
  const patterns = recurringPatterns(sections.windows);
  const harmonic = harmonicMovement(analysis.harmonic_movement);
  const harmony = buildMusicHarmonyIntelligence(analysis);
  return Object.freeze({
    contract: MUSIC_SEMANTIC_ANALYSIS_CONTRACT,
    energy_profile: energy,
    recurring_patterns: patterns,
    harmonic_change_points: harmonic,
    harmony_intelligence: harmony,
    harmonic_movement_ready: Boolean(analysis.harmonic_movement?.measured_from_audio),
    chord_analysis_ready: harmony.chord_analysis_ready === true,
    vocal_entry_analysis_ready: false,
    section_identity_inference_allowed: false,
    user_intent_inference_allowed: false,
    measured_from_audio: analysis.source_audio_measured === true,
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicSemanticAnalysisRuntime = Object.freeze({
  contract: MUSIC_SEMANTIC_ANALYSIS_CONTRACT,
  build: buildMusicSemanticAnalysis,
});

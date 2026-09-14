import { buildMusicHarmonyIntelligence } from "./CreativeMusicHarmonyIntelligenceRuntime.js";
import { buildMusicMelodyIntelligence } from "./CreativeMusicMelodyIntelligenceRuntime.js";
import { buildMusicRhythmIntelligence } from "./CreativeMusicRhythmIntelligenceRuntime.js";

export const MUSIC_FORM_INTELLIGENCE_CONTRACT = "AVANTIQO_MUSIC_FORM_INTELLIGENCE_V1";
const BOUNDARY_MERGE_SECONDS = 1.25;
const MIN_REGION_SECONDS = 3.5;
const MAX_REGIONS = 20;

function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }
function rounded(value, digits = 3) { const n = finite(value); return n === null ? null : Number(n.toFixed(digits)); }
function mean(values = []) { const rows = values.map(finite).filter((v) => v !== null); return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : null; }

function dynamicCandidates(analysis = {}) {
  return list(analysis.sections?.boundaries_seconds).map((at) => ({
    at_seconds: finite(at), source: "DYNAMIC", confidence: 0.56,
  })).filter((row) => row.at_seconds !== null);
}
function harmonicCandidates(analysis = {}) {
  return list(analysis.harmonic_movement?.change_points).map((row) => ({
    at_seconds: finite(row.at_seconds),
    source: "HARMONIC",
    confidence: clamp((finite(row.confidence) ?? 0.45) * 0.82, 0.28, 0.78),
  })).filter((row) => row.at_seconds !== null);
}

function rhythmCandidates(rhythm = {}) {
  return list(rhythm.groove_change_points).map((row) => ({
    at_seconds: finite(row.at_seconds),
    source: "RHYTHM",
    confidence: clamp((finite(row.density_delta_z) ?? 1.1) / 2.4, 0.3, 0.82),
  })).filter((row) => row.at_seconds !== null);
}

function melodyCandidates(melody = {}) {
  if (melody.melody_analysis_ready !== true) return [];
  return list(melody.phrases).slice(1).map((row) => ({
    at_seconds: finite(row.start_seconds), source: "MELODY_PHRASE", confidence: 0.24,
  })).filter((row) => row.at_seconds !== null);
}
function mergeBoundaryCandidates(candidates = [], duration = null) {
  const rows = candidates
    .filter((row) => finite(row.at_seconds) !== null)
    .filter((row) => duration === null || (row.at_seconds >= MIN_REGION_SECONDS && row.at_seconds <= duration - MIN_REGION_SECONDS))
    .sort((a, b) => a.at_seconds - b.at_seconds);
  const clusters = [];
  for (const row of rows) {
    const current = clusters.at(-1);
    if (!current || row.at_seconds - current.max_seconds > BOUNDARY_MERGE_SECONDS) {
      clusters.push({ rows: [row], max_seconds: row.at_seconds });
    } else {
      current.rows.push(row);
      current.max_seconds = row.at_seconds;
    }
  }
  return clusters.map(({ rows: group }) => {
    const weights = group.map((row) => finite(row.confidence) ?? 0.2);
    const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;
    const at = group.reduce((sum, row, index) => sum + row.at_seconds * weights[index], 0) / weightTotal;
    const combined = 1 - group.reduce((product, row) => product * (1 - clamp(row.confidence ?? 0.2)), 1);
    const evidence = [...new Set(group.map((row) => row.source))];
    return { at_seconds: rounded(at), confidence: rounded(combined), evidence, corroborated: evidence.length >= 2 };
  }).filter((row) => row.confidence >= 0.5 || row.corroborated).slice(0, MAX_REGIONS - 1);
}
function rowsInside(rows = [], start, end) {
  return list(rows).filter((row) => {
    const at = finite(row.start_seconds ?? row.at_seconds);
    return at !== null && at >= start && at < end;
  });
}

function setSimilarity(left = [], right = []) {
  const a = new Set(left.filter(Boolean));
  const b = new Set(right.filter(Boolean));
  if (!a.size || !b.size) return null;
  const overlap = [...a].filter((value) => b.has(value)).length;
  return overlap / (a.size + b.size - overlap);
}

function regionFeatures(region, analysis, harmony, rhythm, melody) {
  const windows = rowsInside(analysis.sections?.windows, region.start_seconds, region.end_seconds);
  const chords = rowsInside(harmony.chord_windows, region.start_seconds, region.end_seconds).map((row) => row.chord_label).filter(Boolean);
  const phrases = rowsInside(melody.phrases, region.start_seconds, region.end_seconds);
  const density = windows.map((row) => finite(row.transient_density)).filter((v) => v !== null);
  const energy = windows.map((row) => finite(row.rms)).filter((v) => v !== null);
  return {
    duration_seconds: rounded(region.end_seconds - region.start_seconds),
    mean_energy: rounded(mean(energy), 6),
    mean_density: rounded(mean(density), 6),
    chord_labels: [...new Set(chords)].slice(0, 12),
    melody_contours: [...new Set(phrases.map((row) => row.contour).filter(Boolean))].slice(0, 8),
    groove_change_count: rowsInside(rhythm.groove_change_points, region.start_seconds + 0.25, region.end_seconds).length,
    harmonic_change_count: rowsInside(analysis.harmonic_movement?.change_points, region.start_seconds + 0.25, region.end_seconds).length,
  };
}
function ratioSimilarity(left, right) {
  const a = finite(left); const b = finite(right);
  if (a === null || b === null) return null;
  const high = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return clamp(Math.min(Math.abs(a), Math.abs(b)) / high);
}

function regionSimilarity(left = {}, right = {}) {
  const components = [
    ratioSimilarity(left.duration_seconds, right.duration_seconds),
    ratioSimilarity(left.mean_energy, right.mean_energy),
    ratioSimilarity(left.mean_density, right.mean_density),
    setSimilarity(left.chord_labels, right.chord_labels),
    setSimilarity(left.melody_contours, right.melody_contours),
    ratioSimilarity(left.groove_change_count + 1, right.groove_change_count + 1),
    ratioSimilarity(left.harmonic_change_count + 1, right.harmonic_change_count + 1),
  ].filter((value) => value !== null);
  return {
    score: components.length ? rounded(mean(components)) : null,
    evidence_dimensions: components.length,
  };
}

function neutralLabel(index) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return alphabet[index];
  return `S${index + 1}`;
}
function assignNeutralGroups(regions = []) {
  const groups = [];
  return regions.map((region) => {
    let best = null;
    for (const group of groups) {
      const similarity = regionSimilarity(region.features, group.prototype.features);
      if (!best || (similarity.score ?? -1) > (best.similarity.score ?? -1)) best = { group, similarity };
    }
    if (best && best.similarity.evidence_dimensions >= 3 && (best.similarity.score ?? 0) >= 0.84) {
      best.group.members += 1;
      return { ...region, neutral_label: best.group.label, recurrence_similarity: best.similarity.score };
    }
    const group = { label: neutralLabel(groups.length), prototype: region, members: 1 };
    groups.push(group);
    return { ...region, neutral_label: group.label, recurrence_similarity: null };
  });
}

function adjacentContrasts(regions = []) {
  const rows = [];
  for (let index = 1; index < regions.length; index += 1) {
    const similarity = regionSimilarity(regions[index - 1].features, regions[index].features);
    if (similarity.score === null) continue;
    const contrast = rounded(1 - similarity.score);
    rows.push({
      at_seconds: regions[index].start_seconds,
      from_label: regions[index - 1].neutral_label,
      to_label: regions[index].neutral_label,
      contrast_score: contrast,
      contrast_state: contrast >= 0.38 ? "HIGH" : contrast >= 0.2 ? "MEDIUM" : "LOW",
      evidence_dimensions: similarity.evidence_dimensions,
      measured: true,
    });
  }
  return rows;
}
export function buildMusicFormIntelligence(analysis = {}) {
  const duration = finite(analysis.duration_seconds);
  const harmony = buildMusicHarmonyIntelligence(analysis);
  const rhythm = buildMusicRhythmIntelligence(analysis);
  const melody = buildMusicMelodyIntelligence(analysis);
  const boundaries = mergeBoundaryCandidates([
    ...dynamicCandidates(analysis),
    ...harmonicCandidates(analysis),
    ...rhythmCandidates(rhythm),
    ...melodyCandidates(melody),
  ], duration);
  const points = [0, ...boundaries.map((row) => row.at_seconds), duration].filter((value) => finite(value) !== null);
  const rawRegions = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]; const end = points[index + 1];
    if (end - start < MIN_REGION_SECONDS) continue;
    const region = { index, start_seconds: rounded(start), end_seconds: rounded(end) };
    rawRegions.push({ ...region, features: regionFeatures(region, analysis, harmony, rhythm, melody) });
  }
  const regions = assignNeutralGroups(rawRegions);
  const returns = regions.filter((row, index) => index > 0 && regions.slice(0, index).some((prev) => prev.neutral_label === row.neutral_label)).map((row) => ({
    at_seconds: row.start_seconds,
    neutral_label: row.neutral_label,
    recurrence_similarity: row.recurrence_similarity,
    measured_return_candidate: true,
  }));
  return Object.freeze({
    contract: MUSIC_FORM_INTELLIGENCE_CONTRACT,
    form_analysis_ready: regions.length >= 2,
    neutral_regions: regions,
    boundary_candidates: boundaries,
    return_candidates: returns,
    adjacent_contrasts: adjacentContrasts(regions),
    semantic_section_labels_inferred: false,
    approved_section_labels_may_overlay_neutral_regions: true,
    measured_from_audio: analysis.source_audio_measured === true,
    user_intent_inference_allowed: false,
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicFormIntelligenceRuntime = Object.freeze({
  contract: MUSIC_FORM_INTELLIGENCE_CONTRACT,
  build: buildMusicFormIntelligence,
});

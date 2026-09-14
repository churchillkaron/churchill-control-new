import { listeningEvidenceStatus } from "./CreativeMusicListeningEvidenceRuntime.js";

export const MUSIC_LISTENING_CONTEXT_CONTRACT = "AVANTIQO_MUSIC_LISTENING_CONTEXT_V1";
const MAX_SECTION_LINKS = 24;
const MAX_BRIEF_ITEMS = 18;

function text(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function rounded(value, digits = 2) {
  const number = finite(value);
  return number === null ? null : Number(number.toFixed(digits));
}

function normalizedSection(value = {}) {
  const start = finite(value.start_seconds);
  const end = finite(value.end_seconds);
  const label = text(value.label, 180);
  if (start === null || end === null || end <= start || !label) return null;
  return { start_seconds: start, end_seconds: end, label };
}
function bestSectionLink(region = {}, sections = []) {
  const start = finite(region.start_seconds);
  const end = finite(region.end_seconds);
  if (start === null || end === null || end <= start) return null;
  let best = null;
  for (const rawSection of list(sections)) {
    const section = normalizedSection(rawSection);
    if (!section) continue;
    const overlap = Math.max(0, Math.min(end, section.end_seconds) - Math.max(start, section.start_seconds));
    if (overlap <= 0) continue;
    const overlapRatio = overlap / Math.max(0.001, end - start);
    if (!best || overlapRatio > best.overlap_ratio) {
      best = {
        section_label: section.label,
        section_start_seconds: section.start_seconds,
        section_end_seconds: section.end_seconds,
        overlap_ratio: rounded(overlapRatio, 3),
      };
    }
  }
  return best && best.overlap_ratio >= 0.35 ? best : null;
}

function sectionsForCurrentVersion(sections = [], current = {}) {
  const activeMaster = text(current.current_master_asset_id, 180);
  const activeVersion = text(current.current_version_id || activeMaster, 180);
  if (!activeMaster || !activeVersion) return [];
  return list(sections).filter((section) => {
    const sectionMaster = text(section?.master_asset_id, 180);
    const sectionVersion = text(section?.version_id || sectionMaster, 180);
    return sectionMaster === activeMaster && sectionVersion === activeVersion;
  });
}

function sectionLinks(evidence = {}, sections = []) {
  return list(evidence.regions).slice(0, MAX_SECTION_LINKS).map((region) => ({
    start_seconds: finite(region.start_seconds),
    end_seconds: finite(region.end_seconds),
    label: text(region.label, 180) || null,
    evidence: text(region.evidence, 500) || null,
    source: text(region.source, 120) || null,
    section: bestSectionLink(region, sections),
  })).filter((region) => region.start_seconds !== null && region.end_seconds !== null);
}

function measuredBrief(measured = {}) {
  const source = object(measured);
  const brief = [];
  const bpm = finite(source.bpm);
  const bpmConfidence = finite(source.bpm_confidence);
  const keyLabel = text(source.key_label, 120);
  const keyConfidence = finite(source.key_confidence);
  const master = object(source.master);
  if (bpm !== null) brief.push(`Measured tempo: ${rounded(bpm, 1)} BPM${bpmConfidence !== null ? ` (confidence ${rounded(bpmConfidence, 3)})` : ""}.`);
  if (keyLabel) brief.push(`Measured key: ${keyLabel}${keyConfidence !== null ? ` (confidence ${rounded(keyConfidence, 3)})` : ""}.`);
  if (finite(master.integrated_lufs) !== null) brief.push(`Measured integrated loudness: ${rounded(master.integrated_lufs, 2)} LUFS.`);
  if (finite(master.true_peak_dbfs) !== null) brief.push(`Measured true peak: ${rounded(master.true_peak_dbfs, 2)} dBFS.`);
  if (finite(master.stereo_correlation) !== null) brief.push(`Measured stereo correlation: ${rounded(master.stereo_correlation, 3)}.`);
  const boundaries = list(source.section_boundaries_seconds).map(finite).filter((value) => value !== null).slice(0, 12);
  if (boundaries.length) brief.push(`Measured dynamic boundaries: ${boundaries.map((value) => `${rounded(value, 2)}s`).join(", ")}.`);
  return brief.slice(0, MAX_BRIEF_ITEMS);
}
function sectionAt(seconds, sections = []) {
  const point = finite(seconds);
  if (point === null) return null;
  for (const raw of list(sections)) {
    const section = normalizedSection(raw);
    if (section && point >= section.start_seconds && point < section.end_seconds) return section.label;
  }
  return null;
}
function semanticBrief(semantic = {}, sections = []) {
  const source = object(semantic);
  const brief = [];
  const harmony = object(source.harmony_intelligence);
  if (harmony.tonal_center?.label) {
    brief.push(`Measured tonal center candidate: ${text(harmony.tonal_center.label, 120)} (confidence ${rounded(harmony.tonal_center.confidence, 3)}).`);
  }
  for (const window of list(harmony.chord_windows).filter((row) => row.chord_label).slice(0, 4)) {
    const start = finite(window.start_seconds);
    if (start === null) continue;
    const section = sectionAt(start, sections);
    brief.push(`Measured chord candidate ${text(window.chord_label, 32)} at ${rounded(start, 2)}s${section ? ` in ${section}` : ""} (confidence ${rounded(window.confidence, 3)}, margin ${rounded(window.candidate_margin, 3)}).`);
  }
  for (const point of list(source.harmonic_change_points).slice(0, 4)) {
    const at = finite(point.at_seconds);
    if (at === null) continue;
    const section = sectionAt(at, sections);
    const confidence = finite(point.confidence);
    brief.push(`Measured harmonic movement at ${rounded(at, 2)}s${section ? ` in ${section}` : ""}${confidence !== null ? ` (confidence ${rounded(confidence, 3)})` : ""}; no chord name inferred.`);
  }
  const rhythm = object(source.rhythm_intelligence);
  if (rhythm.rhythm_analysis_ready === true) {
    const stability = finite(rhythm.pulse_stability);
    const confidence = finite(rhythm.pulse_phase_confidence);
    brief.push(`Measured pulse${stability !== null ? ` stability ${rounded(stability, 3)}` : ""}${confidence !== null ? `; phase confidence ${rounded(confidence, 3)}` : ""}.`);
    if (text(rhythm.syncopation_tendency, 80)) brief.push(`Measured rhythmic tendency: ${text(rhythm.syncopation_tendency, 80).toLowerCase().replaceAll("_", " ")}.`);
    const ambiguous = object(rhythm.half_double_time_candidate);
    if (finite(ambiguous.bpm) !== null && finite(ambiguous.score_ratio) !== null && ambiguous.score_ratio >= 0.85) brief.push(`Tempo has a plausible half/double-time alternative near ${rounded(ambiguous.bpm, 1)} BPM.`);
  }
  for (const change of list(rhythm.groove_change_points).slice(0, 3)) {
    const at = finite(change.at_seconds);
    if (at === null) continue;
    const section = sectionAt(at, sections);
    brief.push(`Measured groove-density change at ${rounded(at, 2)}s${section ? ` in ${section}` : ""}: ${change.from_state || "?"} to ${change.to_state || "?"}.`);
  }
  for (const pattern of list(source.recurring_patterns).slice(0, 3)) {
    const first = finite(pattern.first_start_seconds);
    const repeat = finite(pattern.repeat_start_seconds);
    if (first === null || repeat === null) continue;
    brief.push(`Measured recurring texture/energy pattern around ${rounded(first, 2)}s and ${rounded(repeat, 2)}s (similarity ${rounded(pattern.similarity, 3)}).`);
  }
  const energetic = list(source.energy_profile).filter((row) => row.energy_state === "HIGH").sort((a, b) => (finite(b.energy_z) || 0) - (finite(a.energy_z) || 0)).slice(0, 2);
  for (const row of energetic) {
    const start = finite(row.start_seconds);
    if (start === null) continue;
    const section = sectionAt(start, sections);
    brief.push(`Measured high-energy region at ${rounded(start, 2)}s${section ? ` in ${section}` : ""}; transient density is ${row.density_state || "unknown"}.`);
  }
  return brief.slice(0, 8);
}

function observationBrief(observations = []) {
  return list(observations).slice(0, MAX_BRIEF_ITEMS).map((observation) => {
    const source = text(observation.family || observation.source, 120) || "DAILIES";
    const statement = text(observation.text, 500);
    if (!statement) return null;
    return `${source} review: ${statement}`;
  }).filter(Boolean).slice(0, MAX_BRIEF_ITEMS);
}

export function buildMusicListeningContext({ evidence = {}, current = {}, sections = [] } = {}) {
  const status = listeningEvidenceStatus(evidence, current);
  if (!status.current) return null;
  const source = object(evidence);
  const currentSections = sectionsForCurrentVersion(sections, current);
  const links = sectionLinks(source, currentSections);
  const measured = object(source.measured);
  const semantic = object(source.semantic);
  const brief = [...measuredBrief(measured), ...semanticBrief(semantic, currentSections), ...observationBrief(source.observations, links)].slice(0, MAX_BRIEF_ITEMS);
  return Object.freeze({
    contract: MUSIC_LISTENING_CONTEXT_CONTRACT,
    master_asset_id: text(source.master_asset_id, 180) || null,
    version_id: text(source.version_id, 180) || null,
    evidence_fingerprint: text(source.evidence_fingerprint, 80) || null,
    measured,
    semantic,
    observations: list(source.observations).slice(0, MAX_BRIEF_ITEMS),
    regions: links,
    reasoning_brief: brief,
    evidence_is_current: true,
    section_labels_version_bound: true,
    section_labels_available: currentSections.length > 0,
    evidence_is_descriptive_not_user_intent: true,
    semantic_descriptors_are_measurement_grounded: true,
    chord_names_available: semantic.harmony_intelligence?.chord_names_available === true,
    rhythm_analysis_available: semantic.rhythm_intelligence?.rhythm_analysis_ready === true,
    downbeat_analysis_available: false,
    vocal_entry_analysis_available: false,
    may_inform_advice: true,
    may_infer_user_intent: false,
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicListeningContextRuntime = Object.freeze({
  contract: MUSIC_LISTENING_CONTEXT_CONTRACT,
  build: buildMusicListeningContext,
});

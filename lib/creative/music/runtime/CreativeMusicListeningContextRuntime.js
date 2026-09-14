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
  const links = sectionLinks(source, sections);
  const measured = object(source.measured);
  const brief = [...measuredBrief(measured), ...observationBrief(source.observations, links)].slice(0, MAX_BRIEF_ITEMS);
  return Object.freeze({
    contract: MUSIC_LISTENING_CONTEXT_CONTRACT,
    master_asset_id: text(source.master_asset_id, 180) || null,
    version_id: text(source.version_id, 180) || null,
    evidence_fingerprint: text(source.evidence_fingerprint, 80) || null,
    measured,
    observations: list(source.observations).slice(0, MAX_BRIEF_ITEMS),
    regions: links,
    reasoning_brief: brief,
    evidence_is_current: true,
    evidence_is_descriptive_not_user_intent: true,
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

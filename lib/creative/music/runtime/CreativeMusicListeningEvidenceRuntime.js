import { createHash } from "node:crypto";

export const MUSIC_LISTENING_EVIDENCE_CONTRACT = "AVANTIQO_MUSIC_LISTENING_EVIDENCE_V1";
const MAX_REGIONS = 24;
const MAX_OBSERVATIONS = 24;

function text(value, max = 600) { return String(value ?? "").trim().slice(0, max); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function fingerprint(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32); }

function compactRegion(value = {}) {
  const start = finite(value.start_seconds);
  const end = finite(value.end_seconds);
  if (start === null || end === null || start < 0 || end <= start) return null;
  return {
    start_seconds: start,
    end_seconds: end,
    label: text(value.label, 180) || null,
    evidence: text(value.evidence || value.reason, 500) || null,
    source: text(value.source || value.family, 120) || null,
  };
}

function compactRegions(values) {
  return list(values).map(compactRegion).filter(Boolean).slice(0, MAX_REGIONS);
}
function compactMasterFacts(report = {}) {
  const source = object(report);
  const candidates = {
    integrated_lufs: source.integrated_lufs ?? source.lufs ?? source.integrated_loudness_lufs,
    true_peak_dbfs: source.true_peak_dbfs ?? source.true_peak_db ?? source.true_peak,
    peak_dbfs: source.peak_dbfs ?? source.sample_peak_dbfs ?? source.peak_db,
    loudness_range_lu: source.loudness_range_lu ?? source.lra ?? source.loudness_range,
    stereo_correlation: source.stereo_correlation ?? source.correlation,
  };
  return Object.fromEntries(Object.entries(candidates).map(([key, value]) => [key, finite(value)]).filter(([, value]) => value !== null));
}

function reviewObservations(reviews = []) {
  return list(reviews).flatMap((review) => {
    const family = text(review.family, 120) || "UNKNOWN";
    return list(review.failures).map((failure) => ({
      kind: "review_observation",
      family,
      text: text(failure, 500),
      confidence: null,
      measured: false,
    }));
  }).filter((row) => row.text).slice(0, MAX_OBSERVATIONS);
}

function reviewRegions(reviews = []) {
  return compactRegions(list(reviews).flatMap((review) => list(review.regions).map((region) => ({
    ...region,
    source: text(review.family, 120) || "DAILIES",
  }))));
}
export function buildMusicListeningEvidence({
  creative_project_id,
  master_asset_id,
  version_id = null,
  analysis = {},
  master_report = {},
  reviews = [],
  reviewed_at = null,
} = {}) {
  const projectId = text(creative_project_id, 180);
  const masterId = text(master_asset_id, 180);
  const versionId = text(version_id || master_asset_id, 180);
  if (!projectId || !masterId || !versionId) return null;
  const tempo = object(analysis.tempo);
  const key = object(analysis.key);
  const sections = object(analysis.sections);
  const measured = {
    duration_seconds: finite(analysis.duration_seconds),
    source_checksum: text(analysis.source_checksum, 180) || null,
    bpm: analysis.accepted?.bpm ?? null,
    bpm_confidence: finite(tempo.confidence),
    key_label: text(analysis.accepted?.key_label, 120) || null,
    key_confidence: finite(key.confidence),
    section_boundaries_seconds: list(sections.boundaries_seconds).map(finite).filter((value) => value !== null).slice(0, 64),
    master: compactMasterFacts(master_report),
  };
  const dynamicRegions = compactRegions(list(sections.windows).map((row) => ({
    start_seconds: row.start_seconds,
    end_seconds: row.end_seconds,
    label: "dynamic_window",
    evidence: `rms=${finite(row.rms) ?? "n/a"}; transient_density=${finite(row.transient_density) ?? "n/a"}`,
    source: "MUSICAL_ANALYSIS",
  })));
  const core = {
    contract: MUSIC_LISTENING_EVIDENCE_CONTRACT,
    creative_project_id: projectId,
    master_asset_id: masterId,
    version_id: versionId,
    measured,
    regions: [...dynamicRegions, ...reviewRegions(reviews)].slice(0, MAX_REGIONS),
    observations: reviewObservations(reviews),
    reviewed_at: text(reviewed_at, 80) || null,
    source_audio_measured: analysis.source_audio_measured === true,
    mutation_authorized: false,
    publication_authorized: false,
  };
  return Object.freeze({ ...core, evidence_fingerprint: fingerprint(core) });
}

export function listeningEvidenceStatus(evidence = {}, current = {}) {
  const source = object(evidence);
  const activeMaster = text(current.current_master_asset_id, 180);
  const activeVersion = text(current.current_version_id || activeMaster, 180);
  const valid = source.contract === MUSIC_LISTENING_EVIDENCE_CONTRACT && text(source.evidence_fingerprint, 80);
  const currentMatch = Boolean(valid && activeMaster && activeVersion && text(source.master_asset_id, 180) === activeMaster && text(source.version_id, 180) === activeVersion);
  return {
    valid: Boolean(valid),
    current: currentMatch,
    stale: Boolean(valid && !currentMatch),
    mutation_authorized: false,
    publication_authorized: false,
  };
}

export const CreativeMusicListeningEvidenceRuntime = Object.freeze({
  contract: MUSIC_LISTENING_EVIDENCE_CONTRACT,
  build: buildMusicListeningEvidence,
  status: listeningEvidenceStatus,
});

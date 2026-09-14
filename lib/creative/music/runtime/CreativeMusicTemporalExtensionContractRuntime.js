export const MUSIC_TEMPORAL_EXTENSION_CONTRACT = "AVANTIQO_MUSIC_TEMPORAL_EXTENSION_V1";

const STRATEGY = "XL_TURBO_REPAINT_RIGHT_OUTPAINT";
const MIN_EXTENSION_SECONDS = 5;
const MAX_EXTENSION_SECONDS = 120;
const DEFAULT_EXTENSION_SECONDS = 30;
const MIN_OVERLAP_SECONDS = 1;
const MAX_OVERLAP_SECONDS = 12;
const DEFAULT_OVERLAP_SECONDS = 4;

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max, fallback) { return Math.max(min, Math.min(max, finite(value, fallback))); }

export function buildMusicTemporalExtensionContract(input = {}) {
  const extensionSeconds = clamp(input.extension_seconds ?? input.extend_seconds, MIN_EXTENSION_SECONDS, MAX_EXTENSION_SECONDS, DEFAULT_EXTENSION_SECONDS);
  const overlapSeconds = clamp(input.continuity_overlap_seconds ?? input.overlap_seconds, MIN_OVERLAP_SECONDS, MAX_OVERLAP_SECONDS, DEFAULT_OVERLAP_SECONDS);
  return Object.freeze({
    contract: MUSIC_TEMPORAL_EXTENSION_CONTRACT,
    capability: "ai.audio.extend",
    task_type: "repaint",
    strategy: STRATEGY,
    source_asset_id: text(input.source_asset_id || input.master_asset_id) || null,
    source_version_id: text(input.source_version_id || input.version_id || input.master_version_id) || null,
    extension_seconds: extensionSeconds,
    continuity_overlap_seconds: overlapSeconds,
    source_duration_measured_by_worker: true,
    right_padding_outpaint_required: true,
    preserve_source_before_overlap: true,
    replace_existing_master: false,
    creates_new_version: true,
    source_rights_confirmation_required: true,
    current_master_binding_required: true,
    post_render_musical_analysis_required: true,
    post_render_dailies_required: true,
    post_render_destination_mastering_required: true,
    post_render_release_manifest_required: true,
    publication_authorized: false,
  });
}

export function validateMusicTemporalExtensionResult({ contract = {}, result = {} } = {}) {
  const sourceDuration = finite(result.source_duration_seconds);
  const actualDuration = finite(result.duration_seconds);
  const effectiveExtension = finite(result.extension_seconds_effective);
  const failures = [];
  if (contract.contract !== MUSIC_TEMPORAL_EXTENSION_CONTRACT) failures.push("MUSIC_EXTEND_CONTRACT_REQUIRED");
  if (result.capability !== "ai.audio.extend") failures.push("MUSIC_EXTEND_CAPABILITY_MISMATCH");
  if (result.task_type !== "repaint") failures.push("MUSIC_EXTEND_TASK_TYPE_MISMATCH");
  if (result.temporal_extend_strategy !== STRATEGY) failures.push("MUSIC_EXTEND_STRATEGY_MISMATCH");
  if (sourceDuration === null || actualDuration === null || actualDuration <= sourceDuration + 0.5) failures.push("MUSIC_TEMPORAL_EXTENSION_NOT_OBSERVED");
  if (effectiveExtension === null || effectiveExtension < 1) failures.push("MUSIC_EXTENSION_DURATION_EVIDENCE_REQUIRED");
  return Object.freeze({ contract: "AVANTIQO_MUSIC_TEMPORAL_EXTENSION_RESULT_V1", passed: failures.length === 0, failures, temporal_extension_observed: failures.length === 0, mutation_authorized: false, publication_authorized: false });
}

export const CreativeMusicTemporalExtensionContractRuntime = Object.freeze({ contract: MUSIC_TEMPORAL_EXTENSION_CONTRACT, build: buildMusicTemporalExtensionContract, validateResult: validateMusicTemporalExtensionResult });

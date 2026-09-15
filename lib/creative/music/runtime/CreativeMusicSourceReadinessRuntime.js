const CONTRACT = "AVANTIQO_MUSIC_SOURCE_READINESS_V1";

const SOURCE_KINDS = Object.freeze({
  ISOLATED_VOCAL: "ISOLATED_VOCAL",
  MULTITRACK_STEMS: "MULTITRACK_STEMS",
  MASTERED_FULL_MIX: "MASTERED_FULL_MIX",
  LIVE_RECORDING: "LIVE_RECORDING",
  MONOPHONIC_INSTRUMENT: "MONOPHONIC_INSTRUMENT",
  UNKNOWN: "UNKNOWN",
});

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max, fallback = 0) { return Math.max(min, Math.min(max, finite(value, fallback))); }

function inferSourceKind(input = {}) {
  const explicit = text(input.source_kind).toUpperCase();
  if (Object.values(SOURCE_KINDS).includes(explicit)) return explicit;
  if (input.isolated_vocal === true) return SOURCE_KINDS.ISOLATED_VOCAL;
  if (input.multitrack_stems === true) return SOURCE_KINDS.MULTITRACK_STEMS;
  if (input.monophonic_instrument === true) return SOURCE_KINDS.MONOPHONIC_INSTRUMENT;
  if (input.mastered_mix === true || input.full_mix === true) return SOURCE_KINDS.MASTERED_FULL_MIX;
  if (input.live_recording === true) return SOURCE_KINDS.LIVE_RECORDING;
  return SOURCE_KINDS.UNKNOWN;
}

function scoreReferenceQuality(input = {}, sourceKind) {
  const duration = finite(input.reference_duration_seconds ?? input.duration_seconds, 0);
  const snr = finite(input.snr_db, null);
  const clipping = clamp(input.clipping_ratio, 0, 1, 0);
  const accompaniment = clamp(input.accompaniment_ratio, 0, 1, sourceKind === SOURCE_KINDS.MASTERED_FULL_MIX ? 1 : 0);
  const reverb = clamp(input.reverb_ratio, 0, 1, 0);
  let score = 100;
  if (duration < 8) score -= 40;
  else if (duration < 15) score -= 22;
  else if (duration < 25) score -= 10;
  if (snr !== null && snr < 20) score -= Math.min(25, (20 - snr) * 1.25);
  score -= clipping * 45;
  score -= accompaniment * 42;
  score -= reverb * 15;
  if (sourceKind === SOURCE_KINDS.MASTERED_FULL_MIX) score = Math.min(score, 45);
  if (sourceKind === SOURCE_KINDS.UNKNOWN) score = Math.min(score, 55);
  return Math.round(Math.max(0, score) * 100) / 100;
}

function operationRules(operation, sourceKind, qualityScore, input = {}) {
  const blockers = [];
  const warnings = [];
  const requirements = [];
  let independentReviewRequired = true;

  if (operation === "singing_voice_identity") {
    requirements.push("AUTHORIZED_SINGER_REFERENCE", "CLEAN_ISOLATED_VOCAL_REFERENCE", "IDENTITY_FIDELITY_REVIEW");
    if (sourceKind !== SOURCE_KINDS.ISOLATED_VOCAL) blockers.push("CLEAN_ISOLATED_VOCAL_REFERENCE_REQUIRED");
    if (finite(input.reference_duration_seconds ?? input.duration_seconds, 0) < 15) blockers.push("REFERENCE_DURATION_TOO_SHORT");
    if (qualityScore < 82) blockers.push("REFERENCE_QUALITY_BELOW_IDENTITY_THRESHOLD");
  } else if (["pitch_tuning", "timing_correction"].includes(operation)) {
    requirements.push("ISOLATED_OR_MONOPHONIC_SOURCE", "FORMANT_OR_TRANSIENT_PRESERVATION");
    if (![SOURCE_KINDS.ISOLATED_VOCAL, SOURCE_KINDS.MONOPHONIC_INSTRUMENT, SOURCE_KINDS.MULTITRACK_STEMS].includes(sourceKind)) {
      blockers.push("ISOLATED_OR_MONOPHONIC_SOURCE_REQUIRED");
    }
  } else if (["remove_vocals", "isolate_vocals", "backing_track", "stem_separation"].includes(operation)) {
    requirements.push("SEPARATOR_BENCHMARK_PASS", "BLEED_AND_DAMAGE_REVIEW");
    if (sourceKind === SOURCE_KINDS.UNKNOWN) warnings.push("SOURCE_KIND_UNKNOWN_REQUIRES_ANALYSIS");
  } else if (["remix", "ai_edit", "extend"].includes(operation)) {
    requirements.push("ORIGINAL_SOURCE_PRESERVED", "INTENDED_VS_RENDERED_DELTA_REVIEW");
    if (input.original_source_preserved === false) blockers.push("ORIGINAL_SOURCE_PRESERVATION_REQUIRED");
  } else if (operation === "audio_cleanup") {
    requirements.push("DIAGNOSTICS_FIRST", "NON_DESTRUCTIVE_RENDER");
    if (input.diagnostics_available === false) warnings.push("DIAGNOSTICS_REQUIRED_BEFORE_REPAIR");
  } else if (["sfx", "foley"].includes(operation)) {
    requirements.push("SYNC_OR_CUE_CONTEXT", "PERCEPTUAL_REVIEW");
  } else if (operation === "quality_review") {
    requirements.push("MULTI_ROLE_LISTENING_PANEL", "TRANSLATION_MATRIX", "INTENDED_VS_RENDERED_REVIEW");
  } else {
    independentReviewRequired = false;
  }

  return { blockers, warnings, requirements, independentReviewRequired };
}

export function assessMusicSourceReadiness(input = {}) {
  const operation = text(input.operation || input.capability_id).toLowerCase();
  if (!operation) throw new Error("CREATIVE_MUSIC_SOURCE_READINESS_OPERATION_REQUIRED");
  const sourceKind = inferSourceKind(input);
  const qualityScore = scoreReferenceQuality(input, sourceKind);
  const rules = operationRules(operation, sourceKind, qualityScore, input);
  return {
    contract: CONTRACT,
    operation,
    source_kind: sourceKind,
    quality_score: qualityScore,
    executable: rules.blockers.length === 0,
    blockers: rules.blockers,
    warnings: rules.warnings,
    requirements: rules.requirements,
    independent_review_required: rules.independentReviewRequired,
    source_must_be_preserved: ["remix", "ai_edit", "extend", "audio_cleanup"].includes(operation),
    reject_before_paid_execution: rules.blockers.length > 0,
  };
}

export const CreativeMusicSourceReadinessRuntime = Object.freeze({
  contract: CONTRACT,
  sourceKinds: SOURCE_KINDS,
  assess: assessMusicSourceReadiness,
});

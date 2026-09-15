const CONTRACT = "AVANTIQO_MUSIC_TRANSFORMATION_INTEGRITY_V1";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

export function buildMusicTransformationIntegrityContract({
  operation,
  source_asset_id,
  source_checksum = null,
  target_range = null,
  source_duration_seconds = null,
} = {}) {
  const op = text(operation).toLowerCase();
  if (!["remix", "ai_edit", "extend"].includes(op)) throw new Error("CREATIVE_MUSIC_TRANSFORMATION_OPERATION_INVALID");
  if (!text(source_asset_id)) throw new Error("CREATIVE_MUSIC_TRANSFORMATION_SOURCE_REQUIRED");
  const duration = finite(source_duration_seconds, null);
  const start = finite(target_range?.start_seconds, null);
  const end = finite(target_range?.end_seconds, null);
  if (op === "ai_edit" && (start === null || end === null || start < 0 || end <= start)) {
    throw new Error("CREATIVE_MUSIC_TRANSFORMATION_TARGET_RANGE_REQUIRED");
  }
  return {
    contract: CONTRACT,
    operation: op,
    source_asset_id: source_asset_id,
    source_checksum,
    source_duration_seconds: duration,
    target_range: start === null ? null : { start_seconds: start, end_seconds: end },
    original_source_preserved: true,
    outside_target_delta_must_be_negligible: op === "ai_edit",
    continuity_review_required: ["ai_edit", "extend"].includes(op),
    musical_identity_review_required: true,
    intended_vs_rendered_review_required: true,
    source_fingerprint_verification_required: true,
    release_blocked_until_integrity_review: true,
  };
}

export function reviewMusicTransformationIntegrity(contract = {}, evidence = {}) {
  if (contract.contract !== CONTRACT) throw new Error("CREATIVE_MUSIC_TRANSFORMATION_INTEGRITY_CONTRACT_REQUIRED");
  const blockers = [];
  if (evidence.source_fingerprint_verified !== true) blockers.push("SOURCE_FINGERPRINT_NOT_VERIFIED");
  if (contract.outside_target_delta_must_be_negligible && evidence.outside_target_delta_passed !== true) blockers.push("OUTSIDE_TARGET_CHANGED");
  if (contract.continuity_review_required && evidence.continuity_passed !== true) blockers.push("CONTINUITY_REVIEW_FAILED");
  if (evidence.musical_identity_passed !== true) blockers.push("MUSICAL_IDENTITY_REVIEW_FAILED");
  if (evidence.intended_vs_rendered_passed !== true) blockers.push("INTENDED_VS_RENDERED_REVIEW_FAILED");
  return {
    contract: `${CONTRACT}_REVIEW`,
    operation: contract.operation,
    passed: blockers.length === 0,
    blockers,
    release_ready: blockers.length === 0,
    publication_authorized: false,
  };
}

export const CreativeMusicTransformationIntegrityRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildMusicTransformationIntegrityContract,
  review: reviewMusicTransformationIntegrity,
});

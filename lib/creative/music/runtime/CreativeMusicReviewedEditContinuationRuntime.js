import { normalizeReviewedMusicEditReference } from "./CreativeMusicReviewedEditReferenceRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_REVIEWED_EDIT_CONTINUATION_V1";
function text(value, max = 1200) { return String(value ?? "").trim().slice(0, max); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function cleanRange(value = {}) {
  const start = Number(value.start_seconds);
  const end = Number(value.end_seconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return null;
  return { start_seconds: start, end_seconds: end };
}

export function validateReviewedMusicEditContinuation(referenceValue = {}, continuationValue = {}) {
  const reference = normalizeReviewedMusicEditReference(referenceValue);
  const continuation = object(continuationValue);
  const payload = object(continuation.payload);
  const range = cleanRange(payload.target_range);
  const valid = Boolean(
    reference.valid &&
    text(continuation.capability_key, 180) === "creative.music.executeWorldClassProduction" &&
    text(continuation.authorization_requirement, 120) === "user_confirmation" &&
    continuation.source_rights_confirmation_required === true &&
    continuation.publication_authorized === false
  );
  const exactMatch = Boolean(
    valid &&
    text(payload.creative_project_id, 180) === reference.creative_project_id &&
    text(payload.master_asset_id, 180) === reference.master_asset_id &&
    text(payload.expected_change_set_fingerprint, 80) === reference.expected_change_set_fingerprint &&
    text(payload.intended_delta) === reference.intended_delta &&
    (payload.allow_protected_overlap === true) === reference.allow_protected_overlap &&
    range &&
    Number(range.start_seconds) === Number(reference.target_range?.start_seconds) &&
    Number(range.end_seconds) === Number(reference.target_range?.end_seconds)
  );
  return {
    contract: CONTRACT,
    valid: exactMatch,
    reference,
    payload: exactMatch ? { ...payload } : null,
    rights_confirmation_required: true,
    publication_authorized: false,
  };
}

export const CreativeMusicReviewedEditContinuationRuntime = Object.freeze({
  contract: CONTRACT,
  validate: validateReviewedMusicEditContinuation,
});

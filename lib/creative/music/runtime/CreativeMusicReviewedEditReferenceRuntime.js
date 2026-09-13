import { createHash } from "node:crypto";

const CONTRACT = "AVANTIQO_MUSIC_REVIEWED_EDIT_REFERENCE_V1";
function text(value, max = 1200) { return String(value ?? "").trim().slice(0, max); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function digest(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").slice(0, 32);
}
function cleanRange(value = {}) {
  const start = Number(value.start_seconds);
  const end = Number(value.end_seconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return null;
  return { start_seconds: start, end_seconds: end, label: text(value.label, 180) || null };
}
export function buildReviewedMusicEditReference(changeSet = {}) {
  if (changeSet.execution_ready !== true) return null;
  const core = {
    contract: CONTRACT,
    creative_project_id: text(changeSet.creative_project_id, 180),
    master_asset_id: text(changeSet.master_asset_id, 180),
    target_range: cleanRange(changeSet.target_range),
    intended_delta: text(changeSet.intended_delta),
    allow_protected_overlap: changeSet.allow_protected_overlap === true,
    expected_change_set_fingerprint: text(changeSet.change_set_fingerprint, 80),
  };
  if (!core.creative_project_id || !core.master_asset_id || !core.target_range || !core.intended_delta || !core.expected_change_set_fingerprint) return null;
  return Object.freeze({ ...core, reviewed_edit_reference_hash: digest(core), publication_authorized: false });
}

export function normalizeReviewedMusicEditReference(value = {}) {
  const core = {
    contract: text(value.contract, 120),
    creative_project_id: text(value.creative_project_id, 180),
    master_asset_id: text(value.master_asset_id, 180),
    target_range: cleanRange(value.target_range),
    intended_delta: text(value.intended_delta),
    allow_protected_overlap: value.allow_protected_overlap === true,
    expected_change_set_fingerprint: text(value.expected_change_set_fingerprint, 80),
  };
  const suppliedHash = text(value.reviewed_edit_reference_hash, 80);
  const valid = core.contract === CONTRACT && suppliedHash && suppliedHash === digest(core);
  return {
    ...core,
    reviewed_edit_reference_hash: suppliedHash || null,
    valid,
    publication_authorized: false,
  };
}

export const CreativeMusicReviewedEditReferenceRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildReviewedMusicEditReference,
  normalize: normalizeReviewedMusicEditReference,
});

export const CREATIVE_POST_ROOM_QUALITY_CONTRACT = "CREATIVE_POST_ROOM_QUALITY_V1";
const FLOOR = 94;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function result(room, failures, evidence = {}) {
  return Object.freeze({
    contract: CREATIVE_POST_ROOM_QUALITY_CONTRACT,
    room,
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    evidence,
  });
}

export function evaluateEditorialRoom({ approved_take_ids = [], assembly = {} } = {}) {
  const failures = [];
  const approved = new Set(list(approved_take_ids).map(text));
  const clips = list(assembly.clips);
  if (!clips.length) failures.push("EDITORIAL_ASSEMBLY_CLIPS_REQUIRED");
  for (const clip of clips) {
    const takeId = text(clip.take_id);
    if (!takeId || !approved.has(takeId)) failures.push(`EDITORIAL_UNAPPROVED_TAKE_FORBIDDEN:${takeId || "missing"}`);
    if (!text(clip.story_reason)) failures.push(`EDITORIAL_STORY_REASON_REQUIRED:${takeId || "missing"}`);
    if (!text(clip.cut_reason)) failures.push(`EDITORIAL_CUT_REASON_REQUIRED:${takeId || "missing"}`);
  }
  if (list(assembly.coverage_gaps).length) failures.push("EDITORIAL_COVERAGE_GAPS_UNRESOLVED");
  if (!text(assembly.pacing_strategy)) failures.push("EDITORIAL_PACING_STRATEGY_REQUIRED");
  return result("EDITORIAL", failures, { approved_take_ids: [...approved], assembly });
}
export function evaluateVfxRoom({ shots = [] } = {}) {
  const failures = [];
  const rows = list(shots);
  if (!rows.length) failures.push("VFX_SHOTS_REQUIRED");
  for (const shot of rows) {
    const id = text(shot.shot_id || shot.id);
    if (!id) failures.push("VFX_SHOT_ID_REQUIRED");
    if (!text(shot.source_digest)) failures.push(`VFX_SOURCE_DIGEST_REQUIRED:${id || "missing"}`);
    if (!text(shot.version_id)) failures.push(`VFX_VERSION_ID_REQUIRED:${id || "missing"}`);
    if (!list(shot.integration_evidence).length) failures.push(`VFX_INTEGRATION_EVIDENCE_REQUIRED:${id || "missing"}`);
    if (shot.approved !== true) failures.push(`VFX_SHOT_NOT_APPROVED:${id || "missing"}`);
  }
  return result("VFX", failures, { shots: rows });
}

export function evaluateColorRoom({ look = {}, shots = [] } = {}) {
  const failures = [];
  for (const field of ["show_look", "highlight_rule", "black_detail_rule", "skin_product_truth_rule", "scene_continuity_rule"]) {
    if (!text(look[field])) failures.push(`COLOR_${field.toUpperCase()}_REQUIRED`);
  }
  const rows = list(shots);
  if (!rows.length) failures.push("COLOR_SHOT_MATCHES_REQUIRED");
  for (const shot of rows) {
    const id = text(shot.shot_id || shot.id);
    const score = number(shot.match_score);
    if (!id) failures.push("COLOR_SHOT_ID_REQUIRED");
    if (score === null || score < FLOOR) failures.push(`COLOR_SHOT_MATCH_BELOW_FLOOR:${id || "missing"}`);
    if (shot.approved !== true) failures.push(`COLOR_SHOT_NOT_APPROVED:${id || "missing"}`);
  }
  return result("COLOR", failures, { look, shots: rows, required_floor: FLOOR });
}
export function evaluateSoundMusicRoom({ sound_world = {}, mix = {} } = {}) {
  const failures = [];
  for (const field of ["signature_sounds", "acoustic_perspective", "silence_strategy", "transition_motifs"]) {
    const value = sound_world[field];
    const valid = Array.isArray(value) ? value.length > 0 : text(value).length >= 12;
    if (!valid) failures.push(`SOUND_WORLD_${field.toUpperCase()}_REQUIRED`);
  }
  if (!text(mix.picture_lock_digest)) failures.push("SOUND_PICTURE_LOCK_DIGEST_REQUIRED");
  if (!list(mix.sync_events).length) failures.push("SOUND_SYNC_EVENTS_REQUIRED");
  const dynamics = number(mix.dynamics_score);
  if (dynamics === null || dynamics < FLOOR) failures.push("SOUND_MIX_DYNAMICS_BELOW_FLOOR");
  if (mix.approved !== true) failures.push("SOUND_MIX_NOT_APPROVED");
  return result("SOUND_MUSIC", failures, { sound_world, mix, required_floor: FLOOR });
}

export function evaluateMasterDirectorReview({ department_verdicts = [], final_repairs = [] } = {}) {
  const failures = [];
  const rows = list(department_verdicts);
  const required = new Set(["DIRECTOR", "EDITOR", "CINEMATOGRAPHY", "POST", "SOUND"]);
  for (const verdict of rows) {
    const family = text(verdict.family).toUpperCase();
    required.delete(family);
    const score = number(verdict.score);
    if (verdict.passed !== true || score === null || score < FLOOR) failures.push(`MASTER_REVIEW_REJECTED:${family || "missing"}`);
    if (!list(verdict.evidence).length) failures.push(`MASTER_REVIEW_EVIDENCE_REQUIRED:${family || "missing"}`);
  }
  for (const family of required) failures.push(`MASTER_REVIEW_FAMILY_REQUIRED:${family}`);
  if (list(final_repairs).length) failures.push("MASTER_REVIEW_FINAL_REPAIRS_OUTSTANDING");
  return result("MASTER_DIRECTOR_REVIEW", failures, { department_verdicts: rows, final_repairs, required_floor: FLOOR });
}
export function evaluateReleaseRoom({ master_qc = {}, rights = {}, delivery = {} } = {}) {
  const failures = [];
  for (const field of ["checksum_verified", "duration_verified", "audio_verified", "video_verified", "no_rejected_assets_in_master"]) {
    if (master_qc[field] !== true) failures.push(`RELEASE_MASTER_QC_REQUIRED:${field}`);
  }
  if (rights.cleared !== true) failures.push("RELEASE_RIGHTS_CLEARANCE_REQUIRED");
  if (!list(rights.evidence).length) failures.push("RELEASE_RIGHTS_EVIDENCE_REQUIRED");
  if (delivery.approved !== true) failures.push("RELEASE_DELIVERY_APPROVAL_REQUIRED");
  if (!text(delivery.profile_id)) failures.push("RELEASE_DELIVERY_PROFILE_REQUIRED");
  if (!text(delivery.master_digest)) failures.push("RELEASE_MASTER_DIGEST_REQUIRED");
  return result("RELEASE", failures, { master_qc, rights, delivery });
}

export const CreativePostRoomQualityRuntime = Object.freeze({
  contract: CREATIVE_POST_ROOM_QUALITY_CONTRACT,
  floor: FLOOR,
  evaluateEditorial: evaluateEditorialRoom,
  evaluateVfx: evaluateVfxRoom,
  evaluateColor: evaluateColorRoom,
  evaluateSoundMusic: evaluateSoundMusicRoom,
  evaluateMasterDirectorReview,
  evaluateRelease: evaluateReleaseRoom,
});
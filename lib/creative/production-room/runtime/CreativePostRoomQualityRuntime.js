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

  if (clips.length >= 4) {
    const durations = clips.map((clip) => number(clip.duration_seconds)).filter((value) => value !== null && value > 0);
    if (durations.length !== clips.length) failures.push("EDITORIAL_CLIP_DURATION_REQUIRED");
    else {
      const bands = new Set(durations.map((value) => Math.round(value * 4) / 4));
      const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
      const variance = durations.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / durations.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
      if (bands.size < 3 || cv < 0.16) failures.push("EDITORIAL_METRONOMIC_PACING_FORBIDDEN");
    }
    const scaleRoles = clips.map((clip) => text(clip.scale_role).toUpperCase());
    if (scaleRoles.some((value) => !value)) failures.push("EDITORIAL_SCALE_ROLE_REQUIRED");
    let scaleRun = 1;
    for (let index = 1; index < scaleRoles.length; index += 1) {
      scaleRun = scaleRoles[index] && scaleRoles[index] === scaleRoles[index - 1] ? scaleRun + 1 : 1;
      if (scaleRun > 2) failures.push("EDITORIAL_REPEATED_SCALE_FORBIDDEN");
    }
    const cameraBehaviors = clips.map((clip) => text(clip.camera_behavior).toUpperCase());
    if (cameraBehaviors.some((value) => !value)) failures.push("EDITORIAL_CAMERA_BEHAVIOR_REQUIRED");
    let cameraRun = 1;
    for (let index = 1; index < cameraBehaviors.length; index += 1) {
      cameraRun = cameraBehaviors[index] && cameraBehaviors[index] === cameraBehaviors[index - 1] ? cameraRun + 1 : 1;
      if (cameraRun > 2) failures.push("EDITORIAL_REPEATED_CAMERA_BEHAVIOR_FORBIDDEN");
    }
    if (clips.slice(1).some((clip) => !text(clip.transition_motivation))) failures.push("EDITORIAL_TRANSITION_MOTIVATION_REQUIRED");
    const energies = clips.map((clip) => number(clip.energy_level)).filter((value) => value !== null);
    if (energies.length !== clips.length) failures.push("EDITORIAL_ENERGY_LEVEL_REQUIRED");
    else if (Math.max(...energies) - Math.min(...energies) < 25) failures.push("EDITORIAL_ENERGY_CURVE_TOO_FLAT");
    if (assembly.silence_or_density_drop_present !== true && !text(assembly.silence_waiver_reason)) failures.push("EDITORIAL_SILENCE_OR_DENSITY_DROP_REQUIRED");
    if (assembly.payoff_build_verified !== true) failures.push("EDITORIAL_PAYOFF_BUILD_REQUIRED");
  }
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

export function evaluateMasterDirectorReview({ department_verdicts = [], final_repairs = [], intent_fidelity = {} } = {}) {
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

  const intentFamilies = ["story", "visual_journey", "frame_design", "dp_intent", "physical_world", "dailies", "editorial"];
  for (const family of intentFamilies) {
    const proof = intent_fidelity[family] || {};
    const score = number(proof.score);
    if (proof.passed !== true || score === null || score < FLOOR) failures.push(`MASTER_INTENT_FIDELITY_REJECTED:${family.toUpperCase()}`);
    if (!list(proof.evidence).length) failures.push(`MASTER_INTENT_FIDELITY_EVIDENCE_REQUIRED:${family.toUpperCase()}`);
  }
  if (intent_fidelity.temporal_continuity_sealed !== true) failures.push("MASTER_TEMPORAL_CONTINUITY_SEAL_REQUIRED");
  if (intent_fidelity.bounded_repairs_resolved !== true) failures.push("MASTER_BOUNDED_REPAIRS_RESOLUTION_REQUIRED");
  if (intent_fidelity.vfx_inheritance_verified !== true) failures.push("MASTER_VFX_INHERITANCE_REQUIRED");

  return result("MASTER_DIRECTOR_REVIEW", failures, { department_verdicts: rows, final_repairs, intent_fidelity, required_floor: FLOOR });
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
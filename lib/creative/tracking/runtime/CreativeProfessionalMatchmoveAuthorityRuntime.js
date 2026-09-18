import crypto from "node:crypto";

export const AVANTIQO_PROFESSIONAL_MATCHMOVE_AUTHORITY_CONTRACT =
  "AVANTIQO_PROFESSIONAL_MATCHMOVE_AUTHORITY_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function evaluateProfessionalMatchmove({
  solve = {},
  scale_reference = null,
  origin = null,
  survey_points = [],
  object_tracks = [],
  maximum_reprojection_error_px = 1.5,
} = {}) {
  const blockers = [];
  const intrinsics = solve.camera_intrinsics || {};
  const parallax = solve.parallax_evidence || {};
  const rolling = solve.rolling_shutter_model || {};
  const samples = list(solve.samples);
  const calibrated = intrinsics.calibrated === true;
  const autoConfidence = finite(intrinsics.auto_focal_confidence, 0);
  const medianRatio = finite(parallax.median_pose_inlier_ratio, 0);
  const reprojection = finite(solve.reprojection_error_rms_px, null);
  if (!calibrated) blockers.push("MATCHMOVE_PRO_INTRINSICS_REQUIRED");
  if (intrinsics.calibration_source === "AUTO_FOCAL_SEARCH" && autoConfidence < 0.58) {
    blockers.push("MATCHMOVE_PRO_AUTO_FOCAL_CONFIDENCE_LOW");
  }
  if (parallax.sufficient !== true || medianRatio < 0.45) {
    blockers.push("MATCHMOVE_PRO_PARALLAX_REQUIRED");
  }
  if (!solve.lens_model) blockers.push("MATCHMOVE_PRO_LENS_MODEL_REQUIRED");
  if (rolling.detected === true && rolling.compensation_required !== true) {
    blockers.push("MATCHMOVE_PRO_ROLLING_SHUTTER_COMPENSATION_REQUIRED");
  }
  if (!scale_reference?.known_distance_m) blockers.push("MATCHMOVE_PRO_WORLD_SCALE_REQUIRED");
  if (!origin?.axis || !Array.isArray(origin?.point)) blockers.push("MATCHMOVE_PRO_WORLD_ORIGIN_REQUIRED");
  if (reprojection !== null && reprojection > maximum_reprojection_error_px) {
    blockers.push("MATCHMOVE_PRO_REPROJECTION_ERROR_TOO_HIGH");
  }
  const body = {
    contract: AVANTIQO_PROFESSIONAL_MATCHMOVE_AUTHORITY_CONTRACT,
    camera_intrinsics: intrinsics,
    lens_model: solve.lens_model || null,
    rolling_shutter_model: rolling,
    parallax_evidence: parallax,
    sample_count: samples.length,
    scale_reference,
    origin,
    survey_points: list(survey_points),
    object_tracks: list(object_tracks),
    maximum_reprojection_error_px,
    reprojection_error_rms_px: reprojection,
    authority: {
      pixel_locked_compositing_allowed: blockers.length === 0,
      world_space_cgi_allowed: blockers.length === 0,
      usd_camera_export_allowed: blockers.length === 0,
      independent_object_solve_allowed: list(object_tracks).length > 0,
    },
    policy: {
      scale_and_origin_required_for_professional_world_space: true,
      automatic_focal_solve_must_expose_confidence: true,
      rolling_shutter_must_not_be_ignored_when_detected: true,
      residual_error_must_be_recorded_when_available: true,
    },
  };
  return {
    ...body,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    authority_hash: hash(body),
  };
}

export const CreativeProfessionalMatchmoveAuthorityRuntime = Object.freeze({
  contract: AVANTIQO_PROFESSIONAL_MATCHMOVE_AUTHORITY_CONTRACT,
  evaluate: evaluateProfessionalMatchmove,
});

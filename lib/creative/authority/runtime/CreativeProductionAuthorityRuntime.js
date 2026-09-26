import crypto from "node:crypto";

export const CREATIVE_PRODUCTION_AUTHORITY_CONTRACT =
  "CREATIVE_PRODUCTION_AUTHORITY_V1";

function text(value) {
  return String(value ?? "").trim();
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function addFailure(failures, condition, code) {
  if (condition) failures.push(code);
}

export function evaluateCreativeProductionAuthority({
  asset_node = {},
  downstream_role = null,
} = {}) {
  const metadata = object(asset_node.metadata);
  const authority = object(metadata.image_asset_authority);
  const role = text(downstream_role).toUpperCase();
  const failures = [];
  const warnings = [];

  addFailure(failures, asset_node.status !== "APPROVED", "ASSET_STATUS_NOT_APPROVED");
  addFailure(failures, asset_node.review?.approved !== true, "ASSET_REVIEW_NOT_APPROVED");
  addFailure(failures, metadata.image_asset_perceptual_qc_sealed !== true, "PERCEPTUAL_QC_NOT_SEALED");
  addFailure(failures, metadata.release_approved !== true, "RELEASE_NOT_APPROVED");
  addFailure(failures, metadata.localized_repair_superseded === true, "ASSET_SUPERSEDED");
  addFailure(failures, Boolean(metadata.superseded_by_localized_repair_asset_node_id), "ASSET_SUPERSEDED");
  addFailure(failures, metadata.image_asset_duplicate_quarantined === true, "DUPLICATE_QUARANTINED");
  addFailure(failures, metadata.image_asset_role_validation_passed === false, "ROLE_VALIDATION_FAILED");
  addFailure(failures, metadata.image_asset_exploration_selection_failed === true, "EXPLORATION_SELECTION_FAILED");
  addFailure(failures, metadata.image_authority_invalidated === true, "AUTHORITY_INVALIDATED");
  addFailure(failures, metadata.authority_stale === true, "AUTHORITY_STALE");
  addFailure(failures, metadata.image_authority_invalidated_upstream === true, "UPSTREAM_AUTHORITY_INVALIDATED");
  addFailure(failures, metadata.image_foundation_stale === true, "FOUNDATION_AUTHORITY_STALE");
  addFailure(failures, metadata.image_multiview_parent_stale === true, "MULTIVIEW_PARENT_STALE");
  addFailure(failures, metadata.image_derivative_parent_stale === true, "DERIVATIVE_PARENT_STALE");
  addFailure(failures, metadata.material_truth_source_stale === true, "MATERIAL_TRUTH_STALE");
  addFailure(failures, !text(asset_node.url), "ASSET_URL_REQUIRED");

  if (metadata.image_asset_exploration_group_id) {
    addFailure(
      failures,
      metadata.image_asset_exploration_selected !== true,
      "EXPLORATION_SELECTION_REQUIRED",
    );
  }

  const departmentVetoes = object(metadata.department_vetoes);
  const activeVetoes = Object.entries(departmentVetoes)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (activeVetoes.length) failures.push("DEPARTMENT_VETO_ACTIVE");

  if (metadata.film_level_review_required === true) {
    addFailure(
      failures,
      metadata.film_level_review_passed !== true,
      "FILM_LEVEL_REVIEW_REQUIRED",
    );
  }

  if (role === "VIDEO") {
    addFailure(
      failures,
      metadata.approved_for_video_source !== true ||
        authority.approved_for_video_source !== true,
      "VIDEO_SOURCE_AUTHORITY_REQUIRED",
    );
  }
  if (role === "VFX") {
    addFailure(
      failures,
      metadata.approved_for_vfx_source !== true &&
        authority.approved_for_vfx_source !== true,
      "VFX_SOURCE_AUTHORITY_REQUIRED",
    );
  }
  if (role === "COMPOSITING") {
    addFailure(
      failures,
      metadata.approved_for_compositing_source !== true &&
        authority.approved_for_compositing_source !== true,
      "COMPOSITING_SOURCE_AUTHORITY_REQUIRED",
    );
  }

  if (metadata.cross_shot_novelty_score != null) {
    const novelty = Number(metadata.cross_shot_novelty_score);
    if (Number.isFinite(novelty) && novelty < 0.5) {
      failures.push("CROSS_SHOT_NOVELTY_BELOW_THRESHOLD");
    }
  } else {
    warnings.push("CROSS_SHOT_NOVELTY_NOT_EVALUATED");
  }

  const uniqueFailures = [...new Set(failures)];
  const evidence = {
    asset_node_id: asset_node.id || null,
    downstream_role: role || null,
    perceptual_passed: metadata.image_asset_perceptual_qc_sealed === true,
    role_valid: metadata.image_asset_role_validation_passed !== false,
    duplicate_clear: metadata.image_asset_duplicate_quarantined !== true,
    freshness_passed: !uniqueFailures.some((failure) => failure.includes("STALE") || failure.includes("INVALIDATED")),
    film_level_passed: metadata.film_level_review_required !== true || metadata.film_level_review_passed === true,
    department_vetoes: activeVetoes,
  };

  return Object.freeze({
    contract: CREATIVE_PRODUCTION_AUTHORITY_CONTRACT,
    passed: uniqueFailures.length === 0,
    eligible_for_video_source: role === "VIDEO" && uniqueFailures.length === 0,
    eligible_for_vfx_source: role === "VFX" && uniqueFailures.length === 0,
    eligible_for_compositing: role === "COMPOSITING" && uniqueFailures.length === 0,
    hard_failures: uniqueFailures,
    warnings,
    evidence,
    authority_digest: hash({
      contract: CREATIVE_PRODUCTION_AUTHORITY_CONTRACT,
      failures: uniqueFailures,
      evidence,
    }),
    zero_provider_calls: true,
  });
}

export const CreativeProductionAuthorityRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_AUTHORITY_CONTRACT,
  evaluate: evaluateCreativeProductionAuthority,
});

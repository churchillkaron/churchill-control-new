import {
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

const REQUIRED_TRUTH = Object.freeze({
  real_shuffleboard_asset_id: "4357898f-23fd-418f-af8d-89e3719c0969",
  real_pool_electronic_darts_asset_id: "7bc9e891-e3d0-4b03-8b53-95ff255f31c6",
  exact_logo_asset_id: "f2e57100-1b78-43c9-b080-1c7945fc4d23",
});

const FORBIDDEN_FINAL_ASSETS = new Set([
  "23756544-16cd-4d76-9e26-2e11bdde8c23", // old stylized shuffleboard
]);

const APPROVED_BASELINE = Object.freeze({
  wine_universe: true,
  steam_into_bar: true,
});

const REQUIRED_REPAIRS = Object.freeze([
  "ice_time_freeze_authentic_pool_landing",
  "shuffleboard_to_dart_editorial_match_cut",
  "electric_dart_flight_authentic_electronic_darts",
  "frozen_night_hero_authentic_composite",
  "wine_loop_return_authentic_payoff",
  "sound_design_grammar",
]);

function text(value) {
  return String(value ?? "").trim();
}

function truthIds(input = {}) {
  return new Set(
    [
      input.real_shuffleboard_asset_id,
      input.real_pool_electronic_darts_asset_id,
      input.exact_logo_asset_id,
      ...(Array.isArray(input.asset_ids) ? input.asset_ids : []),
    ].map(text).filter(Boolean),
  );
}

export function evaluateChurchillV3MasterReadiness(input = {}) {
  assertChurchillNightStoryIntegrity();

  const failures = [];
  const warnings = [];
  const ids = truthIds(input);
  const repairs = input.repairs || {};
  const approvals = input.approvals || {};

  if (input.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    failures.push("CANONICAL_STORY_VERSION_MISMATCH");
  }

  for (const [key, id] of Object.entries(REQUIRED_TRUTH)) {
    if (!ids.has(id)) failures.push(`MISSING_TRUTH_ASSET:${key}:${id}`);
  }

  for (const id of ids) {
    if (FORBIDDEN_FINAL_ASSETS.has(id)) failures.push(`FORBIDDEN_FINAL_ASSET:${id}`);
  }

  for (const [key, required] of Object.entries(APPROVED_BASELINE)) {
    if (required && approvals[key] !== true) failures.push(`APPROVAL_REQUIRED:${key}`);
  }

  for (const repair of REQUIRED_REPAIRS) {
    if (repairs[repair] !== true) failures.push(`REPAIR_REQUIRED:${repair}`);
  }

  if (input.generated_people_present === true) failures.push("GENERATED_PEOPLE_FORBIDDEN");
  if (input.traditional_dartboard_present === true) failures.push("TRADITIONAL_DARTBOARD_FORBIDDEN");
  if (input.generic_venue_replacement_present === true) failures.push("GENERIC_VENUE_REPLACEMENT_FORBIDDEN");
  if (input.old_r1_dart_final === true) failures.push("OLD_R1_DART_FINAL_FORBIDDEN");
  if (input.old_r1_frozen_hero_final === true) failures.push("OLD_R1_FROZEN_HERO_FINAL_FORBIDDEN");
  if (input.master_duration_seconds && Number(input.master_duration_seconds) !== 90) failures.push("MASTER_DURATION_MUST_BE_90_SECONDS");
  if (input.visual_review_complete !== true) failures.push("VISUAL_REVIEW_REQUIRED");
  if (input.sound_review_complete !== true) failures.push("SOUND_REVIEW_REQUIRED");
  if (input.publication_authorized === true) warnings.push("PUBLICATION_MUST_REMAIN_FALSE_UNTIL_USER_APPROVAL");

  return {
    ready: failures.length === 0,
    failures,
    warnings,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    required_truth_assets: REQUIRED_TRUTH,
    approved_baseline: APPROVED_BASELINE,
    required_repairs: REQUIRED_REPAIRS,
    master_render_authorized: failures.length === 0,
    publication_authorized: false,
  };
}

export const CHURCHILL_V3_MASTER_READINESS = Object.freeze({
  required_truth_assets: REQUIRED_TRUTH,
  forbidden_final_assets: Object.freeze([...FORBIDDEN_FINAL_ASSETS]),
  approved_baseline: APPROVED_BASELINE,
  required_repairs: REQUIRED_REPAIRS,
});

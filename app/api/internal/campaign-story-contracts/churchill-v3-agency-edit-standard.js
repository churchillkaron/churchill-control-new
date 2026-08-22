import {
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

export const CHURCHILL_V3_AGENCY_EDIT_STANDARD_VERSION =
  "CHURCHILL_V3_WORLD_CLASS_AGENCY_EDIT_V1";

const AUTHENTIC = Object.freeze({
  logo_exact: "f2e57100-1b78-43c9-b080-1c7945fc4d23",
  logo_motion: "861dd782-483d-4f1d-b785-0be1d6773bec",
  entrance_video: "d4dbb4f5-c2b8-41f9-87db-6cbc2f9a4a65",
  dining_video: "fb7e06e3-77cb-49f3-9f11-9fa59887b6be",
  dinner_social: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  pool_video: "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
  pool_still: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard_truth: "4357898f-23fd-418f-af8d-89e3719c0969",
  electronic_darts_truth: "7bc9e891-e3d0-4b03-8b53-95ff255f31c6",
  singer_identity: "370a3030-8656-4b28-934f-6653d5eaf3c8",
  band_identity: "cb027610-625c-4751-99a0-6a41b3597237",
  stage_video: "dcd86649-42f8-4f7a-be91-00c456eb940d",
  score: "4de3ecea-6c1a-4d28-a48d-ae8d246237f5",
});

const RELEASE_BLOCKERS = Object.freeze([
  "VISIBLE_GENERATIVE_FACE_DRIFT",
  "VISIBLE_ANATOMY_OR_HAND_DRIFT",
  "VISIBLE_OBJECT_OR_VENUE_GEOMETRY_DRIFT",
  "VISIBLE_TEXTURE_BOILING_OR_SURFACE_CRAWL",
  "VISIBLE_REFLECTION_OR_SHADOW_INSTABILITY",
  "VISIBLE_AI_MORPH_TRANSITION",
  "GENERIC_LUXURY_VENUE_REPLACEMENT",
  "GENERATED_BRAND_MARK_OR_GENERATED_TEXT",
  "TRADITIONAL_NON_ELECTRONIC_DARTBOARD",
  "GREEN_OR_GENERIC_POOL_REPLACEMENT",
  "SLIDESHOW_STYLE_MANY_REALITIES",
  "SCORE_ONLY_FINAL_MIX",
  "UNREVIEWED_GENERATED_PEOPLE",
  "UNREVIEWED_GENERATED_VENUE_GEOMETRY",
]);

const BEATS = Object.freeze({
  wine_universe: Object.freeze({
    status: "LOCKED_APPROVED_PHYSICS_PLATE",
    generation_allowed: false,
    preserve: ["approved wine physics", "moving miniature reality payoff"],
  }),
  steam_into_bar: Object.freeze({
    status: "LOCKED_APPROVED_PHYSICS_PLATE",
    generation_allowed: false,
    preserve: ["approved steam transition", "authentic bar atmosphere"],
  }),
  ice_time_freeze: Object.freeze({
    status: "DETERMINISTIC_EDITORIAL_REPAIR_REQUIRED",
    source_rule: "APPROVED_ICE_PHYSICS_PLUS_AUTHENTIC_ORANGE_POOL",
    generation_allowed: false,
    transition_rule: "REFRACTION_OR_OCCLUSION_NOT_VISIBLE_MORPH",
    review_required: true,
  }),
  pool_activation: Object.freeze({
    status: "AUTHENTIC_MOTION_REQUIRED",
    primary_asset_id: AUTHENTIC.pool_video,
    generated_room_allowed: false,
    pool_identity: "ORANGE_AMBER_REGISTERED_CHURCHILL_GEOMETRY",
  }),
  pool_to_shuffleboard: Object.freeze({
    status: "APPROVED_R1_SHUFFLEBOARD_MOTION_PLUS_AUTHENTIC_POOL_ENTRY",
    transition_rule: "MATCH_CUT_OR_FOREGROUND_OCCLUSION",
    visible_object_morph_allowed: false,
  }),
  shuffleboard_to_dart: Object.freeze({
    status: "DETERMINISTIC_MATCH_CUT_REQUIRED",
    transition_rule: "PUCK_OR_FOREGROUND_OCCLUDES_FRAME_THEN_DART_EXISTS_AFTER_CUT",
    visible_object_morph_allowed: false,
    generated_hand_allowed: false,
  }),
  electric_dart_flight: Object.freeze({
    status: "AUTHENTIC_GEOMETRY_PLUS_DETERMINISTIC_DART_ACTION",
    room_generation_allowed: false,
    traditional_dartboard_allowed: false,
    electronic_cabinet_and_screen_visibility_required: true,
    camera_rule: "RESTRAINED_CAMERA_DART_SUPPLIES_SPEED",
    neon_trail_allowed: false,
  }),
  band_activates_churchill: Object.freeze({
    status: "AUTHENTIC_MOTION_AND_IDENTITY_REQUIRED",
    primary_asset_id: AUTHENTIC.stage_video,
    singer_identity_asset_id: AUTHENTIC.singer_identity,
    band_identity_asset_id: AUTHENTIC.band_identity,
    generated_performer_allowed: false,
    role: "EMOTIONAL_RELEASE_NOT_EFFECT_DEMO",
  }),
  many_realities_same_night: Object.freeze({
    status: "AUTHENTIC_MOTION_MONTAGE_REQUIRED",
    still_only_sequence_allowed: false,
    generated_scene_allowed: false,
    required_motion_sources: [
      AUTHENTIC.dining_video,
      AUTHENTIC.pool_video,
      AUTHENTIC.stage_video,
    ],
    supporting_truth_sources: [
      AUTHENTIC.dinner_social,
      AUTHENTIC.shuffleboard_truth,
      AUTHENTIC.electronic_darts_truth,
    ],
    editing_rule: "RHYTHMIC_L_CUTS_J_CUTS_MATCH_ACTION_AND_SOUND_BRIDGES",
    target_shot_duration_seconds: Object.freeze({ min: 0.55, max: 1.5 }),
    slideshow_allowed: false,
  }),
  frozen_night_hero: Object.freeze({
    status: "DETERMINISTIC_AUTHENTIC_COMPOSITE_REQUIRED",
    duration_seconds: 7,
    full_scene_ai_generation_allowed: false,
    generated_people_allowed: false,
    generated_venue_allowed: false,
    camera_rule: "ONE_CONTINUOUS_FEELING_MOVE_THROUGH_AUTHENTIC_LAYERS",
    moving_elements: ["ONE_WINE_DROPLET_ONLY"],
    frozen_elements: [
      "REAL_GUEST_DINNER_ACTION",
      "REAL_POOL_ACTION",
      "REAL_SHUFFLEBOARD_PUCK",
      "REAL_ELECTRONIC_DART_ACTION",
      "REAL_SINGER_AND_BAND",
    ],
    transition_rule: "FOREGROUND_OCCLUSION_REFLECTION_GLASS_SHADOW_MATCHED_GEOMETRY",
    split_screen_allowed: false,
    collage_aesthetic_allowed: false,
    review_required: true,
  }),
  wine_loop_return: Object.freeze({
    status: "DETERMINISTIC_LOOP_PAYOFF_REQUIRED",
    generation_allowed: false,
    structure: "AUTHENTIC_DINNER_RETURNS_INTO_APPROVED_WINE_UNIVERSE",
    static_still_only_allowed: false,
    review_required: true,
  }),
});

export const CHURCHILL_V3_AGENCY_EDIT_STANDARD = Object.freeze({
  version: CHURCHILL_V3_AGENCY_EDIT_STANDARD_VERSION,
  canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  quality_standard: "WORLD_CLASS_PRESTIGE_COMMERCIAL",
  target_feel: "REAL_HIGH_END_AGENCY_FILM_NOT_AI_DEMO",
  authentic_assets: AUTHENTIC,
  release_blockers: RELEASE_BLOCKERS,
  beats: BEATS,
  master_rules: Object.freeze({
    exact_logo_post_composite_required: true,
    generated_text_allowed: false,
    generated_logo_allowed: false,
    authentic_motion_dominant: true,
    visible_ai_transformation_count_max: 0,
    weak_link_quality_gate_required: true,
    forensic_temporal_review_required: true,
    native_ambience_required: true,
    score_only_mix_allowed: false,
    sound_bridge_editing_required: true,
    bullseye_near_silence_required: true,
    final_user_approval_required: true,
    publication_authorized: false,
  }),
});

export function assertChurchillV3AgencyEditStandard() {
  assertChurchillNightStoryIntegrity();
  const standard = CHURCHILL_V3_AGENCY_EDIT_STANDARD;
  if (standard.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_AGENCY_EDIT_STORY_VERSION_MISMATCH");
  }
  if (standard.master_rules.visible_ai_transformation_count_max !== 0) {
    throw new Error("CHURCHILL_V3_VISIBLE_AI_TRANSFORMATION_FORBIDDEN");
  }
  if (standard.beats.many_realities_same_night.still_only_sequence_allowed !== false) {
    throw new Error("CHURCHILL_V3_MANY_REALITIES_SLIDESHOW_FORBIDDEN");
  }
  if (standard.beats.frozen_night_hero.full_scene_ai_generation_allowed !== false) {
    throw new Error("CHURCHILL_V3_FROZEN_HERO_FULL_SCENE_AI_FORBIDDEN");
  }
  if (standard.master_rules.score_only_mix_allowed !== false) {
    throw new Error("CHURCHILL_V3_SCORE_ONLY_MIX_FORBIDDEN");
  }
  return true;
}

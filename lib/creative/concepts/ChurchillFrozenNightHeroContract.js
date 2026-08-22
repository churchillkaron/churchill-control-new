import {
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

export const CHURCHILL_FROZEN_NIGHT_HERO_VERSION = "CHURCHILL_FROZEN_NIGHT_HERO_AUTHENTIC_V1";

export const CHURCHILL_FROZEN_NIGHT_HERO = Object.freeze({
  version: CHURCHILL_FROZEN_NIGHT_HERO_VERSION,
  canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  duration_seconds: 7,
  philosophy: "AUTHENTIC_CHURCHILL_LAYERS_WITH_ONE_CONTINUOUS_PHYSICS_THREAD",
  generated_people_allowed: false,
  generic_venue_generation_allowed: false,
  full_scene_ai_generation_allowed: false,
  publication_authorized: false,
  required_layers: Object.freeze([
    Object.freeze({
      id: "wine_physics",
      source_kind: "approved_vfx",
      source_key: "wine_universe",
      role: "ONE_DROPLET_CONTINUES_MOVING",
      required: true,
    }),
    Object.freeze({
      id: "dinner",
      source_kind: "authentic_asset",
      asset_id: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
      role: "FROZEN_GUEST_DINNER_REALITY",
      required: true,
    }),
    Object.freeze({
      id: "carpaccio",
      source_kind: "authentic_asset",
      asset_id: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
      role: "FROZEN_FOOD_DETAIL",
      required: true,
    }),
    Object.freeze({
      id: "pool",
      source_kind: "authentic_asset",
      asset_id: "797c9d16-5465-4e60-be93-a6c65707f7db",
      role: "AUTHENTIC_ORANGE_CHURCHILL_POOL",
      required: true,
    }),
    Object.freeze({
      id: "shuffleboard",
      source_kind: "authentic_asset",
      asset_id: "4357898f-23fd-418f-af8d-89e3719c0969",
      role: "AUTHENTIC_SHUFFLEBOARD_GEOMETRY",
      required: true,
    }),
    Object.freeze({
      id: "electronic_darts",
      source_kind: "authentic_asset",
      asset_id: "7bc9e891-e3d0-4b03-8b53-95ff255f31c6",
      role: "AUTHENTIC_ELECTRONIC_DARTS_GEOMETRY",
      required: true,
    }),
    Object.freeze({
      id: "singer",
      source_kind: "authentic_asset",
      asset_id: "370a3030-0000-0000-0000-000000000000",
      role: "REAL_SINGER_IDENTITY",
      required: true,
      resolve_from_project_asset_registry: true,
    }),
    Object.freeze({
      id: "band",
      source_kind: "authentic_asset",
      asset_id: "cb027610-0000-0000-0000-000000000000",
      role: "REAL_BAND_IDENTITY",
      required: true,
      resolve_from_project_asset_registry: true,
    }),
  ]),
  time_structure: Object.freeze([
    Object.freeze({ start: 0.0, end: 1.4, focus: "wine_and_dinner", motion: "camera_only_plus_one_droplet" }),
    Object.freeze({ start: 1.4, end: 2.7, focus: "carpaccio_and_pool", motion: "camera_only_plus_one_droplet" }),
    Object.freeze({ start: 2.7, end: 4.0, focus: "shuffleboard_and_electronic_darts", motion: "camera_only_plus_one_droplet" }),
    Object.freeze({ start: 4.0, end: 5.8, focus: "singer_and_band", motion: "camera_only_plus_one_droplet" }),
    Object.freeze({ start: 5.8, end: 7.0, focus: "droplet_contains_churchill", motion: "droplet_only" }),
  ]),
  visual_rules: Object.freeze([
    "No split-screen panels.",
    "No dashboard or UI treatment.",
    "No cyberpunk overlays, holograms or neon trails.",
    "Every visible Churchill zone must originate from an authentic Churchill asset.",
    "People are frozen from authentic source frames; no generated replacement faces.",
    "Only one wine droplet is allowed to keep moving after the freeze.",
    "Camera motion must feel like one continuous impossible move, not a slideshow.",
    "Transitions must happen through foreground occlusion, reflection, glass, shadow or matched geometry.",
    "Electronic darts must remain visibly electronic with cabinet/screens.",
    "Pool must remain orange/amber Churchill geometry.",
  ]),
});

export function assertChurchillFrozenNightHeroContract() {
  assertChurchillNightStoryIntegrity();
  if (CHURCHILL_FROZEN_NIGHT_HERO.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_FROZEN_HERO_STORY_VERSION_MISMATCH");
  }
  if (CHURCHILL_FROZEN_NIGHT_HERO.duration_seconds !== 7) {
    throw new Error("CHURCHILL_FROZEN_HERO_DURATION_MUST_BE_7_SECONDS");
  }
  if (CHURCHILL_FROZEN_NIGHT_HERO.generated_people_allowed) {
    throw new Error("CHURCHILL_FROZEN_HERO_GENERATED_PEOPLE_FORBIDDEN");
  }
  if (CHURCHILL_FROZEN_NIGHT_HERO.full_scene_ai_generation_allowed) {
    throw new Error("CHURCHILL_FROZEN_HERO_FULL_SCENE_AI_FORBIDDEN");
  }
  return true;
}

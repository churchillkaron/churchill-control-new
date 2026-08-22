import {
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

const SOURCE = Object.freeze({
  entrance_native: "d4dbb4f5-c2b8-41f9-87db-6cbc2f9a4a65",
  dining_native: "fb7e06e3-77cb-49f3-9f11-9fa59887b6be",
  pool_native: "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
  stage_native: "dcd86649-42f8-4f7a-be91-00c456eb940d",
  score: "4de3ecea-6c1a-4d28-a48d-ae8d246237f5",
});

// Absolute master times. These follow the locked 90-second story and may not reorder beats.
const CUES = Object.freeze([
  Object.freeze({ id: "entrance_room_tone", at: 5.0, until: 10.0, role: "AUTHENTIC_ROOM_TONE", candidate_asset_id: SOURCE.entrance_native }),
  Object.freeze({ id: "dinner_room_tone", at: 17.0, until: 24.0, role: "AUTHENTIC_DINING_AMBIENCE", candidate_asset_id: SOURCE.dining_native }),
  Object.freeze({ id: "ice_shaker_hi_hat", at: 28.0, until: 36.0, role: "FOLEY_REQUIRED", candidate_asset_id: null, required_character: "ice/shaker becomes restrained hi-hat texture" }),
  Object.freeze({ id: "pool_break_kick", at: 36.0, until: 42.0, role: "AUTHENTIC_POOL_IMPACT_CANDIDATE", candidate_asset_id: SOURCE.pool_native, required_character: "real pool impact becomes kick/low transient" }),
  Object.freeze({ id: "shuffleboard_percussion", at: 42.0, until: 51.0, role: "FOLEY_REQUIRED", candidate_asset_id: null, required_character: "real wood/puck contact becomes percussion" }),
  Object.freeze({ id: "electronic_dart_riser", at: 51.0, until: 57.5, role: "FOLEY_REQUIRED", candidate_asset_id: null, required_character: "short physical dart movement and electronic impact; no sci-fi laser" }),
  Object.freeze({ id: "bullseye_near_silence", at: 57.5, until: 58.0, role: "MIX_EVENT", candidate_asset_id: null, required_character: "0.3–0.5 second near-silence before band activation" }),
  Object.freeze({ id: "real_band_release", at: 58.0, until: 65.0, role: "AUTHENTIC_LIVE_AUDIO", candidate_asset_id: SOURCE.stage_native, required_character: "real Churchill band audio takes emotional priority over score" }),
  Object.freeze({ id: "many_realities_music_lift", at: 65.0, until: 71.0, role: "SCORE_PLUS_AUTHENTIC_BAND", candidate_asset_id: SOURCE.stage_native }),
  Object.freeze({ id: "frozen_night_suspension", at: 71.0, until: 78.0, role: "MIX_EVENT", candidate_asset_id: null, required_character: "stretch/suspend venue texture while one wine detail remains alive" }),
  Object.freeze({ id: "wine_loop_low_tone", at: 78.0, until: 82.0, role: "FOLEY_REQUIRED", candidate_asset_id: null, required_character: "wine/glass movement resolves the temporal loop" }),
  Object.freeze({ id: "logo_resolve", at: 82.0, until: 90.0, role: "SCORE_RESOLUTION", candidate_asset_id: SOURCE.score }),
]);

export function churchillV3SoundDesignPlan() {
  assertChurchillNightStoryIntegrity();
  return {
    version: "CHURCHILL_V3_SOUND_DESIGN_R1_AUTHENTIC",
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    voiceover_required: false,
    score_asset_id: SOURCE.score,
    source_assets: SOURCE,
    cues: CUES,
    rules: {
      generic_stock_sfx_allowed: false,
      synthetic_scifi_dart_allowed: false,
      authentic_native_audio_preferred: true,
      real_band_audio_required_at_release: true,
      bullseye_silence_required: true,
      final_mix_requires_review: true,
    },
    status: "SOURCE_SELECTION_AND_FOLEY_REQUIRED",
    sound_review_complete: false,
  };
}

export const CHURCHILL_V3_SOUND_SOURCE = SOURCE;
export const CHURCHILL_V3_SOUND_CUES = CUES;

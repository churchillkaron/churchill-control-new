import { AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN } from "./AvantiqoInvestorProductProofPlan";
import { AVANTIQO_INVESTOR_FINAL_ACT_PLAN } from "./AvantiqoInvestorFinalActPlan";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";

export const AVANTIQO_INVESTOR_FILM_MASTER_PLAN = Object.freeze({
  contract: "AVANTIQO_INVESTOR_FILM_MASTER_V7",
  organization_id: ORGANIZATION_ID,
  format: Object.freeze({ width: 1920, height: 1080, aspect_ratio: "16:9", frame_rate: 24, video_codec: "h264", audio_codec: "aac" }),
  duration_seconds: 237.5,
  duration_timecode: "00:03:57.500",
  logo_seconds: 8,
  narration_seconds: 229.5,
  narration_film_start: 8,
  narration_film_end: 237.5,
  narration_path: `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`,
  approved_logo_path: `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`,
  approved_founder_motion_path: `${ORGANIZATION_ID}/unassigned/eaa7edd6-7a62-4ca2-9eac-dfb14059e649-gemini-founder-rgro0za2hzes.mp4`,
  approved_founder_reference_asset_id: "3e1b5197-5279-4713-93ed-0b0defc9581a",
  identity_policy: "APPROVED_GEMINI_FOUNDER_ONLY",
  legacy_founder_allowed: false,
  founder_dialogue_policy: "VISIBLE_FOUNDER_SPEAKING_ALLOWED_AND_EXPECTED_WITH_TARGETED_LIPSYNC_REPAIR",
  founder_visual_policy: "FOUNDER_TALKING_HEADS_PLUS_CINEMATIC_CUTAWAYS_NO_LONG_ARTIFICIAL_PERFORMANCE",
  visible_mouth_sync_required: true,
  visible_mouth_sync_allowed: true,
  product_ui_policy: "AUTHENTIC_USER_SUPPLIED_AVANTIQO_UI_ONLY",
  synthetic_product_ui_allowed: false,
  semantic_visual_sync_required: true,
  scene_duration_policy: "NARRATION_CUE_TIMESTAMPS_NOT_EQUAL_LENGTH_BLOCKS",
  overlay_motion_policy: "ENTER_ONCE_HOLD_EXIT_ONCE_NO_WHOLE_SCENE_PULSING",
  overlay_occlusion_policy: "SUBJECT_SAFE_NO_FACE_HAND_OR_PRIMARY_ACTION_OCCLUSION",
  overlay_density_policy: "ONE_PRIMARY_INTELLIGENCE_OBJECT_PLUS_MAX_FOUR_SUPPORTING_SIGNALS",

  acts: Object.freeze([
    { id: "logo", film_start: 0, film_end: 8, duration: 8, source: "APPROVED_3D_AVANTIQO_LOGO", narration: false },
    { id: "origin", film_start: 8, film_end: 48.078, duration: 40.078, audio_start: 0, audio_end: 40.078, source: "FOUNDER_TALKING_PLUS_SEMANTIC_LIVE_ACTION", narration: true },
    { id: "product-proof", film_start: 48.078, film_end: 144.266, duration: 96.188, audio_start: AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN.audio_start_seconds, audio_end: AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN.audio_end_seconds, source: "AUTHENTIC_AVANTIQO_PRODUCT_PROOF_PLUS_SEMANTIC_LIVE_ACTION", narration: true },
    { id: "final-act", film_start: 144.266, film_end: 237.5, duration: 93.234, audio_start: AVANTIQO_INVESTOR_FINAL_ACT_PLAN.audio_start_seconds, audio_end: AVANTIQO_INVESTOR_FINAL_ACT_PLAN.audio_end_seconds, source: "INTEGRATIONS_GOVERNED_AI_CROSS_INDUSTRY_FOUNDER_TALKING_CLOSE", narration: true },
  ]),

  founder_visible_windows: Object.freeze([
    {
      key: "opening-founder-origin",
      audio_start: 0,
      audio_end: 11.391,
      film_start: 8,
      film_end: 19.391,
      duration: 11.391,
      dialogue_mode: "LIP_SYNC_WITH_EARLY_CUTAWAY",
      visible_speaking_forbidden: false,
      max_continuous_visible_lipsync_seconds: 5.2,
      repair_policy: "SUBTLE_MOUTH_MOTION_THEN_CUT_TO_SEMANTIC_BROLL_WHILE_VOICE_CONTINUES",
    },
    {
      key: "founder-mid-integration",
      audio_start: 136.266,
      audio_end: 140.062,
      film_start: 144.266,
      film_end: 148.062,
      duration: 3.796,
      dialogue_mode: "LIP_SYNC",
      visible_speaking_forbidden: false,
    },
    {
      key: "founder-mid-ai",
      audio_start: 177.188,
      audio_end: 183.516,
      film_start: 185.188,
      film_end: 191.516,
      duration: 6.328,
      dialogue_mode: "LIP_SYNC",
      visible_speaking_forbidden: false,
    },
    {
      key: "founder-close",
      audio_start: 219.375,
      audio_end: 226.125,
      film_start: 227.375,
      film_end: 234.125,
      duration: 6.75,
      dialogue_mode: "LIP_SYNC",
      visible_speaking_forbidden: false,
    },
  ]),

  segment_output_contract: Object.freeze({
    directory: `${ORGANIZATION_ID}/avantiqo-investor-film-20260821/segments-v7`,
    audio_policy: "VIDEO_ONLY_MASTER_AUDIO_MUXED_ONCE_AT_FINAL_ASSEMBLY",
  }),

  final_output: Object.freeze({
    directory: `${ORGANIZATION_ID}/avantiqo-investor-film-20260821/master-v7`,
    filename: "avantiqo-investor-film-v7-semantic-stable-237.5s.mp4",
  }),

  sound: Object.freeze({
    voice: "LOCKED_CEDAR_V5_SINGLE_FOUNDER_VOICE",
    voice_delay_seconds: 8,
    score_policy: "CINEMATIC_SCORE_UNDER_VOICE_WITH_INTRO_AND_FINAL_LIFTS",
    dialogue_priority: true,
    source_audio_allowed: false,
  }),

  release_gates: Object.freeze([
    "APPROVED_3D_LOGO_PRESENT",
    "LOCKED_CEDAR_V5_PRESENT",
    "FOUNDER_VISIBLE_SPEAKING_PRESENT",
    "OPENING_FOUNDER_LIPSYNC_MAX_5_2_SECONDS_BEFORE_CUTAWAY",
    "FOUNDER_LIPSYNC_MOUTH_MOTION_NATURAL_AND_RESTRAINED",
    "NO_WHOLE_SCENE_FADE_PULSING",
    "OVERLAYS_HOLD_LONG_ENOUGH_TO_READ",
    "OVERLAYS_DO_NOT_COVER_FACES_HANDS_OR_PRIMARY_ACTION",
    "NO_FULLSCREEN_SYNTHETIC_GLASS_UI",
    "AUTHENTIC_PRODUCT_UI_ONLY",
    "BROLL_SEMANTIC_ROLE_MATCHES_SPOKEN_BEAT",
    "PRODUCT_VISUALS_SEMANTICALLY_MATCH_SPOKEN_BEATS",
    "HEALTHCARE_SPEECH_USES_HEALTHCARE_VISUALS",
    "HOTEL_SPEECH_USES_HOTEL_VISUALS",
    "FIELD_SERVICE_SPEECH_USES_FIELD_SERVICE_VISUALS",
    "FINAL_RUNTIME_237_5_SECONDS_WITHIN_250MS",
    "NO_INTERMEDIATE_PRODUCTION_DEPLOYMENT",
  ]),
});

export default AVANTIQO_INVESTOR_FILM_MASTER_PLAN;

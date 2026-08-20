import { AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN } from "./AvantiqoInvestorProductProofPlan";
import { AVANTIQO_INVESTOR_FINAL_ACT_PLAN } from "./AvantiqoInvestorFinalActPlan";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";

export const AVANTIQO_INVESTOR_FILM_MASTER_PLAN = Object.freeze({
  contract: "AVANTIQO_INVESTOR_FILM_MASTER_V6",
  organization_id: ORGANIZATION_ID,
  format: Object.freeze({
    width: 1280,
    height: 720,
    aspect_ratio: "16:9",
    frame_rate: 24,
    video_codec: "h264",
    audio_codec: "aac",
  }),
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
  rejected_legacy_founder_asset_id: "052e10e2-432e-4cf9-82bd-65cb5bb7441a",
  identity_policy: "APPROVED_GEMINI_FOUNDER_ONLY",
  legacy_founder_allowed: false,
  product_ui_policy: "AUTHENTIC_USER_SUPPLIED_AVANTIQO_UI_ONLY",
  synthetic_product_ui_allowed: false,
  semantic_visual_sync_required: true,

  acts: Object.freeze([
    {
      id: "logo",
      film_start: 0,
      film_end: 8,
      duration: 8,
      source: "APPROVED_3D_AVANTIQO_LOGO",
      narration: false,
    },
    {
      id: "origin",
      film_start: 8,
      film_end: 48.078,
      duration: 40.078,
      audio_start: 0,
      audio_end: 40.078,
      source: "FOUNDER_PLUS_LIVE_ACTION_BROLL_PLUS_SPATIAL_GLASS",
      narration: true,
    },
    {
      id: "product-proof",
      film_start: 48.078,
      film_end: 144.266,
      duration: 96.188,
      audio_start: AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN.audio_start_seconds,
      audio_end: AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN.audio_end_seconds,
      source: "AUTHENTIC_AVANTIQO_PRODUCT_PROOF",
      narration: true,
    },
    {
      id: "final-act",
      film_start: 144.266,
      film_end: 237.5,
      duration: 93.234,
      audio_start: AVANTIQO_INVESTOR_FINAL_ACT_PLAN.audio_start_seconds,
      audio_end: AVANTIQO_INVESTOR_FINAL_ACT_PLAN.audio_end_seconds,
      source: "INTEGRATIONS_GOVERNED_AI_PROOF_STRATEGY_FOUNDER_CLOSE",
      narration: true,
    },
  ]),

  founder_visible_windows: Object.freeze([
    {
      key: "opening-founder-origin",
      audio_start: 0,
      audio_end: 11.391,
      film_start: 8,
      film_end: 19.391,
      duration: 11.391,
    },
    {
      key: "founder-mid-integration",
      audio_start: 136.266,
      audio_end: 140.062,
      film_start: 144.266,
      film_end: 148.062,
      duration: 3.796,
    },
    {
      key: "founder-mid-ai",
      audio_start: 177.188,
      audio_end: 183.516,
      film_start: 185.188,
      film_end: 191.516,
      duration: 6.328,
    },
    {
      key: "founder-close",
      audio_start: 219.375,
      audio_end: 226.125,
      film_start: 227.375,
      film_end: 234.125,
      duration: 6.75,
    },
  ]),

  lip_sync_output_contract: Object.freeze({
    directory: `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v6`,
    filename_pattern: "{key}-synced-approved-v6.mp4",
    audio_source: "LOCKED_CEDAR_V5_229_5_SECONDS",
    source_motion: "APPROVED_GEMINI_FOUNDER_MOTION_ONLY",
  }),

  segment_output_contract: Object.freeze({
    directory: `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/segments`,
    opening: "opening-final-v2.mp4",
    product_proof: "product-proof-final-v1.mp4",
    final_act: "final-act-final-v1.mp4",
    audio_policy: "VIDEO_ONLY_MASTER_AUDIO_MUXED_ONCE_AT_FINAL_ASSEMBLY",
  }),

  final_output: Object.freeze({
    directory: `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/master`,
    filename: "avantiqo-investor-film-v6-master-237.5s.mp4",
  }),

  sound: Object.freeze({
    voice: "LOCKED_CEDAR_V5_SINGLE_FOUNDER_VOICE",
    voice_delay_seconds: 8,
    score_policy: "CINEMATIC_SCORE_UNDER_VOICE_WITH_INTRO_AND_FINAL_LIFTS",
    dialogue_priority: true,
    provider_generated_founder_audio_allowed: false,
  }),

  release_gates: Object.freeze([
    "APPROVED_3D_LOGO_PRESENT",
    "LOCKED_CEDAR_V5_PRESENT",
    "OPENING_FOUNDER_SINGLE_SETUP_MAXIMUM",
    "VISIBLE_FOUNDER_LIPSYNC_REVIEW_REQUIRED",
    "NO_FULLSCREEN_SYNTHETIC_GLASS_UI",
    "NO_REJECTED_LEGACY_FOUNDER_ASSET",
    "AUTHENTIC_PRODUCT_UI_ONLY",
    "PRODUCT_VISUALS_SEMANTICALLY_MATCH_SPOKEN_BEATS",
    "FINAL_RUNTIME_237_5_SECONDS_WITHIN_250MS",
    "NO_INTERMEDIATE_PRODUCTION_DEPLOYMENT",
  ]),
});

export default AVANTIQO_INVESTOR_FILM_MASTER_PLAN;

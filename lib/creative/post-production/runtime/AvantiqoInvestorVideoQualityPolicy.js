export const AVANTIQO_INVESTOR_VIDEO_QUALITY_POLICY = Object.freeze({
  contract: "AVANTIQO_INVESTOR_VIDEO_QUALITY_POLICY_V1",
  delivery: Object.freeze({
    resolution: "3840x2160",
    fps: 24,
    color_space: "REC709",
    audio_sample_rate_hz: 48000,
  }),
  tiers: Object.freeze({
    PREVIEW: Object.freeze({
      id: "PREVIEW_DISTILLED_1920X1088",
      purpose: "CREATIVE_DIRECTION_AND_MOTION_APPROVAL",
      modal_app: "avantiqo-video-owned",
      modal_function: "generate_investor_t2v_master",
      source_resolution: "1920x1088",
      delivery_resolution: null,
      expected_pipeline: "DISTILLED_TWO_STAGE_T2V_BF16",
      dfr_required: false,
      full_dev_native_4k_required: false,
    }),
    PRODUCTION: Object.freeze({
      id: "PRODUCTION_DFR_3840X2176",
      purpose: "DEFAULT_APPROVED_INVESTOR_FILM_SHOT",
      modal_app: "avantiqo-video-owned",
      modal_function: "generate_investor_hq_master",
      source_resolution: "3840x2176",
      delivery_resolution: "3840x2160",
      expected_pipeline: "LTX25_DFR_DETAIL_FIDELITY",
      dfr_required: true,
      detailing_ic_lora_required: true,
      temporal_upscaling_allowed: false,
      pixel_delivery_upscale_allowed: false,
      full_dev_native_4k_required: false,
    }),
    ULTRA: Object.freeze({
      id: "ULTRA_FULL_DEV_NATIVE_3840X2176",
      purpose: "EXCEPTIONAL_HERO_SHOT_ONLY_AFTER_SIDE_BY_SIDE_REVIEW",
      modal_app: "avantiqo-video-owned",
      modal_function: "generate_native_master",
      source_resolution: "3840x2176",
      delivery_resolution: "3840x2160",
      expected_pipeline: "TI2VID_ONE_STAGE_FULL_DEV_BF16",
      dfr_required: false,
      full_dev_native_4k_required: true,
      automatic_selection_forbidden: true,
    }),
  }),
  default_tier: "PRODUCTION",
  ultra_promotion_gate: Object.freeze({
    automatic: false,
    requires_side_by_side_review: true,
    requires_visible_quality_gain: true,
    reason: "FULL_DEV_NATIVE_4K_IS_TOO_SLOW_FOR_DEFAULT_STUDIO_ITERATION",
  }),
  film_rules: Object.freeze([
    "FINAL_MASTER_IS_4K_UHD_24FPS",
    "PRODUCTION_DFR_IS_DEFAULT_FOR_APPROVED_SHOTS",
    "FULL_DEV_NATIVE_4K_IS_HERO_ONLY",
    "NO_SCREENSHOTS_AS_GENERATED_FILM_FOOTAGE",
    "NO_FAKE_DASHBOARDS",
    "NO_GENERIC_AI_ORBS_OR_NEON_HOLOGRAMS",
    "PHOTOGRAPHIC_CINEMATIC_REALISM_REQUIRED",
    "TEMPORAL_STABILITY_AND_HUMAN_REALISM_BEAT_RAW_RESOLUTION",
  ]),
});

export function resolveInvestorVideoQualityTier(requested = null) {
  const key = String(requested || AVANTIQO_INVESTOR_VIDEO_QUALITY_POLICY.default_tier)
    .trim()
    .toUpperCase();
  const tier = AVANTIQO_INVESTOR_VIDEO_QUALITY_POLICY.tiers[key];
  if (!tier) throw new Error(`INVESTOR_VIDEO_QUALITY_TIER_INVALID:${key}`);
  return tier;
}

export default AVANTIQO_INVESTOR_VIDEO_QUALITY_POLICY;

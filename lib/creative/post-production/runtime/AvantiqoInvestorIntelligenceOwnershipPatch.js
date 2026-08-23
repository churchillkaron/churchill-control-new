const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";

export const AVANTIQO_INVESTOR_INTELLIGENCE_OWNERSHIP_PATCH = Object.freeze({
  contract: "AVANTIQO_INVESTOR_INTELLIGENCE_OWNERSHIP_PATCH_V1",
  audio_start_seconds: 177.188,
  audio_end_seconds: 199.547,
  duration_seconds: 22.359,
  storage_path: `${ORGANIZATION_ID}/avantiqo-investor-video-20260823/avantiqo-intelligence-ownership-founder-v1-22.359s.mp3`,
  narration: "Avantiqo Intelligence is different. It is not OpenAI or Claude. It is Avantiqo's own intelligence, built into the operating system. It can talk with you, write code, manage and execute across the system, direct Creative Studio, and drive Avantiqo music and speech. External models may assist, but only as providers. Avantiqo owns the intelligence: context, memory, orchestration and execution.",
  ownership: Object.freeze({
    intelligence_owner: "AVANTIQO",
    openai_is_brain: false,
    claude_is_brain: false,
    external_models_policy: "OPTIONAL_PROVIDER_OR_FALLBACK_ONLY",
    orchestration_owner: "AVANTIQO",
    business_context_owner: "AVANTIQO",
    memory_owner: "AVANTIQO",
    execution_owner: "AVANTIQO",
  }),
  surfaces: Object.freeze([
    Object.freeze({ key: "chat", label: "CHAT", meaning: "natural back-and-forth business conversation" }),
    Object.freeze({ key: "code", label: "CODE", meaning: "write, inspect, debug and repair software" }),
    Object.freeze({ key: "operator", label: "OPERATE", meaning: "manage, navigate and execute across the business operating system" }),
    Object.freeze({ key: "creative", label: "CREATIVE STUDIO", meaning: "strategy, design, image and cinema direction and execution" }),
    Object.freeze({ key: "music", label: "MUSIC", meaning: "Avantiqo-owned music and sound intelligence" }),
    Object.freeze({ key: "speech", label: "SPEECH", meaning: "Avantiqo-owned speech and voice intelligence" }),
  ]),
  visual_policy: Object.freeze({
    hero: "AVANTIQO_INTELLIGENCE",
    capability_labels: Object.freeze(["CHAT", "CODE", "OPERATE", "CREATIVE STUDIO", "MUSIC", "SPEECH"]),
    provider_logos_as_hero: false,
    competitor_reference_policy: "BRIEF_TYPOGRAPHIC_CONTRAST_ONLY_NOT_BRAND_HERO",
    external_provider_visual_role: "OPTIONAL_OUTER_RING_ONLY",
    authentic_avantiqo_product_proof_required: true,
    fake_product_ui_allowed: false,
    generic_ai_orb_allowed: false,
  }),
  audio_policy: Object.freeze({
    exact_duration_required: true,
    preserve_base_narration_before_patch: true,
    preserve_base_narration_after_patch: true,
    replace_only_seconds: Object.freeze([177.188, 199.547]),
  }),
});

export default AVANTIQO_INVESTOR_INTELLIGENCE_OWNERSHIP_PATCH;

import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-audio";
const DEFAULT_CERTIFIED_CAPABILITIES = Object.freeze(["ai.music.generate"]);
const IMPLEMENTED_CAPABILITIES = Object.freeze([
  "ai.music.generate",
  "ai.audio.remix",
  "ai.audio.edit",
  "ai.audio.extend",
]);
const SEPARATOR_CAPABILITIES = Object.freeze(["ai.audio.stems"]);
const VOCAL_CORRECTION_CAPABILITY = "ai.audio.vocal-correct";
const CERTIFIABLE_CAPABILITIES = Object.freeze([
  ...IMPLEMENTED_CAPABILITIES,
  ...SEPARATOR_CAPABILITIES,
]);
const TARGET_CAPABILITIES = Object.freeze([
  "ai.music.generate",
  "ai.sfx.generate",
  "ai.audio.generate",
  "ai.audio.edit",
  "ai.audio.extend",
  "ai.audio.remix",
  "ai.audio.stems",
  VOCAL_CORRECTION_CAPABILITY,
  "ai.audio.mix",
  "ai.audio.master",
]);
const QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const EXPECTED_MODEL_VARIANT = "acestep-v15-xl-turbo";
const EXPECTED_LM_MODEL = "acestep-5Hz-lm-1.7B";
const EXPECTED_LM_BACKEND = "vllm";
const STEM_SEPARATOR_MODEL = "facebookresearch/demucs:htdemucs_ft";
const STEM_SEPARATOR_LANE = "demucs-htdemucs-ft";
const STEM_SEPARATOR_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const VOCAL_CORRECTION_ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const VOCAL_CORRECTION_QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const SOURCE_AUDIO_CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";
const SOURCE_AUDIO_MAX_DURATION_SECONDS = 900;

function text(value) {
  return String(value ?? "").trim();
}

function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function certifiedCapabilities(value) {
  const requested = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!requested.length) return [...DEFAULT_CERTIFIED_CAPABILITIES];

  const unsupported = requested.filter((item) => !CERTIFIABLE_CAPABILITIES.includes(item));
  if (unsupported.length) {
    throw new Error(`AVANTIQO_AUDIO_CERTIFIED_CAPABILITY_NOT_IMPLEMENTED:${unsupported.join(",")}`);
  }
  if (!requested.includes("ai.music.generate")) {
    throw new Error("AVANTIQO_AUDIO_MUSIC_GENERATION_CERTIFICATION_REQUIRED");
  }
  return [...new Set(requested)];
}

const endpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
const apiKey = text(process.env.RUNPOD_API_KEY);
const foundationModel = text(process.env.AVANTIQO_AUDIO_FOUNDATION_MODEL);
const modelFamily = text(process.env.AVANTIQO_AUDIO_MODEL_FAMILY || "ACE_STEP_1_5");
const modelVariant = text(process.env.AVANTIQO_AUDIO_MODEL_VARIANT || EXPECTED_MODEL_VARIANT);
const lmModel = text(process.env.AVANTIQO_AUDIO_LM_MODEL || EXPECTED_LM_MODEL);
const lmBackend = text(process.env.AVANTIQO_AUDIO_LM_BACKEND || EXPECTED_LM_BACKEND).toLowerCase();
const lmEnabled = enabled(process.env.ACESTEP_INIT_LLM || "true");
const engineEnabled = enabled(process.env.AVANTIQO_AUDIO_ENGINE_ENABLED);
const vocalCorrectionEndpointId = text(process.env.RUNPOD_AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_ID);
const vocalCorrectionEngineEnabled = enabled(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_ENABLED);
const vocalCorrectionEngineCertified = enabled(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED);
const vocalCorrectionRuntimeAvailable = Boolean(
  vocalCorrectionEngineEnabled &&
  vocalCorrectionEngineCertified &&
  vocalCorrectionEndpointId &&
  apiKey,
);
const capabilities = [
  ...new Set([
    ...certifiedCapabilities(process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES),
    ...(vocalCorrectionRuntimeAvailable ? [VOCAL_CORRECTION_CAPABILITY] : []),
  ]),
];
const runtimeAvailable = Boolean(
  engineEnabled &&
  endpointId &&
  apiKey &&
  foundationModel === "ACE-Step/Ace-Step1.5" &&
  modelFamily === "ACE_STEP_1_5" &&
  modelVariant === EXPECTED_MODEL_VARIANT &&
  lmEnabled &&
  lmModel === EXPECTED_LM_MODEL &&
  lmBackend === EXPECTED_LM_BACKEND &&
  capabilities.length,
);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Music",
  category: "ai",
  connectionModel: "managed",
  capabilities,
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_audio",
  runtimeAvailable,
  active: true,
  quality_score: score(process.env.AVANTIQO_AUDIO_ENGINE_QUALITY_SCORE, existing.quality_score ?? 90),
  speed_score: score(process.env.AVANTIQO_AUDIO_ENGINE_SPEED_SCORE, existing.speed_score ?? 76),
  reliability_score: score(process.env.AVANTIQO_AUDIO_ENGINE_RELIABILITY_SCORE, existing.reliability_score ?? 84),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: "RUNPOD_SERVERLESS",
    engine_contract: "AVANTIQO_AUDIO_ENGINE_V1",
    product_model: "avantiqo-music-v1",
    model_family: modelFamily,
    model_variant: modelVariant,
    quality_profile: QUALITY_PROFILE,
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    provider_selection_exposed: false,
    raw_reasoning_persisted: false,
    ace_step_lm_enabled: lmEnabled,
    ace_step_lm_model: lmModel,
    ace_step_lm_backend: lmBackend,
    thinking_enabled: lmEnabled,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certifiable_capabilities: CERTIFIABLE_CAPABILITIES,
    certified_capabilities: capabilities,
    default_certified_capabilities: DEFAULT_CERTIFIED_CAPABILITIES,
    benchmark_required_capabilities: CERTIFIABLE_CAPABILITIES.filter(
      (capability) => !DEFAULT_CERTIFIED_CAPABILITIES.includes(capability),
    ),
    base_model_required_capabilities: [],
    temporal_extend_runtime: {
      capability: "ai.audio.extend",
      model_lane: EXPECTED_MODEL_VARIANT,
      task_type: "repaint",
      strategy: "XL_TURBO_REPAINT_RIGHT_OUTPAINT",
      source_duration_measured_by_worker: true,
      right_padding_outpaint_required: true,
      continuity_overlap_required: true,
      runtime_status: "IMPLEMENTED_BENCHMARK_REQUIRED",
      production_routing_allowed: capabilities.includes("ai.audio.extend"),
      certification_required: true,
      temporal_extension_proven: false,
    },
    separator_capabilities: SEPARATOR_CAPABILITIES,
    separator_runtime: {
      owner: "AVANTIQO",
      capability: "ai.audio.stems",
      model: STEM_SEPARATOR_MODEL,
      model_lane: STEM_SEPARATOR_LANE,
      quality_profile: STEM_SEPARATOR_PROFILE,
      runtime_status: "IMPLEMENTED_BENCHMARK_AND_CERTIFICATION_REQUIRED",
      production_routing_allowed: false,
      certification_required: true,
      source_audio_required: true,
      source_audio_max_duration_seconds: SOURCE_AUDIO_MAX_DURATION_SECONDS,
      rights_attestation_required: true,
      rights_attestation_contract: SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
      content_restriction_policy: SOURCE_AUDIO_CONTENT_POLICY,
      stems: ["vocals", "drums", "bass", "other"],
      backing_track_stems: ["drums", "bass", "other"],
      source_timing_preserved_by_default: true,
    },
    vocal_correction_runtime: {
      owner: "AVANTIQO",
      capability: VOCAL_CORRECTION_CAPABILITY,
      engine_contract: VOCAL_CORRECTION_ENGINE_CONTRACT,
      quality_profile: VOCAL_CORRECTION_QUALITY_PROFILE,
      runtime_status: vocalCorrectionRuntimeAvailable ? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED",
      production_routing_allowed: vocalCorrectionRuntimeAvailable,
      certification_required: true,
      source_audio_required: true,
      isolated_vocal_only: true,
      musician_approved_plan_supported: true,
      timing_review_required_for_workstation: true,
      tone_preservation_compensation_configured: true,
      formant_preservation_claimed: false,
      rights_attestation_required: true,
      rights_attestation_contract: SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
      content_restriction_policy: SOURCE_AUDIO_CONTENT_POLICY,
      endpoint_configured: Boolean(vocalCorrectionEndpointId),
    },
    configured_foundation_model: foundationModel || null,
    foundation_models: [
      ...(foundationModel ? [foundationModel] : []),
      STEM_SEPARATOR_MODEL,
    ],
    runtime_configuration: {
      enabled: engineEnabled,
      runpod_endpoint_configured: Boolean(endpointId),
      runpod_api_key_configured: Boolean(apiKey),
      foundation_model_configured: Boolean(foundationModel),
      model_variant_configured: modelVariant === EXPECTED_MODEL_VARIANT,
      lm_model_configured: lmModel === EXPECTED_LM_MODEL,
      lm_backend_configured: lmBackend === EXPECTED_LM_BACKEND,
      lm_enabled: lmEnabled,
      vocal_correction_engine_enabled: vocalCorrectionEngineEnabled,
      vocal_correction_engine_certified: vocalCorrectionEngineCertified,
      vocal_correction_endpoint_configured: Boolean(vocalCorrectionEndpointId),
      queue_endpoint: true,
      scale_to_zero: true,
    },
  },
};

export const AVANTIQO_AUDIO_PROVIDER_ID = PROVIDER_ID;

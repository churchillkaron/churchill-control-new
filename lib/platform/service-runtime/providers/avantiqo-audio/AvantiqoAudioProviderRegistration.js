import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-audio";
const IMPLEMENTED_CAPABILITIES = Object.freeze(["ai.music.generate"]);
const TARGET_CAPABILITIES = Object.freeze([
  "ai.music.generate",
  "ai.sfx.generate",
  "ai.audio.generate",
  "ai.audio.edit",
  "ai.audio.extend",
  "ai.audio.remix",
  "ai.audio.stems",
  "ai.audio.mix",
  "ai.audio.master",
]);

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
  const configured = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => IMPLEMENTED_CAPABILITIES.includes(item));
  return configured.length ? [...new Set(configured)] : [...IMPLEMENTED_CAPABILITIES];
}

const endpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
const apiKey = text(process.env.RUNPOD_API_KEY);
const foundationModel = text(process.env.AVANTIQO_AUDIO_FOUNDATION_MODEL);
const modelFamily = text(process.env.AVANTIQO_AUDIO_MODEL_FAMILY || "ACE_STEP_1_5");
const modelVariant = text(process.env.AVANTIQO_AUDIO_MODEL_VARIANT || "acestep-v15-turbo");
const engineEnabled = enabled(process.env.AVANTIQO_AUDIO_ENGINE_ENABLED);
const capabilities = certifiedCapabilities(process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES);
const runtimeAvailable = Boolean(
  engineEnabled &&
  endpointId &&
  apiKey &&
  foundationModel === "ACE-Step/Ace-Step1.5" &&
  modelFamily === "ACE_STEP_1_5" &&
  modelVariant === "acestep-v15-turbo" &&
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
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    provider_selection_exposed: false,
    raw_reasoning_persisted: false,
    ace_step_lm_enabled: false,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    configured_foundation_model: foundationModel || null,
    runtime_configuration: {
      enabled: engineEnabled,
      runpod_endpoint_configured: Boolean(endpointId),
      runpod_api_key_configured: Boolean(apiKey),
      foundation_model_configured: Boolean(foundationModel),
      queue_endpoint: true,
      scale_to_zero: true,
    },
  },
};

export const AVANTIQO_AUDIO_PROVIDER_ID = PROVIDER_ID;

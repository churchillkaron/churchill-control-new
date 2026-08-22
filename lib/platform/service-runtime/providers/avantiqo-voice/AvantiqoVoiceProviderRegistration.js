import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-voice";
const IMPLEMENTED_CAPABILITIES = Object.freeze([
  "ai.speech.to.text",
  "ai.text.to.speech",
]);
const TARGET_CAPABILITIES = Object.freeze([
  ...IMPLEMENTED_CAPABILITIES,
  "ai.speech.to.text.realtime",
  "ai.voice.generate",
  "ai.voice.dub",
  "ai.voice.repair",
]);

function text(value) {
  return String(value ?? "").trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

function requestedCapabilities(value) {
  const configured = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => IMPLEMENTED_CAPABILITIES.includes(item));
  return configured.length ? [...new Set(configured)] : [...IMPLEMENTED_CAPABILITIES];
}

const engineEnabled = enabled(process.env.AVANTIQO_VOICE_ENGINE_ENABLED);
const apiKey = text(process.env.RUNPOD_API_KEY);
const sttEndpointId = text(process.env.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID);
const ttsEndpointId = text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID);
const sttFoundationModel = text(process.env.AVANTIQO_VOICE_STT_FOUNDATION_MODEL);
const ttsFoundationModel = text(process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL);
const requested = requestedCapabilities(process.env.AVANTIQO_VOICE_CERTIFIED_CAPABILITIES);
const capabilities = requested.filter((capability) => {
  if (capability === "ai.speech.to.text") {
    return Boolean(sttEndpointId && sttFoundationModel);
  }
  if (capability === "ai.text.to.speech") {
    return Boolean(ttsEndpointId && ttsFoundationModel);
  }
  return false;
});
const runtimeAvailable = Boolean(
  engineEnabled && apiKey && capabilities.length,
);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Voice",
  category: "ai",
  connectionModel: "managed",
  capabilities,
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_voice",
  runtimeAvailable,
  active: true,
  quality_score: score(
    process.env.AVANTIQO_VOICE_ENGINE_QUALITY_SCORE,
    existing.quality_score ?? 90,
  ),
  speed_score: score(
    process.env.AVANTIQO_VOICE_ENGINE_SPEED_SCORE,
    existing.speed_score ?? 90,
  ),
  reliability_score: score(
    process.env.AVANTIQO_VOICE_ENGINE_RELIABILITY_SCORE,
    existing.reliability_score ?? 88,
  ),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: "RUNPOD_SERVERLESS",
    engine_contract: "AVANTIQO_VOICE_ENGINE_V1",
    product_model: "avantiqo-voice-v1",
    product_models: {
      stt: "avantiqo-voice-stt-v1",
      tts: "avantiqo-voice-tts-v1",
    },
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    provider_selection_exposed: false,
    raw_reasoning_persisted: false,
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    realtime_streaming_certified: false,
    voice_cloning_certified: false,
    foundation_models: [sttFoundationModel, ttsFoundationModel].filter(Boolean),
    configured_foundation_models: {
      stt: sttFoundationModel || null,
      tts: ttsFoundationModel || null,
    },
    runtime_configuration: {
      enabled: engineEnabled,
      runpod_api_key_configured: Boolean(apiKey),
      stt_endpoint_configured: Boolean(sttEndpointId),
      tts_endpoint_configured: Boolean(ttsEndpointId),
      stt_foundation_model_configured: Boolean(sttFoundationModel),
      tts_foundation_model_configured: Boolean(ttsFoundationModel),
      synchronous_operator_voice: true,
      realtime_streaming: false,
      scale_to_zero: true,
    },
  },
};

export const AVANTIQO_VOICE_PROVIDER_ID = PROVIDER_ID;

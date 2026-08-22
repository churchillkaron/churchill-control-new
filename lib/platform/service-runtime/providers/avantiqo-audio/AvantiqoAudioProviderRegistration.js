import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-audio";

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

const endpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
const apiKey = text(process.env.RUNPOD_API_KEY);
const engineEnabled = enabled(process.env.AVANTIQO_AUDIO_ENGINE_ENABLED);
const runtimeAvailable = Boolean(engineEnabled && endpointId && apiKey);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Audio",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.audio.generate",
    "ai.music.generate",
    "ai.sfx.generate",
    "ai.audio.edit",
    "ai.audio.extend",
    "ai.audio.remix",
    "ai.audio.stems",
    "ai.audio.mix",
    "ai.audio.master",
  ],
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
    product_model: "avantiqo-audio-v1",
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    runtime_configuration: {
      enabled: engineEnabled,
      runpod_endpoint_configured: Boolean(endpointId),
      runpod_api_key_configured: Boolean(apiKey),
      queue_endpoint: true,
      scale_to_zero: true,
    },
  },
};

export const AVANTIQO_AUDIO_PROVIDER_ID = PROVIDER_ID;

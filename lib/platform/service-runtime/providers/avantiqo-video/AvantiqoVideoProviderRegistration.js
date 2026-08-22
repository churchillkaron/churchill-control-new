import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-video";

function text(value) {
  return String(value ?? "").trim();
}

function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, number))
    : fallback;
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

const runpodEndpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const runpodApiKey = text(process.env.RUNPOD_API_KEY);
const engineEnabled = enabled(process.env.AVANTIQO_VIDEO_ENGINE_ENABLED);
const runtimeAvailable = Boolean(engineEnabled && runpodEndpointId && runpodApiKey);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Synthetic Video",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.video.generate",
    "ai.video.image_to_video",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_video",
  runtimeAvailable,
  active: true,
  quality_score: score(
    process.env.AVANTIQO_VIDEO_ENGINE_QUALITY_SCORE,
    existing.quality_score ?? 92,
  ),
  speed_score: score(
    process.env.AVANTIQO_VIDEO_ENGINE_SPEED_SCORE,
    existing.speed_score ?? 72,
  ),
  reliability_score: score(
    process.env.AVANTIQO_VIDEO_ENGINE_RELIABILITY_SCORE,
    existing.reliability_score ?? 82,
  ),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: "RUNPOD_SERVERLESS",
    engine_contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
    product_model: "avantiqo-cinema-v1",
    self_hosted_weights: true,
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    foundation_models: [
      "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
      "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
      "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
    ],
    runtime_configuration: {
      enabled: engineEnabled,
      runpod_endpoint_configured: Boolean(runpodEndpointId),
      runpod_api_key_configured: Boolean(runpodApiKey),
      queue_endpoint: true,
      scale_to_zero: true,
    },
    video_capabilities: {
      contract: "PROVIDER_VIDEO_CAPABILITY_CONFIGURATION_V1",
      native_audio: false,
      native_frame_rate: 24,
      supported_aspect_ratios: ["16:9", "9:16", "1:1"],
      supported_resolutions: ["720p"],
      allowed_duration_seconds: [2, 3, 4, 5, 6, 7, 8, 9, 10],
      reference_image_limit: 4,
      first_frame: true,
      last_frame: false,
      identity_conditioning: true,
      deterministic_seed: true,
    },
  },
};

export const AVANTIQO_VIDEO_PROVIDER_ID = PROVIDER_ID;

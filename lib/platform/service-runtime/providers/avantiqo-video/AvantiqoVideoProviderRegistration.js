import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-video";
const TARGET_CAPABILITIES = Object.freeze([
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
  "ai.video.inpaint",
  "ai.video.extend",
  "ai.video.upscale",
  "ai.video.lipsync",
]);
const IMPLEMENTED_CAPABILITIES = Object.freeze([
  "ai.video.generate",
  "ai.video.image_to_video",
]);

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

function certifiedCapabilities(value) {
  const configured = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => IMPLEMENTED_CAPABILITIES.includes(item));
  return configured.length ? [...new Set(configured)] : [...IMPLEMENTED_CAPABILITIES];
}

const runpodEndpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const runpodApiKey = text(process.env.RUNPOD_API_KEY);
const foundationModel = text(process.env.AVANTIQO_VIDEO_FOUNDATION_MODEL);
const engineEnabled = enabled(process.env.AVANTIQO_VIDEO_ENGINE_ENABLED);
const capabilities = certifiedCapabilities(process.env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES);
const runtimeAvailable = Boolean(
  engineEnabled &&
  runpodEndpointId &&
  runpodApiKey &&
  foundationModel &&
  capabilities.length,
);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Cinema",
  category: "ai",
  connectionModel: "managed",
  capabilities,
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
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    configured_foundation_model: foundationModel || null,
    runtime_configuration: {
      enabled: engineEnabled,
      runpod_endpoint_configured: Boolean(runpodEndpointId),
      runpod_api_key_configured: Boolean(runpodApiKey),
      foundation_model_configured: Boolean(foundationModel),
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

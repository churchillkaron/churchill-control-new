import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-image";
const TARGET_CAPABILITIES = Object.freeze([
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.image.analyze",
]);
const IMPLEMENTED_CAPABILITIES = Object.freeze([
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
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
  return configured.length ? [...new Set(configured)] : ["ai.image.generate"];
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

const endpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const apiKey = text(process.env.RUNPOD_API_KEY);
const generationModel = text(process.env.AVANTIQO_IMAGE_FOUNDATION_MODEL);
const editModel = text(process.env.AVANTIQO_IMAGE_EDIT_MODEL) || "Qwen/Qwen-Image-Edit";
const inpaintModel =
  text(process.env.AVANTIQO_IMAGE_INPAINT_MODEL) || "Qwen/Qwen-Image-Edit-2511";
const outpaintModel =
  text(process.env.AVANTIQO_IMAGE_OUTPAINT_MODEL) || inpaintModel;
const engineEnabled = enabled(process.env.AVANTIQO_IMAGE_ENGINE_ENABLED);
const capabilities = certifiedCapabilities(process.env.AVANTIQO_IMAGE_CERTIFIED_CAPABILITIES);
const requiredModelsConfigured = capabilities.every((capability) => {
  if (capability === "ai.image.generate") return Boolean(generationModel);
  if (capability === "ai.image.edit") return Boolean(editModel);
  if (capability === "ai.image.inpaint") return Boolean(inpaintModel);
  if (capability === "ai.image.outpaint") return Boolean(outpaintModel);
  return false;
});
const foundationModels = unique([
  generationModel,
  editModel,
  inpaintModel,
  outpaintModel,
]);
const runtimeAvailable = Boolean(
  engineEnabled && endpointId && apiKey && requiredModelsConfigured && capabilities.length,
);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Image",
  category: "ai",
  connectionModel: "managed",
  capabilities,
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_image",
  runtimeAvailable,
  active: true,
  quality_score: score(process.env.AVANTIQO_IMAGE_ENGINE_QUALITY_SCORE, existing.quality_score ?? 92),
  speed_score: score(process.env.AVANTIQO_IMAGE_ENGINE_SPEED_SCORE, existing.speed_score ?? 78),
  reliability_score: score(process.env.AVANTIQO_IMAGE_ENGINE_RELIABILITY_SCORE, existing.reliability_score ?? 84),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: "RUNPOD_SERVERLESS",
    engine_contract: "AVANTIQO_IMAGE_ENGINE_V1",
    product_model: "avantiqo-image-v1",
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    configured_foundation_model: generationModel || null,
    foundation_models: foundationModels,
    capability_foundation_models: {
      "ai.image.generate": generationModel || null,
      "ai.image.edit": editModel || null,
      "ai.image.inpaint": inpaintModel || null,
      "ai.image.outpaint": outpaintModel || null,
    },
    runtime_configuration: {
      enabled: engineEnabled,
      runpod_endpoint_configured: Boolean(endpointId),
      runpod_api_key_configured: Boolean(apiKey),
      foundation_model_configured: requiredModelsConfigured,
      generation_foundation_model_configured: Boolean(generationModel),
      edit_foundation_model_configured: Boolean(editModel),
      inpaint_foundation_model_configured: Boolean(inpaintModel),
      outpaint_foundation_model_configured: Boolean(outpaintModel),
      queue_endpoint: true,
      scale_to_zero: true,
    },
    image_capabilities: {
      contract: "AVANTIQO_IMAGE_CAPABILITY_CONFIGURATION_V1",
      private_source_assets: true,
      deterministic_seed: true,
      semantic_editing: true,
      mask_conditioned_inpaint: true,
      exact_unmasked_pixel_preservation: true,
      canvas_conditioned_outpaint: true,
      exact_original_region_preservation: true,
    },
  },
};

export const AVANTIQO_IMAGE_PROVIDER_ID = PROVIDER_ID;

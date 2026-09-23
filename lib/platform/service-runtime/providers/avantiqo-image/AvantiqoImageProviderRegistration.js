import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-image";
const TARGET_CAPABILITIES = Object.freeze([
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.image.analyze",
  "document.ocr",
  "document.classify",
  "creative.depth.estimate",
  "creative.materials.estimate",
]);
const IMPLEMENTED_CAPABILITIES = Object.freeze([...TARGET_CAPABILITIES]);

function text(value) { return String(value ?? "").trim(); }
function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}
function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}
function certifiedCapabilities(value) {
  const configured = text(value).split(",").map((item) => item.trim()).filter((item) => IMPLEMENTED_CAPABILITIES.includes(item));
  return configured.length ? [...new Set(configured)] : ["ai.image.generate"];
}
function unique(values = []) { return [...new Set(values.map(text).filter(Boolean))]; }

const localComputeConfigured = ["1","true","yes","on"].includes(text(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED).toLowerCase());
const generationModel = text(process.env.AVANTIQO_IMAGE_FOUNDATION_MODEL) || "Tongyi-MAI/Z-Image";
const editModel = text(process.env.AVANTIQO_IMAGE_EDIT_MODEL) || "Qwen/Qwen-Image-Edit";
const inpaintModel = text(process.env.AVANTIQO_IMAGE_INPAINT_MODEL) || "Qwen/Qwen-Image-Edit-2511";
const outpaintModel = text(process.env.AVANTIQO_IMAGE_OUTPAINT_MODEL) || inpaintModel;
const upscaleModel = text(process.env.AVANTIQO_IMAGE_UPSCALE_MODEL) || "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr";
const analyzeModel = text(process.env.AVANTIQO_IMAGE_ANALYZE_MODEL) || "Qwen/Qwen2.5-VL-7B-Instruct";
const localDocumentVisionModel = text(process.env.AVANTIQO_LOCAL_DOCUMENT_VISION_MODEL) || "qwen2.5vl:3b";
const depthModel = text(process.env.AVANTIQO_IMAGE_DEPTH_MODEL) || "depth-anything/Depth-Anything-V2-Small-hf";
const engineEnabled = enabled(process.env.AVANTIQO_IMAGE_ENGINE_ENABLED);
const capabilities = certifiedCapabilities(process.env.AVANTIQO_IMAGE_CERTIFIED_CAPABILITIES);
const requiredModelsConfigured = capabilities.every((capability) => {
  if (capability === "ai.image.generate") return Boolean(generationModel);
  if (capability === "ai.image.edit") return Boolean(editModel);
  if (capability === "ai.image.inpaint") return Boolean(inpaintModel);
  if (capability === "ai.image.outpaint") return Boolean(outpaintModel);
  if (capability === "ai.image.upscale") return Boolean(upscaleModel);
  if (["ai.image.analyze", "document.ocr", "document.classify"].includes(capability)) return Boolean(analyzeModel);
  if (capability === "creative.depth.estimate") return Boolean(depthModel);
  if (capability === "creative.materials.estimate") return Boolean(analyzeModel);
  return false;
});
const foundationModels = unique([generationModel, editModel, inpaintModel, outpaintModel, upscaleModel, analyzeModel, depthModel]);
const modalConfigured = Boolean(modalTokenId && modalTokenSecret);
const runtimeAvailable = Boolean(engineEnabled && (modalConfigured || localComputeConfigured) && requiredModelsConfigured && capabilities.length);
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
  reliability_score: score(process.env.AVANTIQO_IMAGE_ENGINE_RELIABILITY_SCORE, existing.reliability_score ?? 96),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: localComputeConfigured ? "AVANTIQO_LOCAL_NODE_V1_PRIMARY_MODAL_FALLBACK" : "MODAL",
    infrastructure_candidates: localComputeConfigured
      ? ["AVANTIQO_LOCAL_NODE_V1", "MODAL_GPU_ON_DEMAND"]
      : ["MODAL_GPU_ON_DEMAND"],
    local_first_execution: localComputeConfigured,
    local_first_capabilities: [
      "ai.image.analyze",
      "document.ocr",
      "document.classify",
      "ai.image.upscale",
      "creative.materials.estimate",
    ],
    modal_only_capabilities: [
      "ai.image.generate",
      "ai.image.edit",
      "ai.image.inpaint",
      "ai.image.outpaint",
      "creative.depth.estimate",
    ],
    modal_fallback_only_when_local_unavailable: true,
    node01_cost_avoidance_policy: "USE_LOCAL_WHEN_CERTIFIED_AND_HEALTHY",
    engine_contract: "AVANTIQO_IMAGE_ENGINE_V1",
    product_model: "avantiqo-image-v1",
    benchmark_gate: true,
    owned_only_required: true,
    external_provider_fallback_allowed: false,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    configured_foundation_model: generationModel,
    foundation_models: foundationModels,
    capability_foundation_models: {
      "ai.image.generate": generationModel,
      "ai.image.edit": editModel,
      "ai.image.inpaint": inpaintModel,
      "ai.image.outpaint": outpaintModel,
      "ai.image.upscale": upscaleModel,
      "ai.image.analyze": analyzeModel,
      "document.ocr": analyzeModel,
      "document.classify": analyzeModel,
      "creative.depth.estimate": depthModel,
      "creative.materials.estimate": analyzeModel,
    },
    runtime_configuration: {
      enabled: engineEnabled,
      transport: "supabase-pull-queue-v1",
      local_generation_model: localGenerationModel,
      local_generation_runtime: "stable-diffusion.cpp-cuda12",
      local_generation_quantization: "Q3_K",
      local_generation_low_vram_contract: "AVANTIQO_NODE01_Z_IMAGE_TURBO_GGUF_V1",
      local_generation_storage: "SUPABASE_PRIVATE_CREATIVE_ASSETS",
      local_document_vision_model: localDocumentVisionModel,
      local_document_vision_certified_probe: true,
      node01_image_analyze_first: localComputeConfigured,
      node01_image_upscale_first: localComputeConfigured,
      modal_fallback_for_local_capabilities: true,
      modal_app: "avantiqo-image-owned",
      modal_function: "generate",
      modal_token_id_configured: Boolean(modalTokenId),
      modal_token_secret_configured: Boolean(modalTokenSecret),
      modal_environment_configured: Boolean(modalEnvironment),
      modal_gateway_used: false,
      modal_model_volume: "avantiqo-image-models",
      max_gpu_containers: 1,
      foundation_model_configured: requiredModelsConfigured,
      queue_endpoint: true,
      scale_to_zero: true,
      runpod_generation_routing: false,
    },
    image_capabilities: {
      contract: "AVANTIQO_IMAGE_CAPABILITY_CONFIGURATION_V2",
      private_source_assets: true,
      deterministic_seed: true,
      semantic_editing: true,
      mask_conditioned_inpaint: true,
      exact_unmasked_pixel_preservation: true,
      canvas_conditioned_outpaint: true,
      exact_original_region_preservation: true,
      owned_super_resolution: true,
      owned_visual_analysis: true,
      owned_depth_estimation: true,
      owned_material_estimation: true,
      structured_visual_evidence: true,
      analysis_media_output_required: false,
    },
  },
};

export const AVANTIQO_IMAGE_PROVIDER_ID = PROVIDER_ID;
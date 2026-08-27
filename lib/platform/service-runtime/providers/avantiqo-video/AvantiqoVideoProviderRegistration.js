import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-video";
const TARGET_CAPABILITIES = Object.freeze([
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
  "ai.video.inpaint",
  "ai.video.extend",
  "ai.video.upscale",
  "ai.video.lipsync",
]);
const IMPLEMENTED_CAPABILITIES = Object.freeze([...TARGET_CAPABILITIES]);
const DEFAULT_CERTIFIED_CAPABILITIES = Object.freeze([
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

function enabledDefaultTrue(value) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return true;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function certifiedCapabilities(value) {
  const configured = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => IMPLEMENTED_CAPABILITIES.includes(item));
  return configured.length ? [...new Set(configured)] : [...DEFAULT_CERTIFIED_CAPABILITIES];
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

const runpodEndpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const productionRunpodEndpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID);
const lipsyncEndpointId = text(process.env.RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID);
const runpodApiKey = text(process.env.RUNPOD_API_KEY);
const managedFallbackEnabled = enabledDefaultTrue(process.env.AVANTIQO_VIDEO_MANAGED_FALLBACK_ENABLED);
const managedFallbackConfigured = Boolean(
  managedFallbackEnabled && text(process.env.FAL_KEY || process.env.FAL_API_KEY),
);
const genericFoundationModel = text(process.env.AVANTIQO_VIDEO_FOUNDATION_MODEL);
const t2vFoundationModel = text(process.env.AVANTIQO_VIDEO_T2V_MODEL) || genericFoundationModel;
const i2vFoundationModel = text(process.env.AVANTIQO_VIDEO_I2V_MODEL) || genericFoundationModel;
const firstLastFoundationModel =
  text(process.env.AVANTIQO_VIDEO_FIRST_LAST_MODEL) ||
  "Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers";
const v2vFoundationModel =
  text(process.env.AVANTIQO_VIDEO_V2V_MODEL) || "Wan-AI/Wan2.1-VACE-14B-diffusers";
const editFoundationModel = text(process.env.AVANTIQO_VIDEO_EDIT_MODEL) || v2vFoundationModel;
const inpaintFoundationModel =
  text(process.env.AVANTIQO_VIDEO_INPAINT_MODEL) || editFoundationModel || v2vFoundationModel;
const upscaleFoundationModel =
  text(process.env.AVANTIQO_VIDEO_UPSCALE_MODEL) ||
  "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr";
const lipsyncFoundationModel =
  text(process.env.AVANTIQO_VIDEO_LIPSYNC_MODEL) || "ByteDance/LatentSync-1.6";
const engineEnabled = enabled(process.env.AVANTIQO_VIDEO_ENGINE_ENABLED);
const lipsyncEngineEnabled = enabled(process.env.AVANTIQO_LIPSYNC_ENGINE_ENABLED);
const capabilities = certifiedCapabilities(process.env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES);
const requiredModelsConfigured = capabilities.every((capability) => {
  if (capability === "ai.video.generate") return Boolean(t2vFoundationModel || managedFallbackConfigured);
  if (capability === "ai.video.image_to_video") return Boolean(i2vFoundationModel || managedFallbackConfigured);
  if (capability === "ai.video.first_last_frame_to_video") return Boolean(firstLastFoundationModel);
  if (capability === "ai.video.video_to_video") return Boolean(v2vFoundationModel);
  if (capability === "ai.video.edit") return Boolean(editFoundationModel);
  if (capability === "ai.video.inpaint") return Boolean(inpaintFoundationModel);
  if (capability === "ai.video.extend") return Boolean(i2vFoundationModel);
  if (capability === "ai.video.upscale") return Boolean(upscaleFoundationModel);
  if (capability === "ai.video.lipsync") return Boolean(lipsyncFoundationModel);
  return false;
});
const lipsyncCertified = capabilities.includes("ai.video.lipsync");
const ownedEndpointConfigured = Boolean(runpodEndpointId && runpodApiKey);
const routedGenerationAvailable = Boolean(ownedEndpointConfigured || managedFallbackConfigured);
const requiredEndpointsConfigured = Boolean(
  routedGenerationAvailable &&
  (!lipsyncCertified || (lipsyncEndpointId && lipsyncEngineEnabled)),
);
const foundationModels = unique([
  t2vFoundationModel,
  i2vFoundationModel,
  firstLastFoundationModel,
  v2vFoundationModel,
  editFoundationModel,
  inpaintFoundationModel,
  upscaleFoundationModel,
  lipsyncFoundationModel,
]);
const runtimeAvailable = Boolean(
  engineEnabled &&
  requiredEndpointsConfigured &&
  requiredModelsConfigured &&
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
    existing.quality_score ?? 96,
  ),
  speed_score: score(
    process.env.AVANTIQO_VIDEO_ENGINE_SPEED_SCORE,
    existing.speed_score ?? 82,
  ),
  reliability_score: score(
    process.env.AVANTIQO_VIDEO_ENGINE_RELIABILITY_SCORE,
    existing.reliability_score ?? 96,
  ),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    customer_visible_provider: "AVANTIQO_CINEMA",
    supplier_type: "AVANTIQO_ROUTED_VIDEO_FABRIC",
    infrastructure_provider: "AVANTIQO_ROUTED_GPU_FABRIC",
    engine_contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
    capacity_router_contract: "AVANTIQO_VIDEO_CAPACITY_ROUTER_V1",
    workflow_contract: "AVANTIQO_VIDEO_ROUTED_MASTERING_WORKFLOW_V1",
    product_model: "avantiqo-cinema-v1",
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    managed_supplier_fallback_internal_only: true,
    customer_supplier_selection_exposed: false,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    internal_generation_resolution: "720p",
    delivery_master_default: "4k",
    delivery_master_resolutions: ["1080p", "2k", "4k"],
    delivery_master_required_for_generated_video: true,
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    configured_foundation_model: genericFoundationModel || null,
    foundation_models: foundationModels,
    capability_foundation_models: {
      "ai.video.generate": t2vFoundationModel || null,
      "ai.video.image_to_video": i2vFoundationModel || null,
      "ai.video.first_last_frame_to_video": firstLastFoundationModel || null,
      "ai.video.video_to_video": v2vFoundationModel || null,
      "ai.video.edit": editFoundationModel || null,
      "ai.video.inpaint": inpaintFoundationModel || null,
      "ai.video.extend": i2vFoundationModel || null,
      "ai.video.upscale": upscaleFoundationModel || null,
      "ai.video.lipsync": lipsyncFoundationModel || null,
    },
    runtime_configuration: {
      enabled: engineEnabled,
      certification_runpod_endpoint_configured: Boolean(runpodEndpointId),
      production_runpod_endpoint_configured: Boolean(productionRunpodEndpointId),
      runpod_lipsync_endpoint_configured: Boolean(lipsyncEndpointId),
      runpod_api_key_configured: Boolean(runpodApiKey),
      managed_fallback_enabled: managedFallbackEnabled,
      managed_fallback_configured: managedFallbackConfigured,
      foundation_model_configured: requiredModelsConfigured,
      required_endpoints_configured: requiredEndpointsConfigured,
      t2v_foundation_model_configured: Boolean(t2vFoundationModel),
      i2v_foundation_model_configured: Boolean(i2vFoundationModel),
      first_last_foundation_model_configured: Boolean(firstLastFoundationModel),
      v2v_foundation_model_configured: Boolean(v2vFoundationModel),
      edit_foundation_model_configured: Boolean(editFoundationModel),
      inpaint_foundation_model_configured: Boolean(inpaintFoundationModel),
      upscale_foundation_model_configured: Boolean(upscaleFoundationModel),
      lipsync_foundation_model_configured: Boolean(lipsyncFoundationModel),
      lipsync_engine_enabled: lipsyncEngineEnabled,
      capacity_preflight_required: true,
      queue_endpoint: true,
      scale_to_zero: true,
      warm_worker_required: false,
      certification_endpoint_never_customer_routed_at_0_0: true,
    },
    video_capabilities: {
      contract: "PROVIDER_VIDEO_CAPABILITY_CONFIGURATION_V3",
      native_audio: false,
      internal_generation_frame_rate: 16,
      delivery_master_frame_rate: 30,
      supported_aspect_ratios: ["16:9", "9:16", "1:1"],
      internal_foundation_resolutions: ["720p"],
      supported_resolutions: ["1080p", "2k", "4k"],
      default_delivery_resolution: "4k",
      mandatory_generated_video_mastering: true,
      mastering_preset: "AIGC_HIGH_FIDELITY",
      allowed_duration_seconds: [2, 3, 4, 5, 6, 7, 8, 9, 10],
      reference_image_limit: 4,
      source_video_limit: 1,
      source_audio_limit: 1,
      mask_video_limit: 1,
      first_frame: true,
      last_frame: true,
      first_last_frame_interpolation: true,
      cinematic_control_contract: "AVANTIQO_CINEMATIC_CONTROL_V1",
      identity_conditioning: true,
      source_video_conditioning: true,
      mask_video_conditioning: true,
      localized_mask_video_editing: true,
      vace_editing: true,
      vace_inpainting: true,
      deterministic_seed: true,
      source_tail_continuation: true,
      owned_super_resolution: true,
      managed_4k_mastering_available: true,
      temporal_upscale_review_required: true,
      owned_audio_conditioned_lipsync: true,
      lipsync_identity_review_required: true,
      lipsync_sync_quality_review_required: true,
      isolated_lipsync_gpu_runtime: true,
    },
  },
};

export const AVANTIQO_VIDEO_PROVIDER_ID = PROVIDER_ID;

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
const IMPLEMENTED_CAPABILITIES = Object.freeze([
  "ai.video.generate",
]);
const DEFAULT_CERTIFIED_CAPABILITIES = Object.freeze([
  "ai.video.generate",
]);
const NATIVE_MASTER_MODEL = "avantiqo-ltx-2.5";
const NATIVE_MASTER_FOUNDATION_MODEL = "Lightricks/LTX-2.5";
const NATIVE_MASTER_ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2";
const LOCAL_DEFAULT_RESOLUTION = "608x352";
const LOCAL_SUPPORTED_RESOLUTIONS = Object.freeze([
  "608x352",
  "352x608",
  "448x448",
  "384x480",
  "480x384",
  "512x384",
  "384x512",
]);
const PRODUCTION_FPS = 24;
const PRODUCTION_GPU = "NODE01_LOCAL_GPU_6GB_CPU_OFFLOAD";

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
  return configured.length ? [...new Set(configured)] : [...DEFAULT_CERTIFIED_CAPABILITIES];
}
function unique(values = []) { return [...new Set(values.map(text).filter(Boolean))]; }

const t2vFoundationModel = NATIVE_MASTER_FOUNDATION_MODEL;
const i2vFoundationModel = NATIVE_MASTER_FOUNDATION_MODEL;
const firstLastFoundationModel = NATIVE_MASTER_FOUNDATION_MODEL;
const v2vFoundationModel = text(process.env.AVANTIQO_VIDEO_V2V_MODEL);
const editFoundationModel = text(process.env.AVANTIQO_VIDEO_EDIT_MODEL);
const inpaintFoundationModel = text(process.env.AVANTIQO_VIDEO_INPAINT_MODEL);
const extendFoundationModel = text(process.env.AVANTIQO_VIDEO_EXTEND_MODEL);
const upscaleFoundationModel = text(process.env.AVANTIQO_VIDEO_UPSCALE_MODEL) || "JunhaoZhuang/FlashVSR-v1.1";
const lipsyncFoundationModel = text(process.env.AVANTIQO_VIDEO_LIPSYNC_MODEL);
const engineEnabled = enabled(process.env.AVANTIQO_VIDEO_ENGINE_ENABLED);
const flashVsrEnabled = enabled(process.env.AVANTIQO_FLASHVSR_ENGINE_ENABLED);
const flashVsrCertified = enabled(process.env.AVANTIQO_FLASHVSR_ENGINE_CERTIFIED);
const flashVsrEndpointConfigured = Boolean(text(process.env.AVANTIQO_FLASHVSR_ENDPOINT_URL));
const lipsyncEngineEnabled = enabled(process.env.AVANTIQO_LIPSYNC_ENGINE_ENABLED);
const capabilities = certifiedCapabilities(process.env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES);
const requiredModelsConfigured = capabilities.every((capability) => {
  if (capability === "ai.video.generate") return true;
  if (capability === "ai.video.image_to_video") return true;
  if (capability === "ai.video.first_last_frame_to_video") return true;
  if (capability === "ai.video.video_to_video") return Boolean(v2vFoundationModel);
  if (capability === "ai.video.edit") return Boolean(editFoundationModel);
  if (capability === "ai.video.inpaint") return Boolean(inpaintFoundationModel);
  if (capability === "ai.video.extend") return Boolean(extendFoundationModel);
  if (capability === "ai.video.upscale") return Boolean(upscaleFoundationModel && flashVsrEnabled && flashVsrCertified && flashVsrEndpointConfigured);
  if (capability === "ai.video.lipsync") return Boolean(lipsyncFoundationModel);
  return false;
});
const localComputeConfigured = enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED);
const localVideoWorkerImplemented = true;
const requiredTransportConfigured = localComputeConfigured && localVideoWorkerImplemented;
const foundationModels = unique([
  NATIVE_MASTER_FOUNDATION_MODEL,
  v2vFoundationModel,
  editFoundationModel,
  inpaintFoundationModel,
  extendFoundationModel,
  upscaleFoundationModel,
  lipsyncFoundationModel,
]);
const runtimeAvailable = Boolean(
  engineEnabled && requiredTransportConfigured && requiredModelsConfigured && capabilities.length,
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
  quality_score: score(process.env.AVANTIQO_VIDEO_ENGINE_QUALITY_SCORE, existing.quality_score ?? 96),
  speed_score: score(process.env.AVANTIQO_VIDEO_ENGINE_SPEED_SCORE, existing.speed_score ?? 82),
  reliability_score: score(process.env.AVANTIQO_VIDEO_ENGINE_RELIABILITY_SCORE, existing.reliability_score ?? 97),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    customer_visible_provider: "AVANTIQO_CINEMA",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
    infrastructure_candidates: ["AVANTIQO_LOCAL_NODE_V1"],
    local_only_execution: true,
    modal_fallback_allowed: false,
    engine_contract: NATIVE_MASTER_ENGINE_CONTRACT,
    product_model: NATIVE_MASTER_MODEL,
    benchmark_gate: true,
    external_provider_fallback_allowed: false,
    customer_supplier_selection_exposed: false,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    configured_foundation_model: NATIVE_MASTER_FOUNDATION_MODEL,
    foundation_models: foundationModels,
    capability_foundation_models: {
      "ai.video.generate": NATIVE_MASTER_FOUNDATION_MODEL,
      "ai.video.image_to_video": NATIVE_MASTER_FOUNDATION_MODEL,
      "ai.video.first_last_frame_to_video": NATIVE_MASTER_FOUNDATION_MODEL,
      "ai.video.video_to_video": v2vFoundationModel,
      "ai.video.edit": editFoundationModel,
      "ai.video.inpaint": inpaintFoundationModel,
      "ai.video.extend": extendFoundationModel,
      "ai.video.upscale": upscaleFoundationModel,
      "ai.video.lipsync": lipsyncFoundationModel,
    },
    runtime_configuration: {
      enabled: engineEnabled,
      local_only_execution: true,
      modal_direct_primary: false,
      modal_configured: false,
      modal_fallback_allowed: false,
      transport_adapter_max_containers: 4,
      max_gpu_containers: 1,
      production_gpu: PRODUCTION_GPU,
      local_default_resolution: LOCAL_DEFAULT_RESOLUTION,
      local_supported_resolutions: LOCAL_SUPPORTED_RESOLUTIONS,
      production_frame_rate: PRODUCTION_FPS,
      max_duration_seconds: 8,
      temporal_4k_mastering_required_for_4k_delivery: false,
      lipsync_engine_enabled: lipsyncEngineEnabled,
      foundation_model_configured: requiredModelsConfigured,
      required_transport_configured: requiredTransportConfigured,
      queue_endpoint: true,
      scale_to_zero: false,
      warm_worker_required: true,
      readiness_probe_spawns_generation: false,
    },
    video_capabilities: {
      contract: "PROVIDER_VIDEO_CAPABILITY_CONFIGURATION_V4",
      native_audio: false,
      internal_generation_frame_rate: PRODUCTION_FPS,
      native_master_frame_rate: PRODUCTION_FPS,
      delivery_master_frame_rate: PRODUCTION_FPS,
      supported_aspect_ratios: ["16:9", "9:16", "1:1", "4:5", "5:4", "4:3", "3:4"],
      internal_foundation_resolutions: LOCAL_SUPPORTED_RESOLUTIONS,
      native_master_resolution: LOCAL_DEFAULT_RESOLUTION,
      supported_generation_resolutions: LOCAL_SUPPORTED_RESOLUTIONS,
      supported_delivery_resolutions: LOCAL_SUPPORTED_RESOLUTIONS,
      default_generation_resolution: LOCAL_DEFAULT_RESOLUTION,
      default_delivery_resolution: LOCAL_DEFAULT_RESOLUTION,
      delivery_upscale_engine: null,
      allowed_duration_seconds: [1, 8],
      reference_image_limit: 0,
      source_video_limit: 0,
      source_audio_limit: 0,
      mask_video_limit: 0,
      first_frame: false,
      last_frame: false,
      first_last_frame_interpolation: false,
      cinematic_control_contract: "AVANTIQO_CINEMATIC_CONTROL_V1",
      native_control_contract: "CREATIVE_VIDEO_NATIVE_CONTROL_V1",
      identity_conditioning: false,
      source_video_conditioning: false,
      mask_video_conditioning: false,
      localized_mask_video_editing: false,
      vace_editing: false,
      vace_inpainting: false,
      deterministic_seed: true,
      source_tail_continuation: false,
      owned_super_resolution: false,
      temporal_super_resolution_engine: null,
      temporal_super_resolution_contract: null,
      per_frame_independent_super_resolution_production_forbidden: true,
      owned_audio_conditioned_lipsync: false,
    },
  },
};

export const AVANTIQO_VIDEO_PROVIDER_ID = PROVIDER_ID;
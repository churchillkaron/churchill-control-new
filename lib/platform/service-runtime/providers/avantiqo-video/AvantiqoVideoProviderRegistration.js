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
const MODAL_APP_NAME = "avantiqo-video-owned";
const MODAL_FUNCTION_NAME = "generate_native_job";
const MODAL_TRANSPORT = "modal-js-sdk-function-call-v1";
const NATIVE_MASTER_MODEL = "avantiqo-ltx-2.5";
const NATIVE_MASTER_ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2";
const NATIVE_MASTER_RESOLUTION = "3840x2176";
const NATIVE_MASTER_FPS = 24;
const NATIVE_MASTER_STEPS = 30;
const NATIVE_MASTER_GPU = "B200";

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

const modalTokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
const modalTokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
const lipsyncEndpointId = text(process.env.RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID);
const runpodApiKey = text(process.env.RUNPOD_API_KEY);
const genericFoundationModel = text(process.env.AVANTIQO_VIDEO_FOUNDATION_MODEL);
const t2vFoundationModel = text(process.env.AVANTIQO_VIDEO_T2V_MODEL) || genericFoundationModel || "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const i2vFoundationModel = text(process.env.AVANTIQO_VIDEO_I2V_MODEL) || genericFoundationModel || "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const firstLastFoundationModel = text(process.env.AVANTIQO_VIDEO_FIRST_LAST_MODEL) || "Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers";
const v2vFoundationModel = text(process.env.AVANTIQO_VIDEO_V2V_MODEL) || "Wan-AI/Wan2.1-VACE-14B-diffusers";
const editFoundationModel = text(process.env.AVANTIQO_VIDEO_EDIT_MODEL) || v2vFoundationModel;
const inpaintFoundationModel = text(process.env.AVANTIQO_VIDEO_INPAINT_MODEL) || editFoundationModel;
const upscaleFoundationModel = text(process.env.AVANTIQO_VIDEO_UPSCALE_MODEL) || "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr";
const lipsyncFoundationModel = text(process.env.AVANTIQO_VIDEO_LIPSYNC_MODEL) || "ByteDance/LatentSync-1.6";
const engineEnabled = enabled(process.env.AVANTIQO_VIDEO_ENGINE_ENABLED);
const lipsyncEngineEnabled = enabled(process.env.AVANTIQO_LIPSYNC_ENGINE_ENABLED);
const capabilities = certifiedCapabilities(process.env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES);
const modalConfigured = Boolean(modalTokenId && modalTokenSecret);
const requiredModelsConfigured = capabilities.every((capability) => {
  if (capability === "ai.video.generate") return true;
  if (capability === "ai.video.image_to_video") return true;
  if (capability === "ai.video.first_last_frame_to_video") return true;
  if (capability === "ai.video.video_to_video") return Boolean(v2vFoundationModel);
  if (capability === "ai.video.edit") return Boolean(editFoundationModel);
  if (capability === "ai.video.inpaint") return Boolean(inpaintFoundationModel);
  if (capability === "ai.video.extend") return Boolean(i2vFoundationModel);
  if (capability === "ai.video.upscale") return Boolean(upscaleFoundationModel);
  if (capability === "ai.video.lipsync") return Boolean(lipsyncFoundationModel);
  return false;
});
const lipsyncCertified = capabilities.includes("ai.video.lipsync");
const requiredTransportConfigured = Boolean(
  modalConfigured && (!lipsyncCertified || (lipsyncEndpointId && runpodApiKey && lipsyncEngineEnabled)),
);
const foundationModels = unique([
  NATIVE_MASTER_MODEL,
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
    infrastructure_provider: "MODAL_DIRECT_ASYNC_V1",
    engine_contract: NATIVE_MASTER_ENGINE_CONTRACT,
    product_model: NATIVE_MASTER_MODEL,
    legacy_advanced_engine_contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
    benchmark_gate: true,
    external_provider_fallback_allowed: false,
    simultaneous_modal_runpod_execution_forbidden: true,
    customer_supplier_selection_exposed: false,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    modal_transport: MODAL_TRANSPORT,
    modal_gateway_required: false,
    modal_app_name: MODAL_APP_NAME,
    modal_function_name: MODAL_FUNCTION_NAME,
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    configured_foundation_model: NATIVE_MASTER_MODEL,
    foundation_models: foundationModels,
    capability_foundation_models: {
      "ai.video.generate": NATIVE_MASTER_MODEL,
      "ai.video.image_to_video": NATIVE_MASTER_MODEL,
      "ai.video.first_last_frame_to_video": NATIVE_MASTER_MODEL,
      "ai.video.video_to_video": v2vFoundationModel,
      "ai.video.edit": editFoundationModel,
      "ai.video.inpaint": inpaintFoundationModel,
      "ai.video.extend": i2vFoundationModel,
      "ai.video.upscale": upscaleFoundationModel,
      "ai.video.lipsync": lipsyncFoundationModel,
    },
    runtime_configuration: {
      enabled: engineEnabled,
      modal_direct_primary: true,
      modal_configured: modalConfigured,
      modal_token_id_configured: Boolean(modalTokenId),
      modal_token_secret_configured: Boolean(modalTokenSecret),
      modal_gateway_required: false,
      modal_app_name: MODAL_APP_NAME,
      modal_function_name: MODAL_FUNCTION_NAME,
      modal_transport: MODAL_TRANSPORT,
      modal_model_volume: "avantiqo-video-models",
      transport_adapter_max_containers: 4,
      max_gpu_containers: 1,
      native_gpu: NATIVE_MASTER_GPU,
      native_master_resolution: NATIVE_MASTER_RESOLUTION,
      native_master_frame_rate: NATIVE_MASTER_FPS,
      native_master_inference_steps: NATIVE_MASTER_STEPS,
      runpod_generation_routing: false,
      runpod_lipsync_endpoint_configured: Boolean(lipsyncEndpointId),
      lipsync_engine_enabled: lipsyncEngineEnabled,
      foundation_model_configured: requiredModelsConfigured,
      required_transport_configured: requiredTransportConfigured,
      queue_endpoint: true,
      scale_to_zero: true,
      warm_worker_required: false,
      readiness_probe_spawns_generation: false,
    },
    video_capabilities: {
      contract: "PROVIDER_VIDEO_CAPABILITY_CONFIGURATION_V4",
      native_audio: false,
      internal_generation_frame_rate: NATIVE_MASTER_FPS,
      native_master_frame_rate: NATIVE_MASTER_FPS,
      delivery_master_frame_rate: NATIVE_MASTER_FPS,
      supported_aspect_ratios: ["16:9", "9:16", "1:1"],
      internal_foundation_resolutions: [NATIVE_MASTER_RESOLUTION],
      native_master_resolution: NATIVE_MASTER_RESOLUTION,
      supported_resolutions: ["2160p"],
      default_delivery_resolution: "2160p",
      allowed_duration_seconds: [1, 20],
      reference_image_limit: 8,
      source_video_limit: 1,
      source_audio_limit: 1,
      mask_video_limit: 1,
      first_frame: true,
      last_frame: true,
      first_last_frame_interpolation: true,
      cinematic_control_contract: "AVANTIQO_CINEMATIC_CONTROL_V1",
      native_control_contract: "CREATIVE_VIDEO_NATIVE_CONTROL_V1",
      identity_conditioning: true,
      source_video_conditioning: true,
      mask_video_conditioning: true,
      localized_mask_video_editing: true,
      vace_editing: true,
      vace_inpainting: true,
      deterministic_seed: true,
      source_tail_continuation: true,
      owned_super_resolution: true,
      owned_audio_conditioned_lipsync: true,
    },
  },
};

export const AVANTIQO_VIDEO_PROVIDER_ID = PROVIDER_ID;
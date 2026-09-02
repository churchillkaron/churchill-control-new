import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-intelligence";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const MODAL_TRANSPORT = "modal-js-sdk-function-call-v1";

function text(value) { return String(value ?? "").trim(); }
function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}
function disabled(value) { return ["0", "false", "no", "off"].includes(text(value).toLowerCase()); }

const modalTokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
const modalTokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
const modalConfigured = Boolean(modalTokenId && modalTokenSecret);
const engineSetting = text(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED);
const engineEnabled = engineSetting ? !disabled(engineSetting) : true;
const localReviewRuntimeAllowed = text(process.env.NODE_ENV).toLowerCase() === "development";
const runtimeAvailable = Boolean(modalConfigured && (engineEnabled || localReviewRuntimeAllowed));
const configuredModel = text(process.env.AVANTIQO_INTELLIGENCE_MODEL) || DEFAULT_MODEL;
const configuredFastModel = text(process.env.AVANTIQO_INTELLIGENCE_FAST_MODEL) || FAST_MODEL;
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Synthetic Intelligence",
  category: "ai",
  connectionModel: "managed",
  capabilities: ["ai.reasoning.execute", "ai.text.generate"],
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_intelligence",
  runtimeAvailable,
  active: true,
  quality_score: score(process.env.AVANTIQO_INTELLIGENCE_QUALITY_SCORE, existing.quality_score ?? 94),
  speed_score: score(process.env.AVANTIQO_INTELLIGENCE_SPEED_SCORE, existing.speed_score ?? 76),
  reliability_score: score(process.env.AVANTIQO_INTELLIGENCE_RELIABILITY_SCORE, existing.reliability_score ?? 86),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: "MODAL_H100_ASYNC_V1",
    infrastructure_candidates: ["MODAL_H100_ASYNC_V1"],
    modal_only: true,
    infrastructure_fallback: null,
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
    product_model: "avantiqo-intelligence-v2",
    self_hosted_weights: true,
    open_weight_foundation: true,
    benchmark_gate: true,
    external_provider_fallback_allowed: false,
    data_control: "AVANTIQO",
    inference_control: "AVANTIQO",
    configured_model: configuredModel,
    configured_fast_model: configuredFastModel,
    foundation_models: [configuredModel, configuredFastModel],
    execution_lane_policy: "EXPLICIT_FAST_OR_DEEP_WITH_CAPABILITY_DEFAULT_V1",
    execution_lanes: {
      deep: { function_name: "deep", model_name: configuredModel, reasoning_mode: "THINKING_REQUIRED", intended_workload: "COMPLEX_STRATEGIC_REASONING" },
      fast: { function_name: "fast", model_name: configuredFastModel, reasoning_mode: "NON_THINKING_ONLY", intended_workload: "BOUNDED_STRUCTURED_DECISIONS" },
    },
    modal_worker_contract: {
      contract: "AVANTIQO_INTELLIGENCE_MODAL_H100_V1",
      transport: MODAL_TRANSPORT,
      app_name: "avantiqo-intelligence-owned",
      gpu: "H100",
      max_gpu_containers_per_lane: 1,
      scale_to_zero: true,
      persistent_model_volume: false,
      model_storage: "IMMUTABLE_MODAL_IMAGE_LAYERS",
      deep_revision: "8217eea09b2a3771bcd6d881189a7ed315e148fe",
      fast_revision: "3ffd1f50b179e643d839c86df9ffbbefcb0d5018",
      native_tool_definitions: true,
      reasoning_separation_required: true,
      raw_reasoning_persisted: false,
    },
    runtime_configuration: {
      enabled: engineEnabled,
      local_review_runtime_allowed: localReviewRuntimeAllowed,
      modal_configured: modalConfigured,
      modal_token_id_configured: Boolean(modalTokenId),
      modal_token_secret_configured: Boolean(modalTokenSecret),
      modal_gateway_required: false,
      modal_transport: MODAL_TRANSPORT,
      modal_gpu: "H100",
      modal_max_gpu_containers_per_lane: 1,
      modal_persistent_model_volume: false,
      modal_only: true,
      scale_to_zero: true,
      async_gateway: false,
      async_direct_modal: modalConfigured,
      reasoning_mode: "LANE_ROUTED",
      deep_reasoning_mode: "THINKING_REQUIRED",
      fast_reasoning_mode: "NON_THINKING_ONLY",
      native_context_tokens: 262144,
      initial_served_context_tokens: 32768,
      raw_reasoning_persisted: false,
      safe_lease_required: false,
    },
    intelligence_capabilities: {
      contract: "AVANTIQO_INTELLIGENCE_CAPABILITY_CONFIGURATION_V2",
      reasoning: true,
      thinking_required: false,
      thinking_required_for_deep_lane: true,
      fast_non_thinking: true,
      deep_thinking: true,
      text_generation: true,
      structured_output: true,
      tool_call_passthrough: true,
      organization_context_required: true,
      usage_metering_required: true,
    },
  },
};

export const AVANTIQO_INTELLIGENCE_PROVIDER_ID = PROVIDER_ID;
export const AVANTIQO_INTELLIGENCE_DEFAULT_MODEL = DEFAULT_MODEL;
export const AVANTIQO_INTELLIGENCE_FAST_MODEL = FAST_MODEL;

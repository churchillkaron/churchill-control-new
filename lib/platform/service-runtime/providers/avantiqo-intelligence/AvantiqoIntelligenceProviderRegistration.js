import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-intelligence";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

function text(value) {
  return String(value ?? "").trim();
}

function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, number))
    : fallback;
}

function disabled(value) {
  return ["0", "false", "no", "off"].includes(text(value).toLowerCase());
}

const runpodEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
const runpodFastEndpointId = text(
  process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID,
);
const runpodApiKey = text(process.env.RUNPOD_API_KEY);
const runpodManagementKey =
  text(process.env.RUNPOD_MANAGEMENT_API_KEY) || runpodApiKey;
const engineSetting = text(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED);
const engineEnabled = engineSetting ? !disabled(engineSetting) : true;
const localReviewRuntimeAllowed =
  text(process.env.NODE_ENV).toLowerCase() === "development";
const endpointResolvable = Boolean(
  runpodEndpointId || runpodFastEndpointId || runpodManagementKey,
);
const runtimeAvailable = Boolean(
  runpodApiKey &&
    runpodManagementKey &&
    endpointResolvable &&
    (engineEnabled || localReviewRuntimeAllowed),
);
const configuredModel = text(process.env.AVANTIQO_INTELLIGENCE_MODEL) || DEFAULT_MODEL;
const configuredFastModel =
  text(process.env.AVANTIQO_INTELLIGENCE_FAST_MODEL) || FAST_MODEL;
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Synthetic Intelligence",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.reasoning.execute",
    "ai.text.generate",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_intelligence",
  runtimeAvailable,
  active: true,
  quality_score: score(
    process.env.AVANTIQO_INTELLIGENCE_QUALITY_SCORE,
    existing.quality_score ?? 94,
  ),
  speed_score: score(
    process.env.AVANTIQO_INTELLIGENCE_SPEED_SCORE,
    existing.speed_score ?? 76,
  ),
  reliability_score: score(
    process.env.AVANTIQO_INTELLIGENCE_RELIABILITY_SCORE,
    existing.reliability_score ?? 86,
  ),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: "RUNPOD_SERVERLESS",
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
    execution_lane_policy: "EXPLICIT_FAST_OR_DEEP_FAIL_CLOSED_V1",
    execution_lanes: {
      deep: {
        endpoint_name: "avantiqo-intelligence-v1",
        model_name: configuredModel,
        reasoning_mode: "THINKING_REQUIRED",
        intended_workload: "COMPLEX_STRATEGIC_REASONING",
      },
      fast: {
        endpoint_name: "avantiqo-intelligence-fast-v1",
        model_name: configuredFastModel,
        reasoning_mode: "NON_THINKING_ONLY",
        intended_workload: "BOUNDED_STRUCTURED_DECISIONS",
      },
    },
    runpod_worker_contract: {
      contract: "AVANTIQO_QWEN3_RUNPOD_VLLM_WORKER_V2",
      model_name: DEFAULT_MODEL,
      required_environment: {
        REASONING_PARSER: "qwen3",
        ENABLE_AUTO_TOOL_CHOICE: "true",
        TOOL_CALL_PARSER: "hermes",
      },
      reasoning_separation_required: true,
      native_tool_calls_required: true,
      structured_output_required: true,
      source_basis: "CURRENT_VLLM_QWEN3_REASONING_AND_TOOL_CALLING_WITH_RUNPOD_WORKER_VLLM",
      fast_lane_reasoning_parser_forbidden: true,
      fast_lane_model_name: FAST_MODEL,
    },
    runtime_configuration: {
      enabled: engineEnabled,
      local_review_runtime_allowed: localReviewRuntimeAllowed,
      runpod_endpoint_configured: Boolean(runpodEndpointId),
      runpod_fast_endpoint_configured: Boolean(runpodFastEndpointId),
      runpod_endpoint_discovery_configured: Boolean(runpodManagementKey),
      runpod_api_key_configured: Boolean(runpodApiKey),
      runpod_management_api_key_configured: Boolean(runpodManagementKey),
      openai_compatible_transport: true,
      scale_to_zero: true,
      reasoning_mode: "LANE_ROUTED",
      deep_reasoning_mode: "THINKING_REQUIRED",
      fast_reasoning_mode: "NON_THINKING_ONLY",
      native_context_tokens: 262144,
      initial_served_context_tokens: 131072,
      raw_reasoning_persisted: false,
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
